-- PR-04-05 + 06: expand, corrective orders and durable verification handoff.
-- migrate:up
CREATE TABLE work_orders (
    id bigserial PRIMARY KEY,
    nomor text NOT NULL UNIQUE CHECK (nomor ~ '^WO-[0-9]{4}-[0-9]{4,}$'),
    jenis text NOT NULL DEFAULT 'KOREKTIF' CHECK (jenis IN ('KOREKTIF','PREVENTIF')),
    asset_id bigint REFERENCES assets(id),
    room_id bigint REFERENCES rooms(id),
    damage_report_id bigint UNIQUE REFERENCES damage_reports(id),
    teknisi_id bigint NOT NULL REFERENCES users(id),
    prioritas text NOT NULL CHECK (prioritas IN ('RENDAH','SEDANG','TINGGI','KRITIS')),
    deskripsi text NOT NULL CHECK (length(trim(deskripsi)) BETWEEN 1 AND 5000),
    target_selesai date NOT NULL,
    estimasi_biaya numeric(15,2) NOT NULL DEFAULT 0 CHECK (estimasi_biaya >= 0),
    nonaktifkan_aset boolean NOT NULL DEFAULT true,
    status text NOT NULL DEFAULT 'DITUGASKAN' CHECK (status IN ('DITUGASKAN','DIKERJAKAN','TERTUNDA','MENUNGGU_VERIFIKASI','SELESAI','DIBATALKAN','TIDAK_DAPAT_DIPERBAIKI')),
    waktu_mulai timestamptz, waktu_selesai timestamptz,
    biaya numeric(15,2) NOT NULL DEFAULT 0 CHECK (biaya >= 0),
    catatan_teknisi text, hasil text,
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by bigint REFERENCES users(id), updated_by bigint REFERENCES users(id),
    CHECK ((asset_id IS NOT NULL) <> (room_id IS NOT NULL))
);
CREATE INDEX work_orders_assigned_idx ON work_orders(teknisi_id, status);
CREATE INDEX work_orders_asset_idx ON work_orders(asset_id);
CREATE TRIGGER work_orders_set_updated_at BEFORE UPDATE ON work_orders FOR EACH ROW EXECUTE FUNCTION set_updated_at();
ALTER TABLE damage_reports ADD COLUMN work_order_assignment jsonb;
-- migrate:down
ALTER TABLE damage_reports DROP COLUMN work_order_assignment;
DROP TABLE work_orders;
