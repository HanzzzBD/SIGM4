// PR-04-02/03: HTTP, constraint PostgreSQL, approval dan jalur worker nyata.
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import type { AssetReservationBody, ReservationDetail, RoomReservationCreated } from "@sigm4/schemas";
import { createApp } from "../../src/api/index.js";
import { blokirPemohon, pasangKonsumenReservasi } from "../../src/modules/m07-reservation-room/index.js";
import { ApprovalService } from "../../src/modules/m10-approval/index.js";
import { pasangKonsumenNotifikasi, fcmCheck } from "../../src/modules/m17-notifications/index.js";
import { AMR_OTP, createAuthContext, setAmr, setAuthContext } from "../../src/shared/auth/index.js";
import type { Scope } from "../../src/shared/auth/index.js";
import { createSystemAuthContext } from "../../src/shared/auth/system-context.js";
import { AuditLogger } from "../../src/shared/audit/index.js";
import { FixedClock } from "../../src/shared/clock/index.js";
import { getDb, closeDb } from "../../src/shared/db/index.js";
import { EventHandlerRegistry, OutboxDispatcher } from "../../src/shared/events/index.js";
import { HealthRegistry, Logger } from "../../src/shared/observability/index.js";
import { jalankanPemeriksaanSla } from "../../src/worker/approval-sla-check.js";
import { jalankanAktivasiSlot, jalankanKedaluwarsaSlot } from "../../src/worker/slot-jobs.js";
import { authPalsu } from "../helpers/auth.js";
import { dbmate, kueri } from "../helpers/db.js";

const clock = new FixedClock(new Date("2027-05-03T02:00:00Z")), marker = `A${randomUUID().slice(0, 7)}`;
interface Actor { id: number; role: string; permissions: string[] }
interface Result<T> { status: number; json: { data: T; error?: { code: string; message: string }; success: boolean } }
describe.skipIf(!process.env["DATABASE_URL"] || !process.env["REDIS_URL"])("PR-04-02/03 — reservasi aset dan gabungan", () => {
    let server: Server | undefined, url = "", room = "", building = "", area = "", category = "", raceCategory = "", approver: Actor, senior: Actor, teacher: Actor, staff: Actor, student: Actor, blocked: Actor;
    const actors: Actor[] = [], assets: string[] = [], ruleIds: string[] = [], requestKeys: string[] = [];
    let eligible = "", privateUnit = "", nonStudent = "", poorUnit = "", deleted = "";
    const id = async (statement: string) => (await kueri<{ id: string }>(statement))[0]!.id;
    const actor = async (role = "R-05", permissions = ["reservation.view", "reservation.create", "reservation.cancel_own"]) => {
        const token = randomUUID(); const record = { id: Number(await id(`INSERT INTO users (nama,email,password_hash,nip_nis,role_id,status,must_change_password) VALUES ('Uji ${marker}','${token}@uji.sch.id','x','${token}',(SELECT id FROM roles WHERE kode='${role}'),'AKTIF',false) RETURNING id::text`)), role, permissions }; actors.push(record); return record;
    };
    let oldBlockThreshold: unknown;
    beforeAll(async () => {
        dbmate("up");
        oldBlockThreshold = (await kueri<{ value: unknown }>("SELECT value FROM system_settings WHERE key='denda.ambang_blokir'"))[0]?.value;
        await kueri("UPDATE system_settings SET value='100000000' WHERE key='denda.ambang_blokir'");
        approver = await actor("R-03", ["approval.decide"]); senior = await actor("R-03", ["approval.decide"]);
        teacher = await actor(); student = await actor("R-07", ["reservation.view:restricted", "reservation.create", "reservation.cancel_own"]);
        staff = await actor("R-02", ["reservation.view", "reservation.create", "reservation.cancel_own", "reservation.cancel_any", "reservation.record_usage", "reservation.urgent", "damage.verify", "asset.update_condition"]);
        blocked = await actor();
        building = await id(`INSERT INTO buildings (nama,kode) VALUES ('Uji ${marker}','${marker}') RETURNING id::text`);
        area = await id(`INSERT INTO areas (building_id,nama,kode) VALUES (${building},'Uji','${marker}') RETURNING id::text`);
        room = await id(`INSERT INTO rooms (area_id,nama,kode,jenis,kapasitas,dapat_direservasi,boleh_direservasi_siswa) VALUES (${area},'Aula ${marker}','${marker}','AULA',100,true,true) RETURNING id::text`);
        category = await id(`INSERT INTO asset_categories (nama,kode) VALUES ('Kategori ${marker}','${marker}') RETURNING id::text`);
        raceCategory = await id(`INSERT INTO asset_categories (nama,kode) VALUES ('Terakhir ${marker}','R${marker}') RETURNING id::text`);
        const unit = async (suffix: string, cat = category, borrow = true, students = true, condition = "BAIK", discarded = false) => { const asset = await id(`INSERT INTO assets (kode_barang,nama,category_id,tahun_perolehan,sumber_perolehan,room_id,kondisi,dapat_dipinjam,boleh_dipinjam_siswa,dihapuskan,nilai_perolehan) VALUES ('${marker}-${suffix}','Unit ${suffix}',${cat},2026,'PEMBELIAN',${room},'${condition}',${String(borrow)},${String(students)},${String(discarded)},1000) RETURNING id::text`); assets.push(asset); return asset; };
        eligible = await unit("baik"); privateUnit = await unit("pribadi", category, false, false); nonStudent = await unit("staf", category, true, false); poorUnit = await unit("rusak", category, true, true, "RUSAK_BERAT"); deleted = await unit("hapus", category, true, true, "BAIK", true);
        await unit("dua"); await unit("tiga"); await unit("empat"); await unit("terakhir", raceCategory);
        const rule = await id(`INSERT INTO approval_rules (jenis_pengajuan,kondisi,prioritas,terminal_on_exhausted_escalation) VALUES ('RESERVASI_ASET','{"field":"asset_category_id","op":"in","value":[${category},${raceCategory}]}',99,'auto_reject') RETURNING id::text`); ruleIds.push(rule);
        await kueri(`INSERT INTO approval_rule_steps (rule_id,urutan,approver_type,approver_user_id,sla_jam,on_sla_breach,eskalasi_ke) VALUES (${rule},1,'user',${approver.id},8,'escalate',${senior.id})`);
        blokirPemohon.daftar({ nama: marker, alasanBlokir: async (_scope, user) => user === blocked.id ? [{ jenis: "DENDA_BELUM_LUNAS", keterangan: "Denda belum lunas." }] : [] });
        const app = createApp({ db: getDb(), clock, appBaseUrl: "https://sigm4.test", auth: authPalsu(), health: new HealthRegistry(30).register(fcmCheck(null)), logger: new Logger({ clock, tulis: () => undefined }), limiter: { hit: async () => ({ lolos: true, batas: 1000, sisa: 999, resetDetik: 60 }) }, security: { objectStorageOrigin: "http://minio:9000" } });
        const outer = express();
        outer.use((req, res, next) => { const perms = (req.header("x-perms") ?? "").split(",").filter(Boolean); setAuthContext(res, createAuthContext({ userId: Number(req.header("x-user")), roleCode: req.header("x-role") ?? "R-05", scopes: new Map<string, Scope>(perms.map((p) => [p.split(":")[0]!, (p.split(":")[1] ?? "all") as Scope])) })); setAmr(res, ["pwd", AMR_OTP]); next(); });
        outer.use(app); server = createServer(outer); await new Promise<void>((done) => server!.listen(0, "127.0.0.1", done)); url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
    }, 120000);
    afterAll(async () => {
        if (oldBlockThreshold !== undefined) await kueri(`UPDATE system_settings SET value='${JSON.stringify(oldBlockThreshold)}' WHERE key='denda.ambang_blokir'`);
        if (server) await new Promise<void>((done) => server!.close(() => done()));
        try {
            if (actors.length > 0) {
                const users = actors.map((a) => a.id).join(","), own = `SELECT id FROM reservations WHERE pemohon_id IN (${users})`, instances = `SELECT id FROM approval_instances WHERE pemohon_id IN (${users})`;
                for (const statement of [
                    `DELETE FROM notifications WHERE user_id IN (${users}) OR (referensi_jenis='reservation' AND referensi_id IN (${own})) OR (referensi_jenis='approval_instance' AND referensi_id IN (${instances}))`,
                    `DELETE FROM event_outbox WHERE actor_id IN (${users}) OR (aggregate_type='reservation' AND aggregate_id IN (${own})) OR (aggregate_type='approval_instance' AND aggregate_id IN (${instances}))`,
                    `DELETE FROM reservation_items WHERE reservation_id IN (${own})`, `DELETE FROM booking_slots WHERE reservation_id IN (${own})`,
                    `DELETE FROM approval_steps WHERE instance_id IN (${instances})`, `DELETE FROM approval_instances WHERE pemohon_id IN (${users})`,
                    `DELETE FROM reservations WHERE pemohon_id IN (${users}) AND parent_id IS NOT NULL`, `DELETE FROM reservations WHERE pemohon_id IN (${users})`,
                ]) await kueri(statement);
                if (requestKeys.length > 0) await kueri(`DELETE FROM idempotency_keys WHERE key IN (${[...new Set(requestKeys)].map((key) => `'${key}'`).join(",")})`);
                if (ruleIds.length > 0) { await kueri(`DELETE FROM approval_rule_steps WHERE rule_id IN (${ruleIds.join(",")})`); await kueri(`DELETE FROM approval_rules WHERE id IN (${ruleIds.join(",")})`); }
                if (assets.length > 0) {
                    await kueri(`DELETE FROM damage_reports WHERE asset_id IN (${assets.join(",")})`); await kueri(`DELETE FROM asset_condition_history WHERE asset_id IN (${assets.join(",")})`); await kueri(`DELETE FROM assets WHERE id IN (${assets.join(",")})`);
                }
                if (category !== "") await kueri(`DELETE FROM asset_categories WHERE id IN (${category}${raceCategory === "" ? "" : `,${raceCategory}`})`);
                if (room !== "") await kueri(`DELETE FROM rooms WHERE id=${room}`);
                if (area !== "") await kueri(`DELETE FROM areas WHERE id=${area}`);
                if (building !== "") await kueri(`DELETE FROM buildings WHERE id=${building}`);
                await kueri(`DELETE FROM users WHERE id IN (${users})`);
            }
        } finally { await closeDb(); }
    });
    const send = async <T>(path: string, who: Actor, payload?: unknown, key: string = randomUUID()): Promise<Result<T>> => {
        requestKeys.push(key); const response = await fetch(`${url}${path}`, { method: payload === undefined ? "GET" : "POST", headers: { "content-type": "application/json", "x-user": String(who.id), "x-role": who.role, "x-perms": who.permissions.join(","), "idempotency-key": key }, ...(payload === undefined ? {} : { body: JSON.stringify(payload) }) });
        return { status: response.status, json: await response.json() as Result<T>["json"] };
    };
    const body = (day: string, patch: Partial<AssetReservationBody> = {}): AssetReservationBody => ({ jenis: "ASET", aset: [{ category_id: Number(category), jumlah: 1 }], waktu_mulai: `${day}T08:00:00+07:00`, waktu_selesai: `${day}T17:00:00+07:00`, keperluan: "Praktik pembelajaran", lokasi_penggunaan: "Aula sekolah", ...patch });
    const create = async (who: Actor, day: string, patch: Partial<AssetReservationBody> = {}, key?: string) => send<RoomReservationCreated>("/reservations", who, body(day, patch), key);
    const slots = (reservation: string) => kueri<{ id: string; status: string; resource_type: string; resource_id: string }>(`SELECT id::text,status::text,resource_type::text,resource_id::text FROM booking_slots WHERE reservation_id=${reservation} ORDER BY id`);
    const decision = (reservation: RoomReservationCreated, result = "DISETUJUI") => send(`/approvals/${reservation.approval.instance_id}/decide`, approver, { urutan: 1, keputusan: result, catatan: result === "DITOLAK" ? "Tidak dapat dipenuhi." : null });
    const drain = async (time = clock) => { const registry = new EventHandlerRegistry(), system = createSystemAuthContext("uji-m08"), audit = new AuditLogger({ clock: time }); pasangKonsumenReservasi(registry, { db: getDb, clock: time, ctx: () => system, audit, approval: () => new ApprovalService(getDb(), audit, time) }); pasangKonsumenNotifikasi(registry, { db: getDb, clock: time, ctx: () => system }); await new OutboxDispatcher({ registry, db: getDb(), clock: time, logger: new Logger({ clock: time, tulis: () => undefined }) }).drain(); };
    it("pengajuan idempoten, satu approval, slot TENTATIVE, kode tersembunyi sebelum disetujui", async () => {
        const key = randomUUID(), submitted = await create(teacher, "2027-05-05", {}, key); expect(submitted.status).toBe(201);
        const repeated = await create(teacher, "2027-05-05", {}, key); expect(repeated.json.data.id).toBe(submitted.json.data.id);
        expect((await slots(submitted.json.data.id)).map((s) => s.status)).toEqual(["TENTATIVE"]);
        const detail = await send<ReservationDetail>(`/reservations/${submitted.json.data.id}`, teacher); expect(detail.status).toBe(200); expect(detail.json.data.aset?.[0]?.asset_id).toBeNull();
        expect((await send(`/reservations/${submitted.json.data.id}`, { ...student, permissions: ["reservation.view:own"] })).status).toBe(404);
        expect((await decision(submitted.json.data)).status).toBe(200);
        expect((await slots(submitted.json.data.id)).map((s) => s.status)).toEqual(["CONFIRMED"]);
        const approved = await send<ReservationDetail>(`/reservations/${submitted.json.data.id}`, teacher); expect(approved.json.data.aset?.[0]?.kode_barang).toBeTruthy();
        expect((await kueri<{ status: string }>(`SELECT status::text FROM assets WHERE id=${eligible}`))[0]?.status).toBe("TERSEDIA");
    });
    it("tanpa create/cancel_own ditolak; siswa dibatasi katalog dan durasi 3 hari", async () => {
        const noPermission = await actor("R-04", ["reservation.view"]); expect((await create(noPermission, "2027-05-06")).status).toBe(403);
        expect((await create(student, "2027-05-06", { waktu_selesai: "2027-05-10T17:00:00+07:00" })).status).toBe(422);
        const submitted = await create(student, "2027-05-06"); expect(submitted.status).toBe(201);
        const list = await kueri<{ asset_id: string }>(`SELECT asset_id::text FROM reservation_items WHERE reservation_id=${submitted.json.data.id}`); expect(list[0]?.asset_id).not.toBe(nonStudent);
        expect((await send(`/reservations/${submitted.json.data.id}/cancel`, { ...student, permissions: ["reservation.view:restricted"] }, { alasan: "Batal." })).status).toBe(403);
        expect((await send(`/reservations/${submitted.json.data.id}`, { ...student, id: teacher.id })).status).toBe(404);
        expect((await send(`/reservations/${submitted.json.data.id}/cancel`, student, { alasan: "Batal." })).status).toBe(200);
    });
    it("manual hanya Petugas/Admin; unit tidak layak/asing tidak dapat dipilih", async () => {
        expect((await create(teacher, "2027-05-07", { aset: [{ category_id: Number(category), jumlah: 1, asset_ids: [Number(eligible)] }] })).status).toBe(403);
        for (const unit of [privateUnit, poorUnit, deleted, "9999999"]) expect((await create(staff, "2027-05-07", { aset: [{ category_id: Number(category), jumlah: 1, asset_ids: [Number(unit)] }] })).status).toBe(409);
        const submitted = await create(staff, "2027-05-07", { aset: [{ category_id: Number(category), jumlah: 1, asset_ids: [Number(eligible)] }] }); expect(submitted.status).toBe(201); expect((await slots(submitted.json.data.id))[0]?.resource_id).toBe(eligible);
    });
    it("BR-030 blokir dan BR-021 durasi; horizon dan H-1 diperiksa server", async () => {
        expect((await create(blocked, "2027-05-08")).json.error?.code).toBe("BORROWER_BLOCKED");
        expect((await create(teacher, "2027-05-08", { waktu_selesai: "2027-05-16T17:00:00+07:00" })).status).toBe(422);
        expect((await create(teacher, "2027-09-01")).status).toBe(422);
        expect((await create(teacher, "2027-05-03", { waktu_mulai: "2027-05-03T13:00:00+07:00", waktu_selesai: "2027-05-03T14:00:00+07:00" })).status).toBe(422);
    });
    it("gabungan all-or-nothing dan satu instance RESERVASI_ASET", async () => {
        const submitted = await create(teacher, "2027-05-10", { room_id: Number(room), nama_kegiatan: "Praktik", jenis_kegiatan: "Pembelajaran", jumlah_peserta: 20, aset: [{ category_id: Number(category), jumlah: 2 }] }); expect(submitted.status).toBe(201);
        expect((await slots(submitted.json.data.id)).map((s) => s.resource_type).sort()).toEqual(["asset", "asset", "room"]);
        expect((await kueri<{ jenis: string }>(`SELECT jenis_pengajuan::text AS jenis FROM approval_instances WHERE referensi_id=${submitted.json.data.id}`))[0]?.jenis).toBe("RESERVASI_ASET");
        expect((await decision(submitted.json.data)).status).toBe(200); expect((await slots(submitted.json.data.id)).every((s) => s.status === "CONFIRMED")).toBe(true);
        const next = await create(teacher, "2027-05-10", { room_id: Number(room), nama_kegiatan: "Bentrok", jenis_kegiatan: "Rapat", jumlah_peserta: 20 }); expect(next.status).toBe(409);
        await jalankanAktivasiSlot(getDb(), new FixedClock(new Date("2027-05-10T02:00:00Z")));
        const state = (await kueri<{ status: string; status_penggunaan_ruangan: string }>(`SELECT status::text,status_penggunaan_ruangan::text FROM reservations WHERE id=${submitted.json.data.id}`))[0]; expect(state).toEqual({ status: "DISETUJUI", status_penggunaan_ruangan: "BERLANGSUNG" });
        const live = await slots(submitted.json.data.id); expect(live.filter((s) => s.resource_type === "asset").every((s) => s.status === "CONFIRMED")).toBe(true); expect(live.find((s) => s.resource_type === "room")?.status).toBe("ACTIVE");
        await jalankanAktivasiSlot(getDb(), new FixedClock(new Date("2027-05-10T11:00:00Z")));
        const usage = await send(`/reservations/${submitted.json.data.id}/usage`, staff, { hasil: "BAIK", catatan: "Sudah digunakan." }); expect(usage.status, JSON.stringify(usage.json)).toBe(200);
        expect((await kueri<{ status: string }>(`SELECT status::text FROM reservations WHERE id=${submitted.json.data.id}`))[0]?.status).toBe("DISETUJUI");
    });
    it("persetujuan memeriksa seluruh slot; satu unit berubah kelayakan menolak seluruhnya", async () => {
        const submitted = await create(teacher, "2027-05-12", { aset: [{ category_id: Number(category), jumlah: 2 }] }); expect(submitted.status).toBe(201);
        const held = await slots(submitted.json.data.id); await kueri(`UPDATE assets SET dapat_dipinjam=false,boleh_dipinjam_siswa=false WHERE id=${held[1]!.resource_id}`);
        expect((await decision(submitted.json.data)).status).toBe(409); expect((await slots(submitted.json.data.id)).every((s) => s.status === "TENTATIVE")).toBe(true);
        await kueri(`UPDATE assets SET dapat_dipinjam=true,boleh_dipinjam_siswa=true WHERE id=${held[1]!.resource_id}`);
        expect((await decision(submitted.json.data, "DITOLAK")).status).toBe(200); expect((await slots(submitted.json.data.id)).every((s) => s.status === "RELEASED")).toBe(true);
    });
    it("pembatalan alasan wajib, kepemilikan dan cancel_any; slot dipertahankan RELEASED", async () => {
        const who = await actor(), submitted = await create(who, "2027-05-14"); expect(submitted.status).toBe(201);
        expect((await send(`/reservations/${submitted.json.data.id}/cancel`, who, { alasan: "" })).status).toBe(422);
        expect((await send(`/reservations/${submitted.json.data.id}/cancel`, teacher, { alasan: "Batal." })).status).toBe(403);
        expect((await send(`/reservations/${submitted.json.data.id}/cancel`, staff, { alasan: "Aset untuk ujian." })).status).toBe(200);
        expect((await slots(submitted.json.data.id)).map((s) => s.status)).toEqual(["RELEASED"]);
        expect((await kueri<{ status: string }>(`SELECT status::text FROM approval_instances WHERE id=${submitted.json.data.approval.instance_id}`))[0]?.status).toBe("DIBATALKAN"); await drain();
        expect((await kueri<{ n: string }>(`SELECT count(*) AS n FROM notifications WHERE user_id=${who.id} AND kode='NT-08'`))[0]?.n).toBe("1");
    });
    it("berulang: membatalkan satu tanggal melepas semua unit tanggal itu, tanggal lain tetap utuh", async () => {
        const who = await actor(), submitted = await create(who, "2027-05-17", { pengulangan: { hari: [1], sampai: "2027-05-31" }, aset: [{ category_id: Number(category), jumlah: 2 }] }); expect(submitted.status).toBe(201); expect(submitted.json.data.tanggal).toHaveLength(3);
        const dates = submitted.json.data.tanggal; expect((await send(`/reservations/${dates[1]!.id}/cancel`, who, { alasan: "Tanggal itu dibatalkan." })).status).toBe(200);
        expect((await slots(dates[1]!.id)).every((s) => s.status === "RELEASED")).toBe(true); expect((await slots(dates[0]!.id)).every((s) => s.status === "TENTATIVE")).toBe(true); expect((await decision(submitted.json.data)).status).toBe(200);
        const detail = await send<ReservationDetail>(`/reservations/${submitted.json.data.id}`, who);
        expect(detail.json.data.aset?.filter((i) => i.reservation_id === dates[1]!.id).every((i) => i.kode_barang === null)).toBe(true);
        expect(detail.json.data.aset?.filter((i) => i.reservation_id === dates[0]!.id).every((i) => i.kode_barang !== null)).toBe(true);
    });
    it("TTL worker + outbox: seluruh pengajuan KEDALUWARSA dan NT-46, idempoten", async () => {
        const who = await actor(), submitted = await create(who, "2027-06-01", { aset: [{ category_id: Number(category), jumlah: 2 }] }); expect(submitted.status).toBe(201);
        const late = new FixedClock(new Date(clock.now().getTime() + 49 * 3_600_000)); await jalankanKedaluwarsaSlot(getDb(), late); await drain(late); await drain(late);
        expect((await kueri<{ status: string }>(`SELECT status::text FROM reservations WHERE id=${submitted.json.data.id}`))[0]?.status).toBe("KEDALUWARSA"); expect((await slots(submitted.json.data.id)).every((s) => s.status === "RELEASED")).toBe(true);
        expect((await kueri<{ n: string }>(`SELECT count(*) AS n FROM notifications WHERE user_id=${who.id} AND kode='NT-46' AND referensi_id=${submitted.json.data.id}`))[0]?.n).toBe("1");
    });
    it("approval-sla-check worker auto_reject melepas semua slot aset", async () => {
        const who = await actor(), submitted = await create(who, "2027-06-02", { aset: [{ category_id: Number(category), jumlah: 2 }] }); expect(submitted.status).toBe(201);
        const deadline = async () => (await kueri<{ sla_deadline: Date }>(`SELECT sla_deadline FROM approval_steps WHERE instance_id=${submitted.json.data.approval.instance_id} AND keputusan IS NULL`))[0]!.sla_deadline;
        await jalankanPemeriksaanSla(getDb(), new FixedClock(new Date((await deadline()).getTime() + 60_000))); await jalankanPemeriksaanSla(getDb(), new FixedClock(new Date((await deadline()).getTime() + 60_000)));
        expect((await slots(submitted.json.data.id)).every((s) => s.status === "RELEASED")).toBe(true); expect((await kueri<{ status: string }>(`SELECT status::text FROM reservations WHERE id=${submitted.json.data.id}`))[0]?.status).toBe("DITOLAK");
    });
    it("tidak diambil 24 jam: worker membebaskan aset dan menerbitkan NT-09, bukan NT-46", async () => {
        const who = await actor(), submitted = await create(who, "2027-06-03"); expect(submitted.status).toBe(201); expect((await decision(submitted.json.data)).status).toBe(200);
        const late = new FixedClock(new Date("2027-06-04T01:00:00Z")); await jalankanAktivasiSlot(getDb(), late); await drain(late);
        expect((await slots(submitted.json.data.id)).map((s) => s.status)).toEqual(["RELEASED"]); expect((await kueri<{ status: string }>(`SELECT status::text FROM reservations WHERE id=${submitted.json.data.id}`))[0]?.status).toBe("KEDALUWARSA");
        expect((await kueri<{ n: string }>(`SELECT count(*) AS n FROM notifications WHERE user_id=${who.id} AND kode='NT-09' AND referensi_id=${submitted.json.data.id}`))[0]?.n).toBe("1");
    });
    it("verifikasi kerusakan membatalkan reservasi mendatang atomik dan menutup approval", async () => {
        const who = await actor(), submitted = await create(who, "2027-06-05"); expect(submitted.status).toBe(201); const asset = (await slots(submitted.json.data.id))[0]!.resource_id;
        const ticket = await id(`INSERT INTO damage_reports (nomor,pelapor_id,asset_id,deskripsi,urgensi) VALUES ('KRS-2027-989999',${who.id},${asset},'Kerusakan berat','TINGGI') RETURNING id::text`);
        const technician = await actor("R-04", ["workorder.execute:assigned"]);
        const verify = await send(`/damage-reports/${ticket}/verify`, { ...staff, permissions: [...staff.permissions.filter((p) => p !== "reservation.cancel_any"), "workorder.create"] }, { keputusan: "TINDAK_LANJUT", work_order: { teknisi_id: technician.id, target_selesai: "2027-05-10" }, kondisi_aset: { kondisi: "RUSAK_BERAT", alasan: "Hasil pemeriksaan." } }); expect(verify.status, JSON.stringify(verify.json)).toBe(200);
        expect((await slots(submitted.json.data.id)).every((s) => s.status === "RELEASED")).toBe(true); expect((await kueri<{ status: string }>(`SELECT status::text FROM reservations WHERE id=${submitted.json.data.id}`))[0]?.status).toBe("DIBATALKAN"); expect((await kueri<{ status: string }>(`SELECT status::text FROM assets WHERE id=${asset}`))[0]?.status).toBe("TIDAK_TERSEDIA");
    });
    it("kuota lintas jenis diserialkan; dua pengajuan ketika batas 1 menghasilkan satu sukses", async () => {
        const who = await actor(); await kueri("UPDATE system_settings SET value='1' WHERE key='reservasi.kuota_tertunda_guru_staf'");
        try { const results = await Promise.all([create(who, "2027-06-07"), send("/reservations", who, { room_id: Number(room), nama_kegiatan: "Rapat", jenis_kegiatan: "Rapat", jumlah_peserta: 10, waktu_mulai: "2027-06-08T08:00:00+07:00", waktu_selesai: "2027-06-08T09:00:00+07:00" })]); expect(results.map((r) => r.status).sort()).toEqual([201, 422]); } finally { await kueri("UPDATE system_settings SET value='5' WHERE key='reservasi.kuota_tertunda_guru_staf'"); }
    });
    it("aset yang belum diserahkan dapat dibatalkan setelah mulai; slot ACTIVE menolak pembatalan", async () => {
        const who = await actor(), pending = await create(who, "2027-06-10"), checkedOut = await create(who, "2027-06-10");
        expect(pending.status).toBe(201); expect(checkedOut.status).toBe(201);
        expect((await decision(pending.json.data)).status).toBe(200); expect((await decision(checkedOut.json.data)).status).toBe(200);
        const combined = await create(who, "2027-06-10", { room_id: Number(room), nama_kegiatan: "Kegiatan", jenis_kegiatan: "Pembelajaran", jumlah_peserta: 10 }); expect(combined.status).toBe(201); expect((await decision(combined.json.data)).status).toBe(200);
        await kueri(`UPDATE booking_slots SET status='ACTIVE' WHERE reservation_id=${checkedOut.json.data.id}`);
        const delta = new Date("2027-06-10T02:00:00Z").getTime() - clock.now().getTime(); clock.advance(delta);
        try {
            expect((await send(`/reservations/${pending.json.data.id}/cancel`, who, { alasan: "Belum diambil." })).status).toBe(200);
            expect((await send(`/reservations/${checkedOut.json.data.id}/cancel`, who, { alasan: "Sudah diambil." })).status).toBe(409);
            expect((await send(`/reservations/${combined.json.data.id}/cancel`, who, { alasan: "Ruangan sudah mulai." })).status).toBe(409);
            expect((await slots(checkedOut.json.data.id)).map((s) => s.status)).toEqual(["ACTIVE"]);
        } finally { clock.advance(-delta); }
    });
    it("PR-03-38: gabungan ruangan/aset dibatasi jam ruangan, aset tanpa ruangan tetap memakai batas role", async () => {
        const who = await actor(), original = (await kueri<{ value: number }>("SELECT value FROM system_settings WHERE key='reservasi.durasi_maksimum_jam'"))[0]!.value;
        await kueri("UPDATE system_settings SET value='1' WHERE key='reservasi.durasi_maksimum_jam'");
        try {
            const common = { waktu_mulai: "2027-06-11T13:00:00+07:00", waktu_selesai: "2027-06-11T14:30:00+07:00", keperluan: "Praktik", lokasi_penggunaan: "Aula" };
            const combined = { ...common, room_id: Number(room), nama_kegiatan: "Praktik", jenis_kegiatan: "Pembelajaran", jumlah_peserta: 10, aset_pendukung: [{ category_id: Number(category), jumlah: 1 }] };
            const preview = await send<{ tanggal: { keadaan: string; alasan: string | null }[] }>("/reservations/preview", who, combined);
            expect(preview.status).toBe(200); expect(preview.json.data.tanggal[0]).toMatchObject({ keadaan: "TIDAK_SAH", alasan: "Durasi reservasi melebihi maksimum 1 jam per kemunculan." });
            expect((await send("/reservations", who, combined)).status).toBe(422);
            const assets = await send<{ tanggal: { keadaan: string }[] }>("/reservations/preview", who, { ...common, jenis: "ASET", aset: [{ category_id: Number(category), jumlah: 1 }] });
            expect(assets.status).toBe(200); expect(assets.json.data.tanggal[0]?.keadaan).toBe("TERSEDIA");
        } finally { await kueri(`UPDATE system_settings SET value='${original}' WHERE key='reservasi.durasi_maksimum_jam'`); }
    });
    it("muatan ruangan dengan aset pendukung dinormalisasi menjadi satu pengajuan ASET", async () => {
        const who = await actor();
        const submitted = await send<RoomReservationCreated>("/reservations", who, { room_id: Number(room), nama_kegiatan: "Praktik", jenis_kegiatan: "Pembelajaran", jumlah_peserta: 10, waktu_mulai: "2027-06-11T08:00:00+07:00", waktu_selesai: "2027-06-11T09:00:00+07:00", keperluan: "Praktik", lokasi_penggunaan: "Aula", aset_pendukung: [{ category_id: Number(category), jumlah: 1 }] });
        expect(submitted.status).toBe(201);
        expect((await kueri<{ jenis: string }>(`SELECT jenis::text FROM reservations WHERE id=${submitted.json.data.id}`))[0]?.jenis).toBe("ASET");
        expect((await slots(submitted.json.data.id)).map((s) => s.resource_type).sort()).toEqual(["asset", "room"]);
    });
    it("50 pengajuan HTTP pada unit terakhir → tepat 1 sukses dan 49 ASSET_NOT_AVAILABLE", async () => {
        const users = await Promise.all(Array.from({ length: 50 }, () => actor()));
        const results = await Promise.all(users.map((who) => create(who, "2027-06-09", { aset: [{ category_id: Number(raceCategory), jumlah: 1 }] })));
        expect(results.filter((r) => r.status === 201)).toHaveLength(1); const rejected = results.filter((r) => r.status !== 201); expect(rejected).toHaveLength(49); for (const r of rejected) expect({ status: r.status, code: r.json.error?.code }).toEqual({ status: 409, code: "ASSET_NOT_AVAILABLE" });
    }, 30000);
    it("tiga pemohon memesan lima unit serentak: satu alokasi lengkap tanpa over-booking", async () => {
        // Satu unit dibuat tidak tersedia oleh uji verifikasi; pulihkan hanya fixture uji ini.
        await kueri(`UPDATE assets SET kondisi='BAIK',status='TERSEDIA',dapat_dipinjam=true,boleh_dipinjam_siswa=true WHERE id=${eligible}`);
        const users = await Promise.all([actor(), actor(), actor()]);
        const results = await Promise.all(users.map((who) => create(who, "2027-06-12", { aset: [{ category_id: Number(category), jumlah: 5 }] })));
        expect(results.map((r) => r.status).sort()).toEqual([201, 409, 409]);
        const allocated = await slots(results.find((r) => r.status === 201)!.json.data.id);
        expect(allocated).toHaveLength(5); expect(new Set(allocated.map((s) => s.resource_id)).size).toBe(5);
    });
});
