import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import ExcelJS from "exceljs";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { DisposalDetailResponseSchema, DisposalCandidatesResponseSchema, DisposalListResponseSchema, DisposalQuerySchema } from "@sigm4/schemas";
import type { DisposalDetail } from "@sigm4/schemas";
import { createApp } from "../../src/api/index.js";
import { DisposalReportService } from "../../src/modules/m21-disposal/index.js";
import { createAuthContext, setAuthContext, setAmr, AMR_OTP } from "../../src/shared/auth/index.js";
import { createSystemAuthContext } from "../../src/shared/auth/system-context.js";
import type { Scope } from "../../src/shared/auth/index.js";
import { FixedClock } from "../../src/shared/clock/index.js";
import { AuditLogger } from "../../src/shared/audit/index.js";
import { getDb, withTransaction } from "../../src/shared/db/index.js";
import { SlotService } from "../../src/shared/booking/index.js";
import { PembangkitPdfChromium } from "../../src/shared/pdf/index.js";
import { EventHandlerRegistry } from "../../src/shared/events/index.js";
import { pasangKonsumenNotifikasi, fcmCheck } from "../../src/modules/m17-notifications/index.js";
import { Logger, HealthRegistry } from "../../src/shared/observability/index.js";
import type { PenyimpananObjek } from "../../src/shared/storage/index.js";
import { kueri, dbmate } from "../helpers/db.js";
import { authPalsu } from "../helpers/auth.js";
const marker = randomUUID().slice(0, 7), clock = new FixedClock(new Date("2027-11-15T03:00:00Z")), audit = new AuditLogger({ clock });
interface Actor { id: number; role: string; permissions: string[] }
const objects = new Map<string, Buffer>(), storage: PenyimpananObjek = { urlUnduh: async key => `https://storage.test/${key}`, urlUnggah: async key => `https://storage.test/${key}`, info: async key => objects.has(key) ? { ukuran: objects.get(key)!.length } : null, ambil: async key => objects.get(key) ?? null, simpan: async (key, bytes) => { objects.set(key, bytes); }, hapus: async key => { objects.delete(key); }, periksa: async () => undefined };
describe.skipIf(!process.env["DATABASE_URL"])("PR-05-10..14/29 penghapusan aset", () => {
    let server: Server, base: string, room: string, category: string, manager: Actor, reviewer: Actor, leader: Actor, admin: Actor, stranger: Actor, rule: string, disposed: DisposalDetail;
    const id = async (query: string) => (await kueri<{ id: string }>(query))[0]!.id;
    const actor = async (role: string, permissions: string[]): Promise<Actor> => ({ id: Number(await id(`INSERT INTO users(nama,email,password_hash,nip_nis,role_id,status,must_change_password) VALUES ('${role}-${marker}','${randomUUID()}@hps.test','x','${randomUUID()}',(SELECT id FROM roles WHERE kode='${role}'),'AKTIF',false) RETURNING id::text`)), role, permissions });
    const ctx = (a: Actor) => createAuthContext({ userId: a.id, roleCode: a.role, scopes: new Map<string, Scope>(a.permissions.map(p => { const [name, scope] = p.split(":"); return [name!, (scope ?? "all") as Scope]; })) });
    const send = async (path: string, who: Actor, body?: unknown, key = randomUUID(), method = body === undefined ? "GET" : "POST") => { const r = await fetch(base + path, { method, headers: { "content-type": "application/json", "x-user": String(who.id), "x-role": who.role, "x-permissions": who.permissions.join(","), "Idempotency-Key": key }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }); return { status: r.status, json: await r.json() as { data: DisposalDetail; error?: unknown } }; };
    const asset = async (condition = "RUSAK_BERAT", value: string | null = "12345.67") => id(`INSERT INTO assets(kode_barang,nama,category_id,tahun_perolehan,sumber_perolehan,room_id,kondisi,status,nilai_perolehan,dapat_dipinjam) VALUES ('H${randomUUID()}','Kipas ${marker}',${category},2026,'PEMBELIAN',${room},'${condition}','${['HILANG','RUSAK_BERAT'].includes(condition)?'TIDAK_TERSEDIA':'TERSEDIA'}',${value ?? "NULL"},true) RETURNING id::text`);
    const file = (kind = "DISPOSAL_EXECUTION_PHOTO", owner = manager.id, status = "CLEAN", checksum = true) => id(`INSERT INTO stored_files(object_key,mime,ukuran,checksum,scan_status,owner_type,uploaded_by) VALUES ('${randomUUID()}','${kind==='DISPOSAL_EXECUTION_PHOTO'?'image/jpeg':'application/pdf'}',100,${checksum?`'${"a".repeat(64)}'`:"NULL"},'${status}','${kind}',${owner}) RETURNING id::text`);
    const body = (ids: string[], reason = "RUSAK_BERAT_TIDAK_DAPAT_DIPERBAIKI") => ({ alasan: reason, justifikasi: "Tidak dapat diperbaiki setelah pemeriksaan", tindak_lanjut_fisik: reason === "HILANG" ? "ADMINISTRATIF" : "DIMUSNAHKAN", items: ids.map(asset_id => ({ asset_id: Number(asset_id) })) });
    const create = async (ids: string[]) => { const r = await send("/asset-disposals", manager, body(ids)); expect(r.status, JSON.stringify(r.json)).toBe(201); return DisposalDetailResponseSchema.parse(r.json).data; };
    const decide = (d: DisposalDetail, who: Actor, urutan: number, decision = "DISETUJUI", selected?: boolean[]) => send(`/approvals/${d.approval_instance_id}/decide`, who, { urutan, keputusan: decision, catatan: "Sudah ditinjau", ...(selected ? { rincian_keputusan: { items: d.items.map((i, index) => ({ item_id: Number(i.id), disetujui: selected[index] })) } } : {}) });
    const approve = async (d: DisposalDetail) => { expect((await decide(d, reviewer, 1)).status).toBe(200); expect((await decide(d, leader, 2)).status).toBe(200); return DisposalDetailResponseSchema.parse((await send(`/asset-disposals/${d.id}`, manager)).json).data; };
    const execution = async () => ({ tanggal: "2027-11-15", tindak_lanjut: "DIMUSNAHKAN", saksi: ["Saksi Sarpras"], foto_file_ids: [Number(await file())], catatan: "Dilaksanakan sesuai berita acara" });
    beforeAll(async () => {
        dbmate("up"); manager = await actor("R-02", ["disposal.view", "disposal.create", "disposal.execute", "asset.view", "asset.view_financial", "maintenance.view_cost", "audit.manage", "audit.view", "audit.execute"]);
        reviewer = await actor("R-02", ["disposal.view", "approval.decide", "approval.view_history"]); leader = await actor("R-03", ["disposal.view", "disposal.approve", "approval.decide", "approval.view_history", "asset.view_financial", "audit.approve", "audit.view"]); admin = await actor("R-01", ["disposal.view", "disposal.create", "disposal.execute", "disposal.reinstate", "asset.view"]); stranger = await actor("R-02", ["disposal.view:own", "disposal.create:own"]);
        const building = await id(`INSERT INTO buildings(nama,kode) VALUES ('Penghapusan','H${marker}') RETURNING id::text`), area = await id(`INSERT INTO areas(building_id,nama,kode) VALUES (${building},'Penghapusan','H${marker}') RETURNING id::text`);
        room = await id(`INSERT INTO rooms(area_id,nama,kode,jenis) VALUES (${area},'Gudang','H${marker}','GUDANG') RETURNING id::text`); category = await id(`INSERT INTO asset_categories(nama,kode,umur_teknis_tahun) VALUES ('Hapus','H${marker}',5) RETURNING id::text`);
        const app = express(); app.use((req, res, next) => { setAuthContext(res, ctx({ id: Number(req.header("x-user")), role: req.header("x-role")!, permissions: (req.header("x-permissions") ?? "").split(",").filter(Boolean) })); setAmr(res, ["pwd", AMR_OTP]); next(); });
        app.use(createApp({ appBaseUrl: "https://hps.test", db: getDb(), clock, logger: new Logger({ clock, tulis: () => undefined }), penyimpanan: storage, pdf: new PembangkitPdfChromium("C:/Program Files/Google/Chrome/Application/chrome.exe"), auth: authPalsu(), health: new HealthRegistry(30).register(fcmCheck(null)), security: { objectStorageOrigin: "https://storage.test" }, limiter: { hit: async () => ({ lolos: true, batas: 10000, sisa: 9999, resetDetik: 60 }) } })); server = createServer(app); await new Promise<void>(r => server.listen(0, "127.0.0.1", r)); base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
    });
    afterAll(async () => { if (server) await new Promise<void>(r => server.close(() => r())); });
    it("requires configured principal route, known value and eligible assets; failure leaves no claim", async () => {
        const unit = await asset(); expect((await send("/asset-disposals", leader, body([unit]))).status).toBe(403); expect((await send("/asset-disposals", manager, body([unit]))).status).toBe(422);
        rule = await id("INSERT INTO approval_rules(jenis_pengajuan,prioritas,kondisi,status_aktif) VALUES ('PENGHAPUSAN_ASET',100,'{}',true) RETURNING id::text");
        for (const [index, who] of [reviewer, leader].entries()) await kueri(`INSERT INTO approval_rule_steps(rule_id,urutan,approver_type,approver_user_id,sla_jam) VALUES (${rule},${index+1},'user',${who.id},8)`);
        expect((await send("/asset-disposals", manager, body([await asset("RUSAK_BERAT", null)]))).status).toBe(422); expect((await send("/asset-disposals", manager, body([await asset("BAIK")]))).status).toBe(422);
        expect((await kueri<{ n: string }>("SELECT count(*)::text AS n FROM asset_disposal_claims"))[0]!.n).toBe("0");
    });
    it("creates immutable snapshots, enforces one claim and reservation SQL protection; replays do not duplicate", async () => {
        const unit = await asset(), key = randomUUID(), result = await send("/asset-disposals", manager, body([unit]), key); expect(result.status, JSON.stringify(result.json)).toBe(201); const d = DisposalDetailResponseSchema.parse(result.json).data;
        expect(d.nomor).toMatch(/^HPS-2027-\d{4}$/); expect(d.total_nilai).toBe("12345.67"); expect((await send("/asset-disposals", manager, body([unit]), key)).json.data.id).toBe(d.id);
        expect((await send("/asset-disposals", manager, body([unit]))).status).toBe(422); expect((await send(`/asset-disposals/${d.id}`, stranger)).status).toBe(404);
        await expect(kueri(`UPDATE asset_disposal_items SET snapshot='{}' WHERE disposal_id=${d.id}`)).rejects.toThrow("immutable");
        await expect(kueri(`INSERT INTO booking_slots(resource_type,resource_id,slot_range,status,origin) VALUES ('asset',${unit},tstzrange('2027-11-16','2027-11-17','[)'),'TENTATIVE','reservation')`)).rejects.toThrow("claimed for disposal");
        expect((await send(`/asset-disposals/${d.id}/cancel`, stranger, { alasan: "Asing" })).status).toBe(404); expect((await send(`/asset-disposals/${d.id}/cancel`, manager, { alasan: "Batal" })).status).toBe(200);
        expect((await send("/asset-disposals", manager, body([unit]))).status).toBe(201);
    });
    it("supports monotonic per-asset approval; final principal permission and decision race are enforced", async () => {
        const d = await create([await asset(), await asset()]);
        expect((await decide(d, manager, 1)).status).toBe(403); expect((await decide(d, reviewer, 1, "DISETUJUI", [true, false])).status).toBe(200);
        const recorded = await kueri<{ rincian: string }>(`SELECT rincian_keputusan::text AS rincian FROM approval_steps WHERE instance_id=${d.approval_instance_id} AND urutan=1`);
        expect(recorded[0]!.rincian).not.toContain("nilai_perolehan"); expect(recorded[0]!.rincian).not.toContain("biaya_pemeliharaan");
        expect((await decide(d, leader, 2, "DISETUJUI", [true, true])).status).toBe(422);
        expect((await decide(d, { ...leader, permissions: leader.permissions.filter(p => p !== "disposal.approve") }, 2)).status).toBe(403);
        expect((await decide(d, { ...leader, role: "R-01" }, 2)).status).toBe(403);
        const race = await Promise.all([decide(d, leader, 2), decide(d, leader, 2)]); expect(race.map(r => r.status).sort()).toEqual([200,409]);
        disposed = DisposalDetailResponseSchema.parse((await send(`/asset-disposals/${d.id}`, manager)).json).data; expect(disposed.status).toBe("DISETUJUI_SEBAGIAN"); expect(disposed.items.map(i => i.disetujui)).toEqual([true,false]);
        expect((await kueri<{ n: string }>(`SELECT count(*)::text n FROM asset_disposal_claims WHERE disposal_id=${d.id}`))[0]!.n).toBe("1");
    });
    it("execution requires CLEAN own photos, witnesses and correct date; atomically removes approved assets only", async () => {
        const b = await execution(); expect((await send(`/asset-disposals/${disposed.id}/execute`, reviewer, b)).status).toBe(403);
        expect((await send(`/asset-disposals/${disposed.id}/execute`, manager, { ...b, saksi: [] })).status).toBe(422); expect((await send(`/asset-disposals/${disposed.id}/execute`, manager, { ...b, tanggal: "2027-11-16" })).status).toBe(422);
        expect((await send(`/asset-disposals/${disposed.id}/execute`, manager, { ...b, foto_file_ids: [Number(await file("DISPOSAL_EXECUTION_PHOTO", manager.id, "PENDING"))] })).status).toBe(422);
        expect((await send(`/asset-disposals/${disposed.id}/execute`, manager, { ...b, foto_file_ids: [Number(await file("DISPOSAL_EXECUTION_PHOTO", reviewer.id))] })).status).toBe(422);
        const key = randomUUID(), result = await send(`/asset-disposals/${disposed.id}/execute`, manager, b, key); expect(result.status, JSON.stringify(result.json)).toBe(200); expect((await send(`/asset-disposals/${disposed.id}/execute`, manager, b, key)).status).toBe(200);
        const rows = await kueri<{ dihapuskan: boolean; status: string }>(`SELECT dihapuskan,status FROM assets WHERE id IN (${disposed.items.map(i=>i.asset_id).join(',')}) ORDER BY id`); expect(rows).toEqual([{ dihapuskan: true, status: "TIDAK_TERSEDIA" }, { dihapuskan: false, status: "TIDAK_TERSEDIA" }]);
        await expect(kueri(`UPDATE assets SET nama='Tidak boleh' WHERE id=${disposed.items[0]!.asset_id}`)).rejects.toThrow("cannot be modified");
        await expect(kueri(`DELETE FROM assets WHERE id=${disposed.items[0]!.asset_id}`)).rejects.toThrow();
        await expect(kueri(`INSERT INTO assets(kode_barang,nama,category_id,tahun_perolehan,sumber_perolehan,room_id,kondisi,status) SELECT kode_barang,'Kode terpakai',category_id,tahun_perolehan,sumber_perolehan,room_id,'BAIK','TERSEDIA' FROM assets WHERE id=${disposed.items[0]!.asset_id}`)).rejects.toThrow("assets_kode_barang");
        expect((await send(`/assets/${disposed.items[0]!.asset_id}`, manager)).status).toBe(200); expect((await send(`/asset-disposals/${disposed.id}/execute`, manager, b)).status).toBe(422);
    });
    it("generates persistent financial and redacted PDF once; historic XLSX and archive totals are audited", async () => {
        const service = new DisposalReportService(getDb(), clock, audit, storage), system = createSystemAuthContext("test-disposal"), renderer = new PembangkitPdfChromium("C:/Program Files/Google/Chrome/Application/chrome.exe");
        await service.run(system, disposed.id, renderer); await service.run(system, disposed.id, { render: async () => { throw new Error("Duplicate PDF"); } }); expect(objects.size).toBe(2); expect([...objects.values()].every(b=>b.subarray(0,8).toString()==="%PDF-1.7")).toBe(true);
        const full = await service.download(ctx(manager), disposed.id), hidden = await service.download(ctx(reviewer), disposed.id); expect(full.file_id).not.toBe(hidden.file_id); expect(full.status).toBe("SIAP");
        const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
        const text = async (bytes: Buffer) => { const task = getDocument({ data: new Uint8Array(bytes) }), pdf = await task.promise; let result = ""; for (let page = 1; page <= pdf.numPages; page++) { const content = await (await pdf.getPage(page)).getTextContent(); result += content.items.map(i => "str" in i ? i.str : "").join(" "); } await task.destroy(); return result; };
        const documents = [...objects.values()]; expect(await text(documents[0]!)).toContain("12345.67"); expect(await text(documents[1]!)).not.toContain("12345.67");
        const filtered = DisposalQuerySchema.parse({ tab: "ARSIP", tahun: 2027, category_id: Number(category) }), archive = DisposalListResponseSchema.parse((await send(`/asset-disposals?tab=ARSIP&tahun=2027&category_id=${category}`, manager)).json); expect(archive.ringkasan).toEqual({ unit: 1, nilai: "12345.67" });
        const exported = await service.export(ctx(manager), filtered, "XLSX", renderer), book = new ExcelJS.Workbook(); await book.xlsx.load(exported.bytes as never); expect(book.getWorksheet("Arsip Penghapusan")!.rowCount).toBe(2); expect(book.getWorksheet("Arsip Penghapusan")!.getCell("I2").value).toBe("12345.67");
        const redacted = await service.export(ctx(reviewer), filtered, "XLSX", renderer), book2 = new ExcelJS.Workbook(); await book2.xlsx.load(redacted.bytes as never); expect(book2.getWorksheet("Arsip Penghapusan")!.getCell("I2").value).toBeNull();
        const hiddenDetail = DisposalDetailResponseSchema.parse((await send(`/asset-disposals/${disposed.id}`, reviewer)).json).data; expect(hiddenDetail.total_nilai).toBeNull(); expect(hiddenDetail.items[0]!.snapshot.nilai_perolehan).toBeNull(); expect(hiddenDetail.items[0]!.snapshot.biaya_pemeliharaan).toBeNull();
        expect((await kueri<{n:string}>(`SELECT count(*)::text n FROM activity_logs WHERE aksi='ASSET_DISPOSAL_EXPORTED'`))[0]!.n).toBe("4");
        expect((await send(`/assets/${disposed.items[0]!.asset_id}/reinstate`, admin, { alasan: "Uji", room_id: Number(room), kondisi: "BAIK" })).status).toBe(422);
    });
    it("revision retains claims, forms a new approval instance; rejection/cancellation releases the block", async () => {
        const unit = await asset(), d = await create([unit]); expect((await decide(d, reviewer, 1, "PERLU_REVISI")).status).toBe(200); expect((await send("/asset-disposals", manager, body([unit]))).status).toBe(422);
        const resubmitted = await send(`/asset-disposals/${d.id}`, manager, { ...body([unit]), justifikasi: "Diperbaiki sesuai catatan" }, randomUUID(), "PUT"); expect(resubmitted.status, JSON.stringify(resubmitted.json)).toBe(200); expect(resubmitted.json.data.approval_instance_id).not.toBe(d.approval_instance_id);
        expect((await decide(resubmitted.json.data, reviewer, 1, "DITOLAK")).status).toBe(200); expect((await kueri<{n:string}>(`SELECT count(*)::text n FROM asset_disposal_claims WHERE asset_id=${unit}`))[0]!.n).toBe("0");
    });
    it("loss requires approved stocktake or CLEAN loss minutes; admin reinstates same identity with history intact", async () => {
        const unit = await asset("HILANG"); expect((await send("/asset-disposals", manager, body([unit], "HILANG"))).status).toBe(422);
        const proof = await file("DISPOSAL_ATTACHMENT"), input = { ...body([unit], "HILANG"), items: [{ asset_id: Number(unit), bukti_kehilangan_file_id: Number(proof) }], lampiran: [{ file_id: Number(proof), nama_berkas: "Berita acara kehilangan.pdf", jenis: "KEHILANGAN" }] };
        const result = await send("/asset-disposals", manager, input); expect(result.status, JSON.stringify(result.json)).toBe(201); const d = await approve(result.json.data), original = (await kueri<{kode_barang:string;uuid:string}>(`SELECT kode_barang,uuid FROM assets WHERE id=${unit}`))[0]!;
        expect((await send(`/asset-disposals/${d.id}/execute`, manager, { tanggal: "2027-11-15", tindak_lanjut: "ADMINISTRATIF", saksi: ["Petugas saksi"] })).status).toBe(200);
        const recovery = { alasan: "Aset ditemukan kembali", room_id: Number(room), kondisi: "BAIK" }; expect((await send(`/assets/${unit}/reinstate`, manager, recovery)).status).toBe(403); expect((await send(`/assets/${unit}/reinstate`, admin, { ...recovery, alasan: "" })).status).toBe(422);
        const key = randomUUID(); expect((await send(`/assets/${unit}/reinstate`, admin, recovery, key)).status).toBe(200); expect((await send(`/assets/${unit}/reinstate`, admin, recovery, key)).status).toBe(200);
        expect((await kueri(`SELECT kode_barang,uuid FROM assets WHERE id=${unit}`))[0]).toEqual(original); expect((await kueri<{dihapuskan:boolean;status:string}>(`SELECT dihapuskan,status FROM assets WHERE id=${unit}`))[0]).toEqual({ dihapuskan: false, status: "TERSEDIA" });
        expect((await kueri<{n:string}>(`SELECT count(*)::text n FROM asset_condition_history WHERE asset_id=${unit} AND referensi_jenis='asset_disposal_reinstatement'`))[0]!.n).toBe("1");
        await expect(kueri(`UPDATE asset_disposals SET report_snapshot='{}' WHERE id=${d.id}`)).rejects.toThrow("immutable");
    });
    it("newer operational changes block execution without losing approval or changing assets", async () => {
        const unit = await asset(), d = await approve(await create([unit])); await kueri(`UPDATE assets SET kondisi='RUSAK_RINGAN',status='TERSEDIA' WHERE id=${unit}`);
        expect((await send(`/asset-disposals/${d.id}/execute`, manager, await execution())).status).toBe(422); expect((await send(`/asset-disposals/${d.id}`, manager)).json.data.status).toBe("DISETUJUI");
        expect((await kueri<{dihapuskan:boolean}>(`SELECT dihapuskan FROM assets WHERE id=${unit}`))[0]!.dihapuskan).toBe(false); expect((await send(`/asset-disposals/${d.id}/cancel`, admin, { alasan: "Aset dapat dioperasikan" })).status).toBe(200);
    });
    it("configured value tiers use acquisition snapshots and partial approval preserves the route", async () => {
        const high = await id(`INSERT INTO approval_rules(jenis_pengajuan,prioritas,kondisi,status_aktif) VALUES ('PENGHAPUSAN_ASET',200,'{"field":"total_value","op":"gte","value":20000}',true) RETURNING id::text`);
        for (const [index, who] of [reviewer, admin, leader].entries()) await kueri(`INSERT INTO approval_rule_steps(rule_id,urutan,approver_type,approver_user_id,sla_jam) VALUES (${high},${index+1},'user',${who.id},8)`);
        const low = await create([await asset("RUSAK_BERAT", "100.00")]), expensive = await create([await asset(), await asset()]);
        expect((await kueri<{rule_id:string}>(`SELECT rule_id::text FROM approval_instances WHERE id=${low.approval_instance_id}`))[0]!.rule_id).toBe(rule);
        expect((await kueri<{rule_id:string}>(`SELECT rule_id::text FROM approval_instances WHERE id=${expensive.approval_instance_id}`))[0]!.rule_id).toBe(high);
        await decide(expensive, reviewer, 1, "DISETUJUI", [true, false]); expect((await kueri<{rule_id:string}>(`SELECT rule_id::text FROM approval_instances WHERE id=${expensive.approval_instance_id}`))[0]!.rule_id).toBe(high);
        await send(`/asset-disposals/${low.id}/cancel`, manager, { alasan: "Uji selesai" }); await send(`/asset-disposals/${expensive.id}/cancel`, manager, { alasan: "Uji selesai" }); await kueri(`UPDATE approval_rules SET status_aktif=false WHERE id=${high}`);
    });
    it("active upcoming slots, work orders and stocktake block proposals, while closed maintenance provides candidate facts", async () => {
        const booked = await asset(); await kueri(`INSERT INTO booking_slots(resource_type,resource_id,slot_range,status,origin) VALUES ('asset',${booked},tstzrange('2027-12-01','2027-12-02','[)'),'CONFIRMED','reservation')`);
        expect((await send("/asset-disposals", manager, body([booked]))).status).toBe(422);
        const repaired = await asset("BAIK", "100.00"), wo = await id(`INSERT INTO work_orders(nomor,asset_id,teknisi_id,prioritas,deskripsi,target_selesai,status,biaya,rekomendasi) VALUES ('WO-2027-9998',${repaired},${reviewer.id},'TINGGI','Penggantian diperlukan','2027-11-20','MENUNGGU_VERIFIKASI',200,'Tidak dapat diperbaiki') RETURNING id::text`);
        expect((await send("/asset-disposals", manager, { ...body([repaired]), alasan: "LAINNYA" })).status).toBe(422); await kueri(`UPDATE work_orders SET status='SELESAI' WHERE id=${wo}`);
        const source = DisposalCandidatesResponseSchema.parse((await send(`/asset-disposals/candidates?asset_id=${repaired}`, manager)).json).data[0]!; expect(source).toMatchObject({ biaya_pemeliharaan: "200.00", jumlah_work_order: 1, rekomendasi_penggantian: true, work_order_id: wo });
        const result = await send("/asset-disposals", manager, { ...body([repaired]), alasan: "LAINNYA" }); expect(result.status).toBe(201);
        const auditUnit = await asset(); const s = await send("/audit-sessions", manager, { nama: "Cakupan aktif", periode_mulai: "2027-11-15", periode_selesai: "2027-11-20", cakupan: { jenis: "RUANGAN", id: Number(room) }, pelaksana_ids: [manager.id] }); expect(s.status).toBe(201);
        expect((await send("/asset-disposals", manager, body([auditUnit]))).status).toBe(422); expect((await send(`/audit-sessions/${s.json.data.id}/cancel`, { ...admin, permissions: [...admin.permissions, "audit.view", "audit.manage"] }, { alasan: "Uji selesai" })).status).toBe(200);
        await send(`/asset-disposals/${result.json.data.id}/cancel`, manager, { alasan: "Uji selesai" });
    });
    it("approved stocktake loss becomes a candidate and can be proposed without a fabricated loss document", async () => {
        const unit = await asset(), isolated = await id(`INSERT INTO rooms(area_id,nama,kode,jenis) VALUES ((SELECT area_id FROM rooms WHERE id=${room}),'Opname hilang','HL${marker}','GUDANG') RETURNING id::text`); await kueri(`UPDATE assets SET room_id=${isolated} WHERE id=${unit}`);
        const s = await send("/audit-sessions", manager, { nama: "Aset hilang", periode_mulai: "2027-11-10", periode_selesai: "2027-11-14", cakupan: { jenis: "RUANGAN", id: Number(isolated) }, pelaksana_ids: [manager.id] }); expect(s.status).toBe(201); const sid = s.json.data.id;
        expect((await send(`/audit-sessions/${sid}/finalize`, manager, {})).status).toBe(200); const item = (await kueri<{id:string}>(`SELECT id::text FROM audit_items WHERE session_id=${sid}`))[0]!;
        expect((await send(`/audit-sessions/${sid}/items/${item.id}/reconcile`, manager, { keterangan: "Tidak ditemukan setelah pemeriksaan", tindakan: "HILANG", basis: { room_id: Number(isolated), kondisi: "RUSAK_BERAT" } }, randomUUID(), "PUT")).status).toBe(200);
        expect((await send(`/audit-sessions/${sid}/submit`, manager, {})).status).toBe(200); expect((await send(`/audit-sessions/${sid}/approve`, leader, { keputusan: "SETUJU", catatan: "Disetujui" })).status).toBe(200);
        const candidate = DisposalCandidatesResponseSchema.parse((await send(`/asset-disposals/candidates?asset_id=${unit}`, manager)).json).data[0]!; expect(candidate.loss_session_id).toBe(sid); expect(candidate.kondisi).toBe("HILANG");
        const proposed = await send("/asset-disposals", manager, { ...body([unit], "HILANG"), items: [{ asset_id: Number(unit), loss_session_id: Number(sid) }] }); expect(proposed.status, JSON.stringify(proposed.json)).toBe(201); await send(`/asset-disposals/${proposed.json.data.id}/cancel`, manager, { alasan: "Uji selesai" });
    });
    it("warranty needs explicit confirmation/reason and foreign evidence is not accepted", async () => {
        const unit = await asset(), warrantyFile = await file("ASSET_DOCUMENT"); const document = await id(`INSERT INTO asset_documents(file_id,jenis,nama_berkas,garansi_mulai,garansi_selesai) VALUES (${warrantyFile},'GARANSI','Garansi.pdf','2027-01-01','2028-01-01') RETURNING id::text`);
        await kueri(`INSERT INTO asset_document_links(document_id,asset_id) VALUES (${document},${unit})`);
        expect((await send("/asset-disposals", manager, body([unit]))).status).toBe(422);
        const result = await send("/asset-disposals", manager, { ...body([unit]), items: [{ asset_id: Number(unit), konfirmasi_garansi: true, alasan_garansi: "Klaim garansi telah ditolak" }] }); expect(result.status, JSON.stringify(result.json)).toBe(201); await send(`/asset-disposals/${result.json.data.id}/cancel`, manager, { alasan: "Uji selesai" });
        const foreign = await file("DISPOSAL_ATTACHMENT", stranger.id), lost = await asset("HILANG"); expect((await send("/asset-disposals", manager, { ...body([lost], "HILANG"), items: [{ asset_id: Number(lost), bukti_kehilangan_file_id: Number(foreign) }], lampiran: [{ file_id: Number(foreign), nama_berkas: "Asing.pdf", jenis: "KEHILANGAN" }] })).status).toBe(422);
    });
    it("outstanding loans block disposal even after their slot range has elapsed", async () => {
        const unit = await asset(), reservation = await id(`INSERT INTO reservations(nomor,jenis,pemohon_id,waktu_mulai,waktu_selesai,keperluan) VALUES ('RSV-BR-2027-9999','ASET',${manager.id},'2027-11-01','2027-11-02','Uji pinjaman') RETURNING id::text`);
        const slot = await id(`INSERT INTO booking_slots(resource_type,resource_id,slot_range,status,origin,reservation_id) VALUES ('asset',${unit},tstzrange('2027-11-01','2027-11-02','[)'),'RELEASED','loan',${reservation}) RETURNING id::text`);
        const loan = await id(`INSERT INTO loans(nomor,reservation_id,peminjam_id,petugas_serah_id,nama_penerima,tanggal_pinjam,tanggal_jatuh_tempo) VALUES ('PJM-2027-9999',${reservation},${manager.id},${manager.id},'Petugas','2027-11-01','2027-11-02') RETURNING id::text`);
        await kueri(`INSERT INTO loan_items(loan_id,asset_id,allocated_asset_id,slot_id,kondisi_awal) VALUES (${loan},${unit},${unit},${slot},'RUSAK_BERAT')`);
        expect((await send("/asset-disposals", manager, body([unit]))).status).toBe(422);
        const candidate = DisposalCandidatesResponseSchema.parse((await send(`/asset-disposals/candidates?asset_id=${unit}`, manager)).json).data[0]!;
        expect(candidate.penghalang).toContain(`Peminjaman #${loan} belum kembali`);
    });
    it("claim submission and booking races allow only one transaction to hold the asset", async () => {
        const unit = await asset(), booking = new SlotService(clock);
        const [proposal, reservation] = await Promise.allSettled([
            send("/asset-disposals", manager, body([unit])),
            withTransaction(ctx(manager), scope => booking.reserve(scope, { sumberDaya: [{ jenis: "asset", id: Number(unit) }], rentang: { mulai: new Date("2027-12-01"), selesai: new Date("2027-12-02") }, asal: "reservation", status: "CONFIRMED" }), getDb()),
        ]);
        expect(proposal.status).toBe("fulfilled");
        const created = proposal.status === "fulfilled" && proposal.value.status === 201;
        expect(Number(created) + Number(reservation.status === "fulfilled")).toBe(1);
        const counts = (await kueri<{ claims: number; slots: number }>(`SELECT (SELECT count(*)::int FROM asset_disposal_claims WHERE asset_id=${unit}) claims,(SELECT count(*)::int FROM booking_slots WHERE resource_type='asset' AND resource_id=${unit} AND status='CONFIRMED') slots`))[0]!;
        expect(counts.claims + counts.slots).toBe(1);
    });
    it("category allocation excludes a claimed operational asset recommended for replacement", async () => {
        const allocationCategory = await id(`INSERT INTO asset_categories(nama,kode) VALUES ('Alokasi HPS','A${marker}') RETURNING id::text`), unit = await asset("BAIK", "100.00");
        await kueri(`UPDATE assets SET category_id=${allocationCategory} WHERE id=${unit}`);
        await kueri(`INSERT INTO work_orders(nomor,asset_id,teknisi_id,prioritas,deskripsi,target_selesai,status,biaya,rekomendasi) VALUES ('WO-2027-9997',${unit},${reviewer.id},'TINGGI','Penggantian','2027-11-20','SELESAI',200,'Tidak dapat diperbaiki')`);
        const result = await send("/asset-disposals", manager, { ...body([unit]), alasan: "LAINNYA" }); expect(result.status).toBe(201);
        const allocation = () => withTransaction(ctx(manager), scope => new SlotService(clock).allocate(scope, { categoryId: Number(allocationCategory), jumlah: 1, untukSiswa: false, asal: "reservation", rentang: { mulai: new Date("2027-12-01"), selesai: new Date("2027-12-02") }, kedaluwarsa: new Date("2027-11-16") }), getDb());
        await expect(allocation()).rejects.toMatchObject({ kode: "ASSET_NOT_AVAILABLE" });
        await send(`/asset-disposals/${result.json.data.id}/cancel`, manager, { alasan: "Uji selesai" }); expect((await allocation())[0]!.resource_id).toBe(unit);
    });
    it("outbox notifications replay once per recipient, including report readiness", async () => {
        const registry = new EventHandlerRegistry(), system = createSystemAuthContext("test-disposal-notifications"); pasangKonsumenNotifikasi(registry, { db: getDb, clock, ctx: () => system });
        const events = await kueri<{id:string;event_name:string;aggregate_type:string;aggregate_id:string;payload:unknown}>("SELECT id::text,event_name,aggregate_type,aggregate_id::text,payload FROM event_outbox WHERE event_name IN ('AssetDisposalProposed','AssetDisposalDecided','AssetDisposalExecuted')");
        for (const e of events) { const handler = registry.handlersFor(e.event_name)[0]!, event = { id: e.id, name: e.event_name, aggregateType: e.aggregate_type, aggregateId: e.aggregate_id, payload: e.payload, actorId: null, requestId: null, occurredAt: clock.now(), attempts: 0 }; await handler(event); await handler(event); }
        expect((await kueri<{n:string}>(`SELECT count(*)::text n FROM notifications WHERE kode='NT-45' AND referensi_id=${disposed.id} AND user_id=${manager.id}`))[0]!.n).toBe("1");
    });
    it("failed PDF attempts clean only their own objects; manual retry preserves executed/reinstated history", async () => {
        const proposal = (await kueri<{id:string}>("SELECT id::text FROM asset_disposals WHERE alasan='HILANG' AND status='SELESAI' ORDER BY id LIMIT 1"))[0]!, before = [...objects.keys()], service = new DisposalReportService(getDb(), clock, audit, storage), system = createSystemAuthContext("test-disposal-retry");
        let calls = 0;
        await expect(service.run(system, proposal.id, { render: async () => { if (++calls === 2) throw new Error("Renderer failed"); return [...objects.values()][0]!; } }, true)).rejects.toThrow("Renderer failed");
        expect([...objects.keys()]).toEqual(before); expect((await send(`/asset-disposals/${proposal.id}`, manager)).json.data.report_status).toBe("GAGAL");
        expect((await send(`/asset-disposals/${proposal.id}/report/retry`, reviewer, {})).status).toBe(403);
        const key = randomUUID(); expect((await send(`/asset-disposals/${proposal.id}/report/retry`, manager, {}, key)).status).toBe(200); expect((await send(`/asset-disposals/${proposal.id}/report/retry`, manager, {}, key)).status).toBe(200);
        await service.run(system, proposal.id, new PembangkitPdfChromium("C:/Program Files/Google/Chrome/Application/chrome.exe"));
        const result = DisposalDetailResponseSchema.parse((await send(`/asset-disposals/${proposal.id}`, admin)).json).data; expect(result.report_status).toBe("SIAP"); expect(result.items[0]!.reinstated_at).not.toBeNull(); expect(result.items[0]!.dihapuskan).toBe(false);
        for (const key of before) expect(objects.has(key)).toBe(true);
    });
});
