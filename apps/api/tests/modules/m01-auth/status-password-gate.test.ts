import { DummyDriver, Kysely, PostgresAdapter, PostgresIntrospector, PostgresQueryCompiler } from "kysely";
import type { CompiledQuery, DatabaseConnection } from "kysely";
import type { Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { createAuthContext, gerbangGantiPassword } from "../../../src/shared/auth/index.js";
import type { Database } from "../../../src/shared/db/index.js";
import { TwoFactorService } from "../../../src/modules/m01-auth/services/two-factor.service.js";
import { createPasswordResetRepository } from "../../../src/modules/m01-auth/repositories/password-reset.repository.js";
const ctx = createAuthContext({ userId: 7, roleCode: "R-02", scopes: new Map() });
function database(row: unknown) {
    const queries: CompiledQuery[] = [];
    class Driver extends DummyDriver {
        override async acquireConnection(): Promise<DatabaseConnection> {
            const connection = await super.acquireConnection();
            return { ...connection, executeQuery: async <R>(query: CompiledQuery) => { queries.push(query); return { rows: [row] as R[] }; } };
        }
    }
    const db = new Kysely<Database>({ dialect: { createDriver: () => new Driver(), createAdapter: () => new PostgresAdapter(), createQueryCompiler: () => new PostgresQueryCompiler(), createIntrospector: (kysely) => new PostgresIntrospector(kysely) } });
    return { db, queries };
}
describe("PR-02-40/41 status dan gerbang password", () => {
    it.each(["login", "refresh", "logout", "logout-all", "password/change", "2fa/verify", "2fa/enroll", "2fa/enroll/confirm"])("hanya POST eksplisit %s diloloskan", (path) => {
        const gate = gerbangGantiPassword("/api/v1/auth/");
        const next = vi.fn(); const res = { locals: { wajibGantiPassword: true } } as unknown as Response;
        gate({ method: "POST", path: `/api/v1/auth/${path}` } as Request, res, next);
        expect(next).toHaveBeenCalledWith();
        next.mockClear(); gate({ method: "GET", path: `/api/v1/auth/${path}` } as Request, res, next);
        expect(next.mock.calls[0]?.[0]).toMatchObject({ kode: "PASSWORD_CHANGE_REQUIRED" });
    });
    it.each(["sessions", "2fa/status", "2fa/backup-codes/regenerate", "password/requests", "password/requests/1/issue", "password/forgot", "password/change/evil", "password/change/", "future-route"])("prefiks auth tidak meloloskan %s", (path) => {
        const next = vi.fn(); gerbangGantiPassword("/api/v1/auth/")({ method: "POST", path: `/api/v1/auth/${path}` } as Request, { locals: { wajibGantiPassword: true } } as unknown as Response, next);
        expect(next.mock.calls[0]?.[0]).toMatchObject({ kode: "PASSWORD_CHANGE_REQUIRED" });
    });
    it.each([null, 0, 2, 3])("status %s hanya membaca metadata sendiri tanpa secret/hash", async (sisa) => {
        const { db, queries } = database({ totp_enabled_at: sisa === null ? null : new Date("2026-10-01T00:00:00Z"), sisa: sisa === null ? "10" : String(sisa) });
        try {
            const result = await new TwoFactorService(db, {} as never, {} as never, {} as never, {} as never).status(ctx);
            expect(result).toMatchObject({ aktif: sisa !== null, sisa_kode_cadangan: sisa ?? 0, kode_cadangan_menipis: sisa !== null && sisa <= 2 });
            expect(queries[0]?.parameters).toEqual(["7"]);
            expect(queries[0]?.sql).toContain('"b"."used_at" is null');
            expect(queries[0]?.sql).not.toMatch(/secret|code_hash/);
            expect(Object.keys(result)).toEqual(["aktif", "diaktifkan_pada", "sisa_kode_cadangan", "kode_cadangan_menipis"]);
        } finally { await db.destroy(); }
    });
    it("reset administratif menghapus seluruh keadaan kunci login dalam UPDATE password yang sama", async () => {
        const { db, queries } = database({});
        try { await createPasswordResetRepository(db).tetapkanPasswordSementara(ctx, "8", "hash-uji");
            expect(queries[0]?.sql).toContain('"locked_until" =');
            expect(queries[0]?.sql).toContain('"failed_login_count" =');
            expect(queries[0]?.sql).toContain('"failed_login_window_start" =');
            expect(queries[0]?.parameters).toEqual(["hash-uji", true, 0, null, null, "8"]);
        } finally { await db.destroy(); }
    });
});
