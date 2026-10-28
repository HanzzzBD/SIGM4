-- 0004 — Kalender kerja: work_days + holidays (Lampiran E.2, CAL-01).
--
-- Dasar BusinessCalendarService (SDD-APR-06). Satu definisi hari kerja untuk
-- seluruh sistem: SLA persetujuan (SC-03), SLA tindak lanjut kerusakan (SC-07),
-- dan target work order membacanya dari sini — bukan menghitung sendiri.
--
-- `holidays` sengaja TANPA academic_year_id. Kolom itu ditambahkan PR-01-11
-- bersama academic_years sebagai migration expand: hari libur nasional tidak
-- intrinsik milik satu tahun ajaran, dan Phase 00 sudah membutuhkan tabelnya.
--
-- Keduanya master data acuan, jadi dikecualikan dari kolom baku SDD-05 §4.2
-- secara eksplisit — pengecualian yang §4.2 sebut namanya.

-- migrate:up

-- Jenis hari libur (Lampiran E.2). Native enum berkode huruf besar (SDD-DB-02):
-- himpunan tertutup, dan aturan itu berlaku bagi SETIAP himpunan nilai tetap,
-- bukan hanya yang terdaftar Bab 11.3.
CREATE TYPE holiday_type AS ENUM ('NASIONAL', 'SEKOLAH', 'CUTI_BERSAMA');

-- Hari kerja pekanan. `hari` mengikuti penomoran ISO-8601 lewat EXTRACT(ISODOW):
-- 1 = Senin … 7 = Minggu. Bawaan Senin–Sabtu aktif di-seed PR-00-16.
CREATE TABLE work_days (
    hari  smallint PRIMARY KEY CHECK (hari BETWEEN 1 AND 7),
    aktif boolean  NOT NULL DEFAULT true
);

CREATE TABLE holidays (
    id      bigserial    PRIMARY KEY,
    tanggal date         NOT NULL,
    nama    text         NOT NULL,
    jenis   holiday_type NOT NULL,
    -- Satu tanggal tidak dapat menjadi dua hari libur. Tanpa ini, satu libur
    -- yang tercatat dua kali akan terhitung dua kali oleh kalender.
    CONSTRAINT holidays_tanggal_uq UNIQUE (tanggal)
);

-- Kalender selalu dibaca sebagai rentang tanggal, tidak pernah per baris.
CREATE INDEX holidays_tanggal_idx ON holidays (tanggal);

-- migrate:down
DROP TABLE IF EXISTS holidays;
DROP TABLE IF EXISTS work_days;
DROP TYPE IF EXISTS holiday_type;
