# infra/supabase

- `migrations/` — hand-written SQL, sequentially numbered (TDD §7.1/§7.7).
  See `migrations/README.md` for what this Sprint owns vs. what's reserved
  for later agents.
- `run-migrations.sh` — applies every migration once, tracked in a
  `schema_migrations` table; run by `infra/docker/Dockerfile.migrate`'s
  one-shot init container.
- `docker-compose.supabase.yml` — self-hosted Supabase overlay reference.
  **Trimmed** — see the comment at the top of that file and `DECISIONS.md`
  item 6 before using this for anything beyond local dev.
