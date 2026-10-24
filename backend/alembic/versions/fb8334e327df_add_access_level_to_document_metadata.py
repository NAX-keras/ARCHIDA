"""add access_level to document_metadata

Revision ID: fb8334e327df
Revises: d2b38368a95a
Create Date: 2026-07-25 10:22:33.339849

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "fb8334e327df"
down_revision: Union[str, Sequence[str], None] = "d2b38368a95a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""

    op.add_column(
        "document_metadata",
        sa.Column(
            "access_level",
            sa.String(length=20),
            nullable=False,
            server_default=sa.text("'PUBLIC'"),
        ),
    )

    op.create_check_constraint(
        "ck_document_metadata_access_level",
        "document_metadata",
        "access_level IN ('PUBLIC', 'PRIVATE')",
    )


def downgrade() -> None:
    """Downgrade schema."""

    op.drop_constraint(
        "ck_document_metadata_access_level",
        "document_metadata",
        type_="check",
    )

    op.drop_column("document_metadata", "access_level")