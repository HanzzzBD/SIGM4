-- 0034 — Skema notifikasi (PR-02-25; FR-17.1, SDD-NTF-04/07/09/10, SDD-08 §4.1/§4.5/§4.6;
-- keputusan 78). Expand murni: tabel baru, tanpa perubahan tabel lain.
--
-- Hanya yang dibutuhkan PENERBITAN: `notifications` (+ arsip berskema identik) dan tipe
-- `notification_group`. `notification_deliveries` (hasil per kanal) lahir bersama
-- pengirimnya — SSE `PR-02-26` / FCM `PR-02-27`; `notification_preferences` bersama
-- `PR-02-28`; job pengarsipan > 90 hari bersama `PR-02-26`.

-- migrate:up

-- SDD-08 §4.5 (UXD-05): enam kelompok preferensi; setiap kode NT memetakan tepat satu.
CREATE TYPE notification_group AS ENUM (
    'PERSETUJUAN',
    'RESERVASI_PEMINJAMAN',
    'DENDA_KEWAJIBAN',
    'KERUSAKAN_PERAWATAN',
    'OPNAME_PENGADAAN',
    'AKUN_SISTEM'
);

CREATE TABLE notifications (
    id              bigserial          PRIMARY KEY,
    user_id         bigint             NOT NULL REFERENCES users(id),
    -- Kode katalog Bab 20, mis. 'NT-06'.
    kode            text               NOT NULL,
    jenis           notification_group NOT NULL,
    judul           text               NOT NULL,
    -- Hasil render templat SAAT terbit (SDD-NTF-04, SDD-08 §5): templat berubah, riwayat tidak.
    isi             text               NOT NULL,
    params          jsonb              NOT NULL DEFAULT '{}',
    referensi_jenis text,
    referensi_id    bigint,
    -- SDD-NTF-09: path relatif aplikasi, bukan URL absolut.
    deep_link       text,
    wajib           boolean            NOT NULL DEFAULT false,
    dibaca_pada     timestamptz,
    created_at      timestamptz        NOT NULL,
    -- SDD-NTF-07 + §4.1 (keputusan 75c): harian `{kode}:{user}:{ref_jenis}:{ref_id}:{YYYY-MM-DD}`,
    -- kejadian tunggal `{kode}:{user}:evt:{event_id}` — pengulangan outbox tak menggandakan.
    dedupe_key      text,

    CONSTRAINT notifications_kode_sah CHECK (kode ~ '^NT-[0-9]{2}[a-z]?$'),
    CONSTRAINT notifications_deep_link_relatif CHECK (deep_link IS NULL OR deep_link LIKE '/%')
);

CREATE UNIQUE INDEX notifications_dedupe ON notifications (dedupe_key) WHERE dedupe_key IS NOT NULL;
CREATE INDEX notifications_inbox ON notifications (user_id, created_at DESC);
CREATE INDEX notifications_unread ON notifications (user_id) WHERE dibaca_pada IS NULL;

-- SDD-08 §4.6: skema identik, TANPA indeks unread; dibaca pemiliknya (SDD-NTF-10).
CREATE TABLE notifications_archive (LIKE notifications INCLUDING DEFAULTS INCLUDING CONSTRAINTS);
ALTER TABLE notifications_archive ADD PRIMARY KEY (id);
ALTER TABLE notifications_archive ADD CONSTRAINT notifications_archive_user_fk FOREIGN KEY (user_id) REFERENCES users(id);
CREATE INDEX notifications_archive_owner ON notifications_archive (user_id, created_at DESC);

-- migrate:down
DROP TABLE IF EXISTS notifications_archive;
DROP TABLE IF EXISTS notifications;
DROP TYPE IF EXISTS notification_group;
