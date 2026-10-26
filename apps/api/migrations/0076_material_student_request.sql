-- 0076 — Permintaan bahan oleh Siswa/OSIS (PR-07-52; BR-086a, BR-091a, UXD-29). Expand murni:
-- satu kolom berbawaan false dan dua baris role_permissions; tidak ada bahan yang otomatis terbuka.

-- migrate:up
ALTER TABLE materials ADD COLUMN boleh_diminta_siswa boolean NOT NULL DEFAULT false;

INSERT INTO role_permissions (role_id, permission_id, scope)
    SELECT r.id, p.id, 'RESTRICTED'::permission_scope FROM roles r CROSS JOIN permissions p
    WHERE r.kode = 'R-07' AND p.kode IN ('material.view', 'material.request')
    ON CONFLICT DO NOTHING;
UPDATE roles SET role_version = role_version + 1 WHERE kode = 'R-07';

-- migrate:down
DELETE FROM role_permissions
    WHERE role_id = (SELECT id FROM roles WHERE kode = 'R-07')
      AND permission_id IN (SELECT id FROM permissions WHERE kode IN ('material.view', 'material.request'));
UPDATE roles SET role_version = role_version + 1 WHERE kode = 'R-07';
ALTER TABLE materials DROP COLUMN IF EXISTS boleh_diminta_siswa;
