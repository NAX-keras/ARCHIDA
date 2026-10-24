from pydantic import BaseModel


class UpdateDocumentAccessRequest(BaseModel):
    access_level: str