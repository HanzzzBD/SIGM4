-- PR-05-02 / BR-027, DP-05a: bukti privat tetap di registri AV M-06.
-- migrate:up
ALTER TABLE loans ADD COLUMN signature_file_id bigint REFERENCES stored_files(id);
CREATE TABLE loan_item_photos (
    id bigserial PRIMARY KEY,
    loan_item_id bigint NOT NULL REFERENCES loan_items(id),
    file_id bigint NOT NULL REFERENCES stored_files(id),
    tahap text NOT NULL CHECK (tahap IN ('AWAL','AKHIR')),
    urutan integer NOT NULL CHECK (urutan BETWEEN 1 AND 5),
    UNIQUE (loan_item_id,tahap,urutan), UNIQUE(file_id)
);
-- migrate:down
DROP TABLE loan_item_photos;
ALTER TABLE loans DROP COLUMN signature_file_id;
