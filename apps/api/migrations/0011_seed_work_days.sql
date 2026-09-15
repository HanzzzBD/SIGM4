-- 0011 — Seed hari kerja bawaan: Senin–Sabtu aktif, Minggu tidak (Lampiran E.2,
-- CAL-01, SDD-05 §4.6).
--
-- `hari` memakai penomoran ISO-8601 milik 0004: 1 = Senin … 7 = Minggu. Minggu
-- ditulis eksplisit sebagai tidak aktif, bukan dibiarkan tanpa baris: isi tabel
-- terbaca utuh tanpa perlu tahu bahwa "baris hilang = bukan hari kerja", dan
-- menyalakannya kelak cukup satu UPDATE.

-- migrate:up
INSERT INTO work_days (hari, aktif) VALUES
    (1, true), (2, true), (3, true), (4, true), (5, true), (6, true), (7, false)
ON CONFLICT (hari) DO UPDATE
    SET aktif = EXCLUDED.aktif;

-- migrate:down
DELETE FROM work_days WHERE hari BETWEEN 1 AND 7;
