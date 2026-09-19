-- 0017 — Unit kerja: `work_units`, `users.work_unit_id`, dan fungsi pemetaan
-- `map_users_unit_kerja()` (Lampiran E.3, WU-01, WU-02, SDD-05 §4.7c).
--
-- Pola expand -> migrate (CD-04, DELIVERY-PLAN §6). `users.unit_kerja` (teks
-- bebas) SENGAJA tetap ada — hanya berhenti ditulis kode. `contract` (menghapus
-- kolom itu) dijadwalkan `PR-08-11`, bukan di sini.
--
-- `work_units` adalah entitas domain milik Administrator, sehingga memakai
-- kolom baku SDD-05 §4.2. `set_updated_at()` sudah dibuat `0012`.
--
-- Cakupan PR-01-12 tanpa endpoint `work_units` (keputusan 28 log phase-01):
-- PRD belum mendaftarkan satu pun; master diisi lewat jalur di luar aplikasi
-- sampai ada.

-- migrate:up

-- Himpunan tertutup -> native enum berkode huruf besar (SDD-DB-02), terdaftar
-- di PRD Bab 11.3.
CREATE TYPE work_unit_type   AS ENUM ('MANAJEMEN', 'MATA_PELAJARAN', 'TATA_USAHA', 'EKSTRAKURIKULER', 'KELAS');
CREATE TYPE work_unit_status AS ENUM ('AKTIF', 'NONAKTIF');

CREATE TABLE work_units (
    id             bigserial        PRIMARY KEY,
    nama           text             NOT NULL,
    kode           text             NOT NULL,
    jenis          work_unit_type   NOT NULL,
    kepala_unit_id bigint           REFERENCES users(id),
    -- Unit baru lahir AKTIF; tidak ada aturan PRD yang menahannya (bandingkan
    -- `users.status`, SL-06).
    status         work_unit_status NOT NULL DEFAULT 'AKTIF',
    created_at     timestamptz      NOT NULL DEFAULT now(),
    updated_at     timestamptz      NOT NULL DEFAULT now(),
    created_by     bigint           REFERENCES users(id),
    updated_by     bigint           REFERENCES users(id),
    CONSTRAINT work_units_nama_terisi CHECK (btrim(nama) <> ''),
    CONSTRAINT work_units_kode_terisi CHECK (btrim(kode) <> '')
);

-- Keunikan TANPA memandang huruf besar-kecil dan spasi tepi. Pemetaan teks lama
-- (`map_users_unit_kerja`) dan impor pengguna (`kode_unit_kerja`, E.5.2)
-- mencocokkan dengan normalisasi itu; tanpa keunikan yang sama, satu teks dapat
-- cocok dengan dua unit dan pemetaannya menjadi tebakan.
CREATE UNIQUE INDEX work_units_kode_uq ON work_units (lower(btrim(kode)));
CREATE UNIQUE INDEX work_units_nama_uq ON work_units (lower(btrim(nama)));

CREATE TRIGGER work_units_set_updated_at
    BEFORE UPDATE ON work_units
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- WU-02: tanpa ON DELETE apa pun -> RESTRICT. Unit yang masih dirujuk pengguna
-- tidak dapat dihapus, hanya dinonaktifkan (`status`). Lebih ketat dari "pengguna
-- AKTIF": pengguna nonaktif tidak kehilangan unitnya diam-diam.
ALTER TABLE users ADD COLUMN work_unit_id bigint REFERENCES work_units(id);
CREATE INDEX users_work_unit_id_idx ON users (work_unit_id);

-- Tahap MIGRATE (WU-01): memetakan teks bebas `users.unit_kerja` ke master.
--
-- Idempoten dan dapat dijalankan ulang setelah Administrator mengisi master:
-- `work_units` lahir KOSONG, jadi pemetaan saat migration hanyalah no-op pada
-- basis data yang belum memuat pengguna. Aturannya tanpa penebakan (WU-01,
-- risiko `phase-01.md` §10):
--   - cocok = teks lama SAMA dengan `nama` ATAU `kode` unit (huruf besar-kecil dan
--     spasi tepi diabaikan);
--   - hanya diisi bila cocok dengan TEPAT SATU unit — cocok ganda dibiarkan;
--   - `work_unit_id` yang sudah terisi tidak pernah ditimpa.
-- Mengembalikan yang TAK TERPETAKAN beserta jumlah penggunanya — itulah laporannya.
CREATE FUNCTION map_users_unit_kerja()
RETURNS TABLE (unit_kerja text, jumlah_pengguna bigint)
LANGUAGE plpgsql AS $$
DECLARE
    tak_terpetakan bigint;
BEGIN
    WITH kandidat AS (
        SELECT u.id AS user_id, array_agg(DISTINCT wu.id) AS unit_ids
          FROM users u
          JOIN work_units wu
            ON lower(btrim(u.unit_kerja)) IN (lower(btrim(wu.nama)), lower(btrim(wu.kode)))
         WHERE u.work_unit_id IS NULL
           AND u.unit_kerja IS NOT NULL
         GROUP BY u.id
    )
    UPDATE users u
       SET work_unit_id = k.unit_ids[1]
      FROM kandidat k
     WHERE u.id = k.user_id
       AND cardinality(k.unit_ids) = 1;

    SELECT count(*) INTO tak_terpetakan
      FROM users u
     WHERE u.work_unit_id IS NULL AND btrim(coalesce(u.unit_kerja, '')) <> '';
    IF tak_terpetakan > 0 THEN
        RAISE NOTICE '% pengguna belum terpetakan ke work_units (jalankan ulang map_users_unit_kerja() setelah master terisi).', tak_terpetakan;
    END IF;

    RETURN QUERY
        SELECT u.unit_kerja, count(*)
          FROM users u
         WHERE u.work_unit_id IS NULL AND btrim(coalesce(u.unit_kerja, '')) <> ''
         GROUP BY u.unit_kerja
         ORDER BY 2 DESC, 1;
END
$$;

-- Dijalankan sekali saat migration (keluarannya dibuang; NOTICE yang melaporkan).
SELECT * FROM map_users_unit_kerja();

-- migrate:down
DROP FUNCTION IF EXISTS map_users_unit_kerja();
DROP INDEX IF EXISTS users_work_unit_id_idx;
ALTER TABLE users DROP COLUMN IF EXISTS work_unit_id;
DROP TABLE IF EXISTS work_units;
DROP TYPE IF EXISTS work_unit_status;
DROP TYPE IF EXISTS work_unit_type;
