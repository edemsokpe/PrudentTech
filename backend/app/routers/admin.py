import csv
import io
import math
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from ..config import settings
from ..database import get_db
from ..models import AdminUser, ContactMessage, utcnow
from ..schemas import (
    LoginIn,
    MeOut,
    MessageOut,
    MessagePage,
    MessageUpdate,
    Stats,
    TokenOut,
)
from ..security import (
    RateLimiter,
    burn_password_check,
    client_ip,
    create_access_token,
    get_current_admin,
    verify_password,
)

router = APIRouter(prefix="/api/admin", tags=["admin"])

# 10 login attempts per IP every 15 minutes
login_limiter = RateLimiter(limit=10, window_seconds=900)


# ---------- auth ----------
@router.post("/login", response_model=TokenOut)
def login(payload: LoginIn, request: Request, db: Session = Depends(get_db)):
    login_limiter.hit(client_ip(request) or "unknown")
    admin = db.scalar(select(AdminUser).where(AdminUser.username == payload.username.strip()))
    if admin is None:
        burn_password_check(payload.password)
    elif verify_password(payload.password, admin.password_hash):
        return TokenOut(access_token=create_access_token(admin.username), username=admin.username)
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect username or password")


@router.get("/me", response_model=MeOut)
def me(admin: AdminUser = Depends(get_current_admin)):
    return MeOut(username=admin.username)


# ---------- helpers ----------
def _escape_like(text: str) -> str:
    return text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _apply_filters(stmt, q: Optional[str], service: Optional[str], status_: Optional[str]):
    if status_:
        stmt = stmt.where(ContactMessage.status == status_)
    if service:
        stmt = stmt.where(ContactMessage.service == service)
    if q and q.strip():
        like = f"%{_escape_like(q.strip())}%"
        stmt = stmt.where(
            or_(
                ContactMessage.name.ilike(like, escape="\\"),
                ContactMessage.email.ilike(like, escape="\\"),
                ContactMessage.phone.ilike(like, escape="\\"),
                ContactMessage.service.ilike(like, escape="\\"),
                ContactMessage.message.ilike(like, escape="\\"),
            )
        )
    return stmt


def _get_or_404(db: Session, message_id: int) -> ContactMessage:
    record = db.get(ContactMessage, message_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Message not found")
    return record


# ---------- dashboard data ----------
@router.get("/stats", response_model=Stats)
def stats(db: Session = Depends(get_db), _: AdminUser = Depends(get_current_admin)):
    now = datetime.now(timezone.utc)
    start_of_day = now.replace(hour=0, minute=0, second=0, microsecond=0)

    def count(*conditions) -> int:
        return db.scalar(select(func.count(ContactMessage.id)).where(*conditions)) or 0

    return Stats(
        total=count(),
        new=count(ContactMessage.status == "new"),
        replied=count(ContactMessage.status == "replied"),
        today=count(ContactMessage.created_at >= start_of_day),
        last_7_days=count(ContactMessage.created_at >= now - timedelta(days=7)),
    )


@router.get("/services", response_model=list[str])
def services(db: Session = Depends(get_db), _: AdminUser = Depends(get_current_admin)):
    return list(db.scalars(select(ContactMessage.service).distinct().order_by(ContactMessage.service)))


@router.get("/messages", response_model=MessagePage)
def list_messages(
    q: Optional[str] = Query(default=None, max_length=200),
    service: Optional[str] = Query(default=None, max_length=100),
    status_: Optional[str] = Query(default=None, alias="status", pattern="^(new|read|replied|archived)$"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    _: AdminUser = Depends(get_current_admin),
):
    base = _apply_filters(select(ContactMessage), q, service, status_)
    total = db.scalar(select(func.count()).select_from(base.subquery())) or 0
    items = db.scalars(
        base.order_by(ContactMessage.created_at.desc(), ContactMessage.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()
    return MessagePage(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        pages=max(1, math.ceil(total / page_size)),
    )


def _csv_safe(value) -> str:
    """Stop spreadsheet apps from running a visitor's text as a formula."""
    text = "" if value is None else str(value)
    return "'" + text if text[:1] in ("=", "+", "-", "@", "\t", "\r") else text


@router.get("/messages/export.csv")
def export_csv(
    q: Optional[str] = Query(default=None, max_length=200),
    service: Optional[str] = Query(default=None, max_length=100),
    status_: Optional[str] = Query(default=None, alias="status", pattern="^(new|read|replied|archived)$"),
    db: Session = Depends(get_db),
    _: AdminUser = Depends(get_current_admin),
):
    rows = db.scalars(
        _apply_filters(select(ContactMessage), q, service, status_).order_by(ContactMessage.created_at.desc())
    ).all()
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(
        ["ID", "Received (UTC)", "Name", "Email", "Phone", "Service", "Message", "Status", "Admin notes", "IP address", "Browser"]
    )
    for m in rows:
        writer.writerow(
            [
                m.id,
                m.created_at.strftime("%Y-%m-%d %H:%M:%S"),
                _csv_safe(m.name),
                _csv_safe(m.email),
                _csv_safe(m.phone),
                _csv_safe(m.service),
                _csv_safe(m.message),
                m.status,
                _csv_safe(m.admin_notes),
                m.ip_address or "",
                _csv_safe(m.user_agent),
            ]
        )
    filename = f"contact-messages-{datetime.now(timezone.utc):%Y%m%d-%H%M}.csv"
    return Response(
        content="\ufeff" + buffer.getvalue(),  # BOM so Excel reads UTF-8 correctly
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/messages/{message_id}", response_model=MessageOut)
def get_message(message_id: int, db: Session = Depends(get_db), _: AdminUser = Depends(get_current_admin)):
    return _get_or_404(db, message_id)


@router.patch("/messages/{message_id}", response_model=MessageOut)
def update_message(
    message_id: int,
    payload: MessageUpdate,
    db: Session = Depends(get_db),
    _: AdminUser = Depends(get_current_admin),
):
    record = _get_or_404(db, message_id)
    changes = payload.model_dump(exclude_unset=True)
    if "status" in changes and changes["status"] is not None:
        record.status = changes["status"]
    if "admin_notes" in changes and changes["admin_notes"] is not None:
        record.admin_notes = changes["admin_notes"].strip()
    record.updated_at = utcnow()
    db.commit()
    db.refresh(record)
    return record


@router.delete("/messages/{message_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_message(message_id: int, db: Session = Depends(get_db), _: AdminUser = Depends(get_current_admin)):
    db.delete(_get_or_404(db, message_id))
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
