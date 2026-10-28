-- migrate:up
-- PR-03-12 (FR-07.4, keputusan 16 log phase-03): pencatatan penggunaan ruangan pasca-kegiatan.
-- Permission baru `reservation.record_usage` (Admin, Petugas — Lampiran C) dan kolom hasil
-- pencatatan pada `reservations`. `Tidak Digunakan` tetap STATUS (Bab 11.3); kondisi ruangan
-- hanya bagi yang `Selesai`. Expand saja: kolom nullable, tak ada data lama yang berubah.
INSERT INTO permissions (kode, modul, aksi, deskripsi, inti) VALUES
    ('reservation.record_usage', 'Reservasi', 'record_usage', 'Mencatat penggunaan & kondisi ruangan pasca-kegiatan (FR-07.4)', false);
INSERT INTO role_permissions (role_id, permission_id, scope)
    SELECT r.id, p.id, 'ALL'::permission_scope FROM roles r CROSS JOIN permissions p
    WHERE r.kode IN ('R-01','R-02') AND p.kode = 'reservation.record_usage';
UPDATE roles SET role_version = role_version + 1 WHERE kode IN ('R-01','R-02');

-- Bab 11.3 "Kondisi Ruangan Pasca-Kegiatan": Baik, Perlu Perhatian (FR-07.4 langkah 3).
CREATE TYPE room_usage_condition AS ENUM ('BAIK', 'PERLU_PERHATIAN');
ALTER TABLE reservations
    ADD COLUMN kondisi_ruangan          room_usage_condition,
    ADD COLUMN catatan_penggunaan       text        CHECK (length(catatan_penggunaan) <= 1000),
    ADD COLUMN penggunaan_dicatat_oleh  bigint      REFERENCES users(id),
    ADD COLUMN penggunaan_dicatat_pada  timestamptz,
    -- Dicatat sekali: pelaku & waktu selalu berpasangan; kondisi hanya bagi yang Selesai.
    ADD CONSTRAINT reservations_penggunaan_ck CHECK (
        (penggunaan_dicatat_oleh IS NULL) = (penggunaan_dicatat_pada IS NULL)
        AND (kondisi_ruangan IS NULL OR (status = 'SELESAI' AND penggunaan_dicatat_pada IS NOT NULL))
    );

-- migrate:down
ALTER TABLE reservations
    DROP CONSTRAINT IF EXISTS reservations_penggunaan_ck,
    DROP COLUMN IF EXISTS penggunaan_dicatat_pada,
    DROP COLUMN IF EXISTS penggunaan_dicatat_oleh,
    DROP COLUMN IF EXISTS catatan_penggunaan,
    DROP COLUMN IF EXISTS kondisi_ruangan;
DROP TYPE IF EXISTS room_usage_condition;
UPDATE roles SET role_version = role_version + 1 WHERE id IN (
    SELECT role_id FROM role_permissions WHERE permission_id IN (SELECT id FROM permissions WHERE kode = 'reservation.record_usage')
);
DELETE FROM role_permissions WHERE permission_id IN (SELECT id FROM permissions WHERE kode = 'reservation.record_usage');
DELETE FROM permissions WHERE kode = 'reservation.record_usage';
