-- 0013 — `role_version` pada `roles` (SDD-AUTH-04, PM-05): bagian kunci cache
-- permission `perm:{user_id}:{role_version}`. Menaikkannya membuat kunci lama
-- tidak pernah terbaca lagi — pembatalan cache tanpa penghapusan per pengguna.
--
-- Expand murni (PR-01-04): kolom baru berdefault 1, tidak ada yang dihapus.

-- migrate:up
ALTER TABLE roles ADD COLUMN role_version bigint NOT NULL DEFAULT 1;

-- migrate:down
ALTER TABLE roles DROP COLUMN role_version;
