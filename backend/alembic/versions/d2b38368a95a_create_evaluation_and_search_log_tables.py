"""create evaluation and search log tables

Revision ID: d2b38368a95a
Revises: 9c870b6111c0
Create Date: 2026-07-01 14:29:59.973553

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd2b38368a95a'
down_revision: Union[str, Sequence[str], None] = '9c870b6111c0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
    "evaluation_queries",
    sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
    sa.Column("query_text", sa.Text(), nullable=False),
    sa.Column("query_intent", sa.Text(), nullable=True),
    sa.Column("query_type", sa.String(length=50), nullable=False, server_default="semantic"),
    sa.Column("description", sa.Text(), nullable=True),
    sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
)

    op.create_table(
        "evaluation_ground_truth",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column(
            "evaluation_query_id",
            sa.BigInteger(),
            sa.ForeignKey("evaluation_queries.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "document_id",
            sa.BigInteger(),
            sa.ForeignKey("documents.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("relevance_label", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint(
            "evaluation_query_id",
            "document_id",
            name="uq_evaluation_query_document",
        ),
    )

    op.create_table(
        "evaluation_results",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column(
            "evaluation_query_id",
            sa.BigInteger(),
            sa.ForeignKey("evaluation_queries.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("method", sa.String(length=50), nullable=False),
        sa.Column("top_k", sa.Integer(), nullable=False),
        sa.Column("true_positive", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("false_positive", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("false_negative", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("precision_score", sa.Numeric(5, 4), nullable=False),
        sa.Column("recall_score", sa.Numeric(5, 4), nullable=False),
        sa.Column("f1_score", sa.Numeric(5, 4), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint(
            "method IN ('tfidf', 'distilbert')",
            name="ck_evaluation_results_method",
        ),
    )

    op.create_table(
        "search_logs",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column(
            "user_id",
            sa.BigInteger(),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("query_text", sa.Text(), nullable=False),
        sa.Column("search_method", sa.String(length=50), nullable=False),
        sa.Column("top_k", sa.Integer(), nullable=False, server_default="10"),
        sa.Column("result_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("response_time_ms", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint(
            "search_method IN ('tfidf', 'distilbert')",
            name="ck_search_logs_method",
        ),
    )


def downgrade() -> None:
    op.drop_table("search_logs")
    op.drop_table("evaluation_results")
    op.drop_table("evaluation_ground_truth")
    op.drop_table("evaluation_queries")
