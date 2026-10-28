-- PR-05-24: FR-13.4, BR-093/094/095. Expand domain dan snapshot Bahan.
-- migrate:up
ALTER TABLE audit_sessions DROP CONSTRAINT audit_sessions_domain_check;
ALTER TABLE audit_sessions ADD CONSTRAINT audit_sessions_domain_check CHECK(domain IN ('ASET','BAHAN'));
CREATE TABLE audit_material_items (
 id bigserial PRIMARY KEY, session_id bigint NOT NULL REFERENCES audit_sessions(id),
 material_id bigint NOT NULL REFERENCES materials(id), room_id bigint NOT NULL REFERENCES rooms(id),
 nama text NOT NULL, uuid uuid NOT NULL, satuan_id bigint NOT NULL REFERENCES material_units(id),
 satuan_nama text NOT NULL, satuan_simbol text NOT NULL, lokasi text NOT NULL,
 saldo_sistem integer NOT NULL CHECK(saldo_sistem>=0),
 jumlah_fisik integer CHECK(jumlah_fisik>=0), basis_saldo integer CHECK(basis_saldo>=0),
 basis_ledger_id bigint CHECK(basis_ledger_id>=0), revision integer NOT NULL DEFAULT 0 CHECK(revision>=0),
 keterangan text, diperiksa_oleh bigint REFERENCES users(id), diperiksa_pada timestamptz,
 UNIQUE(session_id,material_id,room_id),
 CHECK((jumlah_fisik IS NULL AND basis_saldo IS NULL AND basis_ledger_id IS NULL AND diperiksa_pada IS NULL)
    OR (jumlah_fisik IS NOT NULL AND basis_saldo IS NOT NULL AND basis_ledger_id IS NOT NULL AND diperiksa_pada IS NOT NULL))
);
CREATE INDEX audit_material_items_location_idx ON audit_material_items(session_id,room_id,id);
CREATE FUNCTION stocktake_material_snapshot_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Snapshot bahan tidak dapat dihapus' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM audit_sessions WHERE id=OLD.session_id AND status IN ('SELESAI','DIBATALKAN')) THEN
  RAISE EXCEPTION 'Hasil sesi tertutup tidak dapat diubah' USING ERRCODE='23514';
 END IF;
 IF ROW(OLD.session_id,OLD.material_id,OLD.room_id,OLD.nama,OLD.uuid,OLD.satuan_id,OLD.satuan_nama,OLD.satuan_simbol,OLD.lokasi,OLD.saldo_sistem)
   IS DISTINCT FROM ROW(NEW.session_id,NEW.material_id,NEW.room_id,NEW.nama,NEW.uuid,NEW.satuan_id,NEW.satuan_nama,NEW.satuan_simbol,NEW.lokasi,NEW.saldo_sistem) THEN
  RAISE EXCEPTION 'Snapshot bahan tidak dapat diubah' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER audit_material_snapshot BEFORE UPDATE OR DELETE ON audit_material_items FOR EACH ROW EXECUTE FUNCTION stocktake_material_snapshot_guard();
CREATE FUNCTION stocktake_domain_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE actual_domain text;
BEGIN
 SELECT domain INTO actual_domain FROM audit_sessions WHERE id=NEW.session_id;
 IF actual_domain IS DISTINCT FROM (CASE WHEN TG_TABLE_NAME='audit_material_items' THEN 'BAHAN' ELSE 'ASET' END) THEN
  RAISE EXCEPTION 'Sesi opname tidak boleh mencampur domain' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER audit_material_domain BEFORE INSERT OR UPDATE ON audit_material_items FOR EACH ROW EXECUTE FUNCTION stocktake_domain_guard();
CREATE TRIGGER audit_asset_domain BEFORE INSERT OR UPDATE ON audit_items FOR EACH ROW EXECUTE FUNCTION stocktake_domain_guard();
CREATE TRIGGER audit_finding_domain BEFORE INSERT OR UPDATE ON audit_new_findings FOR EACH ROW EXECUTE FUNCTION stocktake_domain_guard();
CREATE FUNCTION stocktake_session_domain_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.domain IS DISTINCT FROM NEW.domain THEN RAISE EXCEPTION 'Domain sesi tidak dapat diubah' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER audit_session_domain BEFORE UPDATE OF domain ON audit_sessions FOR EACH ROW EXECUTE FUNCTION stocktake_session_domain_guard();
-- migrate:down
-- Tolak rollback yang akan menghapus sesi Bahan operasional; jangan ubah menjadi sesi Aset.
DO $$ BEGIN IF EXISTS(SELECT 1 FROM audit_sessions WHERE domain='BAHAN') THEN RAISE EXCEPTION 'Rollback memerlukan penanganan sesi Bahan terlebih dahulu'; END IF; END $$;
DROP TRIGGER audit_session_domain ON audit_sessions;
DROP TRIGGER audit_asset_domain ON audit_items;
DROP TRIGGER audit_finding_domain ON audit_new_findings;
DROP TABLE audit_material_items;
DROP FUNCTION stocktake_session_domain_guard(),stocktake_domain_guard(),stocktake_material_snapshot_guard();
ALTER TABLE audit_sessions DROP CONSTRAINT audit_sessions_domain_check;
ALTER TABLE audit_sessions ADD CONSTRAINT audit_sessions_domain_check CHECK(domain='ASET');
