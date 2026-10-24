from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.models.user import User
from app.schemas.auth import LoginRequest, UserSummary
from app.services.auth.dependencies import get_current_user
from app.services.auth.security import authenticate_user

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/login")
def login(payload: LoginRequest, request: Request, response: Response,
          db: Session = Depends(get_db)):
    request.session.clear()
    user = authenticate_user(db, payload.identifier, payload.password.get_secret_value())
    if user is None:
        raise HTTPException(status_code=401, detail="Identifier atau password salah.",
                            headers={"Cache-Control": "no-store"})
    request.session["user_id"] = user.id
    response.headers["Cache-Control"] = "no-store"
    return {"status": "success", "data": UserSummary.model_validate(user)}


@router.get("/me")
def me(user: User = Depends(get_current_user)):
    return {"status": "success", "data": UserSummary.model_validate(user)}


@router.post("/logout")
def logout(request: Request, response: Response):
    request.session.clear()
    # Also clear an invalid/expired cookie, which SessionMiddleware regards as empty.
    settings = request.app.state.settings
    response.delete_cookie("archida_session", path="/", httponly=True,
                           secure=not settings.is_development, samesite="lax")
    response.headers["Cache-Control"] = "no-store"
    return {"status": "success", "message": "Logout berhasil."}
