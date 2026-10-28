-- 0038 — Registri berkas terpusat (PR-03-04; SDD-FS-02, SDD-09 §4.1, keputusan 5 log phase-03).
-- Expand murni: dua tipe enum, satu tabel, dan satu kolom nullable baru pada `users`
-- (foto profil FR-01.4, keputusan 4 log phase-01).

-- migrate:up

-- Bab 11.3 "Status Pemindaian Berkas" — SDD-FS-03: hanya CLEAN yang boleh diunduh.
CREATE TYPE file_scan_status AS ENUM ('PENDING', 'CLEAN', 'INFECTED', 'FAILED');

-- Bab 11.3 "Jenis Pemilik Berkas" — kebijakan per jenis SDD-09 §4.3 (+ `asset_photos`). Jenis
-- baru masuk lewat `ALTER TYPE … ADD VALUE` (tetap expand).
CREATE TYPE file_owner_type AS ENUM (
    'ASSET_DOCUMENT', 'ASSET_PHOTO', 'USER_PHOTO', 'HANDOVER_PHOTO',
    'DAMAGE_PHOTO', 'WORK_ORDER_PHOTO', 'STOCKTAKE_PHOTO'
);

-- Infrastruktur, bukan entitas domain (SDD-05 §4.2): tanpa kolom baku `updated_*`.
CREATE TABLE stored_files (
    id           bigserial        PRIMARY KEY,
    -- SDD-FS-06: `{jenis}/{yyyy}/{mm}/{uuid}.{ext}` — tanpa nama asli, ID entitas, atau identitas.
    object_key   text             NOT NULL UNIQUE,
    mime         text             NOT NULL,
    ukuran       bigint           NOT NULL CHECK (ukuran > 0),
    -- SHA-256 heksadesimal, diisi saat confirm; NULL = belum dikonfirmasi (SDD-09 §4.2 langkah 3).
    checksum     text             CHECK (checksum ~ '^[0-9a-f]{64}$'),
    scan_status  file_scan_status NOT NULL DEFAULT 'PENDING',
    scanned_at   timestamptz,
    -- Jenis berkas ditetapkan sejak presign (kebijakan §4.3); pemiliknya baru terisi saat ditautkan.
    owner_type   file_owner_type  NOT NULL,
    owner_id     bigint,          -- NULL = yatim (SDD-FS-09)
    uploaded_by  bigint           NOT NULL REFERENCES users(id),
    created_at   timestamptz      NOT NULL DEFAULT now()
);

CREATE INDEX stored_files_orphan ON stored_files (created_at) WHERE owner_id IS NULL;
CREATE INDEX stored_files_pending_scan ON stored_files (created_at) WHERE scan_status = 'PENDING';
CREATE INDEX stored_files_owner_idx ON stored_files (owner_type, owner_id) WHERE owner_id IS NOT NULL;

-- FR-01.4: foto profil merujuk registri (SDD-FS-02), bukan path sendiri. SET NULL: baris
-- `stored_files` tidak pernah dihapus selama dirujuk (SDD-09 §4.6), ini hanya pagar.
ALTER TABLE users ADD COLUMN foto_file_id bigint REFERENCES stored_files(id) ON DELETE SET NULL;

-- migrate:down
ALTER TABLE users DROP COLUMN IF EXISTS foto_file_id;
DROP TABLE IF EXISTS stored_files;
DROP TYPE IF EXISTS file_owner_type;
DROP TYPE IF EXISTS file_scan_status;
