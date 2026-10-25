import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ROOM_SCHEDULE_IMPORT_COLUMNS, RoomScheduleImportResponseSchema } from "@sigm4/schemas";
import { createApp } from "../../src/api/index.js";
import { BlockService, CancellationService, RoomScheduleImportRunner, RoomScheduleImportService, purgeRoomScheduleImportReports } from "../../src/modules/m07-reservation-room/index.js";
import { RoomScheduleImportRepository } from "../../src/modules/m07-reservation-room/repositories/room-schedule-import.repository.js";
import { ApprovalService } from "../../src/modules/m10-approval/index.js";
import { fcmCheck, pasangKonsumenNotifikasi } from "../../src/modules/m17-notifications/index.js";
import { AMR_OTP, createAuthContext, setAmr, setAuthContext } from "../../src/shared/auth/index.js";
import type { EffectivePermissions } from "../../src/shared/auth/index.js";
import { createSystemAuthContext } from "../../src/shared/auth/system-context.js";
import { AuditLogger } from "../../src/shared/audit/index.js";
import { BusinessCalendarService } from "../../src/shared/calendar/index.js";
import { FixedClock } from "../../src/shared/clock/index.js";
import { getDb, withTransaction } from "../../src/shared/db/index.js";
import { EventHandlerRegistry } from "../../src/shared/events/index.js";
import type { OutboxEvent } from "../../src/shared/events/index.js";
import { HealthRegistry, Logger } from "../../src/shared/observability/index.js";
import { authPalsu } from "../helpers/auth.js";
import { dbmate, kueri } from "../helpers/db.js";

const tag = randomUUID().slice(0, 8), code = `SI${tag}`, clock = new FixedClock(new Date("2027-09-06T02:00:00Z"));
const audit = new AuditLogger({ clock });
let owner: number, other: number, room: string, building: string, area: string, year: string, rule: string, oldYear: string | null, server: Server, url: string;
let oldBlockThreshold: unknown;
const keys: string[] = [];
const grants = ["reservation.fixed_schedule", "reservation.view", "reservation.create", "reservation.urgent", "setting.view", "setting.manage"];
const ctx = (id = owner, allow = true) => createAuthContext({ userId: id, roleCode: "R-02", scopes: new Map((allow ? grants : []).map(p => [p, "all"] as const)) });
function service(c = clock) {
    const db = getDb(), calendar = new BusinessCalendarService();
    return new RoomScheduleImportService(db, audit, c, new BlockService(db, c, calendar, audit, new CancellationService(db, c, audit, new ApprovalService(db, audit, c, calendar))));
}
const row = (v: Record<string, string> = {}) => ({ kode_ruangan: code, hari: "Senin", jam_mulai: "10:00", jam_selesai: "11:00", label_kegiatan: "KBM", berlaku_mulai: "2027-09-06", berlaku_sampai: "2027-11-30", ...v });
function file(rows: Record<string, string>[], delimiter = ",", blank = false) {
    return { filename: "jadwal.csv", contentBase64: Buffer.from([ROOM_SCHEDULE_IMPORT_COLUMNS.join(delimiter), ...(blank ? [""] : []), ...rows.map(r => ROOM_SCHEDULE_IMPORT_COLUMNS.map(c => `"${(r[c] ?? "").replaceAll('"', '""')}"`).join(delimiter))].join("\r\n")).toString("base64") };
}
async function http(path: string, body?: unknown, who = owner, permissions = grants, method = body === undefined ? "GET" : "POST") {
    const key = randomUUID(); keys.push(key);
    const r = await fetch(url + path, { method, headers: { "content-type": "application/json", "x-user": String(who), "x-perms": permissions.join(","), "idempotency-key": key }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: r.status, body: await r.json() as { data: unknown; error?: { code: string; details?: { message: string }[] } } };
}
const count = async (table: "room_fixed_schedules" | "booking_slots") => Number((await kueri<{ n: string }>(`SELECT count(*)::text n FROM ${table} WHERE ${table === "booking_slots" ? "resource_type='room' AND resource_id" : "room_id"}=${room}`))[0]?.n);

it("PR-03-35/38 acceptance memerlukan PostgreSQL", () => expect(process.env["DATABASE_URL"]).toBeTruthy());
describe.skipIf(!process.env["DATABASE_URL"])("PR-03-35/38 — impor jadwal dan durasi", () => {
    beforeAll(async () => {
        dbmate("up");
        oldBlockThreshold = (await kueri<{ value: unknown }>("SELECT value FROM system_settings WHERE key='denda.ambang_blokir'"))[0]?.value;
        await kueri("UPDATE system_settings SET value='100000000' WHERE key='denda.ambang_blokir'");
        const users = await kueri<{ id: string }>(`INSERT INTO users(nama,email,password_hash,nip_nis,role_id,status,must_change_password) SELECT 'Petugas impor','si-${tag}-'||n||'@uji.test','x','SI${tag}'||n,id,'AKTIF',false FROM roles CROSS JOIN generate_series(1,2)n WHERE kode='R-02' RETURNING id::text`);
        owner = Number(users[0]!.id); other = Number(users[1]!.id);
        building = (await kueri<{ id: string }>(`INSERT INTO buildings(nama,kode) VALUES ('Gedung impor jadwal','SB${tag}') RETURNING id::text`))[0]!.id;
        area = (await kueri<{ id: string }>(`INSERT INTO areas(nama,kode,building_id) VALUES ('Area impor jadwal','SA${tag}',${building}) RETURNING id::text`))[0]!.id;
        room = (await kueri<{ id: string }>(`INSERT INTO rooms(nama,kode,area_id,jenis,status,dapat_direservasi,kapasitas) VALUES ('Ruang impor jadwal','${code}',${area},'KELAS','AKTIF',true,40) RETURNING id::text`))[0]!.id;
        rule = (await kueri<{ id: string }>(`INSERT INTO approval_rules(jenis_pengajuan,kondisi,prioritas,terminal_on_exhausted_escalation) VALUES ('RESERVASI_RUANGAN','{"field":"room_id","op":"in","value":[${room}]}',99,'hold_and_alert') RETURNING id::text`))[0]!.id;
        await kueri(`INSERT INTO approval_rule_steps(rule_id,urutan,approver_type,approver_user_id,sla_jam,on_sla_breach) VALUES (${rule},1,'user',${other},8,'remind')`);
        oldYear = (await kueri<{ id: string }>("SELECT id::text FROM academic_years WHERE is_active"))[0]?.id ?? null;
        await kueri(`BEGIN; UPDATE academic_years SET is_active=false WHERE is_active; INSERT INTO academic_years(nama,tanggal_mulai,tanggal_selesai,is_active) VALUES ('SJ${tag}','2027-07-01','2028-06-30',true); COMMIT`);
        await kueri(`INSERT INTO holidays(tanggal,nama,jenis) VALUES ('2027-10-04','SJ${tag}','SEKOLAH') ON CONFLICT(tanggal) DO NOTHING`);
        year = (await kueri<{ id: string }>(`SELECT id::text FROM academic_years WHERE nama='SJ${tag}'`))[0]!.id;
        const app = express();
        app.use((req, res, next) => { setAuthContext(res, ctx(Number(req.header("x-user")), false)); setAuthContext(res, createAuthContext({ userId: Number(req.header("x-user")), roleCode: "R-02", scopes: new Map((req.header("x-perms") ?? "").split(",").filter(Boolean).map(p => [p, "all"] as const)) })); setAmr(res, ["pwd", AMR_OTP]); next(); });
        app.use(createApp({ appBaseUrl: "https://sigm4.uji.test", security: { objectStorageOrigin: "http://minio:9000" }, health: new HealthRegistry(30).register(fcmCheck(null)), limiter: { hit: async () => ({ lolos: true, batas: 1000, sisa: 999, resetDetik: 60 }) }, logger: new Logger({ clock, tulis: () => undefined }), clock, db: getDb(), auth: authPalsu() }));
        server = createServer(app); await new Promise<void>(r => server.listen(0, "127.0.0.1", r)); url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
    });
    async function clean() {
        vi.restoreAllMocks();
        await kueri(`DELETE FROM notifications WHERE user_id IN (${owner},${other})`);
        await kueri(`DELETE FROM approval_steps WHERE instance_id IN (SELECT id FROM approval_instances WHERE pemohon_id IN (${owner},${other})); DELETE FROM approval_instances WHERE pemohon_id IN (${owner},${other})`);
        await kueri(`DELETE FROM booking_slots WHERE resource_type='room' AND resource_id=${room}`);
        await kueri(`DELETE FROM reservations WHERE room_id=${room} AND parent_id IS NOT NULL; DELETE FROM reservations WHERE room_id=${room}`);
        if (keys.length) { await kueri(`DELETE FROM idempotency_keys WHERE key IN (${keys.map(k => `'${k}'`).join(",")})`); keys.length = 0; }
        await kueri(`DELETE FROM room_fixed_schedules WHERE room_id=${room}`);
        await kueri(`DELETE FROM room_manual_blocks WHERE room_id=${room}`);
        await kueri(`DELETE FROM room_schedule_import_jobs WHERE created_by IN (${owner},${other})`);
        await kueri(`UPDATE system_settings SET value='12',updated_by=NULL WHERE key='reservasi.durasi_maksimum_jam'`);
    }
    beforeEach(clean);
    afterAll(async () => {
        await clean(); await new Promise<void>(r => server.close(() => r()));
        if (oldBlockThreshold !== undefined) await kueri(`UPDATE system_settings SET value='${JSON.stringify(oldBlockThreshold)}' WHERE key='denda.ambang_blokir'`);
        await kueri(`DELETE FROM approval_rule_steps WHERE rule_id=${rule}; DELETE FROM approval_rules WHERE id=${rule}`);
        await kueri(`DELETE FROM rooms WHERE id=${room}; DELETE FROM areas WHERE id=${area}; DELETE FROM buildings WHERE id=${building}`);
        await kueri(`BEGIN; DELETE FROM academic_years WHERE id=${year}; ${oldYear ? `UPDATE academic_years SET is_active=true WHERE id=${oldYear};` : ""} COMMIT`);
        await kueri(`DELETE FROM holidays WHERE nama='SJ${tag}'`);
        await kueri(`DELETE FROM users WHERE id IN (${owner},${other})`);
    });
    it.each([",", ";"])("CSV %s mempertahankan nomor baris, memisahkan galat, melewati libur", async delimiter => {
        const j = (await service().submit(ctx(), file([row(), row({ hari: "xyz" }), row({ kode_ruangan: "UNKNOWN" }), row({ jam_mulai: "18:00", jam_selesai: "19:00" }), row({ berlaku_sampai: "2029-01-01" })], delimiter, true))).job;
        expect(j).toMatchObject({ status: "SELESAI", total_baris: 5, sukses: 1, gagal: 4 });
        expect(j.laporan_gagal.map(r => r.baris)).toEqual([4, 5, 6, 7]); expect(await count("room_fixed_schedules")).toBe(1); expect(await count("booking_slots")).toBeGreaterThan(0);
        expect(await kueri(`SELECT id FROM booking_slots WHERE resource_type='room' AND resource_id=${room} AND (lower(slot_range) AT TIME ZONE 'Asia/Jakarta')::date='2027-10-04'`)).toHaveLength(0);
        expect((await kueri(`SELECT berkas FROM room_schedule_import_jobs WHERE id=${j.id}`))[0]).toEqual({ berkas: null });
        expect(await kueri(`SELECT id FROM activity_logs WHERE aksi='ROOM_SCHEDULE_IMPORT_ROW_PROCESSED' AND entitas_id='${j.id}'`)).toHaveLength(5);
    });
    it("dua unggahan hash identik hanya menghasilkan satu job dan jadwal", async () => {
        const results = await Promise.all([service().submit(ctx(), file([row()])), service().submit(ctx(), file([row()]))]);
        expect(new Set(results.map(r => r.job.id)).size).toBe(1); expect(results.map(r => r.replay).sort()).toEqual([false, true]); expect(await count("room_fixed_schedules")).toBe(1);
    });
    it("unggahan berbeda bersamaan dan unggahan setelah 24 jam tidak menggandakan jadwal aktif", async () => {
        const results = await Promise.all([service().submit(ctx(), file([row()])), service().submit(ctx(other), file([row()], ";"))]);
        expect(results.reduce((n, r) => n + r.job.sukses, 0)).toBe(1); expect(await count("room_fixed_schedules")).toBe(1);
        const later = new FixedClock(new Date(clock.now().getTime() + 25 * 3600000));
        const r = await service(later).submit(ctx(), file([row()])); expect(r.replay).toBe(false); expect(r.job.laporan_gagal[0]?.pesan).toContain("duplikat");
    });
    it("jadwal dan slot rollback ketika progres gagal; replay melanjutkan cursor tanpa duplikasi", async () => {
        vi.spyOn(RoomScheduleImportRepository.prototype, "record").mockRejectedValueOnce(new Error("Cursor gagal"));
        await expect(service().submit(ctx(), file([row()]))).rejects.toThrow("Cursor gagal");
        expect(await count("room_fixed_schedules")).toBe(0); expect(await count("booking_slots")).toBe(0);
        const result = await service().submit(ctx(), file([row()])); expect(result.replay).toBe(true); expect(result.job.sukses).toBe(1);
    });
    it("bentrok blokade gagal per baris tanpa membatalkan atau melepas slot", async () => {
        await service().submit(ctx(), file([row()])); const slots = await count("booking_slots");
        const result = await service().submit(ctx(), file([row({ label_kegiatan: "Bentrok" }), row({ hari: "Selasa" })]));
        expect(result.job).toMatchObject({ sukses: 1, gagal: 1 }); expect(result.job.laporan_gagal[0]?.pesan).toContain("beririsan"); expect(await count("booking_slots")).toBeGreaterThan(slots);
        expect(await kueri(`SELECT id FROM booking_slots WHERE resource_type='room' AND resource_id=${room} AND status='RELEASED'`)).toHaveLength(0);
    });
    it("header hilang/duplikat dan berkas bukan CSV ditolak sebelum job dibuat", async () => {
        for (const text of ["kode_ruangan\nX", "kode_ruangan,kode_ruangan\nX,Y", ""]) await expect(service().submit(ctx(), { filename: "bad.csv", contentBase64: Buffer.from(text).toString("base64") })).rejects.toMatchObject({ kode: "INVALID_REQUEST" });
        await expect(service().submit(ctx(), { ...file([row()]), filename: "bad.xlsx" })).rejects.toMatchObject({ kode: "INVALID_REQUEST" });
        expect(await kueri(`SELECT id FROM room_schedule_import_jobs WHERE created_by=${owner}`)).toHaveLength(0);
    });
    it("HTTP template/unggah/status sesuai kontrak; hanya pengunggah dan permission yang sah", async () => {
        const f = file([row()]); const result = await http("/room-fixed-schedules/import", { filename: f.filename, content_base64: f.contentBase64 });
        expect(result.status).toBe(200); const j = RoomScheduleImportResponseSchema.parse(result.body).data;
        expect((await http(`/room-fixed-schedules/import/${j.id}`, undefined, other)).status).toBe(404);
        expect((await http(`/room-fixed-schedules/import/${j.id}`, undefined, owner, [])).status).toBe(403);
        expect((await http("/room-fixed-schedules/import", { filename: "bad.txt", content_base64: "!!!" })).status).toBe(400);
        const template = await fetch(url + "/room-fixed-schedules/import/template", { headers: { "x-user": String(owner), "x-perms": grants.join(",") } });
        expect(template.status).toBe(200); expect(template.headers.get("content-type")).toContain("text/csv"); expect(await template.text()).toContain("2028-06-30");
    });
    it("201 baris memakai outbox, runner retry aman dan NT-56 dideduplikasi", async () => {
        const f = file(Array.from({ length: 201 }, () => row()));
        const response = await http("/room-fixed-schedules/import", { filename: f.filename, content_base64: f.contentBase64 }); expect(response.status).toBe(202);
        const j = RoomScheduleImportResponseSchema.parse(response.body).data;
        expect(j.status).toBe("MENUNGGU"); expect(await count("room_fixed_schedules")).toBe(0);
        const runner = new RoomScheduleImportRunner(getDb(), { load: async (): Promise<EffectivePermissions> => ({ roleId: "2", roleCode: "R-02", roleVersion: "1", userStatus: "AKTIF", scopes: new Map([["reservation.fixed_schedule", "all"]]) }) }, service());
        await runner.run({ job_id: j.id, oleh: owner }, false); await runner.run({ job_id: j.id, oleh: owner }, true);
        expect(await service().get(ctx(), Number(j.id))).toMatchObject({ sukses: 1, gagal: 200, status: "SELESAI" });
        const events = await kueri<{ id: string; payload: unknown }>(`SELECT id::text,payload FROM event_outbox WHERE aggregate_type='RoomScheduleImportJob' AND aggregate_id='${j.id}' AND event_name='RoomScheduleImportCompleted'`);
        expect(events).toHaveLength(1);
        const registry = new EventHandlerRegistry(); pasangKonsumenNotifikasi(registry, { db: getDb, clock, ctx: () => createSystemAuthContext("test-schedule-import") });
        const e: OutboxEvent = { id: events[0]!.id, name: "RoomScheduleImportCompleted", aggregateType: "RoomScheduleImportJob", aggregateId: j.id, payload: events[0]!.payload, actorId: String(owner), requestId: null, occurredAt: clock.now(), attempts: 0 };
        for (const handle of registry.handlersFor(e.name)) { await handle(e); await handle(e); }
        const notifications = await kueri<{ deep_link: string }>(`SELECT deep_link FROM notifications WHERE user_id=${owner} AND kode='NT-56'`);
        expect(notifications).toHaveLength(1); expect(notifications[0]?.deep_link).toContain(`/kalender-ruangan?kelola=true&impor=${j.id}`);
    });
    it("worker menutup pekerjaan tanpa membuat jadwal setelah izin dicabut", async () => {
        const j = (await service().submit(ctx(), file(Array.from({ length: 201 }, () => row())))).job;
        await new RoomScheduleImportRunner(getDb(), { load: async () => undefined }, service()).run({ job_id: j.id, oleh: owner }, true);
        expect(await service().get(ctx(), Number(j.id))).toMatchObject({ status: "GAGAL", sukses: 0 }); expect(await count("room_fixed_schedules")).toBe(0);
    });
    it("tepat 200 baris masih sinkron, seluruh galat baris tetap berakhir SELESAI", async () => {
        const f = file(Array.from({ length: 200 }, () => row({ hari: "INVALID" })));
        const response = await http("/room-fixed-schedules/import", { filename: f.filename, content_base64: f.contentBase64 });
        expect(response.status).toBe(200); expect(RoomScheduleImportResponseSchema.parse(response.body).data).toMatchObject({ status: "SELESAI", total: 200, gagal: 200, sukses: 0 });
    });
    it("percobaan sistem terakhir menutup GAGAL, menghapus berkas dan mempertahankan cursor", async () => {
        const j = (await service().submit(ctx(), file(Array.from({ length: 201 }, () => row())))).job;
        vi.spyOn(RoomScheduleImportRepository.prototype, "record").mockRejectedValueOnce(new Error("Gangguan sistem"));
        const runner = new RoomScheduleImportRunner(getDb(), { load: async (): Promise<EffectivePermissions> => ({ roleId: "2", roleCode: "R-02", roleVersion: "1", userStatus: "AKTIF", scopes: new Map([["reservation.fixed_schedule", "all"]]) }) }, service());
        await expect(runner.run({ job_id: j.id, oleh: owner }, true)).rejects.toThrow("Gangguan sistem");
        expect(await service().get(ctx(), Number(j.id))).toMatchObject({ status: "GAGAL", baris_terproses: 0, sukses: 0 }); expect(await count("room_fixed_schedules")).toBe(0);
        expect((await kueri(`SELECT berkas FROM room_schedule_import_jobs WHERE id=${j.id}`))[0]).toEqual({ berkas: null });
    });
    it("API menyamarkan rincian tepat 30 hari sebelum cleanup; cleanup mempertahankan ringkasan", async () => {
        const j = (await service().submit(ctx(), file([row({ hari: "INVALID" })]))).job;
        const before = service(new FixedClock(new Date(clock.now().getTime() + 30 * 86400000 - 1))); expect((await before.get(ctx(), Number(j.id))).laporan_gagal).toHaveLength(1);
        const expiredClock = new FixedClock(new Date(clock.now().getTime() + 30 * 86400000));
        expect(await service(expiredClock).get(ctx(), Number(j.id))).toMatchObject({ report_expired: true, laporan_gagal: [], nama_berkas: `impor-${j.id}` });
        expect(await withTransaction(createSystemAuthContext("schedule-retention"), s => purgeRoomScheduleImportReports(s, expiredClock, audit), getDb())).toBe(1);
        expect((await kueri(`SELECT laporan_gagal,berkas,sukses,gagal FROM room_schedule_import_jobs WHERE id=${j.id}`))[0]).toEqual({ laporan_gagal: [], berkas: null, sukses: 0, gagal: 1 });
    });
    const reservation = (end: string, recurring = false) => ({ room_id: Number(room), waktu_mulai: "2027-09-07T08:00:00+07:00", waktu_selesai: `2027-09-07T${end}:00+07:00`, nama_kegiatan: "Rapat", jenis_kegiatan: "RAPAT", jumlah_peserta: 10, ...(recurring ? { pengulangan: { hari: [2], sampai: "2027-09-21" } } : {}) });
    it("batas baru tidak mengubah reservasi lama; bentrok impor tidak membatalkan reservasi menunggu", async () => {
        const created = await http("/reservations", reservation("10:00")); expect(created.status, JSON.stringify(created.body)).toBe(201);
        const id = (created.body.data as { id: string }).id;
        await kueri("UPDATE system_settings SET value='1' WHERE key='reservasi.durasi_maksimum_jam'");
        const result = await service().submit(ctx(), file([row({ hari: "Selasa", jam_mulai: "09:00", jam_selesai: "10:00" }), row({ hari: "Rabu" })]));
        expect(result.job).toMatchObject({ sukses: 1, gagal: 1 });
        expect(result.job.laporan_gagal[0]?.pesan).toContain("reservasi");
        expect((await kueri(`SELECT status,extract(epoch from (waktu_selesai-waktu_mulai))/3600 AS jam FROM reservations WHERE id=${id}`))[0]).toMatchObject({ status: "MENUNGGU_PERSETUJUAN" });
        expect((await http("/reservations/preview", reservation("10:00"))).body.data).toMatchObject({ tanggal: expect.arrayContaining([expect.objectContaining({ keadaan: "TIDAK_SAH" })]) });
        expect(await kueri(`SELECT id FROM booking_slots WHERE reservation_id=${id} AND status='TENTATIVE'`)).toHaveLength(1);
    });
    it("durasi bawaan 12 dan rentang parameter 1–24 disimpan serta divalidasi M-20", async () => {
        const p = (await kueri<{ value: number; nilai_min: string; nilai_maks: string }>("SELECT value,nilai_min,nilai_maks FROM system_settings WHERE key='reservasi.durasi_maksimum_jam'"))[0]!;
        expect(p).toEqual({ value: 12, nilai_min: "1", nilai_maks: "24" });
        for (const value of [0, 25, 1.5]) expect((await http("/settings", { settings: { "reservasi.durasi_maksimum_jam": value } }, owner, grants, "PUT")).status).toBe(422);
        for (const value of [1, 24, 2]) expect((await http("/settings", { settings: { "reservasi.durasi_maksimum_jam": value } }, owner, grants, "PUT")).status).toBe(200);
    });
    it.each([false, true])("pratinjau dan pengajuan durasi melampaui batas (berulang=%s) ditolak; tepat batas tersedia", async recurring => {
        await kueri("UPDATE system_settings SET value='2' WHERE key='reservasi.durasi_maksimum_jam'");
        const preview = await http("/reservations/preview", reservation("10:30", recurring));
        expect(preview.status, JSON.stringify(preview.body)).toBe(200); expect(preview.body.data).toMatchObject({ tanggal: expect.arrayContaining([expect.objectContaining({ keadaan: "TIDAK_SAH", alasan: "Durasi reservasi melebihi maksimum 2 jam per kemunculan." })]) });
        const result = await http("/reservations", reservation("10:30", recurring)); expect(result.status).toBe(422); expect(result.body.error?.details?.[0]?.message).toContain("maksimum 2 jam");
        expect((await http("/reservations/preview", reservation("10:00", recurring))).body.data).toMatchObject({ tanggal: expect.arrayContaining([expect.objectContaining({ keadaan: "TERSEDIA" })]) });
        // Jadwal tetap tidak mengikuti batas reservasi 2 jam.
        expect((await service().submit(ctx(), file([row({ jam_mulai: "10:00", jam_selesai: "14:00" })]))).job.sukses).toBe(1);
    });
});
