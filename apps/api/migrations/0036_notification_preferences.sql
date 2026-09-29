-- 0036 — Preferensi notifikasi (PR-02-28; FR-17.3, SDD-NTF-06, SDD-08 §4.5; UXD-05,
-- keputusan 81). Expand murni: satu tabel baru.

-- migrate:up

-- Ketiadaan baris = seluruh kanal aktif; notifikasi wajib mengabaikan tabel ini (FR-17.3 A1).
CREATE TABLE notification_preferences (
    user_id bigint             NOT NULL REFERENCES users(id),
    jenis   notification_group NOT NULL,
    in_app  boolean            NOT NULL DEFAULT true,
    push    boolean            NOT NULL DEFAULT true,
    PRIMARY KEY (user_id, jenis),
    -- Keputusan 81c: push bergantung in-app — tanpa notifikasi tersimpan tidak ada push.
    CONSTRAINT notification_preferences_push_butuh_in_app CHECK (in_app OR NOT push)
);

-- migrate:down
DROP TABLE IF EXISTS notification_preferences;
