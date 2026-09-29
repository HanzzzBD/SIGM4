// Acceptance PR-02-28 — "Preferensi notifikasi" (FR-17.3, SDD-NTF-06, SDD-08 §4.5; UXD-05,
// keputusan 81) terhadap PostgreSQL NYATA: enam kelompok, wajib tak dapat dimatikan,
// preferensi berlaku seketika pada penerbitan (in-app) dan pengiriman (push).

import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/api/index.js";
import { KELOMPOK_NOTIFIKASI, KELOMPOK_TERKUNCI, NotificationService, kirimPushNotifikasi } from "../../src/modules/m17-notifications/index.js";
import type { PengirimPush, Templat } from "../../src/modules/m17-notifications/index.js";
import { AMR_OTP, createAuthContext, setAmr, setAuthContext } from "../../src/shared/auth/index.js";
import type { AuthContext, Scope } from "../../src/shared/auth/index.js";
import { createSystemAuthContext } from "../../src/shared/auth/system-context.js";
import { FixedClock } from "../../src/shared/clock/index.js";
import { getDb, withTransaction } from "../../src/shared/db/index.js";
import type { KelompokNotifikasi } from "../../src/shared/db/index.js";
import { HealthRegistry, Logger } from "../../src/shared/observability/index.js";
import { authPalsu } from "../helpers/auth.js";
import { dbmate, kueri } from "../helpers/db.js";

const ADA = process.env["DATABASE_URL"] !== undefined;
const clock = new FixedClock(new Date("2026-09-30T02:00:00Z"));
const logger = new Logger({ clock, tulis: () => undefined });
const pelaku = createSystemAuthContext("uji-preferensi");

const penggunaUji: number[] = [];
async function pengguna(): Promise<number> {
    const [b] = await kueri<{ id: string }>(`
        INSERT INTO users (nama, email, password_hash, nip_nis, role_id, status, must_change_password)
        VALUES ('Uji Preferensi', 'pref-${randomUUID().slice(0, 8)}@sekolah.sch.id', 'x', 'NIPPREF${randomUUID().replace(/-/g, "").slice(0, 12)}',
                (SELECT id FROM roles WHERE kode = 'R-05'), 'AKTIF', false) RETURNING id::text`);
    const id = Number(b?.id);
    penggunaUji.push(id);
    return id;
}

const ctxDari = (userId: number, perms: readonly string[] = ["notification.manage_own"]): AuthContext =>
    createAuthContext({ userId, roleCode: "UJI", scopes: new Map<string, Scope>(perms.map((p) => [p, "all"])) });

async function aturLangsung(userId: number, jenis: KelompokNotifikasi, inApp: boolean, push: boolean): Promise<void> {
    await kueri(`INSERT INTO notification_preferences (user_id, jenis, in_app, push) VALUES (${String(userId)}, '${jenis}', ${String(inApp)}, ${String(push)})
                 ON CONFLICT (user_id, jenis) DO UPDATE SET in_app = excluded.in_app, push = excluded.push`);
}

/** Templat uji disuntik lewat konstruktor — konstanta produksi tidak disentuh. */
const templatUji = (jenis: KelompokNotifikasi, wajib: boolean): Templat => ({ jenis, wajib, judul: "Uji", render: () => "Isi uji." });
const terbitkan = (templat: Templat, penerima: readonly number[]) =>
    withTransaction(pelaku, (s) => new NotificationService(clock, () => templat).emit(s, { kode: "NT-99", penerima, params: {}, referensi: null, deepLink: null, dedupe: { event: randomUUID() } }), getDb());

async function bersihkan(): Promise<void> {
    await kueri("DELETE FROM notifications");
    await kueri("DELETE FROM notification_preferences");
    await kueri("DELETE FROM device_tokens");
    if (penggunaUji.length > 0) await kueri(`DELETE FROM users WHERE id IN (${penggunaUji.splice(0).join(",")})`);
}

type Pref = { jenis: string; in_app: boolean; push: boolean; terkunci: boolean };
const semuaAktif = (): Pref[] => KELOMPOK_NOTIFIKASI.map((jenis) => ({ jenis, in_app: true, push: true, terkunci: jenis === "PERSETUJUAN" }));

describe.skipIf(!ADA)("PR-02-28 — preferensi notifikasi (acceptance)", () => {
    beforeAll(async () => {
        dbmate("up");
        await bersihkan();
    });
    beforeEach(async () => {
        await kueri("DELETE FROM notifications");
        await kueri("DELETE FROM notification_preferences");
    });
    afterAll(bersihkan);

    it("SDD-08 §4.5: enam kelompok urut Bab 11.3; hanya PERSETUJUAN (seluruhnya wajib) terkunci", () => {
        expect(KELOMPOK_NOTIFIKASI).toEqual(["PERSETUJUAN", "RESERVASI_PEMINJAMAN", "DENDA_KEWAJIBAN", "KERUSAKAN_PERAWATAN", "OPNAME_PENGADAAN", "AKUN_SISTEM"]);
        expect([...KELOMPOK_TERKUNCI]).toEqual(["PERSETUJUAN"]);
    });

    describe("GET/PUT /notifications/preferences (FR-17.3, keputusan 81)", () => {
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
                next();
            });
            luar.use(app);
            server = createServer(luar);
            await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
            url = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}/api/v1/notifications/preferences`;
        });
        afterAll(() => new Promise<void>((r) => server.close(() => r())));

        const kirim = async (user: number, metode: "GET" | "PUT", body?: unknown, perms?: string) => {
            const res = await fetch(url, {
                method: metode,
                headers: { "content-type": "application/json", "x-uji-user": String(user), ...(perms === undefined ? {} : { "x-uji-perms": perms }) },
                ...(body === undefined ? {} : { body: JSON.stringify(body) }),
            });
            return { status: res.status, json: (await res.json()) as { data?: Pref[]; error?: { code: string; details?: readonly Record<string, unknown>[] } } };
        };

        it("GET tanpa baris tersimpan → keenam kelompok aktif (ketiadaan baris = aktif)", async () => {
            const u = await pengguna();
            const r = await kirim(u, "GET");
            expect(r.status).toBe(200);
            expect(r.json.data).toEqual(semuaAktif());
        });

        it("PUT sebagian → hanya kelompok yang disebut berubah, tersimpan, dan GET langsung mencerminkannya; pengguna lain tak terpengaruh", async () => {
            const u = await pengguna();
            const lain = await pengguna();
            const r = await kirim(u, "PUT", { preferensi: [{ jenis: "DENDA_KEWAJIBAN", in_app: false, push: false }, { jenis: "AKUN_SISTEM", in_app: true, push: false }] });
            expect(r.status).toBe(200);
            const harap = semuaAktif().map((p) =>
                p.jenis === "DENDA_KEWAJIBAN" ? { ...p, in_app: false, push: false } : p.jenis === "AKUN_SISTEM" ? { ...p, push: false } : p,
            );
            expect(r.json.data).toEqual(harap);
            expect((await kirim(u, "GET")).json.data).toEqual(harap);
            expect((await kirim(lain, "GET")).json.data).toEqual(semuaAktif());

            // Menyalakan kembali memperbarui baris yang sama (upsert), bukan menggandakan.
            await kirim(u, "PUT", { preferensi: [{ jenis: "DENDA_KEWAJIBAN", in_app: true, push: true }] });
            expect(await kueri(`SELECT jenis::text, in_app, push FROM notification_preferences WHERE user_id = ${String(u)} ORDER BY jenis`)).toEqual([
                { jenis: "AKUN_SISTEM", in_app: true, push: false },
                { jenis: "DENDA_KEWAJIBAN", in_app: true, push: true },
            ]);
        });

        it("FR-17.3 A1: mematikan kelompok terkunci → 422 VALIDATION_ERROR; permintaan ditolak utuh (butir sah lain tidak tersimpan)", async () => {
            const u = await pengguna();
            for (const p of [{ in_app: true, push: false }, { in_app: false, push: false }]) {
                const r = await kirim(u, "PUT", { preferensi: [{ jenis: "AKUN_SISTEM", in_app: false, push: false }, { jenis: "PERSETUJUAN", ...p }] });
                expect(r.status).toBe(422);
                expect(r.json.error?.code).toBe("VALIDATION_ERROR");
                expect(r.json.error?.details).toEqual([expect.objectContaining({ field: "preferensi.1.jenis" })]);
            }
            expect(await kueri(`SELECT 1 FROM notification_preferences WHERE user_id = ${String(u)}`)).toEqual([]);
            // Menyebut kelompok terkunci dalam keadaan aktif tetap sah.
            expect((await kirim(u, "PUT", { preferensi: [{ jenis: "PERSETUJUAN", in_app: true, push: true }] })).status).toBe(200);
        });

        it("keputusan 81c: push tanpa in-app → 422 (push membaca notifikasi tersimpan)", async () => {
            const u = await pengguna();
            const r = await kirim(u, "PUT", { preferensi: [{ jenis: "KERUSAKAN_PERAWATAN", in_app: false, push: true }] });
            expect(r.status).toBe(422);
            expect(r.json.error?.details).toEqual([expect.objectContaining({ field: "preferensi.0.push" })]);
            expect(await kueri(`SELECT 1 FROM notification_preferences WHERE user_id = ${String(u)}`)).toEqual([]);
            // Basis data menegakkan hal yang sama (CHECK) bila ada jalur tulis lain.
            await expect(kueri(`INSERT INTO notification_preferences (user_id, jenis, in_app, push) VALUES (${String(u)}, 'AKUN_SISTEM', false, true)`)).rejects.toThrow();
        });

        it("bentuk badan: kosong, kelompok ganda, kelompok tak dikenal, medan tambahan → 400", async () => {
            const u = await pengguna();
            for (const body of [
                { preferensi: [] },
                { preferensi: [{ jenis: "AKUN_SISTEM", in_app: true, push: true }, { jenis: "AKUN_SISTEM", in_app: false, push: false }] },
                { preferensi: [{ jenis: "M13", in_app: true, push: true }] },
                { preferensi: [{ jenis: "AKUN_SISTEM", in_app: true, push: true, wajib: false }] },
                { preferensi: [{ jenis: "AKUN_SISTEM", in_app: true, push: true }], user_id: 1 },
            ]) {
                expect((await kirim(u, "PUT", body)).status, JSON.stringify(body)).toBe(400);
            }
        });

        it("tanpa notification.manage_own → 403 untuk GET maupun PUT", async () => {
            const u = await pengguna();
            expect((await kirim(u, "GET", undefined, "")).status).toBe(403);
            expect((await kirim(u, "PUT", { preferensi: [{ jenis: "AKUN_SISTEM", in_app: false, push: false }] }, "")).status).toBe(403);
            expect(await kueri(`SELECT 1 FROM notification_preferences WHERE user_id = ${String(u)}`)).toEqual([]);
        });
    });

    describe("SDD-NTF-06 — diterapkan saat kirim, berlaku seketika", () => {
        it("in-app dimatikan → notifikasi non-wajib kelompok itu tidak disimpan bagi penerima tersebut SAJA", async () => {
            const mati = await pengguna();
            const aktif = await pengguna();
            await aturLangsung(mati, "DENDA_KEWAJIBAN", false, false);
            const baru = await terbitkan(templatUji("DENDA_KEWAJIBAN", false), [mati, aktif]);
            expect(baru.map((n) => n.userId)).toEqual([aktif]);
            // Kelompok lain milik pengguna yang sama tetap diterima.
            expect((await terbitkan(templatUji("AKUN_SISTEM", false), [mati])).map((n) => n.userId)).toEqual([mati]);
        });

        it("FR-17.3 A1 / AC 2: notifikasi wajib tetap disimpan meski in-app kelompoknya dimatikan", async () => {
            const u = await pengguna();
            await aturLangsung(u, "RESERVASI_PEMINJAMAN", false, false);
            expect((await terbitkan(templatUji("RESERVASI_PEMINJAMAN", true), [u])).map((n) => n.userId)).toEqual([u]);
        });

        it("FR-17.3 AC 1: perubahan berlaku pada terbitan berikutnya tanpa menunggu apa pun", async () => {
            const u = await pengguna();
            const t = templatUji("OPNAME_PENGADAAN", false);
            expect(await terbitkan(t, [u])).toHaveLength(1);
            await aturLangsung(u, "OPNAME_PENGADAAN", false, false);
            expect(await terbitkan(t, [u])).toHaveLength(0);
            await aturLangsung(u, "OPNAME_PENGADAAN", true, true);
            expect(await terbitkan(t, [u])).toHaveLength(1);
        });

        describe("push (keputusan 81b)", () => {
            const pengirim = (): PengirimPush & { dipanggil: number } => {
                const p = {
                    aktif: true,
                    dipanggil: 0,
                    kirim: (t: readonly string[]) => {
                        p.dipanggil += 1;
                        return Promise.resolve({ terkirim: t.length, tokenMati: [], galatSementara: null });
                    },
                    tutup: () => Promise.resolve(),
                };
                return p;
            };
            async function notifLangsung(userId: number, jenis: KelompokNotifikasi, wajib: boolean): Promise<number> {
                await kueri(`INSERT INTO device_tokens (user_id, token, platform, family_id, terakhir_aktif, created_at)
                             VALUES (${String(userId)}, 'fid-${randomUUID()}', 'ANDROID', '${randomUUID()}', now(), now())`);
                const [b] = await kueri<{ id: string }>(`INSERT INTO notifications (user_id, kode, jenis, judul, isi, wajib, created_at, dedupe_key)
                    VALUES (${String(userId)}, 'NT-99', '${jenis}', 'Uji', 'Isi', ${String(wajib)}, now(), '${randomUUID()}') RETURNING id::text`);
                return Number(b?.id);
            }
            const status = async (id: number) => (await kueri<{ status: string; last_error: string | null }>(`SELECT status::text, last_error FROM notification_deliveries WHERE notification_id = ${String(id)}`))[0];

            it("push dimatikan → job mencatat DILEWATI beralasan tanpa memanggil FCM; kelompok lain tetap terkirim", async () => {
                const u = await pengguna();
                await aturLangsung(u, "AKUN_SISTEM", true, false);
                const p = pengirim();
                const dimatikan = await notifLangsung(u, "AKUN_SISTEM", false);
                expect(await kirimPushNotifikasi({ db: getDb(), clock, ctx: pelaku, pengirim: p }, dimatikan, 1, false)).toBe("DILEWATI");
                expect(p.dipanggil).toBe(0);
                expect(await status(dimatikan)).toEqual({ status: "DILEWATI", last_error: "dimatikan preferensi pengguna" });

                const lain = await notifLangsung(u, "DENDA_KEWAJIBAN", false);
                expect(await kirimPushNotifikasi({ db: getDb(), clock, ctx: pelaku, pengirim: p }, lain, 1, false)).toBe("TERKIRIM");
            });

            it("notifikasi wajib tetap di-push meski push kelompoknya dimatikan (FR-17.3 AC 2)", async () => {
                const u = await pengguna();
                await aturLangsung(u, "KERUSAKAN_PERAWATAN", true, false);
                const p = pengirim();
                const id = await notifLangsung(u, "KERUSAKAN_PERAWATAN", true);
                expect(await kirimPushNotifikasi({ db: getDb(), clock, ctx: pelaku, pengirim: p }, id, 1, false)).toBe("TERKIRIM");
                expect(p.dipanggil).toBe(1);
            });
        });
    });
});
