-- PR-04-02/03, FR-08.2/3, BR-024b: expand; penggunaan ruangan gabungan
-- terpisah dari status serah terima aset (keputusan produk 13 Oktober 2026).
-- migrate:up
CREATE TABLE reservation_items (
    id bigserial PRIMARY KEY,
    reservation_id bigint NOT NULL REFERENCES reservations(id),
    asset_id bigint NOT NULL REFERENCES assets(id),
    jumlah integer NOT NULL DEFAULT 1 CHECK (jumlah = 1),
    confirmed_at timestamptz,
    UNIQUE (reservation_id, asset_id)
);
CREATE INDEX reservation_items_asset_idx ON reservation_items(asset_id, reservation_id);
ALTER TABLE reservations ADD COLUMN lokasi_penggunaan text CHECK (length(lokasi_penggunaan) <= 200);
ALTER TABLE reservations ADD COLUMN status_penggunaan_ruangan reservation_status;
ALTER TABLE reservations DROP CONSTRAINT reservations_penggunaan_ck;
ALTER TABLE reservations ADD CONSTRAINT reservations_penggunaan_ck CHECK (
    (penggunaan_dicatat_oleh IS NULL) = (penggunaan_dicatat_pada IS NULL)
    AND (kondisi_ruangan IS NULL OR (penggunaan_dicatat_pada IS NOT NULL
         AND (status='SELESAI' OR (jenis='ASET' AND room_id IS NOT NULL AND COALESCE(status_penggunaan_ruangan='SELESAI',false)))))
);
INSERT INTO system_settings (key,kelompok,tipe,value,nilai_bawaan,nilai_min,deskripsi)
SELECT 'reservasi.durasi_maksimum_' || lower(replace(kode,'-','_')) || '_hari', 'RESERVASI', 'BILANGAN_BULAT',
       to_jsonb(CASE WHEN kode='R-07' THEN 3 ELSE 7 END), to_jsonb(CASE WHEN kode='R-07' THEN 3 ELSE 7 END),1,
       'Durasi maksimum reservasi aset untuk role ' || nama || ' (BR-021), dalam hari kalender.'
FROM roles WHERE kode IN ('R-01','R-02','R-05','R-06','R-07')
ON CONFLICT (key) DO NOTHING;
-- migrate:down
DELETE FROM system_settings WHERE key IN (
    'reservasi.durasi_maksimum_r_01_hari', 'reservasi.durasi_maksimum_r_02_hari',
    'reservasi.durasi_maksimum_r_05_hari', 'reservasi.durasi_maksimum_r_06_hari',
    'reservasi.durasi_maksimum_r_07_hari'
);
ALTER TABLE reservations DROP CONSTRAINT reservations_penggunaan_ck;
ALTER TABLE reservations DROP COLUMN status_penggunaan_ruangan;
ALTER TABLE reservations DROP COLUMN lokasi_penggunaan;
ALTER TABLE reservations ADD CONSTRAINT reservations_penggunaan_ck CHECK (
    (penggunaan_dicatat_oleh IS NULL) = (penggunaan_dicatat_pada IS NULL)
    AND (kondisi_ruangan IS NULL OR (status='SELESAI' AND penggunaan_dicatat_pada IS NOT NULL))
);
DROP TABLE reservation_items;
