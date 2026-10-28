-- PR-05-15/16: master Bahan terpisah dari aset; BR-080/084/091.
-- migrate:up
CREATE TYPE material_status AS ENUM ('AKTIF','NONAKTIF');
CREATE TABLE material_units (
 id bigserial PRIMARY KEY, nama text NOT NULL, simbol text NOT NULL, keterangan text,
 status material_status NOT NULL DEFAULT 'AKTIF',
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 created_by bigint REFERENCES users(id), updated_by bigint REFERENCES users(id)
);
CREATE UNIQUE INDEX material_units_name_uq ON material_units(lower(trim(nama)));
CREATE UNIQUE INDEX material_units_symbol_uq ON material_units(lower(trim(simbol)));
CREATE TRIGGER material_units_updated BEFORE UPDATE ON material_units FOR EACH ROW EXECUTE FUNCTION set_updated_at();
INSERT INTO material_units(nama,simbol,keterangan) VALUES
 ('Rim','rim','Satuan awal untuk kertas'),('Pcs','pcs','Satuan awal untuk barang satuan'),
 ('Botol','botol','Satuan awal untuk kemasan botol'),('Liter','liter','Satuan awal untuk volume'),('Dus','dus','Satuan awal untuk kemasan dus');
CREATE TABLE material_categories (
 id bigserial PRIMARY KEY, nama text NOT NULL, kode text NOT NULL, keterangan text,
 status material_status NOT NULL DEFAULT 'AKTIF',
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 created_by bigint REFERENCES users(id), updated_by bigint REFERENCES users(id)
);
CREATE UNIQUE INDEX material_categories_name_uq ON material_categories(lower(trim(nama)));
CREATE UNIQUE INDEX material_categories_code_uq ON material_categories(lower(trim(kode)));
CREATE TRIGGER material_categories_updated BEFORE UPDATE ON material_categories FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TABLE materials (
 id bigserial PRIMARY KEY, uuid uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE, nama text NOT NULL,
 material_category_id bigint NOT NULL REFERENCES material_categories(id),
 satuan_id bigint NOT NULL REFERENCES material_units(id), stok_minimum integer NOT NULL DEFAULT 0 CHECK(stok_minimum>=0),
 room_id_default bigint NOT NULL REFERENCES rooms(id), keterangan text,
 status material_status NOT NULL DEFAULT 'AKTIF',
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 created_by bigint REFERENCES users(id), updated_by bigint REFERENCES users(id)
);
CREATE UNIQUE INDEX materials_name_category_uq ON materials(material_category_id,lower(trim(nama)));
CREATE INDEX materials_category_status_idx ON materials(material_category_id,status);
CREATE TRIGGER materials_updated BEFORE UPDATE ON materials FOR EACH ROW EXECUTE FUNCTION set_updated_at();
-- migrate:down
DROP TABLE materials;
DROP TABLE material_categories;
DROP TABLE material_units;
DROP TYPE IF EXISTS material_status;
