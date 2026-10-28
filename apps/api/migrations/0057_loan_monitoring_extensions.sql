-- PR-05-05..08: konfigurasi blokir, pemantauan, kewajiban dan perpanjangan.
-- migrate:up
ALTER TABLE system_settings DROP CONSTRAINT system_settings_value_tipe;
ALTER TABLE system_settings ADD CONSTRAINT system_settings_value_tipe CHECK (
 CASE tipe
 WHEN 'BILANGAN_BULAT' THEN
  (jsonb_typeof(value)='number' OR (key IN ('denda.tarif_per_hari','denda.cap_nominal','denda.ambang_blokir') AND value='null'::jsonb))
  AND (jsonb_typeof(nilai_bawaan)='number' OR (key IN ('denda.tarif_per_hari','denda.cap_nominal','denda.ambang_blokir') AND nilai_bawaan='null'::jsonb))
 WHEN 'DESIMAL' THEN jsonb_typeof(value)='number' AND jsonb_typeof(nilai_bawaan)='number'
 WHEN 'BOOLEAN' THEN jsonb_typeof(value)='boolean' AND jsonb_typeof(nilai_bawaan)='boolean'
 WHEN 'TEKS' THEN jsonb_typeof(value)='string' AND jsonb_typeof(nilai_bawaan)='string'
 END);
INSERT INTO system_settings(key,kelompok,tipe,value,nilai_bawaan,nilai_min,nilai_maks,deskripsi)
 VALUES ('denda.ambang_blokir','DENDA','BILANGAN_BULAT','null','null',0,90071992547409,'Ambang rupiah pemblokiran pemohon; wajib dikonfigurasi sebelum pengajuan baru (BR-030).')
 ON CONFLICT(key) DO NOTHING;
ALTER TABLE loans ADD COLUMN tanggal_jatuh_tempo_asli timestamptz;
UPDATE loans SET tanggal_jatuh_tempo_asli=tanggal_jatuh_tempo;
ALTER TABLE loans ADD COLUMN jumlah_perpanjangan integer NOT NULL DEFAULT 0 CHECK(jumlah_perpanjangan>=0);
ALTER TABLE loan_items ADD COLUMN hari_terlambat_terakumulasi integer NOT NULL DEFAULT 0 CHECK(hari_terlambat_terakumulasi>=0);
CREATE TABLE loan_extensions (
 id bigserial PRIMARY KEY, loan_id bigint NOT NULL REFERENCES loans(id),
 pemohon_id bigint NOT NULL REFERENCES users(id), jatuh_tempo_lama timestamptz NOT NULL,
 jatuh_tempo_baru timestamptz NOT NULL, alasan text NOT NULL CHECK(length(trim(alasan))>0),
 status text NOT NULL DEFAULT 'MENUNGGU_PERSETUJUAN' CHECK(status IN ('MENUNGGU_PERSETUJUAN','DISETUJUI','DITOLAK','PERLU_REVISI','KEDALUWARSA','DIBATALKAN')),
 approval_instance_id bigint REFERENCES approval_instances(id), diputuskan_pada timestamptz,
 kedaluwarsa_pada timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), created_by bigint REFERENCES users(id),
 CHECK(jatuh_tempo_baru>jatuh_tempo_lama)
);
CREATE UNIQUE INDEX loan_extensions_pending ON loan_extensions(loan_id) WHERE status='MENUNGGU_PERSETUJUAN';
CREATE TABLE loan_extension_items (
 extension_id bigint NOT NULL REFERENCES loan_extensions(id),
 loan_item_id bigint NOT NULL REFERENCES loan_items(id), slot_id bigint NOT NULL REFERENCES booking_slots(id),
 PRIMARY KEY(extension_id,loan_item_id), UNIQUE(slot_id)
);
CREATE TABLE fine_actions (
 id bigserial PRIMARY KEY, fine_id bigint NOT NULL REFERENCES fines(id), aksi text NOT NULL,
 jumlah numeric(24,2), alasan text, oleh bigint NOT NULL REFERENCES users(id), pada timestamptz NOT NULL
);
CREATE TABLE compensation_proposals (
 id bigserial PRIMARY KEY, fine_id bigint NOT NULL REFERENCES fines(id),
 jumlah numeric(24,2) NOT NULL CHECK(jumlah>0), alasan text NOT NULL CHECK(length(trim(alasan))>0),
 status text NOT NULL DEFAULT 'MENUNGGU' CHECK(status IN ('MENUNGGU','DISETUJUI','DITOLAK')),
 diusulkan_oleh bigint NOT NULL REFERENCES users(id), diusulkan_pada timestamptz NOT NULL,
 diputuskan_oleh bigint REFERENCES users(id), diputuskan_pada timestamptz, catatan_keputusan text
);
CREATE UNIQUE INDEX compensation_proposals_pending ON compensation_proposals(fine_id) WHERE status='MENUNGGU';
CREATE TABLE borrower_blocks (
 user_id bigint PRIMARY KEY REFERENCES users(id), aktif boolean NOT NULL DEFAULT false,
 alasan jsonb NOT NULL DEFAULT '[]', updated_at timestamptz NOT NULL
);
CREATE TABLE loan_daily_events (
 loan_id bigint NOT NULL REFERENCES loans(id), tanggal date NOT NULL, jenis text NOT NULL,
 jatuh_tempo timestamptz NOT NULL, PRIMARY KEY(loan_id,tanggal,jenis,jatuh_tempo)
);
CREATE TABLE loan_recap_days(tanggal date PRIMARY KEY);
CREATE INDEX loans_due_open ON loans(tanggal_jatuh_tempo,id) WHERE tanggal_kembali IS NULL;
-- migrate:down
DROP INDEX loans_due_open;
DROP TABLE loan_recap_days;
DROP TABLE loan_daily_events;
DROP TABLE borrower_blocks;
DROP TABLE compensation_proposals;
DROP TABLE fine_actions;
DROP TABLE loan_extension_items;
DROP TABLE loan_extensions;
ALTER TABLE loan_items DROP COLUMN hari_terlambat_terakumulasi;
ALTER TABLE loans DROP COLUMN jumlah_perpanjangan;
ALTER TABLE loans DROP COLUMN tanggal_jatuh_tempo_asli;
DELETE FROM system_settings WHERE key='denda.ambang_blokir';
ALTER TABLE system_settings DROP CONSTRAINT system_settings_value_tipe;
ALTER TABLE system_settings ADD CONSTRAINT system_settings_value_tipe CHECK (
 CASE tipe
 WHEN 'BILANGAN_BULAT' THEN
  (jsonb_typeof(value)='number' OR (key IN ('denda.tarif_per_hari','denda.cap_nominal') AND value='null'::jsonb))
  AND (jsonb_typeof(nilai_bawaan)='number' OR (key IN ('denda.tarif_per_hari','denda.cap_nominal') AND nilai_bawaan='null'::jsonb))
 WHEN 'DESIMAL' THEN jsonb_typeof(value)='number' AND jsonb_typeof(nilai_bawaan)='number'
 WHEN 'BOOLEAN' THEN jsonb_typeof(value)='boolean' AND jsonb_typeof(nilai_bawaan)='boolean'
 WHEN 'TEKS' THEN jsonb_typeof(value)='string' AND jsonb_typeof(nilai_bawaan)='string'
 END);
