import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { sql } from "kysely";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { AssetExportFilterSchema, ReportExportResponseSchema } from "@sigm4/schemas";
import { assetExportDataset, assetExportAccess } from "../../src/modules/m04-assets/index.js";
import { ListAssetsQuerySchema } from "../../src/modules/m04-assets/schemas/asset.schema.js";
import { ReportExportService, createAnalyticsProviders, exportNotificationSource } from "../../src/modules/m16-analytics/index.js";
import { currentExportActor } from "../../src/modules/m16-analytics/exports/authorization.js";
import { createApp } from "../../src/api/index.js";
import { createAuthContext, setAuthContext, setAmr, AMR_OTP } from "../../src/shared/auth/index.js";
import type { AuthContext, Scope } from "../../src/shared/auth/index.js";
import { createSystemAuthContext } from "../../src/shared/auth/system-context.js";
import { AuditLogger } from "../../src/shared/audit/index.js";
import { FixedClock } from "../../src/shared/clock/index.js";
import { getDb, withTransaction } from "../../src/shared/db/index.js";
import type { PenyimpananObjek } from "../../src/shared/storage/index.js";
import { PembangkitPdfChromium } from "../../src/shared/pdf/index.js";
import { HealthRegistry, Logger } from "../../src/shared/observability/index.js";
import { dbmate, kueri } from "../helpers/db.js";
import { authPalsu } from "../helpers/auth.js";

const marker = randomUUID().slice(0, 7), clock = new FixedClock(new Date("2026-10-15T03:00:00Z")), system = createSystemAuthContext("asset-export-tests");
const objects = new Map<string, Buffer>(), signed: { key: string; ttl: number }[] = [];
let onPut: (() => Promise<void>) | undefined;
const storage: PenyimpananObjek = { urlUnggah: async () => "https://storage.test/put", urlUnduh: async (key, ttl) => { signed.push({ key, ttl }); return `https://storage.test/${key}`; }, info: async () => null, ambil: async key => objects.get(key) ?? null, simpan: async (key, bytes) => { objects.set(key, bytes); if (onPut) { const f = onPut; onPut = undefined; await f(); } }, hapus: async key => { objects.delete(key); }, periksa: async () => undefined };
const pdf = new PembangkitPdfChromium(process.env["CHROMIUM_EXECUTABLE_PATH"] ?? (process.platform === "win32" ? "C:/Program Files/Google/Chrome/Application/chrome.exe" : null));
describe.skipIf(!process.env["DATABASE_URL"])("PR-02-47 katalog aset: worker, RBAC, file dan HTTP", () => {
    let owner: AuthContext, other: AuthContext, own: AuthContext, financial: AuthContext, financialOwn: AuthContext, revoked: AuthContext;
    let category: string, room: string, changedAsset: string, revokedRole: string, base: string, server: ReturnType<typeof createServer>;
    const actors = new Map<string, AuthContext>();
    const actor = async (grants: Record<string, Scope>) => {
        const code = `R-AX-${randomUUID().slice(0, 6)}`, role = (await sql<{ id: string }>`insert into roles(kode,nama) values(${code},${code}) returning id::text`.execute(getDb())).rows[0]!.id;
        for (const [permission, scope] of Object.entries(grants)) await sql`insert into role_permissions(role_id,permission_id,scope) select ${role}::bigint,id,${scope.toUpperCase()}::permission_scope from permissions where kode=${permission}`.execute(getDb());
        const id = (await sql<{ id: string }>`insert into users(nama,email,nip_nis,password_hash,role_id,status,must_change_password) values('Petugas Ekspor',${`${randomUUID()}@asset-export.test`},${randomUUID()},'x',${role}::bigint,'AKTIF',false) returning id::text`.execute(getDb())).rows[0]!.id;
        const ctx = createAuthContext({ userId: Number(id), roleCode: code, scopes: new Map(Object.entries(grants)) }); actors.set(id, ctx); return { ctx, role };
    };
    const service = () => new ReportExportService(getDb(), clock, new AuditLogger({ clock }), storage, createAnalyticsProviders());
    const request = (who = owner, format: "XLSX" | "PDF" = "XLSX", filter: object = { kategori_id: category }) => withTransaction(who, s => service().request(s, "assets", { format, filter }), getDb());
    const read = (who: AuthContext, filter: object = {}, limit = 100000) => withTransaction(who, s => assetExportDataset(s, AssetExportFilterSchema.parse({ kategori_id: category, ...filter }), limit), getDb());
    const job = (id: string) => getDb().selectFrom("report_exports").selectAll().where("id", "=", id).executeTakeFirstOrThrow();
    const http = (path: string, who = owner, key = randomUUID()) => fetch(base + path, { headers: { "x-user": String(who.userId), "Idempotency-Key": key } });
    beforeAll(async () => {
        dbmate("up");
        owner = (await actor({ "asset.view": "all", "asset.export": "all" })).ctx;
        other = (await actor({ "asset.view": "all", "asset.export": "all" })).ctx;
        own = (await actor({ "asset.view": "all", "asset.export": "own", "asset.view_financial": "own" })).ctx;
        financial = (await actor({ "asset.view": "all", "asset.export": "all", "asset.view_financial": "all" })).ctx;
        financialOwn = (await actor({ "asset.view": "all", "asset.export": "all", "asset.view_financial": "own" })).ctx;
        const rev = await actor({ "asset.view": "all", "asset.export": "all" }); revoked = rev.ctx; revokedRole = rev.role;
        const id = async (q: string) => (await kueri<{ id: string }>(q))[0]!.id;
        const b = await id(`insert into buildings(nama,kode) values('Gedung Uji','E${marker}') returning id::text`), a = await id(`insert into areas(building_id,nama,kode) values(${b},'Area Uji','E${marker}') returning id::text`);
        room = await id(`insert into rooms(area_id,nama,kode,jenis) values(${a},'Kelas Uji','E${marker}','KELAS') returning id::text`);
        category = await id(`insert into asset_categories(nama,kode) values('Laptop Uji','E${marker}') returning id::text`);
        for (let n = 0; n < 37; n++) {
            const row = (await sql<{ id: string }>`insert into assets(kode_barang,nama,category_id,merek,model,nomor_seri,tahun_perolehan,sumber_perolehan,nilai_perolehan,room_id,kondisi,status,dapat_dipinjam,boleh_dipinjam_siswa,penanggung_jawab_id,qr_terpasang,dihapuskan,created_by) values(${`${marker}-${String(n).padStart(3,"0")}`},${`=SUM(1,2) ${marker} <script>`},${category}::bigint,'Merek Uji','Tipe Uji',${`001-${marker}-${n}`},2026,'PEMBELIAN',900719925474.01,${room}::bigint,'BAIK','TERSEDIA',true,${n % 2 === 0},${n < 30 ? own.userId : other.userId},false,${n === 36},${owner.userId}) returning id::text`.execute(getDb())).rows[0]!.id;
            if (n === 0) changedAsset = row;
        }
        await sql`update system_settings set value='"Sekolah Ekspor Aset"'::jsonb where key='sekolah.nama'`.execute(getDb());
        const app = express(); app.use((req, res, next) => { setAuthContext(res, actors.get(req.header("x-user") ?? "") ?? owner); setAmr(res, ["pwd", AMR_OTP]); next(); });
        app.use(createApp({ db: getDb(), clock, appBaseUrl: "https://exports.test", auth: authPalsu(), penyimpanan: storage, health: new HealthRegistry(30), logger: new Logger({ clock, tulis: () => undefined }), security: { objectStorageOrigin: "https://storage.test" }, limiter: { hit: async () => ({ lolos: true, batas: 10000, sisa: 9999, resetDetik: 60 }) } }));
        server = createServer(app); await new Promise<void>(r => server.listen(0, "127.0.0.1", r)); base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
    });
    afterAll(async () => { if (server) await new Promise<void>(r => server.close(() => r())); });
    it("GET 202 tidak merender; replay atomik dan terikat pemohon/filter; bukan /assets/:id", async () => {
        const path = `/assets/export?format=XLSX&filter[kategori_id]=${category}`, key = randomUUID(), before = objects.size;
        const first = await http(path, owner, key), body = ReportExportResponseSchema.parse(await first.json()); expect(first.status).toBe(202); expect(first.headers.get("cache-control")).toBe("private, no-store"); expect(objects.size).toBe(before);
        expect(await (await http(path, owner, key)).json()).toEqual(body);
        expect((await http(path, other, key)).status).toBe(409); expect((await http(path + "&q=beda", owner, key)).status).toBe(409);
        const events = await sql<{ n: string }>`select count(*)::text n from event_outbox where event_name='ExportRequested' and aggregate_id=${body.data.id}`.execute(getDb()); expect(events.rows[0]!.n).toBe("1");
        const logs = await sql<{ n: string }>`select count(*)::text n from activity_logs where aksi='ASSET_EXPORT_REQUESTED' and entitas_id=${body.data.id}`.execute(getDb()); expect(logs.rows[0]!.n).toBe("1");
        expect((await http(`/assets/exports/${body.data.id}`)).status).toBe(200); expect((await http(`/assets/exports/${body.data.id}`, other)).status).toBe(404);
        expect((await http(path + "&page=2")).status).toBe(400); expect((await http(path.replace("XLSX", "CSV"))).status).toBe(400);
        expect((await fetch(base + path, { headers: { "x-user": String(owner.userId) } })).status).toBeGreaterThanOrEqual(400);
        expect((await (await http("/assets/exports")).json() as { data: { jenis: string }[] }).data.every(j => j.jenis === "assets")).toBe(true);
    });
    it("worker XLSX mengekspor seluruh 36 hasil, mempertahankan string/formula/nomor seri dan mengaudit sekali", async () => {
        const queued = await request(); await service().run(system, queued.id, pdf, false); await service().run(system, queued.id, pdf, true);
        const r = await job(queued.id); expect(r).toMatchObject({ status: "SIAP", jumlah_baris: 36 });
        const book = new ExcelJS.Workbook(); await book.xlsx.load(objects.get(r.object_key)! as unknown as Parameters<typeof book.xlsx.load>[0]); const sheet = book.getWorksheet("Data")!;
        expect(sheet.rowCount).toBe(37); expect(sheet.getCell("B2").value).toContain("=SUM(1,2)"); expect(sheet.getCell("B2").type).toBe(ExcelJS.ValueType.String); expect(sheet.getCell("E2").value).toMatch(/^001-/);
        expect(sheet.getRow(1).values).not.toContain("Nilai perolehan (Rp)"); expect(sheet.getRow(1).values).toContain("Penanggung jawab");
        expect(book.getWorksheet("Keterangan")!.getCell("A1").value).toBe("Sekolah Ekspor Aset");
        expect((await sql<{ n: string }>`select count(*)::text n from activity_logs where aksi='ASSET_EXPORTED' and entitas_id=${queued.id}`.execute(getDb())).rows[0]!.n).toBe("1");
        const url = await service().download(owner, queued.id, "assets"); expect(url.url).toContain("storage.test/"); expect(signed.at(-1)!.ttl).toBe(300);
        await expect(service().status(other, queued.id, "assets")).rejects.toMatchObject({ kode: "NOT_FOUND" });
        expect((await withTransaction(system, s => exportNotificationSource(s, queued.id, clock), getDb()))!.deepLink).toBe(`/aset?ekspor=${queued.id}`);
    });
    it("filter/urut sama dengan katalog, hasil kosong serta batas sumber tidak terpotong diam-diam", async () => {
        const filter = { q: marker, kategori_id: Number(category), lokasi_id: Number(room), kondisi: "BAIK", status: "TERSEDIA", tahun_perolehan: 2026, dapat_dipinjam: "true", qr_terpasang: false, sort: "-kode_barang" };
        const canonical = AssetExportFilterSchema.parse(filter), list = ListAssetsQuerySchema.omit({ page: true, per_page: true }).parse(filter); expect(canonical).toEqual(list);
        const data = await read(owner, filter); expect(data.rows).toHaveLength(36); expect(data.rows[0]!.kode_barang).toBe(`${marker}-035`);
        expect((await read(owner, { q: "missing-" + marker })).rows).toEqual([]); expect((await read(owner, {}, 2)).rows).toHaveLength(3);
    });
    it("hak ekspor/baca beririsan; own memakai penanggung jawab, finansial own tidak membuka dataset campuran", async () => {
        const data = await read(own); expect(data.rows).toHaveLength(30); expect(data.columns.some(c => c.key === "nilai_perolehan")).toBe(true); expect(data.rows[0]!.nilai_perolehan).toBe("900719925474.01");
        expect((await read(financial)).columns.some(c => c.key === "nilai_perolehan")).toBe(true);
        const mixed = await read(financialOwn); expect(mixed.rows).toHaveLength(36); expect(mixed.columns.some(c => c.key === "nilai_perolehan")).toBe(false); expect(mixed.rows[0]).not.toHaveProperty("sumber_perolehan");
        for (const scopes of [{ "asset.view": "all" }, { "asset.export": "all" }, { "asset.view": "assigned", "asset.export": "all" }]) {
            const who = (await actor(scopes as Record<string, Scope>)).ctx; await expect(read(who)).rejects.toMatchObject({ kode: "FORBIDDEN" }); expect((await http("/assets/export?format=XLSX", who)).status).toBe(403);
        }
        const student = createAuthContext({ userId: owner.userId, roleCode: "R-07", scopes: new Map<string, Scope>([["asset.view", "restricted"], ["asset.export", "all"], ["asset.view_financial", "all"]]) });
        expect(assetExportAccess(student).financial).toBe(false); expect((await read(student)).rows).toHaveLength(18);
    });
    it("SQL tanpa hak finansial tidak menyeleksi nilai/sumber perolehan", async () => {
        const queries: string[] = [];
        await withTransaction(owner, s => assetExportDataset({ ...s, tx: s.tx.withPlugin({ transformQuery(a) { queries.push(JSON.stringify(a.node)); return a.node; }, async transformResult(a) { return a.result; } }) }, AssetExportFilterSchema.parse({ kategori_id: category }), 100000), getDb());
        expect(queries.join(" ")).not.toMatch(/nilai_perolehan|sumber_perolehan/);
    });
    it("filter hasil impor tetap milik pengunggah; endpoint katalog tidak membaca job analitik", async () => {
        const imported = (await sql<{ id: string }>`insert into asset_import_jobs(file_hash,nama_berkas,status,total_baris,created_by) values(${randomUUID()},'uji.csv','MENUNGGU',1,${owner.userId}) returning id::text`.execute(getDb())).rows[0]!.id;
        await expect(read(other, { import_job_id: imported })).rejects.toMatchObject({ kode: "NOT_FOUND" });
        const report = await sql<{ id: string }>`insert into report_exports(requester_id,jenis,judul,format,filter,access_hash,object_key,created_at,updated_at) values(${owner.userId},'kondisi-aset','Privat','XLSX','{}','x',${randomUUID()},${clock.now()},${clock.now()}) returning id::text`.execute(getDb());
        expect((await http(`/assets/exports/${report.rows[0]!.id}`)).status).toBe(404);
    });
    it("PDF nyata memuat kop/filter/WIB/pencetak dan tidak mengeksekusi teks HTML", async () => {
        const queued = await request(financial, "PDF", { kategori_id: category, q: marker }); await service().run(system, queued.id, pdf, true);
        const row = await job(queued.id); expect(row.status).toBe("SIAP"); const bytes = objects.get(row.object_key)!; expect(bytes.subarray(0,8).toString()).toBe("%PDF-1.7");
        const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs"), task = getDocument({ data: new Uint8Array(bytes), useSystemFonts: true }), doc = await task.promise;
        try { const page = await doc.getPage(1), text = (await page.getTextContent()).items.map(i => "str" in i ? i.str : "").join(" "); expect(text).toContain("Sekolah Ekspor Aset"); expect(text).toContain("Katalog Aset"); expect(text).toContain("WIB"); expect(text).toContain("Petugas Ekspor"); expect(text).toContain("<script>"); } finally { await task.destroy(); }
    });
    it("perubahan kepemilikan setelah siap dan pencabutan izin saat PUT menutup akses sebelum URL diterbitkan", async () => {
        const q = await request(own); await service().run(system, q.id, pdf, true); const before = signed.length;
        await sql`update assets set penanggung_jawab_id=${other.userId} where id=${changedAsset}::bigint`.execute(getDb());
        await expect(service().download(own, q.id, "assets")).rejects.toMatchObject({ kode: "FORBIDDEN" }); expect(signed).toHaveLength(before); expect((await job(q.id)).status).toBe("DIBATALKAN");
        const pending = await request(revoked); onPut = async () => { await sql`delete from role_permissions where role_id=${revokedRole}::bigint and permission_id=(select id from permissions where kode='asset.export')`.execute(getDb()); };
        await service().run(system, pending.id, pdf, true); const ended = await job(pending.id); expect(ended.status).toBe("DIBATALKAN"); expect(ended.file_id).toBeNull(); expect(objects.has(ended.object_key)).toBe(false);
        expect((await currentExportActor(getDb(), system, revoked.userId)).ctx.can("asset.export")).toBe(false);
    });
});
