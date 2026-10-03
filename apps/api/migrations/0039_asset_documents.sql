-- 0039 — Dokumen aset (PR-03-06; FR-06.1, m06-documents.md §8, keputusan 9 log phase-03).
-- Expand murni: dua tabel baru. Satu dokumen = satu berkas `stored_files` (SDD-FS-02: entitas
-- merujuk registri, bukan menyimpan path/ukuran/mime sendiri) dan dapat berlaku untuk banyak aset
-- lewat tabel tautan (FR-06.1 A3, keputusan 9b). Soft delete memakai kolom bermakna per entitas
-- (SDD-DB-04): dokumen `dihapus`, tautan `aktif` (SDD-09 §4.6 — objek & baris dipertahankan).

-- migrate:up

CREATE TABLE asset_documents (
    id              bigserial           PRIMARY KEY,
    -- Satu berkas paling banyak satu dokumen; pemiliknya di stored_files = dokumen ini.
    file_id         bigint              NOT NULL UNIQUE REFERENCES stored_files(id),
    jenis           asset_document_type NOT NULL,
    -- Nama asli untuk tampilan saja — tidak pernah masuk kunci objek (SDD-FS-06).
    nama_berkas     text                NOT NULL CHECK (length(nama_berkas) BETWEEN 1 AND 255),
    keterangan      text                CHECK (length(keterangan) <= 1000),
    -- FR-06.1 langkah 3: hanya dokumen GARANSI, dan keduanya wajib bagi GARANSI.
    garansi_mulai   date,
    garansi_selesai date,
    dihapus         boolean             NOT NULL DEFAULT false,
    dihapus_pada    timestamptz,
    dihapus_oleh    bigint              REFERENCES users(id),
    created_at      timestamptz         NOT NULL DEFAULT now(),
    updated_at      timestamptz         NOT NULL DEFAULT now(),
    created_by      bigint              REFERENCES users(id),
    updated_by      bigint              REFERENCES users(id),
    CONSTRAINT asset_documents_garansi_ck CHECK (
        (jenis = 'GARANSI' AND garansi_mulai IS NOT NULL AND garansi_selesai IS NOT NULL AND garansi_selesai >= garansi_mulai)
        OR (jenis <> 'GARANSI' AND garansi_mulai IS NULL AND garansi_selesai IS NULL)
    ),
    CONSTRAINT asset_documents_dihapus_ck CHECK (dihapus = (dihapus_pada IS NOT NULL))
);

CREATE TRIGGER asset_documents_set_updated_at
    BEFORE UPDATE ON asset_documents
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Pemantauan garansi (FR-06.1 Post Conditions) membaca garansi yang masih hidup.
CREATE INDEX asset_documents_garansi_idx ON asset_documents (garansi_selesai) WHERE jenis = 'GARANSI' AND NOT dihapus;

-- FR-06.1 A3: dokumen ↔ aset. Tautan dilepas, tidak dihapus — jejak aset mana yang pernah memakainya.
CREATE TABLE asset_document_links (
    id           bigserial   PRIMARY KEY,
    document_id  bigint      NOT NULL REFERENCES asset_documents(id),
    asset_id     bigint      NOT NULL REFERENCES assets(id),
    aktif        boolean     NOT NULL DEFAULT true,
    dilepas_pada timestamptz,
    dilepas_oleh bigint      REFERENCES users(id),
    created_at   timestamptz NOT NULL DEFAULT now(),
    created_by   bigint      REFERENCES users(id),
    CONSTRAINT asset_document_links_aktif_ck CHECK (aktif = (dilepas_pada IS NULL))
);

-- SDD-DB-05: paling banyak satu tautan AKTIF per pasangan; tautan lepas boleh berulang.
CREATE UNIQUE INDEX asset_document_links_aktif_uq ON asset_document_links (document_id, asset_id) WHERE aktif;
-- Tab Dokumen pada detail aset (FR-06.1 langkah 1).
CREATE INDEX asset_document_links_asset_idx ON asset_document_links (asset_id) WHERE aktif;

-- migrate:down
DROP TABLE IF EXISTS asset_document_links;
DROP TABLE IF EXISTS asset_documents;
