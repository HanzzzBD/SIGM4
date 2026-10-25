-- PR-05-01 / FR-09.1, BR-026a: expand; satu realisasi per tanggal reservasi.
-- migrate:up
ALTER TABLE reservations ADD COLUMN bypass_approval boolean NOT NULL DEFAULT false;
ALTER TABLE reservations ADD COLUMN alasan_bypass text;
ALTER TABLE reservations ADD CONSTRAINT reservations_bypass_ck CHECK (
    NOT bypass_approval OR (jenis='ASET' AND alasan_bypass IS NOT NULL AND length(trim(alasan_bypass)) BETWEEN 1 AND 500)
);
CREATE TABLE loans (
    id bigserial PRIMARY KEY,
    nomor text NOT NULL UNIQUE CHECK (nomor ~ '^PJM-[0-9]{4}-[0-9]{4,}$'),
    reservation_id bigint NOT NULL UNIQUE REFERENCES reservations(id),
    peminjam_id bigint NOT NULL REFERENCES users(id),
    petugas_serah_id bigint NOT NULL REFERENCES users(id),
    nama_penerima text NOT NULL CHECK (length(trim(nama_penerima)) BETWEEN 1 AND 200),
    diwakilkan boolean NOT NULL DEFAULT false,
    tanggal_pinjam timestamptz NOT NULL,
    tanggal_jatuh_tempo timestamptz NOT NULL,
    tanggal_kembali timestamptz,
    status loan_status NOT NULL DEFAULT 'DIPINJAM',
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by bigint REFERENCES users(id), updated_by bigint REFERENCES users(id),
    CHECK (tanggal_pinjam < tanggal_jatuh_tempo),
    CHECK (tanggal_kembali IS NULL OR tanggal_kembali >= tanggal_pinjam)
);
CREATE INDEX loans_peminjam_idx ON loans(peminjam_id,status);
CREATE INDEX loans_jatuh_tempo_idx ON loans(tanggal_jatuh_tempo) WHERE status IN ('DIPINJAM','SEBAGIAN_DIKEMBALIKAN','TERLAMBAT');
CREATE TRIGGER loans_set_updated_at BEFORE UPDATE ON loans FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TABLE loan_items (
    id bigserial PRIMARY KEY,
    loan_id bigint NOT NULL REFERENCES loans(id), asset_id bigint NOT NULL REFERENCES assets(id),
    allocated_asset_id bigint NOT NULL REFERENCES assets(id),
    alasan_substitusi text,
    slot_id bigint NOT NULL UNIQUE REFERENCES booking_slots(id),
    kondisi_awal asset_condition NOT NULL,
    kondisi_akhir asset_condition,
    tidak_lengkap boolean NOT NULL DEFAULT false,
    status_kembali text NOT NULL DEFAULT 'BELUM_KEMBALI' CHECK (status_kembali IN ('BELUM_KEMBALI','DIKEMBALIKAN','HILANG')),
    tanggal_kembali timestamptz,
    petugas_kembali_id bigint REFERENCES users(id),
    catatan_pengembalian text CHECK (length(catatan_pengembalian)<=1000),
    UNIQUE(loan_id,asset_id),
    CHECK (allocated_asset_id=asset_id OR (alasan_substitusi IS NOT NULL AND length(trim(alasan_substitusi)) BETWEEN 1 AND 500)),
    CHECK ((status_kembali='BELUM_KEMBALI')=(tanggal_kembali IS NULL)),
    CHECK ((status_kembali='BELUM_KEMBALI')=(kondisi_akhir IS NULL))
);
CREATE UNIQUE INDEX loan_items_active_asset_uq ON loan_items(asset_id) WHERE status_kembali='BELUM_KEMBALI';
ALTER TABLE booking_slots ADD CONSTRAINT booking_slots_loan_fk FOREIGN KEY (loan_id) REFERENCES loans(id);
-- migrate:down
ALTER TABLE booking_slots DROP CONSTRAINT booking_slots_loan_fk;
DROP TABLE loan_items;
DROP TABLE loans;
ALTER TABLE reservations DROP CONSTRAINT reservations_bypass_ck;
ALTER TABLE reservations DROP COLUMN alasan_bypass;
ALTER TABLE reservations DROP COLUMN bypass_approval;
