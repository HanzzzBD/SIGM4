// PR-01-25 — `GET /activity-logs/{id}` lewat HTTP tanpa basis data: tanpa `activity_log.view` ditolak SEBELUM
// handler (403), dan segmen literal `/export` tidak tertangkap `/:id` (pemegang view saja → 403 ekspor, bukan 400).

import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import type { RequestHandler } from "express";
import type { Kysely } from "kysely";
import { describe, expect, it } from "vitest";
import { awalRantai, ujungRantai } from "../../../src/api/chain.js";
import { activityLogRouter } from "../../../src/modules/m18-activity-log/index.js";
import { authorize, createAuthContext, setAuthContext } from "../../../src/shared/auth/index.js";
import { AuditLogger } from "../../../src/shared/audit/index.js";
import { FixedClock } from "../../../src/shared/clock/index.js";
import type { Database } from "../../../src/shared/db/index.js";
import { Logger } from "../../../src/shared/observability/index.js";

async function panggil(permissions: readonly string[], path: string): Promise<{ status: number; kode: string | undefined }> {
    const app = express();
    app.use(awalRantai({ security: { objectStorageOrigin: "http://minio:9000" } }));
    app.use((_req, res, next) => {
        setAuthContext(res, createAuthContext({ userId: 1, roleCode: "ADMIN", scopes: new Map(permissions.map((p) => [p, "all"])) }));
        next();
    });
    const lolos = (): RequestHandler => (_req, _res, next) => next();
    const clock = new FixedClock(new Date("2026-10-11T00:00:00Z"));
    const logger = new Logger({ clock, tulis: () => undefined });
    // Penolakan terjadi sebelum handler: basis data tidak pernah disentuh.
    app.use("/api/v1", activityLogRouter({ db: {} as Kysely<Database>, auditLogger: new AuditLogger({ clock }) }, lolos, authorize));
    app.use(ujungRantai({ limiter: { hit: () => Promise.resolve({ lolos: true, batas: 100, sisa: 99, resetDetik: 60 }) }, logger }));
    const server = createServer(app);
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    try {
        const res = await fetch(`http://127.0.0.1:${String((server.address() as AddressInfo).port)}/api/v1${path}`);
        const json = (await res.json().catch(() => ({}))) as { error?: { code?: string } };
        return { status: res.status, kode: json.error?.code };
    } finally {
        await new Promise((r) => server.close(() => r(undefined)));
    }
}

describe("GET /activity-logs/{id} (PR-01-25)", () => {
    it("tanpa activity_log.view → 403 INSUFFICIENT_PERMISSION", async () => {
        expect(await panggil(["user.view"], "/activity-logs/5")).toEqual({ status: 403, kode: "INSUFFICIENT_PERMISSION" });
    });

    it("`/activity-logs/export` tetap rute ekspor: pemegang view saja → 403, bukan 400 id tak sah", async () => {
        expect(await panggil(["activity_log.view"], "/activity-logs/export")).toEqual({ status: 403, kode: "INSUFFICIENT_PERMISSION" });
    });
});
