import { describe, expect, it } from "vitest";
import { DummyDriver, Kysely, PostgresAdapter, PostgresIntrospector, PostgresQueryCompiler } from "kysely";
import type { CompiledQuery, DatabaseConnection } from "kysely";
import { createAuthContext } from "../../../src/shared/auth/index.js";
import type { Database } from "../../../src/shared/db/index.js";
import { createLocationRepository } from "../../../src/modules/m03-locations/repositories/location.repository.js";

function database() {
    const queries: CompiledQuery[] = [];
    class Driver extends DummyDriver {
        override async acquireConnection(): Promise<DatabaseConnection> {
            const connection = await super.acquireConnection();
            return { ...connection, executeQuery: async <R>(query: CompiledQuery) => { queries.push(query); return { rows: [] as R[] }; } };
        }
    }
    const db = new Kysely<Database>({ dialect: { createDriver: () => new Driver(), createAdapter: () => new PostgresAdapter(), createQueryCompiler: () => new PostgresQueryCompiler(), createIntrospector: (kysely) => new PostgresIntrospector(kysely) } });
    return { db, queries };
}

describe("PR-01-21/22 — scope dan kueri lokasi", () => {
    it("location.view tanpa asset.view dapat membaca hitungan, aset dihapuskan dikecualikan", async () => {
        const { db, queries } = database();
        const ctx = createAuthContext({ userId: 1, roleCode: "R-04", scopes: new Map([["location.view", "all"]]) });
        await expect(createLocationRepository(db).assetCounts(ctx)).resolves.toEqual([]);
        expect(queries[0]?.sql).toContain('where "dihapuskan" = $1 group by "room_id"');
        expect(queries[0]?.parameters).toEqual([false]);
        await db.destroy();
    });
    it("restricted berlaku pada hitungan dan ekspor; saringan ekspor seluruhnya AND serta parameterized", async () => {
        const { db, queries } = database();
        const ctx = createAuthContext({ userId: 1, roleCode: "R-07", scopes: new Map([["location.view", "all"], ["asset.view", "restricted"], ["report.export", "all"]]) });
        const repo = createLocationRepository(db);
        await repo.assetCounts(ctx);
        expect(queries[0]?.sql).toContain('"boleh_dipinjam_siswa" = $2');
        await repo.exportAssets(ctx, 3, { format: "xlsx", q: "PC' OR 1=1", kategori_id: 4, kondisi: "BAIK", status: "TERSEDIA" });
        expect(queries[1]?.sql).toContain('"room_id" = $1 and "dihapuskan" = $2 and "category_id" = $3 and "kondisi" = $4 and "status" = $5 and "boleh_dipinjam_siswa" = $6 and (');
        expect(queries[1]?.sql).not.toContain("PC' OR 1=1");
        expect(queries[1]?.sql).not.toContain("limit");
        expect(queries[1]?.parameters.slice(0, 6)).toEqual(["3", false, "4", "BAIK", "TERSEDIA", true]);
        await db.destroy();
    });
});
