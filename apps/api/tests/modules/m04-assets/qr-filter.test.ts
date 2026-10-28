import { describe, expect, it } from "vitest";
import { DummyDriver, Kysely, PostgresAdapter, PostgresIntrospector, PostgresQueryCompiler } from "kysely";
import type { CompiledQuery, DatabaseConnection } from "kysely";
import { createAuthContext } from "../../../src/shared/auth/index.js";
import type { Database } from "../../../src/shared/db/index.js";
import { createAssetRepository } from "../../../src/modules/m04-assets/repositories/asset.repository.js";
import { ListAssetsQuerySchema } from "../../../src/modules/m04-assets/schemas/asset.schema.js";

describe("PR-02-50 filter aset tanpa label QR", () => {
    it("false dari URL tetap false; boolean tidak valid ditolak", () => {
        expect(ListAssetsQuerySchema.parse({ qr_terpasang: "false" }).qr_terpasang).toBe(false);
        expect(ListAssetsQuerySchema.safeParse({ qr_terpasang: "tidak" }).success).toBe(false);
    });
    it("filter QR memakai parameter dan tetap membatasi scope serta aset aktif", async () => {
        const queries: CompiledQuery[] = [];
        class Driver extends DummyDriver {
            override async acquireConnection(): Promise<DatabaseConnection> {
                const connection = await super.acquireConnection();
                return { ...connection, executeQuery: async <R>(query: CompiledQuery) => { queries.push(query); return { rows: [] as R[] }; } };
            }
        }
        const db = new Kysely<Database>({ dialect: { createDriver: () => new Driver(), createAdapter: () => new PostgresAdapter(), createQueryCompiler: () => new PostgresQueryCompiler(), createIntrospector: (kysely) => new PostgresIntrospector(kysely) } });
        try {
            const ctx = createAuthContext({ userId: 7, roleCode: "R-07", scopes: new Map([["asset.view", "restricted"]]) });
            await createAssetRepository(db).list(ctx, { qrTerpasang: false, page: 1, perPage: 25, sort: "kode_barang" });
            expect(queries.length).toBeGreaterThan(0);
            for (const q of queries) {
                expect(q.sql).toMatch(/"qr_terpasang" = \$\d+/);
                expect(q.sql).toMatch(/"dihapuskan" = \$\d+/);
                expect(q.sql).toMatch(/"boleh_dipinjam_siswa" = \$\d+/);
                expect(q.parameters).toContain(false);
                expect(q.parameters).toContain(true);
            }
        } finally { await db.destroy(); }
    });
});
