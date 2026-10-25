-- PR-04-11/12/13/14/19: asset domain; materials belong to Phase 06.
-- migrate:up
ALTER TYPE file_owner_type ADD VALUE IF NOT EXISTS 'STOCKTAKE_REPORT';
CREATE TABLE audit_sessions (
 id bigserial PRIMARY KEY, nomor text NOT NULL UNIQUE, nama text NOT NULL, domain text NOT NULL DEFAULT 'ASET' CHECK(domain='ASET'),
 periode_mulai date NOT NULL, periode_selesai date NOT NULL CHECK(periode_selesai>=periode_mulai), cakupan jsonb NOT NULL,
 status text NOT NULL DEFAULT 'BERJALAN' CHECK(status IN ('BERJALAN','MENUNGGU_PERSETUJUAN','SELESAI','DIBATALKAN')),
 finalized_at timestamptz, catatan_keputusan text, disetujui_oleh bigint REFERENCES users(id), disetujui_pada timestamptz,
 report_snapshot jsonb, report_status text NOT NULL DEFAULT 'BELUM' CHECK(report_status IN ('BELUM','MENUNGGU','SIAP','GAGAL')),
 report_file_id bigint REFERENCES stored_files(id), report_object_key text,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), created_by bigint REFERENCES users(id), updated_by bigint REFERENCES users(id)
);
CREATE TRIGGER audit_sessions_updated BEFORE UPDATE ON audit_sessions FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TABLE audit_session_assignees(session_id bigint NOT NULL REFERENCES audit_sessions(id), user_id bigint NOT NULL REFERENCES users(id), PRIMARY KEY(session_id,user_id));
CREATE TABLE audit_session_rooms(session_id bigint NOT NULL REFERENCES audit_sessions(id), room_id bigint NOT NULL REFERENCES rooms(id), nama text NOT NULL, completed_at timestamptz, completed_by bigint REFERENCES users(id), PRIMARY KEY(session_id,room_id));
CREATE TABLE audit_items (
 id bigserial PRIMARY KEY, session_id bigint NOT NULL REFERENCES audit_sessions(id), asset_id bigint NOT NULL REFERENCES assets(id),
 nama text NOT NULL, kode_barang text NOT NULL, uuid uuid NOT NULL, room_id_sistem bigint NOT NULL REFERENCES rooms(id), lokasi_sistem text NOT NULL,
 kondisi_sistem asset_condition NOT NULL, status_sistem asset_status NOT NULL,
 room_id_aktual bigint REFERENCES rooms(id), kondisi_aktual asset_condition,
 hasil text NOT NULL DEFAULT 'BELUM_DIPERIKSA' CHECK(hasil IN ('BELUM_DIPERIKSA','DITEMUKAN','SALAH_LOKASI','PERBEDAAN_KONDISI','TIDAK_DITEMUKAN','DIPINJAM')),
 salah_lokasi boolean NOT NULL DEFAULT false, beda_kondisi boolean NOT NULL DEFAULT false,
 catatan text, diperiksa_oleh bigint REFERENCES users(id), diperiksa_pada timestamptz,
 keterangan text, tindakan text CHECK(tindakan IN ('SESUAI','SESUAIKAN','HILANG','TANPA_PENYESUAIAN')),
 basis_room_id bigint REFERENCES rooms(id), basis_kondisi asset_condition, UNIQUE(session_id,asset_id)
);
CREATE TABLE audit_active_assets(asset_id bigint PRIMARY KEY REFERENCES assets(id), session_id bigint NOT NULL REFERENCES audit_sessions(id));
CREATE INDEX audit_items_location ON audit_items(session_id,room_id_sistem);
CREATE TABLE audit_new_findings (
 id bigserial PRIMARY KEY, session_id bigint NOT NULL REFERENCES audit_sessions(id), deskripsi text NOT NULL,
 category_id bigint NOT NULL REFERENCES asset_categories(id), room_id bigint NOT NULL REFERENCES rooms(id), kondisi asset_condition NOT NULL,
 keterangan text, pendaftaran jsonb, asset_id_hasil bigint REFERENCES assets(id), ditemukan_oleh bigint NOT NULL REFERENCES users(id), ditemukan_pada timestamptz NOT NULL
);
CREATE TABLE audit_scans(session_id bigint NOT NULL REFERENCES audit_sessions(id), client_scan_id uuid NOT NULL, payload_hash text NOT NULL, response jsonb NOT NULL, PRIMARY KEY(session_id,client_scan_id));
CREATE TABLE audit_photos(id bigserial PRIMARY KEY, session_id bigint NOT NULL REFERENCES audit_sessions(id), item_id bigint REFERENCES audit_items(id), finding_id bigint REFERENCES audit_new_findings(id), file_id bigint NOT NULL UNIQUE REFERENCES stored_files(id), CHECK((item_id IS NOT NULL)<>(finding_id IS NOT NULL)));
ALTER TABLE asset_movements ADD COLUMN audit_session_id bigint REFERENCES audit_sessions(id);
CREATE FUNCTION stocktake_snapshot_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF ROW(OLD.session_id,OLD.asset_id,OLD.nama,OLD.kode_barang,OLD.uuid,OLD.room_id_sistem,OLD.lokasi_sistem,OLD.kondisi_sistem,OLD.status_sistem)
    IS DISTINCT FROM ROW(NEW.session_id,NEW.asset_id,NEW.nama,NEW.kode_barang,NEW.uuid,NEW.room_id_sistem,NEW.lokasi_sistem,NEW.kondisi_sistem,NEW.status_sistem) THEN
  RAISE EXCEPTION 'Stocktake target snapshot is immutable';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER audit_items_snapshot BEFORE UPDATE ON audit_items FOR EACH ROW EXECUTE FUNCTION stocktake_snapshot_immutable();
CREATE FUNCTION stocktake_report_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.report_snapshot IS NOT NULL AND OLD.report_snapshot IS DISTINCT FROM NEW.report_snapshot THEN
  RAISE EXCEPTION 'Approved stocktake report is immutable';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER audit_report_snapshot BEFORE UPDATE ON audit_sessions FOR EACH ROW EXECUTE FUNCTION stocktake_report_immutable();
-- migrate:down
ALTER TABLE asset_movements DROP COLUMN audit_session_id;
DROP TABLE audit_photos, audit_scans, audit_new_findings, audit_active_assets, audit_items, audit_session_rooms, audit_session_assignees, audit_sessions;
DROP FUNCTION stocktake_snapshot_immutable(), stocktake_report_immutable();
-- Enum values cannot be removed safely; STOCKTAKE_REPORT is retained.
