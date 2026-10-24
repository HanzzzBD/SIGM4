// PR-03-36 / CD-07: script deploy menjalankan API dan JWT produksi, DB/Redis nyata.
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";
import express from "express";
import { sql } from "kysely";
import type { Redis } from "ioredis";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../src/api/index.js";
import { PermissionCache, SessionStore } from "../../src/shared/auth/index.js";
import { createRedis, readRedisConfig } from "../../src/shared/cache/index.js";
import { SystemClock } from "../../src/shared/clock/index.js";
import { getDb } from "../../src/shared/db/index.js";
import { RedisRateLimiter } from "../../src/shared/http/index.js";
import { HealthRegistry, Logger } from "../../src/shared/observability/index.js";
import { hashPassword } from "../../src/shared/security/index.js";
import type { PenyimpananObjek } from "../../src/shared/storage/index.js";
import { duaFaktorUji, kunciUji } from "../helpers/auth.js";
import { dbmate } from "../helpers/db.js";

const clock = new SystemClock(), db = getDb;
const script = fileURLToPath(new URL("../../../../deploy/staging/smoke-test.sh", import.meta.url)).replaceAll("\\", "/");
const bash = process.env["SMOKE_BASH"] ?? "bash";
const python = process.env["SMOKE_PYTHON"] ?? (process.platform === "win32" ? "python" : "python3");
describe.skipIf(!process.env["DATABASE_URL"])("PR-03-36 smoke penuh lewat script deploy", () => {
    let redis: Redis, server: Server, origin: string, room: string, asset: string, assetUuid: string, user: string, approver: string;
    let oldThreshold: unknown;
    let failUpload = false, lostReservation = false, lostTicket = false;
    const password = `Rahasia-${randomUUID()}-9aA`, email = `${randomUUID()}@smoke.test`, objects = new Map<string, Buffer>();
    const calls: string[] = [], uploadAuth: (string | undefined)[] = [];
    const run = (mode?: string, overrides: Record<string, string> = {}) => new Promise<{ code: number; output: string }>(resolveResult => {
        execFile(bash, [script, origin, ...(mode ? [mode] : [])], { timeout: 90_000, windowsHide: true, env: { ...process.env,
            SMOKE_PYTHON: python, SMOKE_ALLOW_HTTP_LOOPBACK: "1", SMOKE_EMAIL: email, SMOKE_PASSWORD: password,
            SMOKE_ROOM_ID: room, SMOKE_ASSET_UUID: assetUuid, ...overrides } }, (error, stdout, stderr) => {
            resolveResult({ code: typeof error?.code === "number" ? error.code : error ? 1 : 0, output: stdout + stderr });
        });
    });
    const state = async () => ({
        reservations: (await sql<{ id: string; status: string }>`select id::text,status::text from reservations where pemohon_id=${user}::bigint order by id`.execute(db())).rows,
        tickets: (await sql<{ id: string; status: string }>`select id::text,status::text from damage_reports where pelapor_id=${user}::bigint order by id`.execute(db())).rows,
        sessions: (await sql<{ n: string }>`select count(*)::text n from refresh_tokens where user_id=${user}::bigint and revoked_at is null`.execute(db())).rows[0]!.n,
    });
    beforeAll(async () => {
        dbmate("up"); redis = createRedis(readRedisConfig());
        if (redis.status !== "ready") await new Promise<void>((r, reject) => { redis.once("ready", r); redis.once("error", reject); });
        oldThreshold = (await sql<{ value: unknown }>`select value from system_settings where key='denda.ambang_blokir'`.execute(db())).rows[0]!.value;
        await sql`update system_settings set value='100000000'::jsonb where key='denda.ambang_blokir'`.execute(db());
        const hash = await hashPassword(password), uid = randomUUID().slice(0, 8);
        user = (await sql<{ id: string }>`insert into users(nama,email,nip_nis,password_hash,role_id,status,must_change_password) values('[SMOKE] Petugas',${email},${uid},${hash},(select id from roles where kode='R-02'),'AKTIF',false) returning id::text`.execute(db())).rows[0]!.id;
        approver = (await sql<{ id: string }>`insert into users(nama,email,nip_nis,password_hash,role_id,status,must_change_password) values('[SMOKE] Approver',${`a-${email}`},${`a-${uid}`},${hash},(select id from roles where kode='R-03'),'AKTIF',false) returning id::text`.execute(db())).rows[0]!.id;
        const building = (await sql<{ id: string }>`insert into buildings(nama,kode) values('[SMOKE] Gedung',${`G-${uid}`}) returning id::text`.execute(db())).rows[0]!.id;
        const area = (await sql<{ id: string }>`insert into areas(nama,kode,building_id) values('[SMOKE] Area',${`A-${uid}`},${building}::bigint) returning id::text`.execute(db())).rows[0]!.id;
        room = (await sql<{ id: string }>`insert into rooms(nama,kode,area_id,jenis,kapasitas,dapat_direservasi,status) values('[SMOKE] Ruangan',${`R-${uid}`},${area}::bigint,'AULA',10,true,'AKTIF') returning id::text`.execute(db())).rows[0]!.id;
        const category = (await sql<{ id: string }>`insert into asset_categories(nama,kode) values('[SMOKE] Kategori',${`C-${uid}`}) returning id::text`.execute(db())).rows[0]!.id;
        const fixture = (await sql<{ id: string; uuid: string }>`insert into assets(nama,kode_barang,category_id,room_id,tahun_perolehan,sumber_perolehan,kondisi) values('[SMOKE] Aset',${`S-${uid}`},${category}::bigint,${room}::bigint,2026,'PEMBELIAN','BAIK') returning id::text,uuid::text`.execute(db())).rows[0]!;
        asset = fixture.id; assetUuid = fixture.uuid;
        const rule = (await sql<{ id: string }>`insert into approval_rules(jenis_pengajuan,kondisi,prioritas,terminal_on_exhausted_escalation) values('RESERVASI_RUANGAN',${JSON.stringify({ field: "room_id", op: "in", value: [Number(room)] })}::jsonb,99,'hold_and_alert') returning id::text`.execute(db())).rows[0]!.id;
        await sql`insert into approval_rule_steps(rule_id,urutan,approver_type,approver_user_id,sla_jam,on_sla_breach) values(${rule}::bigint,1,'user',${approver}::bigint,8,'remind')`.execute(db());
        const storage: PenyimpananObjek = {
            urlUnggah: key => Promise.resolve(`${origin}/objects/${encodeURIComponent(key)}`), urlUnduh: key => Promise.resolve(`${origin}/objects/${encodeURIComponent(key)}`),
            info: key => Promise.resolve(objects.has(key) ? { ukuran: objects.get(key)!.length } : null), ambil: key => Promise.resolve(objects.get(key) ?? null),
            simpan: (key, body) => { objects.set(key, body); return Promise.resolve(); }, hapus: key => { objects.delete(key); return Promise.resolve(); }, periksa: () => Promise.resolve(),
        };
        const health = new HealthRegistry().register({ name: "database", probe: async () => { await sql`select 1`.execute(db()); return { status: "up" }; } }, { name: "redis", probe: async () => { await redis.ping(); return { status: "up" }; } });
        const outer = express();
        outer.use((req, res, next) => {
            calls.push(req.method + " " + req.path);
            // Hanya tiruan header proxy lokal; uji ini tidak mengklaim bukti TLS/Nginx staging.
            res.setHeader("Strict-Transport-Security", "max-age=31536000");
            const drop = (lostReservation && req.path === "/api/v1/reservations") || (lostTicket && req.path === "/api/v1/damage-reports");
            if (drop && req.method === "POST") { const send = res.json.bind(res); res.json = body => { if (res.statusCode === 201) { res.status(502); return send({ success: false, error: { code: "UJI_BALASAN_HILANG" } }); } return send(body); }; }
            next();
        });
        outer.put("/objects/:key", express.raw({ type: "image/png" }), (req, res) => {
            uploadAuth.push(req.header("authorization"));
            if (failUpload) { res.sendStatus(503); return; }
            objects.set(req.params["key"]!, req.body as Buffer); res.sendStatus(200);
        });
        outer.use(createApp({ db: db(), clock, appBaseUrl: "https://smoke.test", penyimpanan: storage,
            // Staging memasang /api/docs (PR-00-19) dan smoke-test.sh memeriksanya — sama seperti deploy staging.
            documentation: { environment: "staging", version: "smoke" },
            auth: { jwtKeys: kunciUji(), permissions: new PermissionCache(db(), redis), sessions: new SessionStore(db()), twoFactor: duaFaktorUji(redis) },
            logger: new Logger({ clock, tulis: () => undefined }), health, security: { objectStorageOrigin: "https://storage.test" }, limiter: new RedisRateLimiter(redis, clock) }));
        server = createServer(outer); await new Promise<void>(r => server.listen(0, "127.0.0.1", r)); origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    });
    afterAll(async () => { if (server) await new Promise<void>(r => server.close(() => r())); await redis?.quit();
        if (oldThreshold !== undefined) await sql`update system_settings set value=${JSON.stringify(oldThreshold)}::jsonb where key='denda.ambang_blokir'`.execute(db());
        // Fixture CI tidak menjadi approver/penerima notifikasi aktif bagi suite berikutnya.
        if (user && approver) await sql`update users set status='NONAKTIF' where id in (${user}::bigint,${approver}::bigint)`.execute(db());
    });
    it("default penuh lulus dua kali, membatalkan slot dan menutup tiket tanpa mengubah kondisi; audit/foto tetap ada", async () => {
        for (let n = 0; n < 2; n++) { const result = await run(); expect(result.output).not.toContain(password); expect(result, result.output).toMatchObject({ code: 0 }); }
        const current = await state(); expect(current.reservations).toHaveLength(2); expect(current.tickets).toHaveLength(2);
        expect(current.reservations.every(r => r.status === "DIBATALKAN")).toBe(true); expect(current.tickets.every(t => t.status === "SELESAI")).toBe(true); expect(current.sessions).toBe("0");
        expect((await sql<{ kondisi: string }>`select kondisi from assets where id=${asset}::bigint`.execute(db())).rows[0]!.kondisi).toBe("BAIK");
        expect((await sql<{ status: string }>`select status::text from booking_slots where resource_type='room' and resource_id=${room}::bigint`.execute(db())).rows.every(r => r.status === "RELEASED")).toBe(true);
        expect((await sql<{ n: string }>`select count(*)::text n from stored_files where uploaded_by=${user}::bigint and owner_id is not null and checksum is not null`.execute(db())).rows[0]!.n).toBe("2");
        expect((await sql<{ n: string }>`select count(*)::text n from activity_logs where user_id=${user}::bigint and aksi='DAMAGE_VERIFIED'`.execute(db())).rows[0]!.n).toBe("2");
        expect(uploadAuth).toEqual([undefined, undefined]);
    });
    it("konfigurasi wajib kosong gagal tanpa login/transaksi; health-only eksplisit tidak menulis", async () => {
        const before = await state(); const count = calls.length;
        const bad = await run(undefined, { SMOKE_PASSWORD: "" }); expect(bad.code).toBe(1); expect(bad.output).toContain("SMOKE_PASSWORD");
        const healthy = await run("--health-only", { SMOKE_PASSWORD: "" }); expect(healthy.code, healthy.output).toBe(0); expect(healthy.output).toContain("belum diuji");
        expect(calls.slice(count).every(c => c.startsWith("GET "))).toBe(true); expect(await state()).toEqual(before);
    });
    it("fixture tanpa label ditolak sebelum transaksi dan sesi tetap dicabut", async () => {
        const before = await state(); await sql`update assets set nama='Aset operasional' where id=${asset}::bigint`.execute(db());
        try { const result = await run("--full"); expect(result.code).toBe(1); expect(result.output).toContain("aset [SMOKE]"); expect(await state()).toEqual(before); }
        finally { await sql`update assets set nama='[SMOKE] Aset' where id=${asset}::bigint`.execute(db()); }
    });
    it("kegagalan unggah menggagalkan gerbang dan tetap membatalkan reservasi serta logout", async () => {
        failUpload = true;
        try { const result = await run(); expect(result.code).toBe(1); expect(result.output).toContain("Unggah foto fixture gagal"); const current = await state(); expect(current.reservations.at(-1)!.status).toBe("DIBATALKAN"); expect(current.sessions).toBe("0"); }
        finally { failUpload = false; }
    });
    it.each(["reservasi", "tiket"])("balasan POST %s hilang: gerbang gagal, marker unik memulihkan ID untuk pembersihan", async kind => {
        lostReservation = kind === "reservasi"; lostTicket = kind === "tiket";
        try { const result = await run(); expect(result.code).toBe(1); expect(result.output).toContain("HTTP 502"); const current = await state(); expect(current.reservations.at(-1)!.status).toBe("DIBATALKAN"); expect(current.tickets.every(t => t.status === "SELESAI")).toBe(true); expect(current.sessions).toBe("0"); }
        finally { lostReservation = lostTicket = false; }
    });
});
