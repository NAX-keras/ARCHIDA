"""create initial arsipsemantik tables

Revision ID: 9c870b6111c0
Revises: 
Create Date: 2026-07-01 14:01:00
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "9c870b6111c0"
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Aktifkan extension pgvector jika belum aktif
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    op.create_table(
        "users",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("name", sa.String(length=150), nullable=False),
        sa.Column("email", sa.String(length=150), nullable=False, unique=True),
        sa.Column("password_hash", sa.Text(), nullable=False),
        sa.Column("role", sa.String(length=30), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
    )

    op.create_table(
        "documents",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("uploaded_by", sa.BigInteger(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("file_name", sa.String(length=255), nullable=False),
        sa.Column("file_path", sa.Text(), nullable=False),
        sa.Column("file_type", sa.String(length=50), nullable=False, server_default="pdf"),
        sa.Column("file_size", sa.BigInteger(), nullable=True),
        sa.Column("extracted_text", sa.Text(), nullable=True),
        sa.Column("extraction_method", sa.String(length=50), nullable=False, server_default="golden_pages"),
        sa.Column("processing_status", sa.String(length=30), nullable=False, server_default="pending"),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
    )

    op.create_table(
        "document_metadata",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("document_id", sa.BigInteger(), sa.ForeignKey("documents.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("category", sa.String(length=100), nullable=True),
        sa.Column("document_type", sa.String(length=100), nullable=True),
        sa.Column("year", sa.Integer(), nullable=True),
        sa.Column("faculty", sa.String(length=150), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("keywords", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
    )

    # Tabel embedding dibuat dengan SQL langsung agar tipe vector(768) terbaca oleh PostgreSQL
    op.execute("""
        CREATE TABLE document_embeddings (
            id BIGSERIAL PRIMARY KEY,
            document_id BIGINT NOT NULL UNIQUE REFERENCES documents(id) ON DELETE CASCADE,
            embedding vector(768) NOT NULL,
            model_name VARCHAR(150) NOT NULL,
            embedding_source VARCHAR(100) NOT NULL DEFAULT 'golden_pages_text',
            created_at TIMESTAMP NOT NULL DEFAULT NOW()
        )
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS document_embeddings")
    op.drop_table("document_metadata")
    op.drop_table("documents")
    op.drop_table("users")