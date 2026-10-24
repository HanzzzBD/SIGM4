-- PR-05-17: BR-081/082/083/088/092, SDD-DB-13/14, SDD-AVL-14.
-- migrate:up
CREATE TABLE material_balances (
 id bigserial PRIMARY KEY, material_id bigint NOT NULL REFERENCES materials(id), room_id bigint NOT NULL REFERENCES rooms(id),
 saldo integer NOT NULL DEFAULT 0 CHECK(saldo>=0),
 UNIQUE(material_id,room_id)
);
CREATE TABLE material_transactions (
 id bigserial PRIMARY KEY, material_id bigint NOT NULL REFERENCES materials(id), room_id bigint NOT NULL REFERENCES rooms(id),
 jenis material_transaction_type NOT NULL, jumlah integer NOT NULL CHECK(jumlah<>0),
 saldo_sesudah integer NOT NULL CHECK(saldo_sesudah>=0),
 referensi_jenis text NOT NULL CHECK(length(trim(referensi_jenis))>0), referensi_id bigint NOT NULL CHECK(referensi_id>0),
 alasan text, created_by bigint NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL,
 CHECK(jenis NOT IN ('PENYESUAIAN','OPNAME') OR coalesce(length(trim(alasan)),0)>0),
 CHECK(jenis<>'PENERIMAAN' OR jumlah>0), CHECK(jenis<>'PENGELUARAN' OR jumlah<0)
);
CREATE INDEX material_transactions_kartu_stok_idx ON material_transactions(material_id,room_id,created_at DESC,id DESC);
CREATE FUNCTION guard_material_balance() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='INSERT' AND NEW.saldo=0 THEN RETURN NEW; END IF;
 IF pg_trigger_depth()>1 THEN RETURN NEW; END IF;
 RAISE EXCEPTION 'Saldo hanya dapat berubah melalui ledger bahan' USING ERRCODE='23514';
END $$;
CREATE TRIGGER material_balance_guard BEFORE INSERT OR UPDATE OR DELETE ON material_balances FOR EACH ROW EXECUTE FUNCTION guard_material_balance();
CREATE FUNCTION apply_material_transaction() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE previous_balance integer;
BEGIN
 -- Kunci jenis bahan juga menyerialkan perubahan satuan dan evaluasi saldo total.
 PERFORM id FROM materials WHERE id=NEW.material_id FOR UPDATE;
 INSERT INTO material_balances(material_id,room_id,saldo) VALUES(NEW.material_id,NEW.room_id,0) ON CONFLICT(material_id,room_id) DO NOTHING;
 SELECT saldo INTO previous_balance FROM material_balances WHERE material_id=NEW.material_id AND room_id=NEW.room_id FOR UPDATE;
 IF previous_balance::bigint+NEW.jumlah<0 OR previous_balance::bigint+NEW.jumlah>2147483647
   OR NEW.saldo_sesudah::bigint<>previous_balance::bigint+NEW.jumlah THEN
  RAISE EXCEPTION 'Jumlah atau saldo sesudah tidak sesuai ledger bahan' USING ERRCODE='23514';
 END IF;
 UPDATE material_balances SET saldo=NEW.saldo_sesudah WHERE material_id=NEW.material_id AND room_id=NEW.room_id;
 RETURN NEW;
END $$;
CREATE TRIGGER material_transaction_apply BEFORE INSERT ON material_transactions FOR EACH ROW EXECUTE FUNCTION apply_material_transaction();
CREATE FUNCTION immutable_material_transaction() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Ledger bahan tidak dapat diubah atau dihapus' USING ERRCODE='23514'; END $$;
CREATE TRIGGER material_transaction_immutable BEFORE UPDATE OR DELETE ON material_transactions FOR EACH ROW EXECUTE FUNCTION immutable_material_transaction();
CREATE FUNCTION guard_material_unit_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.satuan_id<>OLD.satuan_id AND EXISTS(SELECT 1 FROM material_transactions WHERE material_id=OLD.id) THEN
  RAISE EXCEPTION 'Satuan bahan terkunci setelah transaksi pertama' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER material_unit_change_guard BEFORE UPDATE OF satuan_id ON materials FOR EACH ROW EXECUTE FUNCTION guard_material_unit_change();
-- migrate:down
DROP TRIGGER material_unit_change_guard ON materials;
DROP FUNCTION guard_material_unit_change();
DROP TABLE material_transactions;
DROP TABLE material_balances;
DROP FUNCTION immutable_material_transaction();
DROP FUNCTION apply_material_transaction();
DROP FUNCTION guard_material_balance();
