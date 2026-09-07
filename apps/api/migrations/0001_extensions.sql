-- 0001 — Ekstensi PostgreSQL (SDD-05 §4.5).
--
-- Dua ekstensi, dan keduanya ada karena requirement, bukan kenyamanan:
--
--   btree_gist  CI-01 menuntut dua slot pemesanan beririsan waktu ditolak
--               *constraint basis data*, bukan validasi aplikasi. Exclusion
--               constraint pada SDD-01 §4.1 memadukan operator kesetaraan
--               (resource_type, resource_id) dengan operator irisan rentang
--               (slot_range &&) di dalam SATU indeks GiST — dan tanpa ekstensi
--               ini, tipe skalar tidak punya kelas operator GiST sehingga
--               constraint itu tidak dapat dibuat sama sekali.
--
--   pgcrypto    gen_random_uuid() bagi assets.uuid (FR-05.1/FR-05.2 A3), satu-
--               satunya pengecualian SDD-DB-01 terhadap kunci bigserial, serta
--               digest() bagi rantai hash activity_logs (NFR-S-03d, PR-00-13).
--
-- SDD-INF-11 memilih PostgreSQL TERKELOLA, yang daftar ekstensinya dikurasi
-- penyedia. Ketersediaan btree_gist karena itu diverifikasi sebelum langganan
-- dibuka (phase-00.md §10) — migration ini menyalakannya, bukan menjaminnya.

-- migrate:up
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- migrate:down
-- Urutan pencabutan tidak penting: tidak ada objek yang bergantung pada keduanya
-- pada titik ini. Sejak booking_slots dibangun (PR-02-16), DROP btree_gist akan
-- ditolak PostgreSQL karena exclusion constraint bergantung padanya — dan itu
-- perilaku yang diinginkan, bukan yang perlu diakali.
DROP EXTENSION IF EXISTS pgcrypto;
DROP EXTENSION IF EXISTS btree_gist;
