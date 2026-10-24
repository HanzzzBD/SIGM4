// FR-08.1, AV-01…05, CI-01: HTTP penuh dan PostgreSQL nyata di DB uji terisolasi.
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { performance } from "node:perf_hooks";
import express from "express";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { AssetAvailabilityResponseSchema } from "@sigm4/schemas";
import { createApp } from "../../src/api/index.js";
import { AMR_OTP, createAuthContext, setAmr, setAuthContext } from "../../src/shared/auth/index.js";
import type { Scope } from "../../src/shared/auth/index.js";
import { SlotService } from "../../src/shared/booking/index.js";
import { FixedClock } from "../../src/shared/clock/index.js";
import { closeDb, getDb, withTransaction } from "../../src/shared/db/index.js";
import { Logger, HealthRegistry } from "../../src/shared/observability/index.js";
import type { PenyimpananObjek } from "../../src/shared/storage/index.js";
import { mapError } from "../../src/shared/errors/index.js";
import { authPalsu } from "../helpers/auth.js";
import { dbmate, kueri } from "../helpers/db.js";

const clock = new FixedClock(new Date("2027-03-01T00:00:00Z"));
const booking = new SlotService(clock);
const marker = `AVL${randomUUID().slice(0, 8)}`;
const start = "2027-03-02T08:00:00+07:00", end = "2027-03-02T17:00:00+07:00";
const params = new URLSearchParams({ dari: start, sampai: end });

describe.skipIf(!process.env["DATABASE_URL"])("PR-04-01 — ketersediaan aset", () => {
    let server: Server | undefined, base = "", user = "", room = "", category = "";
    const assets: Record<string, string> = {};
    const ctx = () => createAuthContext({ userId: Number(user), roleCode: "R-02", scopes: new Map([["reservation.view", "all"]]) });
    const storage: PenyimpananObjek = { urlUnduh: async (key) => `https://storage.test/${key}`, urlUnggah: async () => "", info: async () => null, ambil: async () => null, simpan: async () => undefined, hapus: async () => undefined, periksa: async () => undefined };
    const idOf = async (sql: string) => (await kueri<{ id: string }>(sql))[0]!.id;
    beforeAll(async () => {
        dbmate("up");
        user = await idOf(`INSERT INTO users (nama,email,password_hash,nip_nis,role_id,status,must_change_password) VALUES ('Uji Ketersediaan','${marker}@test.sch.id','x','${marker}',(SELECT id FROM roles WHERE kode='R-01'),'AKTIF',false) RETURNING id::text`);
        const building = await idOf(`INSERT INTO buildings (nama,kode) VALUES ('Uji','${marker}') RETURNING id::text`);
        const area = await idOf(`INSERT INTO areas (building_id,nama,kode) VALUES (${building},'Uji','${marker}') RETURNING id::text`);
        room = await idOf(`INSERT INTO rooms (area_id,nama,kode,jenis) VALUES (${area},'Uji','${marker}','GUDANG') RETURNING id::text`);
        category = await idOf(`INSERT INTO asset_categories (nama,kode) VALUES ('Kategori ${marker}','${marker}') RETURNING id::text`);
        for (const [key, condition, status, borrow, student, deleted] of [
            ["free", "BAIK", "DIPINJAM", true, true, false], ["tentative", "RUSAK_RINGAN", "TERSEDIA", true, true, false],
            ["confirmed", "BAIK", "TERSEDIA", true, true, false], ["active", "BAIK", "DIPINJAM", true, true, false],
            ["maintenance", "BAIK", "TERSEDIA", true, true, false], ["fixed", "BAIK", "TERSEDIA", true, true, false],
            ["released", "BAIK", "TERSEDIA", true, true, false], ["staff", "BAIK", "TERSEDIA", true, false, false],
            ["heavy", "RUSAK_BERAT", "TERSEDIA", true, true, false], ["lost", "HILANG", "TIDAK_TERSEDIA", true, true, false],
            ["repair", "BAIK", "DALAM_PERBAIKAN", true, true, false], ["unavailable", "BAIK", "TIDAK_TERSEDIA", true, true, false],
            ["private", "BAIK", "TERSEDIA", false, false, false], ["deleted", "BAIK", "TERSEDIA", true, true, true],
            ["race", "BAIK", "TERSEDIA", true, true, false],
        ] as const) assets[key] = await idOf(`INSERT INTO assets (kode_barang,nama,category_id,tahun_perolehan,sumber_perolehan,room_id,kondisi,status,dapat_dipinjam,boleh_dipinjam_siswa,dihapuskan) VALUES ('${marker}-${key}','${marker}-${key}',${category},2026,'PEMBELIAN',${room},'${condition}','${status}',${String(borrow)},${String(student)},${String(deleted)}) RETURNING id::text`);
        for (const key of ["tentative", "confirmed", "active", "maintenance", "fixed", "released"]) await kueri(`INSERT INTO booking_slots (resource_type,resource_id,slot_range,status,origin,expires_at) VALUES ('asset',${assets[key]},tstzrange('${start}','2027-03-03T08:00:00+07:00','[)'), '${key === "tentative" ? "TENTATIVE" : key === "active" ? "ACTIVE" : key === "released" ? "RELEASED" : "CONFIRMED"}', '${key === "maintenance" ? "maintenance" : key === "fixed" ? "fixed_schedule" : "reservation"}', '2027-03-04T00:00:00Z')`);
        // Rentang hari ini tidak menutup pinjaman mendatang; batas akhir berdempetan bebas.
        await kueri(`INSERT INTO booking_slots (resource_type,resource_id,slot_range,status,origin) VALUES ('asset',${assets["free"]},tstzrange('2027-03-01T08:00:00+07:00','${start}','[)'),'ACTIVE','loan')`);
        for (const [key, scan, checksum] of [["free", "CLEAN", `'${"a".repeat(64)}'`], ["staff", "INFECTED", `'${"b".repeat(64)}'`], ["released", "CLEAN", "NULL"]] as const) {
            const file = await idOf(`INSERT INTO stored_files (object_key,mime,ukuran,scan_status,checksum,owner_type,owner_id,uploaded_by,thumb_key) VALUES ('${marker}-${key}.jpg','image/jpeg',100,'${scan}',${checksum},'ASSET_PHOTO',${assets[key]},${user},'${marker}-${key}-thumb.jpg') RETURNING id::text`);
            await kueri(`INSERT INTO asset_photos (asset_id,file_id,diunggah_oleh,is_primary) VALUES (${assets[key]},${file},${user},true)`);
        }
        const app = createApp({ appBaseUrl: "https://sigm4.test", db: getDb(), clock, logger: new Logger({ clock, tulis: () => undefined }), health: new HealthRegistry(30), limiter: { hit: async () => ({ lolos: true, batas: 1000, sisa: 999, resetDetik: 60 }) }, security: { objectStorageOrigin: "https://storage.test" }, auth: authPalsu(), penyimpanan: storage });
        const outer = express();
        outer.use((req, res, next) => { const permission = req.header("x-permission") ?? "reservation.view"; const scope = (req.header("x-scope") ?? "all") as Scope; setAuthContext(res, createAuthContext({ userId: Number(user), roleCode: scope === "restricted" ? "R-07" : "R-02", scopes: new Map([[permission, scope]]) })); setAmr(res, ["pwd", AMR_OTP]); next(); });
        outer.use(app);
        server = createServer(outer);
        await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
        base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1/assets/availability`;
    }, 120000);
    afterAll(async () => { if (server) await new Promise<void>((resolve) => server!.close(() => resolve())); await closeDb(); });
    const request = async (patch: Record<string, string> = {}, headers: Record<string, string> = {}) => {
        const q = new URLSearchParams(params); q.set("q", marker); for (const [key, value] of Object.entries(patch)) q.set(key, value);
        return fetch(`${base}?${q.toString()}`, { headers });
    };
    const read = async (patch: Record<string, string> = {}, headers: Record<string, string> = {}) => { const res = await request(patch, headers); expect(res.status).toBe(200); return AssetAvailabilityResponseSchema.parse(await res.json()); };
    it("hanya reservation.view; tidak membutuhkan asset.view, serta no-store", async () => { const res = await request(); expect(res.status).toBe(200); expect(res.headers.get("cache-control")).toBe("no-store"); expect((await request({}, { "x-permission": "asset.view" })).status).toBe(403); });
    it("status operasional DIPINJAM tetap tersedia di masa depan dan RELEASED tidak menghalangi", async () => { const data = await read(); for (const key of ["free", "released"]) expect(data.data.kelompok.find((g) => g.unit[0]?.id === assets[key])?.jumlah_tersedia).toBe(1); });
    it("seluruh jenis slot aktif menghalangi; saran dengan durasi sama", async () => { const data = await read(); for (const key of ["tentative", "confirmed", "active", "maintenance", "fixed"]) expect(data.data.kelompok.find((g) => g.unit[0]?.id === assets[key])).toMatchObject({ jumlah_tersedia: 0, tersedia_mulai: "2027-03-03T01:00:00.000Z" }); });
    it("menyaring kelayakan, penghapusan, dan katalog siswa", async () => { const data = await read({}, { "x-scope": "restricted" }); for (const key of ["staff", "heavy", "lost", "repair", "unavailable", "private", "deleted"]) expect(data.data.kelompok.some((g) => g.unit.some((u) => u.id === assets[key]))).toBe(false); });
    it("hanya menampilkan foto CLEAN terkonfirmasi; turunan thumb digunakan", async () => { const data = await read(); expect(data.data.kelompok.find((g) => g.unit[0]?.id === assets["free"])?.foto_url).toBe(`https://storage.test/${marker}-free-thumb.jpg`); for (const key of ["staff", "released"]) expect(data.data.kelompok.find((g) => g.unit[0]?.id === assets[key])?.foto_url).toBeNull(); });
    it("saringan kategori/nama/hanya tersedia, urutan dan pagination", async () => { const all = await read({ kategori_id: category, hanya_tersedia: "true", per_page: "1", sort: "-nama" }); expect(all.data.kelompok).toHaveLength(1); expect(all.data.kelompok[0]?.jumlah_tersedia).toBe(1); expect(all.meta.total).toBeGreaterThan(1); const next = await read({ kategori_id: category, hanya_tersedia: "true", per_page: "1", sort: "-nama", page: "2" }); expect(next.data.kelompok[0]?.key).not.toBe(all.data.kelompok[0]?.key); expect((await read({ kategori_id: "999999" })).data.kelompok).toEqual([]); });
    it("menolak rentang kosong/terbalik/di luar horizon dan query buruk", async () => { for (const patch of [{ sampai: start }, { sampai: "2027-03-01T08:00:00+07:00" }, { dari: "2028-03-01T08:00:00+07:00", sampai: "2028-03-02T08:00:00+07:00" }, { kategori_id: "NaN" }]) expect((await request(patch)).status).toBe(422); });
    it("50 permintaan pada unit terakhir → 1 sukses, 49 ASSET_NOT_AVAILABLE; SlotService tanpa perubahan", async () => {
        const results = await Promise.allSettled(Array.from({ length: 50 }, () => withTransaction(ctx(), (scope) => booking.reserve(scope, { sumberDaya: [{ jenis: "asset", id: Number(assets["race"]) }], rentang: { mulai: new Date(start), selesai: new Date(end) }, asal: "reservation", status: "CONFIRMED" }), getDb())));
        expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
        const failed = results.filter((r) => r.status === "rejected"); expect(failed).toHaveLength(49); for (const result of failed) if (result.status === "rejected") expect(mapError(result.reason)).toMatchObject({ status: 409, kode: "ASSET_NOT_AVAILABLE" });
    });
    it("mengikuti horizon konfigurasi; tidak menyarankan rentang yang melewati batasnya", async () => {
        const original = (await kueri<{ value: number }>("SELECT value FROM system_settings WHERE key='reservasi.horizon_hari'"))[0]!.value;
        try {
            await kueri("UPDATE system_settings SET value='1' WHERE key='reservasi.horizon_hari'");
            const data = await read();
            expect(data.data.kelompok.find((g) => g.unit[0]?.id === assets["tentative"])?.tersedia_mulai).toBeNull();
            expect((await request({ dari: "2027-03-04T08:00:00+07:00", sampai: "2027-03-04T17:00:00+07:00" })).status).toBe(422);
        } finally { await kueri(`UPDATE system_settings SET value='${String(original)}' WHERE key='reservasi.horizon_hari'`); }
    });
    it("AV-03: 5000 aset dan rentang 30 hari selesai ≤2 detik", async () => {
        await kueri(`INSERT INTO assets (kode_barang,nama,category_id,tahun_perolehan,sumber_perolehan,room_id,kondisi,dapat_dipinjam,boleh_dipinjam_siswa) SELECT '${marker}-perf-'||n, '${marker}-Performa-'||(n%100), ${category},2026,'PEMBELIAN',${room},'BAIK',true,true FROM generate_series(1,5000) n`);
        const began = performance.now(); const data = await read({ q: `${marker}-Performa`, sampai: "2027-04-01T08:00:00+07:00", per_page: "100" }); const elapsed = performance.now() - began;
        expect(data.data.kelompok.reduce((sum, g) => sum + g.jumlah_unit, 0)).toBe(5000); expect(elapsed).toBeLessThanOrEqual(2000); console.info(`AV-03: 5000 aset/30 hari ${elapsed.toFixed(1)} ms (HTTP lokal)`);
    }, 30000);
});
