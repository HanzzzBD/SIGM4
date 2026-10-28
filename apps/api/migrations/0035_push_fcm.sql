-- 0035 — Push FCM (PR-02-27; FR-17.2, MOB-SEC-05, SDD-NTF-08, SDD-08 §4.1/§4.4a;
-- keputusan 80). Expand murni: tipe + dua tabel baru.

-- migrate:up

-- Bab 11.3 "Status Pengiriman Notifikasi" (keputusan 80c).
CREATE TYPE delivery_status AS ENUM ('MENUNGGU', 'TERKIRIM', 'GAGAL', 'DILEWATI');

CREATE TABLE device_tokens (
    id             bigserial       PRIMARY KEY,
    user_id        bigint          NOT NULL REFERENCES users(id),
    -- Satu perangkat = satu token; didaftar ulang dari sesi lain → dipindah (keputusan 80b).
    token          text            NOT NULL,
    platform       device_platform NOT NULL,
    -- MOB-SEC-05: keluarga refresh token sesi pendaftar — dicabut bersama sesi itu.
    family_id      uuid            NOT NULL,
    terakhir_aktif timestamptz     NOT NULL,
    created_at     timestamptz     NOT NULL,

    CONSTRAINT device_tokens_token_uq UNIQUE (token),
    CONSTRAINT device_tokens_mobile CHECK (platform IN ('ANDROID', 'IOS'))
);

-- FR-17.2 A4: seluruh perangkat aktif seorang pengguna; SessionRevoked per keluarga.
CREATE INDEX device_tokens_user_idx ON device_tokens (user_id);
CREATE INDEX device_tokens_family_idx ON device_tokens (family_id);

-- SDD-08 §4.1: hasil per kanal; satu baris per (notifikasi, kanal) — job yang diulang memperbaruinya.
CREATE TABLE notification_deliveries (
    id              bigserial            PRIMARY KEY,
    notification_id bigint               NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
    kanal           notification_channel NOT NULL,
    status          delivery_status      NOT NULL,
    attempts        integer              NOT NULL DEFAULT 0,
    last_error      text,
    sent_at         timestamptz,

    CONSTRAINT notification_deliveries_uq UNIQUE (notification_id, kanal),
    CONSTRAINT notification_deliveries_attempts CHECK (attempts >= 0)
);

-- migrate:down
DROP TABLE IF EXISTS notification_deliveries;
DROP TABLE IF EXISTS device_tokens;
DROP TYPE IF EXISTS delivery_status;
