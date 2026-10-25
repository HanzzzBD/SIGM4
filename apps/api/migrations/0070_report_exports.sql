-- migrate:up
ALTER TYPE file_owner_type ADD VALUE IF NOT EXISTS 'REPORT_EXPORT';
CREATE TABLE report_exports (
 id bigserial PRIMARY KEY, requester_id bigint NOT NULL REFERENCES users(id),
 jenis text NOT NULL, judul text NOT NULL, format text NOT NULL CHECK(format IN ('XLSX','PDF')),
 filter jsonb NOT NULL, access_hash text NOT NULL, scope_hash text,
 status text NOT NULL DEFAULT 'MENUNGGU' CHECK(status IN ('MENUNGGU','BERJALAN','SIAP','GAGAL','KEDALUWARSA','DIBATALKAN')),
 object_key text NOT NULL UNIQUE, file_id bigint REFERENCES stored_files(id),
 jumlah_baris integer, pesan_galat text, selesai_pada timestamptz, berlaku_sampai timestamptz,
 object_removed_at timestamptz,
 created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL,
 CHECK (jumlah_baris IS NULL OR jumlah_baris BETWEEN 0 AND 100000)
);
CREATE INDEX report_exports_requester_recent ON report_exports(requester_id,created_at DESC,id DESC);
CREATE INDEX report_exports_expiry ON report_exports(berlaku_sampai) WHERE status='SIAP';
GRANT SELECT,INSERT,UPDATE ON report_exports TO sigm4_app;
GRANT USAGE,SELECT ON SEQUENCE report_exports_id_seq TO sigm4_app;
INSERT INTO system_settings(key,kelompok,tipe,value,nilai_bawaan,deskripsi) VALUES
 ('sekolah.nama','IDENTITAS_SEKOLAH','TEKS','""','""','Nama sekolah pada kop laporan. Wajib diisi sebelum ekspor PDF.'),
 ('sekolah.npsn','IDENTITAS_SEKOLAH','TEKS','""','""','NPSN pada kop laporan (opsional).'),
 ('sekolah.alamat','IDENTITAS_SEKOLAH','TEKS','""','""','Alamat sekolah pada kop laporan (opsional).')
ON CONFLICT(key) DO NOTHING;
-- migrate:down
DROP TABLE report_exports;
