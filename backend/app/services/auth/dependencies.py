from fastapi import Depends, HTTPException, Request, Response
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.models.document_metadata import DocumentMetadata
from app.models.user import User
from app.services.auth.security import ADMIN, MAHASISWA, ROLES


def get_current_user(
    request: Request, response: Response, db: Session = Depends(get_db),
) -> User:
    response.headers["Cache-Control"] = "no-store"
    user_id = request.session.get("user_id")
    user = db.get(User, user_id) if type(user_id) is int and user_id > 0 else None
    if (
        user is None
        or user.role not in ROLES
        or (user.role == MAHASISWA and not user.nim)
    ):
        request.session.clear()
        raise HTTPException(status_code=401, detail="Sesi tidak valid. Silakan login.",
                            headers={"Cache-Control": "no-store"})
    return user


def require_admin(user: User = Depends(get_current_user)) -> User:
    if user.role != ADMIN:
        raise HTTPException(status_code=403, detail="Akses khusus ADMIN.")
    return user


def filter_visible_documents(query, user: User):
    """Apply before pagination/counts; missing metadata is not implicitly public."""
    if user.role != ADMIN:
        query = query.filter(DocumentMetadata.access_level == "PUBLIC")
    return query
