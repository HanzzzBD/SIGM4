// Acceptance PR-02-26 — "SSE + Redis Pub/Sub fanout multi-instance" (FR-17.1, NTF-01…NTF-05,
// SDD-NTF-01/02/05/10, SDD-08 §4.3/§4.3a/§4.6; keputusan 79) terhadap PostgreSQL + Redis NYATA:
// "Dua instance API → satu notifikasi, satu kali tampil".

import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import type { Redis } from "ioredis";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp, langkahHentiApi } from "../../src/api/index.js";
import { HubSse, PenyiarNotifikasi, pasangKonsumenNotifikasi } from "../../src/modules/m17-notifications/index.js";
import { AMR_OTP, createAuthContext, setAmr, setAuthContext } from "../../src/shared/auth/index.js";
import type { AuthContext, Scope } from "../../src/shared/auth/index.js";
import { createSystemAuthContext } from "../../src/shared/auth/system-context.js";
import { closeRedis, createRedis, getRedis, readRedisConfig } from "../../src/shared/cache/index.js";
import { FixedClock } from "../../src/shared/clock/index.js";
import { getDb, withTransaction } from "../../src/shared/db/index.js";
import { EventHandlerRegistry, OutboxDispatcher, publish } from "../../src/shared/events/index.js";
import { HealthRegistry, Logger } from "../../src/shared/observability/index.js";
import { registry as jadwal } from "../../src/worker/index.js";
import { PEKERJAAN_ARSIP_NOTIFIKASI, jalankanArsipNotifikasi } from "../../src/worker/notification-archive.js";
import { authPalsu } from "../helpers/auth.js";
import { dbmate, kueri } from "../helpers/db.js";

const ADA = process.env["DATABASE_URL"] !== undefined && process.env["REDIS_URL"] !== undefined;
const clock = new FixedClock(new Date("2026-09-29T02:00:00Z"));
const logger = new Logger({ clock, tulis: () => undefined });
const tunggu = (ms: number) => new Promise((r) => setTimeout(r, ms));

const penggunaUji: number[] = [];
async function pengguna(nama = "Uji SSE"): Promise<number> {
    const [b] = await kueri<{ id: string }>(`
        INSERT INTO users (nama, email, password_hash, nip_nis, role_id, status, must_change_password)
        VALUES ('${nama}', 'sse-${randomUUID().slice(0, 8)}@sekolah.sch.id', 'x', 'NIPSSE${randomUUID().replace(/-/g, "").slice(0, 12)}',
                (SELECT id FROM roles WHERE kode = 'R-05'), 'AKTIF', false) RETURNING id::text`);
    const id = Number(b?.id);
    penggunaUji.push(id);
    return id;
}

const ctxDari = (userId: number, perms: readonly string[] = ["notification.manage_own"]): AuthContext =>
    createAuthContext({ userId, roleCode: "UJI", scopes: new Map<string, Scope>(perms.map((p) => [p, "all"])) });

/** Sisip notifikasi langsung (bahan daftar/tandai baca/arsip). */
async function notif(userId: number, o: { jenis?: string; dibaca?: boolean; umurHari?: number } = {}): Promise<number> {
    const [b] = await kueri<{ id: string }>(`
        INSERT INTO notifications (user_id, kode, jenis, judul, isi, created_at, dibaca_pada, dedupe_key)
        VALUES (${String(userId)}, 'NT-40', '${o.jenis ?? "AKUN_SISTEM"}', 'Judul', 'Isi', now() - interval '${String(o.umurHari ?? 0)} days',
                ${o.dibaca === true ? "now()" : "NULL"}, '${randomUUID()}') RETURNING id::text`);
    return Number(b?.id);
}

interface Instance {
    readonly url: string;
    readonly server: Server;
    readonly hub: HubSse;
}

type Aliran = { readonly pesan: Record<string, unknown>[]; readonly mentah: string[]; tertutup: boolean; tutup(): void };

describe.skipIf(!ADA)("PR-02-26 — SSE + Redis Pub/Sub fanout multi-instance (acceptance)", () => {
    const instance: Instance[] = [];
    const koneksiRedis: Redis[] = [];
    let urutanSambung = 0;

    async function bangun(): Promise<Instance> {
        const pelanggan = createRedis(readRedisConfig());
        koneksiRedis.push(pelanggan);
        // Skor sambung naik tegas — "terlama" tidak ambigu (NTF-03).
        const hub = new HubSse({ pelanggan, redis: getRedis(), logger, sekarangMs: () => ++urutanSambung, heartbeatMs: 60_000 });
        const app = createApp({
            health: new HealthRegistry(30),
            limiter: { hit: () => Promise.resolve({ lolos: true, batas: 1000, sisa: 999, resetDetik: 60 }) },
            security: { objectStorageOrigin: "http://minio:9000" },
            logger,
            clock,
            db: getDb(),
            auth: authPalsu(),
            notifikasi: { hub },
        });
        const luar = express();
        luar.use((req, res, next) => {
            const u = Number(req.header("x-uji-user"));
            const perms = req.header("x-uji-perms");
            setAuthContext(res, ctxDari(u, perms === undefined ? undefined : perms.split(",").filter((p) => p !== "")));
            setAmr(res, ["pwd", AMR_OTP]);
            next();
        });
        luar.use(app);
        const server = createServer(luar);
        await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
        return { url: `http://127.0.0.1:${String((server.address() as AddressInfo).port)}/api/v1`, server, hub };
    }

    const kirim = async (i: Instance, userId: number, metode: string, path: string, perms?: string) => {
        const res = await fetch(`${i.url}${path}`, { method: metode, headers: { "x-uji-user": String(userId), ...(perms === undefined ? {} : { "x-uji-perms": perms }) } });
        return { status: res.status, json: (await res.json()) as { data?: unknown; meta?: Record<string, unknown>; error?: { code: string } } };
    };

    /** Membuka aliran SSE dan mengumpulkan tiap `data:` sebagai JSON. */
    async function aliran(i: Instance, userId: number): Promise<Aliran> {
        const ac = new AbortController();
        const res = await fetch(`${i.url}/notifications/stream`, { headers: { "x-uji-user": String(userId) }, signal: ac.signal });
        expect(res.status).toBe(200);
        expect(res.headers.get("content-type")).toContain("text/event-stream");
        const a: Aliran = { pesan: [], mentah: [], tertutup: false, tutup: () => ac.abort() };
        const pembaca = res.body!.getReader();
        const dekoder = new TextDecoder();
        let sisa = "";
        void (async () => {
            try {
                for (;;) {
                    const { value, done } = await pembaca.read();
                    if (done) break;
                    sisa += dekoder.decode(value, { stream: true });
                    let pisah: number;
                    while ((pisah = sisa.indexOf("\n\n")) >= 0) {
                        const blok = sisa.slice(0, pisah);
                        sisa = sisa.slice(pisah + 2);
                        a.mentah.push(blok);
                        const data = blok.split("\n").find((l) => l.startsWith("data: "));
                        if (data !== undefined && !blok.startsWith("event: putus")) a.pesan.push(JSON.parse(data.slice(6)) as Record<string, unknown>);
                    }
                }
            } catch {
                /* dibatalkan */
            }
            a.tertutup = true;
        })();
        // Tunggu event awal agar koneksi sudah terdaftar di hub sebelum uji berlanjut.
        for (let n = 0; n < 100 && a.pesan.length === 0; n += 1) await tunggu(20);
        await tunggu(50);
        return a;
    }

    async function bersihkan(): Promise<void> {
        await kueri("DELETE FROM notifications");
        await kueri("DELETE FROM notifications_archive");
        await kueri("DELETE FROM event_outbox");
        if (penggunaUji.length > 0) await kueri(`DELETE FROM users WHERE id IN (${penggunaUji.splice(0).join(",")})`);
    }

    beforeAll(async () => {
        dbmate("up");
        instance.push(await bangun(), await bangun());
    });
    beforeEach(bersihkan);
    afterAll(async () => {
        for (const i of instance) {
            await i.hub.tutup();
            await new Promise<void>((r) => i.server.close(() => r()));
        }
        for (const r of koneksiRedis) await r.quit().catch(() => undefined);
        await bersihkan();
        await closeRedis();
    });

    /** Notifikasi lewat JALUR WORKER sungguhan: event outbox → konsumen → commit → siaran. */
    async function terbitkanLewatWorker(userId: number): Promise<void> {
        await withTransaction(ctxDari(userId), (s) => publish(s, { name: "UserAccountChanged", aggregateType: "user", aggregateId: userId, payload: { user_id: userId, role_baru: null, status_baru: "AKTIF" } }), getDb());
        const reg = new EventHandlerRegistry();
        const pelaku = createSystemAuthContext("uji-siaran");
        pasangKonsumenNotifikasi(reg, { db: getDb, clock, ctx: () => pelaku, penyiar: () => new PenyiarNotifikasi(getRedis(), logger) });
        await new OutboxDispatcher({ registry: reg, clock, db: getDb(), logger }).drain();
    }

    it("aliran dibuka: retry 5000 ms + event awal hitungan belum-dibaca (NTF-05)", async () => {
        const u = await pengguna();
        await notif(u);
        await notif(u, { dibaca: true });
        const a = await aliran(instance[0]!, u);
        expect(a.mentah[0]).toBe("retry: 5000");
        expect(a.pesan[0]).toEqual({ jenis: "hitungan", unread_count: 1 });
        a.tutup();
    });

    it("DUA INSTANCE: notifikasi dari worker sampai tepat SEKALI ke tiap koneksi, di instance mana pun (NTF-02)", async () => {
        const u = await pengguna();
        const lain = await pengguna("Orang Lain");
        const diA = await aliran(instance[0]!, u);
        const diB = await aliran(instance[1]!, u);
        const orangLain = await aliran(instance[1]!, lain);

        await terbitkanLewatWorker(u);
        await tunggu(400);

        for (const a of [diA, diB]) {
            const notifikasi = a.pesan.filter((p) => p["jenis"] === "notifikasi");
            expect(notifikasi).toHaveLength(1);
            expect(notifikasi[0]).toMatchObject({ unread_count: 1, notifikasi: { kode: "NT-40", deep_link: "/profil" } });
        }
        expect(orangLain.pesan.filter((p) => p["jenis"] === "notifikasi")).toEqual([]);
        for (const a of [diA, diB, orangLain]) a.tutup();
    });

    it("dua koneksi pengguna yang sama pada SATU instance sama-sama menerima siaran", async () => {
        const u = await pengguna();
        const satu = await aliran(instance[0]!, u);
        const dua = await aliran(instance[0]!, u);
        await terbitkanLewatWorker(u);
        await tunggu(400);
        for (const a of [satu, dua]) expect(a.pesan.filter((p) => p["jenis"] === "notifikasi")).toHaveLength(1);
        satu.tutup();
        dua.tutup();
    });

    it("siaran hanya SETELAH commit: baris sudah terbaca lewat GET /notifications saat pesan tiba", async () => {
        const u = await pengguna();
        const a = await aliran(instance[0]!, u);
        await terbitkanLewatWorker(u);
        await tunggu(300);
        const id = (a.pesan.find((p) => p["jenis"] === "notifikasi")?.["notifikasi"] as { id: number } | undefined)?.id;
        const daftar = await kirim(instance[1]!, u, "GET", "/notifications");
        expect((daftar.json.data as { id: number }[]).map((n) => n.id)).toContain(id);
        a.tutup();
    });

    it("NTF-03: koneksi ke-3 (instance berbeda) memutus yang TERLAMA secara global", async () => {
        const u = await pengguna();
        const pertama = await aliran(instance[0]!, u);
        const kedua = await aliran(instance[1]!, u);
        const ketiga = await aliran(instance[0]!, u);
        await tunggu(400);
        expect(pertama.mentah.some((m) => m.startsWith("event: putus"))).toBe(true);
        expect(pertama.tertutup).toBe(true);
        expect([kedua.tertutup, ketiga.tertutup]).toEqual([false, false]);
        expect(instance[0]!.hub.jumlahLokal(u) + instance[1]!.hub.jumlahLokal(u)).toBe(2);
        kedua.tutup();
        ketiga.tutup();
    });

    describe("GET /notifications (FR-17.1 A2, A3; SDD-NTF-10)", () => {
        it("milik sendiri saja, terbaru dulu; filter jenis & status baca; meta unread_count & paginasi", async () => {
            const u = await pengguna();
            const lain = await pengguna("Orang Lain");
            const lama = await notif(u, { umurHari: 2 });
            const baru = await notif(u, { jenis: "PERSETUJUAN" });
            await notif(u, { dibaca: true, umurHari: 1 });
            await notif(lain);

            const semua = await kirim(instance[0]!, u, "GET", "/notifications?per_page=2");
            expect(semua.status).toBe(200);
            expect((semua.json.data as { id: number }[]).map((n) => n.id)[0]).toBe(baru);
            expect(semua.json.meta).toMatchObject({ total: 3, total_pages: 2, unread_count: 2 });
            expect(((await kirim(instance[0]!, u, "GET", "/notifications?jenis=PERSETUJUAN")).json.data as { id: number }[]).map((n) => n.id)).toEqual([baru]);
            expect(((await kirim(instance[0]!, u, "GET", "/notifications?belum_dibaca=true")).json.data as { id: number }[]).map((n) => n.id)).toEqual([baru, lama]);
            expect((await kirim(instance[0]!, u, "GET", "/notifications?jenis=TIDAK_ADA")).status).toBe(400);
        });

        it("tanpa notification.manage_own → 403", async () => {
            const u = await pengguna();
            expect((await kirim(instance[0]!, u, "GET", "/notifications", "user.view")).status).toBe(403);
            expect((await kirim(instance[0]!, u, "PATCH", "/notifications/read-all", "user.view")).status).toBe(403);
        });
    });

    describe("tandai baca (FR-17.1 langkah 4–5, NTF-05)", () => {
        it("PATCH /{id}/read: milik sendiri → 200 + hitungan disiarkan ulang; milik orang lain → 404; ulang tetap waktu semula", async () => {
            const u = await pengguna();
            const lain = await pengguna("Orang Lain");
            const n = await notif(u);
            await notif(u);
            const milikLain = await notif(lain);
            const a = await aliran(instance[1]!, u);

            const r = await kirim(instance[0]!, u, "PATCH", `/notifications/${String(n)}/read`);
            expect(r).toMatchObject({ status: 200, json: { data: { id: n, unread_count: 1 } } });
            await tunggu(300);
            expect(a.pesan.at(-1)).toEqual({ jenis: "hitungan", unread_count: 1 });

            // Idempoten: waktu baca pertama dipertahankan (jam uji tetap, jadi waktu lama disetel eksplisit).
            await kueri(`UPDATE notifications SET dibaca_pada = '2026-01-01T00:00:00Z' WHERE id = ${String(n)}`);
            const ulang = await kirim(instance[0]!, u, "PATCH", `/notifications/${String(n)}/read`);
            expect((ulang.json.data as { dibaca_pada: string }).dibaca_pada).toBe("2026-01-01T00:00:00.000Z");
            expect((await kirim(instance[0]!, u, "PATCH", `/notifications/${String(milikLain)}/read`)).status).toBe(404);
            a.tutup();
        });

        it("PATCH /read-all: seluruh milik sendiri, hitungan 0 disiarkan; milik orang lain tak tersentuh", async () => {
            const u = await pengguna();
            const lain = await pengguna("Orang Lain");
            await notif(u);
            await notif(u);
            await notif(lain);
            const a = await aliran(instance[0]!, u);
            const r = await kirim(instance[1]!, u, "PATCH", "/notifications/read-all");
            expect(r.json.data).toEqual({ ditandai: 2, unread_count: 0 });
            await tunggu(300);
            expect(a.pesan.at(-1)).toEqual({ jenis: "hitungan", unread_count: 0 });
            expect(await kueri(`SELECT 1 FROM notifications WHERE user_id = ${String(lain)} AND dibaca_pada IS NULL`)).toHaveLength(1);
            a.tutup();
        });
    });

    describe("arsip (FR-17.1 A2, SDD-08 §4.6)", () => {
        it("job 01:30 WIB memindah > 90 hari per batch; yang baru tetap; arsip terbaca lewat ?arsip=true", async () => {
            expect(jadwal.get(PEKERJAAN_ARSIP_NOTIFIKASI)?.cron).toBe("30 18 * * *");
            const u = await pengguna();
            const tua = [await notif(u, { umurHari: 91 }), await notif(u, { umurHari: 120 }), await notif(u, { umurHari: 200 })];
            const muda = await notif(u, { umurHari: 89 });

            const hasil = await jalankanArsipNotifikasi(getDb(), new FixedClock(new Date()), 2); // batch 2 → dua putaran
            expect(hasil).toMatchObject({ diproses: 3, galat: 0 });
            expect((await kueri<{ id: string }>(`SELECT id::text FROM notifications WHERE user_id = ${String(u)}`)).map((b) => Number(b.id))).toEqual([muda]);
            const arsip = await kirim(instance[0]!, u, "GET", "/notifications?arsip=true");
            expect((arsip.json.data as { id: number }[]).map((n) => n.id).sort((x, y) => x - y)).toEqual([...tua].sort((x, y) => x - y));
            expect(((await jalankanArsipNotifikasi(getDb(), new FixedClock(new Date()), 2)).diproses)).toBe(0); // JOB-03
        });
    });

    it("graceful shutdown: langkah `tutup-sse` mendahului `tutup-server` dan menutup aliran (SDD-INF-05)", async () => {
        const i = await bangun();
        const u = await pengguna();
        const a = await aliran(i, u);
        const langkah = langkahHentiApi(new HealthRegistry(30), i.server, i.hub);
        expect(langkah.map((l) => l.nama).slice(0, 3)).toEqual(["tandai-berhenti", "tutup-sse", "tutup-server"]);
        await langkah[1]!.jalankan();
        await tunggu(200);
        expect(a.tertutup).toBe(true);
        await new Promise<void>((r) => i.server.close(() => r()));
    });
});
