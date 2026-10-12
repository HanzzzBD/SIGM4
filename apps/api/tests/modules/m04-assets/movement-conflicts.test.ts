import { afterEach, describe, expect, it, vi } from "vitest";
import { DummyDriver, Kysely, PostgresAdapter, PostgresIntrospector, PostgresQueryCompiler } from "kysely";
import type { CompiledQuery, DatabaseConnection } from "kysely";
import type { Database } from "../../../src/shared/db/index.js";
import { slotPenghalangMutasi } from "../../../src/shared/booking/index.js";
import { assertNoMovementConflicts, movementDay } from "../../../src/modules/m04-assets/services/movement-conflicts.js";
import { mapError } from "../../../src/shared/errors/index.js";
import { AssetService } from "../../../src/modules/m04-assets/services/asset.service.js";
import * as repositories from "../../../src/modules/m04-assets/repositories/asset.repository.js";
import * as documents from "../../../src/modules/m04-assets/repositories/movement-document.repository.js";
import { createAuthContext } from "../../../src/shared/auth/index.js";
import { AuditLogger } from "../../../src/shared/audit/index.js";
import { FixedClock } from "../../../src/shared/clock/index.js";

const slot = { id: "9", resource_id: "2", origin: "reservation", status: "CONFIRMED", reservation_id: "31", loan_id: null, mulai: new Date("2026-10-19T03:00:00Z"), selesai: new Date("2026-10-19T05:00:00Z") };
function database(rows: readonly unknown[] = []) {
    const queries: CompiledQuery[] = [], events: string[] = [];
    class Driver extends DummyDriver {
        override async beginTransaction() { events.push("begin"); }
        override async commitTransaction() { events.push("commit"); }
        override async rollbackTransaction() { events.push("rollback"); }
        override async acquireConnection(): Promise<DatabaseConnection> {
            const connection = await super.acquireConnection();
            return { ...connection, executeQuery: async <R>(query: CompiledQuery) => { queries.push(query); events.push("slots"); return { rows: rows as R[] }; } };
        }
    }
    const db = new Kysely<Database>({ dialect: { createDriver: () => new Driver(), createAdapter: () => new PostgresAdapter(), createQueryCompiler: () => new PostgresQueryCompiler(), createIntrospector: (kysely) => new PostgresIntrospector(kysely) } });
    return { db, queries, events };
}
afterEach(() => vi.restoreAllMocks());
describe("PR-02-48: mutasi pada tanggal berkonflik", () => {
    it.each(["2026-10-19", "2026-12-31", "2028-02-29"])("mencakup satu hari WIB half-open: %s", (date) => {
        const range = movementDay(date);
        expect(range.mulai.toISOString()).toBe(new Date(`${date}T00:00:00+07:00`).toISOString());
        expect(range.selesai.getTime() - range.mulai.getTime()).toBe(86400000);
        expect(range.mulai.getUTCHours()).toBe(17);
    });
    it("SQL membatasi transaksi belum dilepas, reservasi/pinjaman dan irisan tanggal; kosong tidak mengakses DB", async () => {
        const { db, queries } = database();
        try {
            await slotPenghalangMutasi(db, [], movementDay("2026-10-19")); expect(queries).toHaveLength(0);
            await slotPenghalangMutasi(db, [2, 3], movementDay("2026-10-19"));
            expect(queries[0]?.sql).toContain("status IN ('TENTATIVE', 'CONFIRMED', 'ACTIVE')");
            expect(queries[0]?.sql).toContain("origin IN ('reservation', 'loan')");
            expect(queries[0]?.sql).toContain("slot_range && tstzrange"); expect(queries[0]?.sql).toContain("'[)'");
            expect(queries[0]?.parameters).toEqual([["2", "3"], new Date("2026-10-18T17:00:00Z"), new Date("2026-10-19T17:00:00Z")]);
        } finally { await db.destroy(); }
    });
    it("mengirim seluruh referensi transaksi aman melalui details HTTP 409", async () => {
        const { db } = database([slot, { ...slot, id: "10", resource_id: "3", origin: "loan", status: "ACTIVE", reservation_id: null, loan_id: "45" }]);
        try {
            const error = await assertNoMovementConflicts(db, [{ id: "2", kode_barang: "AST-2" }, { id: "3", kode_barang: "AST-3" }], "2026-10-19").catch((e: unknown) => e);
            expect(mapError(error)).toMatchObject({ status: 409, kode: "ASSET_NOT_AVAILABLE", details: [ { field: "asset_ids", message: expect.stringContaining("AST-2: Reservasi #31") }, { field: "asset_ids", message: expect.stringContaining("AST-3: Pinjaman #45") } ] });
        } finally { await db.destroy(); }
    });
    it("aset Tersedia dengan slot di tanggal mutasi membatalkan batch sebelum dokumen, lokasi, riwayat, audit dan outbox", async () => {
        const { db, events } = database([slot]);
        const ctx = createAuthContext({ userId: 1, roleCode: "R-02", scopes: new Map([["asset.update", "all"]]) });
        const clock = new FixedClock(new Date("2026-10-12T00:00:00Z"));
        const audit = new AuditLogger({ clock }); vi.spyOn(audit, "write").mockResolvedValue(true);
        const asset = { id: "2", kode_barang: "AST-2", nama: "Komputer", room_id: "5", status: "TERSEDIA", penanggung_jawab_id: null, nomor_seri: null };
        const repo = { findRuanganAktifById: vi.fn().mockResolvedValue({ id: "6" }), findById: vi.fn().mockImplementation((_ctx: unknown, id: number) => ({ ...asset, id: String(id), kode_barang: `AST-${id}` })), updateLokasi: vi.fn(), insertMutasi: vi.fn() };
        const docs = { lockAssets: vi.fn().mockImplementation(() => events.push("lock")), person: vi.fn().mockResolvedValue({ id: "1", nama: "Petugas", status: "AKTIF" }), location: vi.fn().mockResolvedValue({ id: "5", nama: "Gudang", kode: "GD", area: "Area", gedung: "Gedung" }), create: vi.fn() };
        vi.spyOn(repositories, "createAssetRepository").mockReturnValue(repo as unknown as ReturnType<typeof repositories.createAssetRepository>);
        vi.spyOn(documents, "movementDocumentRepository").mockReturnValue(docs as unknown as ReturnType<typeof documents.movementDocumentRepository>);
        try {
            await expect(new AssetService(db, audit, clock).moveWithDocument(ctx, { assetIds: [2, 3], roomTujuanId: 6, tanggal: "2026-10-19", alasan: "Penataan", penanggungJawabBaruId: null })).rejects.toMatchObject({ kode: "ASSET_NOT_AVAILABLE" });
            expect(events).toEqual(["begin", "lock", "slots", "rollback"]);
            expect(repo.findById).toHaveBeenCalledTimes(2);
            for (const write of [docs.create, repo.updateLokasi, repo.insertMutasi, audit.write]) expect(write).not.toHaveBeenCalled();
        } finally { await db.destroy(); }
    });
});
