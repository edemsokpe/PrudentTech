"""Create an admin user, or reset an existing admin's password.

Run from the backend folder:   python create_admin.py
"""
import getpass
import sys

from sqlalchemy import select

from app.database import Base, SessionLocal, engine
from app.models import AdminUser
from app.security import hash_password


def main() -> None:
    Base.metadata.create_all(bind=engine)
    username = input("Admin username: ").strip()
    if not username:
        sys.exit("Username is required.")
    password = getpass.getpass("Password (min 8 characters): ")
    if len(password) < 8:
        sys.exit("Password must be at least 8 characters.")
    if password != getpass.getpass("Confirm password: "):
        sys.exit("Passwords do not match.")

    with SessionLocal() as db:
        user = db.scalar(select(AdminUser).where(AdminUser.username == username))
        if user:
            user.password_hash = hash_password(password)
            print(f"Password updated for '{username}'.")
        else:
            db.add(AdminUser(username=username, password_hash=hash_password(password)))
            print(f"Admin '{username}' created.")
        db.commit()


if __name__ == "__main__":
    main()
