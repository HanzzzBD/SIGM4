-- 0075 — Progres tur produk per akun (tur produk berbasis role; keputusan pemilik produk
-- 26 Oktober 2026, log phase-07). Expand murni: satu tabel baru.

-- migrate:up

-- Ketiadaan baris = tur belum pernah diselesaikan maupun dilewati, sehingga diputar otomatis.
-- `versi` naik bila isi tur berubah; klien memutar ulang tur yang versinya tersimpan lebih lama.
CREATE TABLE product_tour_progress (
    user_id    bigint      NOT NULL REFERENCES users(id),
    kunci_tur  varchar(64) NOT NULL CHECK (kunci_tur ~ '^[a-z0-9][a-z0-9.-]{0,63}$'),
    status     varchar(16) NOT NULL CHECK (status IN ('SELESAI', 'DILEWATI')),
    versi      integer     NOT NULL CHECK (versi BETWEEN 1 AND 1000),
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL,
    PRIMARY KEY (user_id, kunci_tur)
);

-- migrate:down
DROP TABLE IF EXISTS product_tour_progress;
