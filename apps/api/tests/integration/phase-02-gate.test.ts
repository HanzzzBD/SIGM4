// Gerbang keluar Phase 02 — ukuran awal yang belum tercatat oleh PR mana pun (log phase-02 §9),
// lewat HTTP penuh pada `createApp()` (komposisi produksi) terhadap PostgreSQL + Redis nyata:
//   FR-04.2 AC 1   pencarian pada 5.000 aset ≤ 2 detik
//   FR-15.1 AC 1   dashboard (R-01/R-02/R-03) termuat sepenuhnya ≤ 3 detik pada 5.000 aset
//   FR-01.6 AC 1   pemulihan darurat hanya dari shell — tidak ada route HTTP di registri
// Ukuran AWAL di mesin pengembang/CI, bukan pengganti uji beban Phase 07–08 (SDD-PERF).

import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp, registry } from "../../src/api/index.js";
import { fcmCheck } from "../../src/modules/m17-notifications/index.js";
import { AMR_OTP, createAuthContext, setAmr, setAuthContext } from "../../src/shared/auth/index.js";
import type { Scope } from "../../src/shared/auth/index.js";
import { getRedis } from "../../src/shared/cache/index.js";
import { SystemClock } from "../../src/shared/clock/index.js";
import { getDb } from "../../src/shared/db/index.js";
import { HealthRegistry, Logger } from "../../src/shared/observability/index.js";
import { authPalsu } from "../helpers/auth.js";
import { dbmate, kueri } from "../helpers/db.js";

const ADA = process.env["DATABASE_URL"] !== undefined && process.env["REDIS_URL"] !== undefined;
const JUMLAH = 5_000;
const NAMA = "Aset gerbang 02";
const sfx = randomUUID().slice(0, 6);

describe.skipIf(!ADA)("Gerbang keluar Phase 02 — ukuran awal (PostgreSQL + Redis nyata)", () => {
    let server: Server;
    let url = "";
    let admin = 0;
    let semuaPermission: string[] = [];

    beforeAll(async () => {
        dbmate("up");
        const redis = getRedis();
        if (redis.status !== "ready") await new Promise((r) => redis.once("ready", r));
        const clock = new SystemClock();
        const app = createApp({
            health: new HealthRegistry(30).register(fcmCheck(null)),
            limiter: { hit: () => Promise.resolve({ lolos: true, batas: 1000, sisa: 999, resetDetik: 60 }) },
            security: { objectStorageOrigin: "http://minio:9000" },
            logger: new Logger({ clock, tulis: () => undefined }),
            clock,
            db: getDb(),
            auth: authPalsu(),
        });
        semuaPermission = (await kueri<{ kode: string }>("SELECT kode FROM permissions ORDER BY kode")).map((p) => p.kode);
        const luar = express();
        luar.use((req, res, next) => {
            // Pemegang role ber-2FA dengan seluruh permission katalog — hak akses bukan yang diukur di sini;
            // templat kartu mengikuti role (keputusan 82b).
            setAuthContext(res, createAuthContext({ userId: admin, roleCode: req.header("x-uji-role") ?? "R-01", scopes: new Map<string, Scope>(semuaPermission.map((p) => [p, "all"])) }));
            setAmr(res, ["pwd", AMR_OTP]);
            next();
        });
        luar.use(app);
        server = createServer(luar);
        await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
        url = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}/api/v1`;

        const [u] = await kueri<{ id: string }>(`
            INSERT INTO users (nama, email, password_hash, nip_nis, role_id, status, must_change_password)
            VALUES ('Admin Gerbang 02', 'gerbang02-${sfx}@sekolah.sch.id', 'x', 'NIPG02${sfx}', (SELECT id FROM roles WHERE kode = 'R-01'), 'AKTIF', false) RETURNING id::text`);
        admin = Number(u?.id);
        const [g] = await kueri<{ id: string }>(`INSERT INTO buildings (nama, kode) VALUES ('Gedung Gerbang', 'GG02${sfx}') RETURNING id::text`);
        const [a] = await kueri<{ id: string }>(`INSERT INTO areas (building_id, nama, kode) VALUES (${String(g?.id)}, 'Area', 'AG02${sfx}') RETURNING id::text`);
        const ruang: string[] = [];
        for (let i = 0; i < 10; i += 1) {
            const [r] = await kueri<{ id: string }>(`INSERT INTO rooms (area_id, nama, kode, jenis) VALUES (${String(a?.id)}, 'Ruang ${String(i)}', 'RG02${sfx}${String(i)}', 'KELAS') RETURNING id::text`);
            ruang.push(String(r?.id));
        }
        const kategori: string[] = [];
        for (const k of ["Proyektor", "Laptop", "Kursi", "Meja", "Printer"]) {
            const [c] = await kueri<{ id: string }>(`INSERT INTO asset_categories (nama, kode) VALUES ('${k}', 'K02${k.slice(0, 3).toUpperCase()}${sfx}') RETURNING id::text`);
            kategori.push(String(c?.id));
        }
        // 5.000 aset tersebar di 5 kategori × 10 ruangan, kondisi/status/nilai beragam (volume target FR-04.2/FR-15.1).
        await kueri(`
            INSERT INTO assets (kode_barang, nama, merek, category_id, tahun_perolehan, sumber_perolehan, room_id, kondisi, status, nilai_perolehan, qr_terpasang)
            SELECT 'G02-${sfx}-' || lpad(g::text, 5, '0'),
                   '${NAMA} ' || (ARRAY['Proyektor','Laptop','Kursi','Meja','Printer'])[1 + g % 5] || ' ' || g,
                   (ARRAY['Epson','Lenovo','Informa','Olympic','Canon'])[1 + g % 5],
                   (ARRAY[${kategori.join(",")}])[1 + g % 5], 2018 + g % 8, 'PEMBELIAN',
                   (ARRAY[${ruang.join(",")}])[1 + g % 10],
                   (ARRAY['BAIK','BAIK','BAIK','RUSAK_RINGAN','RUSAK_BERAT']::asset_condition[])[1 + g % 5],
                   (ARRAY['TERSEDIA','TERSEDIA','DIPINJAM','TERSEDIA','TIDAK_TERSEDIA']::asset_status[])[1 + g % 5],
                   1000000 + (g % 97) * 25000, g % 3 <> 0
              FROM generate_series(1, ${String(JUMLAH)}) g`);
    }, 120_000);

    afterAll(async () => {
        await new Promise<void>((r) => server.close(() => r()));
        const r = getRedis();
        const kunci = await r.keys("dash:*");
        if (kunci.length > 0) await r.del(...kunci);
        await kueri(`DELETE FROM assets WHERE kode_barang LIKE 'G02-${sfx}-%'`);
        await kueri(`DELETE FROM asset_categories WHERE kode LIKE 'K02%${sfx}'`);
        await kueri(`DELETE FROM rooms WHERE kode LIKE 'RG02${sfx}%'`);
        await kueri(`DELETE FROM areas WHERE kode = 'AG02${sfx}'`);
        await kueri(`DELETE FROM buildings WHERE kode = 'GG02${sfx}'`);
        await kueri(`DELETE FROM users WHERE id = ${String(admin)}`);
    });

    const ms = async (path: string, role = "R-01"): Promise<{ ms: number; status: number; body: { data?: unknown; meta?: { total?: number } } }> => {
        const mulai = performance.now();
        const res = await fetch(`${url}${path}`, { headers: { "x-uji-role": role } });
        const body = (await res.json()) as { data?: unknown; meta?: { total?: number } };
        return { ms: performance.now() - mulai, status: res.status, body };
    };
    const median = (xs: readonly number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? Number.NaN;

    it("FR-01.6 AC 1: tidak ada satu pun route HTTP untuk pemulihan darurat / kode aktivasi CLI (hanya shell, SDD-SESS-11)", () => {
        const rute = registry.all().map((x) => `${x.method} ${x.path}`);
        expect(rute.length).toBeGreaterThan(50);
        expect(rute.filter((x) => /recover|break-?glass|darurat|admin:/i.test(x))).toEqual([]);
    });

    it("FR-04.2 AC 1: pencarian & filter kombinasi pada 5.000 aset ≤ 2 detik (median 3 percobaan)", async () => {
        const kueriUji = [
            "/assets?q=proyektor&per_page=25",
            "/assets?q=epson&filter[kondisi]=BAIK&filter[status]=TERSEDIA&per_page=25",
            "/assets?q=laptop&filter[tahun_perolehan]=2020&sort=nama&page=3&per_page=25",
        ];
        for (const k of kueriUji) {
            const hasil = [];
            for (let i = 0; i < 3; i += 1) hasil.push(await ms(k));
            expect(hasil.every((h) => h.status === 200), k).toBe(true);
            expect(hasil[0]?.body.meta?.total, k).toBeGreaterThan(0);
            const m = median(hasil.map((h) => h.ms));
            console.log(`[FR-04.2] ${String(JUMLAH)} aset · ${k} → median ${m.toFixed(0)} ms (total ${String(hasil[0]?.body.meta?.total)})`);
            expect(m, k).toBeLessThanOrEqual(2_000);
        }
    }, 120_000);

    it.each(["R-01", "R-02", "R-03"])("FR-15.1 AC 1: dashboard %s (manifes + SELURUH kartunya, tanpa cache) ≤ 3 detik pada 5.000 aset", async (role) => {
        const totalMs: number[] = [];
        for (let i = 0; i < 3; i += 1) {
            const mulai = performance.now();
            const manifes = await ms("/dashboard", role);
            expect(manifes.status).toBe(200);
            const kartu = ((manifes.body.data as { kartu: { id: string }[] }).kartu ?? []).map((k) => k.id);
            expect(kartu.length).toBeGreaterThan(0);
            // Klien memuat kartu serentak (SDD-11 §4.3); `segarkan=true` melewati cache 5 menit — ukuran terburuk.
            const isi = await Promise.all(kartu.map((id) => ms(`/dashboard/cards/${id}?rentang=30_hari&segarkan=true`, role)));
            expect(isi.filter((x) => x.status !== 200).map((x) => x.status)).toEqual([]);
            totalMs.push(performance.now() - mulai);
            if (i === 0) console.log(`[FR-15.1] ${String(kartu.length)} kartu ${role}: ${kartu.join(", ")}`);
        }
        const m = median(totalMs);
        console.log(`[FR-15.1] dashboard ${role} · ${String(JUMLAH)} aset → median ${m.toFixed(0)} ms (percobaan: ${totalMs.map((x) => x.toFixed(0)).join(" / ")} ms)`);
        expect(m).toBeLessThanOrEqual(3_000);
    }, 120_000);
});
