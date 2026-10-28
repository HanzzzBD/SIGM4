-- 0026 — Skema `asset_categories`, `assets`, `asset_condition_history`
-- (PR-02-10, FR-04.1, SDD-DB-04). `asset_condition`, `asset_status`, dan
-- `asset_acquisition_source` sudah dibuat `0002`; berkas ini hanya membuat
-- TABELnya.
--
-- `set_updated_at()` sudah dibuat `0012` (PR-01-01) dan dipakai bersama.
--
-- Ruang lingkup PR ini SENGAJA hanya skema — CRUD, penomoran kode aset, dan
-- perubahan kondisi masing-masing milik PR-02-11/PR-02-13. `asset_movements`
-- (mutasi lokasi, PR-02-14) dan `asset_photos` (`users.foto_file_id`,
-- PR-03-04) tidak dibuat di sini.

-- migrate:up

CREATE TABLE asset_categories (
    id                       bigserial   PRIMARY KEY,
    -- Self-referencing: minimal dua tingkat (induk-anak), FR-04.5 AC.
    parent_id                bigint      REFERENCES asset_categories(id),
    nama                     text        NOT NULL,
    kode                     text        NOT NULL,
    umur_teknis_tahun        integer,
    interval_preventif_hari  integer,
    created_at               timestamptz NOT NULL DEFAULT now(),
    updated_at               timestamptz NOT NULL DEFAULT now(),
    created_by               bigint      REFERENCES users(id),
    updated_by               bigint      REFERENCES users(id),
    -- FR-04.5 A1: kode kategori duplikat ditolak.
    CONSTRAINT asset_categories_kode_uq UNIQUE (kode),
    CONSTRAINT asset_categories_umur_teknis_positif
        CHECK (umur_teknis_tahun IS NULL OR umur_teknis_tahun > 0),
    CONSTRAINT asset_categories_interval_preventif_positif
        CHECK (interval_preventif_hari IS NULL OR interval_preventif_hari > 0)
);

CREATE INDEX asset_categories_parent_id_idx ON asset_categories (parent_id);

CREATE TRIGGER asset_categories_set_updated_at
    BEFORE UPDATE ON asset_categories
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE assets (
    id                    bigserial                PRIMARY KEY,
    -- FR-05.1/FR-05.2 A3 (M-05 QR): pengenal publik tidak dapat ditebak —
    -- satu-satunya pengecualian SDD-DB-01 terhadap kunci bigserial.
    uuid                  uuid                      NOT NULL DEFAULT gen_random_uuid(),
    -- Format & keunikan ditegakkan PR-02-11 (FR-20.1); kolom ini hanya
    -- menyimpan hasilnya. BR-002: unik sistem-wide termasuk aset terhapus.
    kode_barang           text                      NOT NULL,
    nama                  text                      NOT NULL,
    category_id           bigint                    NOT NULL REFERENCES asset_categories(id),
    merek                 text,
    model                 text,
    nomor_seri            text,
    tahun_perolehan       integer                   NOT NULL,
    sumber_perolehan      asset_acquisition_source  NOT NULL,
    nilai_perolehan       numeric(14,2),
    -- BR-009: tepat satu lokasi penempatan aktif. "Aktif" diperiksa service
    -- (pola SDD-05 §4.7c untuk work_unit_id), bukan skema.
    room_id               bigint                    NOT NULL REFERENCES rooms(id),
    kondisi               asset_condition           NOT NULL,
    -- FR-04.1 langkah 5: status awal selalu Tersedia.
    status                asset_status              NOT NULL DEFAULT 'TERSEDIA',
    dapat_dipinjam        boolean                   NOT NULL DEFAULT true,
    boleh_dipinjam_siswa  boolean                   NOT NULL DEFAULT false,
    penanggung_jawab_id   bigint                    REFERENCES users(id),
    -- FR-05.1 langkah 5: ditandai true setelah label QR dicetak & ditempel.
    qr_terpasang          boolean                   NOT NULL DEFAULT false,
    -- BR-011: aset dari pengadaan menyimpan referensi asalnya. NULLABLE dan
    -- SENGAJA TANPA FK aktif — tabel procurements milik M-14 belum ada;
    -- FK ditambahkan migration M-14 sendiri (expand, SDD-DB-08).
    procurement_id        bigint,
    -- BR-008: tidak ada penghapusan permanen, hanya dihapuskan (M-21) dengan
    -- alasan tercatat di modul pemiliknya. SDD-DB-04: kolom eksplisit, bukan
    -- `deleted_at` generik.
    dihapuskan            boolean                   NOT NULL DEFAULT false,
    tanggal_penghapusan   timestamptz,
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at            timestamptz NOT NULL DEFAULT now(),
    created_by            bigint      REFERENCES users(id),
    updated_by            bigint      REFERENCES users(id),
    -- conventions.md E.5.1: boleh_dipinjam_siswa hanya sah bila dapat_dipinjam.
    CONSTRAINT assets_boleh_dipinjam_siswa_wajar
        CHECK (NOT boleh_dipinjam_siswa OR dapat_dipinjam)
);

-- SDD-05 §4.3 (pola persis): BR-002 unik sistem-wide, BR-003 unik hanya bila diisi.
CREATE UNIQUE INDEX assets_kode_barang_uq ON assets (kode_barang);
CREATE UNIQUE INDEX assets_nomor_seri_uq ON assets (nomor_seri) WHERE nomor_seri IS NOT NULL;
CREATE UNIQUE INDEX assets_uuid_uq ON assets (uuid);
CREATE INDEX assets_category_id_idx ON assets (category_id);
CREATE INDEX assets_room_id_idx ON assets (room_id);
-- AV-02 (availability-concurrency.md, SDD-14 §4.2): indeks kandidat aset yang
-- dapat dipinjam/direservasi — kolom yang selalu bersama pada kueri kandidat.
CREATE INDEX assets_kandidat_pinjam_idx
    ON assets (category_id, status, kondisi, dapat_dipinjam, boleh_dipinjam_siswa);

CREATE TRIGGER assets_set_updated_at
    BEFORE UPDATE ON assets
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Append-only (SDD-05 §4.2 pola material_transactions): tanpa kolom baku,
-- kolom waktu bermakna sendiri (diubah_pada, bukan created_at).
CREATE TABLE asset_condition_history (
    id              bigserial       PRIMARY KEY,
    asset_id        bigint          NOT NULL REFERENCES assets(id),
    kondisi_lama    asset_condition NOT NULL,
    kondisi_baru    asset_condition NOT NULL,
    -- BR-007: setiap perubahan kondisi wajib menyertakan alasan.
    alasan          text            NOT NULL,
    -- FR-04.3 A2: referensi opsional ke sesi stock opname / berita acara
    -- kehilangan (BR-012). Polimorfik seperti material_transactions —
    -- tanpa FK, jenis+id menunjuk tabel berbeda tergantung `referensi_jenis`.
    referensi_jenis text,
    referensi_id    bigint,
    diubah_oleh     bigint          NOT NULL REFERENCES users(id),
    diubah_pada     timestamptz     NOT NULL
);

-- FR-04.3 AC: riwayat ditampilkan kronologis pada halaman detail aset.
CREATE INDEX asset_condition_history_asset_id_idx
    ON asset_condition_history (asset_id, diubah_pada DESC);

-- migrate:down
DROP TABLE IF EXISTS asset_condition_history;
DROP TABLE IF EXISTS assets;
DROP TABLE IF EXISTS asset_categories;
