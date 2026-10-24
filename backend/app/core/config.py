from urllib.parse import urlsplit

from pydantic import Field, SecretStr, field_validator
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    APP_NAME: str = "ArsipSemantik Backend"
    APP_ENV: str = "local"
    APP_DEBUG: bool = True

    # Alias lama agar endpoint health lama tetap aman
    ENVIRONMENT: str = "local"
    DEBUG: bool = True

    DATABASE_URL: str

    SESSION_SECRET_KEY: SecretStr
    SESSION_MAX_AGE_SECONDS: int = Field(default=28800, ge=60, le=604800)
    TRUSTED_FRONTEND_ORIGINS: list[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]

    @field_validator("SESSION_SECRET_KEY")
    @classmethod
    def validate_session_secret(cls, value: SecretStr) -> SecretStr:
        if len(value.get_secret_value()) < 32:
            raise ValueError("SESSION_SECRET_KEY must contain at least 32 random characters")
        return value

    @field_validator("TRUSTED_FRONTEND_ORIGINS")
    @classmethod
    def validate_origins(cls, values: list[str]) -> list[str]:
        if not values:
            raise ValueError("At least one explicit frontend origin is required")
        for value in values:
            parsed = urlsplit(value)
            if (
                parsed.scheme not in {"http", "https"}
                or not parsed.hostname
                or "*" in value
                or parsed.username is not None
                or parsed.password is not None
                or parsed.path
                or parsed.query
                or parsed.fragment
                or value != value.strip()
            ):
                raise ValueError("Frontend origins must be exact HTTP(S) origins without paths")
        return values

    @property
    def is_development(self) -> bool:
        return self.APP_ENV == "development"

    # Konfigurasi AI Embedding
    AI_MODEL_TYPE: str = "huggingface"
    AI_MODEL_NAME: str = "cahya/distilbert-base-indonesian"
    AI_EMBEDDING_DIM: int = 768

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        hide_input_in_errors = True


settings = Settings()
