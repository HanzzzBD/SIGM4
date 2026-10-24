-- PR-05-18/21: expand receipts and explicit adjustments; ledger remains immutable.
-- migrate:up
ALTER TYPE file_owner_type ADD VALUE IF NOT EXISTS 'MATERIAL_RECEIPT_DOCUMENT';
ALTER TABLE procurement_items ADD COLUMN material_id bigint REFERENCES materials(id);
ALTER TABLE procurement_items ADD COLUMN material_satuan_id bigint REFERENCES material_units(id);
CREATE TABLE material_receipts (
 id bigserial PRIMARY KEY, material_id bigint NOT NULL REFERENCES materials(id), room_id bigint NOT NULL REFERENCES rooms(id),
 jumlah integer NOT NULL CHECK(jumlah>0), tanggal_terima date NOT NULL, nomor_dokumen text NOT NULL CHECK(length(trim(nomor_dokumen)) BETWEEN 1 AND 200),
 catatan text, transaction_id bigint UNIQUE REFERENCES material_transactions(id),
 created_at timestamptz NOT NULL, created_by bigint NOT NULL REFERENCES users(id)
);
CREATE TABLE material_receipt_files (
 receipt_id bigint NOT NULL REFERENCES material_receipts(id), file_id bigint NOT NULL UNIQUE REFERENCES stored_files(id),
 nama_berkas text NOT NULL, PRIMARY KEY(receipt_id,file_id)
);
CREATE TABLE procurement_receipt_materials (
 receipt_item_id bigint PRIMARY KEY REFERENCES procurement_receipt_items(id), material_id bigint NOT NULL REFERENCES materials(id),
 room_id bigint NOT NULL REFERENCES rooms(id), transaction_id bigint NOT NULL UNIQUE REFERENCES material_transactions(id)
);
CREATE TABLE material_adjustments (
 id bigserial PRIMARY KEY, material_id bigint NOT NULL REFERENCES materials(id), room_id bigint NOT NULL REFERENCES rooms(id),
 arah text NOT NULL CHECK(arah IN ('TAMBAH','KURANG')), jumlah integer NOT NULL CHECK(jumlah>0),
 alasan text NOT NULL CHECK(length(trim(alasan)) BETWEEN 1 AND 2000), transaction_id bigint UNIQUE REFERENCES material_transactions(id),
 created_at timestamptz NOT NULL, created_by bigint NOT NULL REFERENCES users(id)
);
CREATE INDEX material_receipts_material_idx ON material_receipts(material_id,id DESC);
-- migrate:down
DROP TABLE material_adjustments;
DROP TABLE procurement_receipt_materials;
DROP TABLE material_receipt_files;
DROP TABLE material_receipts;
ALTER TABLE procurement_items DROP COLUMN material_id;
ALTER TABLE procurement_items DROP COLUMN material_satuan_id;
-- Enum retained, in line with previous file-owner expand migrations.
