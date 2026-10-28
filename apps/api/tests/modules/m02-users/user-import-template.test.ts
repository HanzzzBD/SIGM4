// PR-01-19 — `GET /users/import/template` (IMPT-05, P-62). Kolom dibaca dari tabel E.5.2 PRD
// saat uji berjalan; sheet pertama (yang dibaca impor) HANYA header; contoh lolos skema impor;
// tanpa `user.create` ditolak sebelum handler; "template" tidak tertangkap `/users/import/:id`.

import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import type { RequestHandler } from "express";
import ExcelJS from "exceljs";
import type { Kysely } from "kysely";
import { describe, expect, it } from "vitest";
import { awalRantai, ujungRantai } from "../../../src/api/chain.js";
import { usersRouter } from "../../../src/modules/m02-users/index.js";
import { ImportUserRowSchema } from "../../../src/modules/m02-users/schemas/user-import.schema.js";
import { KOLOM_TEMPLAT_PENGGUNA, userImportTemplate } from "../../../src/modules/m02-users/services/user-import-template.js";
import { authorize, createAuthContext, setAuthContext } from "../../../src/shared/auth/index.js";
import { AuditLogger } from "../../../src/shared/audit/index.js";
import { FixedClock } from "../../../src/shared/clock/index.js";
import type { Database } from "../../../src/shared/db/index.js";
import { Logger } from "../../../src/shared/observability/index.js";
import { penerbitPalsu, pengelolaPalsu } from "../../helpers/auth.js";
import { AKAR } from "../../helpers/bab113.js";

function kolomPrd(): string[] {
    const teks = readFileSync(new URL("docs/PRD/00-foundation/conventions.md", AKAR), "utf8").replace(/\r\n/g, "\n");
    const bagian = teks.split("**E.5.2 Impor Pengguna**")[1]!.split("**E.5.3")[0]!;
    return [...bagian.matchAll(/^\|\s*`([a-z_]+)`\s*\|/gm)].map((m) => m[1]!);
}

async function bacaWorkbook(buf: Buffer): Promise<ExcelJS.Workbook> {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    return wb;
}

describe("template impor pengguna dari API (E.5.2, IMPT-05)", () => {
    it("kolom persis tabel E.5.2 PRD dan berurutan", () => {
        expect([...KOLOM_TEMPLAT_PENGGUNA]).toEqual(kolomPrd());
    });

    it("sheet pertama 'Pengguna' HANYA header; contoh di sheet 'Contoh' dan lolos ImportUserRowSchema", async () => {
        const wb = await bacaWorkbook(await userImportTemplate());
        expect(wb.worksheets.map((s) => s.name)).toEqual(["Pengguna", "Petunjuk", "Contoh"]);
        const pertama = wb.worksheets[0]!;
        expect(pertama.rowCount).toBe(1);
        expect((pertama.getRow(1).values as unknown[]).slice(1)).toEqual(kolomPrd());
        const contoh = wb.getWorksheet("Contoh")!;
        expect(contoh.rowCount).toBe(4);
        for (let i = 2; i <= contoh.rowCount; i++) {
            const sel = (contoh.getRow(i).values as unknown[]).slice(1);
            const data = Object.fromEntries(KOLOM_TEMPLAT_PENGGUNA.map((k, j) => [k, sel[j] === "" || sel[j] === undefined ? undefined : String(sel[j])]));
            expect(String(data["email"]).endsWith(".example")).toBe(true);
            expect(ImportUserRowSchema.safeParse(data).success, String(data["nama_lengkap"])).toBe(true);
        }
    });

    function buka(permissions: readonly string[]) {
        const app = express();
        app.use(awalRantai({ security: { objectStorageOrigin: "http://minio:9000" } }));
        app.use((_req, res, next) => {
            setAuthContext(res, createAuthContext({ userId: 1, roleCode: "ADMIN", scopes: new Map(permissions.map((p) => [p, "all"])) }));
            next();
        });
        const lolos = (): RequestHandler => (_req, _res, next) => next();
        const clock = new FixedClock(new Date("2026-10-11T00:00:00Z"));
        const logger = new Logger({ clock, tulis: () => undefined });
        // Handler templat tidak menyentuh basis data.
        const db = {} as Kysely<Database>;
        app.use("/api/v1", usersRouter({ db, penerbitPassword: penerbitPalsu, pengelolaDuaFaktor: pengelolaPalsu, auditLogger: new AuditLogger({ clock }), logger }, lolos, authorize));
        app.use(ujungRantai({ limiter: { hit: () => Promise.resolve({ lolos: true, batas: 100, sisa: 99, resetDetik: 60 }) }, logger }));
        const server = createServer(app);
        return new Promise<{ url: string; tutup: () => Promise<void> }>((r) =>
            server.listen(0, "127.0.0.1", () => r({ url: `http://127.0.0.1:${String((server.address() as AddressInfo).port)}/api/v1/users/import/template`, tutup: () => new Promise((t) => server.close(() => t())) })),
        );
    }

    it("dengan user.create → 200 XLSX berlampiran template_pengguna.xlsx (bukan ditangkap /users/import/:id)", async () => {
        const { url, tutup } = await buka(["user.create"]);
        try {
            const res = await fetch(url);
            expect(res.status).toBe(200);
            expect(res.headers.get("content-type")).toContain("spreadsheetml.sheet");
            expect(res.headers.get("content-disposition")).toContain("template_pengguna.xlsx");
            const wb = await bacaWorkbook(Buffer.from(await res.arrayBuffer()));
            expect(wb.worksheets[0]!.name).toBe("Pengguna");
        } finally {
            await tutup();
        }
    });

    it("tanpa user.create → 403 INSUFFICIENT_PERMISSION", async () => {
        const { url, tutup } = await buka(["user.view"]);
        try {
            const res = await fetch(url);
            expect(res.status).toBe(403);
            expect(((await res.json()) as { error: { code: string } }).error.code).toBe("INSUFFICIENT_PERMISSION");
        } finally {
            await tutup();
        }
    });
});
