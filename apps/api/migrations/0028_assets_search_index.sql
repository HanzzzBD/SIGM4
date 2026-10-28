-- 0028 — Indeks pencarian teks aset (PR-02-12, FR-04.2, NFR-P-05, SDD-14 §4.2).
--
-- `assets(kode_barang)`/`assets(nomor_seri)` sudah ber-indeks unik sejak 0026
-- (BR-002/BR-003) dan cukup bagi pencarian eksak/awalan. Yang belum ada adalah
-- "indeks teks pada nama+merek" yang dirangkum SDD-14 §4.2 — pencarian
-- substring (`ILIKE '%...%'`) pada kolom itu tidak dapat memakai B-tree biasa.

-- migrate:up
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX assets_nama_trgm_idx ON assets USING gin (nama gin_trgm_ops);
CREATE INDEX assets_merek_trgm_idx ON assets USING gin (merek gin_trgm_ops);

-- migrate:down
DROP INDEX IF EXISTS assets_merek_trgm_idx;
DROP INDEX IF EXISTS assets_nama_trgm_idx;
DROP EXTENSION IF EXISTS pg_trgm;
