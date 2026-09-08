-- 0006 — Transactional outbox (SDD-07 §4.1, SDD-EVT-03, SDD-EVT-04, SDD-EVT-09).
--
-- Event ditulis ke tabel ini DI DALAM transaksi bisnis, lalu dibaca dispatcher
-- setelah commit. Alasannya di SDD-EVT-04: notifikasi yang dikirim tepat setelah
-- COMMIT tanpa outbox akan hilang selamanya bila proses mati di antara keduanya,
-- sementara NT-01/NT-11 bertanda wajib. Outbox memindahkan jaminannya ke basis
-- data — tercatat bersama transaksi, atau tidak sama sekali.
--
-- Tabel infrastruktur (SDD-05 §4.2), jadi tanpa kolom baku entitas: barisnya
-- tidak dimiliki siapa pun, dan kolom waktunya sudah bermakna sendiri.

-- migrate:up
CREATE TABLE event_outbox (
    id             bigserial   PRIMARY KEY,
    -- <Entitas><KataKerjaLampau> dalam Bahasa Inggris (SDD-EVT-05).
    event_name     text        NOT NULL,
    -- Agregat penentu URUTAN (SDD-EVT-09). Bukan sekadar keterangan: dispatcher
    -- mengunci per (aggregate_type, aggregate_id) dan memproses id menaik.
    aggregate_type text        NOT NULL,
    aggregate_id   bigint      NOT NULL,
    -- Pengenal dan fakta minimum saja, bukan seluruh entitas (SDD-EVT-06).
    payload        jsonb       NOT NULL,
    actor_id       bigint,
    -- Diteruskan ke log worker agar satu permintaan dapat ditelusuri melewati
    -- batas commit (SDD-OBS-03).
    request_id     text,
    occurred_at    timestamptz NOT NULL DEFAULT now(),
    processed_at   timestamptz,
    attempts       int         NOT NULL DEFAULT 0,
    last_error     text
);

-- Indeks pemungutan. Urutan kolomnya sama dengan urutan pemrosesan SDD-EVT-09,
-- sehingga dispatcher membaca indeks ini tanpa mengurutkan ulang.
--
-- Predikatnya sengaja HANYA processed_at IS NULL, persis seperti §4.1 menulisnya:
-- baris dead letter (attempts >= 5) ikut termuat di sini. Yang menyaringnya
-- adalah kueri dispatcher, bukan indeksnya — retensi baris itu urusan TBD-EVT-A.
CREATE INDEX event_outbox_pending
    ON event_outbox (aggregate_type, aggregate_id, id)
    WHERE processed_at IS NULL;                       -- SDD-EVT-09

-- migrate:down
DROP TABLE IF EXISTS event_outbox;
