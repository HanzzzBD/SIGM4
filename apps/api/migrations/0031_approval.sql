-- 0031 — Skema mesin persetujuan (PR-02-18; FR-10.1, Lampiran D.5, SDD-APR-03/04/12).
-- Murni skema: evaluator DSL `PR-02-19`, resolusi approver `PR-02-20`, eksekusi
-- `PR-02-21`, antarmuka konfigurasi `PR-02-24`.
--
-- Bentuk mengikuti keputusan 65 log phase-02 (pemilik produk), yang juga menyunting
-- PRD `m10-approval.md` §8 dan `data-model.md` (entitas + Bab 11.3):
--   * langkah aturan RELASIONAL (`approval_rule_steps`) dengan kolom D.5 yang semula
--     tak tertampung — `on_sla_breach`, dan fallback + perilaku terminal tingkat aturan;
--   * langkah instance menyimpan TARGET approver (role/pengguna — dapat dialihkan
--     eskalasi, dan langkah fallback RE-11 tidak ada di snapshot) terpisah dari
--     `diputuskan_oleh`;
--   * status instance = kelompok Bab 11.3 baru "Status Instance Approval".
-- Nilai DSL D.5 (`role|user`, `remind|escalate`, `hold_and_alert|auto_reject`) disimpan
-- sebagai teks ber-CHECK persis literal lampiran: ia kontrak DSL, bukan data referensi
-- Bab 11.3. `DEFAULT_RULE` (BR-036, RE-06) adalah konstanta kode, bukan baris — maka
-- `approval_instances.rule_id` NULLABLE (SDD-02 §4.3).

-- migrate:up

CREATE TYPE approval_instance_status AS ENUM ('MENUNGGU', 'DISETUJUI', 'DITOLAK', 'PERLU_REVISI', 'DIBATALKAN');

CREATE TABLE approval_rules (
    id                               bigserial             PRIMARY KEY,
    jenis_pengajuan                  approval_request_type NOT NULL,
    -- Lampiran D.1; `{}` = selalu cocok. Validasi bentuk: JSON Schema (SDD-APR-02, PR-02-19/24).
    kondisi                          jsonb                 NOT NULL DEFAULT '{}',
    -- FR-10.1 langkah 5 / RE-04: prioritas tertinggi menang.
    prioritas                        integer               NOT NULL,
    status_aktif                     boolean               NOT NULL DEFAULT true,
    -- FR-10.1 AC: instance merujuk versi aturan; naik setiap aturan diubah.
    versi                            integer               NOT NULL DEFAULT 1,
    -- D.5 / RE-11 / SDD-APR-13: opsional, tingkat aturan; kosong = role Administrator.
    fallback_approver_type           text,
    fallback_role_id                 bigint                REFERENCES roles(id),
    fallback_user_id                 bigint                REFERENCES users(id),
    -- D.5: perilaku bila seluruh eskalasi habis. Bawaan hold_and_alert (NT-47).
    terminal_on_exhausted_escalation text                  NOT NULL DEFAULT 'hold_and_alert',
    created_at                       timestamptz           NOT NULL DEFAULT now(),
    updated_at                       timestamptz           NOT NULL DEFAULT now(),
    created_by                       bigint                REFERENCES users(id),
    updated_by                       bigint                REFERENCES users(id),

    CONSTRAINT approval_rules_kondisi_objek CHECK (jsonb_typeof(kondisi) = 'object'),
    CONSTRAINT approval_rules_versi_positif CHECK (versi >= 1),
    -- IS NOT DISTINCT FROM, bukan `=`: tipe NULL membuat `=` bernilai NULL, dan CHECK
    -- yang NULL dianggap LOLOS — fallback_user_id tanpa tipe sempat diterima.
    CONSTRAINT approval_rules_fallback_sah CHECK (
        (fallback_approver_type IS NULL     AND fallback_role_id IS NULL     AND fallback_user_id IS NULL) OR
        (fallback_approver_type IS NOT DISTINCT FROM 'role' AND fallback_role_id IS NOT NULL AND fallback_user_id IS NULL) OR
        (fallback_approver_type IS NOT DISTINCT FROM 'user' AND fallback_user_id IS NOT NULL AND fallback_role_id IS NULL)
    ),
    CONSTRAINT approval_rules_terminal_sah
        CHECK (terminal_on_exhausted_escalation IN ('hold_and_alert', 'auto_reject'))
);

-- RE-04: pemilihan aturan aktif per jenis, prioritas menurun, id menaik (SDD-02 §4.3).
CREATE INDEX approval_rules_pemilihan_idx
    ON approval_rules (jenis_pengajuan, prioritas DESC, id) WHERE status_aktif;

CREATE TRIGGER approval_rules_set_updated_at
    BEFORE UPDATE ON approval_rules
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE approval_rule_steps (
    id               bigserial PRIMARY KEY,
    rule_id          bigint    NOT NULL REFERENCES approval_rules(id) ON DELETE CASCADE,
    urutan           integer   NOT NULL,
    approver_type    text      NOT NULL,
    approver_role_id bigint    REFERENCES roles(id),
    approver_user_id bigint    REFERENCES users(id),
    -- Jam KERJA (CAL-01, SDD-APR-06).
    sla_jam          integer   NOT NULL,
    on_sla_breach    text      NOT NULL DEFAULT 'remind',
    -- D.5 escalate_to_user_id.
    eskalasi_ke      bigint    REFERENCES users(id),

    CONSTRAINT approval_rule_steps_urutan_uq UNIQUE (rule_id, urutan),
    CONSTRAINT approval_rule_steps_urutan_positif CHECK (urutan >= 1),
    CONSTRAINT approval_rule_steps_sla_positif CHECK (sla_jam >= 1),
    CONSTRAINT approval_rule_steps_approver_sah CHECK (
        (approver_type = 'role' AND approver_role_id IS NOT NULL AND approver_user_id IS NULL) OR
        (approver_type = 'user' AND approver_user_id IS NOT NULL AND approver_role_id IS NULL)
    ),
    CONSTRAINT approval_rule_steps_breach_sah CHECK (on_sla_breach IN ('remind', 'escalate')),
    -- Eskalasi tanpa tujuan tidak bermakna.
    CONSTRAINT approval_rule_steps_eskalasi_bertujuan CHECK (on_sla_breach <> 'escalate' OR eskalasi_ke IS NOT NULL)
);

CREATE TABLE approval_instances (
    id               bigserial                PRIMARY KEY,
    jenis_pengajuan  approval_request_type    NOT NULL,
    -- Polimorfik per jenis (reservations, procurements, …) — tanpa FK; mesin tak
    -- mengenal tabel pengajuan (SDD-APR-09).
    referensi_id     bigint                   NOT NULL,
    -- NULL = DEFAULT_RULE (BR-036). RESTRICT: aturan yang pernah dipakai tak dapat dihapus.
    rule_id          bigint                   REFERENCES approval_rules(id),
    -- SDD-APR-03: definisi UTUH (kondisi + langkah + fallback + terminal + versi), BEKU.
    rule_snapshot    jsonb                    NOT NULL,
    -- SDD-APR-04: penunjuk langkah aktif (urutan); NULL setelah selesai.
    langkah_aktif    integer,
    status           approval_instance_status NOT NULL DEFAULT 'MENUNGGU',
    created_at       timestamptz              NOT NULL DEFAULT now(),
    diselesaikan_pada timestamptz,

    CONSTRAINT approval_instances_snapshot_objek CHECK (jsonb_typeof(rule_snapshot) = 'object'),
    CONSTRAINT approval_instances_selesai_konsisten
        CHECK ((status = 'MENUNGGU') = (diselesaikan_pada IS NULL))
);

-- Paling banyak SATU instance berjalan per pengajuan.
CREATE UNIQUE INDEX approval_instances_berjalan_uq
    ON approval_instances (jenis_pengajuan, referensi_id) WHERE status = 'MENUNGGU';

-- Acceptance PR-02-18 / BR-040 / RE-05: snapshot BEKU — ditegakkan basis data, bukan
-- disiplin kode. Perubahan aturan tak pernah menyentuh instance berjalan.
CREATE FUNCTION approval_instances_snapshot_beku() RETURNS trigger AS $$
BEGIN
    IF NEW.rule_snapshot IS DISTINCT FROM OLD.rule_snapshot OR NEW.rule_id IS DISTINCT FROM OLD.rule_id THEN
        RAISE EXCEPTION 'rule_snapshot dan rule_id instance persetujuan tidak dapat diubah (SDD-APR-03)'
            USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER approval_instances_snapshot_beku
    BEFORE UPDATE OF rule_snapshot, rule_id ON approval_instances
    FOR EACH ROW EXECUTE FUNCTION approval_instances_snapshot_beku();

CREATE TABLE approval_steps (
    id               bigserial         PRIMARY KEY,
    instance_id      bigint            NOT NULL REFERENCES approval_instances(id),
    urutan           integer           NOT NULL,
    -- Target approver (keputusan 65): pemegang role mana pun (BR-041) atau pengguna tertentu.
    approver_type    text              NOT NULL,
    approver_role_id bigint            REFERENCES roles(id),
    approver_user_id bigint            REFERENCES users(id),
    keputusan        approval_decision,
    catatan          text,
    diputuskan_oleh  bigint            REFERENCES users(id),
    diputuskan_pada  timestamptz,
    -- SDD-APR-07: absolut, ditetapkan saat langkah aktif.
    sla_deadline     timestamptz,
    -- SDD-APR-12: langkah dilewati tetap ditulis, beralasan.
    dilewati         boolean           NOT NULL DEFAULT false,
    alasan_dilewati  text,

    CONSTRAINT approval_steps_urutan_uq UNIQUE (instance_id, urutan),
    CONSTRAINT approval_steps_urutan_positif CHECK (urutan >= 1),
    CONSTRAINT approval_steps_approver_sah CHECK (
        (approver_type = 'role' AND approver_role_id IS NOT NULL AND approver_user_id IS NULL) OR
        (approver_type = 'user' AND approver_user_id IS NOT NULL AND approver_role_id IS NULL)
    ),
    CONSTRAINT approval_steps_dilewati_konsisten
        CHECK (dilewati = (keputusan IS NOT DISTINCT FROM 'DILEWATI')),
    CONSTRAINT approval_steps_dilewati_beralasan CHECK (NOT dilewati OR alasan_dilewati IS NOT NULL),
    CONSTRAINT approval_steps_diputuskan_konsisten CHECK ((keputusan IS NULL) = (diputuskan_pada IS NULL)),
    -- Keputusan manusia wajib berpelaku; langkah dilewati diputuskan sistem.
    CONSTRAINT approval_steps_pemutus_ada
        CHECK (keputusan IS NULL OR keputusan = 'DILEWATI' OR diputuskan_oleh IS NOT NULL)
);

-- SDD-14 §4.2 "SLA approval": langkah belum diputus menurut tenggat.
CREATE INDEX approval_steps_sla_idx ON approval_steps (sla_deadline) WHERE keputusan IS NULL;

-- migrate:down
DROP TABLE IF EXISTS approval_steps;
DROP TRIGGER IF EXISTS approval_instances_snapshot_beku ON approval_instances;
DROP FUNCTION IF EXISTS approval_instances_snapshot_beku();
DROP TABLE IF EXISTS approval_instances;
DROP TABLE IF EXISTS approval_rule_steps;
DROP TABLE IF EXISTS approval_rules;
DROP TYPE IF EXISTS approval_instance_status;
