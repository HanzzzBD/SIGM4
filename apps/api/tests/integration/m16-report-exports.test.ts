import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { sql } from "kysely";
import { beforeAll, describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { AnalyticsProviderRegistry, ReportExportService } from "../../src/modules/m16-analytics/index.js";
import type { AnalyticsProvider } from "../../src/modules/m16-analytics/index.js";
import { createAuthContext, setAuthContext, setAmr, AMR_OTP } from "../../src/shared/auth/index.js";
import type { AuthContext, Scope } from "../../src/shared/auth/index.js";
import { createSystemAuthContext } from "../../src/shared/auth/system-context.js";
import { FixedClock } from "../../src/shared/clock/index.js";
import { AuditLogger } from "../../src/shared/audit/index.js";
import { getDb, withTransaction } from "../../src/shared/db/index.js";
import type { PenyimpananObjek } from "../../src/shared/storage/index.js";
import { PembangkitPdfChromium } from "../../src/shared/pdf/index.js";
import { dbmate, kueri } from "../helpers/db.js";
import { currentExportActor } from "../../src/modules/m16-analytics/exports/authorization.js";
import { analyticsFilterOptions } from "../../src/modules/m16-analytics/options.js";
import { readExportDataset } from "../../src/modules/m16-analytics/exports/dataset.js";
import { ANALYTICS_TYPES } from "@sigm4/schemas";
import { createApp } from "../../src/api/index.js";
import { Logger, HealthRegistry } from "../../src/shared/observability/index.js";
import { authPalsu } from "../helpers/auth.js";
import { EventHandlerRegistry } from "../../src/shared/events/index.js";
import { pasangKonsumenNotifikasi } from "../../src/modules/m17-notifications/index.js";
const marker = randomUUID().slice(0, 7), system = createSystemAuthContext("report-export-test"), clock = new FixedClock(new Date("2026-10-14T03:00:00Z"));
const objects = new Map<string, Buffer>(), signatures: { key: string; ttl: number }[] = [];
let failPut = false, failDelete = false, afterPut: (() => Promise<void>) | undefined;
const storage: PenyimpananObjek = { urlUnggah: async () => "https://storage.test/put", urlUnduh: async (key, ttl) => { signatures.push({ key, ttl }); return `https://storage.test/private/${key}`; }, info: async key => objects.has(key) ? { ukuran: objects.get(key)!.length } : null, ambil: async key => objects.get(key) ?? null, simpan: async (key, bytes) => { objects.set(key, bytes); if (afterPut) { const hook = afterPut; afterPut = undefined; await hook(); } if (failPut) { failPut = false; throw new Error("PUT reply lost"); } }, hapus: async key => { if (failDelete) throw new Error("DELETE failed"); objects.delete(key); }, periksa: async () => undefined };
const pdf = new PembangkitPdfChromium(process.env["CHROMIUM_EXECUTABLE_PATH"] ?? (process.platform === "win32" ? "C:/Program Files/Google/Chrome/Application/chrome.exe" : null));
describe.skipIf(!process.env["DATABASE_URL"])("PR-06-08/11 durable private report exports", () => {
    let actor: AuthContext, other: AuthContext, all: AuthContext, roleId: string, room: string, foreignRoom: string, category: string, assetId: string;
    const grants: Record<string, Scope> = { "report.view": "all", "report.export": "own", "asset.view": "all", "asset.view_financial": "own", "reservation.view": "all", "damage.view": "all" };
    const makeActor = async (scopes: Record<string, Scope>) => {
        const code = `R-EXP-${randomUUID().slice(0, 7)}`;
        const r = (await sql<{ id: string }>`insert into roles(kode,nama) values(${code},${code}) returning id::text`.execute(getDb())).rows[0]!.id;
        for (const [permission, scope] of Object.entries(scopes)) await sql`insert into role_permissions(role_id,permission_id,scope) select ${r}::bigint,id,${scope.toUpperCase()}::permission_scope from permissions where kode=${permission}`.execute(getDb());
        const id = (await sql<{ id: string }>`insert into users(nama,email,password_hash,nip_nis,role_id,status,must_change_password) values(${`Exporter-${marker}`},${`${randomUUID()}@export.test`},'x',${randomUUID()},${r}::bigint,'AKTIF',false) returning id::text`.execute(getDb())).rows[0]!.id;
        return { role: r, ctx: createAuthContext({ userId: Number(id), roleCode: code, scopes: new Map(Object.entries(scopes)) }) };
    };
    const provider: AnalyticsProvider = { jenis: "rekapitulasi-aset", prepare: c => ({ rows: sql`select a.id::text grup,a.nama ${c.access.assetFinancial ? sql`,a.nilai_perolehan::text nilai` : sql``} from assets a where a.category_id=${category} and ${c.access.predicate("assets")} and (${c.query.room_id ?? null}::bigint is null or a.room_id=${c.query.room_id ?? null})`, summary: sql`select count(*)::int jumlah from assets a where a.category_id=${category} and ${c.access.predicate("assets")}`, columns: [{ key: "grup", label: "ID", tipe: "TEXT", sensitivitas: "PUBLIC" }, { key: "nama", label: "Nama", tipe: "TEXT", sensitivitas: "PUBLIC" }, ...(c.access.assetFinancial ? [{ key: "nilai", label: "Nilai", tipe: "DECIMAL" as const, sensitivitas: "ASSET_FINANCIAL" as const }] : [])], summaryFields: [{ key: "jumlah", label: "Jumlah", tipe: "NUMBER", sensitivitas: "PUBLIC" }], key: "grup", defaultSort: "grup" }) };
    const registry = new AnalyticsProviderRegistry().register(provider);
    const service = (providers = registry) => new ReportExportService(getDb(), clock, new AuditLogger({ clock }), storage, providers);
    const request = (jenis = "rekapitulasi-aset", format: "XLSX" | "PDF" = "XLSX", filter: unknown = {}, who = actor, s = service()) => withTransaction(who, scope => s.request(scope, jenis, { format, filter }), getDb());
    const job = async (id: string) => (await getDb().selectFrom("report_exports").selectAll().where("id", "=", id).executeTakeFirstOrThrow());
    beforeAll(async () => {
        dbmate("up"); const first = await makeActor(grants); actor = first.ctx; roleId = first.role; other = (await makeActor(grants)).ctx; all = (await makeActor({ ...grants, "report.export": "all", "asset.view_financial": "all" })).ctx;
        const id = async (q: string) => (await kueri<{ id: string }>(q))[0]!.id;
        const building = await id(`insert into buildings(nama,kode) values ('Export','EX${marker}') returning id::text`), area = await id(`insert into areas(building_id,nama,kode) values (${building},'Export','EX${marker}') returning id::text`);
        room = await id(`insert into rooms(area_id,nama,kode,jenis) values (${area},'Export Own','EX${marker}','KELAS') returning id::text`); foreignRoom = await id(`insert into rooms(area_id,nama,kode,jenis) values (${area},'Export Foreign','XF${marker}','KELAS') returning id::text`); category = await id(`insert into asset_categories(nama,kode) values ('Export','EX${marker}') returning id::text`);
        for (const who of [actor, other]) { const result = await id(`insert into assets(kode_barang,nama,category_id,tahun_perolehan,sumber_perolehan,room_id,kondisi,status,nilai_perolehan,penanggung_jawab_id,created_by) values ('${randomUUID()}','=SUM(1,2)',${category},2026,'PEMBELIAN',${who === actor ? room : foreignRoom},'BAIK','TERSEDIA',9999999999.95,${who.userId},${other.userId}) returning id::text`); if (who === actor) assetId = result; }
        await sql`insert into system_settings(key,kelompok,tipe,value,nilai_bawaan,deskripsi) values('sekolah.nama','IDENTITAS_SEKOLAH','TEKS',${JSON.stringify("Sekolah Uji Ekspor")}::jsonb,'""'::jsonb,'Nama sekolah') on conflict(key) do update set value=excluded.value`.execute(getDb());
    });
    it("worker exports every scoped row, strings retain precision/formula text; job replay has one audit/event/file", async () => {
        const queued = await request(); expect(queued.status).toBe("MENUNGGU"); expect(objects.size).toBe(0);
        expect((await sql<{ n: string }>`select count(*)::text n from event_outbox where event_name='ExportRequested' and aggregate_id=${queued.id}`.execute(getDb())).rows[0]!.n).toBe("1");
        await service().run(system, queued.id, pdf, false); await service().run(system, queued.id, pdf, true);
        const row = await job(queued.id); expect(row.status).toBe("SIAP"); expect(row.jumlah_baris).toBe(1);
        const book = new ExcelJS.Workbook(); await book.xlsx.load(objects.get(row.object_key)! as unknown as Parameters<typeof book.xlsx.load>[0]); const sheet = book.getWorksheet("Data")!;
        expect(sheet.rowCount).toBe(2); expect(sheet.getCell("B2").value).toBe("=SUM(1,2)"); expect(sheet.getCell("B2").type).toBe(ExcelJS.ValueType.String); expect(sheet.getCell("C2").value).toBe("9999999999.95");
        expect(book.getWorksheet("Keterangan")!.getCell("A1").value).toBe("Sekolah Uji Ekspor");
        expect((await sql<{ n: string }>`select count(*)::text n from activity_logs where aksi='REPORT_EXPORTED' and entitas_id=${queued.id}`.execute(getDb())).rows[0]!.n).toBe("1");
        expect((await sql<{ n: string }>`select count(*)::text n from event_outbox where event_name='ExportReady' and aggregate_id=${queued.id}`.execute(getDb())).rows[0]!.n).toBe("1");
        expect((await service().download(actor, queued.id)).url).toContain("private/"); expect(signatures.at(-1)!.ttl).toBe(300);
        await expect(service().download(other, queued.id)).rejects.toMatchObject({ kode: "NOT_FOUND" });
        expect((await getDb().selectFrom("stored_files").selectAll().where("id", "=", row.file_id!).executeTakeFirstOrThrow()).owner_type).toBe("REPORT_EXPORT");
        const handlers = new EventHandlerRegistry(); pasangKonsumenNotifikasi(handlers, { db: getDb, clock, ctx: () => system });
        const eventRow = (await getDb().selectFrom("event_outbox").selectAll().where("event_name", "=", "ExportReady").where("aggregate_id", "=", queued.id).executeTakeFirstOrThrow());
        const event = { id: eventRow.id, name: "ExportReady", aggregateType: "report_export", aggregateId: queued.id, payload: eventRow.payload, actorId: null, requestId: null, occurredAt: clock.now(), attempts: 0 };
        await handlers.handlersFor("ExportReady")[0]!(event); await handlers.handlersFor("ExportReady")[0]!(event);
        const notification = await getDb().selectFrom("notifications").select(["user_id", "deep_link"]).where("kode", "=", "NT-42").where("referensi_id", "=", queued.id).execute();
        expect(notification).toEqual([{ user_id: String(actor.userId), deep_link: `/analitik/rekapitulasi-aset?ekspor=${queued.id}` }]);
    });
    it("scope ownership change invalidates completed file and cannot widen export", async () => {
        const queued = await request(); await service().run(system, queued.id, pdf, true);
        await sql`update assets set penanggung_jawab_id=${other.userId} where id=${assetId}::bigint`.execute(getDb());
        await expect(service().download(actor, queued.id)).rejects.toMatchObject({ kode: "FORBIDDEN" }); expect((await job(queued.id)).status).toBe("DIBATALKAN");
        await sql`update assets set penanggung_jawab_id=${actor.userId} where id=${assetId}::bigint`.execute(getDb());
    });
    it("fresh worker SQL denies revoked permissions; cached request ctx cannot grant access", async () => {
        const queued = await request(); await sql`delete from role_permissions where role_id=${roleId}::bigint and permission_id=(select id from permissions where kode='report.export')`.execute(getDb());
        await service().run(system, queued.id, pdf, false); expect((await job(queued.id)).status).toBe("DIBATALKAN");
        await expect(request()).rejects.toMatchObject({ kode: "FORBIDDEN" });
        await sql`insert into role_permissions(role_id,permission_id,scope) select ${roleId}::bigint,id,'OWN' from permissions where kode='report.export'`.execute(getDb());
    });
    it("an export canceled while rendering cannot be resurrected by final publication", async () => {
        const queued = await request();
        afterPut = async () => { await getDb().updateTable("report_exports").set({ status: "DIBATALKAN", pesan_galat: "Cakupan berubah" }).where("id", "=", queued.id).execute(); };
        await service().run(system, queued.id, pdf, true);
        const row = await job(queued.id); expect(row.status).toBe("DIBATALKAN"); expect(row.file_id).toBeNull(); expect(objects.has(row.object_key)).toBe(false);
        expect((await getDb().selectFrom("event_outbox").select("id").where("event_name", "=", "ExportReady").where("aggregate_id", "=", queued.id).execute())).toHaveLength(0);
    });
    it("PDF overflow fails without truncation and no file or success audit", async () => {
        const overflow = new AnalyticsProviderRegistry().register({ ...provider, prepare: () => ({ rows: sql`select n::text grup,'x'::text nama from generate_series(1,5001) n`, summary: sql`select 5001::int jumlah`, columns: [{ key: "grup", label: "ID", tipe: "TEXT", sensitivitas: "PUBLIC" }, { key: "nama", label: "Nama", tipe: "TEXT", sensitivitas: "PUBLIC" }], summaryFields: [{ key: "jumlah", label: "Jumlah", tipe: "NUMBER", sensitivitas: "PUBLIC" }], key: "grup", defaultSort: "grup" }) });
        const s = service(overflow), queued = await request("rekapitulasi-aset", "PDF", {}, actor, s); await s.run(system, queued.id, pdf, true);
        const row = await job(queued.id); expect(row.status).toBe("GAGAL"); expect(row.pesan_galat).toContain("5000"); expect(row.file_id).toBeNull(); expect(objects.has(row.object_key)).toBe(false);
    });
    it("PUT reply loss is compensated, retry remains idempotent; expired objects cleanup retries after storage failure", async () => {
        const queued = await request(); failPut = true; await expect(service().run(system, queued.id, pdf, false)).rejects.toThrow("PUT reply lost"); expect(objects.has((await job(queued.id)).object_key)).toBe(false);
        await service().run(system, queued.id, pdf, true); const ready = await job(queued.id); expect(ready.status).toBe("SIAP");
        const original = clock.now(); clock.advance(86400001); await expect(service().download(actor, queued.id)).rejects.toMatchObject({ kode: "VALIDATION_ERROR" });
        failDelete = true; await expect(service().cleanup(system)).rejects.toThrow("DELETE failed"); expect((await job(queued.id)).object_removed_at).toBeNull(); failDelete = false;
        await service().cleanup(system); expect((await job(queued.id)).status).toBe("KEDALUWARSA"); expect((await job(queued.id)).file_id).toBeNull(); expect(objects.has(ready.object_key)).toBe(false); clock.advance(original.getTime() - clock.now().getTime());
    });
    it("operational exports preserve P-30/P-39 scopes, filters and approved fields, including UTF-8/PDF escape", async () => {
        for (const who of [actor, other]) await sql`insert into reservations(nomor,jenis,pemohon_id,room_id,nama_kegiatan,jenis_kegiatan,jumlah_peserta,waktu_mulai,waktu_selesai,status,created_by,updated_by) values(${`RSV-RG-2026-${String(who.userId).padStart(6,"0")}`},'RUANGAN',${who.userId},${room}::bigint,'<script>kegiatan</script>','Rapat',1,'2026-10-14T01:00:00Z','2026-10-14T02:00:00Z','SELESAI',${who.userId},${who.userId})`.execute(getDb());
        const queued = await request("reservations", "XLSX", { q: "<script>kegiatan</script>" }); await service().run(system, queued.id, pdf, true); const row = await job(queued.id); expect(row.jumlah_baris).toBe(1);
        const book = new ExcelJS.Workbook(); await book.xlsx.load(objects.get(row.object_key)! as unknown as Parameters<typeof book.xlsx.load>[0]); expect(book.getWorksheet("Data")!.getCell("C2").value).toBe("<script>kegiatan</script>"); expect(book.getWorksheet("Data")!.getCell("F2").value).toContain("WIB");
        const pdfJob = await request("reservations", "PDF", { q: "<script>kegiatan</script>" }, all); await service().run(system, pdfJob.id, pdf, true); expect((await job(pdfJob.id)).jumlah_baris).toBe(2); expect(objects.get((await job(pdfJob.id)).object_key)!.subarray(0, 8).toString()).toBe("%PDF-1.7");
        const ticket = await sql<{ id: string }>`insert into damage_reports(nomor,pelapor_id,room_id,deskripsi,urgensi,status,batas_sla,created_by,updated_by) values(${`KRS-2026-${String(actor.userId).padStart(6,"0")}`},${actor.userId},${room}::bigint,'Rusak','TINGGI','DILAPORKAN','2026-10-01T00:00:00Z',${actor.userId},${actor.userId}) returning id::text`.execute(getDb());
        const damage = await request("damage-reports", "XLSX", { q: `KRS-2026-${String(actor.userId).padStart(6,"0")}`, melampaui_sla: "true" }); await service().run(system, damage.id, pdf, true); expect((await job(damage.id)).jumlah_baris).toBe(1); expect(ticket.rows[0]!.id).toBeTruthy();
        const actual = await currentExportActor(getDb(), system, actor.userId); expect(actual.ctx.scopeOf("report.export")).toBe("own");
        const options = await analyticsFilterOptions(getDb(), actor, "rekapitulasi-aset"); expect(options.rooms.map(r => r.id)).toContain(room);
        const ownCtx = createAuthContext({ userId: actor.userId, roleCode: actor.roleCode, scopes: new Map(Object.entries({ ...grants, "report.view": "own" as const })) });
        expect((await analyticsFilterOptions(getDb(), ownCtx, "rekapitulasi-aset")).rooms.map(r => r.id)).not.toContain(foreignRoom);
    });
    it("export can exceed direct 366 days but rejects >5 years, ignored paging and unsupported domains", async () => {
        await expect(request("rekapitulasi-aset", "XLSX", { tanggal_mulai: "2022-01-01", tanggal_selesai: "2026-10-14" })).resolves.toMatchObject({ status: "MENUNGGU" });
        await expect(request("rekapitulasi-aset", "XLSX", { tanggal_mulai: "2020-01-01", tanggal_selesai: "2026-10-14" })).rejects.toMatchObject({ kode: "VALIDATION_ERROR" });
        await expect(request("reservations", "XLSX", { page: 2 })).rejects.toThrow();
    });
    it("unconfigured school name blocks PDF while XLSX remains available", async () => {
        await sql`update system_settings set value='""'::jsonb where key='sekolah.nama'`.execute(getDb());
        try {
            await expect(request("rekapitulasi-aset", "PDF")).rejects.toMatchObject({ kode: "VALIDATION_ERROR" });
            await expect(request()).resolves.toMatchObject({ status: "MENUNGGU" });
        } finally { await sql`update system_settings set value=${JSON.stringify("Sekolah Uji Ekspor")}::jsonb where key='sekolah.nama'`.execute(getDb()); }
    });
    it("all scoped filter dictionaries execute real SQL; assigned damage export intersects report own", async () => {
        const ctx = createAuthContext({ userId: actor.userId, roleCode: "R-01", scopes: new Map(["report.view", "report.export", "asset.view", "reservation.view", "loan.view", "damage.view", "maintenance.view_cost", "material.view"].map(p => [p, "all" as const])) });
        for (const jenis of ANALYTICS_TYPES) { const options = await analyticsFilterOptions(getDb(), ctx, jenis); expect(Array.isArray(options.rooms)).toBe(true); expect(Array.isArray(options.categories)).toBe(true); }
        const nomor = `KRS-2026-9${String(actor.userId).padStart(6, "0")}`;
        const ticket = (await sql<{ id: string }>`insert into damage_reports(nomor,pelapor_id,room_id,deskripsi,urgensi,status,created_by) values(${nomor},${other.userId},${foreignRoom}::bigint,'Assigned fixture','SEDANG','DILAPORKAN',${other.userId}) returning id::text`.execute(getDb())).rows[0]!.id;
        await sql`insert into work_orders(nomor,room_id,damage_report_id,teknisi_id,prioritas,deskripsi,target_selesai) values(${`WO-2026-9${String(actor.userId).padStart(6, "0")}`},${foreignRoom}::bigint,${ticket}::bigint,${actor.userId},'SEDANG','Assigned fixture','2026-10-16')`.execute(getDb());
        const technician = (scope: Scope) => createAuthContext({ userId: actor.userId, roleCode: "R-04", scopes: new Map<string, Scope>([["damage.view", "assigned"], ["report.export", scope]]) });
        const read = (scope: Scope) => withTransaction(technician(scope), s => readExportDataset(s, "damage-reports", { q: nomor }, 100000, clock, registry), getDb());
        expect((await read("all")).rows).toHaveLength(1); expect((await read("own")).rows).toHaveLength(0);
    });
    it("HTTP returns 202 without rendering, enforces strict inputs and binds replay to actor/endpoint", async () => {
        const app = express(), actors = new Map([actor, other, all].map(a => [String(a.userId), a]));
        app.use((req, res, next) => { setAuthContext(res, actors.get(req.header("x-user") ?? "") ?? actor); setAmr(res, ["pwd", AMR_OTP]); next(); });
        app.use(createApp({ appBaseUrl: "https://exports.test", db: getDb(), clock, logger: new Logger({ clock, tulis: () => undefined }), auth: authPalsu(), health: new HealthRegistry(30), security: { objectStorageOrigin: "https://storage.test" }, penyimpanan: storage, analyticsProviders: registry, limiter: { hit: async () => ({ lolos: true, batas: 1000, sisa: 999, resetDetik: 60 }) } }));
        const server = createServer(app); await new Promise<void>(r => server.listen(0, "127.0.0.1", r));
        const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`, key = randomUUID(), before = objects.size;
        const post = (who = actor, path = "/analytics/rekapitulasi-aset/export", body: unknown = { format: "XLSX", filter: {} }, idempotency = key) => fetch(base + path, { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": idempotency, "x-user": String(who.userId) }, body: JSON.stringify(body) });
        try {
            const first = await post(), body = await first.json() as { data: { id: string } }; expect(first.status).toBe(202); expect(first.headers.get("cache-control")).toBe("private, no-store"); expect(objects.size).toBe(before);
            const replay = await post(); expect(replay.status).toBe(202); expect(await replay.json()).toEqual(body);
            expect((await post(other)).status).toBe(409); expect((await post(actor, "/reservations/export")).status).toBe(409);
            expect((await post(actor, "/analytics/rekapitulasi-aset/export", { format: "XLSX", filter: { page: 3 } }, randomUUID())).status).toBe(400);
            expect((await fetch(`${base}/report-exports/${body.data.id}`, { headers: { "x-user": String(other.userId) } })).status).toBe(404);
            const status = await fetch(`${base}/report-exports/${body.data.id}`, { headers: { "x-user": String(actor.userId) } }); expect(status.status).toBe(200);
            expect((await job(body.data.id)).status).toBe("MENUNGGU");
        } finally { await new Promise<void>(r => server.close(() => r())); }
    });
});
