from datetime import UTC, datetime
import uuid

import pytest
from pydantic import ValidationError
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.database import Base
from app.models import GameRun, Player, RunStatus
from app.schemas.runs import CompleteRunRequest, MilestoneRequest, RunStartRequest
from app.services.leaderboard_service import around_player, personal_entry, ranked_entries
from app.services.run_service import submit_milestone
from app.services.verification_service import verify_completed_run


def campaign_run(start=1):
    return GameRun(id=uuid.uuid4(), player_id=uuid.uuid4(), seed=1, game_version='test',
                   campaign_version=2, campaign_mode='supreme', starting_round=start,
                   last_milestone_sequence=1)


def report(highest=30, start=1, **changes):
    rounds = highest - start + 1 if highest else 0
    bosses = highest // 5 - (start - 1) // 5 if highest else 0
    values = dict(highest_round=highest, rounds_completed=rounds, boss_rounds_completed=bosses,
                  enemies_destroyed=max(1, rounds * 10), bomb_sites_destroyed=rounds - bosses,
                  credits_earned=1000, elapsed_ms=600_000, idempotency_key='campaign-test-001',
                  outcome='victory' if highest == 30 else 'player_dead')
    values.update(changes)
    return CompleteRunRequest(**values)


@pytest.mark.parametrize('start', [1, 5, 10, 20, 30])
def test_boss_only_rounds_need_no_bomb_sites(start):
    assert verify_completed_run(campaign_run(start), report(start=start)).status == RunStatus.verified


@pytest.mark.parametrize('highest,start,changes', [
    (30, 1, {'boss_rounds_completed': 5}),
    (30, 1, {'rounds_completed': 29}),
    (31, 1, {}),
    (3, 10, {'rounds_completed': 0, 'boss_rounds_completed': 0, 'bomb_sites_destroyed': 0}),
    (5, 1, {'outcome': 'victory'}),
])
def test_campaign_rejects_inconsistent_completion(highest, start, changes):
    assert verify_completed_run(campaign_run(start), report(highest, start, **changes)).status == RunStatus.rejected


def test_death_before_checkpoint_clear_has_zero_completed_rounds():
    assert verify_completed_run(campaign_run(30), report(0, 30)).status == RunStatus.verified


def test_start_contract_requires_version_and_mode_together():
    assert RunStartRequest(game_version='old').campaign_version == 1
    for values in [dict(campaign_version=2), dict(campaign_mode='normal'),
                   dict(campaign_version=2, campaign_mode='normal', starting_round=31)]:
        with pytest.raises(ValidationError):
            RunStartRequest(game_version='test', **values)


@pytest.mark.parametrize('category', ['highest_round', 'enemies_destroyed', 'bomb_sites_destroyed'])
def test_boards_isolate_modes_before_personal_best_and_ranking(category):
    engine = create_engine('sqlite://')
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        player = Player(public_id='test-one', display_name='One', display_name_normalized='one')
        db.add(player)
        db.flush()
        for index, board in enumerate(['legacy', 'normal', 'overdrive', 'supreme']):
            db.add(GameRun(player_id=player.id, seed=1, game_version='test',
                           campaign_version=1 if board == 'legacy' else 2,
                           campaign_mode=None if board == 'legacy' else board,
                           status=RunStatus.verified, highest_round=20 + index,
                           enemies_destroyed=20 + index, bomb_sites_destroyed=20 + index,
                           completed_at=datetime.now(UTC)))
        db.commit()
        for index, board in enumerate(['legacy', 'normal', 'overdrive', 'supreme']):
            entries = ranked_entries(db, category, 50, campaign=board)
            assert len(entries) == 1
            assert entries[0].rank == 1 and entries[0].value == 20 + index
            assert personal_entry(db, player, category, board) == entries[0]
            assert around_player(db, player, category, 3, board) == entries
        assert ranked_entries(db, category, 50)[0].value == 20  # old clients remain legacy
    engine.dispose()


def test_milestone_rejects_bad_boss_count_before_persisting():
    from fastapi import HTTPException
    engine = create_engine('sqlite://')
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        run = campaign_run()
        run.last_milestone_sequence = 0
        run.status = RunStatus.pending
        db.add(run)
        db.commit()
        values = report(5, boss_rounds_completed=0).model_dump()
        with pytest.raises(HTTPException) as caught:
            submit_milestone(db, run, MilestoneRequest(sequence=1, **values))
        assert caught.value.status_code == 422
        assert run.last_milestone_sequence == 0
    engine.dispose()


def test_migration_preserves_existing_rows_as_legacy():
    import importlib.util
    from pathlib import Path
    from alembic.migration import MigrationContext
    from alembic.operations import Operations
    from sqlalchemy import text
    path = Path(__file__).parents[1] / 'alembic/versions/0002_campaign_modes.py'
    spec = importlib.util.spec_from_file_location('campaign_migration', path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    engine = create_engine('sqlite://')
    with engine.begin() as connection:
        connection.execute(text('CREATE TABLE game_runs (id INTEGER PRIMARY KEY, highest_round INTEGER)'))
        connection.execute(text('INSERT INTO game_runs (id, highest_round) VALUES (1, 148)'))
        migration.op = Operations(MigrationContext.configure(connection))
        migration.upgrade()
        row = connection.execute(text('SELECT * FROM game_runs')).mappings().one()
        assert row['highest_round'] == 148 and row['campaign_version'] == 1
        assert row['campaign_mode'] is None and row['boss_rounds_completed'] == 0
    engine.dispose()
