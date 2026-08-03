from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..models import GameRun, Player, RunStatus
from ..schemas.leaderboards import LeaderboardCategory, LeaderboardEntry


CATEGORY_COLUMNS = {
    'highest_round': GameRun.highest_round,
    'enemies_destroyed': GameRun.enemies_destroyed,
    'bomb_sites_destroyed': GameRun.bomb_sites_destroyed,
}


def _global_ranking(category: LeaderboardCategory):
    column = CATEGORY_COLUMNS[category]
    player_runs = select(
        GameRun.id.label('run_id'),
        GameRun.player_id,
        column.label('value'),
        func.row_number().over(
            partition_by=GameRun.player_id,
            order_by=(column.desc(), GameRun.completed_at.asc(), GameRun.id.asc()),
        ).label('player_row'),
    ).where(GameRun.status == RunStatus.verified).subquery()
    personal_bests = select(
        player_runs.c.run_id,
        player_runs.c.player_id,
        player_runs.c.value,
    ).where(player_runs.c.player_row == 1).subquery()
    return select(
        personal_bests.c.run_id,
        personal_bests.c.player_id,
        personal_bests.c.value,
        func.rank().over(order_by=personal_bests.c.value.desc()).label('rank'),
    ).subquery()


def _to_entry(player: Player, row: object) -> LeaderboardEntry:
    return LeaderboardEntry(
        rank=int(row.rank),
        public_player_id=player.public_id,
        display_name=player.display_name,
        value=int(row.value),
        run_id=str(row.run_id),
    )


def ranked_entries(db: Session, category: LeaderboardCategory, limit: int, offset: int = 0) -> list[LeaderboardEntry]:
    ranking = _global_ranking(category)
    rows = db.execute(
        select(Player, ranking)
        .join(ranking, ranking.c.player_id == Player.id)
        .order_by(ranking.c.rank, ranking.c.run_id)
        .offset(offset)
        .limit(limit)
    ).all()
    return [_to_entry(row[0], row) for row in rows]


def personal_entry(db: Session, player: Player, category: LeaderboardCategory) -> LeaderboardEntry | None:
    ranking = _global_ranking(category)
    row = db.execute(select(Player, ranking).join(ranking, ranking.c.player_id == Player.id).where(Player.id == player.id)).first()
    return _to_entry(row[0], row) if row else None


def around_player(db: Session, player: Player, category: LeaderboardCategory, radius: int) -> list[LeaderboardEntry]:
    ranking = _global_ranking(category)
    player_rank = db.scalar(select(ranking.c.rank).where(ranking.c.player_id == player.id))
    if player_rank is None:
        return []
    rows = db.execute(
        select(Player, ranking)
        .join(ranking, ranking.c.player_id == Player.id)
        .where(ranking.c.rank.between(max(1, player_rank - radius), player_rank + radius))
        .order_by(ranking.c.rank, ranking.c.run_id)
    ).all()
    return [_to_entry(row[0], row) for row in rows]
