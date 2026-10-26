// Tur produk berbasis role (keputusan pemilik produk 26 Oktober 2026) terhadap PostgreSQL NYATA:
// progres tersimpan per akun, terisolasi antar-pengguna, upsert, tervalidasi, dan setiap
// penyimpanan tercatat di activity log dalam transaksi yang sama (AL-01).

import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../src/api/index.js";
import { AMR_OTP, createAuthContext, setAmr, setAuthContext } from "../../src/shared/auth/index.js";
import { FixedClock } from "../../src/shared/clock/index.js";
import { getDb } from "../../src/shared/db/index.js";
import { HealthRegistry, Logger } from "../../src/shared/observability/index.js";
import { authPalsu } from "../helpers/auth.js";
import { dbmate, kueri } from "../helpers/db.js";

const ADA = process.env["DATABASE_URL"] !== undefined;
const clock = new FixedClock(new Date("2026-10-26T03:00:00Z"));
const logger = new Logger({ clock, tulis: () => undefined });

const penggunaUji: number[] = [];
async function pengguna(): Promise<number> {
    const [b] = await kueri<{ id: string }>(`
        INSERT INTO users (nama, email, password_hash, nip_nis, role_id, status, must_change_password)
        VALUES ('Uji Tur', 'tur-${randomUUID().slice(0, 8)}@sekolah.sch.id', 'x', 'NIPTUR${randomUUID().replace(/-/g, "").slice(0, 12)}',
                (SELECT id FROM roles WHERE kode = 'R-07'), 'AKTIF', false) RETURNING id::text`);
    const id = Number(b?.id);
    penggunaUji.push(id);
    return id;
}

async function bersihkan(): Promise<void> {
    if (penggunaUji.length === 0) return;
    const ids = penggunaUji.splice(0).join(",");
    await kueri(`DELETE FROM product_tour_progress WHERE user_id IN (${ids})`);
    await kueri(`DELETE FROM users WHERE id IN (${ids})`);
}

type Tur = { kunci: string; status: string; versi: number; diperbarui_pada: string };
type Jawab = { status: number; json: { data?: { tur: Tur[] | Tur }; error?: { code: string } } };

describe.skipIf(!ADA)("Tur produk — GET/PUT /me/tours", () => {
    let server: Server;
    let base = "";

    beforeAll(async () => {
        dbmate("up");
        const app = createApp({
            appBaseUrl: "https://sigm4.sekolah.test",
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
            const user = req.header("x-uji-user");
            // Tanpa header = tanpa sesi: route `authenticated` wajib menolak.
            if (user !== undefined) {
                setAuthContext(res, createAuthContext({ userId: Number(user), roleCode: "R-07", scopes: new Map() }));
                setAmr(res, ["pwd", AMR_OTP]);
            }
            next();
        });
        luar.use(app);
        server = createServer(luar);
        await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
        base = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}/api/v1/me/tours`;
    });
    afterAll(async () => {
        await new Promise<void>((r) => server.close(() => r()));
        await bersihkan();
    });

    const kirim = async (user: number | undefined, metode: "GET" | "PUT", jalur = "", body?: unknown): Promise<Jawab> => {
        const res = await fetch(base + jalur, {
            method: metode,
            headers: { "content-type": "application/json", ...(user === undefined ? {} : { "x-uji-user": String(user) }) },
            ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
        return { status: res.status, json: (await res.json()) as Jawab["json"] };
    };

    it("tanpa sesi → 401 untuk GET maupun PUT", async () => {
        expect((await kirim(undefined, "GET")).status).toBe(401);
        expect((await kirim(undefined, "PUT", "/utama.siswa", { status: "SELESAI", versi: 1 })).status).toBe(401);
    });

    it("pengguna baru belum punya progres; PUT tersimpan dan GET mencerminkannya", async () => {
        const u = await pengguna();
        expect((await kirim(u, "GET")).json.data?.tur).toEqual([]);

        const r = await kirim(u, "PUT", "/utama.siswa", { status: "DILEWATI", versi: 1 });
        expect(r.status).toBe(200);
        expect(r.json.data?.tur).toEqual({ kunci: "utama.siswa", status: "DILEWATI", versi: 1, diperbarui_pada: "2026-10-26T03:00:00.000Z" });
        expect((await kirim(u, "GET")).json.data?.tur).toEqual([r.json.data?.tur]);
    });

    it("PUT ulang memperbarui baris yang sama (upsert), bukan menggandakan", async () => {
        const u = await pengguna();
        await kirim(u, "PUT", "/halaman.inventaris", { status: "DILEWATI", versi: 1 });
        await kirim(u, "PUT", "/halaman.inventaris", { status: "SELESAI", versi: 2 });
        expect(await kueri(`SELECT kunci_tur, status, versi FROM product_tour_progress WHERE user_id = ${String(u)}`)).toEqual([
            { kunci_tur: "halaman.inventaris", status: "SELESAI", versi: 2 },
        ]);
    });

    it("progres terisolasi per akun — pengguna lain tidak melihat maupun menimpa", async () => {
        const a = await pengguna();
        const b = await pengguna();
        await kirim(a, "PUT", "/utama.petugas", { status: "SELESAI", versi: 1 });
        expect((await kirim(b, "GET")).json.data?.tur).toEqual([]);
        await kirim(b, "PUT", "/utama.petugas", { status: "DILEWATI", versi: 3 });
        expect((await kirim(a, "GET")).json.data?.tur).toEqual([expect.objectContaining({ status: "SELESAI", versi: 1 })]);
    });

    it("kunci, status, dan versi yang tidak sah → 400, tidak tersimpan", async () => {
        const u = await pengguna();
        expect((await kirim(u, "PUT", "/Utama_Siswa", { status: "SELESAI", versi: 1 })).status).toBe(400);
        expect((await kirim(u, "PUT", "/utama.siswa", { status: "BERJALAN", versi: 1 })).status).toBe(400);
        expect((await kirim(u, "PUT", "/utama.siswa", { status: "SELESAI", versi: 0 })).status).toBe(400);
        expect((await kirim(u, "GET")).json.data?.tur).toEqual([]);
    });

    it("AL-01: selesai dan dilewati masing-masing tercatat dengan pelaku dan nilai sebelum/sesudah", async () => {
        const u = await pengguna();
        await kirim(u, "PUT", "/utama.admin", { status: "DILEWATI", versi: 1 });
        await kirim(u, "PUT", "/utama.admin", { status: "SELESAI", versi: 1 });
        const log = await kueri<{ aksi: string; nilai_sebelum: unknown; nilai_sesudah: unknown }>(
            `SELECT aksi, nilai_sebelum, nilai_sesudah FROM activity_logs WHERE entitas = 'product_tour_progress' AND entitas_id = ${String(u)} ORDER BY id`,
        );
        expect(log).toEqual([
            { aksi: "PRODUCT_TOUR_SKIPPED", nilai_sebelum: null, nilai_sesudah: { kunci_tur: "utama.admin", status: "DILEWATI", versi: 1 } },
            { aksi: "PRODUCT_TOUR_COMPLETED", nilai_sebelum: { kunci_tur: "utama.admin", status: "DILEWATI", versi: 1 }, nilai_sesudah: { kunci_tur: "utama.admin", status: "SELESAI", versi: 1 } },
        ]);
    });
});
