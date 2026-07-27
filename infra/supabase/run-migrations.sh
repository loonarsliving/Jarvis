#!/usr/bin/env sh
# Applies every /infra/supabase/migrations/NNNN_*.sql file in order, once,
# tracked in a schema_migrations table — TDD §7.7/§38: "Migrations run
# automatically as a one-shot init container step in the Docker Compose
# stack before web/workers start, never run ad hoc against production by
# hand." Forward-only, additive (no down-migrations, per the same section).
set -eu

: "${DATABASE_URL:?DATABASE_URL must be set}"
MIGRATIONS_DIR="$(dirname "$0")/migrations"

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c \
  "create table if not exists schema_migrations (version text primary key, applied_at timestamptz not null default now());"

for file in "$MIGRATIONS_DIR"/*.sql; do
  version="$(basename "$file")"
  already_applied=$(psql "$DATABASE_URL" -tAc \
    "select 1 from schema_migrations where version = '$version';")

  if [ "$already_applied" = "1" ]; then
    echo "skip (already applied): $version"
    continue
  fi

  echo "applying: $version"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$file"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c \
    "insert into schema_migrations (version) values ('$version');"
done

echo "migrations complete."
