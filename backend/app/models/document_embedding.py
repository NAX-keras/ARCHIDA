from sqlalchemy import BigInteger, Column, DateTime, ForeignKey, String
from sqlalchemy.sql import func
from pgvector.sqlalchemy import Vector

from app.database.session import Base


class DocumentEmbedding(Base):
    __tablename__ = "document_embeddings"

    id = Column(BigInteger, primary_key=True, autoincrement=True)

    document_id = Column(
        BigInteger,
        ForeignKey("documents.id", ondelete="CASCADE"),
        nullable=False,
        unique=True
    )

    embedding = Column(Vector(768), nullable=False)
    model_name = Column(String(150), nullable=False)
    embedding_source = Column(
        String(100),
        nullable=False,
        server_default="golden_pages_text"
    )

    created_at = Column(DateTime, server_default=func.now(), nullable=False)