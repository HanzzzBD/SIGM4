-- 0037 — Riwayat password (PR-02-31; NFR-S-03a, FR-01.4 A2, SDD-SESS-19, SDD-04 §4.9;
-- keputusan 84). Expand murni: satu tabel + trigger pada `users` + isi awal.

-- migrate:up

CREATE TABLE password_history (
    id            bigserial   PRIMARY KEY,
    user_id       bigint      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    -- Argon2id (SDD-SESS-01) — nilai asli tidak pernah disimpan.
    password_hash text        NOT NULL,
    berlaku_sejak timestamptz NOT NULL
);

CREATE INDEX password_history_user_idx ON password_history (user_id, berlaku_sejak DESC, id DESC);

-- Keputusan 84d: SETIAP jalur yang mengganti hash tercatat — M-01 (ganti password, reset,
-- break-glass) maupun M-02 (buat akun, impor) — dalam transaksi yang sama, tanpa saling
-- mengimpor. Riwayat dipangkas menjadi 3 terakhir, termasuk yang sedang berlaku (84b).
CREATE FUNCTION catat_riwayat_password() RETURNS trigger
    LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'UPDATE' AND NEW.password_hash IS NOT DISTINCT FROM OLD.password_hash THEN
        RETURN NEW;
    END IF;
    INSERT INTO password_history (user_id, password_hash, berlaku_sejak)
    VALUES (NEW.id, NEW.password_hash, clock_timestamp());
    DELETE FROM password_history
     WHERE user_id = NEW.id
       AND id NOT IN (SELECT id FROM password_history WHERE user_id = NEW.id ORDER BY berlaku_sejak DESC, id DESC LIMIT 3);
    RETURN NEW;
END;
$$;

CREATE TRIGGER users_catat_riwayat_password
    AFTER INSERT OR UPDATE OF password_hash ON users
    FOR EACH ROW EXECUTE FUNCTION catat_riwayat_password();

-- Keputusan 84e: password yang sedang berlaku langsung terlarang dipakai ulang.
INSERT INTO password_history (user_id, password_hash, berlaku_sejak)
SELECT id, password_hash, updated_at FROM users;

-- migrate:down
DROP TRIGGER IF EXISTS users_catat_riwayat_password ON users;
DROP FUNCTION IF EXISTS catat_riwayat_password();
DROP TABLE IF EXISTS password_history;
