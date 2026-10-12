import { DummyDriver, Kysely, PostgresAdapter, PostgresIntrospector, PostgresQueryCompiler } from "kysely";
import type { CompiledQuery, DatabaseConnection } from "kysely";
import { describe, expect, it } from "vitest";
import { createAuthContext } from "../../../src/shared/auth/index.js";
import type { Scope } from "../../../src/shared/auth/index.js";
import type { Database } from "../../../src/shared/db/index.js";
import { createAssetDocumentRepository } from "../../../src/modules/m06-documents/repositories/asset-document.repository.js";
import { ListAllDocumentsQuerySchema } from "../../../src/modules/m06-documents/schemas/document.schema.js";

function database() {
    const queries: CompiledQuery[] = [];
    class Driver extends DummyDriver {
        override async acquireConnection(): Promise<DatabaseConnection> {
            const connection = await super.acquireConnection();
            return { ...connection, executeQuery: async <R>(query: CompiledQuery) => { queries.push(query); return { rows: (query.sql.startsWith('select count(*) as "n"') ? [{ n: "0" }] : []) as R[] }; } };
        }
    }
    const db = new Kysely<Database>({ dialect: { createDriver: () => new Driver(), createAdapter: () => new PostgresAdapter(), createQueryCompiler: () => new PostgresQueryCompiler(), createIntrospector: (kysely) => new PostgresIntrospector(kysely) } });
    return { db, queries };
}
const auth = (scope: Scope, roleCode = "R-02") => createAuthContext({ userId: 7, roleCode, scopes: new Map([["asset_document.view", scope], ["asset_document.manage", scope]]) });

describe("PR-03-29 daftar dan scope dokumen", () => {
    it("validasi filter/paginasi menolak enum, kategori dan ukuran halaman tidak sah", () => {
        expect(ListAllDocumentsQuerySchema.parse({}).per_page).toBe(25);
        for (const q of [{ jenis: "FOTO" }, { page: 0 }, { per_page: 200 }, { kategori_id: -1 }, { garansi: "besok" }]) expect(ListAllDocumentsQuerySchema.safeParse(q).success).toBe(false);
    });
    it.each(["own", "assigned", "restricted", "all"] as const)("scope %s diterapkan pada daftar, hitungan, unduh dan lepas", async (scope) => {
        const { db, queries } = database();
        try {
            const repo = createAssetDocumentRepository(db);
            const ctx = auth(scope);
            await repo.daftarLintasAset(ctx, { q: "faktur%_' OR 1=1", jenis: "GARANSI", kategoriId: 3, garansi: "BERAKHIR_30_HARI", hariIni: "2026-10-11", batasGaransi: "2026-11-10", page: 2, perPage: 25, sort: "garansi_selesai" });
            expect(queries).toHaveLength(2);
            for (const query of queries) {
                expect(query.sql).toContain('"l"."aktif" =');
                expect(query.sql).toContain('"d"."dihapus" =');
                expect(query.sql).not.toContain("OR 1=1");
                expect(query.parameters).toContain("%faktur\\%\\_' OR 1=1%");
                expect(query.parameters).toContain("2026-10-11");
                expect(query.parameters).toContain("2026-11-10");
                if (scope === "own") expect(query.sql).toContain("d.created_by =");
                if (scope === "assigned") expect(query.sql).toContain('"a"."penanggung_jawab_id" =');
                if (scope === "restricted") expect(query.sql).toContain("and false");
            }
            await repo.daftarUntukAset(ctx, 11);
            await repo.padaAset(ctx, 11, 3);
            await repo.padaAset(ctx, 11, 3, true);
            for (const query of queries.slice(2)) {
                if (scope === "own") expect(query.sql).toContain("d.created_by =");
                if (scope === "assigned") expect(query.sql).toContain('"a"."penanggung_jawab_id" =');
                if (scope === "restricted") expect(query.sql).toContain("and false");
            }
            if (scope === "assigned") expect(queries[2]?.sql).toContain('"a2"."penanggung_jawab_id" =');
        } finally { await db.destroy(); }
    });
    it("Siswa tetap tidak memperoleh dokumen; scope assigned menolak aset tambahan di luar penugasan", async () => {
        const { db, queries } = database();
        try {
            const repo = createAssetDocumentRepository(db);
            await repo.daftarUntukAset(auth("all", "R-07"), 11);
            expect(queries[0]?.sql).toContain("and false");
            await expect(repo.asetDiLuarScope(auth("assigned"), [11, 12])).resolves.toEqual([11, 12]);
            expect(queries[1]?.sql).toContain('"penanggung_jawab_id" =');
        } finally { await db.destroy(); }
    });
});
