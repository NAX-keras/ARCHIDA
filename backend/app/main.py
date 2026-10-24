from fastapi import FastAPI, Request
from fastapi.exception_handlers import request_validation_exception_handler
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.sessions import SessionMiddleware
from app.api.routes.admin_documents import router as admin_documents_router
from app.api.routes.auth import router as auth_router
from app.api.routes.health import router as health_router
from app.api.routes.documents import router as documents_router
from app.api.routes.search import router as search_router
from app.core.config import Settings, settings
from app.core.csrf import TrustedOriginMiddleware


def create_app(config: Settings = settings) -> FastAPI:
    application = FastAPI(title=config.APP_NAME, version="0.1.0")
    application.state.settings = config
    application.add_middleware(
        SessionMiddleware,
        secret_key=config.SESSION_SECRET_KEY.get_secret_value(),
        session_cookie="archida_session",
        max_age=config.SESSION_MAX_AGE_SECONDS,
        same_site="lax",
        https_only=not config.is_development,
        path="/",
    )
    application.add_middleware(
        TrustedOriginMiddleware, trusted_origins=config.TRUSTED_FRONTEND_ORIGINS,
    )
    application.add_middleware(
        CORSMiddleware,
        allow_origins=config.TRUSTED_FRONTEND_ORIGINS,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Content-Type"],
    )

    @application.exception_handler(RequestValidationError)
    async def validation_error(request: Request, error: RequestValidationError):
        if request.url.path.startswith("/api/auth/"):
            # The default validation payload can echo a plaintext password.
            return JSONResponse(status_code=422, content={"detail": "Format request autentikasi tidak valid."},
                                headers={"Cache-Control": "no-store"})
        return await request_validation_exception_handler(request, error)

    application.include_router(health_router, prefix="/api")
    application.include_router(auth_router, prefix="/api")
    application.include_router(documents_router, prefix="/api")
    application.include_router(search_router, prefix="/api")
    application.include_router(admin_documents_router, prefix="/api")
   

    @application.get("/")
    def root():
        return {
            "status": "success", "message": "ArsipSemantik Backend is running",
            "data": {"service": config.APP_NAME, "version": "0.1.0"},
        }

    return application


app = create_app()
