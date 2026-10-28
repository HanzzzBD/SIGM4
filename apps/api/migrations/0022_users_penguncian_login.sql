-- 0022 — Penghitung kegagalan login dan penguncian akun pada `users` (FR-01.1 A2,
-- SDD-SESS-06/07, SDD-04 §4.1, PR-02-03).
--
-- Migration `expand` murni: tiga kolom baru pada tabel yang sudah ada, tanpa mengubah
-- kolom lama. `DEFAULT 0` konstan sehingga PostgreSQL 15 tidak menulis ulang tabel.
--
-- Penghitung hidup di PostgreSQL, bukan Redis (SDD-SESS-06): penguncian adalah kontrol
-- keamanan yang tidak boleh hilang saat cache di-restart. Sumbu IP-nya di Redis (SDD-SESS-07)
-- dan sudah berjalan sejak PR-00-15; ini sumbu akunnya.
--
-- `failed_login_window_start` tidak ada pada rancangan awal SDD-04 §4.1 (hanya
-- `failed_login_count` dan `locked_until`). "5 gagal DALAM 15 menit" tidak dapat dinyatakan
-- tanpa titik awal jendela: jendela tetap dimulai pada kegagalan pertama, dan hitungan
-- di-reset bila jendelanya lewat.
--
-- Trigger `users_set_updated_at` ikut berjalan pada UPDATE ini (perilaku yang sama dengan
-- `login_terakhir_pada`); kolom penghitung tidak menyentuh `updated_by`.

-- migrate:up

ALTER TABLE users
    ADD COLUMN failed_login_count        integer     NOT NULL DEFAULT 0,
    ADD COLUMN failed_login_window_start timestamptz,
    ADD COLUMN locked_until              timestamptz,
    ADD CONSTRAINT users_failed_login_count_nonneg CHECK (failed_login_count >= 0);

-- migrate:down

ALTER TABLE users
    DROP CONSTRAINT IF EXISTS users_failed_login_count_nonneg,
    DROP COLUMN IF EXISTS locked_until,
    DROP COLUMN IF EXISTS failed_login_window_start,
    DROP COLUMN IF EXISTS failed_login_count;
