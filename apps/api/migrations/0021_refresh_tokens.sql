-- 0021 — Refresh token: `refresh_tokens` + enum `device_platform` (SDD-SESS-03,
-- SDD-SESS-04, SDD-04 §4.1, SDD-05 §4.7g, PR-02-02).
--
-- Migration `expand` murni: satu tipe dan satu tabel baru, tidak ada tabel lama yang
-- diubah. Tabel infrastruktur (SDD-05 §4.2): tanpa kolom baku entitas — barisnya tidak
-- dimiliki siapa pun, dan kolom waktunya sudah bermakna sendiri.
--
-- Yang disimpan hanya SHA-256 token (SDD-SESS-03): basis data yang bocor tidak
-- membocorkan token yang dapat dipakai. `family_id` menyatukan seluruh rantai rotasi
-- (SDD-SESS-04); `parent_id` menunjuk token yang ditukar menjadi baris ini.
-- `ip`/`user_agent` diisi saat token terbit — bahan daftar perangkat `PR-02-04`.
-- Kolom penguncian akun dan 2FA pada `users` milik `PR-02-03`/`PR-02-07`, bukan di sini.

-- migrate:up

-- Himpunan tertutup -> native enum berkode huruf besar (SDD-DB-02), terdaftar di PRD
-- Bab 11.3.
CREATE TYPE device_platform AS ENUM ('WEB', 'ANDROID', 'IOS');

CREATE TABLE refresh_tokens (
    id            bigserial       PRIMARY KEY,
    user_id       bigint          NOT NULL REFERENCES users(id),
    family_id     uuid            NOT NULL,
    parent_id     bigint          REFERENCES refresh_tokens(id),
    token_hash    bytea           NOT NULL,
    -- Menentukan masa berlaku (12 jam web, 30 hari mobile) dan jalur pengiriman token;
    -- diwarisi setiap rotasi, tidak pernah diambil dari permintaan refresh.
    platform      device_platform NOT NULL,
    ip            inet,
    user_agent    text,
    issued_at     timestamptz     NOT NULL DEFAULT now(),
    expires_at    timestamptz     NOT NULL,
    -- Terisi saat ditukar; token yang sudah dirotasi tidak boleh dipakai lagi —
    -- pemakaian ulangnya adalah sinyal pencurian (SDD-SESS-04).
    rotated_at    timestamptz,
    revoked_at    timestamptz,
    -- reuse_detected | logout | logout_all | password_changed | account_deactivated | break_glass
    revoke_reason text,
    CONSTRAINT refresh_tokens_hash_uq UNIQUE (token_hash),
    CONSTRAINT refresh_tokens_hash_panjang CHECK (octet_length(token_hash) = 32),
    CONSTRAINT refresh_tokens_kedaluwarsa_wajar CHECK (expires_at > issued_at)
);

-- Pencabutan massal per pengguna (logout semua perangkat, nonaktif akun) hanya menyentuh yang aktif.
CREATE INDEX refresh_tokens_user_aktif_idx ON refresh_tokens (user_id) WHERE revoked_at IS NULL;
-- Pencabutan seluruh keluarga saat pemakaian ulang terdeteksi.
CREATE INDEX refresh_tokens_family_idx ON refresh_tokens (family_id);
-- Pembersihan berkala baris kedaluwarsa (TBD-SESS-B).
CREATE INDEX refresh_tokens_expires_idx ON refresh_tokens (expires_at);
-- FK `parent_id`.
CREATE INDEX refresh_tokens_parent_idx ON refresh_tokens (parent_id) WHERE parent_id IS NOT NULL;

-- migrate:down
DROP TABLE IF EXISTS refresh_tokens;
DROP TYPE IF EXISTS device_platform;
