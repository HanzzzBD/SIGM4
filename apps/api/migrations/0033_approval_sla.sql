-- 0033 — Pelacakan SLA & eskalasi langkah persetujuan (PR-02-22; FR-10.2 A2/A2a,
-- Lampiran D.5, SDD-02 §4.5). Bentuk mengikuti keputusan 70 log phase-02 (pemilik
-- produk), yang juga menyunting PRD `m10-approval.md` §8 dan `data-model.md`.
-- Expand murni: empat kolom nullable, tanpa backfill — langkah yang sudah berjalan
-- sama dengan langkah yang belum pernah diingatkan, dieskalasi, maupun dialarmi.

-- migrate:up

ALTER TABLE approval_steps
    -- Langkah `escalate` yang sudah dialihkan ke `eskalasi_ke`; pelanggaran berikutnya = eskalasi habis.
    ADD COLUMN dieskalasi_pada         timestamptz,
    -- Target pengguna sebelum dialihkan (FR-10.3 A2). Target role asli tetap di `rule_snapshot`.
    ADD COLUMN eskalasi_dari_user_id   bigint REFERENCES users(id),
    -- NT-06 maks 1×/hari (hari WIB) per langkah.
    ADD COLUMN pengingat_terakhir_pada timestamptz,
    -- Perilaku terminal dijalankan SEKALI: NT-47 (hold_and_alert) atau ditolak otomatis.
    ADD COLUMN alarm_terminal_pada     timestamptz,

    -- Eskalasi selalu berujung pada pengguna tertentu (D.5 `escalate_to_user_id`).
    ADD CONSTRAINT approval_steps_eskalasi_ke_pengguna
        CHECK (dieskalasi_pada IS NULL OR approver_type = 'user'),
    ADD CONSTRAINT approval_steps_eskalasi_dari_konsisten
        CHECK (eskalasi_dari_user_id IS NULL OR dieskalasi_pada IS NOT NULL);

-- migrate:down
ALTER TABLE approval_steps
    DROP CONSTRAINT IF EXISTS approval_steps_eskalasi_dari_konsisten,
    DROP CONSTRAINT IF EXISTS approval_steps_eskalasi_ke_pengguna,
    DROP COLUMN IF EXISTS alarm_terminal_pada,
    DROP COLUMN IF EXISTS pengingat_terakhir_pada,
    DROP COLUMN IF EXISTS eskalasi_dari_user_id,
    DROP COLUMN IF EXISTS dieskalasi_pada;
