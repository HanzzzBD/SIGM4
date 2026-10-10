-- migrate:up
-- PR-03-13 (FR-07.5, keputusan 19 log phase-03): blokade jadwal tetap & blokade manual ruangan.
-- * room_fixed_schedules — ATURAN mingguan (satu hari per baris, data-model + E.5.3), bukan tiap
--   kemunculannya; slot `fixed_schedule` dimaterialisasi dalam horizon bergulir (job
--   `fixed-schedule-materialize`) dan saat aturan dibuat.
-- * room_manual_blocks — satu rentang menerus (mis. renovasi) = SATU slot `manual_block`.
-- * booking_slots memperoleh rujukan ke sumbernya (pola reservation_id, keputusan 63b phase-02).
-- Aturan tak dapat disunting (keputusan 19f): nonaktifkan lalu buat baru. Expand saja.

-- Bab 11.3 "Status Blokade Ruangan": Aktif, Nonaktif.
CREATE TYPE room_block_status AS ENUM ('AKTIF', 'NONAKTIF');

CREATE TABLE room_fixed_schedules (
    id              bigserial         PRIMARY KEY,
    room_id         bigint            NOT NULL REFERENCES rooms(id),
    -- ISO 1 = Senin … 7 = Minggu.
    hari            smallint          NOT NULL CHECK (hari BETWEEN 1 AND 7),
    jam_mulai       time              NOT NULL,
    jam_selesai     time              NOT NULL,
    label_kegiatan  text              NOT NULL CHECK (length(label_kegiatan) BETWEEN 1 AND 100),
    berlaku_mulai   date              NOT NULL,
    berlaku_sampai  date              NOT NULL,
    status          room_block_status NOT NULL DEFAULT 'AKTIF',
    created_at      timestamptz       NOT NULL DEFAULT now(),
    updated_at      timestamptz       NOT NULL DEFAULT now(),
    created_by      bigint            REFERENCES users(id),
    updated_by      bigint            REFERENCES users(id),
    CONSTRAINT room_fixed_schedules_jam_ck CHECK (jam_mulai < jam_selesai),
    CONSTRAINT room_fixed_schedules_berlaku_ck CHECK (berlaku_mulai <= berlaku_sampai)
);
CREATE INDEX room_fixed_schedules_room_idx ON room_fixed_schedules (room_id, status);
CREATE TRIGGER room_fixed_schedules_set_updated_at
    BEFORE UPDATE ON room_fixed_schedules
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE room_manual_blocks (
    id              bigserial         PRIMARY KEY,
    room_id         bigint            NOT NULL REFERENCES rooms(id),
    mulai           timestamptz       NOT NULL,
    selesai         timestamptz       NOT NULL,
    label_kegiatan  text              NOT NULL CHECK (length(label_kegiatan) BETWEEN 1 AND 100),
    status          room_block_status NOT NULL DEFAULT 'AKTIF',
    created_at      timestamptz       NOT NULL DEFAULT now(),
    updated_at      timestamptz       NOT NULL DEFAULT now(),
    created_by      bigint            REFERENCES users(id),
    updated_by      bigint            REFERENCES users(id),
    CONSTRAINT room_manual_blocks_waktu_ck CHECK (mulai < selesai)
);
CREATE INDEX room_manual_blocks_room_idx ON room_manual_blocks (room_id, status);
CREATE TRIGGER room_manual_blocks_set_updated_at
    BEFORE UPDATE ON room_manual_blocks
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE booking_slots
    ADD COLUMN fixed_schedule_id bigint REFERENCES room_fixed_schedules(id),
    ADD COLUMN manual_block_id   bigint REFERENCES room_manual_blocks(id);
CREATE INDEX booking_slots_fixed_schedule_idx ON booking_slots (fixed_schedule_id) WHERE fixed_schedule_id IS NOT NULL;
CREATE INDEX booking_slots_manual_block_idx   ON booking_slots (manual_block_id)   WHERE manual_block_id IS NOT NULL;

-- migrate:down
DROP INDEX IF EXISTS booking_slots_manual_block_idx;
DROP INDEX IF EXISTS booking_slots_fixed_schedule_idx;
ALTER TABLE booking_slots
    DROP COLUMN IF EXISTS manual_block_id,
    DROP COLUMN IF EXISTS fixed_schedule_id;
DROP TABLE IF EXISTS room_manual_blocks;
DROP TABLE IF EXISTS room_fixed_schedules;
DROP TYPE IF EXISTS room_block_status;
