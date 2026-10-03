-- 0040 — Turunan gambar pada registri berkas (PR-03-07; SDD-FS-07, SDD-09 §4.5, keputusan 10 log
-- phase-03). Expand murni: dua kolom nullable. NULL = turunan belum/tidak dibuat — klien jatuh
-- kembali ke berkas asli (§4.5); penerbit URL tahu tanpa HEAD ke object storage.

-- migrate:up

ALTER TABLE stored_files
    ADD COLUMN thumb_key  text UNIQUE,  -- 200 px sisi terpanjang, WebP
    ADD COLUMN medium_key text UNIQUE;  -- 800 px sisi terpanjang, WebP

-- migrate:down
ALTER TABLE stored_files
    DROP COLUMN IF EXISTS medium_key,
    DROP COLUMN IF EXISTS thumb_key;
