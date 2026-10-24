-- PR-03-17/18/19/33: expand M-14; 0061 remains owned by stocktake.
-- migrate:up
ALTER TYPE file_owner_type ADD VALUE IF NOT EXISTS 'PROCUREMENT_ATTACHMENT';
ALTER TYPE file_owner_type ADD VALUE IF NOT EXISTS 'PROCUREMENT_RECEIPT_DOCUMENT';
ALTER TYPE file_owner_type ADD VALUE IF NOT EXISTS 'PROCUREMENT_REJECTION_PHOTO';
ALTER TABLE approval_steps ADD COLUMN rincian_keputusan jsonb;
CREATE TABLE procurements (
 id bigserial PRIMARY KEY, nomor text NOT NULL UNIQUE, judul text NOT NULL,
 pengusul_id bigint NOT NULL REFERENCES users(id), work_unit_id bigint REFERENCES work_units(id),
 tahun_anggaran integer NOT NULL CHECK(tahun_anggaran BETWEEN 1900 AND 9999),
 prioritas text NOT NULL DEFAULT 'SEDANG' CHECK(prioritas IN ('RENDAH','SEDANG','TINGGI','MENDESAK')),
 justifikasi text NOT NULL DEFAULT '', total_estimasi numeric(15,2) NOT NULL DEFAULT 0 CHECK(total_estimasi>=0),
 status procurement_status NOT NULL DEFAULT 'DRAF', approval_instance_id bigint REFERENCES approval_instances(id),
 source_asset_id bigint REFERENCES assets(id), alasan_penutupan text,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 created_by bigint REFERENCES users(id), updated_by bigint REFERENCES users(id)
);
CREATE INDEX procurements_requester_status_idx ON procurements(pengusul_id,status,created_at DESC);
CREATE TRIGGER procurements_updated BEFORE UPDATE ON procurements FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TABLE procurement_items (
 id bigserial PRIMARY KEY, procurement_id bigint NOT NULL REFERENCES procurements(id),
 jenis text NOT NULL CHECK(jenis IN ('ASET','BAHAN')), nama_barang text NOT NULL,
 category_id bigint REFERENCES asset_categories(id), spesifikasi text NOT NULL DEFAULT '', satuan text NOT NULL,
 jumlah_diusulkan integer NOT NULL CHECK(jumlah_diusulkan BETWEEN 1 AND 100000),
 jumlah_disetujui integer CHECK(jumlah_disetujui>=0 AND jumlah_disetujui<=jumlah_diusulkan),
 jumlah_diterima integer NOT NULL DEFAULT 0 CHECK(jumlah_diterima>=0 AND jumlah_diterima<=coalesce(jumlah_disetujui,jumlah_diusulkan)),
 estimasi_harga_satuan numeric(15,2) NOT NULL CHECK(estimasi_harga_satuan>=0), keterangan text,
 CHECK(jenis<>'ASET' OR category_id IS NOT NULL)
);
CREATE INDEX procurement_items_order_idx ON procurement_items(procurement_id,id);
CREATE TABLE procurement_attachments (
 id bigserial PRIMARY KEY, procurement_id bigint NOT NULL REFERENCES procurements(id),
 file_id bigint NOT NULL UNIQUE REFERENCES stored_files(id), nama_berkas text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), created_by bigint REFERENCES users(id)
);
CREATE TABLE procurement_receipts (
 id bigserial PRIMARY KEY, procurement_id bigint NOT NULL REFERENCES procurements(id), tanggal_terima date NOT NULL,
 nomor_dokumen text NOT NULL, diterima_oleh bigint NOT NULL REFERENCES users(id), catatan text,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX procurement_receipts_order_idx ON procurement_receipts(procurement_id,id);
CREATE TABLE procurement_receipt_items (
 id bigserial PRIMARY KEY, receipt_id bigint NOT NULL REFERENCES procurement_receipts(id),
 item_id bigint NOT NULL REFERENCES procurement_items(id), jumlah integer NOT NULL CHECK(jumlah BETWEEN 1 AND 500),
 status text NOT NULL CHECK(status IN ('DITERIMA','DITOLAK_SAAT_PENERIMAAN')), alasan text,
 CHECK(status<>'DITOLAK_SAAT_PENERIMAAN' OR length(trim(alasan))>0), UNIQUE(receipt_id,item_id)
);
CREATE TABLE procurement_receipt_files (
 id bigserial PRIMARY KEY, receipt_id bigint NOT NULL REFERENCES procurement_receipts(id),
 receipt_item_id bigint REFERENCES procurement_receipt_items(id), file_id bigint NOT NULL UNIQUE REFERENCES stored_files(id),
 nama_berkas text NOT NULL, jenis asset_document_type NOT NULL DEFAULT 'LAINNYA',
 document_id bigint REFERENCES asset_documents(id)
);
CREATE TABLE procurement_receipt_assets (
 receipt_item_id bigint NOT NULL REFERENCES procurement_receipt_items(id), asset_id bigint NOT NULL UNIQUE REFERENCES assets(id),
 PRIMARY KEY(receipt_item_id,asset_id)
);
-- Old manual/imported assets retain NULL; NOT VALID does not rewrite old rows.
ALTER TABLE assets ADD CONSTRAINT assets_procurement_fk FOREIGN KEY(procurement_id) REFERENCES procurements(id) NOT VALID;
-- migrate:down
ALTER TABLE assets DROP CONSTRAINT assets_procurement_fk;
DROP TABLE procurement_receipt_assets;
DROP TABLE procurement_receipt_files;
DROP TABLE procurement_receipt_items;
DROP TABLE procurement_receipts;
DROP TABLE procurement_attachments;
DROP TABLE procurement_items;
DROP TABLE procurements;
ALTER TABLE approval_steps DROP COLUMN rincian_keputusan;
-- PostgreSQL enum removal requires rebuild; preserve every prior owner type.
ALTER TABLE stored_files ALTER COLUMN owner_type TYPE text USING owner_type::text;
UPDATE stored_files SET owner_type='ASSET_DOCUMENT',owner_id=NULL WHERE owner_type IN ('PROCUREMENT_ATTACHMENT','PROCUREMENT_RECEIPT_DOCUMENT','PROCUREMENT_REJECTION_PHOTO');
DROP TYPE file_owner_type;
CREATE TYPE file_owner_type AS ENUM ('ASSET_DOCUMENT','ASSET_PHOTO','USER_PHOTO','HANDOVER_PHOTO','DAMAGE_PHOTO','WORK_ORDER_PHOTO','STOCKTAKE_PHOTO','ASSET_MOVEMENT_DOCUMENT','STOCKTAKE_REPORT');
ALTER TABLE stored_files ALTER COLUMN owner_type TYPE file_owner_type USING owner_type::file_owner_type;
