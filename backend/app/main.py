from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import select

from .config import ADMIN_DIR, SITE_DIR, settings
from .database import Base, SessionLocal, engine
from .models import AdminUser
from .routers import admin, contact
from .security import hash_password

# Only these files from the project root are ever served (keeps backend/ and .env private).
SITE_FILES = {
    "index.html", "about.html", "services.html", "work.html", "academy.html",
    "why-us.html", "faq.html", "contact.html", "style.css", "script.js", "config.js",
}


def bootstrap_admin() -> None:
    """Create the first admin from ADMIN_USERNAME / ADMIN_PASSWORD if it doesn't exist yet."""
    if not (settings.admin_username and settings.admin_password):
        return
    with SessionLocal() as db:
        exists = db.scalar(select(AdminUser).where(AdminUser.username == settings.admin_username))
        if exists is None:
            db.add(AdminUser(username=settings.admin_username, password_hash=hash_password(settings.admin_password)))
            db.commit()
            print(f"Created admin user '{settings.admin_username}'")


@asynccontextmanager
async def lifespan(app: FastAPI):
    if len(settings.secret_key) < 32:
        raise RuntimeError(
            "SECRET_KEY is missing or too short (need 32+ characters). Set it in backend/.env. Generate one with:\n"
            '  python -c "import secrets; print(secrets.token_urlsafe(48))"'
        )
    Base.metadata.create_all(bind=engine)
    bootstrap_admin()
    yield


app = FastAPI(
    title="Prudent Tech Academy API",
    lifespan=lifespan,
    docs_url="/docs" if settings.enable_docs else None,
    redoc_url=None,
    openapi_url="/openapi.json" if settings.enable_docs else None,
)

if settings.cors_origin_list:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_methods=["GET", "POST", "PATCH", "DELETE"],
        allow_headers=["Authorization", "Content-Type"],
    )


@app.get("/api/health", tags=["system"])
def health():
    return {"status": "ok"}


app.include_router(contact.router)
app.include_router(admin.router)

# ---------- website + admin dashboard ----------
app.mount("/assets", StaticFiles(directory=SITE_DIR / "assets"), name="assets")
app.mount("/admin", StaticFiles(directory=ADMIN_DIR, html=True), name="admin")


@app.get("/admin", include_in_schema=False)
def admin_redirect():
    return RedirectResponse("/admin/")


@app.get("/", include_in_schema=False)
def home():
    return FileResponse(SITE_DIR / "index.html")


@app.get("/{filename}", include_in_schema=False)
def site_file(filename: str):
    if filename in SITE_FILES:
        return FileResponse(SITE_DIR / filename)
    raise HTTPException(status_code=404, detail="Not found")
