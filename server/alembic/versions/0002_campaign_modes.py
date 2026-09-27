"""Separate local-round campaign rankings from immutable legacy run records."""
from alembic import op
import sqlalchemy as sa

revision = '0002_campaign_modes'
down_revision = '0001_initial'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('game_runs', sa.Column('campaign_version', sa.Integer(), nullable=False, server_default='1'))
    op.add_column('game_runs', sa.Column('campaign_mode', sa.String(16), nullable=True))
    op.add_column('game_runs', sa.Column('starting_round', sa.Integer(), nullable=False, server_default='1'))
    op.add_column('game_runs', sa.Column('boss_rounds_completed', sa.Integer(), nullable=False, server_default='0'))
    op.create_index('ix_game_runs_campaign_version', 'game_runs', ['campaign_version'])
    op.create_index('ix_game_runs_campaign_mode', 'game_runs', ['campaign_mode'])


def downgrade() -> None:
    # Dropping the discriminator would mix incompatible campaign rankings.
    raise RuntimeError('Campaign ranking migration requires retaining version and mode; restore a database backup to downgrade.')
