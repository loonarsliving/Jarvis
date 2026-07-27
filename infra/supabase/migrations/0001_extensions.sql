-- 0001_extensions.sql
-- Foundation migration: extensions required by every subsequent migration.
-- Per TDD §7.1: hand-written SQL, sequentially numbered, no ORM.

create extension if not exists "pgcrypto"; -- gen_random_uuid()
create extension if not exists "pg_trgm"; -- trigram search, used by later agents' full-text/search work (FSD §17); enabled once here so numbering doesn't collide.
