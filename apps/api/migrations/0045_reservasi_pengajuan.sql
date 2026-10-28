-- 0045 — Parameter pengajuan reservasi ruangan (PR-03-10; BR-018, BR-020, FR-20.1, keputusan 14
-- log phase-03, keputusan 88e log phase-02). Expand murni: tiga baris seed `system_settings` oleh
-- PR konsumennya (0015, SDD-DB-17).
--
-- * Jam operasional (BR-018) pindah dari konstanta `DEFAULT_OPERATING_HOURS` (SDD-APR-15) ke sini;
--   bawaan 06.00–18.00 sama dengan konstanta itu, jadi SLA approval yang sedang berjalan tidak
--   bergeser. Bentuk `HH:MM` dan mulai < selesai ditegakkan validator m20.
-- * Jarak minimum pengajuan (BR-020, "H-1") dalam HARI KALENDER WIB.

-- migrate:up
INSERT INTO system_settings (key, kelompok, tipe, value, nilai_bawaan, nilai_min, nilai_maks, deskripsi) VALUES
    ('reservasi.jam_operasional_mulai', 'RESERVASI', 'TEKS', '"06:00"', '"06:00"', NULL, NULL,
     'Jam mulai operasional sekolah (WIB, HH:MM) — batas reservasi (BR-018) dan jam kerja SLA approval (SDD-APR-15).'),
    ('reservasi.jam_operasional_selesai', 'RESERVASI', 'TEKS', '"18:00"', '"18:00"', NULL, NULL,
     'Jam selesai operasional sekolah (WIB, HH:MM) — batas reservasi (BR-018) dan jam kerja SLA approval (SDD-APR-15).'),
    ('reservasi.jarak_minimum_hari', 'RESERVASI', 'BILANGAN_BULAT', '1', '1', 0, 30,
     'Jarak minimum pengajuan reservasi dalam hari kalender WIB (BR-020, bawaan H-1).')
ON CONFLICT (key) DO NOTHING;

-- migrate:down
DELETE FROM system_settings
 WHERE key IN ('reservasi.jam_operasional_mulai', 'reservasi.jam_operasional_selesai', 'reservasi.jarak_minimum_hari');
