// Acceptance PR-03-01 (FR-05.1, keputusan 1 log phase-03): payload QR pada respons aset,
// regenerasi UUID (A2) dan penandaan label terpasang (langkah 5) — HTTP penuh lewat
// `createApp()` terhadap PostgreSQL nyata.

import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/api/index.js";
import { fcmCheck } from "../../src/modules/m17-notifications/index.js";
import { AMR_OTP, createAuthContext, setAmr, setAuthContext } from "../../src/shared/auth/index.js";
import type { Scope } from "../../src/shared/auth/index.js";
import { FixedClock } from "../../src/shared/clock/index.js";
import { getDb } from "../../src/shared/db/index.js";
import { HealthRegistry, Logger } from "../../src/shared/observability/index.js";
import { PembangkitPdfChromium } from "../../src/shared/pdf/index.js";
import { authPalsu } from "../helpers/auth.js";
import { dbmate, kueri } from "../helpers/db.js";

const ADA = process.env["DATABASE_URL"] !== undefined && process.env["REDIS_URL"] !== undefined;
const DASAR = "https://sigm4.sekolah.test";
const clock = new FixedClock(new Date("2026-10-01T03:00:00Z"));
const UUIDV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const ADMIN = ["asset.view", "asset.create", "asset.qr_print", "asset.qr_regenerate"];
const PETUGAS = ["asset.view", "asset.create", "asset.qr_print"];

// Chromium SUNGGUHAN (Chrome terpasang — dev & runner CI); satu uji menggantinya dengan yang gagal.
const chromium = new PembangkitPdfChromium(process.env["CHROMIUM_EXECUTABLE_PATH"] ?? null);
let pembangkit = (html: string) => chromium.render(html);

let urut = 0;
const kode = (a: string) => `${a}${String(++urut)}${randomUUID().slice(0, 6)}`;

describe.skipIf(!ADA)("PR-03-01 — payload QR + siklus hidup label (acceptance)", () => {
    let server: Server;
    let url = "";
    let pengguna = 0;
    let ruang = "";
    let kategori = "";
    let sejakLog = 0;

    beforeAll(async () => {
        dbmate("up");
        const app = createApp({
            appBaseUrl: DASAR,
            health: new HealthRegistry(30).register(fcmCheck(null)),
            limiter: { hit: () => Promise.resolve({ lolos: true, batas: 1000, sisa: 999, resetDetik: 60 }) },
            security: { objectStorageOrigin: "http://minio:9000" },
            logger: new Logger({ clock, tulis: () => undefined }),
            clock,
            db: getDb(),
            auth: authPalsu(),
            pdf: { render: (html) => pembangkit(html) },
        });
        const luar = express();
        luar.use((req, res, next) => {
            const perms = (req.header("x-uji-perms") ?? "").split(",").filter((p) => p !== "");
            setAuthContext(res, createAuthContext({ userId: pengguna, roleCode: "R-01", scopes: new Map<string, Scope>(perms.map((p) => [p, "all"])) }));
            setAmr(res, ["pwd", AMR_OTP]);
            next();
        });
        luar.use(app);
        server = createServer(luar);
        await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
        url = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}/api/v1`;
        const [u] = await kueri<{ id: string }>(`
            INSERT INTO users (nama, email, password_hash, nip_nis, role_id, status, must_change_password)
            VALUES ('Admin QR', 'qr-${randomUUID().slice(0, 8)}@sekolah.sch.id', 'x', '${kode("NIPQR")}', (SELECT id FROM roles WHERE kode = 'R-01'), 'AKTIF', false) RETURNING id::text`);
        pengguna = Number(u?.id);
        const [g] = await kueri<{ id: string }>(`INSERT INTO buildings (nama, kode) VALUES ('G', '${kode("GQ")}') RETURNING id::text`);
        const [a] = await kueri<{ id: string }>(`INSERT INTO areas (building_id, nama, kode) VALUES (${String(g?.id)}, 'A', '${kode("AQ")}') RETURNING id::text`);
        const [r] = await kueri<{ id: string }>(`INSERT INTO rooms (area_id, nama, kode, jenis) VALUES (${String(a?.id)}, 'R', '${kode("RQ")}', 'KELAS') RETURNING id::text`);
        ruang = r?.id ?? "";
        const [k] = await kueri<{ id: string }>(`INSERT INTO asset_categories (nama, kode) VALUES ('Proyektor QR', '${kode("KQ")}') RETURNING id::text`);
        kategori = k?.id ?? "";
    });
    beforeEach(async () => {
        sejakLog = Number((await kueri<{ n: string }>("SELECT coalesce(max(id), 0)::text AS n FROM activity_logs"))[0]?.n);
    });
    afterAll(async () => {
        await new Promise<void>((r) => server.close(() => r()));
        await kueri(`DELETE FROM assets WHERE category_id = ${kategori}`);
        await kueri(`DELETE FROM asset_code_counters WHERE category_id = ${kategori}`);
        await kueri(`DELETE FROM asset_categories WHERE id = ${kategori}`);
        await kueri(`DELETE FROM users WHERE id = ${String(pengguna)}`);
    });

    type Balasan = { status: number; json: { data?: unknown; meta?: unknown; error?: { code: string } } };
    const minta = async (metode: string, path: string, perms: readonly string[], body?: unknown): Promise<Balasan> => {
        const res = await fetch(`${url}${path}`, {
            method: metode,
            headers: { "x-uji-perms": perms.join(","), "content-type": "application/json" },
            ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
        return { status: res.status, json: (await res.json()) as Balasan["json"] };
    };
    type Aset = { id: string; uuid: string; qr_url: string; qr_terpasang: boolean };
    const buat = async (jumlah = 1): Promise<Aset[]> => {
        const r = await minta("POST", "/assets", ADMIN, { nama: "Proyektor", category_id: Number(kategori), tahun_perolehan: 2024, sumber_perolehan: "PEMBELIAN", room_id: Number(ruang), kondisi: "BAIK", jumlah_unit: jumlah });
        expect(r.status).toBe(201);
        return r.json.data as Aset[];
    };
    const log = (aksi: string) =>
        kueri<{ entitas_id: string; nilai_sebelum: Record<string, unknown>; nilai_sesudah: Record<string, unknown>; keterangan: string | null }>(
            `SELECT entitas_id, nilai_sebelum, nilai_sesudah, keterangan FROM activity_logs WHERE aksi = '${aksi}' AND id > ${String(sejakLog)} ORDER BY id`,
        );

    describe("payload QR pada respons aset (FR-05.1 langkah 1)", () => {
        it("20 unit sekaligus → 20 QR berbeda, masing-masing https://{domain}/a/{uuid}; label belum terpasang", async () => {
            const aset = await buat(20);
            expect(aset).toHaveLength(20);
            expect(new Set(aset.map((a) => a.qr_url)).size).toBe(20);
            for (const a of aset) {
                expect(a.uuid).toMatch(UUIDV4);
                expect(a.qr_url).toBe(`${DASAR}/a/${a.uuid}`);
                expect(a.qr_terpasang).toBe(false);
            }
        });

        it("katalog GET /assets membawa qr_url & qr_terpasang yang sama dengan basis data", async () => {
            const [a] = await buat();
            const r = await minta("GET", `/assets?q=Proyektor&per_page=100&filter[kategori_id]=${kategori}`, ["asset.view"]);
            const item = (r.json.data as Aset[]).find((x) => x.id === a!.id);
            expect(item).toMatchObject({ uuid: a!.uuid, qr_url: `${DASAR}/a/${a!.uuid}`, qr_terpasang: false });
        });
    });

    describe("POST /assets/{id}/qr/regenerate (FR-05.1 A2)", () => {
        it("UUID baru → QR lama tidak berlaku lagi; ASSET_QR_REGENERATED memuat uuid lama/baru + alasan", async () => {
            const [a] = await buat();
            const r = await minta("POST", `/assets/${a!.id}/qr/regenerate`, ADMIN, { alasan: "Label lama tercopot dan hilang" });
            expect(r.status).toBe(200);
            const baru = r.json.data as { id: string; uuid: string; qr_url: string };
            expect(baru.uuid).toMatch(UUIDV4);
            expect(baru.uuid).not.toBe(a!.uuid);
            expect(baru.qr_url).toBe(`${DASAR}/a/${baru.uuid}`);
            expect(await kueri(`SELECT 1 FROM assets WHERE uuid = '${a!.uuid}'`)).toEqual([]);
            expect(await log("ASSET_QR_REGENERATED")).toEqual([
                { entitas_id: a!.id, nilai_sebelum: { uuid: a!.uuid }, nilai_sesudah: { uuid: baru.uuid }, keterangan: "Label lama tercopot dan hilang" },
            ]);
        });

        it("hanya asset.qr_regenerate (inti Administrator): Petugas → 403 dan UUID tak berubah", async () => {
            const [a] = await buat();
            expect((await minta("POST", `/assets/${a!.id}/qr/regenerate`, PETUGAS, { alasan: "x" })).status).toBe(403);
            expect((await kueri<{ uuid: string }>(`SELECT uuid::text FROM assets WHERE id = ${a!.id}`))[0]?.uuid).toBe(a!.uuid);
            expect(await log("ASSET_QR_REGENERATED")).toEqual([]);
        });

        it("alasan wajib (UX-04) → 400 tanpa perubahan; aset tak ada → 404", async () => {
            const [a] = await buat();
            expect((await minta("POST", `/assets/${a!.id}/qr/regenerate`, ADMIN, { alasan: "  " })).status).toBe(400);
            expect((await minta("POST", `/assets/${a!.id}/qr/regenerate`, ADMIN, {})).status).toBe(400);
            expect((await kueri<{ uuid: string }>(`SELECT uuid::text FROM assets WHERE id = ${a!.id}`))[0]?.uuid).toBe(a!.uuid);
            expect((await minta("POST", "/assets/999999999/qr/regenerate", ADMIN, { alasan: "x" })).status).toBe(404);
        });
    });

    describe("PATCH /assets/qr-terpasang (FR-05.1 langkah 5)", () => {
        it("menandai beberapa aset; hanya yang berubah ditulis & dicatat ASSET_UPDATED; ulang tanpa efek", async () => {
            const [a, b] = await buat(2);
            const r = await minta("PATCH", "/assets/qr-terpasang", PETUGAS, { asset_ids: [Number(a!.id), Number(b!.id)], qr_terpasang: true });
            expect(r.status).toBe(200);
            expect(r.json).toMatchObject({ data: { diubah: [a!.id, b!.id].sort(), qr_terpasang: true }, meta: { jumlah_diubah: 2 } });
            expect((await log("ASSET_UPDATED")).map((l) => [l.entitas_id, l.nilai_sebelum, l.nilai_sesudah])).toEqual([
                [a!.id, { qr_terpasang: false }, { qr_terpasang: true }],
                [b!.id, { qr_terpasang: false }, { qr_terpasang: true }],
            ]);
            const ulang = await minta("PATCH", "/assets/qr-terpasang", PETUGAS, { asset_ids: [Number(a!.id)], qr_terpasang: true });
            expect(ulang.json).toMatchObject({ data: { diubah: [] }, meta: { jumlah_diubah: 0 } });
            expect(await log("ASSET_UPDATED")).toHaveLength(2);
            // A1 — label rusak dilepas: kembali false.
            const lepas = await minta("PATCH", "/assets/qr-terpasang", PETUGAS, { asset_ids: [Number(a!.id)], qr_terpasang: false });
            expect(lepas.json).toMatchObject({ data: { diubah: [a!.id], qr_terpasang: false } });
        });

        it("atomik: satu id tak ada → 422 asset_ids dan TIDAK ada aset yang berubah", async () => {
            const [a] = await buat();
            const r = await minta("PATCH", "/assets/qr-terpasang", PETUGAS, { asset_ids: [Number(a!.id), 999999999], qr_terpasang: true });
            expect(r.status).toBe(422);
            expect(r.json.error?.code).toBe("VALIDATION_ERROR");
            expect((await kueri<{ q: boolean }>(`SELECT qr_terpasang AS q FROM assets WHERE id = ${a!.id}`))[0]?.q).toBe(false);
            expect(await log("ASSET_UPDATED")).toEqual([]);
        });

        it("otorisasi & bentuk: tanpa asset.qr_print → 403; kosong atau > 200 aset → 400", async () => {
            const [a] = await buat();
            expect((await minta("PATCH", "/assets/qr-terpasang", ["asset.view"], { asset_ids: [Number(a!.id)], qr_terpasang: true })).status).toBe(403);
            expect((await minta("PATCH", "/assets/qr-terpasang", PETUGAS, { asset_ids: [], qr_terpasang: true })).status).toBe(400);
            expect((await minta("PATCH", "/assets/qr-terpasang", PETUGAS, { asset_ids: Array.from({ length: 201 }, (_, i) => i + 1), qr_terpasang: true })).status).toBe(400);
        });
    });

    describe("POST /assets/qr/print (FR-05.1 langkah 2–4, PR-03-02)", () => {
        const cetak = async (perms: readonly string[], body: unknown) => {
            const mulai = performance.now();
            const res = await fetch(`${url}/assets/qr/print`, { method: "POST", headers: { "x-uji-perms": perms.join(","), "content-type": "application/json" }, body: JSON.stringify(body) });
            const isi = Buffer.from(await res.arrayBuffer());
            return { status: res.status, jenis: res.headers.get("content-type") ?? "", unduhan: res.headers.get("content-disposition") ?? "", isi, ms: performance.now() - mulai };
        };
        const ELEMEN = { kode_aset: true, nama: true };
        // Skia menulis tiap halaman sebagai `/Type /Page` dan MediaBox dalam poin (A4 = 595,28 × 841,89).
        const halaman = (pdf: Buffer) => pdf.toString("latin1").match(/\/Type\s*\/Page\b/g)?.length ?? 0;
        const mediaBox = (pdf: Buffer) => /\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/.exec(pdf.toString("latin1"))?.slice(1).map(Number) ?? [];

        it("200 label (batas AC) → satu PDF 1.7 A4, 9 lembar 3×8, ≤ 30 detik (AC FR-05.1, NFR-P-07); ASSET_QR_PRINTED + jumlah", async () => {
            const aset = await buat(200);
            const r = await cetak(PETUGAS, { asset_ids: aset.map((a) => Number(a.id)), tata_letak: "A4_3X8", elemen: ELEMEN });
            expect(r.status).toBe(200);
            expect(r.jenis).toBe("application/pdf");
            expect(r.unduhan).toBe('attachment; filename="label-qr.pdf"');
            expect(r.isi.subarray(0, 8).toString("latin1")).toBe("%PDF-1.7"); // NFR-C-07
            expect(halaman(r.isi)).toBe(9);
            const [lebar, tinggi] = mediaBox(r.isi);
            expect(lebar).toBeCloseTo(595.28, -1);
            expect(tinggi).toBeCloseTo(841.89, -1);
            // AC FR-05.1/NFR-P-07: ≤ 30 detik. Anggaran sinkron SDD-PERF-06 (≤ 5 detik) TIDAK ditegakkan di sini:
            // runner CI berbagi CPU dengan cakupan v8 + suite paralel (terukur 9,7 dtk) — ia dibuktikan pada image
            // produksi dan uji beban staging (SDD-FS-12; keputusan 2g log phase-03).
            console.info(`[PR-03-02] 200 label A4_3X8: ${r.ms.toFixed(0)} ms, ${String(r.isi.length)} byte`);
            expect(r.ms).toBeLessThan(30_000);
            const [entri] = await log("ASSET_QR_PRINTED");
            expect(entri?.nilai_sesudah).toEqual({ jumlah: 200, tata_letak: "A4_3X8", asset_ids: aset.map((a) => a.id) });
            // A1 — cetak ulang tidak mengubah UUID: label lama tetap sah.
            const uuid = await kueri<{ uuid: string }>(`SELECT uuid::text FROM assets WHERE id IN (${aset.map((a) => a.id).join(",")}) ORDER BY id`);
            expect(uuid.map((u) => u.uuid)).toEqual(aset.map((a) => a.uuid));
        });

        it("tanpa asset.qr_print → 403, tanpa PDF dan tanpa log (PM-02)", async () => {
            const [a] = await buat();
            const r = await cetak(["asset.view", "asset.update"], { asset_ids: [Number(a!.id)], tata_letak: "A4_3X8", elemen: ELEMEN });
            expect(r.status).toBe(403);
            expect(await log("ASSET_QR_PRINTED")).toEqual([]);
        });

        it("bentuk: kosong, > 200 aset, preset tak dikenal → 400; satu id tak ada → 422 tanpa log", async () => {
            const [a] = await buat();
            expect((await cetak(PETUGAS, { asset_ids: [], tata_letak: "A4_3X8", elemen: ELEMEN })).status).toBe(400);
            expect((await cetak(PETUGAS, { asset_ids: Array.from({ length: 201 }, (_, i) => i + 1), tata_letak: "A4_3X8", elemen: ELEMEN })).status).toBe(400);
            expect((await cetak(PETUGAS, { asset_ids: [Number(a!.id)], tata_letak: "A4_9X9", elemen: ELEMEN })).status).toBe(400);
            const hilang = await cetak(PETUGAS, { asset_ids: [Number(a!.id), 999999999], tata_letak: "A4_3X8", elemen: ELEMEN });
            expect(hilang.status).toBe(422);
            expect(JSON.parse(hilang.isi.toString("utf8"))).toMatchObject({ error: { code: "VALIDATION_ERROR" } });
            expect(await log("ASSET_QR_PRINTED")).toEqual([]);
        });

        it("render gagal → 500 dan ASSET_QR_PRINTED TIDAK dicatat (log hanya untuk PDF yang benar-benar jadi)", async () => {
            const [a] = await buat();
            const asli = pembangkit;
            pembangkit = () => Promise.reject(new Error("Chromium mati"));
            try {
                expect((await cetak(PETUGAS, { asset_ids: [Number(a!.id)], tata_letak: "A4_2X5", elemen: ELEMEN })).status).toBe(500);
            } finally {
                pembangkit = asli;
            }
            expect(await log("ASSET_QR_PRINTED")).toEqual([]);
        });
    });
});
