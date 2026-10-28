-- 0012 — Tabel `users` + kolom baku `roles` (FR-02.1, SDD-05 §4.2 dan §4.7).
--
-- Migration `expand` (SDD-DB-08): hanya menambah. Kolom `users` mengikuti atribut
-- PRD (m02-users §8) kecuali tiga yang sengaja belum ada (logs/phase-01.md §2):
-- penanda 2FA adalah `totp_enabled_at` milik SDD-04 §4.1 (Phase 02), kolom
-- penguncian dan TOTP lain juga milik SDD-04 §4.1, dan foto profil menunggu
-- `stored_files` (SDD-FS-02, Phase 03).

-- migrate:up

-- Status Pengguna (Bab 11.3).
CREATE TYPE user_status AS ENUM ('AKTIF', 'NONAKTIF');

-- `updated_at` dipelihara trigger, bukan aplikasi, agar tidak bisa lupa (SDD-05 §4.2).
-- Satu fungsi untuk seluruh tabel entitas domain yang menyusul.
CREATE FUNCTION set_updated_at() RETURNS trigger
    LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END
$$;

CREATE TABLE users (
    id                   bigserial   PRIMARY KEY,
    nama                 text        NOT NULL,
    email                text        NOT NULL,
    -- Argon2id (SDD-SESS-01). Akun selalu lahir berpassword sementara (FR-02.1 langkah 4).
    password_hash        text        NOT NULL,
    nip_nis              text        NOT NULL,
    -- Tepat satu role utama (BR-066).
    role_id              bigint      NOT NULL REFERENCES roles(id),
    -- Teks bebas lama; digantikan `work_unit_id` lewat expand→migrate→contract (WU-01).
    unit_kerja           text,
    telepon              text,
    -- Soft delete eksplisit: dinonaktifkan, tidak pernah dihapus (BR-067, SDD-DB-04).
    -- Tanpa nilai bawaan: akun siswa tidak boleh aktif tanpa persetujuan wali
    -- (SL-06), jadi status yang terlupa harus ditolak, bukan menjadi AKTIF.
    status               user_status NOT NULL,
    -- Tanpa nilai bawaan dengan alasan yang sama: akun baru dan reset password
    -- memaksanya true (FR-02.1 langkah 4, FR-01.6), dan itu wajib dinyatakan.
    must_change_password boolean     NOT NULL,
    login_terakhir_pada  timestamptz,
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now(),
    created_by           bigint      REFERENCES users(id),
    updated_by           bigint      REFERENCES users(id),
    -- Unik sistem-wide (FR-02.1 langkah 3, Lampiran E.5.2).
    CONSTRAINT users_nip_nis_uq UNIQUE (nip_nis)
);

-- Email unik sistem-wide (FR-02.1 A1, Lampiran E.5.2) tanpa membedakan huruf
-- besar: `Budi@…` dan `budi@…` adalah kotak surat yang sama.
CREATE UNIQUE INDEX users_email_uq ON users (lower(email));

-- Jumlah pengguna per role dan penolakan hapus role berpengguna (FR-02.2 langkah 2, A3).
CREATE INDEX users_role_id_idx ON users (role_id);

CREATE TRIGGER users_set_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- `roles` adalah entitas domain (FR-02.2 A2); kolom bakunya baru dapat lahir di
-- sini karena `created_by` merujuk `users(id)` (SDD-05 §4.7). Tujuh role seed
-- 0010 memperoleh `created_by` NULL: dibuat sistem, bukan seseorang.
ALTER TABLE roles
    ADD COLUMN created_at timestamptz NOT NULL DEFAULT now(),
    ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now(),
    ADD COLUMN created_by bigint REFERENCES users(id),
    ADD COLUMN updated_by bigint REFERENCES users(id);

CREATE TRIGGER roles_set_updated_at
    BEFORE UPDATE ON roles
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- migrate:down
DROP TRIGGER IF EXISTS roles_set_updated_at ON roles;
ALTER TABLE roles
    DROP COLUMN IF EXISTS updated_by,
    DROP COLUMN IF EXISTS created_by,
    DROP COLUMN IF EXISTS updated_at,
    DROP COLUMN IF EXISTS created_at;
DROP TABLE IF EXISTS users;
DROP FUNCTION IF EXISTS set_updated_at();
DROP TYPE IF EXISTS user_status;
