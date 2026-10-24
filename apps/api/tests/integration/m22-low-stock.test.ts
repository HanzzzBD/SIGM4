import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { MaterialLedgerService, materialLowStock } from "../../src/modules/m22-materials/index.js";
import { createAuthContext } from "../../src/shared/auth/index.js";
import { createSystemAuthContext } from "../../src/shared/auth/system-context.js";
import { FixedClock } from "../../src/shared/clock/index.js";
import { AuditLogger } from "../../src/shared/audit/index.js";
import { getDb, withTransaction } from "../../src/shared/db/index.js";
import { EventHandlerRegistry } from "../../src/shared/events/index.js";
import { pasangKonsumenNotifikasi } from "../../src/modules/m17-notifications/index.js";
import { dbmate, kueri } from "../helpers/db.js";
const clock = new FixedClock(new Date("2026-10-14T03:00:00Z")), audit = new AuditLogger({ clock }), marker = randomUUID().slice(0, 7);
describe.skipIf(!process.env["DATABASE_URL"])("PR-05-22 stock minimum", () => {
    let actor: number, room: number, other: number, unit: number, category: number, count = 0;
    const id = async (q: string) => Number((await kueri<{ id: string }>(q))[0]!.id);
    const ctx = () => createAuthContext({ userId: actor, roleCode: "R-02", scopes: new Map([["material.receive", "all"], ["material.issue", "all"], ["material.view", "all"]]) });
    const material = (minimum = 2, status = "AKTIF") => id(`INSERT INTO materials(nama,material_category_id,satuan_id,room_id_default,stok_minimum,status) VALUES ('Stok ${marker}-${++count}',${category},${unit},${room},${minimum},'${status}') RETURNING id::text`);
    const write = (m: number, delta: number, r = room) => withTransaction(ctx(), s => new MaterialLedgerService(clock, audit).record(s, { materialId: m, roomId: r, delta, jenis: delta > 0 ? "PENERIMAAN" : "PENGELUARAN", referenceKind: "fixture", referenceId: ++count }), getDb());
    const emitted = async (m: number) => Number((await kueri<{ n: string }>(`SELECT count(*)::text n FROM event_outbox WHERE event_name='MaterialLowStock' AND aggregate_id=${m}`))[0]!.n);
    beforeAll(async () => {
        dbmate("up");
        actor = await id(`INSERT INTO users(nama,email,password_hash,nip_nis,role_id,status,must_change_password) VALUES ('Petugas','${randomUUID()}@minimum.test','x','${randomUUID()}',(SELECT id FROM roles WHERE kode='R-02'),'AKTIF',false) RETURNING id::text`);
        const building = await id(`INSERT INTO buildings(nama,kode) VALUES ('Stok','G${marker}') RETURNING id::text`), area = await id(`INSERT INTO areas(building_id,nama,kode) VALUES (${building},'Stok','A${marker}') RETURNING id::text`);
        room = await id(`INSERT INTO rooms(area_id,nama,kode,jenis) VALUES (${area},'Gudang','R${marker}','GUDANG') RETURNING id::text`); other = await id(`INSERT INTO rooms(area_id,nama,kode,jenis) VALUES (${area},'Gudang lain','S${marker}','GUDANG') RETURNING id::text`);
        unit = await id(`INSERT INTO material_units(nama,simbol) VALUES ('Stok ${marker}','U${marker}') RETURNING id::text`); category = await id(`INSERT INTO material_categories(nama,kode) VALUES ('Stok ${marker}','C${marker}') RETURNING id::text`);
    });
    it("counts all locations, emits once on downward equality, rearms only after replenishment", async () => {
        const m = await material(); await write(m, 3); await write(m, 4, other); await write(m, -2); expect(await emitted(m)).toBe(0);
        await write(m, -3, other); expect(await emitted(m)).toBe(1); await write(m, -1); expect(await emitted(m)).toBe(1);
        await write(m, 5); await write(m, -4); expect(await emitted(m)).toBe(2);
        const warning = await withTransaction(ctx(), materialLowStock, getDb()); expect(warning.daftar.find(i => i.id === String(m))).toMatchObject({ saldo: 2, minimum: 2 });
    });
    it("zero minimum, nonactive materials, and receipts below minimum do not publish warnings", async () => {
        for (const [minimum, status] of [[0, "AKTIF"], [2, "NONAKTIF"]] as const) { const m = await material(minimum, status); await write(m, 4); await write(m, -3); expect(await emitted(m)).toBe(0); }
        const m = await material(10); await write(m, 5); expect(await emitted(m)).toBe(0);
    });
    it("20 concurrent issue attempts on stock 10 debit ten units and cross once", async () => {
        const m = await material(3); await write(m, 10); const results = await Promise.allSettled(Array.from({ length: 20 }, () => write(m, -1)));
        expect(results.filter(r => r.status === "fulfilled")).toHaveLength(10); expect(await emitted(m)).toBe(1);
        expect(Number((await kueri<{ saldo: number }>(`SELECT saldo FROM material_balances WHERE material_id=${m}`))[0]!.saldo)).toBe(0);
    });
    it("audit failure rolls back debit and warning; consumer replay does not notify twice", async () => {
        const m = await material(); await write(m, 3); const failed = vi.spyOn(audit, "write").mockRejectedValueOnce(new Error("Audit failed"));
        try { await expect(write(m, -1)).rejects.toThrow("Audit failed"); } finally { failed.mockRestore(); }
        expect(await emitted(m)).toBe(0); await write(m, -1);
        const registry = new EventHandlerRegistry(); pasangKonsumenNotifikasi(registry, { db: getDb, clock, ctx: () => createSystemAuthContext("test-minimum") });
        const e = (await kueri<{ id: string; aggregate_id: string; payload: unknown }>(`SELECT id::text,aggregate_id::text,payload FROM event_outbox WHERE event_name='MaterialLowStock' AND aggregate_id=${m}`))[0]!, event = { id: e.id, name: "MaterialLowStock", aggregateType: "material", aggregateId: e.aggregate_id, payload: e.payload, actorId: null, requestId: null, occurredAt: clock.now(), attempts: 0 };
        const handler = registry.handlersFor("MaterialLowStock")[0]!; await handler(event); await handler(event);
        expect((await kueri<{ n: string }>(`SELECT count(*)::text n FROM notifications WHERE kode='NT-49' AND user_id=${actor} AND referensi_id=${m}`))[0]!.n).toBe("1");
    });
});
