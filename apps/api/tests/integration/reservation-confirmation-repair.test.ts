import { readFileSync } from "node:fs";
import pg from "pg";
import { beforeAll, describe, expect, it } from "vitest";
import { dbmate, kueri } from "../helpers/db.js";

const migration = readFileSync(new URL("../../migrations/0074_reservation_item_confirmation_repair.sql", import.meta.url), "utf8");
const [up, down] = migration.split("-- migrate:up")[1]!.split("-- migrate:down");
describe.skipIf(!process.env["DATABASE_URL"])("UX-012 confirmation schema repair", () => {
    beforeAll(() => { dbmate("up"); }, 120000);
    it("fresh migration chain exposes the nullable timestamp", async () => {
        expect(await kueri("SELECT data_type,is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name='reservation_items' AND column_name='confirmed_at'"))
            .toEqual([{ data_type: "timestamp with time zone", is_nullable: "YES" }]);
    });
    for (const partial of [false, true]) it(`repairs ${partial ? "partial" : "legacy missing-column"} schema using historical evidence, reapply and rollback preserve data`, async () => {
        const db = new pg.Client({ connectionString: process.env["DATABASE_URL"] });
        await db.connect();
        try {
            await db.query("BEGIN");
            await db.query(`CREATE TEMP TABLE reservations(id bigint, parent_id bigint, jenis text, status text);
                CREATE TEMP TABLE reservation_items(reservation_id bigint${partial ? ", confirmed_at timestamptz" : ""});
                CREATE TEMP TABLE loans(reservation_id bigint,tanggal_pinjam timestamptz);
                CREATE TEMP TABLE approval_instances(referensi_id bigint,jenis_pengajuan text,status text,diselesaikan_pada timestamptz);
                INSERT INTO reservations VALUES (1,NULL,'ASET','MENUNGGU_PERSETUJUAN'),(2,NULL,'ASET','DISETUJUI'),(3,20,'ASET','DISETUJUI'),(4,NULL,'ASET','BERLANGSUNG'),(5,NULL,'ASET','DITOLAK'),(6,NULL,'ASET','DISETUJUI');
                INSERT INTO reservation_items(reservation_id) VALUES (1),(2),(3),(4),(5),(6);
                INSERT INTO approval_instances VALUES (2,'RESERVASI_ASET','DISETUJUI','2026-10-01T01:00:00Z'),(20,'RESERVASI_ASET','DISETUJUI','2026-10-02T01:00:00Z'),(5,'RESERVASI_ASET','DITOLAK','2026-10-03T01:00:00Z');
                INSERT INTO loans VALUES (4,'2026-10-04T01:00:00Z');`);
            if (partial) await db.query("UPDATE reservation_items SET confirmed_at='2026-09-30T01:00:00Z' WHERE reservation_id=2");
            await db.query(up!);
            const values = async () => (await db.query("SELECT reservation_id,confirmed_at FROM reservation_items ORDER BY reservation_id")).rows.map(r => r.confirmed_at?.toISOString() ?? null);
            const expected = [null, partial ? "2026-09-30T01:00:00.000Z" : "2026-10-01T01:00:00.000Z", "2026-10-02T01:00:00.000Z", "2026-10-04T01:00:00.000Z", null, null];
            expect(await values()).toEqual(expected);
            await db.query(up!); expect(await values()).toEqual(expected);
            await db.query(down!); expect(await values()).toEqual(expected);
        } finally { await db.query("ROLLBACK"); await db.end(); }
    });
});
