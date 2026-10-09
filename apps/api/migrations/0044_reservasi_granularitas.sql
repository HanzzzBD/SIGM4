-- 0044 — Granularitas slot kalender ruangan (PR-03-09; CAL-UI-02, FR-20.1, keputusan 12c log
-- phase-03). Expand murni: satu baris seed `system_settings` oleh PR konsumennya (0015).
-- Nilai yang sah dibatasi 15/30/60 oleh validator m20 — rentang min/maks di sini pagar luarnya.

-- migrate:up
INSERT INTO system_settings (key, kelompok, tipe, value, nilai_bawaan, nilai_min, nilai_maks, deskripsi) VALUES
    ('reservasi.granularitas_menit', 'RESERVASI', 'BILANGAN_BULAT', '30', '30', 15, 60,
     'Granularitas slot kalender ruangan dalam menit: 15, 30, atau 60 (CAL-UI-02).')
ON CONFLICT (key) DO NOTHING;

-- migrate:down
DELETE FROM system_settings WHERE key = 'reservasi.granularitas_menit';
