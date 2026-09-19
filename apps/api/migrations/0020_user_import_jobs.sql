-- 0020 — Pekerjaan impor pengguna: `user_import_jobs` (IMPT-02, IMPT-03,
-- IMPT-04, SDD-DB-22, SDD-05 §4.7f).
--
-- Migration `expand` murni: satu tipe enum dan satu tabel baru; tidak ada
-- tabel lama yang diubah. Setiap impor — sinkron maupun asinkron — dicatat
-- di sini: baris inilah jangkar idempotensi hash-berkas (IMPT-03) dan sumber
-- laporan per baris yang dapat diambil ulang (IMPT-02).
--
-- Entitas domain milik Administrator: kolom baku SDD-05 §4.2.
-- `set_updated_at()` sudah dibuat `0012`.

-- migrate:up

CREATE TYPE user_import_status AS ENUM ('MENUNGGU', 'BERJALAN', 'SELESAI', 'GAGAL');

CREATE TABLE user_import_jobs (
    id              bigserial          PRIMARY KEY,
    -- SHA-256 heksadesimal isi berkas (IMPT-03).
    file_hash       char(64)           NOT NULL,
    nama_berkas     varchar(255)       NOT NULL,
    status          user_import_status NOT NULL,
    total_baris     integer            NOT NULL,
    -- Titik lanjut pekerjaan: baris ke-n sudah diproses bila n <= baris_terproses.
    baris_terproses integer            NOT NULL DEFAULT 0,
    sukses          integer            NOT NULL DEFAULT 0,
    gagal           integer            NOT NULL DEFAULT 0,
    -- Hanya baris yang GAGAL: [{ "baris": 7, "email": "…", "pesan": "…" }].
    -- Baris sukses cukup terhitung di `sukses` (IMPT-02 hanya menuntut alasan galat).
    laporan_gagal   jsonb              NOT NULL DEFAULT '[]'::jsonb,
    -- Isi berkas hanya selama menunggu diproses worker; dikosongkan begitu
    -- selesai (DP-03) — ia memuat NIS/NIP dan email pengguna.
    berkas          bytea,
    -- Alasan pekerjaan berhenti total (status GAGAL), bukan kegagalan per baris.
    pesan_galat     text,
    selesai_pada    timestamptz,
    created_at      timestamptz        NOT NULL DEFAULT now(),
    updated_at      timestamptz        NOT NULL DEFAULT now(),
    created_by      bigint             REFERENCES users(id),
    updated_by      bigint             REFERENCES users(id),
    CONSTRAINT user_import_jobs_hitungan_wajar CHECK (
        total_baris >= 0
        AND baris_terproses BETWEEN 0 AND total_baris
        AND sukses >= 0
        AND gagal >= 0
        AND sukses + gagal <= baris_terproses
    ),
    CONSTRAINT user_import_jobs_laporan_larik CHECK (jsonb_typeof(laporan_gagal) = 'array')
);

CREATE TRIGGER user_import_jobs_set_updated_at
    BEFORE UPDATE ON user_import_jobs
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Pencarian idempotensi: hash yang sama dalam 24 jam terakhir (IMPT-03).
CREATE INDEX user_import_jobs_hash_idx ON user_import_jobs (file_hash, created_at DESC);
-- FK menuju users.
CREATE INDEX user_import_jobs_created_by_idx ON user_import_jobs (created_by);

-- migrate:down
DROP TABLE IF EXISTS user_import_jobs;
DROP TYPE IF EXISTS user_import_status;
