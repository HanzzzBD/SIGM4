-- PR-05-03/04: check-in dan kewajiban per unit; nilai tarif belum ditentukan produk.
-- migrate:up
ALTER TABLE system_settings DROP CONSTRAINT system_settings_value_tipe;
ALTER TABLE system_settings ADD CONSTRAINT system_settings_value_tipe CHECK (
    CASE tipe
        WHEN 'BILANGAN_BULAT' THEN
            (jsonb_typeof(value)='number' OR (key IN ('denda.tarif_per_hari','denda.cap_nominal') AND value='null'::jsonb))
            AND (jsonb_typeof(nilai_bawaan)='number' OR (key IN ('denda.tarif_per_hari','denda.cap_nominal') AND nilai_bawaan='null'::jsonb))
        WHEN 'DESIMAL' THEN jsonb_typeof(value)='number' AND jsonb_typeof(nilai_bawaan)='number'
        WHEN 'BOOLEAN' THEN jsonb_typeof(value)='boolean' AND jsonb_typeof(nilai_bawaan)='boolean'
        WHEN 'TEKS' THEN jsonb_typeof(value)='string' AND jsonb_typeof(nilai_bawaan)='string'
    END
);
INSERT INTO system_settings(key,kelompok,tipe,value,nilai_bawaan,nilai_min,nilai_maks,deskripsi) VALUES
 ('denda.tarif_per_hari','DENDA','BILANGAN_BULAT','null','null',0,90071992547409,'Tarif rupiah per hari; wajib dikonfigurasi sebelum check-out. Snapshot tetap untuk pinjaman berjalan.'),
 ('denda.cap_nominal','DENDA','BILANGAN_BULAT','null','null',0,90071992547409,'Cap rupiah per unit tanpa nilai perolehan; wajib dikonfigurasi sebelum check-out.'),
 ('denda.kecualikan_hari_libur','DENDA','BOOLEAN','false','false',NULL,NULL,'Kecualikan hari libur pada perhitungan keterlambatan (BR-028c); snapshot saat check-out.')
ON CONFLICT(key) DO NOTHING;
ALTER TABLE loans ADD COLUMN kebijakan_denda jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE loan_items ADD COLUMN nilai_perolehan_snapshot numeric(24,2) CHECK (nilai_perolehan_snapshot >= 0);
CREATE TABLE fines (
    id bigserial PRIMARY KEY,
    loan_item_id bigint NOT NULL REFERENCES loan_items(id), loan_id bigint NOT NULL REFERENCES loans(id),
    peminjam_id bigint NOT NULL REFERENCES users(id), jenis financial_obligation_type NOT NULL,
    hari_terlambat integer NOT NULL DEFAULT 0 CHECK(hari_terlambat>=0),
    tarif_per_hari numeric(24,2) NOT NULL DEFAULT 0 CHECK(tarif_per_hari>=0),
    jumlah_sebelum_cap numeric(24,2), jumlah numeric(24,2),
    menunggu_penetapan boolean NOT NULL DEFAULT false,
    status fine_status NOT NULL DEFAULT 'BELUM_DIBAYAR',
    tanggal_bayar timestamptz, nomor_bukti text,
    jumlah_dibebaskan numeric(24,2) NOT NULL DEFAULT 0,
    alasan_pembebasan text, dibebaskan_oleh bigint REFERENCES users(id),
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by bigint REFERENCES users(id), updated_by bigint REFERENCES users(id),
    UNIQUE(loan_item_id,jenis),
    CHECK ((menunggu_penetapan AND jenis='GANTI_RUGI' AND jumlah IS NULL AND jumlah_sebelum_cap IS NULL)
        OR (NOT menunggu_penetapan AND jumlah IS NOT NULL AND jumlah>=0 AND jumlah_sebelum_cap IS NOT NULL AND jumlah_sebelum_cap>=jumlah)),
    CHECK(jumlah_dibebaskan>=0 AND (jumlah IS NULL OR jumlah_dibebaskan<=jumlah))
);
CREATE INDEX fines_peminjam_idx ON fines(peminjam_id,status);
CREATE TRIGGER fines_set_updated_at BEFORE UPDATE ON fines FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TABLE loan_item_damage_reports (
    loan_item_id bigint PRIMARY KEY REFERENCES loan_items(id),
    damage_report_id bigint NOT NULL REFERENCES damage_reports(id)
);
ALTER TABLE damage_reports ADD COLUMN loan_id bigint REFERENCES loans(id);
-- migrate:down
ALTER TABLE damage_reports DROP COLUMN loan_id;
DROP TABLE loan_item_damage_reports;
DROP TABLE fines;
ALTER TABLE loan_items DROP COLUMN nilai_perolehan_snapshot;
ALTER TABLE loans DROP COLUMN kebijakan_denda;
DELETE FROM system_settings WHERE key IN ('denda.tarif_per_hari','denda.cap_nominal','denda.kecualikan_hari_libur');
ALTER TABLE system_settings DROP CONSTRAINT system_settings_value_tipe;
ALTER TABLE system_settings ADD CONSTRAINT system_settings_value_tipe CHECK (
    CASE tipe
        WHEN 'BILANGAN_BULAT' THEN jsonb_typeof(value)='number' AND jsonb_typeof(nilai_bawaan)='number'
        WHEN 'DESIMAL' THEN jsonb_typeof(value)='number' AND jsonb_typeof(nilai_bawaan)='number'
        WHEN 'BOOLEAN' THEN jsonb_typeof(value)='boolean' AND jsonb_typeof(nilai_bawaan)='boolean'
        WHEN 'TEKS' THEN jsonb_typeof(value)='string' AND jsonb_typeof(nilai_bawaan)='string'
    END
);
