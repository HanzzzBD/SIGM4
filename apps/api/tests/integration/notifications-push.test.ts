// Acceptance PR-02-27 — "Push FCM + token perangkat" (FR-17.2, MOB-SEC-05, SDD-NTF-08,
// SDD-08 §4.4/§4.4a; keputusan 80) terhadap PostgreSQL NYATA. Pengirim FCM diganti tiruan
// `PengirimPush` — jaringan Google tidak pernah disentuh uji.

import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/api/index.js";
import { EVENT_SESI_DICABUT } from "../../src/modules/m01-auth/index.js";
import { PENGIRIM_NONAKTIF, PushPerluDiulang, bentukPesanFcm, kirimPushNotifikasi, pasangKonsumenNotifikasi } from "../../src/modules/m17-notifications/index.js";
import type { HasilPush, PengirimPush, PesanPush } from "../../src/modules/m17-notifications/index.js";
import { AMR_OTP, createAuthContext, setAmr, setAuthContext } from "../../src/shared/auth/index.js";
import type { AuthContext, Scope } from "../../src/shared/auth/index.js";
import { setSesiId } from "../../src/shared/auth/middleware.js";
import { createSystemAuthContext } from "../../src/shared/auth/system-context.js";
import { FixedClock } from "../../src/shared/clock/index.js";
import { getDb, withTransaction } from "../../src/shared/db/index.js";
import { EventHandlerRegistry, OutboxDispatcher, publish } from "../../src/shared/events/index.js";
import { HealthRegistry, Logger } from "../../src/shared/observability/index.js";
import { NAMA_PEKERJAAN_PUSH, eventHandlers, idJobPush, registry as jadwal } from "../../src/worker/index.js";
import { authPalsu } from "../helpers/auth.js";
import { dbmate, kueri } from "../helpers/db.js";

const ADA = process.env["DATABASE_URL"] !== undefined;
const clock = new FixedClock(new Date("2026-09-30T02:00:00Z"));
const logger = new Logger({ clock, tulis: () => undefined });
const pelaku = createSystemAuthContext("uji-push");

const penggunaUji: number[] = [];
async function pengguna(kodeRole = "R-05"): Promise<number> {
    const [b] = await kueri<{ id: string }>(`
        INSERT INTO users (nama, email, password_hash, nip_nis, role_id, status, must_change_password)
        VALUES ('Uji Push', 'push-${randomUUID().slice(0, 8)}@sekolah.sch.id', 'x', 'NIPPUSH${randomUUID().replace(/-/g, "").slice(0, 12)}',
                (SELECT id FROM roles WHERE kode = '${kodeRole}'), 'AKTIF', false) RETURNING id::text`);
    const id = Number(b?.id);
    penggunaUji.push(id);
    return id;
}

const ctxDari = (userId: number, perms: readonly string[] = ["notification.manage_own"]): AuthContext =>
    createAuthContext({ userId, roleCode: "UJI", scopes: new Map<string, Scope>(perms.map((p) => [p, "all"])) });

async function notif(userId: number, wajib = false): Promise<number> {
    const [b] = await kueri<{ id: string }>(`
        INSERT INTO notifications (user_id, kode, jenis, judul, isi, deep_link, wajib, created_at, dedupe_key)
        VALUES (${String(userId)}, 'NT-40', 'AKUN_SISTEM', 'Akun diubah', 'Role akun Anda diubah.', '/profil', ${String(wajib)}, now(), '${randomUUID()}') RETURNING id::text`);
    return Number(b?.id);
}

async function tokenLangsung(userId: number, token: string, familyId: string = randomUUID()): Promise<void> {
    await kueri(`INSERT INTO device_tokens (user_id, token, platform, family_id, terakhir_aktif, created_at)
                 VALUES (${String(userId)}, '${token}', 'ANDROID', '${familyId}', now(), now())`);
}

const tokenMilik = async (userId: number) =>
    (await kueri<{ token: string }>(`SELECT token FROM device_tokens WHERE user_id = ${String(userId)} ORDER BY token`)).map((b) => b.token);

type Pengiriman = { status: string; attempts: number; last_error: string | null; terkirim: boolean };
const pengiriman = async (notifikasiId: number) =>
    kueri<Pengiriman>(`SELECT status::text, attempts, last_error, sent_at IS NOT NULL AS terkirim FROM notification_deliveries WHERE notification_id = ${String(notifikasiId)} AND kanal = 'PUSH'`);

/** Pengirim tiruan: hasil per token ditentukan uji; setiap panggilan direkam. */
function pengirimTiruan(tanggapan: (tokens: readonly string[]) => HasilPush | Error): PengirimPush & { panggilan: { tokens: readonly string[]; pesan: PesanPush }[] } {
    const panggilan: { tokens: readonly string[]; pesan: PesanPush }[] = [];
    return {
        aktif: true,
        panggilan,
        kirim: (tokens, pesan) => {
            panggilan.push({ tokens, pesan });
            const h = tanggapan(tokens);
            return h instanceof Error ? Promise.reject(h) : Promise.resolve(h);
        },
        tutup: () => Promise.resolve(),
    };
}

const deps = (pengirim: PengirimPush) => ({ db: getDb(), clock, ctx: pelaku, pengirim });

async function bersihkan(): Promise<void> {
    await kueri("DELETE FROM notifications"); // deliveries ikut CASCADE
    await kueri("DELETE FROM device_tokens");
    await kueri("DELETE FROM event_outbox");
    if (penggunaUji.length > 0) await kueri(`DELETE FROM users WHERE id IN (${penggunaUji.splice(0).join(",")})`);
}

describe.skipIf(!ADA)("PR-02-27 — push FCM + token perangkat (acceptance)", () => {
    beforeAll(async () => {
        dbmate("up");
        await bersihkan();
    });
    beforeEach(async () => {
        await kueri("DELETE FROM notifications");
        await kueri("DELETE FROM device_tokens");
    });
    afterAll(bersihkan);

    describe("endpoint token perangkat (FR-17.2 langkah 1, keputusan 80b/80d)", () => {
        let server: Server;
        let url = "";

        beforeAll(async () => {
            const app = createApp({
                health: new HealthRegistry(30),
                limiter: { hit: () => Promise.resolve({ lolos: true, batas: 1000, sisa: 999, resetDetik: 60 }) },
                security: { objectStorageOrigin: "http://minio:9000" },
                logger,
                clock,
                db: getDb(),
                auth: authPalsu(),
            });
            const luar = express();
            luar.use((req, res, next) => {
                const perms = req.header("x-uji-perms");
                setAuthContext(res, ctxDari(Number(req.header("x-uji-user")), perms === undefined ? undefined : perms.split(",").filter((p) => p !== "")));
                setAmr(res, ["pwd", AMR_OTP]);
                const sid = req.header("x-uji-sid");
                if (sid !== undefined) setSesiId(res, sid);
                next();
            });
            luar.use(app);
            server = createServer(luar);
            await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
            url = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}/api/v1`;
        });
        afterAll(() => new Promise<void>((r) => server.close(() => r())));

        const kirim = async (o: { user: number; metode: string; path: string; body?: unknown; sid?: string; perms?: string }) => {
            const res = await fetch(`${url}${o.path}`, {
                method: o.metode,
                headers: {
                    "content-type": "application/json",
                    "x-uji-user": String(o.user),
                    ...(o.sid === undefined ? {} : { "x-uji-sid": o.sid }),
                    ...(o.perms === undefined ? {} : { "x-uji-perms": o.perms }),
                },
                ...(o.body === undefined ? {} : { body: JSON.stringify(o.body) }),
            });
            const teks = await res.text();
            return { status: res.status, json: (teks === "" ? null : JSON.parse(teks)) as { data?: Record<string, unknown>; error?: { code: string } } | null };
        };

        it("daftar: 201, keluarga token = klaim sid (bukan masukan klien), terakhir_aktif dari Clock", async () => {
            const u = await pengguna();
            const sid = randomUUID();
            const r = await kirim({ user: u, metode: "POST", path: "/device-tokens", body: { token: "fid-a", platform: "ANDROID" }, sid });
            expect(r.status).toBe(201);
            expect(r.json?.data).toEqual({ token: "fid-a", platform: "ANDROID", terakhir_aktif: "2026-09-30T02:00:00.000Z" });
            expect(await kueri(`SELECT user_id::text, family_id::text FROM device_tokens WHERE token = 'fid-a'`)).toEqual([{ user_id: String(u), family_id: sid }]);
        });

        it("token unik: didaftar ulang oleh pengguna lain di perangkat yang sama → dipindah, bukan digandakan", async () => {
            const a = await pengguna();
            const b = await pengguna();
            await kirim({ user: a, metode: "POST", path: "/device-tokens", body: { token: "fid-bersama", platform: "IOS" }, sid: randomUUID() });
            const sidB = randomUUID();
            expect((await kirim({ user: b, metode: "POST", path: "/device-tokens", body: { token: "fid-bersama", platform: "ANDROID" }, sid: sidB })).status).toBe(201);
            expect(await kueri(`SELECT user_id::text, platform::text, family_id::text FROM device_tokens WHERE token = 'fid-bersama'`)).toEqual([
                { user_id: String(b), platform: "ANDROID", family_id: sidB },
            ]);
        });

        it("ditolak: platform WEB, medan tambahan, → 400, tanpa sesi (sid) → 422; tanpa permission → 403", async () => {
            const u = await pengguna();
            const sid = randomUUID();
            expect((await kirim({ user: u, metode: "POST", path: "/device-tokens", body: { token: "fid-w", platform: "WEB" }, sid })).status).toBe(400);
            expect((await kirim({ user: u, metode: "POST", path: "/device-tokens", body: { token: "fid-w", platform: "IOS", family_id: randomUUID() }, sid })).status).toBe(400);
            const tanpaSid = await kirim({ user: u, metode: "POST", path: "/device-tokens", body: { token: "fid-w", platform: "IOS" } });
            expect(tanpaSid.status).toBe(422);
            expect(tanpaSid.json?.error?.code).toBe("VALIDATION_ERROR");
            expect((await kirim({ user: u, metode: "POST", path: "/device-tokens", body: { token: "fid-w", platform: "IOS" }, sid, perms: "" })).status).toBe(403);
            expect(await tokenMilik(u)).toEqual([]);
        });

        it("cabut: hanya token milik sendiri (204); token orang lain → 404 dan tetap ada; tanpa permission → 403", async () => {
            const pemilik = await pengguna();
            const lain = await pengguna();
            await tokenLangsung(pemilik, "fid-milik");
            expect((await kirim({ user: lain, metode: "DELETE", path: "/device-tokens/fid-milik" })).status).toBe(404);
            expect((await kirim({ user: pemilik, metode: "DELETE", path: "/device-tokens/fid-milik", perms: "" })).status).toBe(403);
            expect(await tokenMilik(pemilik)).toEqual(["fid-milik"]);
            const r = await kirim({ user: pemilik, metode: "DELETE", path: "/device-tokens/fid-milik" });
            expect(r.status).toBe(204);
            expect(await tokenMilik(pemilik)).toEqual([]);
        });
    });

    it("MOB-SEC-05: SessionRevoked mencabut token keluarga sesi itu SAJA (sesi lain pengguna yang sama tetap)", async () => {
        const u = await pengguna();
        const dicabut = randomUUID();
        await tokenLangsung(u, "fid-sesi-dicabut", dicabut);
        await tokenLangsung(u, "fid-sesi-lain");
        const registry = new EventHandlerRegistry();
        pasangKonsumenNotifikasi(registry, { db: getDb, clock, ctx: () => pelaku });
        await withTransaction(ctxDari(u), (s) =>
            publish(s, { name: EVENT_SESI_DICABUT, aggregateType: "user", aggregateId: u, payload: { user_id: String(u), family_id: dicabut, platform: "ANDROID", alasan: "LOGOUT" } }), getDb());
        await new OutboxDispatcher({ registry, clock, db: getDb(), logger }).drain();
        expect(await tokenMilik(u)).toEqual(["fid-sesi-lain"]);
        expect(eventHandlers.handlersFor(EVENT_SESI_DICABUT).length).toBeGreaterThan(0); // terpasang di worker
    });

    it("keputusan 80c/87b: job push dijadwalkan per notifikasi baru SETELAH commit — hanya kode \"In-app + Push\" katalog", async () => {
        const pemohon = await pengguna("R-05");
        await pengguna("R-01");
        const dijadwalkan: number[] = [];
        const registry = new EventHandlerRegistry();
        pasangKonsumenNotifikasi(registry, { db: getDb, clock, ctx: () => pelaku, jadwalkanPush: (ids) => (dijadwalkan.push(...ids), Promise.resolve()) });
        // NT-48 (m02 §9: In-app) dan NT-37 (m01 §9: In-app + Push) dari dua event yang sudah commit.
        await withTransaction(pelaku, (s) => publish(s, { name: "GuardianConsentMissing", aggregateType: "user", aggregateId: 1, payload: { user_id: null, nama: "Siswa Uji" } }), getDb());
        await withTransaction(pelaku, (s) => publish(s, { name: "PasswordResetRequested", aggregateType: "user", aggregateId: pemohon, payload: { permintaan_id: 77, user_id: String(pemohon) } }), getDb());
        await new OutboxDispatcher({ registry, clock, db: getDb(), logger }).drain();
        const lahir = async (kode: string) => (await kueri<{ id: string }>(`SELECT id::text FROM notifications WHERE kode = '${kode}' ORDER BY id`)).map((b) => Number(b.id));
        expect((await lahir("NT-48")).length).toBeGreaterThan(0);
        expect((await lahir("NT-37")).length).toBeGreaterThan(0);
        expect(dijadwalkan.sort((x, y) => x - y)).toEqual(await lahir("NT-37"));
    });

    it("keputusan 87c: isi push NT-37 generik — nama pemohon hanya di in-app (layar terkunci, SDD-08 §4.2)", async () => {
        const u = await pengguna();
        await tokenLangsung(u, "fid-37");
        const [b] = await kueri<{ id: string }>(`
            INSERT INTO notifications (user_id, kode, jenis, judul, isi, deep_link, wajib, created_at, dedupe_key)
            VALUES (${String(u)}, 'NT-37', 'AKUN_SISTEM', 'Permintaan reset password', 'Budi Siswa mengajukan reset password.', '/permintaan-reset-password', true, now(), '${randomUUID()}') RETURNING id::text`);
        const p = pengirimTiruan((t) => ({ terkirim: t.length, tokenMati: [], galatSementara: null }));
        await kirimPushNotifikasi(deps(p), Number(b?.id), 1, false);
        expect(p.panggilan[0]?.pesan.isi).toBe("Ada permintaan reset password baru.");
        expect(JSON.stringify(p.panggilan)).not.toContain("Budi");
    });

    it("worker: pekerjaan `notification-push` terdaftar (tanpa cron) dan jobId tetap per notifikasi", () => {
        expect(jadwal.get(NAMA_PEKERJAAN_PUSH)).toBeDefined();
        expect(jadwal.get(NAMA_PEKERJAAN_PUSH)?.cron).toBeUndefined();
        expect(idJobPush(42)).toBe("push-42");
    });

    describe("pengiriman (FR-17.2 langkah 2, A1–A4; SDD-08 §4.4a)", () => {
        it("A4: semua perangkat pengguna dikirimi; tercatat TERKIRIM + sent_at; payload tanpa data lain", async () => {
            const u = await pengguna();
            await tokenLangsung(u, "fid-1");
            await tokenLangsung(u, "fid-2");
            const id = await notif(u);
            const p = pengirimTiruan((t) => ({ terkirim: t.length, tokenMati: [], galatSementara: null }));
            expect(await kirimPushNotifikasi(deps(p), id, 1, false)).toBe("TERKIRIM");
            expect(p.panggilan).toEqual([{ tokens: ["fid-1", "fid-2"], pesan: { kode: "NT-40", judul: "Akun diubah", isi: "Role akun Anda diubah.", deepLink: "/profil", prioritasTinggi: false } }]);
            expect(await pengiriman(id)).toEqual([{ status: "TERKIRIM", attempts: 1, last_error: null, terkirim: true }]);
        });

        it("SDD-08 §4.4: notifikasi wajib → prioritas tinggi (android high, apns 10); selainnya normal", async () => {
            const u = await pengguna();
            await tokenLangsung(u, "fid-w");
            const p = pengirimTiruan((t) => ({ terkirim: t.length, tokenMati: [], galatSementara: null }));
            await kirimPushNotifikasi(deps(p), await notif(u, true), 1, false);
            expect(p.panggilan[0]?.pesan.prioritasTinggi).toBe(true);
            const pesan = bentukPesanFcm(["fid-w"], p.panggilan[0]!.pesan);
            expect(pesan).toMatchObject({ fids: ["fid-w"], android: { priority: "high" }, apns: { headers: { "apns-priority": "10" } }, data: { kode: "NT-40", deep_link: "/profil" } });
            expect(bentukPesanFcm(["x"], { ...p.panggilan[0]!.pesan, prioritasTinggi: false, deepLink: null })).toMatchObject({ android: { priority: "normal" }, apns: { headers: { "apns-priority": "5" } }, data: { deep_link: "" } });
        });

        it("A1: tanpa perangkat, atau FCM tak dikonfigurasi → DILEWATI beralasan; pengirim tak dipanggil", async () => {
            const u = await pengguna();
            const tanpaPerangkat = await notif(u);
            const p = pengirimTiruan(() => ({ terkirim: 1, tokenMati: [], galatSementara: null }));
            expect(await kirimPushNotifikasi(deps(p), tanpaPerangkat, 1, false)).toBe("DILEWATI");
            expect(p.panggilan).toEqual([]);
            expect((await pengiriman(tanpaPerangkat))[0]).toMatchObject({ status: "DILEWATI", last_error: "pengguna tanpa perangkat terdaftar" });

            await tokenLangsung(u, "fid-ada");
            const nonaktif = await notif(u);
            expect(await kirimPushNotifikasi(deps(PENGIRIM_NONAKTIF), nonaktif, 1, false)).toBe("DILEWATI");
            expect((await pengiriman(nonaktif))[0]).toMatchObject({ status: "DILEWATI", last_error: "FCM_CREDENTIALS tidak dikonfigurasi" });
            expect(await tokenMilik(u)).toEqual(["fid-ada"]);
        });

        it("A2: token mati dihapus — perangkat lain tetap menerima; semuanya mati → DILEWATI tanpa diulang", async () => {
            const u = await pengguna();
            await tokenLangsung(u, "fid-hidup");
            await tokenLangsung(u, "fid-mati");
            const id = await notif(u);
            const p = pengirimTiruan(() => ({ terkirim: 1, tokenMati: ["fid-mati"], galatSementara: null }));
            expect(await kirimPushNotifikasi(deps(p), id, 1, false)).toBe("TERKIRIM");
            expect(await tokenMilik(u)).toEqual(["fid-hidup"]);

            const id2 = await notif(u);
            const mati = pengirimTiruan((t) => ({ terkirim: 0, tokenMati: [...t], galatSementara: null }));
            expect(await kirimPushNotifikasi(deps(mati), id2, 1, false)).toBe("DILEWATI");
            expect(await tokenMilik(u)).toEqual([]);
            expect((await pengiriman(id2))[0]).toMatchObject({ status: "DILEWATI", last_error: "seluruh perangkat tidak valid — token dihapus" });
        });

        it("A3: galat sementara → MENUNGGU + dilempar agar antrean mengulang; percobaan terakhir → GAGAL (attempts naik)", async () => {
            const u = await pengguna();
            await tokenLangsung(u, "fid-sibuk");
            const id = await notif(u);
            const sibuk = pengirimTiruan(() => ({ terkirim: 0, tokenMati: [], galatSementara: "messaging/unavailable" }));
            await expect(kirimPushNotifikasi(deps(sibuk), id, 1, false)).rejects.toBeInstanceOf(PushPerluDiulang);
            expect(await pengiriman(id)).toEqual([{ status: "MENUNGGU", attempts: 1, last_error: "messaging/unavailable", terkirim: false }]);

            const putus = pengirimTiruan(() => new Error("ECONNRESET"));
            await expect(kirimPushNotifikasi(deps(putus), id, 2, false)).rejects.toBeInstanceOf(PushPerluDiulang);
            expect(await kirimPushNotifikasi(deps(sibuk), id, 3, true)).toBe("GAGAL");
            expect(await pengiriman(id)).toEqual([{ status: "GAGAL", attempts: 3, last_error: "messaging/unavailable", terkirim: false }]);
            expect(await tokenMilik(u)).toEqual(["fid-sibuk"]); // galat sementara tidak menghapus token
        });

        it("attempts tidak pernah mundur: job yang dijalankan ulang (stalled, JOB-03) dengan nomor percobaan lebih kecil tidak menurunkannya", async () => {
            const u = await pengguna();
            await tokenLangsung(u, "fid-ulang");
            const id = await notif(u);
            const sibuk = pengirimTiruan(() => ({ terkirim: 0, tokenMati: [], galatSementara: "messaging/unavailable" }));
            await expect(kirimPushNotifikasi(deps(sibuk), id, 2, false)).rejects.toBeInstanceOf(PushPerluDiulang);
            await expect(kirimPushNotifikasi(deps(sibuk), id, 1, false)).rejects.toBeInstanceOf(PushPerluDiulang);
            expect((await pengiriman(id))[0]).toMatchObject({ status: "MENUNGGU", attempts: 2 });
        });

        it("notifikasi sudah tiada (diarsipkan) → DILEWATI tanpa catatan dan tanpa pengiriman", async () => {
            const p = pengirimTiruan(() => ({ terkirim: 1, tokenMati: [], galatSementara: null }));
            expect(await kirimPushNotifikasi(deps(p), 999_999_999, 1, false)).toBe("DILEWATI");
            expect(p.panggilan).toEqual([]);
        });
    });
});
