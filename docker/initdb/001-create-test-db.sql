-- Auto-run by the postgres image's docker-entrypoint-initdb.d mechanism on
-- first container start. Postgres' POSTGRES_DB env var only creates one
-- database (template_db); this creates the second, disposable test database
-- .env.test's DATABASE_URL points at, so `docker compose up -d db` alone is
-- enough to satisfy Phase 0's exit criteria — no manual `createdb` step.
CREATE DATABASE akewtutor_test;
