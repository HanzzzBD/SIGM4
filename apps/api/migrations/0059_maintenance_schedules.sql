-- PR-04-07: preventive schedules, per-asset cycles and immutable WO checklist snapshot.
-- migrate:up
CREATE TABLE maintenance_schedules (
 id bigserial PRIMARY KEY, nama text NOT NULL, asset_id bigint REFERENCES assets(id), category_id bigint REFERENCES asset_categories(id),
 interval_hari integer NOT NULL CHECK (interval_hari BETWEEN 1 AND 3650), tanggal_mulai date NOT NULL,
 checklist jsonb NOT NULL CHECK (jsonb_typeof(checklist)='array' AND jsonb_array_length(checklist)>0),
 teknisi_default_id bigint NOT NULL REFERENCES users(id), status text NOT NULL DEFAULT 'AKTIF' CHECK (status IN ('AKTIF','NONAKTIF')),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), created_by bigint REFERENCES users(id), updated_by bigint REFERENCES users(id),
 CHECK ((asset_id IS NOT NULL) <> (category_id IS NOT NULL))
);
CREATE TRIGGER maintenance_schedules_updated BEFORE UPDATE ON maintenance_schedules FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TABLE maintenance_schedule_assets (
 schedule_id bigint NOT NULL REFERENCES maintenance_schedules(id), asset_id bigint NOT NULL REFERENCES assets(id),
 jatuh_tempo date NOT NULL, work_order_id bigint REFERENCES work_orders(id), PRIMARY KEY(schedule_id,asset_id)
);
ALTER TABLE work_orders ADD COLUMN maintenance_schedule_id bigint REFERENCES maintenance_schedules(id),
 ADD COLUMN preventive_due_date date, ADD COLUMN checklist jsonb NOT NULL DEFAULT '[]',
 ADD COLUMN menunggu_ketersediaan_aset boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX work_orders_preventive_cycle ON work_orders(maintenance_schedule_id,asset_id,preventive_due_date) WHERE maintenance_schedule_id IS NOT NULL;
CREATE TABLE maintenance_schedule_skips (
 id bigserial PRIMARY KEY, schedule_id bigint NOT NULL REFERENCES maintenance_schedules(id), asset_id bigint NOT NULL REFERENCES assets(id),
 jatuh_tempo date NOT NULL, alasan text NOT NULL CHECK(length(trim(alasan))>0), created_at timestamptz NOT NULL DEFAULT now(), created_by bigint REFERENCES users(id)
);
-- migrate:down
DROP TABLE maintenance_schedule_skips;
DROP INDEX work_orders_preventive_cycle;
ALTER TABLE work_orders DROP COLUMN maintenance_schedule_id, DROP COLUMN preventive_due_date, DROP COLUMN checklist, DROP COLUMN menunggu_ketersediaan_aset;
DROP TABLE maintenance_schedule_assets;
DROP TABLE maintenance_schedules;
