-- PR-04-08/09/10/18; 0059 dimiliki sesi PR-04-07. Expand saja.
-- migrate:up
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS checklist jsonb NOT NULL DEFAULT '[]';
ALTER TABLE work_orders ADD COLUMN alasan_tertunda text;
ALTER TABLE work_orders ADD COLUMN tanggal_lanjut date;
ALTER TABLE work_orders ADD COLUMN rekomendasi text;
ALTER TABLE work_orders ADD COLUMN kondisi_pasca asset_condition;
ALTER TABLE work_orders ADD COLUMN diverifikasi_oleh bigint REFERENCES users(id);
ALTER TABLE work_orders ADD COLUMN diverifikasi_pada timestamptz;
ALTER TABLE work_orders ADD COLUMN catatan_verifikasi text;
ALTER TABLE work_orders ADD COLUMN estimasi_diusulkan numeric(15,2) CHECK(estimasi_diusulkan>=0);
ALTER TABLE work_orders ADD COLUMN status_estimasi text NOT NULL DEFAULT 'TIDAK_ADA' CHECK(status_estimasi IN ('TIDAK_ADA','MENUNGGU','DISETUJUI','DITOLAK'));
ALTER TABLE work_orders ADD COLUMN alasan_estimasi text;
ALTER TABLE work_orders ADD COLUMN estimasi_diputuskan_oleh bigint REFERENCES users(id);
ALTER TABLE work_orders ADD COLUMN estimasi_diputuskan_pada timestamptz;
CREATE TABLE work_order_costs (
 id bigserial PRIMARY KEY, work_order_id bigint NOT NULL REFERENCES work_orders(id),
 deskripsi text NOT NULL CHECK(length(trim(deskripsi)) BETWEEN 1 AND 500),
 jumlah numeric(12,3) NOT NULL CHECK(jumlah>0), harga_satuan numeric(15,2) NOT NULL CHECK(harga_satuan>=0),
 total numeric(15,2) NOT NULL CHECK(total>=0)
);
CREATE INDEX work_order_costs_order_idx ON work_order_costs(work_order_id);
CREATE TABLE work_order_photos (
 id bigserial PRIMARY KEY, work_order_id bigint NOT NULL REFERENCES work_orders(id),
 file_id bigint NOT NULL UNIQUE REFERENCES stored_files(id), urutan integer NOT NULL CHECK(urutan>=0),
 created_at timestamptz NOT NULL DEFAULT now(), created_by bigint REFERENCES users(id),
 UNIQUE(work_order_id,urutan)
);
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
INSERT INTO system_settings(key,kelompok,tipe,value,nilai_bawaan,nilai_min,nilai_maks,deskripsi) VALUES
 ('maintenance.ambang_persetujuan_estimasi','MAINTENANCE','DESIMAL','null','null',0,999999999999,'Ambang rupiah estimasi revisi yang memerlukan persetujuan Petugas/Admin; wajib dikonfigurasi.'),
 ('maintenance.ambang_penggantian_persen','MAINTENANCE','DESIMAL','null','null',0,1000,'Persentase biaya kumulatif terhadap nilai perolehan untuk rekomendasi penggantian; wajib dikonfigurasi.')
 ON CONFLICT(key) DO NOTHING;
-- migrate:down
DELETE FROM system_settings WHERE key IN ('maintenance.ambang_persetujuan_estimasi','maintenance.ambang_penggantian_persen');
DROP TABLE work_order_photos;
DROP TABLE work_order_costs;
ALTER TABLE work_orders DROP COLUMN estimasi_diputuskan_pada, DROP COLUMN estimasi_diputuskan_oleh,
 DROP COLUMN alasan_estimasi, DROP COLUMN status_estimasi, DROP COLUMN estimasi_diusulkan,
 DROP COLUMN catatan_verifikasi, DROP COLUMN diverifikasi_pada, DROP COLUMN diverifikasi_oleh,
 DROP COLUMN kondisi_pasca, DROP COLUMN rekomendasi, DROP COLUMN tanggal_lanjut, DROP COLUMN alasan_tertunda;
-- checklist dipertahankan untuk generator 0059; rollback produksi memerlukan rencana migrasi data.

ALTER TABLE system_settings DROP CONSTRAINT system_settings_value_tipe;
ALTER TABLE system_settings ADD CONSTRAINT system_settings_value_tipe CHECK (
 CASE tipe
 WHEN 'BILANGAN_BULAT' THEN
  (jsonb_typeof(value)='number' OR (key IN ('denda.tarif_per_hari','denda.cap_nominal','denda.ambang_blokir') AND value='null'::jsonb))
  AND (jsonb_typeof(nilai_bawaan)='number' OR (key IN ('denda.tarif_per_hari','denda.cap_nominal','denda.ambang_blokir') AND nilai_bawaan='null'::jsonb))
 WHEN 'DESIMAL' THEN jsonb_typeof(value)='number' AND jsonb_typeof(nilai_bawaan)='number'
 WHEN 'BOOLEAN' THEN jsonb_typeof(value)='boolean' AND jsonb_typeof(nilai_bawaan)='boolean'
 WHEN 'TEKS' THEN jsonb_typeof(value)='string' AND jsonb_typeof(nilai_bawaan)='string' END);
