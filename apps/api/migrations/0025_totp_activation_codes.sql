-- 0025 — Kode aktivasi 2FA: `totp_activation_codes` (BR-070d, FR-01.5 A5/A7, SDD-SESS-17, PR-02-33).
--
-- Migration `expand` murni: satu tabel baru, tidak ada tabel lama yang diubah.
--
-- Pendaftaran 2FA pertama akun role wajib (R-01/R-03) — juga pendaftaran ulang setelah reset 2FA atau
-- break-glass — hanya dapat diselesaikan dengan kode aktivasi sekali pakai yang diterbitkan Administrator
-- lain (setelah verifikasi identitas luring, `FR-01.3`) atau CLI server. Tanpa itu, siapa pun yang
-- mengetahui password akun yang belum ber-2FA dapat mendaftarkan authenticator miliknya lebih dulu dan
-- mengunci pemilik akun (logs/phase-02.md §7, keputusan 44 dan 46).
--
-- Satu baris AKTIF per akun (indeks unik parsial pada `consumed_at IS NULL`): penerbitan baru menggantikan
-- yang lama (baris lama dihapus dalam transaksi yang sama). Yang disimpan hanya hash Argon2id; kode
-- aslinya tampil satu kali kepada penerbit dan tak dapat dibaca ulang.
--
--   `verified_at`  — kode telah dicocokkan pada `enroll`. `enroll/confirm` menuntut baris yang sudah
--                    terverifikasi, sehingga secret tertunda yang lahir tanpa kode (mis. sebelum aturan ini
--                    berlaku) tidak dapat dikonfirmasi.
--   `consumed_at`  — dihabiskan oleh `enroll/confirm` yang berhasil.
--   `failed_attempts` — 5 kesalahan menghanguskan kode. TIDAK mengunci akun: penyerang yang tahu password
--                    akan memakai penguncian sebagai DoS terhadap pemilik.
--   `issued_by` / `metode_verifikasi` — NULL bila diterbitkan CLI (pelaku `SYSTEM:CLI`, `PR-02-08`).

-- migrate:up

CREATE TABLE totp_activation_codes (
    id                bigserial                     PRIMARY KEY,
    user_id           bigint                        NOT NULL REFERENCES users(id),
    code_hash         text                          NOT NULL,   -- Argon2id (BR-070d); kode asli tak pernah disimpan
    issued_by         bigint                        REFERENCES users(id),
    metode_verifikasi identity_verification_method,
    issued_at         timestamptz                   NOT NULL,
    expires_at        timestamptz                   NOT NULL,
    failed_attempts   integer                       NOT NULL DEFAULT 0,
    verified_at       timestamptz,
    consumed_at       timestamptz,
    CONSTRAINT totp_activation_failed_nonneg CHECK (failed_attempts >= 0),
    CONSTRAINT totp_activation_masa_valid CHECK (expires_at > issued_at),
    -- Terbitan Administrator wajib mencatat metode verifikasi identitas (FR-01.5 A7); terbitan CLI tidak punya.
    CONSTRAINT totp_activation_metode_penerbit CHECK (issued_by IS NULL OR metode_verifikasi IS NOT NULL),
    -- Kode hanya dapat dihabiskan sesudah terverifikasi.
    CONSTRAINT totp_activation_dihabiskan_terverifikasi CHECK (consumed_at IS NULL OR verified_at IS NOT NULL)
);

-- "Satu baris aktif per akun": penerbitan baru menggantikan yang lama.
CREATE UNIQUE INDEX totp_activation_codes_aktif_uidx ON totp_activation_codes (user_id) WHERE consumed_at IS NULL;
-- FK `issued_by`.
CREATE INDEX totp_activation_codes_issued_by_idx ON totp_activation_codes (issued_by) WHERE issued_by IS NOT NULL;

-- migrate:down
DROP TABLE IF EXISTS totp_activation_codes;
