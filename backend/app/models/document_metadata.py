from sqlalchemy import BigInteger, Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.sql import func

from app.database.session import Base


class DocumentMetadata(Base):
    __tablename__ = "document_metadata"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    document_id = Column(
        BigInteger,
        ForeignKey("documents.id", ondelete="CASCADE"),
        nullable=False,
        unique=True
    )

    title = Column(String(255), nullable=False)
    category = Column(String(100), nullable=True)
    document_type = Column(String(100), nullable=True)
    year = Column(Integer, nullable=True)
    faculty = Column(String(150), nullable=True)

    description = Column(Text, nullable=True)
    keywords = Column(Text, nullable=True)
    access_level = Column(String(20), nullable=False, default="PUBLIC")
    created_at = Column(DateTime, server_default=func.now(), nullable=False)