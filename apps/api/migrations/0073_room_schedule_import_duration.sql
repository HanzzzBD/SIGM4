-- PR-03-35/38: expand, E.5.3/IMPT-01..05 dan FR-20.1.
-- migrate:up
INSERT INTO system_settings (key,kelompok,tipe,value,nilai_bawaan,nilai_min,nilai_maks,deskripsi)
VALUES ('reservasi.durasi_maksimum_jam','RESERVASI','BILANGAN_BULAT','12','12',1,24,
 'Durasi maksimum setiap kemunculan reservasi ruangan dalam jam, termasuk pengajuan mendesak dan berulang. Tidak mengubah reservasi yang sudah diajukan.')
ON CONFLICT (key) DO NOTHING;

CREATE TABLE room_schedule_import_jobs (
 id bigserial PRIMARY KEY,
 file_hash char(64) NOT NULL,
 nama_berkas varchar(255) NOT NULL,
 status varchar(16) NOT NULL CHECK (status IN ('MENUNGGU','BERJALAN','SELESAI','GAGAL')),
 total_baris integer NOT NULL,
 baris_terproses integer NOT NULL DEFAULT 0,
 sukses integer NOT NULL DEFAULT 0,
 gagal integer NOT NULL DEFAULT 0,
 laporan_gagal jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(laporan_gagal)='array'),
 berkas bytea,
 pesan_galat text,
 selesai_pada timestamptz,
 report_purged_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 created_by bigint NOT NULL REFERENCES users(id), updated_by bigint REFERENCES users(id),
 CHECK (total_baris>0 AND baris_terproses BETWEEN 0 AND total_baris AND sukses>=0 AND gagal>=0 AND sukses+gagal=baris_terproses),
 CHECK ((status IN ('MENUNGGU','BERJALAN') AND selesai_pada IS NULL) OR
        (status IN ('SELESAI','GAGAL') AND selesai_pada IS NOT NULL AND berkas IS NULL)),
 CHECK (status<>'SELESAI' OR baris_terproses=total_baris)
);
CREATE TRIGGER room_schedule_import_jobs_updated BEFORE UPDATE ON room_schedule_import_jobs FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX room_schedule_import_replay_idx ON room_schedule_import_jobs(created_by,file_hash,created_at DESC);
CREATE INDEX room_schedule_import_updated_by_idx ON room_schedule_import_jobs(updated_by);
CREATE INDEX room_schedule_import_retention_idx ON room_schedule_import_jobs(selesai_pada,id)
 WHERE status IN ('SELESAI','GAGAL') AND report_purged_at IS NULL;
-- Aturan yang sudah ada tidak diubah. Kunci ruangan menserialisasi pemeriksaan duplikat dan pembuatan.
CREATE INDEX room_fixed_schedule_import_match_idx ON room_fixed_schedules(room_id,hari,berlaku_mulai,berlaku_sampai) WHERE status='AKTIF';

-- migrate:down
DROP INDEX IF EXISTS room_fixed_schedule_import_match_idx;
DROP TABLE IF EXISTS room_schedule_import_jobs;
DELETE FROM system_settings WHERE key='reservasi.durasi_maksimum_jam';
