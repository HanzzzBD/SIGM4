-- 0009 — Skema inti RBAC: roles, permissions, role_permissions (SDD-05 §4.7).
--
-- Lahir di PR-00-16, bukan PR-01-01: seed katalog permission Phase 00 (SDD-DB-10)
-- membutuhkan tabelnya lebih dulu. `users` tetap milik PR-01-01, bersama kolom
-- baku SDD-05 §4.2 pada `roles` — `created_by` merujuk `users(id)` yang belum ada.
--
-- `permissions` adalah master data acuan milik sistem dan `role_permissions`
-- relasi; keduanya dikecualikan dari kolom baku §4.2.

-- migrate:up

-- Cakupan data permission (Lampiran C.1, Bab 11.3). Disimpan per baris
-- role_permissions, bukan diturunkan dari kode saat runtime (SDD-DB-16).
CREATE TYPE permission_scope AS ENUM ('ALL', 'OWN', 'ASSIGNED', 'RESTRICTED');

CREATE TABLE roles (
    id        bigserial PRIMARY KEY,
    -- R-01 … R-07 bagi role bawaan (Bab 5). Kunci seed yang idempoten: nama
    -- dapat disunting sekolah, kode tidak.
    kode      text    NOT NULL,
    nama      text    NOT NULL,
    deskripsi text,
    is_system boolean NOT NULL DEFAULT false,
    CONSTRAINT roles_kode_uq UNIQUE (kode),
    CONSTRAINT roles_nama_uq UNIQUE (nama)
);

CREATE TABLE permissions (
    id        bigserial PRIMARY KEY,
    kode      text    NOT NULL,
    modul     text    NOT NULL,
    aksi      text    NOT NULL,
    deskripsi text    NOT NULL,
    -- Permission inti bertanda 🔒 — tidak dapat dicabut dari Administrator
    -- (FR-02.2 A1, SDD-AUTH-10).
    inti      boolean NOT NULL DEFAULT false,
    CONSTRAINT permissions_kode_uq UNIQUE (kode),
    -- Format {domain}.{aksi} huruf kecil (Lampiran C.1); aksi = bagian sesudah titik.
    CONSTRAINT permissions_kode_format
        CHECK (kode ~ '^[a-z0-9_]+\.[a-z0-9_]+$' AND aksi = split_part(kode, '.', 2))
);

CREATE TABLE role_permissions (
    role_id       bigint           NOT NULL REFERENCES roles(id),
    permission_id bigint           NOT NULL REFERENCES permissions(id),
    -- Tanpa nilai bawaan: scope yang terlupa harus ditolak, bukan menjadi ALL
    -- diam-diam (SDD-AUTH-02).
    scope         permission_scope NOT NULL,
    PRIMARY KEY (role_id, permission_id)
);

-- "Role mana yang memegang permission ini" — dibaca validator permission inti
-- dan halaman matriks; kunci primer hanya melayani arah role -> permission.
CREATE INDEX role_permissions_permission_id_idx ON role_permissions (permission_id);

-- migrate:down
DROP TABLE IF EXISTS role_permissions;
DROP TABLE IF EXISTS permissions;
DROP TABLE IF EXISTS roles;
DROP TYPE IF EXISTS permission_scope;
