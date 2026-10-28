-- 0003 — Penghitung nomor dokumen (SDD-AVL-09, SDD-01 §4.5).
--
-- Tabel penghitung, BUKAN `CREATE SEQUENCE` per tahun. Alasannya mengikat:
-- SEQ-01 mereset urutan setiap tahun anggaran, dan membuat sequence baru tiap
-- tahun berarti DDL saat runtime — hak yang justru dilarang SEC-CFG-03 bagi akun
-- aplikasi. Tabel penghitung tidak menuntut DDL, tetap gap-tolerant (SEQ-03),
-- dan aman terhadap konkurensi karena ON CONFLICT DO UPDATE mengunci barisnya.
--
-- Tanpa kolom baku SDD-05 §4.2: ini tabel infrastruktur, bukan entitas domain.
-- `updated_at`/`updated_by` tidak bermakna bagi baris yang hanya pernah bertambah,
-- dan tidak ada pelaku yang "memiliki" sebuah penghitung.

-- migrate:up
CREATE TABLE document_counters (
    prefix text   NOT NULL,
    year   int    NOT NULL,
    value  bigint NOT NULL DEFAULT 0,
    PRIMARY KEY (prefix, year)
);

-- migrate:down
DROP TABLE IF EXISTS document_counters;
