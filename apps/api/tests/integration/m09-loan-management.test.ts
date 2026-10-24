// PR-05-05..08: endpoint, transaksi PostgreSQL, slot, scope dan bukti privat nyata.
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FineDetail, LoanExtension, LoanDetail } from "@sigm4/schemas";
import { createApp } from "../../src/api/index.js";
import { closeDb, getDb, withTransaction } from "../../src/shared/db/index.js";
import { createAuthContext, setAmr, setAuthContext, AMR_OTP } from "../../src/shared/auth/index.js";
import type { Scope } from "../../src/shared/auth/index.js";
import { FixedClock } from "../../src/shared/clock/index.js";
import { SlotService } from "../../src/shared/booking/index.js";
import { EventHandlerRegistry, OutboxDispatcher } from "../../src/shared/events/index.js";
import { createSystemAuthContext } from "../../src/shared/auth/system-context.js";
import { pasangKonsumenNotifikasi } from "../../src/modules/m17-notifications/index.js";
import ExcelJS from "exceljs";
import { AuditLogger } from "../../src/shared/audit/index.js";
import { installLoanConsumers } from "../../src/modules/m09-loans/index.js";
import { runLoanMonitoring } from "../../src/worker/loan-jobs.js";
import { borrowerBlock } from "../../src/modules/m09-loans/services/blocking.service.js";
import { DocumentNumberService } from "../../src/shared/numbering/index.js";
import { HealthRegistry, Logger } from "../../src/shared/observability/index.js";
import { fcmCheck } from "../../src/modules/m17-notifications/index.js";
import type { PenyimpananObjek } from "../../src/shared/storage/index.js";
import { authPalsu } from "../helpers/auth.js";
import { dbmate, kueri } from "../helpers/db.js";

const clock = new FixedClock(new Date("2027-07-05T02:00:00Z")), marker = `L${randomUUID().slice(0, 7)}`;
interface Actor { id: number; permissions: string[]; role: string }
const storage: PenyimpananObjek = { urlUnduh: async (key) => `https://storage.test/${key}?private=1`, urlUnggah: async () => "https://storage.test/upload", info: async () => null, ambil: async () => Buffer.alloc(0), hapus: async () => undefined, simpan: async () => undefined, periksa: async () => undefined };
describe.skipIf(!process.env["DATABASE_URL"] || !process.env["REDIS_URL"])("PR-05-05..08 — peminjaman", () => {
    let server: Server | undefined, url = "", manager: Actor, borrower: Actor, outsider: Actor, principal: Actor, room = "", area = "", building = "", category = "", serial = 0;
    const users: number[] = [], assetIds: string[] = [], keys: string[] = [];
    let oldSettings: { key: string; value: unknown }[] = [];
    const id = async (query: string) => (await kueri<{ id: string }>(query))[0]!.id;
    const user = async (permissions: string[], role = "R-02"): Promise<Actor> => { const token = randomUUID(); const userId = Number(await id(`INSERT INTO users(nama,email,password_hash,nip_nis,role_id,status,must_change_password) VALUES ('Uji ${marker}','${token}@uji.sch.id','x','${token}',(SELECT id FROM roles WHERE kode='${role}'),'AKTIF',false) RETURNING id::text`)); users.push(userId); return { id: userId, permissions, role }; };
    beforeAll(async () => {
        dbmate("up"); manager = await user(["loan.manage", "loan.view", "loan.direct", "reservation.view", "fine.view", "fine.manage", "fine.waive", "loan.extend", "approval.decide", "approval.view", "report.export"]); borrower = await user(["loan.view:own"]); outsider = await user(["loan.view:own", "fine.view:own"], "R-05"); principal = await user(["loan.view", "fine.view", "fine.waive_compensation", "approval.decide", "approval.view"], "R-03");
        await kueri(`UPDATE users SET role_id=(SELECT id FROM roles WHERE kode='R-03') WHERE id=${principal.id}`);
        oldSettings = await kueri("SELECT key,value FROM system_settings WHERE key IN ('denda.tarif_per_hari','denda.cap_nominal','denda.kecualikan_hari_libur','denda.ambang_blokir')");
        await kueri("UPDATE system_settings SET value='100000000' WHERE key='denda.ambang_blokir'");
        await kueri("UPDATE system_settings SET value='1000' WHERE key='denda.tarif_per_hari'"); await kueri("UPDATE system_settings SET value='5000' WHERE key='denda.cap_nominal'");
        building = await id(`INSERT INTO buildings(nama,kode) VALUES ('Uji','${marker}') RETURNING id::text`); area = await id(`INSERT INTO areas(building_id,nama,kode) VALUES (${building},'Uji','${marker}') RETURNING id::text`);
        room = await id(`INSERT INTO rooms(area_id,nama,kode,jenis) VALUES (${area},'Uji','${marker}','GUDANG') RETURNING id::text`); category = await id(`INSERT INTO asset_categories(nama,kode) VALUES ('Uji ${marker}','${marker}') RETURNING id::text`);
        const app = createApp({ db: getDb(), clock, penyimpanan: storage, appBaseUrl: "https://sigm4.test", auth: authPalsu(), health: new HealthRegistry(30).register(fcmCheck(null)), logger: new Logger({ clock, tulis: (line) => { if (JSON.parse(line).level === "error") process.stderr.write(line + "\n"); } }), limiter: { hit: async () => ({ lolos: true, batas: 1000, sisa: 999, resetDetik: 60 }) }, security: { objectStorageOrigin: "https://storage.test" } });
        const outer = express(); outer.use((req, res, next) => { const permissions = (req.header("x-perms") ?? "").split(",").filter(Boolean); setAuthContext(res, createAuthContext({ userId: Number(req.header("x-user")), roleCode: req.header("x-role") ?? "R-02", scopes: new Map<string, Scope>(permissions.map((p) => [p.split(":")[0]!, (p.split(":")[1] ?? "all") as Scope])) })); setAmr(res, ["pwd", AMR_OTP]); next(); }); outer.use(app);
        server = createServer(outer); await new Promise<void>((done) => server!.listen(0, "127.0.0.1", done)); url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
    }, 120000);
    const send = async <T = LoanDetail>(path: string, who: Actor, body?: unknown, key: string = randomUUID(), method?: string) => { keys.push(key); const response = await fetch(url + path, { method: method ?? (body === undefined ? "GET" : "POST"), headers: { "content-type": "application/json", "x-user": String(who.id), "x-role": who.role, "x-perms": who.permissions.join(","), "idempotency-key": key }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }); return { status: response.status, json: await response.json() as { data: T; meta: { total: number }; error?: { code: string; message: string } } }; };
    const asset = async (value: string | null = "10000") => { const suffix = ++serial; const assetId = await id(`INSERT INTO assets(kode_barang,nama,category_id,tahun_perolehan,sumber_perolehan,room_id,kondisi,dapat_dipinjam,boleh_dipinjam_siswa,nilai_perolehan) VALUES ('${marker}-${suffix}','Uji',${category},2026,'PEMBELIAN',${room},'BAIK',true,true,${value ?? "NULL"}) RETURNING id::text`); assetIds.push(assetId); return { id: Number(assetId), code: `${marker}-${suffix}` }; };
    const photo = (scan = "CLEAN", who = manager, mime = "image/jpeg") => id(`INSERT INTO stored_files(object_key,mime,ukuran,checksum,owner_type,uploaded_by,scan_status) VALUES ('handover/${marker}/${randomUUID()}', '${mime}',100,'${"a".repeat(64)}','HANDOVER_PHOTO',${who.id},'${scan}') RETURNING id::text`);
    const reservation = async (units: { id: number; code: string }[], status = "DISETUJUI", start = new Date(clock.now().getTime() - 3_600_000), end = new Date(clock.now().getTime() + 7_200_000)) => {
        const ctx = createAuthContext({ userId: manager.id, roleCode: "R-02", scopes: new Map([ ["loan.manage", "all"] ]) });
        const number = await withTransaction(ctx, (scope) => new DocumentNumberService(clock).next(scope.tx, "RSV-BR"), getDb());
        const resId = await id(`INSERT INTO reservations(nomor,jenis,pemohon_id,waktu_mulai,waktu_selesai,keperluan,lokasi_penggunaan,status) VALUES ('${number}','ASET',${borrower.id},'${start.toISOString()}','${end.toISOString()}','Uji','Kelas','${status}') RETURNING id::text`);
        for (const unit of units) await kueri(`INSERT INTO reservation_items(reservation_id,asset_id,confirmed_at) VALUES (${resId},${unit.id},'${clock.now().toISOString()}')`);
        await withTransaction(ctx, (scope) => new SlotService(clock).reserve(scope, { sumberDaya: units.map((u) => ({ jenis: "asset", id: u.id })), rentang: { mulai: start, selesai: end }, asal: "reservation", status: "CONFIRMED", rujukan: { reservationId: Number(resId) } }), getDb());
        return Number(resId);
    };
    const checkout = async (units: { id: number; code: string }[], resId?: number, scan = "CLEAN") => ({ ...(resId === undefined ? { langsung: { peminjam_id: borrower.id, tanggal_jatuh_tempo: new Date(clock.now().getTime() + 7_200_000).toISOString(), keperluan: "Uji", lokasi_penggunaan: "Kelas", alasan: "Kegiatan mendesak." } } : { reservation_id: resId }), nama_penerima: "Peminjam Uji", diwakilkan: false, signature_file_id: Number(await photo(scan, manager, "image/png")), unit: await Promise.all(units.map(async (u) => ({ asset_id: u.id, verification_code: u.code, kondisi_awal: "BAIK", foto_file_ids: [Number(await photo(scan))] }))) });
    const returned = async (loan: LoanDetail, indices: number[], condition = "BAIK") => ({ unit: await Promise.all(indices.map(async (i) => ({ loan_item_id: Number(loan.unit[i]!.id), verification_code: loan.unit[i]!.kode_barang, kondisi_akhir: condition, foto_file_ids: [Number(await photo())], ...(condition === "BAIK" ? {} : { catatan: "Hasil pemeriksaan fisik.", kelalaian: true }) }))) });

    beforeEach(async () => { borrower = await user(["loan.view:own", "fine.view:own", "loan.extend:own"], "R-05"); });
    const loan = async (value: string | null = "10000", count = 1) => { const units = await Promise.all(Array.from({ length: count }, () => asset(value))); const result = await send("/loans/checkout", manager, await checkout(units)); expect(result.status, JSON.stringify(result.json)).toBe(201); return (await send(`/loans/${result.json.data.id}`, manager)).json.data; };
    const fine = async (condition: string = "BAIK", value: string | null = "10000") => { const l = await loan(value); clock.advance(2 * 86_400_000); try { const r = await send(`/loans/${l.id}/checkin`, manager, await returned(l, [0], condition)); expect(r.status, JSON.stringify(r.json)).toBe(200); } finally { clock.advance(-2 * 86_400_000); } const rows = await kueri<{ id: string }>(`SELECT id::text FROM fines WHERE loan_id=${l.id} AND jenis='${condition === "BAIK" ? "KETERLAMBATAN" : "GANTI_RUGI"}'`); return { l, id: rows[0]!.id }; };
    const approve = async (ext: LoanExtension) => send(`/approvals/${ext.approval_instance_id}/decide`, manager, { urutan: 1, keputusan: "DISETUJUI", catatan: "Sudah ditinjau." });
    it("ambang null menolak pengajuan baru tanpa mengarang nominal", async () => {
        await kueri("UPDATE system_settings SET value='null' WHERE key='denda.ambang_blokir'");
        try { const r = await send("/loans/checkout", manager, await checkout([await asset()])); expect(r.status).toBe(422); expect(r.json.error?.message).toContain("Konfigurasi blokir belum lengkap"); }
        finally { await kueri("UPDATE system_settings SET value='100000000' WHERE key='denda.ambang_blokir'"); }
    });
    it("BR-030 menolak sebelum job berjalan dan hilang setelah pengembalian", async () => {
        const l = await loan(); clock.advance(3 * 3_600_000);
        try { const input = await checkout([await asset()]); expect((await send("/loans/checkout", manager, input)).json.error?.code).toBe("BORROWER_BLOCKED"); expect((await send(`/loans/${l.id}/checkin`, manager, await returned(l, [0]))).status).toBe(200); expect((await send("/loans/checkout", manager, input)).status).toBe(201); }
        finally { clock.advance(-3 * 3_600_000); }
    });
    it("job 00:05 WIB menandai terlambat dan menduplikasi hanya estimasi/pengingat, bukan fines", async () => {
        const l = await loan(); clock.advance(2 * 86_400_000);
        try { await runLoanMonitoring(getDb(), clock); await runLoanMonitoring(getDb(), clock); expect((await send(`/loans/${l.id}`, manager)).json.data.status).toBe("TERLAMBAT"); expect((await kueri<{ n: string }>(`SELECT count(*) n FROM fines WHERE loan_id=${l.id}`))[0]!.n).toBe("0"); expect((await kueri<{ n: string }>(`SELECT count(*) n FROM event_outbox WHERE aggregate_type='loan' AND aggregate_id=${l.id} AND event_name='LoanOverdueReminder'`))[0]!.n).toBe("1"); }
        finally { clock.advance(-2 * 86_400_000); }
    });
    it("H-1 unik per jadwal dan scope daftar/filter tidak bocor", async () => {
        const l = await loan(); await kueri(`UPDATE loans SET tanggal_jatuh_tempo='2027-07-06T10:00:00Z' WHERE id=${l.id}`);
        await runLoanMonitoring(getDb(), clock); await runLoanMonitoring(getDb(), clock);
        expect((await kueri<{ n: string }>(`SELECT count(*) n FROM event_outbox WHERE aggregate_id=${l.id} AND event_name='LoanDueReminder'`))[0]!.n).toBe("1");
        const own = await send<LoanDetail[]>("/loans", borrower); expect(own.status).toBe(200); expect(own.json.data).toHaveLength(1);
        expect((await send<LoanDetail[]>("/loans", outsider)).json.data).toHaveLength(0);
        expect((await send(`/loans/${l.id}`, outsider)).status).toBe(404);
    });
    it("pelunasan wajib bukti, idempoten, scope own, dan membuka blokir sisa denda", async () => {
        const f = await fine(); await kueri("UPDATE system_settings SET value='1000' WHERE key='denda.ambang_blokir'");
        try { const ctx = createAuthContext({ userId: manager.id, roleCode: "R-02", scopes: new Map([["fine.view", "all"]]) }); expect((await withTransaction(ctx, (s) => borrowerBlock(s, borrower.id, clock), getDb())).aktif).toBe(true);
            expect((await send(`/fines/${f.id}/pay`, borrower, {}, randomUUID(), "PATCH")).status).toBe(403);
            expect((await send(`/fines/${f.id}/pay`, manager, { tanggal_bayar: clock.now().toISOString(), nomor_bukti: "" }, randomUUID(), "PATCH")).status).toBe(422);
            const body = { tanggal_bayar: clock.now().toISOString(), nomor_bukti: "BUKTI-01" }, key = randomUUID();
            expect((await send(`/fines/${f.id}/pay`, manager, body, key, "PATCH")).status).toBe(200); expect((await send(`/fines/${f.id}/pay`, manager, body, key, "PATCH")).status).toBe(200);
            const detail = await send<FineDetail>(`/fines/${f.id}`, borrower); expect(detail.status).toBe(200); expect(detail.json.data.sisa).toBe("0.00"); expect(detail.json.data.blokir.aktif).toBe(false); expect(detail.json.data.riwayat).toHaveLength(1);
            expect((await send(`/fines/${f.id}`, outsider)).status).toBe(404);
        } finally { await kueri("UPDATE system_settings SET value='100000000' WHERE key='denda.ambang_blokir'"); }
    });
    it("ganti rugi hanya Pimpinan, pembebasan kumulatif dan sisa tetap memblokir", async () => {
        const f = await fine("RUSAK_BERAT"); await kueri("UPDATE system_settings SET value='1000' WHERE key='denda.ambang_blokir'");
        try { expect((await send(`/fines/${f.id}/waive`, manager, { alasan: "Alasan sah" }, randomUUID(), "PATCH")).status).toBe(403);
            const fake = { ...manager, permissions: [...manager.permissions, "fine.waive_compensation"] }; expect((await send(`/fines/${f.id}/waive-compensation`, fake, { alasan: "Uji", jumlah: "1000" }, randomUUID(), "PATCH")).status).toBe(403);
            expect((await send(`/fines/${f.id}/waive-compensation`, principal, { alasan: "Keputusan Pimpinan", jumlah: "2000" }, randomUUID(), "PATCH")).status).toBe(200);
            const d = (await send<FineDetail>(`/fines/${f.id}`, principal)).json.data; expect(d.status).toBe("DIBEBASKAN_SEBAGIAN"); expect(d.sisa).toBe("8000.00"); expect(d.blokir.aktif).toBe(true);
            expect((await send(`/fines/${f.id}/waive-compensation`, principal, { alasan: "Uji", jumlah: "9000" }, randomUUID(), "PATCH")).status).toBe(422);
            expect((await send(`/fines/${f.id}/waive-compensation`, principal, { alasan: "Putusan akhir", jumlah: "8000" }, randomUUID(), "PATCH")).status).toBe(200);
        } finally { await kueri("UPDATE system_settings SET value='100000000' WHERE key='denda.ambang_blokir'"); }
    });
    it("persaingan lunas dan pembebasan tidak menghasilkan dua penyelesaian", async () => {
        const f = await fine(), result = await Promise.all([send(`/fines/${f.id}/pay`, manager, { tanggal_bayar: clock.now().toISOString(), nomor_bukti: "RACE" }, randomUUID(), "PATCH"), send(`/fines/${f.id}/waive`, manager, { alasan: "Alasan sah" }, randomUUID(), "PATCH")]);
        expect(result.filter((r) => r.status === 200)).toHaveLength(1); expect(result.filter((r) => r.status === 422)).toHaveLength(1);
    });
    it("koreksi status lunas hanya Administrator dan wajib beralasan", async () => {
        const f = await fine(), admin = await user(["fine.manage", "fine.view"], "R-01"), paid = { tanggal_bayar: clock.now().toISOString(), nomor_bukti: "BUKTI-KOREKSI" };
        expect((await send(`/fines/${f.id}/pay`, manager, paid, randomUUID(), "PATCH")).status).toBe(200);
        expect((await send(`/fines/${f.id}/reopen`, manager, { alasan: "Salah pencatatan" }, randomUUID(), "PATCH")).status).toBe(403);
        expect((await send(`/fines/${f.id}/reopen`, admin, { alasan: "" }, randomUUID(), "PATCH")).status).toBe(422);
        expect((await send(`/fines/${f.id}/reopen`, admin, { alasan: "Salah pencatatan" }, randomUUID(), "PATCH")).status).toBe(200);
        const d = (await send<FineDetail>(`/fines/${f.id}`, admin)).json.data; expect(d.status).toBe("BELUM_DIBAYAR"); expect(d.sisa).toBe("2000.00"); expect(d.nomor_bukti).toBeNull(); expect(d.riwayat).toHaveLength(2);
    });
    it("batas perpanjangan diperiksa ulang saat persetujuan tanpa mengubah jadwal bila ditolak", async () => {
        const l = await loan(), e = await send<LoanExtension>(`/loans/${l.id}/extend`, borrower, { tanggal_jatuh_tempo: new Date(clock.now().getTime()+86_400_000).toISOString(), alasan: "Berlanjut" }); expect(e.status).toBe(201);
        const before = (await kueri<{ value: unknown }>("SELECT value FROM system_settings WHERE key='peminjaman.batas_perpanjangan'"))[0]!.value;
        await kueri("UPDATE system_settings SET value='0' WHERE key='peminjaman.batas_perpanjangan'");
        try { expect((await approve(e.json.data)).status).toBe(422); expect((await send(`/loans/${l.id}`, borrower)).json.data.tanggal_jatuh_tempo).toBe(l.tanggal_jatuh_tempo); }
        finally { await kueri(`UPDATE system_settings SET value='${JSON.stringify(before)}' WHERE key='peminjaman.batas_perpanjangan'`); }
    });
    it("penolakan/revisi perpanjangan melepas hold dan mengizinkan pengajuan baru", async () => {
        const l = await loan(), body = { tanggal_jatuh_tempo: new Date(clock.now().getTime() + 86_400_000).toISOString(), alasan: "Berlanjut" };
        const e = await send<LoanExtension>(`/loans/${l.id}/extend`, borrower, body); expect(e.status).toBe(201);
        expect((await send(`/approvals/${e.json.data.approval_instance_id}/decide`, manager, { urutan: 1, keputusan: "PERLU_REVISI", catatan: "Sesuaikan kegiatan" })).status).toBe(200);
        expect((await kueri<{ status: string }>(`SELECT status FROM loan_extensions WHERE id=${e.json.data.id}`))[0]!.status).toBe("PERLU_REVISI");
        expect((await send<LoanExtension>(`/loans/${l.id}/extend`, borrower, body)).status).toBe(201);
        expect((await send(`/loans/${l.id}`, borrower)).json.data.tanggal_jatuh_tempo).toBe(l.tanggal_jatuh_tempo);
    });
    it("nilai penggantian tidak aktif sampai Pimpinan menyetujui; penolakan dapat diusulkan ulang", async () => {
        const f = await fine("HILANG", null), proposal = await send<{ id: string }>(`/fines/${f.id}/replacement-proposals`, manager, { jumlah: "12000", alasan: "Harga unit pengganti" }); expect(proposal.status).toBe(201);
        expect((await send<FineDetail>(`/fines/${f.id}`, principal)).json.data.jumlah).toBeNull();
        expect((await send(`/fines/${f.id}/replacement-proposals/${proposal.json.data.id}/decide`, manager, { keputusan: "DISETUJUI", catatan: "Uji" })).status).toBe(403);
        expect((await send(`/fines/${f.id}/replacement-proposals/${proposal.json.data.id}/decide`, principal, { keputusan: "DITOLAK", catatan: "Cari harga lain" })).status).toBe(200);
        const next = await send<{ id: string }>(`/fines/${f.id}/replacement-proposals`, manager, { jumlah: "10000", alasan: "Harga baru" }); expect(next.status).toBe(201);
        expect((await send(`/fines/${f.id}/replacement-proposals/${next.json.data.id}/decide`, principal, { keputusan: "DISETUJUI", catatan: "Harga wajar" })).status).toBe(200);
        const d = (await send<FineDetail>(`/fines/${f.id}`, principal)).json.data; expect(d.jumlah).toBe("10000.00"); expect(d.menunggu_penetapan).toBe(false); expect(d.usulan).toHaveLength(2);
    });
    it("perpanjangan membuat hold tentative dan satu approval; persetujuan memperpanjang ACTIVE", async () => {
        const l = await loan(), newDue = new Date(clock.now().getTime() + 2 * 86_400_000).toISOString(), body = { tanggal_jatuh_tempo: newDue, alasan: "Kegiatan berlanjut" }, key = randomUUID();
        const r = await send<LoanExtension>(`/loans/${l.id}/extend`, borrower, body, key); expect(r.status, JSON.stringify(r.json)).toBe(201); expect((await send<LoanExtension>(`/loans/${l.id}/extend`, borrower, body, key)).json.data.id).toBe(r.json.data.id);
        expect((await kueri<{ status: string }>(`SELECT status::text FROM booking_slots WHERE loan_id=${l.id} ORDER BY id`)).map((s) => s.status)).toEqual(["ACTIVE", "TENTATIVE"]);
        expect((await send(`/loan-extensions/${r.json.data.id}`, manager)).status).toBe(200);
        expect((await send(`/loan-extensions/${r.json.data.id}`, { ...outsider, permissions: [...outsider.permissions, "approval.view:own"] })).status).toBe(403);
        expect((await approve(r.json.data)).status).toBe(200); const d = (await send(`/loans/${l.id}`, borrower)).json.data; expect(d.tanggal_jatuh_tempo).toBe(newDue); expect(d.jumlah_perpanjangan).toBe(1);
        expect((await send(`/loans/${l.id}/extend`, borrower, { ...body, tanggal_jatuh_tempo: new Date(clock.now().getTime() + 3 * 86_400_000).toISOString() })).status).toBe(422);
    });
    it("perpanjangan bentrok ditolak dan approval terlambat mempertahankan hari sebelumnya", async () => {
        const l = await loan(), unit = { id: Number(l.unit[0]!.asset_id), code: l.unit[0]!.kode_barang };
        await reservation([unit], "DISETUJUI", new Date(clock.now().getTime() + 3 * 3_600_000), new Date(clock.now().getTime() + 5 * 3_600_000));
        const end = new Date(clock.now().getTime() + 3 * 86_400_000).toISOString(); expect((await send(`/loans/${l.id}/extend`, borrower, { tanggal_jatuh_tempo: end, alasan: "Uji" })).status).toBe(409);
        const other = await loan(), ext = await send<LoanExtension>(`/loans/${other.id}/extend`, borrower, { tanggal_jatuh_tempo: end, alasan: "Berlanjut" }); expect(ext.status).toBe(201);
        clock.advance(30 * 3_600_000);
        try { expect((await approve(ext.json.data)).status).toBe(200); expect((await kueri<{ n: number }>(`SELECT hari_terlambat_terakumulasi n FROM loan_items WHERE loan_id=${other.id}`))[0]!.n).toBeGreaterThan(0);
            expect((await send(`/loans/${other.id}/checkin`, manager, await returned(other, [0]))).status).toBe(200); expect(Number((await kueri<{ n: number }>(`SELECT hari_terlambat n FROM fines WHERE loan_id=${other.id}`))[0]!.n)).toBeGreaterThan(0);
        } finally { clock.advance(-30 * 3_600_000); }
    });
    it("check-in menutup pengajuan tertunda beserta instance dan seluruh hold", async () => {
        const l = await loan(), r = await send<LoanExtension>(`/loans/${l.id}/extend`, borrower, { tanggal_jatuh_tempo: new Date(clock.now().getTime() + 86_400_000).toISOString(), alasan: "Berlanjut" }); expect(r.status).toBe(201);
        expect((await send(`/loans/${l.id}/checkin`, manager, await returned(l, [0]))).status).toBe(200);
        expect((await kueri<{ status: string }>(`SELECT status::text FROM approval_instances WHERE id=${r.json.data.approval_instance_id}`))[0]!.status).toBe("DIBATALKAN"); expect((await approve(r.json.data)).status).not.toBe(200);
    });
    it("expiry perpanjangan melepaskan hold dan notifikasi harian tidak mengganda", async () => {
        const l = await loan(), ext = await send<LoanExtension>(`/loans/${l.id}/extend`, borrower, { tanggal_jatuh_tempo: new Date(clock.now().getTime() + 4 * 86_400_000).toISOString(), alasan: "Uji expiry" }); expect(ext.status).toBe(201);
        const registry = new EventHandlerRegistry(), ctx = createSystemAuthContext("uji-loan-management"), logger = new Logger({ clock, tulis: () => undefined });
        pasangKonsumenNotifikasi(registry, { db: getDb, clock, ctx: () => ctx }); installLoanConsumers(registry, { db: getDb, clock, audit: new AuditLogger({ clock }), ctx: () => ctx });
        const dispatcher = new OutboxDispatcher({ registry, clock, db: getDb(), logger });
        clock.advance(49 * 3_600_000);
        try { expect((await approve(ext.json.data)).status).toBe(422); await withTransaction(ctx, (scope) => new SlotService(clock).lepasTentatifKedaluwarsa(scope), getDb()); await runLoanMonitoring(getDb(), clock); await dispatcher.drain(); await dispatcher.drain();
            expect((await kueri<{ status: string }>(`SELECT status FROM loan_extensions WHERE id=${ext.json.data.id}`))[0]!.status).toBe("KEDALUWARSA");
            expect((await kueri<{ n: string }>(`SELECT count(*) n FROM notifications WHERE user_id=${borrower.id} AND kode='NT-12'`))[0]!.n).toBe("1");
        } finally { clock.advance(-49 * 3_600_000); }
    });
    it("ekspor XLSX/PDF menghormati scope, menyertakan data dan metadata audit", async () => {
        const f = await fine(), headers = { "x-user": String(manager.id), "x-role": manager.role, "x-perms": manager.permissions.join(",") };
        const response = await fetch(`${url}/fines/export?format=xlsx&peminjam=${borrower.id}`, { headers }); expect(response.status).toBe(200);
        const book = new ExcelJS.Workbook(); await book.xlsx.load(await response.arrayBuffer());
        expect(book.worksheets[0]!.rowCount).toBe(4); expect(book.worksheets[0]!.getRow(4).getCell(1).value).toBe(f.l.nomor);
        const pdf = await fetch(`${url}/fines/export?format=pdf&peminjam=${borrower.id}`, { headers }); expect(pdf.status).toBe(200); expect(Buffer.from(await pdf.arrayBuffer()).subarray(0,8).toString()).toBe("%PDF-1.7");
        const own = { ...headers, "x-user": String(outsider.id), "x-perms": "report.export:all,fine.view:own" }; const denied = await fetch(`${url}/fines/export?format=xlsx`, { headers: own }); const empty = new ExcelJS.Workbook(); await empty.xlsx.load(await denied.arrayBuffer()); expect(empty.worksheets[0]!.rowCount).toBe(3);
    });
    afterAll(async () => {
        if (server) await new Promise<void>((done) => server!.close(() => done()));
        try {
            const ownUsers = users.join(","); if (!ownUsers) return;
            const loans = `SELECT id FROM loans WHERE peminjam_id IN (${ownUsers})`, items = `SELECT id FROM loan_items WHERE loan_id IN (${loans})`, reservations = `SELECT id FROM reservations WHERE pemohon_id IN (${ownUsers})`, damages = `SELECT id FROM damage_reports WHERE loan_id IN (${loans})`;
            for (const query of [
                `DELETE FROM event_outbox WHERE actor_id IN (${ownUsers}) OR (aggregate_type='reservation' AND aggregate_id IN (${reservations}))`, `DELETE FROM notifications WHERE user_id IN (${ownUsers})`,
                `DELETE FROM damage_report_note_photos WHERE note_id IN (SELECT id FROM damage_report_notes WHERE damage_report_id IN (${damages}))`, `DELETE FROM damage_report_notes WHERE damage_report_id IN (${damages})`, `DELETE FROM damage_report_photos WHERE damage_report_id IN (${damages})`, `DELETE FROM loan_item_damage_reports WHERE loan_item_id IN (${items})`, `DELETE FROM damage_reports WHERE loan_id IN (${loans})`,
                `DELETE FROM borrower_blocks WHERE user_id IN (${ownUsers})`, `DELETE FROM loan_daily_events WHERE loan_id IN (${loans})`, `DELETE FROM compensation_proposals WHERE fine_id IN (SELECT id FROM fines WHERE loan_id IN (${loans}))`, `DELETE FROM fine_actions WHERE fine_id IN (SELECT id FROM fines WHERE loan_id IN (${loans}))`,
                `DELETE FROM loan_extension_items WHERE extension_id IN (SELECT id FROM loan_extensions WHERE loan_id IN (${loans}))`, `DELETE FROM loan_extensions WHERE loan_id IN (${loans})`,
                `DELETE FROM approval_steps WHERE instance_id IN (SELECT id FROM approval_instances WHERE pemohon_id IN (${ownUsers}))`, `DELETE FROM approval_instances WHERE pemohon_id IN (${ownUsers})`, `DELETE FROM loan_item_photos WHERE loan_item_id IN (${items})`, `DELETE FROM fines WHERE loan_id IN (${loans})`, `DELETE FROM loan_items WHERE loan_id IN (${loans})`, `DELETE FROM booking_slots WHERE loan_id IN (${loans}) OR reservation_id IN (${reservations})`, `DELETE FROM loans WHERE peminjam_id IN (${ownUsers})`, `DELETE FROM reservation_items WHERE reservation_id IN (${reservations})`, `DELETE FROM reservations WHERE pemohon_id IN (${ownUsers})`, `DELETE FROM stored_files WHERE uploaded_by IN (${ownUsers})`,
            ]) await kueri(query);
            await kueri("DELETE FROM loan_recap_days WHERE tanggal BETWEEN '2027-07-05' AND '2027-07-10'");
            if (assetIds.length) { await kueri(`DELETE FROM asset_condition_history WHERE asset_id IN (${assetIds.join(",")})`); await kueri(`DELETE FROM assets WHERE id IN (${assetIds.join(",")})`); }
            for (const setting of oldSettings) await kueri(`UPDATE system_settings SET value='${JSON.stringify(setting.value)}' WHERE key='${setting.key}'`);
            if (keys.length) await kueri(`DELETE FROM idempotency_keys WHERE key IN (${keys.map((key) => `'${key}'`).join(",")})`);
            if (category) await kueri(`DELETE FROM asset_categories WHERE id=${category}`); if (room) await kueri(`DELETE FROM rooms WHERE id=${room}`); if (area) await kueri(`DELETE FROM areas WHERE id=${area}`); if (building) await kueri(`DELETE FROM buildings WHERE id=${building}`); await kueri(`DELETE FROM users WHERE id IN (${ownUsers})`);
        } finally { await closeDb(); }
    });
});
