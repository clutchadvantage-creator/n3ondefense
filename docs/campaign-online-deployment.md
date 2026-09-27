# Campaign leaderboard compatibility

The client and API now support campaign version 2. Existing database rows and clients remain version 1 (Legacy). New runs identify one mode (`normal`, `overdrive`, `supreme`) and a local starting round from 1 through 30. The server returns those fields in the run authorization; the new client rejects a missing or mismatched acknowledgement.

Deploy the database migration and API before publishing the new client. This work does **not** deploy anything or modify a remote database.

1. Back up the leaderboard database using the existing deployment procedure.
2. Apply `alembic upgrade head` in the service's configured environment. Migration `0002_campaign_modes` adds version, mode, starting round and completed-boss count. Existing scores remain Legacy, retaining their original values.
3. Deploy the corresponding API and check the run authorization fields and all three board routes with a test identity.
4. Publish the matching game client after the API compatibility checks pass.

The three existing categories remain highest round, enemies destroyed and bomb targets destroyed. `campaign=normal|overdrive|supreme|legacy` selects the board on global, around-me and personal-best routes. Filtering occurs before per-player best selection and ranking. The omitted query defaults to Legacy for older clients; the new screen defaults to Normal. There is no combined 1–90 board or speed board.

Campaign milestones and completion reports include completed-boss counts. The server checks the contiguous cleared range from the authorized starting round and requires bombsites only for ordinary completed rounds. Victory requires local round 30. Client defeat/quit reports retain the highest **cleared** round instead of crediting the round the player entered. Existing rate, duration, sequence, monotonicity and idempotency checks remain in place. These are statistical checks of client reports, not server simulation or cryptographic proof of boss kills. Checkpoint eligibility remains local-profile owned, as before.

New clients refuse to label an older server's undifferentiated rankings as a mode board. Local gameplay remains available during a backend rollout. Existing pending legacy submissions retain their original payloads. The migration refuses a destructive downgrade that would erase the discriminators and mix incompatible scores; retain a database backup for rollback.

Local validation uses an isolated SQLite database for service/ranking and migration tests, plus browser transport mocks. No scores are sent externally. The available local Python is 3.14; production remains pinned to Python 3.13, so production-runtime/PostgreSQL deployment verification is still required before release.
