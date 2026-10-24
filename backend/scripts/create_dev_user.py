"""Explicit development-only account provisioning; never overwrites a user."""
import argparse
from getpass import getpass
from pathlib import Path
import re
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import func, or_
from sqlalchemy.exc import IntegrityError
from app.core.config import settings
from app.database.session import SessionLocal
from app.models.user import User
from app.services.auth.security import ADMIN, MAHASISWA, hash_password


def main():
    if not settings.is_development:
        raise SystemExit("Account bootstrap is available only with APP_ENV=development.")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--role", choices=[ADMIN, MAHASISWA], required=True)
    parser.add_argument("--name", required=True)
    parser.add_argument("--email", required=True)
    parser.add_argument("--nim")
    args = parser.parse_args()
    email = args.email.strip().lower()
    name = args.name.strip()
    nim = args.nim.strip() if args.nim else None
    if not name or len(name) > 150 or len(email) > 150 or not re.fullmatch(r"[^\s@]+@[^\s@]+", email):
        parser.error("A name and valid email (maximum 150 characters each) are required.")
    if (args.role == MAHASISWA and not nim) or (nim and not re.fullmatch(r"[0-9]{1,32}", nim)):
        parser.error("MAHASISWA requires a numeric NIM (maximum 32 digits).")
    password = getpass("New local ARCHIDA password (not a SIAKAD password): ")
    if len(password) < 12 or len(password) > 1024:
        raise SystemExit("Use a local password between 12 and 1024 characters.")
    if password != getpass("Confirm local ARCHIDA password: "):
        raise SystemExit("Passwords do not match.")
    with SessionLocal() as db:
        conditions = [func.lower(User.email) == email]
        if nim:
            conditions.append(User.nim == nim)
        if db.query(User.id).filter(or_(*conditions)).first():
            raise SystemExit("An account with this email or NIM already exists; no changes made.")
        db.add(User(name=name, email=email, nim=nim, role=args.role,
                    password_hash=hash_password(password)))
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            raise SystemExit("Email or NIM already exists; no changes made.") from None
    print("Development account created. Login through /api/auth/login.")


if __name__ == "__main__":
    main()
