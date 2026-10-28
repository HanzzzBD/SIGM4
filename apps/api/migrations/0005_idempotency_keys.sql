-- 0005 — Kunci idempotensi (SDD-AVL-08, SDD-01 §4.4, ID-01 … ID-05).
--
-- Di PostgreSQL, bukan di Redis. Alasannya menentukan: kunci idempotensi harus
-- commit BERSAMA efek bisnisnya. Bila disimpan di Redis dan transaksi DB gagal
-- setelah kunci ditulis, permintaan ulang akan menerima "sudah diproses" padahal
-- tidak ada apa pun yang tersimpan — dan pengguna kehilangan reservasinya tanpa
-- satu pun galat yang menandainya.
--
-- Tabel infrastruktur, jadi tanpa kolom baku SDD-05 §4.2 selain created_at:
-- barisnya tidak dimiliki siapa pun dan tidak pernah disunting manusia.

-- migrate:up
CREATE TABLE idempotency_keys (
    key           uuid        PRIMARY KEY,
    -- Endpoint disimpan agar kunci yang sama pada endpoint berbeda dapat
    -- dibedakan saat penelusuran; ia BUKAN bagian identitas kunci (ID-02).
    endpoint      text        NOT NULL,
    -- SHA-256 body permintaan. Yang dibandingkan hash-nya, bukan body-nya:
    -- body dapat memuat data pribadi (DP-03) dan tidak perlu disimpan utuh.
    request_hash  text        NOT NULL,
    -- NULL hanya di dalam transaksi yang sedang menulisnya. Deteksi permintaan
    -- berjalan memakai pg_try_advisory_xact_lock, bukan kolom ini (SDD-01 §4.4).
    status_code   int,
    response_body jsonb,
    created_at    timestamptz NOT NULL DEFAULT now(),
    -- TTL 24 jam (ID-02). Job pembersihnya dibangun PR-00-11.
    expires_at    timestamptz NOT NULL DEFAULT now() + interval '24 hours'
);

CREATE INDEX idempotency_keys_expires_at_idx ON idempotency_keys (expires_at);

-- migrate:down
DROP TABLE IF EXISTS idempotency_keys;
