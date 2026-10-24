// PR-05-01..04: endpoint, transaksi PostgreSQL, slot, scope dan bukti privat nyata.
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { LoanDetail } from "@sigm4/schemas";
import { createApp } from "../../src/api/index.js";
import { closeDb, getDb, withTransaction } from "../../src/shared/db/index.js";
import { createAuthContext, setAmr, setAuthContext, AMR_OTP } from "../../src/shared/auth/index.js";
import type { Scope } from "../../src/shared/auth/index.js";
import { FixedClock } from "../../src/shared/clock/index.js";
import { SlotService } from "../../src/shared/booking/index.js";
import { EventHandlerRegistry, OutboxDispatcher } from "../../src/shared/events/index.js";
import { createSystemAuthContext } from "../../src/shared/auth/system-context.js";
import { pasangKonsumenNotifikasi } from "../../src/modules/m17-notifications/index.js";
import { jalankanAktivasiSlot } from "../../src/worker/slot-jobs.js";
import { DocumentNumberService } from "../../src/shared/numbering/index.js";
import { HealthRegistry, Logger } from "../../src/shared/observability/index.js";
import { fcmCheck } from "../../src/modules/m17-notifications/index.js";
import type { PenyimpananObjek } from "../../src/shared/storage/index.js";
import { authPalsu } from "../helpers/auth.js";
import { dbmate, kueri } from "../helpers/db.js";

const clock = new FixedClock(new Date("2027-07-05T02:00:00Z")), marker = `L${randomUUID().slice(0, 7)}`;
interface Actor { id: number; permissions: string[] }
const storage: PenyimpananObjek = { urlUnduh: async (key) => `https://storage.test/${key}?private=1`, urlUnggah: async () => "https://storage.test/upload", info: async () => null, ambil: async () => Buffer.alloc(0), hapus: async () => undefined, simpan: async () => undefined, periksa: async () => undefined };
describe.skipIf(!process.env["DATABASE_URL"] || !process.env["REDIS_URL"])("PR-05-01..04 — peminjaman", () => {
    let server: Server | undefined, url = "", manager: Actor, borrower: Actor, outsider: Actor, principal: Actor, room = "", area = "", building = "", category = "", serial = 0;
    const users: number[] = [], assetIds: string[] = [], keys: string[] = [];
    let oldSettings: { key: string; value: unknown }[] = [];
    const id = async (query: string) => (await kueri<{ id: string }>(query))[0]!.id;
    const user = async (permissions: string[]): Promise<Actor> => { const token = randomUUID(); const userId = Number(await id(`INSERT INTO users(nama,email,password_hash,nip_nis,role_id,status,must_change_password) VALUES ('Uji ${marker}','${token}@uji.sch.id','x','${token}',(SELECT id FROM roles WHERE kode='R-02'),'AKTIF',false) RETURNING id::text`)); users.push(userId); return { id: userId, permissions }; };
    beforeAll(async () => {
        dbmate("up"); manager = await user(["loan.manage", "loan.view", "loan.direct", "reservation.view"]); borrower = await user(["loan.view:own"]); outsider = await user(["loan.view:own"]); principal = await user(["loan.view"]);
        await kueri(`UPDATE users SET role_id=(SELECT id FROM roles WHERE kode='R-03') WHERE id=${principal.id}`);
        oldSettings = await kueri("SELECT key,value FROM system_settings WHERE key IN ('denda.tarif_per_hari','denda.cap_nominal','denda.kecualikan_hari_libur','denda.ambang_blokir')");
        await kueri("UPDATE system_settings SET value='100000000' WHERE key='denda.ambang_blokir'");
        await kueri("UPDATE system_settings SET value='null' WHERE key IN ('denda.tarif_per_hari','denda.cap_nominal')");
        building = await id(`INSERT INTO buildings(nama,kode) VALUES ('Uji','${marker}') RETURNING id::text`); area = await id(`INSERT INTO areas(building_id,nama,kode) VALUES (${building},'Uji','${marker}') RETURNING id::text`);
        room = await id(`INSERT INTO rooms(area_id,nama,kode,jenis) VALUES (${area},'Uji','${marker}','GUDANG') RETURNING id::text`); category = await id(`INSERT INTO asset_categories(nama,kode) VALUES ('Uji ${marker}','${marker}') RETURNING id::text`);
        const app = createApp({ db: getDb(), clock, penyimpanan: storage, appBaseUrl: "https://sigm4.test", auth: authPalsu(), health: new HealthRegistry(30).register(fcmCheck(null)), logger: new Logger({ clock, tulis: () => undefined }), limiter: { hit: async () => ({ lolos: true, batas: 1000, sisa: 999, resetDetik: 60 }) }, security: { objectStorageOrigin: "https://storage.test" } });
        const outer = express(); outer.use((req, res, next) => { const permissions = (req.header("x-perms") ?? "").split(",").filter(Boolean); setAuthContext(res, createAuthContext({ userId: Number(req.header("x-user")), roleCode: "R-02", scopes: new Map<string, Scope>(permissions.map((p) => [p.split(":")[0]!, (p.split(":")[1] ?? "all") as Scope])) })); setAmr(res, ["pwd", AMR_OTP]); next(); }); outer.use(app);
        server = createServer(outer); await new Promise<void>((done) => server!.listen(0, "127.0.0.1", done)); url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
    }, 120000);
    const send = async (path: string, who: Actor, body?: unknown, key: string = randomUUID()) => { keys.push(key); const response = await fetch(url + path, { method: body === undefined ? "GET" : "POST", headers: { "content-type": "application/json", "x-user": String(who.id), "x-perms": who.permissions.join(","), "idempotency-key": key }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }); return { status: response.status, json: await response.json() as { data: LoanDetail; error?: { code: string; message: string } } }; };
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
    it("konfigurasi tanpa nominal bawaan menolak check-out; permission juga ditegakkan", async () => {
        const unit = await asset(), input = await checkout([unit]); expect((await send("/loans/checkout", borrower, input)).status).toBe(403);
        const rejected = await send("/loans/checkout", manager, input); expect(rejected.status).toBe(422); expect(rejected.json.error?.message).toContain("Konfigurasi denda belum lengkap"); expect((await kueri<{ n: string }>("SELECT count(*) AS n FROM loans"))[0]!.n).toBe("0");
        await kueri("UPDATE system_settings SET value='1000' WHERE key='denda.tarif_per_hari'");
        expect((await send("/loans/checkout", manager, input)).status).toBe(422);
        await kueri("UPDATE system_settings SET value='null' WHERE key='denda.tarif_per_hari'"); await kueri("UPDATE system_settings SET value='5000' WHERE key='denda.cap_nominal'");
        expect((await send("/loans/checkout", manager, input)).status).toBe(422);
        await kueri("UPDATE system_settings SET value='1000' WHERE key='denda.tarif_per_hari'");
    });
    it("check-out idempoten, nomor unik, slot ACTIVE, unit DIPINJAM, bukti privat dan scope own", async () => {
        const units = [await asset(), await asset()], resId = await reservation(units), input = await checkout(units, resId), key = randomUUID();
        const result = await send("/loans/checkout", manager, input, key); expect(result.status, JSON.stringify(result.json)).toBe(201); expect((await send("/loans/checkout", manager, input, key)).json.data.id).toBe(result.json.data.id);
        expect((await kueri<{ status: string }>(`SELECT status::text FROM assets WHERE id IN (${units.map((u) => u.id).join(",")})`)).map((r) => r.status)).toEqual(["DIPINJAM", "DIPINJAM"]);
        expect((await kueri<{ status: string }>(`SELECT status::text FROM booking_slots WHERE loan_id=${result.json.data.id}`)).every((r) => r.status === "ACTIVE")).toBe(true);
        const own = await send(`/loans/${result.json.data.id}`, borrower); expect(own.status).toBe(200); expect(own.json.data.signature?.url).toContain("private=1"); expect(own.json.data.unit).toHaveLength(2);
        expect((await send(`/loans/${result.json.data.id}`, outsider)).status).toBe(404);
        expect((await send(`/loans/by-asset/${own.json.data.unit[0]!.uuid}`, manager)).json.data.id).toBe(result.json.data.id);
    });
    it("reservasi belum disetujui, kode tidak cocok dan foto kosong/asing/terinfeksi ditolak atomik", async () => {
        const unit = await asset(), resId = await reservation([unit], "MENUNGGU_PERSETUJUAN"); expect((await send("/loans/checkout", manager, await checkout([unit], resId))).status).toBe(422);
        const actual = await asset(), good = await reservation([actual]); const input = await checkout([actual], good); input.unit[0]!.verification_code = "salah"; expect((await send("/loans/checkout", manager, input)).status).toBe(422);
        const direct = await checkout([unit]); direct.unit[0]!.foto_file_ids = []; expect((await send("/loans/checkout", manager, direct)).status).toBe(422);
        direct.unit[0]!.foto_file_ids = [Number(await photo("CLEAN", borrower))]; expect((await send("/loans/checkout", manager, direct)).status).toBe(422);
        direct.unit[0]!.foto_file_ids = [Number(await photo("INFECTED"))]; expect((await send("/loans/checkout", manager, direct)).status).toBe(422);
    });
    it("peminjaman langsung membutuhkan loan.direct, membuat reservasi bypass beralasan", async () => {
        const input = await checkout([await asset()]); expect((await send("/loans/checkout", { ...manager, permissions: ["loan.manage"] }, input)).status).toBe(403);
        const result = await send("/loans/checkout", manager, input); expect(result.status, JSON.stringify(result.json)).toBe(201);
        const detail = await send(`/loans/${result.json.data.id}`, manager); expect(detail.json.data.bypass_approval).toBe(true); expect(detail.json.data.alasan_bypass).toBe("Kegiatan mendesak.");
    });
    it("bukti PENDING tidak menghasilkan URL; dua check-out serentak tidak menggandakan peminjaman", async () => {
        const unit = await asset(), resId = await reservation([unit]), inputs = await Promise.all([checkout([unit], resId, "PENDING"), checkout([unit], resId)]);
        const results = await Promise.all(inputs.map((input) => send("/loans/checkout", manager, input))); expect(results.filter((r) => r.status === 201)).toHaveLength(1);
        if (results[0]!.status === 201) { const detail = await send(`/loans/${results[0]!.json.data.id}`, manager); expect(detail.json.data.signature?.url).toBeNull(); }
    });
    it("pengembalian sebagian, pratinjau tanpa tulis, kunci idempoten, pemulihan status dan arsip slot", async () => {
        const units = [await asset(), await asset()], result = await send("/loans/checkout", manager, await checkout(units)); expect(result.status).toBe(201);
        const detail = (await send(`/loans/${result.json.data.id}`, manager)).json.data, body = await returned(detail, [0]), path = `/loans/${detail.id}/checkin`;
        expect((await send(path + "/preview", manager, body)).status).toBe(200); expect((await kueri<{ n: string }>(`SELECT count(*) AS n FROM loan_items WHERE loan_id=${detail.id} AND status_kembali='DIKEMBALIKAN'`))[0]!.n).toBe("0");
        const key = randomUUID(), returnedResult = await send(path, manager, body, key); expect(returnedResult.status, JSON.stringify(returnedResult.json)).toBe(200); expect(returnedResult.json.data.status).toBe("SEBAGIAN_DIKEMBALIKAN"); expect((await send(path, manager, body, key)).status).toBe(200);
        expect((await kueri<{ status: string }>(`SELECT status::text FROM assets WHERE id=${units[0]!.id}`))[0]!.status).toBe("TERSEDIA"); expect((await kueri<{ status: string }>(`SELECT status::text FROM booking_slots WHERE loan_id=${detail.id} ORDER BY resource_id`)).map((s) => s.status)).toEqual(["RELEASED", "ACTIVE"]);
        expect((await send(path, manager, await returned(detail, [1]))).json.data.status).toBe("DIKEMBALIKAN");
    });
    it("denda per unit memakai snapshot awal meskipun setting berubah, cap dan tanggal WIB", async () => {
        const units = [await asset("10000"), await asset(null)], result = await send("/loans/checkout", manager, await checkout(units)); expect(result.status).toBe(201); const detail = (await send(`/loans/${result.json.data.id}`, manager)).json.data;
        await kueri("UPDATE system_settings SET value='9999' WHERE key IN ('denda.tarif_per_hari','denda.cap_nominal')"); const delta = 5 * 86_400_000; clock.advance(delta);
        try { const response = await send(`/loans/${detail.id}/checkin`, manager, await returned(detail, [0, 1])); expect(response.status, JSON.stringify(response.json)).toBe(200); const fines = await kueri<{ jumlah: string; tarif_per_hari: string }>(`SELECT jumlah::text,tarif_per_hari::text FROM fines WHERE loan_id=${detail.id} ORDER BY loan_item_id`); expect(fines).toEqual([{ jumlah: "3000.00", tarif_per_hari: "1000.00" }, { jumlah: "5000.00", tarif_per_hari: "1000.00" }]); }
        finally { clock.advance(-delta); await kueri("UPDATE system_settings SET value='1000' WHERE key='denda.tarif_per_hari'"); await kueri("UPDATE system_settings SET value='5000' WHERE key='denda.cap_nominal'"); }
    });
    it("kerusakan membuat tiket tertaut dan membatalkan slot reservasi mendatang dalam transaksi yang sama", async () => {
        const unit = await asset(), result = await send("/loans/checkout", manager, await checkout([unit])); expect(result.status).toBe(201); const detail = (await send(`/loans/${result.json.data.id}`, manager)).json.data;
        const future = await reservation([unit], "DISETUJUI", new Date(clock.now().getTime() + 86_400_000), new Date(clock.now().getTime() + 90_000_000));
        const response = await send(`/loans/${detail.id}/checkin`, manager, await returned(detail, [0], "RUSAK_BERAT")); expect(response.status, JSON.stringify(response.json)).toBe(200);
        expect((await kueri<{ status: string }>(`SELECT status::text FROM assets WHERE id=${unit.id}`))[0]!.status).toBe("TIDAK_TERSEDIA"); expect((await kueri<{ status: string }>(`SELECT status::text FROM reservations WHERE id=${future}`))[0]!.status).toBe("DIBATALKAN");
        expect((await kueri<{ n: string }>(`SELECT count(*) AS n FROM loan_item_damage_reports d JOIN loan_items i ON i.id=d.loan_item_id WHERE i.loan_id=${detail.id}`))[0]!.n).toBe("1");
        expect((await kueri<{ jumlah: string }>(`SELECT jumlah::text FROM fines WHERE loan_id=${detail.id} AND jenis='GANTI_RUGI'`))[0]!.jumlah).toBe("10000.00");
    });
    it("hilang tanpa nilai perolehan mencatat kewajiban menunggu penetapan, tanpa nominal buatan", async () => {
        const result = await send("/loans/checkout", manager, await checkout([await asset(null)])); expect(result.status).toBe(201); const detail = (await send(`/loans/${result.json.data.id}`, manager)).json.data;
        const response = await send(`/loans/${detail.id}/checkin`, manager, await returned(detail, [0], "HILANG")); expect(response.status, JSON.stringify(response.json)).toBe(200); expect(response.json.data.status).toBe("HILANG");
        expect((await kueri<{ jumlah: null; menunggu_penetapan: boolean }>(`SELECT jumlah,menunggu_penetapan FROM fines WHERE loan_id=${detail.id} AND jenis='GANTI_RUGI'`))[0]).toEqual({ jumlah: null, menunggu_penetapan: true });
    });
    it("substitusi sekategori beralasan dan kondisi fisik berubah dicatat pada loan serta histori", async () => {
        const original = await asset(), replacement = await asset(), resId = await reservation([original]), body = await checkout([replacement], resId);
        const input = { ...body, unit: [{ ...body.unit[0]!, allocated_asset_id: original.id, alasan_substitusi: "Unit asli sedang diperiksa.", kondisi_awal: "RUSAK_RINGAN", alasan_kondisi_awal: "Lecet ringan diperiksa dan diterima penerima." }] };
        const result = await send("/loans/checkout", manager, input); expect(result.status, JSON.stringify(result.json)).toBe(201);
        const detail = (await send(`/loans/${result.json.data.id}`, manager)).json.data; expect(detail.unit[0]).toMatchObject({ asset_id: String(replacement.id), allocated_asset_id: String(original.id), kondisi_awal: "RUSAK_RINGAN" });
        expect((await kueri<{ n: string }>(`SELECT count(*) AS n FROM asset_condition_history WHERE asset_id=${replacement.id} AND referensi_id=${detail.id}`))[0]!.n).toBe("1");
    });
    it("check-in dengan bukti asing gagal tanpa melepas slot maupun mengubah kondisi", async () => {
        const result = await send("/loans/checkout", manager, await checkout([await asset()])); expect(result.status).toBe(201); const detail = (await send(`/loans/${result.json.data.id}`, manager)).json.data;
        const body = await returned(detail, [0], "RUSAK_BERAT"); body.unit[0]!.foto_file_ids = [Number(await photo("CLEAN", outsider))];
        expect((await send(`/loans/${detail.id}/checkin`, manager, body)).status).toBe(422);
        expect((await kueri<{ status: string }>(`SELECT status::text FROM booking_slots WHERE loan_id=${detail.id}`))[0]!.status).toBe("ACTIVE");
        expect((await kueri<{ kondisi: string }>(`SELECT kondisi::text FROM assets WHERE id=${detail.unit[0]!.asset_id}`))[0]!.kondisi).toBe("BAIK");
    });
    it("kegagalan efek kerusakan setelah pelepasan slot membatalkan seluruh check-in", async () => {
        const result = await send("/loans/checkout", manager, await checkout([await asset()])); expect(result.status).toBe(201);
        const detail = (await send(`/loans/${result.json.data.id}`, manager)).json.data, body = await returned(detail, [0], "RUSAK_BERAT");
        const setting = await getDb().deleteFrom("system_settings").where("key", "=", "maintenance.sla_tindak_lanjut_hari_tinggi").returningAll().executeTakeFirstOrThrow();
        try { expect((await send(`/loans/${detail.id}/checkin`, manager, body)).status).toBe(500); }
        finally { await getDb().insertInto("system_settings").values({ ...setting, value: JSON.stringify(setting.value), nilai_bawaan: JSON.stringify(setting.nilai_bawaan) }).execute(); }
        expect((await kueri<{ status: string }>(`SELECT status::text FROM booking_slots WHERE loan_id=${detail.id}`))[0]!.status).toBe("ACTIVE");
        expect((await kueri<{ status: string; kondisi: string }>(`SELECT status::text,kondisi::text FROM assets WHERE id=${detail.unit[0]!.asset_id}`))[0]).toEqual({ status: "DIPINJAM", kondisi: "BAIK" });
        expect((await kueri<{ owner_id: null }>(`SELECT owner_id FROM stored_files WHERE id=${body.unit[0]!.foto_file_ids[0]}`))[0]!.owner_id).toBeNull();
    });
    it("pemilih dan verifikasi hanya memberi identitas minimum; antrean menolak tanggal yang selesai", async () => {
        const unit = await asset(), resolved = await send(`/loans/units/resolve?code=${unit.code}`, manager);
        expect(resolved.status).toBe(200); expect(resolved.json.data).not.toHaveProperty("nilai_perolehan");
        expect((await send(`/loans/units/resolve?code=${unit.code}`, borrower)).status).toBe(403);
        const old = await reservation([unit], "DISETUJUI", new Date(clock.now().getTime()-7_200_000), new Date(clock.now().getTime()-3_600_000));
        const response = await fetch(`${url}/loans/ready-checkout?reservation_id=${old}`, { headers: { "x-user": String(manager.id), "x-perms": manager.permissions.join(",") } });
        const data = await response.json() as { data: unknown[] }; expect(data.data).toEqual([]);
    });
    it("50 peminjaman langsung atas satu unit menghasilkan tepat satu transaksi", async () => {
        const unit = await asset(), inputs = await Promise.all(Array.from({ length: 50 }, () => checkout([unit])));
        const results = await Promise.all(inputs.map((input) => send("/loans/checkout", manager, input)));
        expect(results.filter((r) => r.status === 201)).toHaveLength(1); expect(results.filter((r) => r.status === 409)).toHaveLength(49);
        expect((await kueri<{ n: string }>(`SELECT count(*) AS n FROM loan_items WHERE asset_id=${unit.id} AND status_kembali='BELUM_KEMBALI'`))[0]!.n).toBe("1");
    }, 30000);
    it("induk berulang ditutup setelah realisasi kembali dan tanggal terakhir kedaluwarsa", async () => {
        const unit = await asset(), first = await reservation([unit]), second = await reservation([unit], "DISETUJUI", new Date(clock.now().getTime() + 86_400_000), new Date(clock.now().getTime() + 90_000_000));
        const ctx = createAuthContext({ userId: manager.id, roleCode: "R-02", scopes: new Map([["loan.manage", "all"]]) }), number = await withTransaction(ctx, (scope) => new DocumentNumberService(clock).next(scope.tx, "RSV-BR"), getDb());
        const root = await id(`INSERT INTO reservations(nomor,jenis,pemohon_id,waktu_mulai,waktu_selesai,status) VALUES ('${number}','ASET',${borrower.id},'${new Date(clock.now().getTime()-3_600_000).toISOString()}','${new Date(clock.now().getTime()+90_000_000).toISOString()}','DISETUJUI') RETURNING id::text`);
        await kueri(`UPDATE reservations SET parent_id=${root},nomor='${number}.01' WHERE id=${first}`); await kueri(`UPDATE reservations SET parent_id=${root},nomor='${number}.02' WHERE id=${second}`);
        const result = await send("/loans/checkout", manager, await checkout([unit], first)); expect(result.status).toBe(201); const detail = (await send(`/loans/${result.json.data.id}`, manager)).json.data;
        expect((await send(`/loans/${detail.id}/checkin`, manager, await returned(detail, [0]))).status).toBe(200);
        await jalankanAktivasiSlot(getDb(), new FixedClock(new Date(clock.now().getTime() + 49 * 3_600_000)));
        expect((await kueri<{ status: string }>(`SELECT status::text FROM reservations WHERE id=${root}`))[0]!.status).toBe("SELESAI");
    });
    it("outbox menerbitkan NT-10/14/15 satu kali saat dispatcher diulang", async () => {
        const registry = new EventHandlerRegistry(), system = createSystemAuthContext("uji-m09");
        pasangKonsumenNotifikasi(registry, { db: getDb, clock, ctx: () => system });
        const dispatcher = new OutboxDispatcher({ registry, db: getDb(), clock, logger: new Logger({ clock, tulis: () => undefined }) }); await dispatcher.drain(); await dispatcher.drain();
        for (const code of ["NT-10", "NT-14", "NT-15"]) expect(Number((await kueri<{ n: string }>(`SELECT count(*) AS n FROM notifications WHERE user_id=${borrower.id} AND kode='${code}'`))[0]!.n)).toBeGreaterThan(0);
        expect(Number((await kueri<{ n: string }>(`SELECT count(*) AS n FROM notifications WHERE user_id=${principal.id} AND kode='NT-15'`))[0]!.n)).toBeGreaterThan(0);
        expect((await kueri<{ n: string }>(`SELECT count(*) AS n FROM (SELECT dedupe_key FROM notifications WHERE user_id=${borrower.id} GROUP BY dedupe_key HAVING count(*)>1) duplicates`))[0]!.n).toBe("0");
    });
    afterAll(async () => {
        if (server) await new Promise<void>((done) => server!.close(() => done()));
        try {
            const ownUsers = users.join(","); if (!ownUsers) return;
            const loans = `SELECT id FROM loans WHERE peminjam_id IN (${ownUsers})`, items = `SELECT id FROM loan_items WHERE loan_id IN (${loans})`, reservations = `SELECT id FROM reservations WHERE pemohon_id IN (${ownUsers})`, damages = `SELECT id FROM damage_reports WHERE loan_id IN (${loans})`;
            for (const query of [
                `DELETE FROM event_outbox WHERE actor_id IN (${ownUsers}) OR (aggregate_type='reservation' AND aggregate_id IN (${reservations}))`, `DELETE FROM notifications WHERE user_id IN (${ownUsers})`,
                `DELETE FROM damage_report_note_photos WHERE note_id IN (SELECT id FROM damage_report_notes WHERE damage_report_id IN (${damages}))`, `DELETE FROM damage_report_notes WHERE damage_report_id IN (${damages})`, `DELETE FROM damage_report_photos WHERE damage_report_id IN (${damages})`, `DELETE FROM loan_item_damage_reports WHERE loan_item_id IN (${items})`, `DELETE FROM damage_reports WHERE loan_id IN (${loans})`,
                `DELETE FROM borrower_blocks WHERE user_id IN (${ownUsers})`, `DELETE FROM loan_daily_events WHERE loan_id IN (${loans})`, `DELETE FROM loan_item_photos WHERE loan_item_id IN (${items})`, `DELETE FROM fines WHERE loan_id IN (${loans})`, `DELETE FROM loan_items WHERE loan_id IN (${loans})`, `DELETE FROM booking_slots WHERE loan_id IN (${loans}) OR reservation_id IN (${reservations})`, `DELETE FROM loans WHERE peminjam_id IN (${ownUsers})`, `DELETE FROM reservation_items WHERE reservation_id IN (${reservations})`, `DELETE FROM reservations WHERE pemohon_id IN (${ownUsers})`, `DELETE FROM stored_files WHERE uploaded_by IN (${ownUsers})`,
            ]) await kueri(query);
            if (assetIds.length) { await kueri(`DELETE FROM asset_condition_history WHERE asset_id IN (${assetIds.join(",")})`); await kueri(`DELETE FROM assets WHERE id IN (${assetIds.join(",")})`); }
            for (const setting of oldSettings) await kueri(`UPDATE system_settings SET value='${JSON.stringify(setting.value)}' WHERE key='${setting.key}'`);
            if (keys.length) await kueri(`DELETE FROM idempotency_keys WHERE key IN (${keys.map((key) => `'${key}'`).join(",")})`);
            if (category) await kueri(`DELETE FROM asset_categories WHERE id=${category}`); if (room) await kueri(`DELETE FROM rooms WHERE id=${room}`); if (area) await kueri(`DELETE FROM areas WHERE id=${area}`); if (building) await kueri(`DELETE FROM buildings WHERE id=${building}`); await kueri(`DELETE FROM users WHERE id IN (${ownUsers})`);
        } finally { await closeDb(); }
    });
});
