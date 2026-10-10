-- migrate:up
-- PR-03-15 (FR-11.2; keputusan 21 log phase-03): catatan hasil verifikasi — alasan penolakan yang
-- terlihat pelapor (FR-11.2 AC) atau catatan perbaikan ringan yang langsung menutup tiket. Expand saja:
-- kolom nullable baru; tiket yang sudah ada tidak berstatus DITOLAK sehingga CHECK langsung sah.
ALTER TABLE damage_reports
    ADD COLUMN catatan_verifikasi text CHECK (length(catatan_verifikasi) BETWEEN 1 AND 1000),
    ADD CONSTRAINT damage_reports_tolak_beralasan_ck CHECK (status <> 'DITOLAK' OR catatan_verifikasi IS NOT NULL);

-- migrate:down
ALTER TABLE damage_reports
    DROP CONSTRAINT IF EXISTS damage_reports_tolak_beralasan_ck,
    DROP COLUMN IF EXISTS catatan_verifikasi;
