import { describe, expect, it } from "vitest";
import { DummyDriver, Kysely, PostgresAdapter, PostgresIntrospector, PostgresQueryCompiler } from "kysely";
import type { CompiledQuery, DatabaseConnection } from "kysely";
import { createAuthContext } from "../../../src/shared/auth/index.js";
import type { Scope } from "../../../src/shared/auth/index.js";
import type { Database } from "../../../src/shared/db/index.js";
import { createAssetRepository } from "../../../src/modules/m04-assets/repositories/asset.repository.js";
import { createLocationRepository } from "../../../src/modules/m03-locations/repositories/location.repository.js";
import { AssetExportHttpQuerySchema } from "../../../src/modules/m04-assets/schemas/asset.schema.js";
function database(job = false) {
    const queries: CompiledQuery[] = [];
    class Driver extends DummyDriver { override async acquireConnection(): Promise<DatabaseConnection> {
        const connection = await super.acquireConnection(); return { ...connection, executeQuery: async <R>(query: CompiledQuery) => { queries.push(query); return { rows: (job && query.sql.includes('from "asset_import_jobs"') ? [{ id: "7" }] : []) as R[] }; } };
    } }
    const db = new Kysely<Database>({ dialect: { createDriver: () => new Driver(), createAdapter: () => new PostgresAdapter(), createQueryCompiler: () => new PostgresQueryCompiler(), createIntrospector: (kysely) => new PostgresIntrospector(kysely) } }); return { db, queries };
}
describe("PR-01-22/PR-02-47 scope ekspor dan filter", () => {
    it.each(["all", "own", "assigned", "restricted"] as const)("scope report.export %s berlaku tanpa permission tampilan, tidak ada LIMIT", async (scope: Scope) => {
        const { db, queries } = database(); const ctx = createAuthContext({ userId: 1, roleCode: "R-02", scopes: new Map([["report.export", scope]]) });
        try { await createAssetRepository(db).exportRows(ctx, { q: "PC' OR 1=1", sort: "-nama", kondisi: "BAIK", status: "TERSEDIA", dapatDipinjam: false, qrTerpasang: false, tahunPerolehan: 2026, categoryId: 4, roomId: 3 }, false); await createLocationRepository(db).exportAssets(ctx, 3, { format: "xlsx" });
            for (const q of queries) { expect(q.sql).not.toMatch(/limit|offset/); expect(q.sql).not.toMatch(/nilai_perolehan|sumber_perolehan/); expect(q.sql).toContain('"dihapuskan" ='); if (scope === "own") expect(q.sql).toContain('"created_by" ='); if (scope === "assigned") expect(q.sql).toContain('"penanggung_jawab_id" ='); if (scope === "restricted") expect(q.sql).toContain('"boleh_dipinjam_siswa" ='); }
            expect(queries[0]?.sql).not.toContain("OR 1=1"); expect(queries[0]?.parameters).toContain("%PC' OR 1=1%"); expect(queries[0]?.sql).toContain('order by "nama" desc, "id" desc'); expect(queries[0]?.parameters).toContain(false);
        } finally { await db.destroy(); }
    });
    it("scope asset.view beririsan dengan report.export; scope finansial assigned memakai CASE", async () => {
        const { db, queries } = database(); const ctx = createAuthContext({ userId: 1, roleCode: "R-02", scopes: new Map([["asset.view", "assigned"], ["report.export", "own"], ["asset.view_financial", "assigned"]]) });
        try { await createAssetRepository(db).exportRows(ctx, { sort: "kode_barang" }, true); expect(queries[0]?.sql).toContain('"penanggung_jawab_id" ='); expect(queries[0]?.sql).toContain('"created_by" ='); expect(queries[0]?.sql).toContain("case when assets.penanggung_jawab_id ="); } finally { await db.destroy(); }
    });
    it("impor orang lain ditolak; impor sendiri dibatasi job yang dipilih", async () => {
        const ctx = createAuthContext({ userId: 1, roleCode: "R-02", scopes: new Map([["report.export", "all"]]) });
        for (const own of [false, true]) { const { db, queries } = database(own); try {
            const request = createAssetRepository(db).exportRows(ctx, { importJobId: 7, sort: "kode_barang" }, false);
            if (own) { await request; expect(queries[1]?.sql).toContain('"import_job_id" ='); } else await expect(request).rejects.toMatchObject({ kode: "NOT_FOUND" });
            expect(queries[0]?.parameters).toEqual(["7", "1"]);
        } finally { await db.destroy(); } }
    });
    it("query menolak paginasi/format/filter tidak sah dan mempertahankan false", () => {
        expect(AssetExportHttpQuerySchema.parse({ format: "xlsx", "filter[dapat_dipinjam]": "false" })["filter[dapat_dipinjam]"]).toBe(false);
        for (const q of [{ format: "csv" }, { format: "pdf", page: 2 }, { format: "pdf", "filter[kondisi]": "x" }]) expect(AssetExportHttpQuerySchema.safeParse(q).success).toBe(false);
    });
});
