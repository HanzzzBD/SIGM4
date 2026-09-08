-- 0007 — Akun aplikasi terpisah dari akun migration (SEC-CFG-03, SDD-INF-03,
-- SDD-DB-11, AL-03b).
--
-- Dua akun, dua variabel: `DATABASE_URL` memuat `sigm4_app`, `MIGRATION_DATABASE_URL`
-- memuat akun ber-DDL yang memiliki skema (SDD-16 §4.7).
--
-- Migration ini mendahului `activity_logs` dengan sengaja. `ALTER DEFAULT
-- PRIVILEGES` hanya berlaku bagi tabel yang dibuat SESUDAHNYA, sehingga
-- menempatkannya lebih dulu membuat setiap tabel berikutnya — termasuk seluruh
-- Phase 01–08 — otomatis terjangkau akun aplikasi tanpa satu pun GRANT susulan
-- yang dapat terlupa.

-- migrate:up
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sigm4_app') THEN
        -- Tanpa sandi: di pengembangan `trust`/`scram` lokal sudah cukup, dan di
        -- production sandi berasal dari secret manager (SEC-CFG-01), tidak
        -- pernah dari berkas di repositori.
        CREATE ROLE sigm4_app LOGIN;
    END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO sigm4_app;

-- Tabel yang sudah ada (0003–0006). Yang setelah ini ditangani default privileges.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO sigm4_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO sigm4_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO sigm4_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT USAGE, SELECT ON SEQUENCES TO sigm4_app;

-- Hak DDL tidak diberikan sama sekali: sigm4_app bukan pemilik satu pun objek,
-- dan tanpa CREATE pada schema ia tidak dapat membuat objek baru (SEC-CFG-03).
REVOKE CREATE ON SCHEMA public FROM sigm4_app;

-- migrate:down
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sigm4_app') THEN
        EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public
                     REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLES FROM sigm4_app';
        EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public
                     REVOKE USAGE, SELECT ON SEQUENCES FROM sigm4_app';
        EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM sigm4_app';
        EXECUTE 'REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM sigm4_app';
        EXECUTE 'REVOKE ALL ON SCHEMA public FROM sigm4_app';
        EXECUTE 'DROP ROLE sigm4_app';
    END IF;
END
$$;
