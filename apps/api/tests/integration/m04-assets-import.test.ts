// PR-02-38: transaksi, konkurensi, HTTP dan target 500 baris pada PostgreSQL nyata.
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ASSET_IMPORT_COLUMNS, AssetImportResponseSchema } from "@sigm4/schemas";
import { awalRantai, ujungRantai } from "../../src/api/chain.js";
import { registry } from "../../src/api/index.js";
import { buildOpenApiDocument } from "../../src/api/openapi.js";
import { AssetImportRunner, AssetImportService, assetsRouter } from "../../src/modules/m04-assets/index.js";
import { AssetImportRepository } from "../../src/modules/m04-assets/repositories/asset-import.repository.js";
import { AssetService } from "../../src/modules/m04-assets/services/asset.service.js";
import { pasangKonsumenNotifikasi } from "../../src/modules/m17-notifications/index.js";
import { createSystemAuthContext } from "../../src/shared/auth/system-context.js";
import { authorize, createAuthContext, PermissionCache, setAmr, setAuthContext } from "../../src/shared/auth/index.js";
import type { AuthContext, EffectivePermissions } from "../../src/shared/auth/index.js";
import { AuditLogger } from "../../src/shared/audit/index.js";
import { FixedClock } from "../../src/shared/clock/index.js";
import { getDb } from "../../src/shared/db/index.js";
import { EventHandlerRegistry } from "../../src/shared/events/index.js";
import type { OutboxEvent } from "../../src/shared/events/index.js";
import { Logger } from "../../src/shared/observability/index.js";
import { PenyimpananS3 } from "../../src/shared/storage/index.js";
import { closeRedis, createRedis, getRedis, readRedisConfig } from "../../src/shared/cache/index.js";
import { OutboxDispatcher } from "../../src/shared/events/index.js";
import { createQueue, createWorker } from "../../src/worker/scheduler.js";
import { pasangHandlerAntrean, registry as workerRegistry } from "../../src/worker/index.js";
import { dbmate, kueri } from "../helpers/db.js";

const time = new Date("2026-10-08T03:00:00Z");
const clock = new FixedClock(time);
const audit = new AuditLogger({ clock });
const service = () => new AssetImportService(getDb(), audit, clock);
let admin: number, other: number, room: string;
const tag = randomUUID().slice(0, 8);
const catCode = `IC${tag}`, roomCode = `IR${tag}`;
const ctx = (id = admin, permissions = ["asset.create", "asset.view"]) => createAuthContext({ userId: id, roleCode: "R-01", scopes: new Map(permissions.map((p) => [p, "all"] as const)) });
const row = (override: Record<string, string> = {}) => ({ nama_barang: "Kursi", kode_kategori: catCode, kode_ruangan: roomCode, tahun_perolehan: "2026", sumber_perolehan: "Pembelian", kondisi: "Baik", dapat_dipinjam: "true", boleh_dipinjam_siswa: "false", jumlah_unit: "1", ...override });
const input = (rows: Record<string, string>[], blank = false) => ({ filename: "aset.csv", contentBase64: Buffer.from([ASSET_IMPORT_COLUMNS.join(","), ...(blank ? [""] : []), ...rows.map((r) => ASSET_IMPORT_COLUMNS.map((c) => r[c] ?? "").join(","))].join("\n")).toString("base64") });
const assetsCount = async () => Number((await kueri<{ n: string }>(`SELECT count(*)::text n FROM assets WHERE room_id=${room}`))[0]?.n);
const runner = (allow = true) => new AssetImportRunner(getDb(), { load: async (): Promise<EffectivePermissions> => ({ roleId: "1", roleCode: "R-01", roleVersion: "1", userStatus: "AKTIF", scopes: new Map(allow ? [["asset.create", "all"]] : []) }) }, service());

it("prasyarat: DATABASE_URL wajib agar acceptance impor tidak hijau tanpa diuji", () => {
    expect(process.env["DATABASE_URL"], "PostgreSQL uji diperlukan (FR-04.1 AC 3).").toBeTruthy();
});

describe.skipIf(!process.env["DATABASE_URL"])("PR-02-38 — impor aset", () => {
    beforeAll(async () => {
        dbmate("up");
        const users = await kueri<{ id: string }>(`INSERT INTO users(nama,email,password_hash,nip_nis,role_id,status,must_change_password)
            SELECT 'Pengunggah', 'impor-${tag}-'||n||'@sekolah.sch.id','x','IMP${tag}'||n,id,'AKTIF',false FROM roles CROSS JOIN generate_series(1,2) n WHERE kode='R-01' RETURNING id::text`);
        admin = Number(users[0]?.id); other = Number(users[1]?.id);
        await kueri(`INSERT INTO asset_categories(nama,kode) VALUES ('Kategori impor','${catCode}')`);
        const building = (await kueri<{ id: string }>(`INSERT INTO buildings(nama,kode) VALUES ('Gedung impor','IB${tag}') RETURNING id::text`))[0]?.id;
        const area = (await kueri<{ id: string }>(`INSERT INTO areas(building_id,nama,kode) VALUES (${building},'Area impor','IA${tag}') RETURNING id::text`))[0]?.id;
        room = (await kueri<{ id: string }>(`INSERT INTO rooms(area_id,nama,kode,jenis,status) VALUES (${area},'Ruang impor','${roomCode}','GUDANG','AKTIF') RETURNING id::text`))[0]?.id ?? "";
    });
    async function clean() {
        vi.restoreAllMocks();
        await kueri(`DELETE FROM notifications WHERE user_id IN (${admin},${other})`);
        await kueri(`DELETE FROM assets WHERE room_id=${room}`);
        await kueri(`DELETE FROM asset_import_jobs WHERE created_by IN (${admin},${other})`);
        await kueri(`DELETE FROM event_outbox WHERE aggregate_type='AssetImportJob'`);
    }
    beforeEach(clean);
    afterAll(async () => {
        await clean();
        await kueri(`DELETE FROM asset_code_counters WHERE category_id IN (SELECT id FROM asset_categories WHERE kode='${catCode}')`);
        await kueri(`DELETE FROM rooms WHERE id=${room}`);
        await kueri(`DELETE FROM areas WHERE kode='IA${tag}'`);
        await kueri(`DELETE FROM buildings WHERE kode='IB${tag}'`);
        await kueri(`DELETE FROM asset_categories WHERE kode='${catCode}'`);
        await kueri(`DELETE FROM users WHERE id IN (${admin},${other})`);
    });
    it("IMPT-01/02: laporan per baris fisik, unit berbeda, nomor seri tetap teks, audit dan buffer dibersihkan", async () => {
        const { job } = await service().submit(ctx(), input([row({ jumlah_unit: "3" }), row({ nomor_seri: "00001234567890123456" }), row({ nomor_seri: "00001234567890123456" }), row({ kode_ruangan: "TIDAK_ADA" })], true));
        expect(job).toMatchObject({ status: "SELESAI", total_baris: 4, sukses: 2, gagal: 2, unit_dibuat: 4 });
        expect(job.laporan_gagal.map((f) => f.baris)).toEqual([5, 6]);
        expect(job.laporan_gagal[0]?.data["nomor_seri"]).toBe("00001234567890123456");
        const units = await kueri<{ kode_barang: string; uuid: string; nomor_seri: string | null }>(`SELECT kode_barang,uuid::text,nomor_seri FROM assets WHERE import_job_id=${job.id}`);
        expect(new Set(units.map((v) => v.kode_barang)).size).toBe(4);
        expect(new Set(units.map((v) => v.uuid)).size).toBe(4);
        expect(units.find((v) => v.nomor_seri !== null)?.nomor_seri).toBe("00001234567890123456");
        expect(await kueri(`SELECT berkas FROM asset_import_jobs WHERE id=${job.id}`)).toEqual([{ berkas: null }]);
        expect(await kueri(`SELECT aksi FROM activity_logs WHERE entitas='asset_import_jobs' AND entitas_id='${job.id}' AND aksi='ASSET_IMPORT_ROW_PROCESSED'`)).toHaveLength(4);
        expect(await kueri(`SELECT aksi FROM activity_logs WHERE entitas='assets' AND nilai_sesudah->>'room_id'='${room}' AND aksi='ASSET_CREATED'`)).toHaveLength(4);
    });
    it("hash identik bersamaan menghasilkan satu job dan unit, replay hanya milik pengunggah selama 24 jam", async () => {
        const file = input([row({ jumlah_unit: "2" })]);
        const results = await Promise.all([service().submit(ctx(), file), service().submit(ctx(), file)]);
        expect(new Set(results.map((r) => r.job.id)).size).toBe(1);
        expect(results.map((r) => r.replay).sort()).toEqual([false, true]);
        expect(await assetsCount()).toBe(2);
        const job = results[0]?.job;
        await expect(service().get(ctx(other), Number(job?.id))).rejects.toMatchObject({ kode: "NOT_FOUND" });
        const secondOwner = await service().submit(ctx(other), file);
        expect(secondOwner.job.id).not.toBe(job?.id);
        const later = new AssetImportService(getDb(), audit, new FixedClock(new Date(time.getTime() + 25 * 3600000)));
        expect((await later.submit(ctx(), file)).replay).toBe(false);
        expect(await assetsCount()).toBe(6);
    });
    it("job sinkron yang terputus dilanjutkan lewat replay, aset dan progres gagal commit bersama", async () => {
        const file = input([row({ jumlah_unit: "3" })]);
        vi.spyOn(AssetImportRepository.prototype, "record").mockRejectedValueOnce(new Error("Gangguan saat mencatat progres"));
        await expect(service().submit(ctx(), file)).rejects.toThrow("Gangguan");
        expect(await assetsCount()).toBe(0);
        const resumed = await service().submit(ctx(), file);
        expect(resumed.replay).toBe(true);
        expect(resumed.job).toMatchObject({ sukses: 1, gagal: 0, unit_dibuat: 3 });
    });
    it("worker retry dan dua pelaksana bersamaan tidak menggandakan unit setelah rollback cursor", async () => {
        const { job } = await service().submit(ctx(), input(Array.from({ length: 201 }, () => row())));
        vi.spyOn(AssetImportRepository.prototype, "record").mockRejectedValueOnce(new Error("Worker terputus"));
        await expect(runner().run({ job_id: job.id, oleh: admin }, false)).rejects.toThrow("terputus");
        expect(await assetsCount()).toBe(0);
        expect((await service().get(ctx(), Number(job.id))).baris_terproses).toBe(0);
        await Promise.all([runner().run({ job_id: job.id, oleh: admin }, false), runner().run({ job_id: job.id, oleh: admin }, false)]);
        expect(await assetsCount()).toBe(201);
        expect(await service().get(ctx(), Number(job.id))).toMatchObject({ status: "SELESAI", sukses: 201, gagal: 0 });
        expect(await kueri(`SELECT 1 FROM event_outbox WHERE event_name='AssetImportCompleted' AND aggregate_id='${job.id}'`)).toHaveLength(1);
    });
    it("200 baris sinkron, 201 asinkron; izin dicabut menutup GAGAL dan replay tidak memulai ulang", async () => {
        const invalid = Array.from({ length: 200 }, () => row({ jumlah_unit: "0" }));
        const small = await service().submit(ctx(), input(invalid));
        expect(small.job).toMatchObject({ status: "SELESAI", gagal: 200 });
        const file = input([...invalid, row()]);
        const large = await service().submit(ctx(), file);
        expect(large.job.status).toBe("MENUNGGU");
        await runner(false).run({ job_id: large.job.id, oleh: admin }, false);
        expect(await service().get(ctx(), Number(large.job.id))).toMatchObject({ status: "GAGAL", unit_dibuat: 0 });
        expect((await service().submit(ctx(), file)).replay).toBe(true);
        expect(await assetsCount()).toBe(0);
    });
    it("worker dengan pelaku lain tidak mengubah job; percobaan terakhir menutup GAGAL dan membersihkan buffer", async () => {
        const { job } = await service().submit(ctx(), input(Array.from({ length: 201 }, () => row())));
        await expect(runner().run({ job_id: job.id, oleh: other }, false)).rejects.toMatchObject({ kode: "NOT_FOUND" });
        expect((await service().get(ctx(), Number(job.id))).status).toBe("MENUNGGU");
        vi.spyOn(AssetImportRepository.prototype, "record").mockRejectedValueOnce(new Error("Gangguan"));
        await expect(runner().run({ job_id: job.id, oleh: admin }, true)).rejects.toThrow("Gangguan");
        expect(await service().get(ctx(), Number(job.id))).toMatchObject({ status: "GAGAL", unit_dibuat: 0 });
        expect(await kueri(`SELECT berkas FROM asset_import_jobs WHERE id=${job.id}`)).toEqual([{ berkas: null }]);
    });
    it("FR-04.1 AC3: 500 baris valid selesai ≤60 detik, NT-55 dideduplikasi dan meminta push", async () => {
        const start = performance.now();
        const { job } = await service().submit(ctx(), input(Array.from({ length: 500 }, (_, i) => row({ nama_barang: `Kursi ${i}` }))));
        await runner().run({ job_id: job.id, oleh: admin }, false);
        const elapsed = performance.now() - start;
        mkdirSync(new URL("../../../../build/", import.meta.url), { recursive: true });
        writeFileSync(new URL("../../../../build/pr0238-benchmark.json", import.meta.url), JSON.stringify({ rows: 500, valid: 500, units: 500, elapsed_ms: elapsed, database: "PostgreSQL 18 lokal, basis data uji terpisah", mode: "submit HTTP service + worker langsung; antrean diuji terpisah" }, null, 2));
        expect(elapsed).toBeLessThanOrEqual(60_000);
        expect(await service().get(ctx(), Number(job.id))).toMatchObject({ status: "SELESAI", sukses: 500, gagal: 0, unit_dibuat: 500 });
        console.info(`PR-02-38: 500 baris valid ${elapsed.toFixed(0)} ms`);
        const completed = (await kueri<{ id: string; payload: unknown }>(`SELECT id::text,payload FROM event_outbox WHERE event_name='AssetImportCompleted' AND aggregate_id='${job.id}'`))[0];
        const handlers = new EventHandlerRegistry();
        const push = vi.fn().mockResolvedValue(undefined);
        pasangKonsumenNotifikasi(handlers, { db: getDb, clock, ctx: () => createSystemAuthContext("uji-import-notifikasi"), jadwalkanPush: push });
        const event: OutboxEvent = { id: completed?.id ?? "0", name: "AssetImportCompleted", aggregateType: "AssetImportJob", aggregateId: job.id, payload: completed?.payload, actorId: String(admin), requestId: null, occurredAt: time, attempts: 0 };
        for (const handler of handlers.handlersFor(event.name)) { await handler(event); await handler(event); }
        const notifications = await kueri(`SELECT user_id::text,deep_link FROM notifications WHERE kode='NT-55' AND referensi_id=${job.id}`);
        expect(notifications).toEqual([{ user_id: String(admin), deep_link: `/aset/impor?job=${job.id}` }]);
        expect(push).toHaveBeenCalledTimes(1);
    });
    it("filter katalog hanya menampilkan hasil job dan memeriksa kepemilikannya", async () => {
        const a = await service().submit(ctx(), input([row({ nama_barang: "A", jumlah_unit: "2" })]));
        await service().submit(ctx(), input([row({ nama_barang: "B" })]));
        const catalog = new AssetService(getDb(), audit, clock);
        expect((await catalog.list(ctx(), { importJobId: Number(a.job.id), page: 1, perPage: 25, sort: "nama" })).rows).toHaveLength(2);
        await expect(catalog.list(ctx(other), { importJobId: Number(a.job.id), page: 1, perPage: 25, sort: "nama" })).rejects.toMatchObject({ kode: "NOT_FOUND" });
    });
    it("500 baris: outbox → BullMQ → worker produksi, tanpa tiruan, selesai ≤60 detik", async () => {
        expect(process.env["REDIS_URL"], "Redis uji diperlukan untuk acceptance IMPT-04").toBeDefined();
        const connections = [createRedis(readRedisConfig()), createRedis(readRedisConfig())];
        const shared = getRedis();
        async function wait(check: () => Promise<boolean>, timeout = 60_000): Promise<boolean> {
            const start = performance.now();
            while (performance.now() - start < timeout) {
                try { if (await check()) return true; } catch { /* Tunggu koneksi siap. */ }
                await new Promise((resolve) => setTimeout(resolve, 100));
            }
            return false;
        }
        expect(await wait(async () => (await shared.ping()) === "PONG", 5000)).toBe(true);
        const queue = createQueue(connections[0]!);
        await queue.obliterate({ force: true });
        const worker = createWorker(connections[1]!, workerRegistry);
        try {
            const start = performance.now();
            const file = input(Array.from({ length: 500 }, (_, i) => row({ nama_barang: `E2E ${i}` })));
            const { job } = await service().submit(ctx(), file);
            const handlers = new EventHandlerRegistry();
            pasangHandlerAntrean(handlers, queue);
            const dispatcher = new OutboxDispatcher({ registry: handlers, clock });
            const drained = await dispatcher.drain();
            expect(drained.failed).toBe(0);
            expect(drained.processed).toBeGreaterThanOrEqual(1);
            expect(await kueri(`SELECT id FROM event_outbox WHERE aggregate_type='AssetImportJob' AND aggregate_id=${job.id} AND event_name='AssetImportRequested' AND processed_at IS NOT NULL`)).toHaveLength(1);
            expect(await wait(async () => (await service().get(ctx(), Number(job.id))).status === "SELESAI")).toBe(true);
            const elapsed = performance.now() - start;
            expect(elapsed).toBeLessThanOrEqual(60_000);
            expect(await service().get(ctx(), Number(job.id))).toMatchObject({ sukses: 500, gagal: 0, unit_dibuat: 500 });
            expect(await assetsCount()).toBe(500);
            const version = /redis_version:([^\r\n]+)/.exec(await shared.info("server"))?.[1];
            mkdirSync(new URL("../../../../build/", import.meta.url), { recursive: true });
            writeFileSync(new URL("../../../../build/pr0238-benchmark-e2e.json", import.meta.url), JSON.stringify({ rows: 500, valid: 500, units: 500, elapsed_ms: elapsed, database: "PostgreSQL 18 lokal, basis data uji terpisah", redis_version: version, mode: "submit → outbox dispatcher → BullMQ → handler worker produksi → SELESAI" }, null, 2));
        } finally {
            await worker.close();
            await queue.obliterate({ force: true });
            await queue.close();
            await Promise.all(connections.map((c) => c.quit().catch(() => undefined)));
            await closeRedis();
        }
    });
    async function request(context: AuthContext | null, method: "GET" | "POST", path: string, body?: unknown) {
        const app = express();
        app.use(awalRantai({ security: { objectStorageOrigin: "http://minio:9000" } }));
        app.use((_req, res, next) => { if (context !== null) setAuthContext(res, context); setAmr(res, ["pwd", "otp"]); next(); });
        const storage = new PenyimpananS3({ endpoint: "http://127.0.0.1:9000", publicEndpoint: "http://127.0.0.1:9000", bucket: "unused-import-test", region: "us-east-1", accessKey: "test", secretKey: "test" }, clock);
        app.use("/api/v1", assetsRouter({ db: getDb(), auditLogger: audit, clock, appBaseUrl: "http://localhost", penyimpanan: storage }, () => (_req, _res, next) => next(), authorize));
        app.use(ujungRantai({ limiter: { hit: async () => ({ lolos: true, batas: 100, sisa: 99, resetDetik: 60 }) }, logger: new Logger({ clock, tulis: () => undefined }) }));
        const server = createServer(app);
        await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
        try {
            const response = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1${path}`, { method, headers: { "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
            return { status: response.status, headers: response.headers, content: Buffer.from(await response.arrayBuffer()) };
        } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
    }
    it("HTTP: template biner, hasil 200/202, laporan tersaring, input invalid dan semua penolakan akses", async () => {
        const template = await request(ctx(), "GET", "/assets/import/template");
        expect(template.status).toBe(200); expect(template.headers.get("content-type")).toContain("spreadsheetml"); expect(template.content.subarray(0, 2).toString()).toBe("PK");
        const file = input([row()]);
        const result = await request(ctx(), "POST", "/assets/import", { filename: file.filename, content_base64: file.contentBase64 });
        expect(result.status).toBe(200);
        const parsed = AssetImportResponseSchema.parse(JSON.parse(result.content.toString()));
        expect(JSON.parse(result.content.toString()).data).not.toHaveProperty("berkas");
        expect((await request(ctx(other), "GET", `/assets/import/${parsed.data.id}`)).status).toBe(404);
        for (const [method, path] of [["GET", "/assets/import/template"], ["GET", `/assets/import/${parsed.data.id}`], ["POST", "/assets/import"]] as const) expect((await request(ctx(admin, []), method, path, method === "POST" ? {} : undefined)).status).toBe(403);
        for (const [method, path] of [["GET", "/assets/import/template"], ["GET", `/assets/import/${parsed.data.id}`], ["POST", "/assets/import"]] as const) expect((await request(null, method, path, method === "POST" ? {} : undefined)).status).toBe(401);
        expect((await request(ctx(), "POST", "/assets/import", { filename: "a.csv", content_base64: "@@@" })).status).toBe(400);
        const big = input(Array.from({ length: 201 }, () => row()));
        expect((await request(ctx(), "POST", "/assets/import", { filename: big.filename, content_base64: big.contentBase64 })).status).toBe(202);
        const spec = buildOpenApiDocument(registry, { version: "test" });
        expect(spec.paths?.["/api/v1/assets/import"]?.post?.responses).toHaveProperty("200");
        expect(spec.paths?.["/api/v1/assets/import"]?.post?.responses).toHaveProperty("202");
    });
    it("SEC-T-01: ketiga endpoint × tujuh role seed, laporan sendiri/orang lain dan pemilik tidak dapat dipalsukan", async () => {
        expect(process.env["REDIS_URL"], "Redis uji diperlukan untuk permission cache nyata.").toBeTruthy();
        const users = await kueri<{ id: string; role_id: string }>(`INSERT INTO users
            (nama,email,password_hash,nip_nis,role_id,status,must_change_password)
            SELECT 'Matriks impor','matriks-${tag}-'||kode||'@sekolah.sch.id','x','MX${tag}'||kode,id,'AKTIF',false
            FROM roles WHERE kode IN ('R-01','R-02','R-03','R-04','R-05','R-06','R-07') RETURNING id::text,role_id::text`);
        expect(users).toHaveLength(7);
        const ids = users.map((u) => Number(u.id)).join(",");
        const foreign = (await service().submit(ctx(), input([row({ nama_barang: "Milik pengunggah lain" })]))).job;
        const redis = getRedis();
        const cache = new PermissionCache(getDb(), redis);
        try {
            if (redis.status !== "ready") await new Promise<void>((resolve, reject) => {
                redis.once("ready", resolve);
                redis.once("error", reject);
            });
            for (const user of users) {
                const effective = await cache.load(Number(user.id));
                expect(effective).toBeDefined();
                const context = createAuthContext({ userId: Number(user.id), roleCode: effective!.roleCode, scopes: effective!.scopes });
                const allowed = effective!.roleCode === "R-01" || effective!.roleCode === "R-02";
                const own = (await kueri<{ id: string }>(`INSERT INTO asset_import_jobs
                    (file_hash,nama_berkas,status,total_baris,created_by)
                    VALUES ('${"e".repeat(64)}','milik-sendiri.csv','MENUNGGU',1,${user.id}) RETURNING id::text`))[0]!.id;
                expect((await request(context, "GET", "/assets/import/template")).status, effective!.roleCode).toBe(allowed ? 200 : 403);
                expect((await request(context, "GET", `/assets/import/${own}`)).status, effective!.roleCode).toBe(allowed ? 200 : 403);
                expect((await request(context, "GET", `/assets/import/${foreign.id}`)).status, effective!.roleCode).toBe(allowed ? 404 : 403);
                const file = input([row({ nama_barang: `Matriks ${effective!.roleCode}` })]);
                const result = await request(context, "POST", "/assets/import", { filename: file.filename, content_base64: file.contentBase64, created_by: admin });
                expect(result.status, effective!.roleCode).toBe(allowed ? 200 : 403);
                if (allowed) {
                    const jobId = AssetImportResponseSchema.parse(JSON.parse(result.content.toString())).data.id;
                    expect(await kueri(`SELECT created_by::text FROM asset_import_jobs WHERE id=${jobId}`)).toEqual([{ created_by: user.id }]);
                    expect((await request(ctx(), "GET", `/assets/import/${jobId}`)).status).toBe(404);
                }
            }
        } finally {
            await kueri(`DELETE FROM assets WHERE import_job_id IN (SELECT id FROM asset_import_jobs WHERE created_by IN (${ids}))`);
            await kueri(`DELETE FROM asset_import_jobs WHERE created_by IN (${ids})`);
            await kueri(`DELETE FROM users WHERE id IN (${ids})`);
            await closeRedis();
        }
    });
});
