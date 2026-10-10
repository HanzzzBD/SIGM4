-- 0050 — Pemantauan status kerusakan (PR-03-16; FR-11.3 langkah 4, SC-07, m20 kelompok Maintenance;
-- keputusan 22 log phase-03). Expand murni.
--
-- * SLA tindak lanjut per tingkat urgensi (m20 "SLA tindak lanjut per tingkat urgensi"): empat kunci
--   `system_settings`, seluruhnya bawaan 3 HARI KERJA (SC-07) — tidak ada angka per urgensi di PRD.
-- * `damage_reports.batas_sla`: tenggat ABSOLUT yang dihitung saat tiket dibuat (pola SDD-APR-07) —
--   perubahan libur/pengaturan kemudian tidak menggeser tenggat tiket yang sudah berjalan. Tiket
--   sebelum migration ini NULL = tanpa indikator SLA.

-- migrate:up
INSERT INTO system_settings (key, kelompok, tipe, value, nilai_bawaan, nilai_min, nilai_maks, deskripsi) VALUES
    ('maintenance.sla_tindak_lanjut_hari_rendah', 'MAINTENANCE', 'BILANGAN_BULAT', '3', '3', 1, 30,
     'SLA tindak lanjut laporan kerusakan urgensi Rendah, dalam hari kerja (FR-11.3, SC-07).'),
    ('maintenance.sla_tindak_lanjut_hari_sedang', 'MAINTENANCE', 'BILANGAN_BULAT', '3', '3', 1, 30,
     'SLA tindak lanjut laporan kerusakan urgensi Sedang, dalam hari kerja (FR-11.3, SC-07).'),
    ('maintenance.sla_tindak_lanjut_hari_tinggi', 'MAINTENANCE', 'BILANGAN_BULAT', '3', '3', 1, 30,
     'SLA tindak lanjut laporan kerusakan urgensi Tinggi, dalam hari kerja (FR-11.3, SC-07).'),
    ('maintenance.sla_tindak_lanjut_hari_kritis', 'MAINTENANCE', 'BILANGAN_BULAT', '3', '3', 1, 30,
     'SLA tindak lanjut laporan kerusakan urgensi Kritis, dalam hari kerja (FR-11.3, SC-07).')
ON CONFLICT (key) DO NOTHING;

ALTER TABLE damage_reports ADD COLUMN batas_sla timestamptz;
-- Saringan "melampaui SLA" atas tiket yang masih menunggu verifikasi.
CREATE INDEX damage_reports_batas_sla_idx ON damage_reports (batas_sla) WHERE status = 'DILAPORKAN';

-- migrate:down
DROP INDEX IF EXISTS damage_reports_batas_sla_idx;
ALTER TABLE damage_reports DROP COLUMN IF EXISTS batas_sla;
DELETE FROM system_settings WHERE key LIKE 'maintenance.sla_tindak_lanjut_hari_%';
