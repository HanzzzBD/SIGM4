-- 0014 — Hierarki lokasi tiga tingkat: `buildings` -> `areas` -> `rooms`
-- (FR-03.1, BR-013, BR-014, SDD-05 §4.2).
--
-- `room_type` sudah dibuat `0002` (Phase 00, disiapkan lebih dulu untuk M-03).
-- `set_updated_at()` sudah dibuat `0012` (PR-01-01) dan dipakai bersama di sini,
-- tidak didefinisikan ulang.
--
-- `areas` SENGAJA tanpa kolom `status` — atribut modul (`m03-locations.md` §8)
-- hanya mendaftarkannya pada `buildings` dan `rooms`. Penonaktifan berjenjang
-- (BR-015, FR-03.1 A2/A3) beserta kolom/endpoint yang menyertainya adalah
-- `PR-01-06`; PR ini hanya membangun skema dan CRUD penciptaan/penyuntingan
-- dasar (`PUT /rooms/{id}` tanpa `status` — lihat `role_version`-nya sendiri,
-- keputusan log phase-01).

-- migrate:up

CREATE TYPE location_status AS ENUM ('AKTIF', 'NONAKTIF');

CREATE TABLE buildings (
    id         bigserial       PRIMARY KEY,
    nama       text            NOT NULL,
    kode       text            NOT NULL,
    keterangan text,
    -- Gedung baru lahir AKTIF; tidak ada aturan PRD yang menuntut nilai wajib
    -- dinyatakan eksplisit seperti `users.status` (SL-06).
    status     location_status NOT NULL DEFAULT 'AKTIF',
    created_at timestamptz     NOT NULL DEFAULT now(),
    updated_at timestamptz     NOT NULL DEFAULT now(),
    created_by bigint          REFERENCES users(id),
    updated_by bigint          REFERENCES users(id),
    -- BR-014: kode unik pada tingkat ini.
    CONSTRAINT buildings_kode_uq UNIQUE (kode)
);

CREATE TRIGGER buildings_set_updated_at
    BEFORE UPDATE ON buildings
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE areas (
    id          bigserial   PRIMARY KEY,
    building_id bigint      NOT NULL REFERENCES buildings(id),
    nama        text        NOT NULL,
    kode        text        NOT NULL,
    -- Nomor lantai; NULL bila area bukan lantai bernomor (mis. area luar ruang).
    lantai      integer,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    created_by  bigint      REFERENCES users(id),
    updated_by  bigint      REFERENCES users(id),
    -- BR-014: kode unik pada tingkat ini.
    CONSTRAINT areas_kode_uq UNIQUE (kode)
);

-- FR-03.2 dan penolakan hapus gedung berisi area (BR-015, milik PR-01-06).
CREATE INDEX areas_building_id_idx ON areas (building_id);

CREATE TRIGGER areas_set_updated_at
    BEFORE UPDATE ON areas
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE rooms (
    id                       bigserial       PRIMARY KEY,
    area_id                  bigint          NOT NULL REFERENCES areas(id),
    nama                     text            NOT NULL,
    kode                     text            NOT NULL,
    jenis                    room_type       NOT NULL,
    -- Opsional: ruangan non-reservasi (mis. Gudang) tidak selalu punya kapasitas orang.
    kapasitas                integer,
    penanggung_jawab_id      bigint          REFERENCES users(id),
    -- BR-016: hanya ruangan bertanda true yang muncul di modul Reservasi. Bawaan
    -- false — ruangan baru tidak otomatis reservable sampai dipilih eksplisit.
    dapat_direservasi        boolean         NOT NULL DEFAULT false,
    boleh_direservasi_siswa  boolean         NOT NULL DEFAULT false,
    status                   location_status NOT NULL DEFAULT 'AKTIF',
    created_at               timestamptz     NOT NULL DEFAULT now(),
    updated_at               timestamptz     NOT NULL DEFAULT now(),
    created_by               bigint          REFERENCES users(id),
    updated_by               bigint          REFERENCES users(id),
    -- BR-014: kode unik pada tingkat ini.
    CONSTRAINT rooms_kode_uq UNIQUE (kode),
    CONSTRAINT rooms_kapasitas_positif CHECK (kapasitas IS NULL OR kapasitas > 0)
);

-- FR-03.2 dan penolakan hapus area berisi ruangan (BR-015, milik PR-01-06).
CREATE INDEX rooms_area_id_idx ON rooms (area_id);

CREATE TRIGGER rooms_set_updated_at
    BEFORE UPDATE ON rooms
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- migrate:down
DROP TABLE IF EXISTS rooms;
DROP TABLE IF EXISTS areas;
DROP TABLE IF EXISTS buildings;
DROP TYPE IF EXISTS location_status;
