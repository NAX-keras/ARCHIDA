import re
import secrets

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.user import User

ADMIN = "ADMIN"
MAHASISWA = "MAHASISWA"
ROLES = {ADMIN, MAHASISWA}
password_hasher = PasswordHasher()
# Equal-cost verification for unknown accounts; never a usable account password.
_DUMMY_HASH = password_hasher.hash(secrets.token_urlsafe(32))


def hash_password(password: str) -> str:
    return password_hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return password_hasher.verify(password_hash, password)
    except (VerificationError, InvalidHashError):
        return False


def authenticate_user(db: Session, identifier: str, password: str) -> User | None:
    identifier = identifier.strip()
    if "@" in identifier:
        # Ambiguous case variants in legacy data fail closed instead of choosing one.
        users = db.query(User).filter(
            User.role == ADMIN,
            func.lower(User.email) == identifier.lower(),
        ).limit(2).all()
    elif re.fullmatch(r"[0-9]{1,32}", identifier):
        users = db.query(User).filter(
            User.role == MAHASISWA, User.nim == identifier,
        ).limit(2).all()
    else:
        users = []

    user = users[0] if len(users) == 1 else None
    valid = verify_password(password, user.password_hash if user else _DUMMY_HASH)
    return user if user is not None and valid else None
