from pydantic import BaseModel, ConfigDict, Field, field_validator


class UpdateDocumentMetadataRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    title: str | None = Field(default=None, min_length=1, max_length=255)
    category_id: int | None = Field(default=None, strict=True)
    year: int | None = Field(default=None, strict=True, ge=1900, le=2100)
    faculty: str | None = Field(default=None, max_length=150)
    description: str | None = None
    keywords: str | None = None

    @field_validator("title", "category_id")
    @classmethod
    def reject_explicit_null(cls, value):
        if value is None:
            raise ValueError("Field tidak boleh kosong.")
        return value
