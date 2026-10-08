-- Pendahulu PR-02-38: expand, SDD-DB-24, IMPT-02/03/04, BR-001.
-- Dipisahkan dari fitur sesuai BRANCHING §5; tanpa backfill/contract.
-- migrate:up
CREATE TYPE asset_import_status AS ENUM ('MENUNGGU', 'BERJALAN', 'SELESAI', 'GAGAL');
CREATE TABLE asset_import_jobs (
    id bigserial PRIMARY KEY,
    file_hash char(64) NOT NULL,
    nama_berkas varchar(255) NOT NULL,
    status asset_import_status NOT NULL,
    total_baris integer NOT NULL,
    baris_terproses integer NOT NULL DEFAULT 0,
    sukses integer NOT NULL DEFAULT 0,
    gagal integer NOT NULL DEFAULT 0,
    unit_dibuat integer NOT NULL DEFAULT 0,
    laporan_gagal jsonb NOT NULL DEFAULT '[]'::jsonb,
    berkas bytea,
    pesan_galat text,
    selesai_pada timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by bigint NOT NULL REFERENCES users(id),
    updated_by bigint REFERENCES users(id),
    CONSTRAINT asset_import_jobs_counts CHECK (
        total_baris > 0 AND baris_terproses BETWEEN 0 AND total_baris
        AND sukses >= 0 AND gagal >= 0 AND sukses + gagal = baris_terproses
        AND unit_dibuat >= sukses AND unit_dibuat <= sukses * 500
    ),
    CONSTRAINT asset_import_jobs_report_array CHECK (jsonb_typeof(laporan_gagal) = 'array'),
    CONSTRAINT asset_import_jobs_terminal CHECK (
        (status IN ('MENUNGGU', 'BERJALAN') AND selesai_pada IS NULL)
        OR (status IN ('SELESAI', 'GAGAL') AND selesai_pada IS NOT NULL AND berkas IS NULL)
    ),
    CONSTRAINT asset_import_jobs_complete CHECK (status <> 'SELESAI' OR baris_terproses = total_baris)
);
CREATE TRIGGER asset_import_jobs_set_updated_at BEFORE UPDATE ON asset_import_jobs
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX asset_import_jobs_replay_idx ON asset_import_jobs (created_by, file_hash, created_at DESC);
CREATE INDEX asset_import_jobs_updated_by_idx ON asset_import_jobs (updated_by);
ALTER TABLE assets ADD COLUMN import_job_id bigint REFERENCES asset_import_jobs(id);
CREATE INDEX assets_import_job_id_idx ON assets (import_job_id) WHERE import_job_id IS NOT NULL;

-- migrate:down
-- Revert kode konsumen sebelum down; record aset tetap dipertahankan.
ALTER TABLE assets DROP COLUMN IF EXISTS import_job_id;
DROP TABLE IF EXISTS asset_import_jobs;
DROP TYPE IF EXISTS asset_import_status;
