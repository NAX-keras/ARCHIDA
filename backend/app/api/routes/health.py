from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.database.session import get_db


router = APIRouter(
    prefix="/health",
    tags=["Health"]
)


@router.get("")
def health_check():
    return {
        "status": "success",
        "message": "Backend health check passed",
        "data": {
            "service": settings.APP_NAME,
            "environment": settings.APP_ENV,
            "debug": settings.APP_DEBUG
        }
    }


@router.get("/db")
def database_health_check(db: Session = Depends(get_db)):
    result = db.execute(text("SELECT 1")).scalar()

    return {
        "status": "success",
        "message": "Database health check passed",
        "data": {
            "database": "connected",
            "result": result
        }
    }
