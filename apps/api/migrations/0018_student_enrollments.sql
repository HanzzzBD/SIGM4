-- 0018 — Kelas siswa per tahun ajaran: `student_enrollments` (Lampiran E.4,
-- SL-01, SL-02, SL-03, SDD-DB-20, SDD-05 §4.7d).
--
-- Migration `expand` murni: satu tabel baru. `users` tidak diubah — kelas
-- adalah data per tahun ajaran, bukan atribut permanen akun (SL-01).
--
-- Entitas domain milik Administrator: kolom baku SDD-05 §4.2.
-- `set_updated_at()` sudah dibuat `0012`.

-- migrate:up

CREATE TABLE student_enrollments (
    id               bigserial   PRIMARY KEY,
    user_id          bigint      NOT NULL REFERENCES users(id),
    academic_year_id bigint      NOT NULL REFERENCES academic_years(id),
    -- Unit kerja berjenis KELAS dan aktif: diperiksa service (lintas tabel).
    kelas_id         bigint      NOT NULL REFERENCES work_units(id),
    -- Ditandai lulus pada tahun ajaran ini (SL-02). Akun baru dinonaktifkan
    -- setelah `academic_years.tanggal_selesai` lewat (SL-03), bukan seketika.
    lulus            boolean     NOT NULL DEFAULT false,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    created_by       bigint      REFERENCES users(id),
    updated_by       bigint      REFERENCES users(id),
    -- SL-01: satu kelas per siswa per tahun ajaran.
    CONSTRAINT student_enrollments_siswa_tahun_uq UNIQUE (user_id, academic_year_id)
);

CREATE TRIGGER student_enrollments_set_updated_at
    BEFORE UPDATE ON student_enrollments
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Pelaporan per kelas, dan FK menuju work_units.
CREATE INDEX student_enrollments_kelas_id_idx ON student_enrollments (kelas_id);
-- Pekerjaan kelulusan hanya membaca baris bertanda lulus (SL-03).
CREATE INDEX student_enrollments_lulus_idx ON student_enrollments (academic_year_id) WHERE lulus;

-- migrate:down
DROP TABLE IF EXISTS student_enrollments;
