-- 0015 — Parameter sistem: `system_settings` + seed katalog awal (FR-20.1,
-- SDD-DB-10, SDD-DB-17, SDD-05 §4.7a).
--
-- Tiap baris mendeskripsikan dirinya sendiri (`tipe`, `nilai_bawaan`,
-- `nilai_min`/`nilai_maks`), sehingga validasi rentang membaca baris — bukan
-- daftar di kode — dan kunci baru cukup ditambahkan sebagai baris seed oleh PR
-- konsumennya. `set_updated_at()` sudah dibuat `0012`; `key` (bukan `id`) adalah
-- pengenal yang dirujuk kode, sehingga tabel ini tanpa `created_*` (§4.7a).

-- migrate:up

CREATE TYPE setting_type AS ENUM ('BILANGAN_BULAT', 'DESIMAL', 'BOOLEAN', 'TEKS');

CREATE TYPE setting_group AS ENUM (
    'IDENTITAS_SEKOLAH', 'KODE_ASET', 'PEMINJAMAN', 'DENDA', 'RESERVASI',
    'MAINTENANCE', 'BAHAN', 'NOTIFIKASI', 'KEAMANAN', 'CHATBOT_AI'
);

CREATE TABLE system_settings (
    key          text          PRIMARY KEY,
    kelompok     setting_group NOT NULL,
    tipe         setting_type  NOT NULL,
    value        jsonb         NOT NULL,
    nilai_bawaan jsonb         NOT NULL,
    nilai_min    numeric,
    nilai_maks   numeric,
    deskripsi    text          NOT NULL,
    updated_at   timestamptz   NOT NULL DEFAULT now(),
    -- NULL = nilai seed yang belum pernah diubah siapa pun.
    updated_by   bigint        REFERENCES users(id),
    CONSTRAINT system_settings_key_format CHECK (key ~ '^[a-z_]+\.[a-z0-9_]+$'),
    -- Bentuk `value`/`nilai_bawaan` dijaga basis data: baris yang salah bentuk
    -- tidak dapat tersimpan meski validasi service terlewat.
    CONSTRAINT system_settings_value_tipe CHECK (
        CASE tipe
            WHEN 'BILANGAN_BULAT' THEN jsonb_typeof(value) = 'number' AND jsonb_typeof(nilai_bawaan) = 'number'
            WHEN 'DESIMAL' THEN jsonb_typeof(value) = 'number' AND jsonb_typeof(nilai_bawaan) = 'number'
            WHEN 'BOOLEAN' THEN jsonb_typeof(value) = 'boolean' AND jsonb_typeof(nilai_bawaan) = 'boolean'
            WHEN 'TEKS'  THEN jsonb_typeof(value) = 'string' AND jsonb_typeof(nilai_bawaan) = 'string'
        END
    ),
    -- Rentang hanya bermakna bagi angka.
    CONSTRAINT system_settings_rentang_angka CHECK (
        (nilai_min IS NULL AND nilai_maks IS NULL) OR tipe IN ('BILANGAN_BULAT', 'DESIMAL')
    ),
    CONSTRAINT system_settings_rentang_urut CHECK (
        nilai_min IS NULL OR nilai_maks IS NULL OR nilai_min <= nilai_maks
    )
);

CREATE INDEX system_settings_kelompok_idx ON system_settings (kelompok);

CREATE TRIGGER system_settings_set_updated_at
    BEFORE UPDATE ON system_settings
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Katalog awal (SDD-05 §4.7a): hanya parameter yang nilai bawaannya tertulis di
-- FR-20.1. `DO NOTHING`, bukan `DO UPDATE`: nilai yang sudah diubah Administrator
-- tidak boleh ditimpa migrasi ulang.
INSERT INTO system_settings (key, kelompok, tipe, value, nilai_bawaan, nilai_min, nilai_maks, deskripsi) VALUES
    ('peminjaman.batas_perpanjangan', 'PEMINJAMAN', 'BILANGAN_BULAT', '1', '1', 0, 10,
     'Jumlah maksimum perpanjangan per peminjaman (FR-09.5).'),
    ('denda.cap_persen', 'DENDA', 'DESIMAL', '30', '30', 1, 100,
     'Batas maksimum denda keterlambatan per unit, sebagai persentase nilai perolehan unit (BR-028b).'),
    ('reservasi.horizon_hari', 'RESERVASI', 'BILANGAN_BULAT', '90', '90', 1, 365,
     'Horizon pemesanan: berapa hari ke depan reservasi boleh dibuat (BR-023c).'),
    ('reservasi.ttl_tentative_jam', 'RESERVASI', 'BILANGAN_BULAT', '48', '48', 1, 168,
     'Masa berlaku slot Tentative dalam jam, atau hingga H-1 waktu mulai mana yang lebih dulu (BR-023b).'),
    ('reservasi.kuota_tertunda_guru_staf', 'RESERVASI', 'BILANGAN_BULAT', '5', '5', 1, 50,
     'Kuota pengajuan berstatus Menunggu Persetujuan per pemohon Guru dan Staf (BR-023a).'),
    ('reservasi.kuota_tertunda_siswa_osis', 'RESERVASI', 'BILANGAN_BULAT', '2', '2', 1, 50,
     'Kuota pengajuan berstatus Menunggu Persetujuan per pemohon Siswa/OSIS (BR-023a).')
ON CONFLICT (key) DO NOTHING;

-- migrate:down
DROP TABLE IF EXISTS system_settings;
DROP TYPE IF EXISTS setting_group;
DROP TYPE IF EXISTS setting_type;
