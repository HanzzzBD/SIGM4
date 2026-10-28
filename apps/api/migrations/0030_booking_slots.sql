-- 0030 — `booking_slots` + exclusion constraint (PR-02-16; CI-01, SDD-AVL-01…04,
-- SDD-01 §4.1). Mesin ketersediaan tunggal untuk ruangan DAN unit aset; konsumen
-- pertamanya M-07 (Phase 03). `booking_status` sudah dibuat 0002; `btree_gist`
-- sudah dinyalakan 0001 — tanpanya exclusion constraint di bawah tak dapat dibuat.
--
-- Tiga penyesuaian atas teks SDD-01 §4.1 (keputusan 63 log phase-02, diputuskan
-- pemilik produk):
--   * DUA exclusion constraint per jenis sumber daya, bukan satu — ErrorMapper
--     (SDD-06 §4.4, CI-04) membedakan ASSET_NOT_AVAILABLE dari RESERVATION_CONFLICT
--     lewat NAMA constraint. Semantik identik: resource_type sudah dibandingkan `=`.
--   * reservation_id/loan_id/work_order_id NULLABLE TANPA FK — tabelnya belum ada;
--     FK ditambahkan migration modul pemiliknya (expand, SDD-DB-08), pola
--     assets.procurement_id (0026).
--   * Indeks AV-02 `assets_availability` TIDAK dibuat: AV-02 sudah dilayani
--     assets_kandidat_pinjam_idx (0026); pilihan final lewat EXPLAIN (SDD-PERF-07).

-- migrate:up

-- Nilai huruf kecil disengaja: glossary PRD memakukan resource_type='asset'
-- sebagai kontrak teknis (SDD-01 §4.1).
CREATE TYPE booking_resource AS ENUM ('room', 'asset');
CREATE TYPE booking_origin   AS ENUM ('reservation', 'loan', 'maintenance', 'fixed_schedule', 'manual_block');

CREATE TABLE booking_slots (
    id              bigserial        PRIMARY KEY,
    resource_type   booking_resource NOT NULL,
    -- SDD-AVL-04: polimorfik, tanpa FK — dijaga trigger di bawah.
    resource_id     bigint           NOT NULL,
    -- SDD-AVL-02: half-open [mulai, selesai). NULL hanya untuk baris induk berulang.
    slot_range      tstzrange,
    status          booking_status   NOT NULL,
    origin          booking_origin   NOT NULL,
    reservation_id  bigint,
    loan_id         bigint,
    work_order_id   bigint,
    parent_slot_id  bigint           REFERENCES booking_slots(id) ON DELETE CASCADE,
    -- TTL slot Tentative (BR-023b).
    expires_at      timestamptz,
    created_by      bigint           REFERENCES users(id),
    created_at      timestamptz      NOT NULL DEFAULT now(),

    CONSTRAINT slot_range_required
        CHECK (parent_slot_id IS NOT NULL OR slot_range IS NOT NULL OR status = 'RELEASED'),
    CONSTRAINT slot_range_bounds
        CHECK (slot_range IS NULL OR (lower_inc(slot_range) AND NOT upper_inc(slot_range))),
    CONSTRAINT tentative_needs_ttl
        CHECK (status <> 'TENTATIVE' OR expires_at IS NOT NULL)
);

-- CI-01: penegak nol double-booking — satu per jenis sumber daya (lihat kepala berkas).
ALTER TABLE booking_slots
    ADD CONSTRAINT booking_slots_room_no_overlap
    EXCLUDE USING gist (resource_id WITH =, slot_range WITH &&)
    WHERE (resource_type = 'room' AND status IN ('TENTATIVE', 'CONFIRMED', 'ACTIVE') AND slot_range IS NOT NULL);

ALTER TABLE booking_slots
    ADD CONSTRAINT booking_slots_asset_no_overlap
    EXCLUDE USING gist (resource_id WITH =, slot_range WITH &&)
    WHERE (resource_type = 'asset' AND status IN ('TENTATIVE', 'CONFIRMED', 'ACTIVE') AND slot_range IS NOT NULL);

-- AV-01: pencarian ketersediaan.
CREATE INDEX booking_slots_lookup
    ON booking_slots USING gist (resource_type, resource_id, slot_range)
    WHERE status IN ('TENTATIVE', 'CONFIRMED', 'ACTIVE');

-- Job pembersih TTL Tentative (SDD-01 §4.6).
CREATE INDEX booking_slots_expiry
    ON booking_slots (expires_at) WHERE status = 'TENTATIVE';

-- SDD-AVL-04: integritas resource_id polimorfik. Galatnya foreign_key_violation
-- (23503) seperti FK sungguhan.
CREATE FUNCTION check_booking_resource() RETURNS trigger AS $$
BEGIN
    IF NEW.resource_type = 'room' THEN
        PERFORM 1 FROM rooms WHERE id = NEW.resource_id;
    ELSE
        PERFORM 1 FROM assets WHERE id = NEW.resource_id;
    END IF;
    IF NOT FOUND THEN
        RAISE foreign_key_violation
            USING MESSAGE = format('resource %s/%s tidak ditemukan', NEW.resource_type, NEW.resource_id);
    END IF;
    RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER booking_slots_resource_fk
    BEFORE INSERT OR UPDATE OF resource_type, resource_id ON booking_slots
    FOR EACH ROW EXECUTE FUNCTION check_booking_resource();

-- migrate:down
DROP TRIGGER IF EXISTS booking_slots_resource_fk ON booking_slots;
DROP FUNCTION IF EXISTS check_booking_resource();
DROP TABLE IF EXISTS booking_slots;
DROP TYPE IF EXISTS booking_origin;
DROP TYPE IF EXISTS booking_resource;
