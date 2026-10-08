-- Pendahulu PR-02-39: expand, FR-04.4 AC 3, SDD-DB-25, SDD-FS-12.
-- migrate:up
ALTER TYPE file_owner_type ADD VALUE 'ASSET_MOVEMENT_DOCUMENT';
CREATE TYPE asset_movement_document_status AS ENUM ('MENUNGGU', 'BERJALAN', 'SIAP', 'GAGAL');
CREATE TABLE asset_movement_documents (
    id bigserial PRIMARY KEY,
    snapshot jsonb NOT NULL,
    object_key text NOT NULL UNIQUE,
    status asset_movement_document_status NOT NULL DEFAULT 'MENUNGGU',
    file_id bigint UNIQUE REFERENCES stored_files(id),
    pesan_galat text,
    selesai_pada timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by bigint NOT NULL REFERENCES users(id),
    updated_by bigint REFERENCES users(id),
    CONSTRAINT asset_movement_documents_snapshot CHECK (
        jsonb_typeof(snapshot) = 'object' AND snapshot ? 'aset'
        AND jsonb_typeof(snapshot->'aset') = 'array'
        AND jsonb_array_length(snapshot->'aset') BETWEEN 1 AND 50
    ),
    CONSTRAINT asset_movement_documents_terminal CHECK (
        (status IN ('MENUNGGU','BERJALAN') AND file_id IS NULL AND selesai_pada IS NULL AND pesan_galat IS NULL)
        OR (status = 'SIAP' AND file_id IS NOT NULL AND selesai_pada IS NOT NULL AND pesan_galat IS NULL)
        OR (status = 'GAGAL' AND file_id IS NULL AND selesai_pada IS NOT NULL AND pesan_galat IS NOT NULL)
    )
);
CREATE INDEX asset_movement_documents_owner_idx ON asset_movement_documents (created_by, id DESC);
CREATE INDEX asset_movement_documents_updated_by_idx ON asset_movement_documents (updated_by);
CREATE TRIGGER asset_movement_documents_set_updated_at BEFORE UPDATE ON asset_movement_documents
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
ALTER TABLE asset_movements ADD COLUMN document_id bigint REFERENCES asset_movement_documents(id);
CREATE INDEX asset_movements_document_id_idx ON asset_movements (document_id) WHERE document_id IS NOT NULL;

-- migrate:down
-- Kembalikan kode konsumen dahulu. Aset dan riwayat mutasi dipertahankan.
ALTER TABLE asset_movements DROP COLUMN IF EXISTS document_id;
DROP TABLE IF EXISTS asset_movement_documents;
DROP TYPE IF EXISTS asset_movement_document_status;
-- Berkas keluaran menjadi yatim, bukan dokumen aset yang dapat ditautkan pengguna.
UPDATE stored_files SET owner_id = NULL WHERE owner_type::text = 'ASSET_MOVEMENT_DOCUMENT';
ALTER TABLE stored_files ALTER COLUMN owner_type TYPE text USING owner_type::text;
UPDATE stored_files SET owner_type = 'ASSET_DOCUMENT' WHERE owner_type = 'ASSET_MOVEMENT_DOCUMENT';
DROP TYPE IF EXISTS file_owner_type;
CREATE TYPE file_owner_type AS ENUM ('ASSET_DOCUMENT','ASSET_PHOTO','USER_PHOTO','HANDOVER_PHOTO','DAMAGE_PHOTO','WORK_ORDER_PHOTO','STOCKTAKE_PHOTO');
ALTER TABLE stored_files ALTER COLUMN owner_type TYPE file_owner_type USING owner_type::file_owner_type;
