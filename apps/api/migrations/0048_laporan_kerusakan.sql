-- migrate:up
-- PR-03-14 (FR-11.1, BR-044; keputusan 20 log phase-03): tiket laporan kerusakan + fotonya.
-- * Objek tiket tepat satu: aset ATAU ruangan (FR-11.1 langkah 3, A4).
-- * A1: satu tiket terbuka per objek — dijaga indeks unik parsial, bukan hanya pemeriksaan aplikasi.
-- * Foto merujuk `stored_files` (SDD-FS-02), bukan path sendiri; foto yang belum terkonfirmasi tetap
--   sah (A2, MOB-OFF-02/04) — status "foto tertunda" diturunkan dari `stored_files.checksum`.
-- * `loan_id` (A3, BR-032) menyusul bersama tabel `loans` (Phase 05). Expand saja.

-- Tipe `damage_urgency` & `damage_report_status` (Bab 11.3) sudah lahir di 0002.

CREATE TABLE damage_reports (
    id                 bigserial            PRIMARY KEY,
    nomor              text                 NOT NULL,
    pelapor_id         bigint               NOT NULL REFERENCES users(id),
    asset_id           bigint               REFERENCES assets(id),
    room_id            bigint               REFERENCES rooms(id),
    deskripsi          text                 NOT NULL CHECK (length(deskripsi) BETWEEN 1 AND 2000),
    urgensi            damage_urgency       NOT NULL,
    status             damage_report_status NOT NULL DEFAULT 'DILAPORKAN',
    -- FR-11.2 (PR-03-15): diisi saat verifikasi; waktu verifikasi untuk SLA SC-07.
    diverifikasi_oleh  bigint               REFERENCES users(id),
    diverifikasi_pada  timestamptz,
    created_at         timestamptz          NOT NULL DEFAULT now(),
    updated_at         timestamptz          NOT NULL DEFAULT now(),
    created_by         bigint               REFERENCES users(id),
    updated_by         bigint               REFERENCES users(id),
    CONSTRAINT damage_reports_nomor_uq UNIQUE (nomor),
    -- SEQ-04.
    CONSTRAINT damage_reports_nomor_ck CHECK (nomor ~ '^KRS-[0-9]{4}-[0-9]{4,}$'),
    CONSTRAINT damage_reports_objek_ck CHECK (num_nonnulls(asset_id, room_id) = 1)
);
-- FR-11.1 A1: tiket terbuka = belum Selesai/Ditolak.
CREATE UNIQUE INDEX damage_reports_aset_terbuka_uq ON damage_reports (asset_id)
    WHERE asset_id IS NOT NULL AND status IN ('DILAPORKAN', 'DIVERIFIKASI', 'DALAM_PERBAIKAN');
CREATE UNIQUE INDEX damage_reports_ruang_terbuka_uq ON damage_reports (room_id)
    WHERE room_id IS NOT NULL AND status IN ('DILAPORKAN', 'DIVERIFIKASI', 'DALAM_PERBAIKAN');
CREATE INDEX damage_reports_status_idx ON damage_reports (status, created_at);
CREATE INDEX damage_reports_pelapor_idx ON damage_reports (pelapor_id, created_at);
CREATE TRIGGER damage_reports_set_updated_at
    BEFORE UPDATE ON damage_reports
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Anak append-only tiketnya (pola `asset_document_links`): tanpa kolom `updated_*`.
CREATE TABLE damage_report_photos (
    id                bigserial   PRIMARY KEY,
    damage_report_id  bigint      NOT NULL REFERENCES damage_reports(id),
    file_id           bigint      NOT NULL REFERENCES stored_files(id),
    -- FR-11.1 langkah 3: 1–5 foto.
    urutan            smallint    NOT NULL CHECK (urutan BETWEEN 1 AND 5),
    created_at        timestamptz NOT NULL DEFAULT now(),
    created_by        bigint      REFERENCES users(id),
    CONSTRAINT damage_report_photos_file_uq UNIQUE (file_id),
    CONSTRAINT damage_report_photos_urutan_uq UNIQUE (damage_report_id, urutan)
);

-- migrate:down
DROP TABLE IF EXISTS damage_report_photos;
DROP TABLE IF EXISTS damage_reports;
