// Pendahulu PR-02-38: expand/down nyata tanpa menghapus record aset (CD-04/05).
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { dbmate, kueri } from "../helpers/db.js";

it("prasyarat: DATABASE_URL wajib agar skema tidak hijau tanpa diuji", () => {
    expect(process.env["DATABASE_URL"], "PostgreSQL uji diperlukan (CD-04/05).").toBeTruthy();
});

describe.skipIf(!process.env["DATABASE_URL"])("Skema pendahulu impor aset", () => {
    const tag = randomUUID().slice(0, 8);
    let owner: string;
    beforeAll(async () => {
        dbmate("up");
        owner = (await kueri<{ id: string }>(`INSERT INTO users
            (nama,email,password_hash,nip_nis,role_id,status,must_change_password)
            VALUES ('Admin skema impor','skema-impor-${tag}@sekolah.sch.id','x','IS${tag}',
                (SELECT id FROM roles WHERE kode='R-01'),'AKTIF',false) RETURNING id::text`))[0]!.id;
    });
    afterAll(async () => { if (owner !== undefined) await kueri(`DELETE FROM users WHERE id=${owner}`); });
    it("menolak hitungan dan status terminal yang tidak konsisten", async () => {
        await expect(kueri(`INSERT INTO asset_import_jobs
            (file_hash,nama_berkas,status,total_baris,baris_terproses,created_by)
            VALUES ('${"a".repeat(64)}','a.csv','BERJALAN',1,1,${owner})`))
            .rejects.toMatchObject({ code: "23514", constraint: "asset_import_jobs_counts" });
        await expect(kueri(`INSERT INTO asset_import_jobs
            (file_hash,nama_berkas,status,total_baris,selesai_pada,created_by)
            VALUES ('${"b".repeat(64)}','b.csv','SELESAI',1,now(),${owner})`))
            .rejects.toMatchObject({ code: "23514", constraint: "asset_import_jobs_complete" });
        await expect(kueri(`INSERT INTO asset_import_jobs
            (file_hash,nama_berkas,status,total_baris,baris_terproses,sukses,unit_dibuat,selesai_pada,berkas,created_by)
            VALUES ('${"c".repeat(64)}','c.csv','SELESAI',1,1,1,1,now(),'data'::bytea,${owner})`))
            .rejects.toMatchObject({ code: "23514", constraint: "asset_import_jobs_terminal" });
    });
    it("down lalu up mempertahankan assets, dan menghapus tabel/enum baru", async () => {
        const before = await kueri<{ n: string }>("SELECT count(*)::text n FROM assets");
        const migration = readFileSync(new URL("../../migrations/0041_asset_import_jobs.sql", import.meta.url), "utf8");
        // DDL sementara dalam satu transaksi, rollback memulihkan skema dan data.
        const down = migration.split("-- migrate:down")[1];
        expect(down).toBeDefined();
        await kueri(`BEGIN;
            DO $$ DECLARE category_id bigint; building_id bigint; area_id bigint; room_id bigint; job_id bigint; asset_id bigint;
            BEGIN
                INSERT INTO asset_categories(nama,kode) VALUES ('Rollback impor','RK${tag}') RETURNING id INTO category_id;
                INSERT INTO buildings(nama,kode) VALUES ('Rollback impor','RB${tag}') RETURNING id INTO building_id;
                INSERT INTO areas(building_id,nama,kode) VALUES (building_id,'Rollback impor','RA${tag}') RETURNING id INTO area_id;
                INSERT INTO rooms(area_id,nama,kode,jenis) VALUES (area_id,'Rollback impor','RR${tag}','GUDANG') RETURNING id INTO room_id;
                INSERT INTO asset_import_jobs(file_hash,nama_berkas,status,total_baris,baris_terproses,sukses,unit_dibuat,selesai_pada,created_by)
                    VALUES ('${"d".repeat(64)}','rollback.csv','SELESAI',1,1,1,1,now(),${owner}) RETURNING id INTO job_id;
                INSERT INTO assets(kode_barang,nama,category_id,tahun_perolehan,sumber_perolehan,room_id,kondisi,import_job_id)
                    VALUES ('ROLLBACK-${tag}','Aset tetap ada',category_id,2026,'PEMBELIAN',room_id,'BAIK',job_id) RETURNING id INTO asset_id;
                PERFORM set_config('sigm4.rollback_asset',asset_id::text,true);
            END $$;
            ${down}
            DO $$ BEGIN
                IF to_regclass('asset_import_jobs') IS NOT NULL THEN RAISE EXCEPTION 'tabel masih ada'; END IF;
                IF EXISTS (SELECT 1 FROM pg_type WHERE typname='asset_import_status') THEN RAISE EXCEPTION 'enum masih ada'; END IF;
                IF NOT EXISTS (SELECT 1 FROM assets WHERE id=current_setting('sigm4.rollback_asset')::bigint) THEN
                    RAISE EXCEPTION 'aset impor ikut terhapus';
                END IF;
            END $$;
            ${migration.split("-- migrate:up")[1]?.split("-- migrate:down")[0]}
            ROLLBACK;`);
        expect(await kueri("SELECT count(*)::text n FROM assets")).toEqual(before);
        expect(await kueri("SELECT to_regclass('asset_import_jobs')::text name")).toEqual([{ name: "asset_import_jobs" }]);
    });
});
