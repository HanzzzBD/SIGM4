// Acceptance PUT /assets/{id} (FR-04.3; PR-02-46, keputusan 93e/93f log phase-02) — HTTP penuh lewat
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
import { authPalsu } from "../helpers/auth.js";
import { dbmate, kueri } from "../helpers/db.js";

const ADA = process.env["DATABASE_URL"] !== undefined && process.env["REDIS_URL"] !== undefined;
const clock = new FixedClock(new Date("2026-10-11T03:00:00Z"));

const PETUGAS = ["asset.view", "asset.view_financial", "asset.create", "asset.update", "asset.update_condition"];
const TANPA_KONDISI = ["asset.view", "asset.update"];

let urut = 0;
const kode = (a: string) => `${a}${String(++urut)}${randomUUID().slice(0, 6)}`;

describe.skipIf(!ADA)("PR-02-46 — PUT /assets/{id} (acceptance)", () => {
    let server: Server;
    let url = "";
    let pengguna = 0;
    let ruang = "";
    let kategori = "";
    let sejakLog = 0;

    beforeAll(async () => {
        dbmate("up");
        const app = createApp({
            appBaseUrl: "https://sigm4.sekolah.test",
            health: new HealthRegistry(30).register(fcmCheck(null)),
            limiter: { hit: () => Promise.resolve({ lolos: true, batas: 1000, sisa: 999, resetDetik: 60 }) },
            security: { objectStorageOrigin: "http://minio:9000" },
            logger: new Logger({ clock, tulis: () => undefined }),
            clock,
            db: getDb(),
            auth: authPalsu(),
        });
        const luar = express();
        luar.use((req, res, next) => {
            const perms = (req.header("x-uji-perms") ?? "").split(",").filter((p) => p !== "");
            setAuthContext(res, createAuthContext({ userId: pengguna, roleCode: "R-02", scopes: new Map<string, Scope>(perms.map((p) => [p, "all" as Scope])) }));
            setAmr(res, ["pwd", AMR_OTP]);
            next();
        });
        luar.use(app);
        server = createServer(luar);
        await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
        url = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}/api/v1`;
        const [u] = await kueri<{ id: string }>(`
            INSERT INTO users (nama, email, password_hash, nip_nis, role_id, status, must_change_password)
            VALUES ('Petugas Ubah', 'ubah-${randomUUID().slice(0, 8)}@sekolah.sch.id', 'x', '${kode("NIPU")}', (SELECT id FROM roles WHERE kode = 'R-02'), 'AKTIF', false) RETURNING id::text`);
        pengguna = Number(u?.id);
        const [g] = await kueri<{ id: string }>(`INSERT INTO buildings (nama, kode) VALUES ('Gedung Ubah', '${kode("GU")}') RETURNING id::text`);
        const [a] = await kueri<{ id: string }>(`INSERT INTO areas (building_id, nama, kode) VALUES (${String(g?.id)}, 'A', '${kode("AU")}') RETURNING id::text`);
        const [r] = await kueri<{ id: string }>(`INSERT INTO rooms (area_id, nama, kode, jenis) VALUES (${String(a?.id)}, 'R', '${kode("RU")}', 'KELAS') RETURNING id::text`);
        ruang = r?.id ?? "";
        const [k] = await kueri<{ id: string }>(`INSERT INTO asset_categories (nama, kode) VALUES ('Proyektor Ubah', '${kode("KU")}') RETURNING id::text`);
        kategori = k?.id ?? "";
    });
    beforeEach(async () => {
        sejakLog = Number((await kueri<{ n: string }>("SELECT coalesce(max(id), 0)::text AS n FROM activity_logs"))[0]?.n);
    });
    afterAll(async () => {
        await new Promise<void>((r) => server.close(() => r()));
        await kueri(`DELETE FROM asset_condition_history WHERE asset_id IN (SELECT id FROM assets WHERE category_id = ${kategori})`);
        await kueri(`DELETE FROM assets WHERE category_id = ${kategori}`);
        await kueri(`DELETE FROM asset_code_counters WHERE category_id = ${kategori}`);
        await kueri(`DELETE FROM asset_categories WHERE id = ${kategori}`);
        await kueri(`DELETE FROM users WHERE id = ${String(pengguna)}`);
    });

    type Balasan = { status: number; json: { data?: Record<string, unknown>; error?: { code: string; details?: { field: string }[] } } };
    const minta = async (metode: string, path: string, perms: readonly string[], body?: unknown): Promise<Balasan> => {
        const res = await fetch(`${url}${path}`, { method: metode, headers: { "x-uji-perms": perms.join(","), "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
        return { status: res.status, json: (await res.json()) as Balasan["json"] };
    };
    const buat = async (nomorSeri: string | null = null) => {
        const r = await minta("POST", "/assets", PETUGAS, { nama: "Proyektor Aula", category_id: Number(kategori), merek: "Epson", nomor_seri: nomorSeri, tahun_perolehan: 2023, sumber_perolehan: "PEMBELIAN", nilai_perolehan: 5_000_000, room_id: Number(ruang), kondisi: "BAIK" });
        expect(r.status).toBe(201);
        return (r.json.data as unknown as { id: string; kode_barang: string }[])[0]!;
    };
    const atribut = { nama: "Proyektor Aula Utama", merek: "Epson", model: "EB-X51", nomor_seri: null, tahun_perolehan: 2023, dapat_dipinjam: true, boleh_dipinjam_siswa: false, penanggung_jawab_id: null };
    const baris = async (id: string) => (await kueri<Record<string, unknown>>(`SELECT nama, model, kondisi, status, kode_barang, room_id::text, category_id::text, nilai_perolehan::text FROM assets WHERE id = ${id}`))[0];
    const log = (aksi: string) => kueri<{ nilai_sebelum: unknown; nilai_sesudah: unknown }>(`SELECT nilai_sebelum, nilai_sesudah FROM activity_logs WHERE aksi = '${aksi}' AND id > ${String(sejakLog)} ORDER BY id`);

    it("atribut deskriptif diperbarui; kode, lokasi, kategori tetap; ASSET_UPDATED hanya field yang berubah (AL-01)", async () => {
        const a = await buat();
        const r = await minta("PUT", `/assets/${a.id}`, PETUGAS, atribut);
        expect(r.status).toBe(200);
        expect(r.json.data).toMatchObject({ id: a.id, nama: "Proyektor Aula Utama", model: "EB-X51", kode_barang: a.kode_barang });
        expect(await baris(a.id)).toMatchObject({ nama: "Proyektor Aula Utama", model: "EB-X51", kode_barang: a.kode_barang, room_id: ruang, category_id: kategori, nilai_perolehan: "5000000.00" });
        expect(await log("ASSET_UPDATED")).toEqual([{ nilai_sebelum: { nama: "Proyektor Aula", model: null }, nilai_sesudah: { nama: "Proyektor Aula Utama", model: "EB-X51" } }]);
        // Tanpa perubahan → tanpa entri log baru.
        expect((await minta("PUT", `/assets/${a.id}`, PETUGAS, atribut)).status).toBe(200);
        expect(await log("ASSET_UPDATED")).toHaveLength(1);
    });

    it("kondisi berubah + alasan → riwayat, status turunan, log kondisi — satu transaksi (FR-04.3 A1)", async () => {
        const a = await buat();
        const r = await minta("PUT", `/assets/${a.id}`, PETUGAS, { ...atribut, kondisi: "RUSAK_BERAT", alasan: "Lampu proyektor pecah" });
        expect(r.status).toBe(200);
        expect(await baris(a.id)).toMatchObject({ nama: "Proyektor Aula Utama", kondisi: "RUSAK_BERAT", status: "TIDAK_TERSEDIA" });
        expect(await kueri(`SELECT kondisi_lama, kondisi_baru, alasan FROM asset_condition_history WHERE asset_id = ${a.id}`)).toEqual([{ kondisi_lama: "BAIK", kondisi_baru: "RUSAK_BERAT", alasan: "Lampu proyektor pecah" }]);
        expect(await log("ASSET_CONDITION_CHANGED")).toHaveLength(1);
        expect(await log("ASSET_STATUS_CHANGED")).toHaveLength(1);
    });

    it("kondisi berubah tanpa alasan → 422 alasan dan TIDAK ada atribut yang berubah (atomik, BR-007)", async () => {
        const a = await buat();
        const r = await minta("PUT", `/assets/${a.id}`, PETUGAS, { ...atribut, kondisi: "RUSAK_RINGAN" });
        expect(r.status).toBe(422);
        expect(r.json.error?.details?.[0]?.field).toBe("alasan");
        expect(await baris(a.id)).toMatchObject({ nama: "Proyektor Aula", kondisi: "BAIK" });
        expect(await log("ASSET_UPDATED")).toEqual([]);
    });

    it("kondisi sama tanpa alasan diterima; kondisi berubah tanpa asset.update_condition → 403, tak ada yang berubah", async () => {
        const a = await buat();
        expect((await minta("PUT", `/assets/${a.id}`, TANPA_KONDISI, { ...atribut, kondisi: "BAIK" })).status).toBe(200);
        const r = await minta("PUT", `/assets/${a.id}`, TANPA_KONDISI, { ...atribut, nama: "Diubah", kondisi: "RUSAK_RINGAN", alasan: "x" });
        expect(r.status).toBe(403);
        expect(await baris(a.id)).toMatchObject({ nama: "Proyektor Aula Utama", kondisi: "BAIK" });
    });

    it("BR-073: data perolehan hanya dapat diubah pemegang asset.view_financial", async () => {
        const a = await buat();
        expect((await minta("PUT", `/assets/${a.id}`, TANPA_KONDISI, { ...atribut, sumber_perolehan: "HIBAH", nilai_perolehan: 1 })).status).toBe(403);
        expect((await minta("PUT", `/assets/${a.id}`, PETUGAS, { ...atribut, sumber_perolehan: "HIBAH", nilai_perolehan: 7_250_000 })).status).toBe(200);
        expect(await baris(a.id)).toMatchObject({ nilai_perolehan: "7250000.00" });
    });

    it("lokasi/kategori/kode tidak diterima (400); nomor seri milik aset lain → 409 DUPLICATE_CODE; milik sendiri boleh", async () => {
        const a = await buat(kode("SN-A"));
        const b = await buat();
        for (const lain of [{ room_id: 1 }, { category_id: 1 }, { kode_barang: "X" }]) expect((await minta("PUT", `/assets/${a.id}`, PETUGAS, { ...atribut, ...lain })).status).toBe(400);
        const nomorA = (await kueri<{ s: string }>(`SELECT nomor_seri AS s FROM assets WHERE id = ${a.id}`))[0]?.s ?? "";
        const dup = await minta("PUT", `/assets/${b.id}`, PETUGAS, { ...atribut, nomor_seri: nomorA });
        expect(dup.status).toBe(409);
        expect(dup.json.error?.code).toBe("DUPLICATE_CODE");
        expect((await minta("PUT", `/assets/${a.id}`, PETUGAS, { ...atribut, nomor_seri: nomorA })).status).toBe(200);
    });

    it("boleh_dipinjam_siswa tanpa dapat_dipinjam → 422; terhapuskan → 422; tak ada → 404; tanpa asset.update → 403", async () => {
        const a = await buat();
        expect((await minta("PUT", `/assets/${a.id}`, PETUGAS, { ...atribut, dapat_dipinjam: false, boleh_dipinjam_siswa: true })).status).toBe(422);
        await kueri(`UPDATE assets SET dihapuskan = true, tanggal_penghapusan = now() WHERE id = ${a.id}`);
        expect((await minta("PUT", `/assets/${a.id}`, PETUGAS, atribut)).status).toBe(422);
        expect((await minta("PUT", "/assets/999999999", PETUGAS, atribut)).status).toBe(404);
        expect((await minta("PUT", `/assets/${a.id}`, ["asset.view"], atribut)).status).toBe(403);
    });
});
