-- PR-05-09/26: lifecycle dates, one-way identity erasure and import-report retention.
-- migrate:up
ALTER TABLE users ADD COLUMN deactivated_at timestamptz;
ALTER TABLE users ADD COLUMN pseudonymized_at timestamptz;
ALTER TABLE users ALTER COLUMN nip_nis DROP NOT NULL;

-- Recover only the last successful status decision. A prior deactivation followed
-- by reactivation is not evidence for the current retention period.
UPDATE users u SET deactivated_at=coalesce((
    SELECT CASE WHEN a.aksi IN ('USER_DEACTIVATED','STUDENT_GRADUATION_DEACTIVATED')
        THEN least(a.waktu,statement_timestamp()) END
    FROM activity_logs a WHERE a.entitas='users' AND a.entitas_id=u.id
        AND a.hasil='SUKSES' AND a.aksi IN ('USER_DEACTIVATED','USER_REACTIVATED','STUDENT_GRADUATION_DEACTIVATED')
    ORDER BY a.waktu DESC,a.id DESC LIMIT 1
),statement_timestamp()) WHERE u.status='NONAKTIF';

CREATE INDEX users_retention_due_idx ON users(deactivated_at,id)
    WHERE status='NONAKTIF' AND pseudonymized_at IS NULL;
ALTER TABLE users ADD CONSTRAINT users_identity_lifecycle_ck CHECK (
    (status='NONAKTIF' OR deactivated_at IS NULL)
    AND (pseudonymized_at IS NULL OR (status='NONAKTIF' AND deactivated_at IS NOT NULL
        AND nip_nis IS NULL AND telepon IS NULL AND work_unit_id IS NULL AND unit_kerja IS NULL))
    AND (pseudonymized_at IS NOT NULL OR nip_nis IS NOT NULL)
);
CREATE FUNCTION guard_user_identity_lifecycle() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP='UPDATE' AND OLD.pseudonymized_at IS NOT NULL AND
        (to_jsonb(NEW)-'updated_at'-'updated_by') IS DISTINCT FROM (to_jsonb(OLD)-'updated_at'-'updated_by') THEN
        RAISE EXCEPTION 'Akun yang dipseudonimkan tidak dapat dipulihkan atau disunting.' USING ERRCODE='23514';
    END IF;
    IF NEW.status='AKTIF' THEN NEW.deactivated_at=NULL;
    ELSIF TG_OP='INSERT' THEN NEW.deactivated_at=coalesce(NEW.deactivated_at,statement_timestamp());
    ELSIF OLD.status='AKTIF' THEN NEW.deactivated_at=coalesce(NEW.deactivated_at,statement_timestamp());
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER users_identity_lifecycle BEFORE INSERT OR UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION guard_user_identity_lifecycle();

ALTER TABLE password_reset_requests ADD COLUMN privacy_revoked_at timestamptz;
ALTER TABLE password_reset_requests DROP CONSTRAINT password_reset_ditolak_lengkap;
ALTER TABLE password_reset_requests ADD CONSTRAINT password_reset_ditolak_lengkap CHECK (
    status<>'DITOLAK' OR ((diproses_oleh IS NOT NULL OR privacy_revoked_at IS NOT NULL)
        AND diproses_pada IS NOT NULL AND alasan_penolakan IS NOT NULL AND btrim(alasan_penolakan)<>'')
);

ALTER TABLE user_import_jobs ADD COLUMN report_purged_at timestamptz;
ALTER TABLE asset_import_jobs ADD COLUMN report_purged_at timestamptz;
-- Unknown terminal dates start a conservative retention period at migration.
UPDATE user_import_jobs SET selesai_pada=statement_timestamp() WHERE status IN ('SELESAI','GAGAL') AND selesai_pada IS NULL;
UPDATE asset_import_jobs SET selesai_pada=statement_timestamp() WHERE status IN ('SELESAI','GAGAL') AND selesai_pada IS NULL;
CREATE INDEX user_import_report_retention_idx ON user_import_jobs(selesai_pada,id)
    WHERE status IN ('SELESAI','GAGAL') AND report_purged_at IS NULL;
CREATE INDEX asset_import_report_retention_idx ON asset_import_jobs(selesai_pada,id)
    WHERE status IN ('SELESAI','GAGAL') AND report_purged_at IS NULL;

-- migrate:down
DO $$ BEGIN
    IF EXISTS(SELECT 1 FROM users WHERE pseudonymized_at IS NOT NULL) THEN
        RAISE EXCEPTION 'Pseudonimisasi satu arah telah dijalankan; rollback skema ditolak. Gunakan perbaikan maju.';
    END IF;
END $$;
ALTER TABLE password_reset_requests DROP CONSTRAINT password_reset_ditolak_lengkap;
ALTER TABLE password_reset_requests DROP COLUMN privacy_revoked_at;
ALTER TABLE password_reset_requests ADD CONSTRAINT password_reset_ditolak_lengkap CHECK (
    status<>'DITOLAK' OR (diproses_oleh IS NOT NULL AND diproses_pada IS NOT NULL
        AND alasan_penolakan IS NOT NULL AND btrim(alasan_penolakan)<>'')
);
DROP INDEX asset_import_report_retention_idx;
DROP INDEX user_import_report_retention_idx;
ALTER TABLE asset_import_jobs DROP COLUMN report_purged_at;
ALTER TABLE user_import_jobs DROP COLUMN report_purged_at;
DROP TRIGGER users_identity_lifecycle ON users;
DROP FUNCTION guard_user_identity_lifecycle();
ALTER TABLE users DROP CONSTRAINT users_identity_lifecycle_ck;
DROP INDEX users_retention_due_idx;
ALTER TABLE users ALTER COLUMN nip_nis SET NOT NULL;
ALTER TABLE users DROP COLUMN pseudonymized_at;
ALTER TABLE users DROP COLUMN deactivated_at;
