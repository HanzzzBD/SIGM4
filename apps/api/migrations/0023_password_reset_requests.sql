-- 0023 — Permintaan reset password administratif: `password_reset_requests` + dua enum
-- (FR-01.3, PR-02-05).
--
-- Migration `expand` murni: dua tipe dan satu tabel baru, tidak ada tabel lama yang diubah.
--
-- Sistem tidak memakai kanal email (FR-01.3): pemohon mengajukan permintaan (`MENUNGGU`),
-- Administrator memverifikasi identitasnya secara luring, memilih metode verifikasi, lalu
-- menerbitkan password sementara (`DITERBITKAN`) atau menolak (`DITOLAK`). Password sementara
-- TIDAK disimpan di sini maupun di mana pun selain hash-nya pada `users.password_hash`.
--
-- Bukan entitas berkolom baku (SDD-05 §4.2): kolom waktunya sudah bermakna sendiri
-- (`diminta_pada`, `diproses_pada`, `kedaluwarsa_pada`), sama seperti `refresh_tokens`.
--
-- Siklus hidup (PRD Bab 11.3 "Status Permintaan Reset Password"):
--   MENUNGGU -> DITERBITKAN -> SELESAI      (pengguna mengganti password sementara; PR-02-06)
--                           -> KEDALUWARSA  (72 jam tanpa dipakai, atau digantikan penerbitan baru)
--   MENUNGGU -> DITOLAK
-- Kedaluwarsa ditegakkan saat login dan saat daftar dibaca (tanpa pekerjaan terjadwal); kolom
-- `status` menyusul saat baris itu tersentuh.

-- migrate:up

CREATE TYPE password_reset_status AS ENUM (
    'MENUNGGU', 'DITERBITKAN', 'DITOLAK', 'SELESAI', 'KEDALUWARSA'
);

-- FR-01.3 langkah 3: kanal terverifikasi yang ditetapkan sekolah.
CREATE TYPE identity_verification_method AS ENUM (
    'KARTU_IDENTITAS_TATAP_MUKA', 'KONFIRMASI_ATASAN_ATAU_WALI_KELAS'
);

CREATE TABLE password_reset_requests (
    id                bigserial                    PRIMARY KEY,
    user_id           bigint                       NOT NULL REFERENCES users(id),
    status            password_reset_status        NOT NULL DEFAULT 'MENUNGGU',
    -- Wajib dipilih SEBELUM penerbitan dan tersimpan pada permintaan (FR-01.3 AC).
    metode_verifikasi identity_verification_method,
    diminta_pada      timestamptz                  NOT NULL,
    diproses_oleh     bigint                       REFERENCES users(id),
    diproses_pada     timestamptz,
    -- Penerbitan + 72 jam (FR-01.3 A3).
    kedaluwarsa_pada  timestamptz,
    -- FR-01.3 A2: penolakan beserta alasannya.
    alasan_penolakan  text,
    CONSTRAINT password_reset_diterbitkan_lengkap CHECK (
        status NOT IN ('DITERBITKAN', 'SELESAI', 'KEDALUWARSA')
        OR (metode_verifikasi IS NOT NULL AND diproses_oleh IS NOT NULL
            AND diproses_pada IS NOT NULL AND kedaluwarsa_pada IS NOT NULL)
    ),
    CONSTRAINT password_reset_ditolak_lengkap CHECK (
        status <> 'DITOLAK'
        OR (diproses_oleh IS NOT NULL AND diproses_pada IS NOT NULL
            AND alasan_penolakan IS NOT NULL AND btrim(alasan_penolakan) <> '')
    ),
    CONSTRAINT password_reset_menunggu_bersih CHECK (
        status <> 'MENUNGGU'
        OR (metode_verifikasi IS NULL AND diproses_oleh IS NULL
            AND diproses_pada IS NULL AND kedaluwarsa_pada IS NULL AND alasan_penolakan IS NULL)
    )
);

-- Batas 3 permintaan per akun per 24 jam (FR-01.3 A4) dan pencarian permintaan terakhir saat login.
CREATE INDEX password_reset_user_waktu_idx ON password_reset_requests (user_id, diminta_pada DESC);
-- Antrean Administrator (P-67): yang menunggu tindakan.
CREATE INDEX password_reset_menunggu_idx ON password_reset_requests (diminta_pada) WHERE status = 'MENUNGGU';
-- FK `diproses_oleh`.
CREATE INDEX password_reset_diproses_oleh_idx ON password_reset_requests (diproses_oleh) WHERE diproses_oleh IS NOT NULL;

-- migrate:down
DROP TABLE IF EXISTS password_reset_requests;
DROP TYPE IF EXISTS identity_verification_method;
DROP TYPE IF EXISTS password_reset_status;
