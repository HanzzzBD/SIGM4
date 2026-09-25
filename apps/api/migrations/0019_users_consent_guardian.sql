-- 0019 — Penanda persetujuan wali: `users.consent_guardian_at` (DP-02, SL-06,
-- SDD-05 §4.7e, SDD-DB-21).
--
-- Migration `expand` murni: satu kolom NULLABLE, tanpa nilai bawaan dan tanpa
-- pengisian ulang. NULL = persetujuan belum terekam. Hanya akun Siswa/OSIS (R-07)
-- yang diberi penanda (DP-03, minimisasi data).
--
-- Gerbangnya ("akun siswa tanpa penanda tidak dapat dibuat/diaktifkan") ditegakkan
-- service, bukan skema: menegakkannya di basis data menuntut trigger lintas tabel
-- (`users` -> `roles`) dan bukan bagian acceptance PR ini.

-- migrate:up

ALTER TABLE users ADD COLUMN consent_guardian_at timestamptz;

-- migrate:down
ALTER TABLE users DROP COLUMN IF EXISTS consent_guardian_at;
