import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { sql } from "kysely";
import { createApp } from "../../src/api/index.js";
import { createAuthContext, setAuthContext, setAmr } from "../../src/shared/auth/index.js";
import type { AuthContext } from "../../src/shared/auth/index.js";
import { createSystemAuthContext } from "../../src/shared/auth/system-context.js";
import { FixedClock } from "../../src/shared/clock/index.js";
import { AuditLogger } from "../../src/shared/audit/index.js";
import { closeDb, getDb, withTransaction } from "../../src/shared/db/index.js";
import { HealthRegistry, Logger } from "../../src/shared/observability/index.js";
import { SessionStore } from "../../src/shared/auth/session-store.js";
import { UserService, PseudonymizationService, studentObligations } from "../../src/modules/m02-users/index.js";
import { AssetImportService } from "../../src/modules/m04-assets/services/asset-import.service.js";
import { UserImportService } from "../../src/modules/m02-users/services/user-import.service.js";
import { changeFine } from "../../src/modules/m09-loans/services/fine-management.service.js";
import { createLoanRepository } from "../../src/modules/m09-loans/repositories/loan.repository.js";
import { registry as jobs } from "../../src/worker/index.js";
import { runPersonalDataRetention, PERSONAL_DATA_RETENTION_JOB } from "../../src/worker/personal-data-retention.js";
import { jalankanKelulusan } from "../../src/worker/student-graduation.js";
import { dbmate } from "../helpers/db.js";
import { authPalsu } from "../helpers/auth.js";

const clock = new FixedClock(new Date("2026-10-15T03:00:00Z")), audit = new AuditLogger({ clock });
const system = createSystemAuthContext(PERSONAL_DATA_RETENTION_JOB);
const request = { alasan: "Permintaan penghapusan telah diverifikasi.", referensi_permintaan: "DP-2026-001", metode_verifikasi: "KARTU_IDENTITAS_TATAP_MUKA" as const };
const users: string[] = [], marker = randomUUID();
let admin: AuthContext, peer: AuthContext, server: Server | undefined, base = "", room = "", category = "", serial = 30000;
let building = "", area = "", graduationYear = "", graduationClass = "";
const id = async (query: ReturnType<typeof sql>) => (await query.execute(getDb())).rows[0] as { id: string };
async function user(role = "R-07", inactive = false, date: string | null = null) {
    const roleId = (await getDb().selectFrom("roles").select("id").where("kode", "=", role).executeTakeFirstOrThrow()).id;
    const u = await getDb().insertInto("users").values({ nama: `Nama Asli ${marker}`, email: `${randomUUID()}@sekolah.test`, nip_nis: randomUUID(), password_hash: "hash-lama",
        role_id: roleId, status: inactive ? "NONAKTIF" : "AKTIF", must_change_password: false, consent_guardian_at: clock.now(), telepon: "0812345678",
        deactivated_at: date ? new Date(date) : null }).returning("id").executeTakeFirstOrThrow();
    users.push(u.id); return Number(u.id);
}
const ctx = (uid: number, role = "R-01") => createAuthContext({ userId: uid, roleCode: role, scopes: new Map([["user.create", "all"], ["user.update", "all"], ["user.view", "all"], ["fine.manage", "all"], ["fine.view", "all"], ["loan.view", "all"], ["asset.create", "all"]]) });
const privacy = (logger = audit) => new PseudonymizationService(getDb(), clock, logger);
const account = (uid: number) => getDb().selectFrom("users").selectAll().where("id", "=", String(uid)).executeTakeFirstOrThrow();
async function loan(uid: number, open = true) {
    const n = ++serial;
    const a = await id(sql`insert into assets(kode_barang,nama,category_id,tahun_perolehan,sumber_perolehan,room_id,kondisi,status) values(${randomUUID()},'Barang uji',${category}::bigint,2026,'PEMBELIAN',${room}::bigint,'BAIK','TERSEDIA') returning id::text`);
    const r = await id(sql`insert into reservations(nomor,jenis,pemohon_id,room_id,nama_kegiatan,jenis_kegiatan,jumlah_peserta,waktu_mulai,waktu_selesai,status) values(${`RSV-BR-2026-${n}`},'ASET',${uid},${room}::bigint,'Uji','TEST',1,'2026-10-01T01:00:00Z','2026-10-02T01:00:00Z','SELESAI') returning id::text`);
    const l = await id(sql`insert into loans(nomor,reservation_id,peminjam_id,petugas_serah_id,nama_penerima,tanggal_pinjam,tanggal_jatuh_tempo,status,tanggal_kembali) values(${`PJM-2026-${n}`},${r.id}::bigint,${uid},${admin.userId},'Penerima bukti','2026-10-01T01:00:00Z','2026-10-02T01:00:00Z',${open ? "DIPINJAM" : "DIKEMBALIKAN"}::loan_status,${open ? null : clock.now()}) returning id::text`);
    const s = await id(sql`insert into booking_slots(resource_type,resource_id,origin,status,slot_range,reservation_id,loan_id) values('asset',${a.id}::bigint,'loan','RELEASED',tstzrange('2026-10-01T01:00:00Z','2026-10-02T01:00:00Z','[)'),${r.id}::bigint,${l.id}::bigint) returning id::text`);
    const i = await id(sql`insert into loan_items(loan_id,asset_id,allocated_asset_id,slot_id,kondisi_awal,status_kembali,kondisi_akhir,tanggal_kembali) values(${l.id}::bigint,${a.id}::bigint,${a.id}::bigint,${s.id}::bigint,'BAIK',${open ? "BELUM_KEMBALI" : "DIKEMBALIKAN"},${open ? null : "BAIK"}::asset_condition,${open ? null : clock.now()}) returning id::text`);
    return { id: l.id, item: i.id, asset: a.id, nomor: `PJM-2026-${n}` };
}
async function fine(uid: number, status: "BELUM_DIBAYAR" | "DIBEBASKAN_SEBAGIAN" | "LUNAS" | "DIBEBASKAN" = "BELUM_DIBAYAR", pending = false) {
    const l = await loan(uid, false);
    const f = await id(sql`insert into fines(loan_item_id,loan_id,peminjam_id,jenis,jumlah,jumlah_sebelum_cap,menunggu_penetapan,status,jumlah_dibebaskan) values(${l.item}::bigint,${l.id}::bigint,${uid},${pending ? "GANTI_RUGI" : "KETERLAMBATAN"}::financial_obligation_type,${pending ? null : "100.00"}::numeric,${pending ? null : "100.00"}::numeric,${pending},${status}::fine_status,${status === "DIBEBASKAN_SEBAGIAN" ? 50 : status === "DIBEBASKAN" ? 100 : 0}) returning id::text`);
    return { ...l, fine: f.id };
}
async function send(path: string, body?: unknown, who = admin, method?: string) {
    const response = await fetch(base + path, { method: method ?? (body ? "POST" : "GET"), headers: { "content-type": "application/json", "x-user": String(who.userId), "x-role": who.roleCode, "x-permissions": [...who.permissions].join(",") }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, headers: response.headers, json: await response.json() as { data: Record<string, unknown>; error?: { message: string } } };
}
describe.skipIf(!process.env["DATABASE_URL"])("PR-05-09/26 — SL-04, pseudonimisasi dan retensi impor", () => {
    beforeAll(async () => {
        dbmate("up"); admin = ctx(await user("R-01")); peer = ctx(await user("R-01")); await user("R-01");
        const b = await id(sql`insert into buildings(nama,kode) values('Uji',${randomUUID()}) returning id::text`);
        building = b.id;
        const a = await id(sql`insert into areas(building_id,nama,kode) values(${b.id}::bigint,'Uji',${randomUUID()}) returning id::text`);
        area = a.id;
        room = (await id(sql`insert into rooms(area_id,nama,kode,jenis) values(${a.id}::bigint,'Uji',${marker},'GUDANG') returning id::text`)).id;
        category = (await id(sql`insert into asset_categories(nama,kode) values(${marker},${marker}) returning id::text`)).id;
        const app = createApp({ db: getDb(), clock, appBaseUrl: "https://sigm4.test", auth: authPalsu(), health: new HealthRegistry(), security: { objectStorageOrigin: "https://storage.test" }, logger: new Logger({ clock, tulis: () => undefined }), limiter: { hit: async () => ({ lolos: true, batas: 1000, sisa: 999, resetDetik: 60 }) } });
        const outer = express(); outer.use((req, res, next) => { setAuthContext(res, createAuthContext({ userId: Number(req.header("x-user")), roleCode: req.header("x-role") ?? "R-01", scopes: new Map((req.header("x-permissions") ?? "").split(",").filter(Boolean).map(p => [p, "all" as const])) })); setAmr(res, ["pwd", "otp"]); next(); }); outer.use(app);
        server = createServer(outer); await new Promise<void>(done => server!.listen(0, "127.0.0.1", done)); base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
    }, 120000);
    afterAll(async () => {
        await new Promise<void>(done => server ? server.close(() => done()) : done());
        try {
            if (!users.length) return;
            const ids = sql.join(users.map(u => sql`${u}::bigint`));
            await sql`delete from fine_actions where fine_id in(select id from fines where peminjam_id in(${ids}))`.execute(getDb());
            await sql`delete from compensation_proposals where fine_id in(select id from fines where peminjam_id in(${ids}))`.execute(getDb());
            await sql`delete from fines where peminjam_id in(${ids})`.execute(getDb());
            await sql`delete from loan_item_photos where loan_item_id in(select i.id from loan_items i join loans l on l.id=i.loan_id where l.peminjam_id in(${ids}))`.execute(getDb());
            await sql`delete from loan_items where loan_id in(select id from loans where peminjam_id in(${ids}))`.execute(getDb());
            await sql`delete from booking_slots where loan_id in(select id from loans where peminjam_id in(${ids}))`.execute(getDb());
            await sql`delete from loans where peminjam_id in(${ids})`.execute(getDb());
            await sql`delete from reservations where pemohon_id in(${ids})`.execute(getDb());
            await sql`delete from student_enrollments where user_id in(${ids})`.execute(getDb());
            await sql`delete from user_import_jobs where created_by in(${ids})`.execute(getDb());
            await sql`delete from asset_import_jobs where created_by in(${ids})`.execute(getDb());
            await sql`delete from password_reset_requests where user_id in(${ids})`.execute(getDb());
            await sql`delete from refresh_tokens where user_id in(${ids})`.execute(getDb());
            await sql`delete from users where id in(${ids}) and role_id<>(select id from roles where kode='R-01')`.execute(getDb());
            await sql`delete from stored_files where uploaded_by in(${ids})`.execute(getDb());
            await sql`delete from users where id in(${ids})`.execute(getDb());
            await sql`delete from assets where room_id=${room}::bigint`.execute(getDb());
            await sql`delete from asset_categories where id=${category}::bigint`.execute(getDb());
            if (room) await sql`delete from rooms where id=${room}::bigint`.execute(getDb());
            if (area) await sql`delete from areas where id=${area}::bigint`.execute(getDb());
            if (building) await sql`delete from buildings where id=${building}::bigint`.execute(getDb());
            if (graduationClass) await sql`delete from work_units where id=${graduationClass}::bigint`.execute(getDb());
            if (graduationYear) await sql`delete from academic_years where id=${graduationYear}::bigint`.execute(getDb());
        } finally { await closeDb(); }
    });
    it("pemeriksa nyata terdaftar di composition root API dan worker, jadwal 01:10 WIB", () => {
        expect(studentObligations.has("m09-loans")).toBe(true); expect(jobs.get(PERSONAL_DATA_RETENTION_JOB)?.cron).toBe("10 18 * * *");
    });
    it("backfill migration memakai bukti keputusan terakhir dan tidak memakai updated_at", async () => {
        const proof = await user("R-07", true, "2010-01-01T00:00:00Z"), unknown = await user("R-07", true, "2010-01-01T00:00:00Z"), resumed = await user("R-07", true, "2010-01-01T00:00:00Z");
        const write = async (uid: number, action: string, date: string) => withTransaction(admin, scope => new AuditLogger({ clock: new FixedClock(new Date(date)) }).write(scope, { modul: "m02-users", aksi: action, entitas: "users", entitasId: uid }), getDb());
        await write(proof, "USER_DEACTIVATED", "2026-10-01T01:00:00Z"); await write(resumed, "USER_DEACTIVATED", "2026-10-01T01:00:00Z"); await write(resumed, "USER_REACTIVATED", "2026-10-02T01:00:00Z");
        const before = (await sql<{ now: Date }>`select clock_timestamp() as now`.execute(getDb())).rows[0]!.now;
        const migration = readFileSync(new URL("../../migrations/0072_user_pseudonymization.sql", import.meta.url), "utf8");
        const update = migration.match(/UPDATE users u SET deactivated_at=coalesce\([\s\S]+?WHERE u.status='NONAKTIF';/)?.[0];
        if (!update) throw new Error("SQL backfill migration tidak ditemukan.");
        await sql.raw(update).execute(getDb());
        expect((await account(proof)).deactivated_at?.toISOString()).toBe("2026-10-01T01:00:00.000Z");
        for (const uid of [unknown, resumed]) expect((await account(uid)).deactivated_at!.getTime()).toBeGreaterThanOrEqual(before.getTime());
    });
    it("SL-04 memblokir pinjaman sebelum jatuh tempo/parsial dengan nomor spesifik", async () => {
        const uid = await user(), l = await loan(uid);
        const service = new UserService(getDb(), audit, undefined, clock);
        await expect(service.updateStatus(admin, uid, { status: "NONAKTIF", alasan: "Uji siklus akun." })).rejects.toThrow(l.nomor);
        await getDb().updateTable("loans").set({ status: "SEBAGIAN_DIKEMBALIKAN" }).where("id", "=", l.id).execute();
        expect((await send(`/users/${uid}/status`, { status: "NONAKTIF", alasan: "Lulus." }, admin, "PATCH")).json.error?.message).toContain(l.nomor);
        expect((await account(uid)).status).toBe("AKTIF");
    });
    it.each(["BELUM_DIBAYAR", "DIBEBASKAN_SEBAGIAN", "MENUNGGU_NOMINAL"])("SL-04 memblokir kewajiban %s tanpa ambang nominal", async status => {
        const uid = await user(), f = await fine(uid, status === "DIBEBASKAN_SEBAGIAN" ? status : "BELUM_DIBAYAR", status === "MENUNGGU_NOMINAL");
        await expect(new UserService(getDb(), audit, undefined, clock).updateStatus(admin, uid, { status: "NONAKTIF", alasan: "Uji siklus akun." })).rejects.toThrow(`#${f.fine}`);
    });
    it.each(["LUNAS", "DIBEBASKAN"] as const)("kewajiban %s tidak memblokir penonaktifan dan tanggal memakai Clock", async status => {
        const uid = await user(); await fine(uid, status);
        await new UserService(getDb(), audit, undefined, clock).updateStatus(admin, uid, { status: "NONAKTIF", alasan: "Uji siklus akun." });
        expect((await account(uid)).deactivated_at?.toISOString()).toBe(clock.now().toISOString());
    });
    it("kelulusan memakai pemeriksa yang sama; setelah lunas dapat dinonaktifkan", async () => {
        const uid = await user(), f = await fine(uid);
        const year = await id(sql`insert into academic_years(nama,tanggal_mulai,tanggal_selesai,is_active) values(${randomUUID()},'2025-01-01','2025-12-31',not exists(select 1 from academic_years where is_active)) returning id::text`);
        const unit = await id(sql`insert into work_units(nama,kode,jenis,status) values('Kelas Uji',${randomUUID()},'KELAS','AKTIF') returning id::text`);
        graduationYear = year.id; graduationClass = unit.id;
        await sql`insert into student_enrollments(user_id,academic_year_id,kelas_id,lulus) values(${uid},${year.id}::bigint,${unit.id}::bigint,true)`.execute(getDb());
        expect((await jalankanKelulusan(getDb(), clock)).rincian).toMatchObject({ terblokir: 1, dinonaktifkan: 0 });
        await getDb().updateTable("fines").set({ status: "LUNAS" }).where("id", "=", f.fine).execute();
        expect((await jalankanKelulusan(getDb(), clock)).rincian).toMatchObject({ dinonaktifkan: 1 });
    });
    it("endpoint ketat: Administrator, akun lain/nonaktif, input lengkap dan grant terkini", async () => {
        const active = await user(), inactive = await user("R-02", true);
        expect((await send(`/users/${inactive}/pseudonymize`, {})).status).toBe(400);
        expect((await send(`/users/${active}/pseudonymize`, request)).status).toBe(422);
        expect((await send(`/users/${inactive}/pseudonymize`, { ...request, paksa: true })).status).toBe(400);
        await expect(privacy().request(admin, admin.userId, request)).rejects.toThrow();
        await expect(privacy().request(ctx(peer.userId, "R-02"), inactive, request)).rejects.toThrow();
        const own = createAuthContext({ userId: peer.userId, roleCode: "R-01", scopes: new Map([["user.update", "own"]]) });
        await expect(privacy().request(own, inactive, request)).rejects.toThrow();
        const fake = ctx(active); await expect(privacy().request(fake, inactive, request)).rejects.toThrow();
        const r = await send(`/users/${inactive}/pseudonymize`, request); expect(r.status).toBe(200); expect(r.headers.get("cache-control")).toContain("no-store");
    });
    it("identitas satu arah; sesi/pemulihan dicabut, transaksi/foto/audit lama tetap", async () => {
        const uid = await user("R-02", true), l = await fine(uid, "LUNAS"), family = randomUUID();
        const photo = await id(sql`insert into stored_files(object_key,mime,ukuran,owner_type,owner_id,uploaded_by,scan_status) values(${randomUUID()},'image/jpeg',100,'USER_PHOTO',${uid},${admin.userId},'CLEAN') returning id::text`);
        await getDb().updateTable("users").set({ foto_file_id: photo.id, totp_secret_enc: Buffer.from("ciphertext"), totp_enabled_at: clock.now() }).where("id", "=", String(uid)).execute();
        await sql`insert into refresh_tokens(user_id,family_id,token_hash,platform,issued_at,expires_at) values(${uid},${family},${Buffer.alloc(32, 1)},'WEB',${clock.now()},${new Date(clock.now().getTime() + 3600000)})`.execute(getDb());
        await sql`insert into password_reset_requests(user_id,diminta_pada) values(${uid},${clock.now()})`.execute(getDb());
        await withTransaction(admin, scope => audit.write(scope, { modul: "m02-users", aksi: "USER_UPDATED", entitas: "users", entitasId: uid, nilaiSesudah: { nama: "Identitas audit lama" } }), getDb());
        const before = await account(uid), result = await privacy().request(admin, uid, request), after = await account(uid);
        expect(result.id).toBe(String(uid)); expect(after).toMatchObject({ nama: `Pengguna Terhapus #${uid}`, email: `deleted+${uid}@invalid.local`, nip_nis: null, telepon: null, work_unit_id: null, unit_kerja: null, status: "NONAKTIF", totp_secret_enc: null, foto_file_id: photo.id });
        expect(after.password_hash).not.toBe(before.password_hash); expect(await new SessionStore(getDb()).aktif(uid, family)).toBe(false);
        const login = await send("/auth/login", { email: after.email, password: "SandiLama-123!", platform: "WEB" });
        expect(login.status).toBe(401); expect((await account(uid)).failed_login_count).toBe(0);
        expect(await getDb().selectFrom("password_history").select("id").where("user_id", "=", String(uid)).execute()).toHaveLength(0);
        expect((await getDb().selectFrom("password_reset_requests").select(["status", "diproses_oleh"]).where("user_id", "=", String(uid)).executeTakeFirstOrThrow()).status).toBe("DITOLAK");
        expect(await getDb().selectFrom("loans").select("nama_penerima").where("id", "=", l.id).executeTakeFirstOrThrow()).toEqual({ nama_penerima: "Penerima bukti" });
        expect(await getDb().selectFrom("stored_files").select("id").where("id", "=", photo.id).executeTakeFirstOrThrow()).toEqual({ id: photo.id });
        expect((await getDb().selectFrom("activity_logs").select("nilai_sesudah").where("entitas_id", "=", String(uid)).where("aksi", "=", "USER_UPDATED").executeTakeFirstOrThrow()).nilai_sesudah).toEqual({ nama: "Identitas audit lama" });
        const repeat = await privacy().request(peer, uid, request); expect(repeat).toEqual(result);
        expect(await getDb().selectFrom("activity_logs").select("id").where("entitas_id", "=", String(uid)).where("aksi", "=", "USER_PSEUDONYMIZED").execute()).toHaveLength(1);
        await expect(getDb().updateTable("users").set({ status: "AKTIF", pseudonymized_at: null }).where("id", "=", String(uid)).execute()).rejects.toThrow("tidak dapat");
        await expect(new UserService(getDb(), audit, undefined, clock).updateStatus(admin, uid, { status: "AKTIF", alasan: undefined })).rejects.toThrow("dipseudonimkan");
        await expect(withTransaction(admin, scope => changeFine(scope, Number(l.fine), "reopen", { alasan: "Uji." }, clock, audit), getDb())).rejects.toThrow("dipseudonimkan");
    });
    it("gagal audit me-rollback identitas dan pencabutan sesi", async () => {
        const uid = await user("R-02", true), before = await account(uid), failing = new AuditLogger({ clock });
        vi.spyOn(failing, "write").mockRejectedValueOnce(new Error("audit gagal"));
        await expect(privacy(failing).request(admin, uid, request)).rejects.toThrow("audit gagal");
        expect(await account(uid)).toEqual(before);
    });
    it("SL-04 terbatas siswa; pseudonimisasi memeriksa pinjaman role lain juga", async () => {
        const uid = await user("R-02"), l = await loan(uid);
        await new UserService(getDb(), audit, undefined, clock).updateStatus(admin, uid, { status: "NONAKTIF", alasan: "Uji." });
        await expect(privacy().request(admin, uid, request)).rejects.toThrow(l.nomor);
    });
    it("check-out menunggu kunci akun yang juga dipakai penonaktifan/pseudonimisasi", async () => {
        const uid = await user();
        await withTransaction(admin, async scope => {
            await scope.tx.selectFrom("users").select("id").where("id", "=", String(uid)).forUpdate().execute();
            await expect(withTransaction(admin, async other => {
                await sql`set local lock_timeout='100ms'`.execute(other.tx);
                await createLoanRepository(other.tx).borrower(other.ctx, uid);
            }, getDb())).rejects.toMatchObject({ code: "55P03" });
        }, getDb());
    });
    it("buka kembali denda bersamaan dengan pseudonimisasi tidak menghidupkan kewajiban baru", async () => {
        const uid = await user("R-02", true), f = await fine(uid, "LUNAS"), delayed = new AuditLogger({ clock });
        let ready!: () => void, release!: () => void;
        const entered = new Promise<void>(done => { ready = done; }), resume = new Promise<void>(done => { release = done; });
        const original = delayed.write.bind(delayed);
        vi.spyOn(delayed, "write").mockImplementation(async (scope, entry) => { ready(); await resume; return original(scope, entry); });
        const erasing = privacy(delayed).request(admin, uid, request); await entered;
        const reopening = withTransaction(admin, scope => changeFine(scope, Number(f.fine), "reopen", { alasan: "Uji race." }, clock, audit), getDb()).catch((error: unknown) => error);
        release(); await erasing;
        expect(await reopening).toMatchObject({ message: expect.stringContaining("dipseudonimkan") });
        expect((await getDb().selectFrom("fines").select("status").where("id", "=", f.fine).executeTakeFirstOrThrow()).status).toBe("LUNAS");
    });
    it("retensi tepat dua tahun WIB, akun baru/role lain dikecualikan dan aktivasi ulang mereset tanggal", async () => {
        const due = await user("R-07", true, "2024-10-15T10:00:00+07:00"), future = await user("R-07", true, "2024-10-15T10:00:00.001+07:00"), staff = await user("R-02", true, "2020-01-01T00:00:00Z");
        const blocked = await user("R-07", true, "2020-01-01T00:00:00Z"); await fine(blocked);
        const reset = await user("R-07", true, "2020-01-01T00:00:00Z"), service = new UserService(getDb(), audit, undefined, clock);
        await service.updateStatus(admin, reset, { status: "AKTIF", alasan: undefined }); expect((await account(reset)).deactivated_at).toBeNull();
        await service.updateStatus(admin, reset, { status: "NONAKTIF", alasan: "Uji siklus akun." });
        await runPersonalDataRetention(getDb(), clock);
        expect((await account(due)).pseudonymized_at).not.toBeNull();
        for (const uid of [future, staff, blocked, reset]) expect((await account(uid)).pseudonymized_at).toBeNull();
        expect(await privacy().automatic(system)).toMatchObject({ dipseudonimkan: 0 });
    });
    it("30 hari: API menutup kedua laporan sebelum cleanup; worker mempertahankan hitungan dan melewati job berjalan", async () => {
        const done = new Date(clock.now().getTime() - 30 * 86400000), recent = new Date(done.getTime() + 1);
        const u = await id(sql`insert into user_import_jobs(file_hash,nama_berkas,status,total_baris,baris_terproses,sukses,gagal,laporan_gagal,selesai_pada,created_by,berkas) values(${randomUUID()},'email-pribadi.csv','GAGAL',2,2,1,1,'[{"baris":2,"email":"rahasia@sekolah.test","pesan":"email pribadi"}]',${done},${admin.userId},${Buffer.from("rahasia")}) returning id::text`);
        const a = await id(sql`insert into asset_import_jobs(file_hash,nama_berkas,status,total_baris,baris_terproses,sukses,gagal,unit_dibuat,laporan_gagal,selesai_pada,created_by,berkas) values(${randomUUID()},'aset-pribadi.csv','GAGAL',2,2,1,1,1,'[{"baris":2,"nama_barang":"rahasia","pesan":"data pribadi","data":{"email":"rahasia"}}]',${done},${admin.userId},null) returning id::text`);
        const live = await id(sql`insert into user_import_jobs(file_hash,nama_berkas,status,total_baris,selesai_pada,created_by,berkas) values(${randomUUID()},'live.csv','BERJALAN',2,null,${admin.userId},${Buffer.from("aktif")}) returning id::text`);
        const fresh = await id(sql`insert into user_import_jobs(file_hash,nama_berkas,status,total_baris,selesai_pada,created_by) values(${randomUUID()},'recent.csv','SELESAI',0,${recent},${admin.userId}) returning id::text`);
        const logger = new Logger({ clock, tulis: () => undefined }), svc = new UserImportService(getDb(), new UserService(getDb(), audit, undefined, clock), audit, logger, clock);
        expect((await svc.get(admin, Number(u.id))).laporan_gagal).toEqual([]);
        expect((await new AssetImportService(getDb(), audit, clock).get(admin, Number(a.id))).laporan_gagal).toEqual([]);
        for (const path of [`/users/import/${u.id}`, `/assets/import/${a.id}`]) { const response = await send(path); expect(response.status).toBe(200); expect(response.json.data["report_expired"]).toBe(true); expect(JSON.stringify(response.json)).not.toContain("rahasia"); }
        expect((await getDb().selectFrom("user_import_jobs").select("laporan_gagal").where("id", "=", u.id).executeTakeFirstOrThrow()).laporan_gagal).toHaveLength(1);
        await runPersonalDataRetention(getDb(), clock);
        expect(await getDb().selectFrom("user_import_jobs").select(["sukses", "gagal", "berkas", "report_purged_at"]).where("id", "=", u.id).executeTakeFirstOrThrow()).toEqual({ sukses: 1, gagal: 1, berkas: null, report_purged_at: clock.now() });
        expect((await getDb().selectFrom("asset_import_jobs").select("report_purged_at").where("id", "=", a.id).executeTakeFirstOrThrow()).report_purged_at).not.toBeNull();
        for (const jid of [live.id, fresh.id]) expect((await getDb().selectFrom("user_import_jobs").select("report_purged_at").where("id", "=", jid).executeTakeFirstOrThrow()).report_purged_at).toBeNull();
    });
});
