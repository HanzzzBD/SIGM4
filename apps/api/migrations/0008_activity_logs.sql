-- 0008 — activity_logs terpartisi + rantai hash (SDD-05 §4.4, SDD-DB-07/09,
-- AL-01 … AL-10, NFR-S-03d).
--
-- Terpartisi RANGE per bulan SEJAK AWAL, bukan setelah membesar (SDD-DB-07):
-- mempartisi tabel yang sudah berisi jutaan baris menuntut downtime, sementara
-- mempartisinya sejak awal nyaris tanpa biaya.
--
-- Bentuk kolomnya persis SDD-05 §4.4, termasuk `waktu` yang tetap bernama
-- `waktu` (bukan `created_at`) karena ia kolom partisi dan maknanya adalah
-- kapan peristiwa terjadi — pengecualian yang §4.2 sebut tertulis.

-- migrate:up

-- `SDD-05 §4.4` memakai tipe ini, tetapi Bab 11.3 tidak pernah mendaftarkannya
-- sehingga `0002_enums.sql` tidak membuatnya. Nilainya sendiri sudah ditetapkan
-- `AL-07` (sukses/gagal) dan bentuknya oleh `SDD-DB-02` (kode teknis huruf
-- besar); yang tertinggal hanya katalognya, dan itu diperbaiki pada PR ini.
CREATE TYPE activity_result AS ENUM ('SUKSES', 'GAGAL');

CREATE TABLE activity_logs (
    id            bigserial,
    waktu         timestamptz NOT NULL,
    user_id       bigint,
    -- Snapshot, bukan join: nama dan role pelaku dibekukan pada saat aksi,
    -- sehingga log tetap benar setelah orangnya berganti nama atau role.
    user_nama     text,
    role          text,
    ip            inet,
    user_agent    text,
    modul         text        NOT NULL,
    aksi          text        NOT NULL,
    entitas       text,
    entitas_id    bigint,
    nilai_sebelum jsonb,
    nilai_sesudah jsonb,
    keterangan    text,
    hasil         activity_result NOT NULL,   -- SDD-DB-02
    request_id    text,
    -- Rantai hash (NFR-S-03d, AL-03a). SATU rantai untuk seluruh tabel: hanya
    -- entri pertama ber-prev_hash NULL, dan entri pertama tiap bulan menunjuk
    -- entri terakhir bulan sebelumnya. Rantai per partisi akan buta terhadap
    -- penghapusan satu partisi utuh (SDD-05 §4.4).
    prev_hash     bytea,
    row_hash      bytea NOT NULL,
    PRIMARY KEY (id, waktu)
) PARTITION BY RANGE (waktu);

-- Indeks §4.4. Tidak ada GIN pada isi jsonb: SDD-DB-09 menolaknya karena indeks
-- GIN pada kolom yang sering ditulis memperlambat SETIAP tulis di seluruh sistem,
-- sementara FR-18.2 hanya menyaring lewat kolom biasa.
CREATE INDEX activity_logs_waktu_idx    ON activity_logs (waktu DESC);
CREATE INDEX activity_logs_user_idx     ON activity_logs (user_id, waktu DESC);
CREATE INDEX activity_logs_entitas_idx  ON activity_logs (entitas, entitas_id, waktu DESC);
CREATE INDEX activity_logs_aksi_idx     ON activity_logs (modul, aksi, waktu DESC);

-- Partisi bulan berjalan dan tiga bulan ke depan. Selanjutnya dibuat job
-- terjadwal; kegagalannya memicu alarm (SDD-05 §4.4, OBS-05).
DO $$
DECLARE
    awal date := date_trunc('month', now())::date;
    i    int;
    dari date;
    sampai date;
BEGIN
    FOR i IN 0..3 LOOP
        dari   := (awal + (i    || ' month')::interval)::date;
        sampai := (awal + (i + 1 || ' month')::interval)::date;
        EXECUTE format(
            'CREATE TABLE IF NOT EXISTS %I PARTITION OF activity_logs
                 FOR VALUES FROM (%L) TO (%L)',
            'activity_logs_' || to_char(dari, 'YYYY_MM'), dari, sampai);
        -- Pencabutan pada induk TIDAK menutup partisinya: PostgreSQL memeriksa
        -- hak pada relasi yang benar-benar disebut kueri, sehingga
        -- `UPDATE activity_logs_2026_09` akan lolos bila hanya induknya dicabut.
        -- Job pembuat partisi wajib mengulang baris ini (AL-03b).
        EXECUTE format('REVOKE UPDATE, DELETE, TRUNCATE ON %I FROM sigm4_app',
            'activity_logs_' || to_char(dari, 'YYYY_MM'));
    END LOOP;
END
$$;

-- AL-03b: akun aplikasi hanya INSERT dan SELECT. Dicabut SETELAH tabel dibuat,
-- sehingga ia menimpa default privileges 0007 yang memberi keempat hak.
--
-- Pencabutan ini bukan satu-satunya pertahanan, dan memang tidak bisa: AL-03a
-- menyebut sendiri bahwa akses langsung ke basis data berada di luar kendali
-- aplikasi. Yang membuktikan keutuhan adalah rantai hash; REVOKE hanya menutup
-- jalur yang dapat ditutup.
REVOKE UPDATE, DELETE, TRUNCATE ON activity_logs FROM sigm4_app;

-- migrate:down
DROP TABLE IF EXISTS activity_logs;
DROP TYPE IF EXISTS activity_result;
