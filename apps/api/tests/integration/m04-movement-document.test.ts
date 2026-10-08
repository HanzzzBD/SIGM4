// FR-04.4 AC 3: transaksi, HTTP, PDF dan object storage nyata; tanpa skip diam-diam.
import { createHash, randomUUID } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdirSync, writeFileSync } from "node:fs";
import express from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { AssetMovementDocumentResponseSchema, AssetMovementDownloadResponseSchema } from "@sigm4/schemas";
import { createApp } from "../../src/api/index.js";
import { buildOpenApiDocument } from "../../src/api/openapi.js";
import { registry as apiRegistry } from "../../src/api/index.js";
import { MovementDocumentService, EVENT_MOVEMENT_DOCUMENT_REQUESTED, MOVEMENT_DOCUMENT_JOB_NAME } from "../../src/modules/m04-assets/index.js";
import { AssetService } from "../../src/modules/m04-assets/services/asset.service.js";
import { registerMovementPdf } from "../../src/modules/m06-documents/index.js";
import { createAuthContext, setAmr, setAuthContext } from "../../src/shared/auth/index.js";
import type { AuthContext, Scope } from "../../src/shared/auth/index.js";
import { createSystemAuthContext } from "../../src/shared/auth/system-context.js";
import { AuditLogger } from "../../src/shared/audit/index.js";
import { SystemClock } from "../../src/shared/clock/index.js";
import { createRedis, getRedis, closeRedis, readRedisConfig } from "../../src/shared/cache/index.js";
import { getDb, withTransaction } from "../../src/shared/db/index.js";
import { EventHandlerRegistry, OutboxDispatcher } from "../../src/shared/events/index.js";
import { HealthRegistry, Logger } from "../../src/shared/observability/index.js";
import { PembangkitPdfChromium } from "../../src/shared/pdf/index.js";
import { PenyimpananS3 } from "../../src/shared/storage/index.js";
import { pasangHandlerAntrean, pasangPemindaian, pasangPembangkitDokumenMutasi, registry as workerRegistry } from "../../src/worker/index.js";
import { createQueue, createWorker } from "../../src/worker/scheduler.js";
import { authPalsu } from "../helpers/auth.js";
import { dbmate, kueri } from "../helpers/db.js";

const required = ["DATABASE_URL", "REDIS_URL", "S3_ENDPOINT", "S3_REGION", "S3_BUCKET", "S3_ACCESS_KEY", "S3_SECRET_KEY"];
it("prasyarat: PostgreSQL, Redis dan S3 wajib agar acceptance PDF tidak hijau tanpa diuji", () => {
    for (const name of required) expect(process.env[name], `${name} wajib untuk acceptance berita acara.`).toBeTruthy();
});
describe.skipIf(required.some((name) => !process.env[name]))("PR-02-39 — berita acara mutasi", () => {
    const tag = randomUUID().slice(0, 8), clock = new SystemClock(), audit = new AuditLogger({ clock });
    const configuration = { endpoint: process.env["S3_ENDPOINT"]!, publicEndpoint: process.env["S3_ENDPOINT"]!, region: process.env["S3_REGION"]!,
        bucket: process.env["S3_BUCKET"]!, accessKey: process.env["S3_ACCESS_KEY"]!, secretKey: process.env["S3_SECRET_KEY"]! };
    const storage = new PenyimpananS3(configuration, clock);
    const pdf = new PembangkitPdfChromium(process.env["CHROMIUM_EXECUTABLE_PATH"] ?? null);
    const system = createSystemAuthContext(MOVEMENT_DOCUMENT_JOB_NAME);
    const documents = () => new MovementDocumentService(getDb(), audit, clock, storage);
    const assets = () => new AssetService(getDb(), audit, clock);
    const people: Record<string, number> = {}, contexts: Record<string, AuthContext> = {};
    let building: string, area: string, origin: string, target: string, category: string;
    let units: string[] = [];
    let baseUrl: string;
    const server = createServer();
    const keys = new Set<string>();
    const ctx = (role = "R-02") => contexts[role]!;
    const body = (ids = units) => ({ asset_ids: ids.map(Number), room_tujuan_id: Number(target), tanggal_mutasi: "2026-10-08", alasan: "Penataan laboratorium", penanggung_jawab_baru_id: people["R-03"]! });
    const input = (ids = units) => ({ assetIds: ids.map(Number), roomTujuanId: Number(target), tanggal: "2026-10-08", alasan: "Penataan laboratorium", penanggungJawabBaruId: people["R-03"]! });
    async function request(role: string, method: "GET" | "POST", path: string, data?: unknown) {
        const response = await fetch(`${baseUrl}/api/v1${path}`, { method, headers: { "x-test-role": role, "content-type": "application/json" }, ...(data === undefined ? {} : { body: JSON.stringify(data) }) });
        return { status: response.status, data: await response.json() as Record<string, unknown> };
    }
    async function remember(id: string) {
        const row = (await kueri<{ object_key: string }>(`SELECT object_key FROM asset_movement_documents WHERE id=${id}`))[0]!;
        keys.add(row.object_key); return row.object_key;
    }
    async function move() { const result = await assets().moveWithDocument(ctx(), input()); await remember(result.documentId); return result.documentId; }
    async function clean() {
        vi.restoreAllMocks();
        if (origin === undefined) return;
        await kueri(`DELETE FROM event_outbox WHERE aggregate_type='asset_movement_document' AND aggregate_id IN (SELECT id FROM asset_movement_documents WHERE created_by=${people["R-02"]})`);
        await kueri(`DELETE FROM activity_logs WHERE entitas='asset_movement_documents' AND entitas_id IN (SELECT id FROM asset_movement_documents WHERE created_by=${people["R-02"]})`);
        await kueri(`DELETE FROM asset_movements WHERE asset_id IN (SELECT id FROM assets WHERE category_id=${category})`);
        await kueri(`DELETE FROM asset_movement_documents WHERE created_by=${people["R-02"]}`);
        await kueri(`DELETE FROM activity_logs WHERE entitas='stored_files' AND entitas_id IN (SELECT id FROM stored_files WHERE owner_type='ASSET_MOVEMENT_DOCUMENT' AND uploaded_by=${people["R-02"]})`);
        await kueri(`DELETE FROM stored_files WHERE owner_type='ASSET_MOVEMENT_DOCUMENT' AND uploaded_by=${people["R-02"]}`);
        await kueri(`DELETE FROM activity_logs WHERE entitas='assets' AND entitas_id IN (SELECT id FROM assets WHERE category_id=${category})`);
        await kueri(`DELETE FROM assets WHERE category_id=${category}`);
        await Promise.all([...keys].map((key) => storage.hapus(key))); keys.clear();
    }
    beforeAll(async () => {
        dbmate("up");
        await storage.periksa();
        for (const role of ["R-01", "R-02", "R-03", "R-04", "R-05", "R-06", "R-07"]) {
            people[role] = Number((await kueri<{ id: string }>(`INSERT INTO users(nama,email,password_hash,nip_nis,role_id,status,must_change_password)
                VALUES ('Pelaku ${role}','move-${tag}-${role}@sekolah.sch.id','x','MV${tag}${role}',(SELECT id FROM roles WHERE kode='${role}'),'AKTIF',false) RETURNING id::text`))[0]!.id);
            const permissions = await kueri<{ kode: string; scope: string }>(`SELECT p.kode,rp.scope::text FROM role_permissions rp JOIN permissions p ON p.id=rp.permission_id JOIN roles r ON r.id=rp.role_id WHERE r.kode='${role}'`);
            contexts[role] = createAuthContext({ userId: people[role]!, roleCode: role, scopes: new Map(permissions.map((p) => [p.kode, p.scope.toLowerCase() as Scope])) });
        }
        contexts["none"] = createAuthContext({ userId: people["R-02"]!, roleCode: "R-02", scopes: new Map() });
        building = (await kueri<{ id: string }>(`INSERT INTO buildings(nama,kode) VALUES ('Gedung snapshot','MB${tag}') RETURNING id::text`))[0]!.id;
        area = (await kueri<{ id: string }>(`INSERT INTO areas(building_id,nama,kode) VALUES (${building},'Area snapshot','MA${tag}') RETURNING id::text`))[0]!.id;
        origin = (await kueri<{ id: string }>(`INSERT INTO rooms(area_id,nama,kode,jenis) VALUES (${area},'Asal snapshot','MO${tag}','GUDANG') RETURNING id::text`))[0]!.id;
        target = (await kueri<{ id: string }>(`INSERT INTO rooms(area_id,nama,kode,jenis) VALUES (${area},'Tujuan snapshot','MT${tag}','GUDANG') RETURNING id::text`))[0]!.id;
        category = (await kueri<{ id: string }>(`INSERT INTO asset_categories(nama,kode) VALUES ('Mutasi snapshot','MC${tag}') RETURNING id::text`))[0]!.id;
        const app = express();
        app.use((req, res, next) => { const context = contexts[req.header("x-test-role") ?? "none"]; if (context !== undefined) setAuthContext(res, context); setAmr(res, ["pwd", "otp"]); next(); });
        app.use(createApp({ appBaseUrl: "https://sekolah.test", db: getDb(), clock, logger: new Logger({ clock, tulis: () => undefined }), health: new HealthRegistry(),
            limiter: { hit: async () => ({ lolos: true, batas: 1000, sisa: 999, resetDetik: 60 }) }, security: { objectStorageOrigin: configuration.publicEndpoint }, auth: authPalsu(), penyimpanan: storage }));
        server.on("request", app); await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
        baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    });
    beforeEach(async () => {
        await clean();
        await kueri(`UPDATE users SET nama='Pelaku R-02' WHERE id=${people["R-02"]}; UPDATE rooms SET status='AKTIF',nama='Tujuan snapshot' WHERE id=${target}`);
        units = (await kueri<{ id: string }>(`INSERT INTO assets(kode_barang,nama,nomor_seri,category_id,tahun_perolehan,sumber_perolehan,nilai_perolehan,room_id,kondisi,status,penanggung_jawab_id)
            SELECT 'MV-${tag}-'||n,'Aset snapshot '||n,'00000'||n,${category},2026,'PEMBELIAN',999999,${origin},'BAIK',CASE WHEN n=2 THEN 'DALAM_PERBAIKAN'::asset_status ELSE 'TERSEDIA'::asset_status END,${people["R-02"]} FROM generate_series(1,2) n RETURNING id::text`)).map((row) => row.id);
    });
    afterAll(async () => {
        await clean(); await new Promise<void>((resolve) => server.close(() => resolve()));
        if (category !== undefined) await kueri(`DELETE FROM asset_categories WHERE id=${category}; DELETE FROM rooms WHERE id IN (${origin},${target}); DELETE FROM areas WHERE id=${area}; DELETE FROM buildings WHERE id=${building}; DELETE FROM users WHERE id IN (${Object.values(people).join(",")})`);
    });
    it("HTTP mutasi mempertahankan array aset, mengembalikan ID PDF; snapshot/outbox/audit atomik", async () => {
        const response = await request("R-02", "POST", "/assets/move", body()); expect(response.status).toBe(200);
        const meta = response.data["meta"] as { jumlah_aset: number; berita_acara: { id: string; status: string } };
        expect(response.data["data"]).toHaveLength(2); expect(meta.jumlah_aset).toBe(2); expect(meta.berita_acara.status).toBe("MENUNGGU");
        const id = meta.berita_acara.id; await remember(id);
        const status = AssetMovementDocumentResponseSchema.parse((await request("R-03", "GET", `/assets/movements/${id}/document`)).data).data;
        expect(status.snapshot).toMatchObject({ tanggal_mutasi: "2026-10-08", pelaku: { nama: "Pelaku R-02" }, tujuan: { nama: "Tujuan snapshot" }, alasan: "Penataan laboratorium" });
        expect(status.snapshot.aset).toHaveLength(2); expect(status.snapshot.aset[0]).toMatchObject({ asal: { nama: "Asal snapshot" }, penanggung_jawab_lama: { nama: "Pelaku R-02" }, penanggung_jawab_baru: { nama: "Pelaku R-03" } });
        expect(JSON.stringify(status)).not.toMatch(/object_key|nilai_perolehan|sumber_perolehan/);
        expect(await kueri(`SELECT id FROM asset_movements WHERE document_id=${id}`)).toHaveLength(2);
        expect(await kueri(`SELECT payload FROM event_outbox WHERE event_name='${EVENT_MOVEMENT_DOCUMENT_REQUESTED}' AND aggregate_id=${id}`)).toEqual([{ payload: { document_id: id } }]);
        expect(await kueri(`SELECT aksi FROM activity_logs WHERE entitas_id='${id}' AND aksi='ASSET_MOVEMENT_DOCUMENT_REQUESTED'`)).toHaveLength(1);
        expect((await request("R-03", "GET", `/assets/movements/${id}/document/download`)).status).toBe(409);
    });
    it.each(["status", "tujuan", "pengguna", "hilang"])("mutasi gagal %s tidak menyisakan dokumen/outbox atau perubahan sebagian", async (kind) => {
        if (kind === "status") await kueri(`UPDATE assets SET status='DIPINJAM' WHERE id=${units[1]}`);
        if (kind === "tujuan") await kueri(`UPDATE rooms SET status='NONAKTIF' WHERE id=${target}`);
        const payload = { ...input(), ...(kind === "pengguna" ? { penanggungJawabBaruId: 9999999 } : {}), ...(kind === "hilang" ? { assetIds: [Number(units[0]), 9999999] } : {}) };
        await expect(assets().moveWithDocument(ctx(), payload)).rejects.toMatchObject({ kode: "VALIDATION_ERROR" });
        expect(await kueri(`SELECT id FROM asset_movement_documents WHERE created_by=${people["R-02"]}`)).toEqual([]);
        expect(await kueri(`SELECT id FROM asset_movements WHERE asset_id IN (${units.join(",")})`)).toEqual([]);
        expect(await kueri(`SELECT room_id::text FROM assets WHERE id IN (${units.join(",")})`)).toEqual([{ room_id: origin }, { room_id: origin }]);
        expect(await kueri(`SELECT id FROM event_outbox WHERE aggregate_type='asset_movement_document' AND actor_id=${people["R-02"]}`)).toEqual([]);
    });
    it("PDF nyata tetap memakai snapshot; dua worker bersamaan membuat satu registri dan URL privat diaudit setiap kali", async () => {
        const id = await move(), key = await remember(id);
        await kueri(`UPDATE users SET nama='Nama berubah' WHERE id=${people["R-02"]}; UPDATE rooms SET nama='Tujuan berubah' WHERE id=${target}; UPDATE assets SET nama='Aset berubah' WHERE id IN (${units.join(",")})`);
        const render = vi.spyOn(pdf, "render");
        await Promise.all([documents().run(system, { document_id: id }, pdf, false), documents().run(system, { document_id: id }, pdf, false)]);
        await documents().run(system, { document_id: id }, pdf, false); expect(render).toHaveBeenCalledTimes(1);
        const file = (await kueri<{ id: string; checksum: string; ukuran: string; scan_status: string; owner_id: string }>(`SELECT id::text,checksum,ukuran::text,scan_status,owner_id::text FROM stored_files WHERE object_key='${key}'`))[0]!;
        const bytes = (await storage.ambil(key))!;
        expect(file).toMatchObject({ checksum: createHash("sha256").update(bytes).digest("hex"), ukuran: String(bytes.length), scan_status: "CLEAN", owner_id: id });
        expect(bytes.subarray(0, 8).toString()).toBe("%PDF-1.7");
        const loading = getDocument({ data: Uint8Array.from(bytes), useSystemFonts: true });
        const document = await loading.promise;
        try {
            const page = await document.getPage(1), text = (await page.getTextContent()).items.map((item) => "str" in item ? item.str : "").join(" ");
            expect(page.view[2]).toBeCloseTo(595, 0); expect(page.view[3]).toBeCloseTo(842, 0);
            for (const value of ["Aset snapshot 1", "Aset snapshot 2", "Asal snapshot", "Tujuan snapshot", "Pelaku R-02", "2026-10-08", "Penataan laboratorium", "000001"]) expect(text).toContain(value);
            expect(text).not.toContain("berubah"); expect(text).not.toContain("999999");
        } finally { await loading.destroy(); }
        const path = `/assets/movements/${id}/document/download`;
        expect((await fetch(`${configuration.endpoint}/${configuration.bucket}/${key}`)).status).toBe(403);
        for (let i = 0; i < 2; i++) {
            const signed = AssetMovementDownloadResponseSchema.parse((await request("R-03", "GET", path)).data).data;
            expect(new URL(signed.url).searchParams.get("X-Amz-Expires")).toBe("900");
            expect(new Date(signed.expires_at).getTime() - clock.now().getTime()).toBeGreaterThan(895000);
            expect((await fetch(signed.url)).status).toBe(200);
        }
        expect(await kueri(`SELECT id FROM activity_logs WHERE entitas_id='${id}' AND aksi='ASSET_MOVEMENT_DOCUMENT_DOWNLOADED'`)).toHaveLength(2);
        expect(await kueri(`SELECT id FROM stored_files WHERE object_key='${key}'`)).toHaveLength(1);
        await kueri(`UPDATE stored_files SET scan_status='PENDING' WHERE id=${file.id}`);
        expect((await request("R-03", "GET", path)).status).toBe(409);
        expect(await kueri(`SELECT id FROM activity_logs WHERE entitas_id='${id}' AND aksi='ASSET_MOVEMENT_DOCUMENT_DOWNLOADED'`)).toHaveLength(2);
        await kueri(`UPDATE stored_files SET scan_status='CLEAN' WHERE id=${file.id}`);
        vi.spyOn(audit, "write").mockRejectedValueOnce(new Error("audit download failed"));
        await expect(documents().download(ctx("R-03"), id)).rejects.toThrow("audit download failed");
    });
    it("retry render/storage tidak mengulang mutasi, percobaan akhir gagal aman dan dapat dibaca", async () => {
        const id = await move(); const key = await remember(id);
        vi.spyOn(pdf, "render").mockRejectedValueOnce(new Error("chromium secret-path"));
        await expect(documents().run(system, { document_id: id }, pdf, false)).rejects.toThrow("chromium");
        expect((await documents().status(ctx(), id)).status).toBe("BERJALAN");
        vi.spyOn(storage, "simpan").mockRejectedValueOnce(new Error("storage credential"));
        await expect(documents().run(system, { document_id: id }, pdf, true)).rejects.toThrow("storage");
        const status = await documents().status(ctx(), id); expect(status.status).toBe("GAGAL"); expect(status.pesan_galat).not.toMatch(/secret|credential|path/);
        expect(await storage.ambil(key)).toBeNull();
        expect(await kueri(`SELECT id FROM asset_movements WHERE document_id=${id}`)).toHaveLength(2);
        expect(await kueri(`SELECT room_id::text FROM assets WHERE id IN (${units.join(",")})`)).toEqual([{ room_id: target }, { room_id: target }]);
        expect((await request("R-03", "GET", `/assets/movements/${id}/document/download`)).status).toBe(409);
        await documents().run(system, { document_id: id }, pdf, true);
    });
    it("registrasi PDF dan status SIAP rollback bersama; objek dikompensasi lalu retry berhasil", async () => {
        const id = await move(), key = await remember(id);
        vi.spyOn(audit, "write").mockImplementationOnce((scope, data) => AuditLogger.prototype.write.call(audit, scope, data))
            .mockImplementationOnce((scope, data) => AuditLogger.prototype.write.call(audit, scope, data))
            .mockRejectedValueOnce(new Error("audit unavailable"));
        await expect(documents().run(system, { document_id: id }, pdf, false)).rejects.toThrow("audit unavailable");
        expect(await kueri(`SELECT id FROM stored_files WHERE object_key='${key}'`)).toEqual([]); expect(await storage.ambil(key)).toBeNull();
        expect((await documents().status(ctx(), id)).status).toBe("BERJALAN");
        vi.restoreAllMocks(); await documents().run(system, { document_id: id }, pdf, false);
        expect((await documents().status(ctx(), id)).status).toBe("SIAP");
    });
    it("scope own/all dan tujuh role: hanya Admin/Petugas/Pimpinan membaca; tanpa izin 403/401, di luar scope 404", async () => {
        const id = await move();
        for (const role of Object.keys(people)) {
            const expected = ["R-01", "R-02", "R-03"].includes(role) ? 200 : 403;
            expect((await request(role, "GET", `/assets/movements/${id}/document`)).status, role).toBe(expected);
            expect((await request(role, "GET", `/assets/movements/${id}/document/download`)).status).toBe(expected === 200 ? 409 : 403);
        }
        for (const scope of ["own", "assigned", "restricted"] as const) {
            const outside = createAuthContext({ userId: people["R-03"]!, roleCode: "R-03", scopes: new Map([["asset_movement_document.view", scope]]) });
            await expect(documents().status(outside, id)).rejects.toMatchObject({ kode: "NOT_FOUND" });
            await expect(documents().download(outside, id)).rejects.toMatchObject({ kode: "NOT_FOUND" });
        }
        const own = createAuthContext({ userId: people["R-02"]!, roleCode: "R-02", scopes: new Map([["asset_movement_document.view", "own"]]) });
        expect((await documents().status(own, id)).id).toBe(id);
        expect((await request("absent", "GET", `/assets/movements/${id}/document`)).status).toBe(401);
        expect((await request("none", "GET", `/assets/movements/${id}/document`)).status).toBe(403);
        await expect(documents().status(contexts["none"]!, id)).rejects.toMatchObject({ kode: "FORBIDDEN" });
        expect((await request("R-01", "GET", "/assets/movements/9999999/document")).status).toBe(404);
        await expect(registerMovementPdf({ ctx: ctx(), tx: {} as never }, audit, clock, { objectKey: "x", bytes: Buffer.from("%PDF-1.7"), ownerId: id, creatorId: String(people["R-02"]) })).rejects.toMatchObject({ kode: "FORBIDDEN" });
    });
    it("outbox → BullMQ → worker produksi membuat PDF 50 aset pada beberapa halaman A4", async () => {
        await kueri(`INSERT INTO assets(kode_barang,nama,category_id,tahun_perolehan,sumber_perolehan,room_id,kondisi)
            SELECT 'MV-${tag}-'||n,'Aset panjang '||n,${category},2026,'PEMBELIAN',${origin},'BAIK' FROM generate_series(3,50) n`);
        units = (await kueri<{ id: string }>(`SELECT id::text FROM assets WHERE category_id=${category} ORDER BY id`)).map((row) => row.id);
        const id = await move(), key = await remember(id), shared = getRedis();
        const connections = [createRedis(readRedisConfig()), createRedis(readRedisConfig())];
        const readyDeadline = performance.now() + 5000;
        while ([shared, ...connections].some((connection) => connection.status !== "ready") && performance.now() < readyDeadline) await new Promise((resolve) => setTimeout(resolve, 50));
        await Promise.all([shared.ping(), ...connections.map((connection) => connection.ping())]);
        const queue = createQueue(connections[0]!); await queue.obliterate({ force: true });
        pasangPemindaian(configuration, { host: "127.0.0.1", port: 3310 }); pasangPembangkitDokumenMutasi(process.env["CHROMIUM_EXECUTABLE_PATH"] ?? null);
        const worker = createWorker(connections[1]!, workerRegistry);
        try {
            const handlers = new EventHandlerRegistry(); pasangHandlerAntrean(handlers, queue);
            expect(await new OutboxDispatcher({ registry: handlers, clock }).drain()).toMatchObject({ processed: 1, failed: 0 });
            const deadline = performance.now() + 30000;
            while ((await documents().status(ctx(), id)).status !== "SIAP" && performance.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 100));
            expect((await documents().status(ctx(), id)).status).toBe("SIAP");
            const bytes = (await storage.ambil(key))!;
            const loading = getDocument({ data: Uint8Array.from(bytes), useSystemFonts: true });
        const document = await loading.promise;
            try {
                expect(document.numPages).toBeGreaterThan(1);
                let text = "";
                for (let i = 1; i <= document.numPages; i++) { const page = await document.getPage(i); expect(page.view[2]).toBeCloseTo(595, 0); expect(page.view[3]).toBeCloseTo(842, 0); text += (await page.getTextContent()).items.map((item) => "str" in item ? item.str : "").join(" "); }
                for (let n = 1; n <= 50; n++) expect(text).toContain(`MV-${tag}-${n}`);
                mkdirSync(new URL("../../../../build/", import.meta.url), { recursive: true });
                writeFileSync(new URL("../../../../build/pr0239-berita-acara.pdf", import.meta.url), bytes);
                writeFileSync(new URL("../../../../build/pr0239-pdf-proof.json", import.meta.url), JSON.stringify({ assets: 50, pages: document.numPages, version: bytes.subarray(0, 8).toString(), format: "A4", bytes: bytes.length, pipeline: "mutasi → outbox → BullMQ → Chromium → MinIO privat → stored_files CLEAN" }, null, 2));
            } finally { await loading.destroy(); }
        } finally {
            await worker.close(); await queue.obliterate({ force: true }); await queue.close();
            await Promise.all(connections.map((connection) => connection.quit())); await closeRedis();
        }
    });
    it("kedua endpoint terpasang di OpenAPI dengan permission dokumen", () => {
        const api = buildOpenApiDocument(apiRegistry, { version: "1" });
        for (const path of ["/api/v1/assets/movements/{id}/document", "/api/v1/assets/movements/{id}/document/download"]) expect(api.paths?.[path]?.get).toBeDefined();
    });
    it("mutasi serentak mengunci aset berurutan; snapshot kedua membaca lokasi setelah operasi pertama", async () => {
        const results = await Promise.all([assets().moveWithDocument(ctx(), input()), assets().moveWithDocument(ctx(), input([...units].reverse()))]);
        for (const result of results) await remember(result.documentId);
        const snapshots = await Promise.all(results.map((result) => documents().status(ctx(), result.documentId)));
        expect(new Set(snapshots.map((doc) => doc.snapshot.aset[0]!.asal.id))).toEqual(new Set([origin, target]));
        for (const doc of snapshots) expect(new Set(doc.snapshot.aset.map((asset) => asset.asal.id)).size).toBe(1);
        expect(await kueri(`SELECT id FROM asset_movements WHERE document_id IN (${results.map((result) => result.documentId).join(",")})`)).toHaveLength(4);
    });
    it("worker menolak pelaku non-SYSTEM dan PDF versi salah tanpa mempublikasikan berkas", async () => {
        const id = await move();
        await expect(documents().run(ctx() as typeof system, { document_id: id }, pdf, false)).rejects.toMatchObject({ kode: "FORBIDDEN" });
        await documents().run(system, { document_id: "9999999" }, pdf, false);
        vi.spyOn(pdf, "render").mockResolvedValueOnce(Buffer.from("%PDF-1.4"));
        await expect(documents().run(system, { document_id: id }, pdf, true)).rejects.toThrow("versi 1.7");
        expect((await documents().status(ctx(), id)).status).toBe("GAGAL");
        await expect(withTransaction(system, (scope) => registerMovementPdf(scope, audit, clock,
            { objectKey: "bad-pdf", bytes: Buffer.from("invalid"), ownerId: id, creatorId: String(people["R-02"]) }), getDb())).rejects.toThrow("PDF 1.7");
    });
    it("kegagalan kompensasi storage terlihat pada worker sementara pesan pengguna tetap aman", async () => {
        const id = await move();
        vi.spyOn(storage, "simpan").mockRejectedValueOnce(new Error("PUT gagal"));
        vi.spyOn(storage, "hapus").mockRejectedValueOnce(new Error("DELETE gagal"));
        await expect(documents().run(system, { document_id: id }, pdf, true)).rejects.toMatchObject({ name: "AggregateError", cause: { message: "PUT gagal" } });
        expect((await documents().status(ctx(), id)).status).toBe("GAGAL");
        expect(await kueri(`SELECT id FROM asset_movements WHERE document_id=${id}`)).toHaveLength(2);
    });
});
