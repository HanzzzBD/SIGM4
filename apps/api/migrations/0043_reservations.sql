-- 0043 — Reservasi ruangan (PR-03-08; FR-07.2, m07-reservation-room.md §8, SDD-AVL-06/12,
-- keputusan 11 log phase-03). Expand murni: satu tipe, satu tabel, satu FK baru pada
-- booking_slots. `reservation_status` sudah lahir di 0002.
--
-- * Reservasi berulang (BR-024a, keputusan 11b): induk + baris anak ber-`parent_id`, satu per
--   tanggal, masing-masing berstatus sendiri. Nomor anak = nomor induk + `.NN` (SEQ-04).
-- * `reservation_items` (unit aset) TIDAK di sini — lahir bersama reservasi aset Phase 04
--   (keputusan 11c).
-- * booking_slots.reservation_id memperoleh FK-nya (keputusan 63b log phase-02: FK ditambahkan
--   migration modul pemiliknya). Baris lama tak bernilai, jadi validasi langsung aman.

-- migrate:up

CREATE TYPE reservation_type AS ENUM ('RUANGAN', 'ASET');

CREATE TABLE reservations (
    id                  bigserial          PRIMARY KEY,
    nomor               text               NOT NULL,
    jenis               reservation_type   NOT NULL,
    pemohon_id          bigint             NOT NULL REFERENCES users(id),
    room_id             bigint             REFERENCES rooms(id),
    -- BR-024a: tanggal turunan menunjuk induknya; induk tak pernah ber-parent.
    parent_id           bigint             REFERENCES reservations(id),
    -- FR-07.2 langkah 2 (keputusan 11d). Wajib bagi RUANGAN; reservasi aset memakai `keperluan`.
    nama_kegiatan       text               CHECK (length(nama_kegiatan) BETWEEN 1 AND 200),
    jenis_kegiatan      text               CHECK (length(jenis_kegiatan) BETWEEN 1 AND 100),
    -- Induk berulang: rentang keseluruhan pola; slot-nya sendiri tanpa rentang (SDD-AVL-12).
    waktu_mulai         timestamptz        NOT NULL,
    waktu_selesai       timestamptz        NOT NULL,
    jumlah_peserta      integer            CHECK (jumlah_peserta > 0),
    keperluan           text               CHECK (length(keperluan) <= 1000),
    kebutuhan_tambahan  text               CHECK (length(kebutuhan_tambahan) <= 1000),
    keterangan          text               CHECK (length(keterangan) <= 1000),
    status              reservation_status NOT NULL DEFAULT 'MENUNGGU_PERSETUJUAN',
    created_at          timestamptz        NOT NULL DEFAULT now(),
    updated_at          timestamptz        NOT NULL DEFAULT now(),
    created_by          bigint             REFERENCES users(id),
    updated_by          bigint             REFERENCES users(id),

    CONSTRAINT reservations_nomor_uq UNIQUE (nomor),
    CONSTRAINT reservations_waktu_ck CHECK (waktu_mulai < waktu_selesai),
    -- SEQ-01/SEQ-04 + sufiks turunan BR-024a; prefiks mengikuti jenis (PRD 26.6).
    CONSTRAINT reservations_nomor_ck CHECK (
        (jenis = 'RUANGAN' AND nomor ~ '^RSV-RG-[0-9]{4}-[0-9]{4,}(\.[0-9]{2,})?$')
        OR (jenis = 'ASET' AND nomor ~ '^RSV-BR-[0-9]{4}-[0-9]{4,}(\.[0-9]{2,})?$')
    ),
    CONSTRAINT reservations_turunan_ck CHECK ((parent_id IS NULL) = (strpos(nomor, '.') = 0)),
    -- BR-019 bergantung pada jumlah peserta; ruangan, nama, dan jenis kegiatan wajib (FR-07.2).
    CONSTRAINT reservations_ruangan_ck CHECK (
        jenis <> 'RUANGAN'
        OR (room_id IS NOT NULL AND nama_kegiatan IS NOT NULL AND jenis_kegiatan IS NOT NULL AND jumlah_peserta IS NOT NULL)
    )
);

CREATE TRIGGER reservations_set_updated_at
    BEFORE UPDATE ON reservations
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- BR-023a (kuota pengajuan tertunda per pemohon) dan daftar "milik saya" (P-30).
CREATE INDEX reservations_pemohon_idx ON reservations (pemohon_id, status);
CREATE INDEX reservations_room_idx ON reservations (room_id, waktu_mulai) WHERE room_id IS NOT NULL;
CREATE INDEX reservations_parent_idx ON reservations (parent_id) WHERE parent_id IS NOT NULL;

ALTER TABLE booking_slots
    ADD CONSTRAINT booking_slots_reservation_fk FOREIGN KEY (reservation_id) REFERENCES reservations(id);
CREATE INDEX booking_slots_reservation_idx ON booking_slots (reservation_id) WHERE reservation_id IS NOT NULL;

-- migrate:down
DROP INDEX IF EXISTS booking_slots_reservation_idx;
ALTER TABLE booking_slots DROP CONSTRAINT IF EXISTS booking_slots_reservation_fk;
-- Slot tetap ada (riwayat utilisasi); rujukannya kembali tanpa FK seperti sebelum 0043.
DROP TABLE IF EXISTS reservations;
DROP TYPE IF EXISTS reservation_type;
