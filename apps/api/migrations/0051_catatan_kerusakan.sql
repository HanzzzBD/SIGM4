-- migrate:up
-- PR-03-31 (FR-11.1 A1, FR-07.4 A2; keputusan 23g & 25 log phase-03). Expand saja.
-- * `damage_report_notes`: "Tambahkan informasi ke tiket yang ada" — catatan berpelaku atas tiket terbuka,
--   append-only (tak disunting/dihapus; pola `asset_condition_history`).
-- * `damage_report_note_photos`: 0–5 foto per catatan. Tabel anak sendiri, BUKAN `damage_report_photos`:
--   tabel itu mengikat `urutan` 1–5 dan unik per tiket (FR-11.1 langkah 3), sedangkan catatan menambah
--   foto di luar lima foto laporan awal.
-- * `damage_reports.reservation_id`: laporan pasca-kegiatan tertaut reservasi ruangannya (FR-07.4 A2).

ALTER TABLE damage_reports ADD COLUMN reservation_id bigint REFERENCES reservations(id);
CREATE INDEX damage_reports_reservation_idx ON damage_reports (reservation_id) WHERE reservation_id IS NOT NULL;

CREATE TABLE damage_report_notes (
    id                bigserial   PRIMARY KEY,
    damage_report_id  bigint      NOT NULL REFERENCES damage_reports(id),
    keterangan        text        NOT NULL CHECK (length(keterangan) BETWEEN 1 AND 2000),
    created_at        timestamptz NOT NULL DEFAULT now(),
    created_by        bigint      NOT NULL REFERENCES users(id)
);
CREATE INDEX damage_report_notes_tiket_idx ON damage_report_notes (damage_report_id, created_at);

CREATE TABLE damage_report_note_photos (
    id          bigserial   PRIMARY KEY,
    note_id     bigint      NOT NULL REFERENCES damage_report_notes(id),
    file_id     bigint      NOT NULL REFERENCES stored_files(id),
    urutan      smallint    NOT NULL CHECK (urutan BETWEEN 1 AND 5),
    created_at  timestamptz NOT NULL DEFAULT now(),
    created_by  bigint      REFERENCES users(id),
    CONSTRAINT damage_report_note_photos_file_uq UNIQUE (file_id),
    CONSTRAINT damage_report_note_photos_urutan_uq UNIQUE (note_id, urutan)
);

-- migrate:down
DROP TABLE IF EXISTS damage_report_note_photos;
DROP TABLE IF EXISTS damage_report_notes;
DROP INDEX IF EXISTS damage_reports_reservation_idx;
ALTER TABLE damage_reports DROP COLUMN IF EXISTS reservation_id;
