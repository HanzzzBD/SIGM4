-- 0016 — Kalender akademik: `academic_years`, `academic_terms`, dan
-- `holidays.academic_year_id` (Lampiran E.2, AC-YR-01, SDD-05 §4.7b, SDD-DB-18).
--
-- Migration `expand` murni: dua tabel baru + satu kolom NULLABLE pada `holidays`.
-- Tidak ada yang dihapus atau diubah bentuknya (CD-04).
--
-- Kedua tabel baru adalah entitas domain yang dikelola Administrator, sehingga
-- memakai kolom baku SDD-05 §4.2 (berbeda dari `holidays`/`work_days`, master
-- data acuan). `set_updated_at()` sudah dibuat `0012`.
--
-- Cakupan PR-01-11 hanya skema + invariant basis data (keputusan 27 log
-- phase-01): tidak ada endpoint — PRD belum mendaftarkan satu pun untuk
-- kalender akademik.

-- migrate:up

-- Nama semester (Lampiran E.2: "Ganjil/Genap"). Himpunan tertutup -> native
-- enum berkode huruf besar (SDD-DB-02), terdaftar di PRD Bab 11.3.
CREATE TYPE academic_term_name AS ENUM ('GANJIL', 'GENAP');

CREATE TABLE academic_years (
    id              bigserial   PRIMARY KEY,
    -- Mis. "2026/2027" (E.2). Formatnya tidak dikunci: PRD hanya memberi contoh.
    nama            text        NOT NULL,
    tanggal_mulai   date        NOT NULL,
    tanggal_selesai date        NOT NULL,
    is_active       boolean     NOT NULL DEFAULT false,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    created_by      bigint      REFERENCES users(id),
    updated_by      bigint      REFERENCES users(id),
    CONSTRAINT academic_years_nama_uq UNIQUE (nama),
    CONSTRAINT academic_years_nama_terisi CHECK (btrim(nama) <> ''),
    CONSTRAINT academic_years_rentang_urut CHECK (tanggal_mulai < tanggal_selesai),
    -- Dua tahun ajaran tidak boleh berbagi satu hari: "tahun ajaran berjalan"
    -- harus menunjuk tepat satu baris untuk tanggal mana pun (AC-YR-03).
    CONSTRAINT academic_years_tidak_beririsan
        EXCLUDE USING gist (daterange(tanggal_mulai, tanggal_selesai, '[]') WITH &&)
);

CREATE TRIGGER academic_years_set_updated_at
    BEFORE UPDATE ON academic_years
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- "Tepat satu tahun ajaran berstatus aktif" (E.2), bagian PALING-BANYAK-SATU:
-- partial unique index (SDD-DB-05) — satu baris bernilai true di tabel mana pun.
CREATE UNIQUE INDEX academic_years_satu_aktif_uq ON academic_years (is_active) WHERE is_active;

-- Bagian PALING-SEDIKIT-SATU: begitu ada tahun ajaran, salah satunya wajib
-- aktif (AC-YR-01). Tidak dapat berupa CHECK (lintas baris) dan tidak boleh
-- segera (pergantian aktif = dua UPDATE dalam satu transaksi, yang sesaat tanpa
-- tahun aktif) — karena itu constraint trigger DEFERRED, diperiksa saat COMMIT.
-- Tabel kosong sah: itulah keadaan instalasi awal sebelum tahun ajaran pertama.
CREATE FUNCTION academic_years_pastikan_ada_aktif() RETURNS trigger
    LANGUAGE plpgsql AS $$
BEGIN
    IF EXISTS (SELECT 1 FROM academic_years)
       AND NOT EXISTS (SELECT 1 FROM academic_years WHERE is_active) THEN
        RAISE EXCEPTION 'Tepat satu tahun ajaran harus aktif (AC-YR-01).'
            USING CONSTRAINT = 'academic_years_tepat_satu_aktif';
    END IF;
    RETURN NULL;
END
$$;

CREATE CONSTRAINT TRIGGER academic_years_tepat_satu_aktif
    AFTER INSERT OR UPDATE OR DELETE ON academic_years
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION academic_years_pastikan_ada_aktif();

CREATE TABLE academic_terms (
    id               bigserial          PRIMARY KEY,
    academic_year_id bigint             NOT NULL REFERENCES academic_years(id),
    nama             academic_term_name NOT NULL,
    tanggal_mulai    date               NOT NULL,
    tanggal_selesai  date               NOT NULL,
    created_at       timestamptz        NOT NULL DEFAULT now(),
    updated_at       timestamptz        NOT NULL DEFAULT now(),
    created_by       bigint             REFERENCES users(id),
    updated_by       bigint             REFERENCES users(id),
    -- Satu Ganjil dan satu Genap per tahun ajaran; juga indeks bagi FK di atas.
    CONSTRAINT academic_terms_nama_uq UNIQUE (academic_year_id, nama),
    CONSTRAINT academic_terms_rentang_urut CHECK (tanggal_mulai < tanggal_selesai),
    -- Semester dalam satu tahun ajaran tidak beririsan: filter "semester
    -- berjalan" (Bab 19.1, AC-YR-03) harus menunjuk satu baris.
    CONSTRAINT academic_terms_tidak_beririsan
        EXCLUDE USING gist (academic_year_id WITH =, daterange(tanggal_mulai, tanggal_selesai, '[]') WITH &&)
);

CREATE TRIGGER academic_terms_set_updated_at
    BEFORE UPDATE ON academic_terms
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Hari libur nasional tidak intrinsik milik satu tahun ajaran (0004), maka
-- kolomnya NULLABLE; tidak ada pengisian ulang baris lama.
ALTER TABLE holidays ADD COLUMN academic_year_id bigint REFERENCES academic_years(id);
CREATE INDEX holidays_academic_year_id_idx ON holidays (academic_year_id);

-- migrate:down
DROP INDEX IF EXISTS holidays_academic_year_id_idx;
ALTER TABLE holidays DROP COLUMN IF EXISTS academic_year_id;
DROP TABLE IF EXISTS academic_terms;
DROP TABLE IF EXISTS academic_years;
DROP FUNCTION IF EXISTS academic_years_pastikan_ada_aktif();
DROP TYPE IF EXISTS academic_term_name;
