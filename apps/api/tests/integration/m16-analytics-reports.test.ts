import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { sql } from "kysely";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { AnalyticsQuerySchema, AnalyticsResponseSchema, AnalyticsCatalogResponseSchema } from "@sigm4/schemas";
import type { AnalyticsType } from "@sigm4/schemas";
import { AnalyticsService, createAnalyticsProviders, authorizeAnalytics } from "../../src/modules/m16-analytics/index.js";
import { createAuthContext, setAuthContext, setAmr, AMR_OTP } from "../../src/shared/auth/index.js";
import type { Scope } from "../../src/shared/auth/index.js";
import { FixedClock } from "../../src/shared/clock/index.js";
import { BusinessCalendarService, calendarDaysSql } from "../../src/shared/calendar/index.js";
import { getDb } from "../../src/shared/db/index.js";
import { createApp } from "../../src/api/index.js";
import { Logger, HealthRegistry } from "../../src/shared/observability/index.js";
import { authPalsu } from "../helpers/auth.js";
import { dbmate, kueri } from "../helpers/db.js";

const clock = new FixedClock(new Date("2026-10-14T03:00:00Z")), marker = randomUUID().slice(0, 7);
const permissions: Record<string, Scope> = Object.fromEntries(["report.view", "report.export", "asset.view", "asset.view_financial", "reservation.view", "loan.view", "damage.view", "maintenance.view_cost", "procurement.view", "disposal.view", "material.view", "material.issue"].map(p => [p, "all"]));
interface Actor { id: number; role: string; permissions: Record<string, Scope> }
const context = (a: Actor) => createAuthContext({ userId: a.id, roleCode: a.role, scopes: new Map(Object.entries(a.permissions)) });
const id = async (q: string) => (await kueri<{ id: string }>(q))[0]!.id;
const day = (d: number, hour = 8) => `2026-10-${String(d).padStart(2, "0")}T${String(hour).padStart(2, "0")}:00:00+07:00`;

describe.skipIf(!process.env["DATABASE_URL"])("PR-06-03…07 real analytics reconciliation", () => {
    let admin: Actor, owner: Actor, other: Actor, room: string, secondRoom: string, category: string, secondCategory: string, a: string, b: string, d: string, c: string, materialCategory: string, server: Server, base: string;
    const report = (jenis: AnalyticsType, from = "2026-10-06", to = "2026-10-08", actor = admin, filter: Record<string, unknown> = {}) => new AnalyticsService(getDb(), clock).report(context(actor), jenis, AnalyticsQuerySchema.parse({ tanggal_mulai: from, tanggal_selesai: to, ...filter }));
    const actor = async (role: string, name: string) => ({ id: Number(await id(`insert into users(nama,email,password_hash,nip_nis,role_id,status,must_change_password) values('${name}','${randomUUID()}@analytics.test','x','${randomUUID()}',(select id from roles where kode='${role}'),'AKTIF',false) returning id::text`)), role, permissions: { ...permissions } });
    const asset = async (code: string, who: Actor, location: string, cat: string, condition = "BAIK", date = "2026-09-01T00:00:00+07:00", year = 2026) => id(`insert into assets(kode_barang,nama,category_id,tahun_perolehan,sumber_perolehan,room_id,kondisi,penanggung_jawab_id,dapat_dipinjam,created_at,nilai_perolehan) values('${code}-${marker}','${code}',${cat},${year},'PEMBELIAN',${location},'${condition}',${who.id},true,'${date}',100.25) returning id::text`);
    const reservation = async (n: number, who: Actor, location: string, status = "SELESAI", from = day(6), to = day(6, 10), kind = "RUANGAN") => id(`insert into reservations(nomor,jenis,pemohon_id,room_id,nama_kegiatan,jenis_kegiatan,jumlah_peserta,waktu_mulai,waktu_selesai,status) values('RSV-${kind === "RUANGAN" ? "RG" : "BR"}-2026-${n}','${kind}',${who.id},${location},'Synthetic activity','TEST',1,'${from}','${to}','${status}') returning id::text`);
    const slot = async (type: string, resource: string, origin: string, status: string, start: string, end: string, reservationId: string | null, loanId: string | null = null) => id(`insert into booking_slots(resource_type,resource_id,origin,status,slot_range,reservation_id,loan_id,expires_at) values('${type}',${resource},'${origin}','${status}',tstzrange('${start}','${end}','[)'),${reservationId ?? "null"},${loanId ?? "null"},${status === "TENTATIVE" ? "'2026-10-15T00:00:00Z'" : "null"}) returning id::text`);
    beforeAll(async () => {
        dbmate("up"); admin = await actor("R-01", "Admin fixture"); owner = await actor("R-02", "Owner fixture"); other = await actor("R-03", "Other fixture");
        const building = await id(`insert into buildings(nama,kode) values('Analytics reports','G${marker}') returning id::text`), area = await id(`insert into areas(building_id,nama,kode) values(${building},'Analytics','A${marker}') returning id::text`);
        room = await id(`insert into rooms(area_id,nama,kode,jenis,dapat_direservasi,created_at) values(${area},'Aula fixture','R${marker}','AULA',true,'2026-09-01') returning id::text`);
        secondRoom = await id(`insert into rooms(area_id,nama,kode,jenis,dapat_direservasi,created_at) values(${area},'Kelas fixture','S${marker}','KELAS',true,'2026-09-01') returning id::text`);
        category = await id(`insert into asset_categories(nama,kode,umur_teknis_tahun) values('Elektronik fixture','C${marker}',5) returning id::text`); secondCategory = await id(`insert into asset_categories(nama,kode) values('Lain fixture','D${marker}') returning id::text`);
        a = await asset("ANA-A", owner, room, category); b = await asset("ANA-B", other, room, category, "BAIK", undefined, 2010); d = await asset("ANA-D", owner, secondRoom, category, "RUSAK_BERAT", undefined, 2020); c = await asset("ANA-C", owner, secondRoom, secondCategory, "RUSAK_RINGAN", day(5));
        await kueri(`insert into asset_condition_history(asset_id,kondisi_lama,kondisi_baru,alasan,diubah_oleh,diubah_pada) values(${a},'BAIK','RUSAK_BERAT','Fixture',${admin.id},'2026-09-20T03:00:00Z'),(${a},'RUSAK_BERAT','BAIK','Fixture',${admin.id},'2026-10-03T03:00:00Z')`);
        for (const [n, assetId, when, restored] of [[9001, d, 9, null], [9002, b, 10, 12]] as const) {
            const disposal = await id(`insert into asset_disposals(nomor,pengusul_id,alasan,justifikasi,tindak_lanjut_fisik,status,total_nilai) values('HPS-2026-${n}',${owner.id},'HILANG','Fixture','ADMINISTRATIF','SELESAI',100.25) returning id::text`);
            await kueri(`insert into asset_disposal_items(disposal_id,asset_id,snapshot,executed_at,reinstated_at,konfirmasi_garansi,alasan_garansi) values(${disposal},${assetId},'{}','${day(when)}',${restored ? `'${day(restored)}'` : "null"},false,'')`);
        }
        await kueri(`update assets set dihapuskan=true,tanggal_penghapusan='${day(9)}' where id=${d}`);
        await kueri(`update system_settings set value='"08:00"' where key='reservasi.jam_operasional_mulai'`); await kueri(`update system_settings set value='"12:00"' where key='reservasi.jam_operasional_selesai'`);
        await kueri("update work_days set aktif=(hari between 1 and 5)"); await kueri("insert into holidays(tanggal,nama,jenis) values('2026-10-09','Fixture holiday','NASIONAL')");
        const used = await reservation(9001, owner, room); await slot("room", room, "reservation", "ACTIVE", day(6), day(6, 10), used);
        const canceled = await reservation(9002, other, room, "DIBATALKAN", day(6, 10), day(6, 11)); await slot("room", room, "reservation", "RELEASED", day(6, 10), day(6, 11), canceled);
        const hold = await reservation(9003, other, room, "MENUNGGU_PERSETUJUAN", day(6, 11), day(6, 12)); await slot("room", room, "reservation", "TENTATIVE", day(6, 11), day(6, 12), hold);
        await slot("room", room, "fixed_schedule", "ACTIVE", day(6, 10), day(6, 11), null);
        const unused = await reservation(9004, owner, secondRoom, "TIDAK_DIGUNAKAN", day(6), day(6, 9)); await slot("room", secondRoom, "reservation", "RELEASED", day(6), day(6, 9), unused);
        for (const [n, who, assets, exclude] of [[9001, owner, [a, b], false], [9002, other, [c], true]] as const) {
            const r = await reservation(9100 + n, who, room, "SELESAI", day(6), day(8, 18), "ASET"), l = await id(`insert into loans(nomor,reservation_id,peminjam_id,petugas_serah_id,nama_penerima,tanggal_pinjam,tanggal_jatuh_tempo,tanggal_jatuh_tempo_asli,kebijakan_denda,status) values('PJM-2026-${n}',${r},${who.id},${admin.id},'Fixture receiver','${day(6)}','${day(8, 18)}','${day(8, 18)}','{"excludeHolidays":${exclude},"tariff":100,"nominalCap":1000,"percentCap":30}','DIKEMBALIKAN') returning id::text`);
            for (const unit of assets) { const returned = unit === a ? day(8, 17) : unit === b ? day(9, 9) : day(10, 9), s = await slot("asset", unit, "loan", "RELEASED", day(6), day(8, 18), r, l); await kueri(`insert into loan_items(loan_id,asset_id,allocated_asset_id,slot_id,kondisi_awal,kondisi_akhir,status_kembali,tanggal_kembali) values(${l},${unit},${unit},${s},'BAIK','BAIK','DIKEMBALIKAN','${returned}')`); }
        }
        const ticket = await id(`insert into damage_reports(nomor,pelapor_id,asset_id,deskripsi,urgensi,status,created_at,diverifikasi_pada) values('KRS-2026-9001',${owner.id},${a},'Fixture','RENDAH','SELESAI','${day(6)}','${day(6)}') returning id::text`);
        await kueri(`insert into damage_reports(nomor,pelapor_id,room_id,deskripsi,urgensi,status,created_at,diverifikasi_pada) values('KRS-2026-9002',${other.id},${room},'Fixture','RENDAH','SELESAI','${day(7)}','${day(9)}')`);
        await kueri(`insert into damage_reports(nomor,pelapor_id,asset_id,deskripsi,urgensi,status,created_at) values('KRS-2026-9003',${owner.id},${d},'Fixture','RENDAH','DILAPORKAN','${day(7)}')`);
        for (const [n, assetId, roomId, technician, status, date, amount, reportId] of [[9001, a, null, owner.id, "SELESAI", 8, "900719925474.01", ticket], [9002, null, room, other.id, "SELESAI", 8, "10.10", null], [9003, b, null, owner.id, "MENUNGGU_VERIFIKASI", 7, "999.99", null], [9004, b, null, other.id, "SELESAI", 10, "0.99", null], [9005,b,null,other.id,"SELESAI",8,"9.00",null]] as const) {
            const w = await id(`insert into work_orders(nomor,asset_id,room_id,damage_report_id,teknisi_id,prioritas,deskripsi,target_selesai,estimasi_biaya,nonaktifkan_aset,status,waktu_selesai,diverifikasi_pada,biaya) values('WO-2026-${n}',${assetId ?? "null"},${roomId ?? "null"},${reportId ?? "null"},${technician},'SEDANG','Fixture','2026-10-08',0,false,'${status}','${day(date)}',${status === "SELESAI" ? `'${day(date)}'` : "null"},${amount}) returning id::text`);
            await kueri(`insert into work_order_costs(work_order_id,deskripsi,jumlah,harga_satuan,total) values(${w},'Fixture',1,${amount},${amount})`);
        }
        const mc = await id(`insert into material_categories(nama,kode) values('ATK fixture','M${marker}') returning id::text`); materialCategory = mc;
        const material = await id(`insert into materials(nama,material_category_id,satuan_id,room_id_default,stok_minimum,created_by) values('Kertas fixture',${mc},(select id from material_units where simbol='rim'),${room},5,${admin.id}) returning id::text`);
        await kueri(`insert into material_balances(material_id,room_id,saldo) values(${material},${room},0),(${material},${secondRoom},0)`);
        await kueri(`insert into material_transactions(material_id,room_id,jenis,jumlah,saldo_sesudah,referensi_jenis,referensi_id,created_by,created_at) values(${material},${room},'PENERIMAAN',20,20,'fixture',1,${admin.id},'${day(1)}'),(${material},${secondRoom},'PENERIMAAN',10,10,'fixture',2,${admin.id},'${day(1)}')`);
        for (const [n, who, location, quantity] of [[9001, owner, room, 10], [9002, other, secondRoom, 5]] as const) {
            const mr = await id(`insert into material_requests(nomor,pemohon_id,keperluan,status,created_at,updated_at,created_by) values('PMB-2026-${n}',${who.id},'Fixture','DISERAHKAN','${day(6)}','${day(6)}',${who.id}) returning id::text`), ri = await id(`insert into material_request_items(material_request_id,revision,material_id,room_id,satuan_id,snapshot,jumlah_diminta,jumlah_disetujui,jumlah_diserahkan) values(${mr},1,${material},${location},(select id from material_units where simbol='rim'),'{}',100,${quantity},${quantity}) returning id::text`);
            const issue = await id(`insert into material_issues(request_id,nama_penerima,tanggal_serah,catatan,created_at,created_by) values(${mr},'Fixture receiver','2026-10-07',null,'${day(7)}',${admin.id}) returning id::text`), tx = await id(`insert into material_transactions(material_id,room_id,jenis,jumlah,saldo_sesudah,referensi_jenis,referensi_id,created_by,created_at) values(${material},${location},'PENGELUARAN',-${quantity},${quantity === 10 ? 10 : 5},'material_issue',${issue},${admin.id},'${day(7)}') returning id::text`);
            await kueri(`insert into material_issue_items(issue_id,item_id,jumlah,transaction_id) values(${issue},${ri},${quantity},${tx})`);
        }
        for (const [location, quantity, balance, n] of [[room,-10,0,1],[secondRoom,-1,4,2],[secondRoom,5,9,3],[secondRoom,-4,5,4]] as const) await kueri(`insert into material_transactions(material_id,room_id,jenis,jumlah,saldo_sesudah,referensi_jenis,referensi_id,created_by,created_at,alasan) values(${material},${location},'PENYESUAIAN',${quantity},${balance},'fixture',${n},${admin.id},'${day(8,8+n)}','Fixture adjustment')`);
        for (const [n, who, status, source, created] of [[9001,owner,"SELESAI",b,2],[9002,admin,"DRAF",a,7],[9003,other,"DRAF",b,7],[9004,owner,"MENUNGGU_PERSETUJUAN",null,7]] as const) {
            const p = await id(`insert into procurements(nomor,judul,pengusul_id,tahun_anggaran,prioritas,justifikasi,total_estimasi,status,source_asset_id,created_at) values('PGD-2026-${n}','Fixture',${who.id},2026,'SEDANG','Fixture',100,'${status}',${source??"null"},'${day(created)}') returning id::text`);
            await kueri(`insert into procurement_items(procurement_id,jenis,nama_barang,category_id,spesifikasi,satuan,jumlah_diusulkan,estimasi_harga_satuan) values(${p},'ASET','Fixture',${category},'Fixture','unit',1,100)`);
            if(n===9001) await kueri(`update assets set procurement_id=${p} where id=${c}`);
        }
        const app = express(); app.use((req, res, next) => { setAuthContext(res, context({ id: Number(req.header("x-user")), role: req.header("x-role")!, permissions: JSON.parse(req.header("x-permissions")!) as Record<string, Scope> })); setAmr(res, ["pwd", AMR_OTP]); next(); });
        app.use(createApp({ db: getDb(), clock, appBaseUrl: "https://analytics.test", auth: authPalsu(), health: new HealthRegistry(30), logger: new Logger({ clock, tulis: () => undefined }), security: { objectStorageOrigin: "https://storage.test" }, limiter: { hit: async () => ({ lolos: true, batas: 10000, sisa: 9999, resetDetik: 60 }) } }));
        server = createServer(app); await new Promise<void>(r => server.listen(0, "127.0.0.1", r)); base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
    });
    afterAll(async () => { if (server) await new Promise<void>(r => server.close(() => r())); });
    it("eight providers are active through HTTP; missing domain and students are denied", async () => {
        const get = async (path: string, who = admin) => fetch(base + path, { headers: { "x-user": String(who.id), "x-role": who.role, "x-permissions": JSON.stringify(who.permissions) } });
        const catalog = AnalyticsCatalogResponseSchema.parse(await (await get("/analytics")).json()); expect(catalog.data).toHaveLength(8); expect(catalog.data.every(p => p.status === "SIAP")).toBe(true);
        const r = await get("/analytics/kondisi-aset?tanggal_mulai=2026-10-06&tanggal_selesai=2026-10-08"); expect(r.status).toBe(200); expect(r.headers.get("cache-control")).toBe("private, no-store"); AnalyticsResponseSchema.parse(await r.json());
        expect((await get("/analytics", { ...admin, role: "R-07" })).status).toBe(403); expect((await get("/analytics/biaya-pemeliharaan", { ...owner, permissions: { "report.view": "all", "asset.view": "all" } })).status).toBe(403);
    });
    it("historical condition snapshots include deleted assets on their own period and reconstruct before/after changes", async () => {
        const filter = { category_id: category }; expect((await report("kondisi-aset", "2026-09-21", "2026-10-02", admin, filter)).report.ringkasan).toMatchObject({ jumlah_aset: 3, rusak_berat: 2 });
        expect((await report("kondisi-aset", undefined, undefined, admin, filter)).report.ringkasan).toMatchObject({ jumlah_aset: 3, baik: 2, rusak_berat: 1 });
        expect((await report("kondisi-aset", "2026-10-10", "2026-10-11", admin, filter)).report.ringkasan.jumlah_aset).toBe(1);
        expect((await report("kondisi-aset", "2026-10-12", "2026-10-13", admin, filter)).report.ringkasan.jumlah_aset).toBe(2);
    });
    it("utilization clips actual intervals to operating calendar, excludes holds/cancel/blocks and preserves zero-use rooms", async () => {
        const r = await report("pemanfaatan-fasilitas", "2026-10-06", "2026-10-06"); const rooms = r.data.filter(x => x.jenis === "RUANGAN"); expect(rooms).toHaveLength(2); expect(rooms.find(x => x.objek_id === room)).toMatchObject({ jam_terpakai: "2.0000", jam_operasional: "4.0000", utilisasi_persen: "50.00" }); expect(rooms.find(x => x.objek_id === secondRoom)!.jam_terpakai).toBe("0.0000");
        expect((await report("pemanfaatan-fasilitas", "2026-10-09", "2026-10-09")).report.ringkasan.utilisasi_persen).toBeNull();
        const own = await report("pemanfaatan-fasilitas", "2026-10-06", "2026-10-06", { ...owner, permissions: { ...permissions, "report.view": "own" } }); expect(own.data.some(x => x.objek_id === c)).toBe(false);
    });
    it("loan compliance counts distinct loans and partial unit returns, matching snapshot calendar policy", async () => {
        const r = await report("aktivitas-peminjaman", "2026-10-06", "2026-10-11"); expect(r.report.ringkasan).toMatchObject({ transaksi: 2, unit: 3, kembali: 3, tepat_waktu: 1, terlambat: 2, hari_terlambat: 1 });
        const own = await report("aktivitas-peminjaman", "2026-10-06", "2026-10-11", { ...owner, permissions: { ...permissions, "report.view": "own" } }); expect(own.report.ringkasan).toMatchObject({ transaksi: 1, unit: 2 }); expect(JSON.stringify(own)).not.toContain("Other fixture");
        const narrowed = await report("aktivitas-peminjaman", "2026-10-06", "2026-10-11", { ...owner, permissions: { ...permissions, "report.view": "own", "asset.view": "own" } }); expect(narrowed.report.ringkasan.unit).toBe(1);
        const start = new Date(day(8, 18)), end = new Date(day(10, 9)); for (const exclude of [true, false]) expect((await sql<{ n: number }>`select ${calendarDaysSql(sql`${start}::timestamptz`, sql`${end}::timestamptz`, sql`${exclude}`)} n`.execute(getDb())).rows[0]!.n).toBe(await new BusinessCalendarService().countCalendarDays(getDb(), start, end, { excludeHolidays: exclude }));
    });
    it("verified WO costs reconcile once with details and decimal precision; unverified estimates are excluded", async () => {
        const r = await report("biaya-pemeliharaan"); expect(r.report.ringkasan).toMatchObject({ work_order: 3, biaya: "900719925493.11", biaya_rincian: "900719925493.11", selisih_rincian: 0 }); expect(r.data.every(x => x.cocok_rincian)).toBe(true); expect(r.data.map(x=>x.biaya)).toEqual(["900719925474.01","10.10","9.00"]);
        const own = await report("biaya-pemeliharaan", undefined, undefined, { ...owner, permissions: { ...permissions, "report.view": "own" } }); expect(own.report.ringkasan.biaya).toBe("900719925474.01");
    });
    it("damage cohorts preserve historical assets/rooms and exclude future closure from duration", async () => {
        const r = await report("tren-kerusakan"); expect(r.report.ringkasan).toMatchObject({ laporan: 3, selesai: 1, rata_jam_penyelesaian: "48.0000" }); expect(r.data.some(x => x.kategori === "Ruangan")).toBe(true);
        expect((await report("tren-kerusakan", "2026-10-06", "2026-10-11")).report.ringkasan.laporan).toBe(3);
    });
    it("materials count actual deliveries, maintain locations/units and constrain the requester", async () => {
        const r = await report("konsumsi-bahan", undefined, undefined, admin, { category_id: materialCategory }); expect(r.data.map(x => x.jumlah).sort((a, b) => Number(a) - Number(b))).toEqual([5, 10]); expect(r.report.ringkasan.permintaan).toBe(2); expect(r.report.ringkasan).toMatchObject({penembusan_minimum:2,basis_minimum:"AMBANG_SAAT_INI"}); expect(r.data.every(x=>x.frekuensi_minimum_per_jenis===2)).toBe(true);
        const own = await report("konsumsi-bahan", undefined, undefined, { ...owner, permissions: { ...permissions, "report.view": "own" } }, { category_id: materialCategory }); expect(own.data).toHaveLength(1); expect(own.data[0]!.jumlah).toBe(10); expect(own.report.ringkasan.penembusan_minimum).toBeNull(); expect(own.report.ringkasan.basis_minimum).toBe("TIDAK_TERSEDIA_PADA_SCOPE");
    });
    it("needs remain measurable without fake unmet-demand zeros; recap retains disposed period assets and hides financial SELECT", async () => {
        const needs = await report("kebutuhan-pengadaan", undefined, undefined, admin, { category_id: category }); expect(needs.report.ringkasan).toMatchObject({ kandidat: 2, permintaan_tidak_terpenuhi: null, status_indikator: "BELUM_TERUKUR" });
        const recap = await report("rekapitulasi-aset", "2026-10-06", "2026-10-11", admin, { category_id: category }); expect(recap.report.ringkasan).toMatchObject({ jumlah_aset: 3, aktif_akhir: 1, dihapus_akhir: 2, dieksekusi_periode: 2 });
        const who = { ...admin, permissions: { ...permissions } }; delete who.permissions["asset.view_financial"]; delete who.permissions["disposal.view"]; delete who.permissions["procurement.view"];
        const hidden = await report("rekapitulasi-aset", "2026-10-06", "2026-10-11", who, { category_id: category }); expect(hidden.report.kolom.some(x => x.key === "nilai_perolehan")).toBe(false); expect(hidden.report.ringkasan).not.toHaveProperty("dieksekusi_periode");
        const query = AnalyticsQuerySchema.parse({}), provider = createAnalyticsProviders().get("rekapitulasi-aset")!, prepared = provider.prepare({ query, period: { tanggal_mulai: "2026-10-06", tanggal_selesai: "2026-10-11", jumlah_hari: 6, start: new Date(day(6, 0)), endExclusive: new Date(day(12, 0)) }, now: clock.now(), access: authorizeAnalytics(context(who), "rekapitulasi-aset") }); expect(prepared.rows.compile(getDb()).sql).not.toContain("nilai_perolehan"); expect(prepared.summary.compile(getDb()).sql).not.toContain("nilai_perolehan");
    });
    it("procurement companions include pending proposals, exclude other private drafts and follow asset ownership", async()=>{
        const all=await report("rekapitulasi-aset","2026-10-01","2026-10-11");expect(all.report.ringkasan).toMatchObject({usulan_pengadaan_aset:3,pengadaan_selesai:1,aset_pengadaan_terdaftar:1});
        const narrowed=await report("rekapitulasi-aset","2026-10-01","2026-10-11",{...other,permissions:{...permissions,"asset.view":"own"}});expect(narrowed.report.ringkasan.usulan_pengadaan_aset).toBe(2);expect(narrowed.report.ringkasan.aset_pengadaan_terdaftar).toBe(0);
        await expect(report("kebutuhan-pengadaan",undefined,undefined,admin,{requester_role:"R-02"})).rejects.toMatchObject({kode:"VALIDATION_ERROR"});
    });
    it("pagination, sorting and comparison preserve scoped totals, including empty/unknown filters", async () => {
        const r = await report("rekapitulasi-aset", undefined, undefined, admin, { category_id: category, per_page: 1, bandingkan: "true" }); expect(r.meta).toMatchObject({ total: 3, total_pages: 3 }); expect(r.data).toHaveLength(1); expect(r.report.pembanding!.ringkasan.jumlah_aset).toBe(3);
        const far = await report("rekapitulasi-aset", undefined, undefined, admin, { category_id: category, page: 100 }); expect(far.data).toEqual([]); expect(far.meta.total).toBe(3);
        const empty = await report("tren-kerusakan", undefined, undefined, admin, { category_id: 999999999 }); expect(empty.meta.total).toBe(0); expect(empty.report.ringkasan.laporan).toBe(0);
        await expect(report("biaya-pemeliharaan", undefined, undefined, admin, { requester_role: "R-01" })).rejects.toMatchObject({ kode: "VALIDATION_ERROR" });
    });
    it("approved extensions preserve accrued days and historical cutoffs do not use future approvals",async()=>{
        const r=await reservation(9901,owner,room,"SELESAI",day(10),day(13,10),"ASET"),l=await id(`insert into loans(nomor,reservation_id,peminjam_id,petugas_serah_id,nama_penerima,tanggal_pinjam,tanggal_jatuh_tempo,tanggal_jatuh_tempo_asli,kebijakan_denda,status) values('PJM-2026-9901',${r},${owner.id},${admin.id},'Fixture receiver','${day(10)}','${day(13,10)}','${day(11,9)}','{"excludeHolidays":false,"tariff":100,"nominalCap":1000,"percentCap":30}','DIKEMBALIKAN') returning id::text`);
        const s=await slot("asset",a,"loan","RELEASED",day(10),day(13,10),r,l),li=await id(`insert into loan_items(loan_id,asset_id,allocated_asset_id,slot_id,kondisi_awal,kondisi_akhir,status_kembali,tanggal_kembali,hari_terlambat_terakumulasi) values(${l},${a},${a},${s},'BAIK','BAIK','DIKEMBALIKAN','${day(13,9)}',1) returning id::text`);
        const e=await id(`insert into loan_extensions(loan_id,pemohon_id,jatuh_tempo_lama,jatuh_tempo_baru,alasan,status,diputuskan_pada,kedaluwarsa_pada) values(${l},${owner.id},'${day(11,9)}','${day(13,10)}','Fixture','DISETUJUI','${day(12,10)}','${day(13,10)}') returning id::text`),hold=await slot("asset",a,"loan","RELEASED",day(11,9),day(13,10),r,l);await kueri(`insert into loan_extension_items(extension_id,loan_item_id,slot_id) values(${e},${li},${hold})`);
        expect((await report("aktivitas-peminjaman","2026-10-10","2026-10-11")).report.ringkasan).toMatchObject({transaksi:1,unit:1,kembali:0,terlambat:1,hari_terlambat:0});
        expect((await report("aktivitas-peminjaman","2026-10-10","2026-10-12")).report.ringkasan).toMatchObject({kembali:0,terlambat:1,hari_terlambat:1});
        expect((await report("aktivitas-peminjaman","2026-10-10","2026-10-13")).report.ringkasan).toMatchObject({kembali:1,tepat_waktu:0,terlambat:1,hari_terlambat:1});
        const future=await report("kondisi-aset","2027-01-01","2027-01-01");expect(future.data).toEqual([]);expect(future.report.ringkasan.jumlah_aset).toBe(0);
    });

});
