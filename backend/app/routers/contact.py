from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import ContactMessage
from ..schemas import ContactAck, ContactIn
from ..security import RateLimiter, client_ip

router = APIRouter(prefix="/api", tags=["contact"])

# 5 submissions per IP every 10 minutes
contact_limiter = RateLimiter(limit=5, window_seconds=600)

SUCCESS = "Thank you! Your message has been received. We will get back to you shortly."


@router.post("/contact", response_model=ContactAck, status_code=status.HTTP_201_CREATED)
def submit_contact(payload: ContactIn, request: Request, db: Session = Depends(get_db)):
    ip = client_ip(request)
    contact_limiter.hit(ip or "unknown")

    # Honeypot filled in => bot. Pretend it worked, store nothing.
    if payload.website:
        return ContactAck(message=SUCCESS)

    record = ContactMessage(
        name=payload.name,
        email=str(payload.email),
        phone=payload.phone,
        service=payload.service,
        message=payload.message,
        ip_address=ip,
        user_agent=(request.headers.get("user-agent") or "")[:500] or None,
    )
    db.add(record)
    db.commit()
    return ContactAck(message=SUCCESS)
