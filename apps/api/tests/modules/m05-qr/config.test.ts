import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { QrConfigResponseSchema } from "@sigm4/schemas";
import { registry } from "../../../src/api/index.js";
import { qrConfigRoute, qrRouter } from "../../../src/modules/m05-qr/index.js";
import { AuditLogger } from "../../../src/shared/audit/index.js";
import { FixedClock } from "../../../src/shared/clock/index.js";
import { createDb } from "../../../src/shared/db/index.js";

describe("domain label QR runtime (FR-05.1/FR-05.2)", () => {
    const base = "https://sigm4.sekolah.test";
    const db = createDb({ connectionString: "postgres://unused@127.0.0.1:1/unused", poolSize: 1 });
    const clock = new FixedClock(new Date("2026-10-15T01:00:00Z"));
    const app = express();
    app.use(qrRouter({ db, auditLogger: new AuditLogger({ clock }), appBaseUrl: base, pdf: { render: () => Promise.resolve(Buffer.alloc(0)) } },
        () => (_req, _res, next) => next(), () => (_req, res) => { res.sendStatus(401); }));
    const server = createServer(app);
    let origin = "";
    beforeAll(async () => {
        await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
        origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    });
    afterAll(async () => { await new Promise<void>(resolve => server.close(() => resolve())); await db.destroy(); });
    it("mengirim origin pencetak PDF melalui HTTP lokal tanpa data privat atau koneksi DB", async () => {
        const response = await fetch(origin + qrConfigRoute.path);
        expect(response.status).toBe(200);
        expect(QrConfigResponseSchema.parse(await response.json())).toEqual({ success: true, data: { app_base_url: base }, meta: null });
        expect(response.headers.get("cache-control")).toBe("public, max-age=300");
    });
    it("terdaftar publik, sementara resolver UUID tetap memerlukan izin", async () => {
        expect(registry.all()).toContainEqual(qrConfigRoute);
        expect(qrConfigRoute.public).toBe(true);
        expect((await fetch(origin + "/assets/by-uuid/3f2b1c9a-1d2e-4f5a-8b6c-7d8e9f0a1b2c")).status).toBe(401);
    });
});
