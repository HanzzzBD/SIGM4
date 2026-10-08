import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { dbmate, kueri } from "../helpers/db.js";

it("prasyarat skema mutasi: DATABASE_URL wajib", () => {
    expect(process.env["DATABASE_URL"], "PostgreSQL nyata diperlukan (SDD-DB-25).").toBeTruthy();
});
describe.skipIf(!process.env["DATABASE_URL"])("SDD-DB-25 migration berita acara", () => {
    const tag = randomUUID().slice(0, 8);
    let owner: string;
    beforeAll(async () => {
        dbmate("up");
        owner = (await kueri<{ id: string }>(`INSERT INTO users (nama,email,password_hash,nip_nis,role_id,status,must_change_password)
            VALUES ('Uji skema mutasi','mutasi-${tag}@sekolah.sch.id','x','MS${tag}',
                (SELECT id FROM roles WHERE kode='R-01'),'AKTIF',false) RETURNING id::text`))[0]!.id;
    });
    afterAll(async () => { if (owner !== undefined) await kueri(`DELETE FROM users WHERE id=${owner}`); });
    it("menolak snapshot kosong/lebih dari 50 dan status SIAP tanpa berkas", async () => {
        for (const snapshot of ["{}", '{"aset":[]}', JSON.stringify({ aset: Array.from({ length: 51 }, () => ({})) })]) {
            await expect(kueri(`INSERT INTO asset_movement_documents(snapshot,object_key,created_by)
                VALUES ('${snapshot}'::jsonb,'${randomUUID()}',${owner})`))
                .rejects.toMatchObject({ code: "23514", constraint: "asset_movement_documents_snapshot" });
        }
        await expect(kueri(`INSERT INTO asset_movement_documents(snapshot,object_key,created_by,status,selesai_pada)
            VALUES ('{"aset":[{}]}'::jsonb,'${randomUUID()}',${owner},'SIAP',now())`))
            .rejects.toMatchObject({ code: "23514", constraint: "asset_movement_documents_terminal" });
    });
    it("down/up mempertahankan aset dan riwayat lama serta memulihkan jenis berkas", async () => {
        const migration = readFileSync(new URL("../../migrations/0042_asset_movement_documents.sql", import.meta.url), "utf8");
        await kueri(`BEGIN;
            DO $$ DECLARE b bigint; a bigint; r bigint; c bigint; aset bigint;
            BEGIN
                INSERT INTO buildings(nama,kode) VALUES ('Rollback','MB${tag}') RETURNING id INTO b;
                INSERT INTO areas(building_id,nama,kode) VALUES (b,'Rollback','MA${tag}') RETURNING id INTO a;
                INSERT INTO rooms(area_id,nama,kode,jenis) VALUES (a,'Rollback','MR${tag}','GUDANG') RETURNING id INTO r;
                INSERT INTO asset_categories(nama,kode) VALUES ('Rollback','MC${tag}') RETURNING id INTO c;
                INSERT INTO assets(kode_barang,nama,category_id,tahun_perolehan,sumber_perolehan,room_id,kondisi)
                    VALUES ('MOVE-${tag}','Aset dipertahankan',c,2026,'PEMBELIAN',r,'BAIK') RETURNING id INTO aset;
                INSERT INTO asset_movements(asset_id,room_asal_id,room_tujuan_id,tanggal,alasan,dilakukan_oleh)
                    VALUES (aset,r,r,'2026-10-08','Riwayat lama',${owner});
                PERFORM set_config('sigm4.rollback_movement_asset',aset::text,true);
                INSERT INTO stored_files(object_key,mime,ukuran,owner_type,owner_id,uploaded_by)
                    VALUES ('schema-${tag}','application/pdf',10,'ASSET_MOVEMENT_DOCUMENT',123,${owner});
            END $$;
            ${migration.split("-- migrate:down")[1]}
            DO $$ BEGIN
                IF to_regclass('asset_movement_documents') IS NOT NULL THEN RAISE EXCEPTION 'tabel belum dihapus'; END IF;
                IF NOT EXISTS (SELECT 1 FROM assets WHERE id=current_setting('sigm4.rollback_movement_asset')::bigint)
                    OR NOT EXISTS (SELECT 1 FROM asset_movements WHERE asset_id=current_setting('sigm4.rollback_movement_asset')::bigint)
                    THEN RAISE EXCEPTION 'aset/riwayat ikut terhapus'; END IF;
                IF NOT EXISTS (SELECT 1 FROM stored_files WHERE object_key='schema-${tag}' AND owner_id IS NULL AND owner_type='ASSET_DOCUMENT')
                    THEN RAISE EXCEPTION 'berkas belum menjadi yatim'; END IF;
            END $$;
            ${migration.split("-- migrate:up")[1]?.split("-- migrate:down")[0]}
            ROLLBACK;`);
        expect(await kueri("SELECT to_regclass('asset_movement_documents')::text name")).toEqual([{ name: "asset_movement_documents" }]);
    });
    it("snapshot dan kunci objek tidak dapat disunting setelah transaksi", async () => {
        const id = (await kueri<{ id: string }>(`INSERT INTO asset_movement_documents(snapshot,object_key,created_by)
            VALUES ('{"aset":[{}]}'::jsonb,'immutable-${tag}',${owner}) RETURNING id::text`))[0]!.id;
        try {
            await expect(kueri(`UPDATE asset_movement_documents SET snapshot='{"aset":[{},{}]}'::jsonb WHERE id=${id}`)).rejects.toMatchObject({ code: "23514" });
            await expect(kueri(`UPDATE asset_movement_documents SET object_key='changed' WHERE id=${id}`)).rejects.toMatchObject({ code: "23514" });
        } finally { await kueri(`DELETE FROM asset_movement_documents WHERE id=${id}`); }
    });
});
