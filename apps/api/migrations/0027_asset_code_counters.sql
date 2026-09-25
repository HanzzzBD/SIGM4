-- 0027 — Penghitung nomor urut kode aset (BR-002, FR-20.1) dan katalog awal
-- parameter KODE_ASET (SDD-DB-10, SDD-DB-17), PR-02-11.
--
-- Bukan SEQ-01..04 (dokumen transaksional RSV/PJM/dst., DocumentNumberService):
-- kode aset TIDAK memiliki dimensi tahun dan formatnya dikonfigurasi
-- Administrator (FR-20.1), bukan katalog tertutup PREFIKS. Pola tabel
-- penghitung tetap sama (SDD-AVL-09: hindari CREATE SEQUENCE saat runtime,
-- ON CONFLICT DO UPDATE mengunci baris — aman konkurensi tanpa kunci aplikasi).
--
-- Scope counter: per KOMBINASI (category_id, room_id) — keputusan pemilik
-- produk (log phase-02, PR-02-11): menghasilkan nomor kecil & rapi sesuai
-- contoh `LAB-KOM-0002` (glossary.md), cocok dengan alur "buat N unit identik
-- dalam satu kategori+lokasi" (FR-04.1 langkah 3-4). Kode LENGKAP tetap unik
-- sistem-wide (BR-002, assets_kode_barang_uq 0026) karena kategori+lokasi ikut
-- termuat pada kodenya.

-- migrate:up

CREATE TABLE asset_code_counters (
    category_id bigint NOT NULL REFERENCES asset_categories(id),
    room_id     bigint NOT NULL REFERENCES rooms(id),
    value       bigint NOT NULL DEFAULT 0,
    PRIMARY KEY (category_id, room_id)
);

-- Katalog awal KODE_ASET (SDD-05 §4.7a/SDD-DB-17): FR-20.1 hanya memberi CONTOH
-- pola (`{KATEGORI}-{LOKASI}-{URUT}`), bukan nilai bawaan literal per parameter
-- — tetapi contoh itu diulang identik lima tempat lintas PRD/UX/DESIGN
-- (glossary.md, NAVIGATION.md, PATTERNS.md, DESIGN-SYSTEM.md: `LAB-KOM-0002`),
-- cukup sebagai bawaan yang diturunkan docs, bukan dikarang. `pola` memuat
-- URUTAN token (KATEGORI/LOKASI, dapat ditukar/dihilangkan Administrator);
-- `URUT` SELALU ditambahkan di akhir oleh AssetService, tidak dapat
-- dihilangkan — jaring keunikan yang tidak bergantung konfigurasi.
INSERT INTO system_settings (key, kelompok, tipe, value, nilai_bawaan, nilai_min, nilai_maks, deskripsi) VALUES
    ('kode_aset.pola', 'KODE_ASET', 'TEKS', '"KATEGORI,LOKASI"', '"KATEGORI,LOKASI"', NULL, NULL,
     'Urutan token kode aset sebelum nomor urut, dipisah koma: KATEGORI dan/atau LOKASI. Nomor urut selalu ditambahkan di akhir (FR-20.1).'),
    ('kode_aset.pemisah', 'KODE_ASET', 'TEKS', '"-"', '"-"', NULL, NULL,
     'Karakter pemisah antar-segmen kode aset (FR-20.1).'),
    ('kode_aset.panjang_urut', 'KODE_ASET', 'BILANGAN_BULAT', '4', '4', 1, 10,
     'Lebar nomor urut kode aset, diisi nol di depan (mis. 0002) (FR-20.1).')
ON CONFLICT (key) DO NOTHING;

-- migrate:down
DELETE FROM system_settings WHERE key IN ('kode_aset.pola', 'kode_aset.pemisah', 'kode_aset.panjang_urut');
DROP TABLE IF EXISTS asset_code_counters;
