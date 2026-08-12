"""permitir libros duplicados

Revision ID: 0d58d5c3cc73
Revises: a39985f32fd2
Create Date: 2026-08-10 17:22:19.217811

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0d58d5c3cc73'
down_revision: Union[str, Sequence[str], None] = 'a39985f32fd2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.drop_constraint('libros_hash_contenido_key', 'libros', type_='unique')


def downgrade() -> None:
    """Downgrade schema."""
    op.create_unique_constraint('libros_hash_contenido_key', 'libros', ['hash_contenido'])
