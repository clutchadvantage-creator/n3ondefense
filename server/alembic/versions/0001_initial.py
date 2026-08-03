"""Initial isolated leaderboard schema."""
from alembic import op
import sqlalchemy as sa

revision = '0001_initial'
down_revision = None
branch_labels = None
depends_on = None


run_status = sa.Enum('pending', 'verified', 'flagged', 'rejected', name='run_status')


def upgrade() -> None:
    op.create_table('players',
        sa.Column('id', sa.Uuid(), primary_key=True),
        sa.Column('public_id', sa.String(24), nullable=False),
        sa.Column('display_name', sa.String(24), nullable=False),
        sa.Column('display_name_normalized', sa.String(24), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('banned_at', sa.DateTime(timezone=True)),
        sa.UniqueConstraint('public_id'), sa.UniqueConstraint('display_name_normalized'))
    op.create_index('ix_players_public_id', 'players', ['public_id'])
    op.create_index('ix_players_display_name_normalized', 'players', ['display_name_normalized'])
    op.create_table('player_sessions',
        sa.Column('id', sa.Uuid(), primary_key=True),
        sa.Column('player_id', sa.Uuid(), sa.ForeignKey('players.id', ondelete='CASCADE'), nullable=False),
        sa.Column('refresh_token_hash', sa.String(64), nullable=False),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('revoked_at', sa.DateTime(timezone=True)),
        sa.Column('last_used_at', sa.DateTime(timezone=True)),
        sa.UniqueConstraint('refresh_token_hash'))
    op.create_index('ix_player_sessions_player_id', 'player_sessions', ['player_id'])
    op.create_index('ix_player_sessions_refresh_token_hash', 'player_sessions', ['refresh_token_hash'])
    op.create_table('game_runs',
        sa.Column('id', sa.Uuid(), primary_key=True),
        sa.Column('player_id', sa.Uuid(), sa.ForeignKey('players.id', ondelete='CASCADE'), nullable=False),
        sa.Column('seed', sa.BigInteger(), nullable=False),
        sa.Column('game_version', sa.String(32), nullable=False),
        sa.Column('status', run_status, nullable=False),
        sa.Column('highest_round', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('rounds_completed', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('enemies_destroyed', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('bomb_sites_destroyed', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('credits_earned', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('duration_ms', sa.BigInteger(), nullable=False, server_default='0'),
        sa.Column('last_milestone_sequence', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('idempotency_key', sa.String(64)),
        sa.Column('verification_reason', sa.String(500)),
        sa.Column('started_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('completed_at', sa.DateTime(timezone=True)),
        sa.UniqueConstraint('player_id', 'idempotency_key', name='uq_run_player_idempotency'))
    op.create_index('ix_game_runs_player_id', 'game_runs', ['player_id'])
    op.create_index('ix_game_runs_status', 'game_runs', ['status'])
    op.create_table('run_milestones',
        sa.Column('id', sa.Uuid(), primary_key=True),
        sa.Column('run_id', sa.Uuid(), sa.ForeignKey('game_runs.id', ondelete='CASCADE'), nullable=False),
        sa.Column('sequence', sa.Integer(), nullable=False),
        sa.Column('round', sa.Integer(), nullable=False),
        sa.Column('enemies_destroyed', sa.Integer(), nullable=False),
        sa.Column('bomb_sites_destroyed', sa.Integer(), nullable=False),
        sa.Column('credits_earned', sa.Integer(), nullable=False),
        sa.Column('elapsed_ms', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint('run_id', 'sequence', name='uq_milestone_run_sequence'))
    op.create_index('ix_run_milestones_run_id', 'run_milestones', ['run_id'])
    op.create_table('rate_limit_buckets',
        sa.Column('key', sa.String(180), primary_key=True),
        sa.Column('window_started_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('request_count', sa.Integer(), nullable=False, server_default='0'))


def downgrade() -> None:
    op.drop_table('rate_limit_buckets')
    op.drop_index('ix_run_milestones_run_id', table_name='run_milestones')
    op.drop_table('run_milestones')
    op.drop_index('ix_game_runs_status', table_name='game_runs')
    op.drop_index('ix_game_runs_player_id', table_name='game_runs')
    op.drop_table('game_runs')
    op.drop_index('ix_player_sessions_refresh_token_hash', table_name='player_sessions')
    op.drop_index('ix_player_sessions_player_id', table_name='player_sessions')
    op.drop_table('player_sessions')
    op.drop_index('ix_players_display_name_normalized', table_name='players')
    op.drop_index('ix_players_public_id', table_name='players')
    op.drop_table('players')
    run_status.drop(op.get_bind(), checkfirst=True)
