-- PR-05-19/20/31; inventory is not reserved by requests or approval.
-- migrate:up
ALTER TYPE material_request_status ADD VALUE IF NOT EXISTS 'PERLU_REVISI';
ALTER TYPE material_request_status ADD VALUE IF NOT EXISTS 'DISETUJUI_SEBAGIAN';
ALTER TYPE material_request_status ADD VALUE IF NOT EXISTS 'DITUTUP';
ALTER TABLE system_settings DROP CONSTRAINT system_settings_value_tipe;
ALTER TABLE system_settings ADD CONSTRAINT system_settings_value_tipe CHECK (
 CASE tipe
 WHEN 'BILANGAN_BULAT' THEN
  (jsonb_typeof(value)='number' OR (key IN ('denda.tarif_per_hari','denda.cap_nominal','denda.ambang_blokir','bahan.ambang_permintaan_default') AND value='null'::jsonb))
  AND (jsonb_typeof(nilai_bawaan)='number' OR (key IN ('denda.tarif_per_hari','denda.cap_nominal','denda.ambang_blokir','bahan.ambang_permintaan_default') AND nilai_bawaan='null'::jsonb))
 WHEN 'DESIMAL' THEN
  (jsonb_typeof(value)='number' OR (key IN ('maintenance.ambang_persetujuan_estimasi','maintenance.ambang_penggantian_persen') AND value='null'::jsonb))
  AND (jsonb_typeof(nilai_bawaan)='number' OR (key IN ('maintenance.ambang_persetujuan_estimasi','maintenance.ambang_penggantian_persen') AND nilai_bawaan='null'::jsonb))
 WHEN 'BOOLEAN' THEN jsonb_typeof(value)='boolean' AND jsonb_typeof(nilai_bawaan)='boolean'
 WHEN 'TEKS' THEN jsonb_typeof(value)='string' AND jsonb_typeof(nilai_bawaan)='string' END);

INSERT INTO system_settings(key,kelompok,tipe,value,nilai_bawaan,nilai_min,nilai_maks,deskripsi)
 VALUES ('bahan.ambang_permintaan_default','BAHAN','BILANGAN_BULAT','null','null',0,2147483647,'Batas jumlah per jenis bahan tanpa approval. Wajib dikonfigurasi; jumlah tepat batas langsung disetujui. Override per bahan tersedia di detail bahan.') ON CONFLICT(key) DO NOTHING;
CREATE TABLE material_approval_thresholds (
 material_id bigint PRIMARY KEY REFERENCES materials(id), batas integer NOT NULL CHECK(batas>=0),
 updated_at timestamptz NOT NULL, updated_by bigint NOT NULL REFERENCES users(id)
);
CREATE TABLE material_requests (
 id bigserial PRIMARY KEY, nomor text NOT NULL UNIQUE CHECK(nomor ~ '^PMB-[0-9]{4}-[0-9]{4,}$'),
 pemohon_id bigint NOT NULL REFERENCES users(id), keperluan text NOT NULL CHECK(length(trim(keperluan)) BETWEEN 1 AND 2000),
 status material_request_status NOT NULL, revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 approval_instance_id bigint REFERENCES approval_instances(id), diserahkan_oleh bigint REFERENCES users(id), diserahkan_pada timestamptz,
 approved_at timestamptz,
 catatan_penutupan text, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL,
 created_by bigint NOT NULL REFERENCES users(id), updated_by bigint REFERENCES users(id)
);
CREATE INDEX material_requests_pemohon_idx ON material_requests(pemohon_id,status,id DESC);
CREATE TABLE material_request_items (
 id bigserial PRIMARY KEY, material_request_id bigint NOT NULL REFERENCES material_requests(id), revision integer NOT NULL,
 material_id bigint NOT NULL REFERENCES materials(id), room_id bigint NOT NULL REFERENCES rooms(id),
 satuan_id bigint NOT NULL REFERENCES material_units(id), snapshot jsonb NOT NULL,
 jumlah_diminta integer NOT NULL CHECK(jumlah_diminta>0), jumlah_disetujui integer CHECK(jumlah_disetujui BETWEEN 0 AND jumlah_diminta),
 jumlah_diserahkan integer NOT NULL DEFAULT 0 CHECK(jumlah_diserahkan>=0 AND jumlah_diserahkan<=coalesce(jumlah_disetujui,0)),
 UNIQUE(material_request_id,revision,material_id,room_id)
);
CREATE TABLE material_request_cycles (
 request_id bigint NOT NULL REFERENCES material_requests(id), revision integer NOT NULL, approval_instance_id bigint REFERENCES approval_instances(id),
 threshold_snapshot jsonb NOT NULL, items_snapshot jsonb NOT NULL, created_at timestamptz NOT NULL,
 PRIMARY KEY(request_id,revision)
);
CREATE TABLE material_issues (
 id bigserial PRIMARY KEY, request_id bigint NOT NULL REFERENCES material_requests(id), nama_penerima text NOT NULL CHECK(length(trim(nama_penerima)) BETWEEN 1 AND 200),
 tanggal_serah date NOT NULL, catatan text, created_at timestamptz NOT NULL, created_by bigint NOT NULL REFERENCES users(id)
);
CREATE TABLE material_issue_items (
 issue_id bigint NOT NULL REFERENCES material_issues(id), item_id bigint NOT NULL REFERENCES material_request_items(id),
 jumlah integer NOT NULL CHECK(jumlah>0), transaction_id bigint NOT NULL UNIQUE REFERENCES material_transactions(id), PRIMARY KEY(issue_id,item_id)
);
CREATE FUNCTION immutable_material_cycle() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Snapshot siklus permintaan bahan tidak dapat diubah atau dihapus' USING ERRCODE='23514'; END $$;
CREATE TRIGGER material_cycles_immutable BEFORE UPDATE OR DELETE ON material_request_cycles FOR EACH ROW EXECUTE FUNCTION immutable_material_cycle();
-- migrate:down
DROP TABLE material_issue_items;
DROP TABLE material_issues;
DROP TABLE material_request_cycles;
DROP FUNCTION immutable_material_cycle();
DROP TABLE material_request_items;
DROP TABLE material_requests;
DROP TABLE material_approval_thresholds;
DELETE FROM system_settings WHERE key='bahan.ambang_permintaan_default';
ALTER TABLE system_settings DROP CONSTRAINT system_settings_value_tipe;
ALTER TABLE system_settings ADD CONSTRAINT system_settings_value_tipe CHECK (
 CASE tipe
 WHEN 'BILANGAN_BULAT' THEN
  (jsonb_typeof(value)='number' OR (key IN ('denda.tarif_per_hari','denda.cap_nominal','denda.ambang_blokir') AND value='null'::jsonb))
  AND (jsonb_typeof(nilai_bawaan)='number' OR (key IN ('denda.tarif_per_hari','denda.cap_nominal','denda.ambang_blokir') AND nilai_bawaan='null'::jsonb))
 WHEN 'DESIMAL' THEN
  (jsonb_typeof(value)='number' OR (key IN ('maintenance.ambang_persetujuan_estimasi','maintenance.ambang_penggantian_persen') AND value='null'::jsonb))
  AND (jsonb_typeof(nilai_bawaan)='number' OR (key IN ('maintenance.ambang_persetujuan_estimasi','maintenance.ambang_penggantian_persen') AND nilai_bawaan='null'::jsonb))
 WHEN 'BOOLEAN' THEN jsonb_typeof(value)='boolean' AND jsonb_typeof(nilai_bawaan)='boolean'
 WHEN 'TEKS' THEN jsonb_typeof(value)='string' AND jsonb_typeof(nilai_bawaan)='string' END);

-- Enum values retained on rollback, matching other additive enum migrations.
