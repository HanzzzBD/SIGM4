-- PR-05-10..14/29: expand; record aset dan identitas tidak dihapus.
-- migrate:up
ALTER TYPE file_owner_type ADD VALUE IF NOT EXISTS 'DISPOSAL_ATTACHMENT';
ALTER TYPE file_owner_type ADD VALUE IF NOT EXISTS 'DISPOSAL_EXECUTION_PHOTO';
ALTER TYPE file_owner_type ADD VALUE IF NOT EXISTS 'DISPOSAL_REPORT';
CREATE TABLE asset_disposals (
 id bigserial PRIMARY KEY, nomor text NOT NULL UNIQUE, pengusul_id bigint NOT NULL REFERENCES users(id),
 alasan disposal_reason NOT NULL, justifikasi text NOT NULL, tindak_lanjut_fisik text NOT NULL,
 status text NOT NULL CHECK(status IN ('MENUNGGU_PERSETUJUAN','PERLU_REVISI','DISETUJUI','DISETUJUI_SEBAGIAN','DITOLAK','DIBATALKAN','SELESAI')),
 total_nilai numeric(16,2) NOT NULL, approval_instance_id bigint REFERENCES approval_instances(id),
 disetujui_oleh bigint REFERENCES users(id), disetujui_pada timestamptz,
 dilaksanakan_oleh bigint REFERENCES users(id), tanggal_pelaksanaan date, dilaksanakan_pada timestamptz,
 saksi jsonb, catatan text, report_snapshot jsonb,
 report_status text NOT NULL DEFAULT 'BELUM' CHECK(report_status IN ('BELUM','MENUNGGU','SIAP','GAGAL')),
 report_file_id bigint REFERENCES stored_files(id), report_object_key text,
 report_redacted_file_id bigint REFERENCES stored_files(id), report_redacted_object_key text,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), created_by bigint REFERENCES users(id), updated_by bigint REFERENCES users(id)
);
CREATE TRIGGER asset_disposals_updated BEFORE UPDATE ON asset_disposals FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TABLE asset_disposal_items (
 id bigserial PRIMARY KEY, disposal_id bigint NOT NULL REFERENCES asset_disposals(id), asset_id bigint NOT NULL REFERENCES assets(id),
 snapshot jsonb NOT NULL, disetujui boolean, keterangan text, bukti_kehilangan_file_id bigint REFERENCES stored_files(id),
 konfirmasi_garansi boolean NOT NULL, alasan_garansi text NOT NULL,
 executed_at timestamptz, reinstated_at timestamptz, reinstated_by bigint REFERENCES users(id), reinstatement_reason text,
 UNIQUE(disposal_id,asset_id)
);
CREATE INDEX disposal_items_asset ON asset_disposal_items(asset_id,executed_at);
CREATE TABLE asset_disposal_claims(asset_id bigint PRIMARY KEY REFERENCES assets(id),disposal_id bigint NOT NULL REFERENCES asset_disposals(id));
CREATE TABLE asset_disposal_files(disposal_id bigint NOT NULL REFERENCES asset_disposals(id), file_id bigint NOT NULL UNIQUE REFERENCES stored_files(id), nama_berkas text NOT NULL, jenis text NOT NULL, PRIMARY KEY(disposal_id,file_id));
CREATE FUNCTION guard_disposal_booking() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.resource_type='asset' AND NEW.status IN ('TENTATIVE','CONFIRMED','ACTIVE') THEN
  PERFORM id FROM assets WHERE id=NEW.resource_id FOR UPDATE;
  IF EXISTS(SELECT 1 FROM assets WHERE id=NEW.resource_id AND dihapuskan)
    OR (NEW.origin IN ('reservation','loan') AND EXISTS(SELECT 1 FROM asset_disposal_claims WHERE asset_id=NEW.resource_id)) THEN
   RAISE EXCEPTION 'Asset is disposed or claimed for disposal' USING ERRCODE='23P01',CONSTRAINT='booking_slots_asset_no_overlap';
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER booking_slots_disposal BEFORE INSERT OR UPDATE OF resource_id,resource_type,status,slot_range ON booking_slots FOR EACH ROW EXECUTE FUNCTION guard_disposal_booking();
CREATE FUNCTION guard_disposed_asset() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.dihapuskan AND (to_jsonb(OLD)-ARRAY['updated_at','updated_by']) IS DISTINCT FROM (to_jsonb(NEW)-ARRAY['updated_at','updated_by'])
    AND current_setting('sigm4.reinstate_asset',true) IS DISTINCT FROM OLD.id::text THEN
  RAISE EXCEPTION 'Disposed asset cannot be modified';
 END IF;
 IF OLD.dihapuskan AND (OLD.kode_barang<>NEW.kode_barang OR OLD.uuid<>NEW.uuid) THEN RAISE EXCEPTION 'Disposed identity is immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER assets_disposal_terminal BEFORE UPDATE ON assets FOR EACH ROW EXECUTE FUNCTION guard_disposed_asset();
CREATE FUNCTION guard_disposal_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_TABLE_NAME='asset_disposal_items' THEN
  IF OLD.snapshot IS DISTINCT FROM NEW.snapshot OR OLD.asset_id<>NEW.asset_id OR OLD.disposal_id<>NEW.disposal_id THEN RAISE EXCEPTION 'Disposal asset snapshot is immutable'; END IF;
 ELSE
  IF OLD.report_snapshot IS NOT NULL AND OLD.report_snapshot IS DISTINCT FROM NEW.report_snapshot THEN RAISE EXCEPTION 'Executed disposal report is immutable'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER disposal_item_snapshot BEFORE UPDATE ON asset_disposal_items FOR EACH ROW EXECUTE FUNCTION guard_disposal_snapshot();
CREATE TRIGGER disposal_report_snapshot BEFORE UPDATE ON asset_disposals FOR EACH ROW EXECUTE FUNCTION guard_disposal_snapshot();
-- migrate:down
DROP TRIGGER booking_slots_disposal ON booking_slots;
DROP TRIGGER assets_disposal_terminal ON assets;
DROP TABLE asset_disposal_files, asset_disposal_claims, asset_disposal_items, asset_disposals;
DROP FUNCTION guard_disposal_booking(),guard_disposed_asset(),guard_disposal_snapshot();
-- Generated file enum values retained (PostgreSQL enum removal is unsafe).
