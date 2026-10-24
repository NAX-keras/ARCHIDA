from sqlalchemy import BigInteger, Column, DateTime, ForeignKey, String, Text
from sqlalchemy.sql import func

from app.database.session import Base


class Document(Base):
    __tablename__ = "documents"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    uploaded_by = Column(BigInteger, ForeignKey("users.id"), nullable=True)

    file_name = Column(String(255), nullable=False)
    file_path = Column(Text, nullable=False)
    file_type = Column(String(50), nullable=False, server_default="pdf")
    file_size = Column(BigInteger, nullable=True)

    extracted_text = Column(Text, nullable=True)
    extraction_method = Column(String(50), nullable=False, server_default="golden_pages")
    processing_status = Column(String(30), nullable=False, server_default="pending")

    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), nullable=False)