-- 0024 — 2FA TOTP: kolom secret pada `users`, `totp_backup_codes`, dan penanda verifikasi
-- pada `refresh_tokens` (FR-01.5, BR-070, BR-070c, SDD-SESS-08/09, PR-02-07).
--
-- Migration `expand` murni: tiga kolom nullable pada `users`, satu kolom `DEFAULT false`
-- (konstan, tanpa penulisan ulang tabel pada PostgreSQL 15) pada `refresh_tokens`, dan satu
-- tabel baru. Tidak ada kolom lama yang diubah.
--
-- Dua kolom TIDAK ada pada rancangan awal SDD-04 §4.1 dan ditambahkan karena keperluannya
-- terbukti saat merancang (dicatat pada logs/phase-02.md dan SDD-04 §4.1):
--   * `users.totp_last_step` — langkah TOTP (RFC 6238) terakhir yang diterima. Tanpa itu satu
--     kode 6 digit dapat dipakai ulang selama jendela ±1 langkah (RFC 6238 §5.2 melarangnya).
--   * `refresh_tokens.otp_verified` — SDD-SESS-09 menetapkan gerbang memeriksa KLAIM `amr`,
--     bukan tabel; klaim itu harus tetap ada ketika access token diterbitkan ulang lewat
--     `/auth/refresh`, dan refresh token tidak memuat klaim. Kolom ini yang membawanya:
--     diwarisi setiap rotasi (seperti `platform`), tidak pernah diambil dari permintaan.
--
-- `totp_secret_enc` berisi ciphertext AES-256-GCM (SDD-SESS-08); kuncinya `TOTP_ENCRYPTION_KEY`,
-- terpisah dari kunci JWT. `totp_enabled_at IS NULL` dengan secret terisi = pendaftaran yang
-- belum dikonfirmasi 6 digit (FR-01.5 langkah 3-4); baru sesudah dikonfirmasi 2FA berlaku.

-- migrate:up

ALTER TABLE users
    ADD COLUMN totp_secret_enc bytea,
    ADD COLUMN totp_enabled_at timestamptz,
    ADD COLUMN totp_last_step  integer,   -- langkah 30 detik sejak epoch; int4 cukup hingga tahun 4012
    ADD CONSTRAINT users_totp_aktif_bersecret CHECK (totp_enabled_at IS NULL OR totp_secret_enc IS NOT NULL);

CREATE TABLE totp_backup_codes (
    id         bigserial   PRIMARY KEY,
    user_id    bigint      NOT NULL REFERENCES users(id),
    code_hash  text        NOT NULL,   -- Argon2id (BR-070c); kode aslinya tidak pernah disimpan
    created_at timestamptz NOT NULL DEFAULT now(),
    used_at    timestamptz
);
-- Hitung sisa kode dan cari kandidat pencocokan: hanya yang belum terpakai.
CREATE INDEX totp_backup_codes_user_idx ON totp_backup_codes (user_id) WHERE used_at IS NULL;

ALTER TABLE refresh_tokens
    ADD COLUMN otp_verified boolean NOT NULL DEFAULT false;

-- migrate:down

ALTER TABLE refresh_tokens DROP COLUMN IF EXISTS otp_verified;
DROP TABLE IF EXISTS totp_backup_codes;
ALTER TABLE users
    DROP CONSTRAINT IF EXISTS users_totp_aktif_bersecret,
    DROP COLUMN IF EXISTS totp_last_step,
    DROP COLUMN IF EXISTS totp_enabled_at,
    DROP COLUMN IF EXISTS totp_secret_enc;
