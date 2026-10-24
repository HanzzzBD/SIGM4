-- PR-05-32: expand registry foto aset; penautan dikelola PR pengelolaan aset.
-- migrate:up
CREATE TABLE asset_photos (
    id bigserial PRIMARY KEY,
    asset_id bigint NOT NULL REFERENCES assets(id),
    file_id bigint NOT NULL REFERENCES stored_files(id),
    urutan integer NOT NULL DEFAULT 0 CHECK (urutan >= 0),
    is_primary boolean NOT NULL DEFAULT false,
    diunggah_oleh bigint NOT NULL REFERENCES users(id),
    UNIQUE (asset_id, file_id)
);
CREATE INDEX asset_photos_asset_order_idx ON asset_photos (asset_id, urutan, id);
CREATE UNIQUE INDEX asset_photos_primary_uq ON asset_photos (asset_id) WHERE is_primary;
-- migrate:down
DROP TABLE asset_photos;
