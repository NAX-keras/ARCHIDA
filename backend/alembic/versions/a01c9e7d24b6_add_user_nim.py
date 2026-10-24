"""Add optional unique NIM; preserve existing users and email constraints."""

from alembic import op
import sqlalchemy as sa

revision = "a01c9e7d24b6"
down_revision = "fb8334e327df"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("nim", sa.String(32), nullable=True))
    op.create_unique_constraint("uq_users_nim", "users", ["nim"])


def downgrade() -> None:
    op.drop_constraint("uq_users_nim", "users", type_="unique")
    op.drop_column("users", "nim")
