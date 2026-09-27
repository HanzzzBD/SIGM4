-- 0032 — Delegasi approver (PR-02-20; FR-10.2 A3, RE-12). Bentuk mengikuti keputusan
-- 67 log phase-02 (pemilik produk), yang juga menyunting PRD `m10-approval.md` §8:
--   * `approval_delegations`: pemberi menetapkan penerima untuk rentang TANGGAL
--     (inklusif, kalender WIB). Selama berlaku, pemberi digantikan penerimanya pada
--     langkah bertipe `user` MAUPUN `role`;
--   * `approval_steps.atas_nama_user_id`: approver asli bila keputusan diambil
--     penerima delegasi — RE-12 tercatat di data, bukan direkonstruksi dari baris
--     delegasi yang dapat berubah;
--   * `approval_instances.pemohon_id`: BR-039/RE-10 dinilai ulang setiap langkah
--     diaktifkan (SDD-APR-14/16), termasuk sesudah keputusan (PR-02-21) — mesin tak
--     mengenal tabel pengajuan (SDD-APR-09), jadi pemohon disimpan di instance. NULLABLE
--     karena expand; mesin selalu mengisinya.

-- migrate:up

CREATE TABLE approval_delegations (
    id           bigserial   PRIMARY KEY,
    pemberi_id   bigint      NOT NULL REFERENCES users(id),
    penerima_id  bigint      NOT NULL REFERENCES users(id),
    mulai        date        NOT NULL,
    selesai      date        NOT NULL,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),
    created_by   bigint      REFERENCES users(id),
    updated_by   bigint      REFERENCES users(id),

    CONSTRAINT approval_delegations_bukan_diri CHECK (pemberi_id <> penerima_id),
    CONSTRAINT approval_delegations_rentang_sah CHECK (mulai <= selesai),
    -- Satu pemberi, satu penerima per tanggal: resolusi approver harus deterministik.
    CONSTRAINT approval_delegations_tanpa_tumpang EXCLUDE USING gist (
        pemberi_id WITH =,
        daterange(mulai, selesai, '[]') WITH &&
    )
);

-- Penerima: "delegasi apa saja yang saya terima" (linimasa, kotak masuk).
CREATE INDEX approval_delegations_penerima_idx ON approval_delegations (penerima_id, mulai, selesai);

CREATE TRIGGER approval_delegations_set_updated_at
    BEFORE UPDATE ON approval_delegations
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- RE-12: approver asli; NULL bila pemutus bertindak atas namanya sendiri.
ALTER TABLE approval_steps
    ADD COLUMN atas_nama_user_id bigint REFERENCES users(id);

-- BR-039: pemohon instance.
ALTER TABLE approval_instances
    ADD COLUMN pemohon_id bigint REFERENCES users(id);

-- migrate:down
ALTER TABLE approval_instances DROP COLUMN IF EXISTS pemohon_id;
ALTER TABLE approval_steps DROP COLUMN IF EXISTS atas_nama_user_id;
DROP TABLE IF EXISTS approval_delegations;
