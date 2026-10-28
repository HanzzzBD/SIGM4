// Acceptance PR-03-14 (FR-11.1, BR-044; keputusan 20 log phase-03): pelaporan kerusakan lewat `createApp()`
// terhadap PostgreSQL nyata — tiket bernomor KRS, foto tertunda (A2), penolakan duplikat (A1) termasuk
// balapan, dan NT-19/NT-20 lewat JALUR WORKER (konsumen outbox M-17).
//
// Pesanan berkas `stored_files` disisipkan langsung: presign/confirm milik M-06 sudah diuji tersendiri;
// yang diuji di sini aturan penautannya (milik pelapor, jenis DAMAGE_PHOTO, belum dipakai, tak terinfeksi).

import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { DamageReportCreated, DamageReportOpen } from "@sigm4/schemas";
import express from "express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../src/api/index.js";
import { fcmCheck, pasangKonsumenNotifikasi } from "../../src/modules/m17-notifications/index.js";
import { AMR_OTP, createAuthContext, setAmr, setAuthContext } from "../../src/shared/auth/index.js";
import type { Scope } from "../../src/shared/auth/index.js";
import { createSystemAuthContext } from "../../src/shared/auth/system-context.js";
import { FixedClock } from "../../src/shared/clock/index.js";
import { getDb } from "../../src/shared/db/index.js";
import { EventHandlerRegistry, OutboxDispatcher } from "../../src/shared/events/index.js";
import { HealthRegistry, Logger } from "../../src/shared/observability/index.js";
import { authPalsu } from "../helpers/auth.js";
import { dbmate, kueri } from "../helpers/db.js";

// Dilewati hanya tanpa basis data; prasyarat lain yang hilang = FAILED (templates/PULL-REQUEST.md).
const ADA = process.env["DATABASE_URL"] !== undefined;
const clock = new FixedClock(new Date("2027-11-08T03:00:00Z"));
const unik = (a: string) => `KRS${a}${randomUUID().slice(0, 6)}`;

interface Peran {
    readonly id: number;
    readonly perms: readonly string[];
}
type Jawaban<T> = { status: number; json: { success: boolean; data: T; error?: { code: string; message: string; details?: { field: string; message: string }[] } } };

describe.skipIf(!ADA)("PR-03-14 — laporan kerusakan (acceptance)", () => {
    let server: Server;
    let url = "";
    let gedung = "";
    let area = "";
    let kategori = "";
    const ruang = { aset: "", lapor: "", nonaktif: "", balap: "" };
    const aset = { proyektor: "", kursi: "", dihapus: "" };
    const pengguna: Record<"guru" | "guruLain" | "petugas" | "petugasLain" | "pimpinan" | "tanpaIzin", Peran> = {} as never;

    it("lingkungannya lengkap — REDIS_URL ada saat DATABASE_URL ada", () => {
        expect(process.env["REDIS_URL"], "REDIS_URL wajib diisi: lingkungan integrasi API memakai Redis.").toBeDefined();
    });

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
            setAuthContext(res, createAuthContext({ userId: Number(req.header("x-uji-user")), roleCode: "R-05", scopes: new Map<string, Scope>(perms.map((p) => [p.split(":")[0]!, (p.split(":")[1] ?? "all") as Scope])) }));
            setAmr(res, ["pwd", AMR_OTP]);
            next();
        });
        luar.use(app);
        server = createServer(luar);
        await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
        url = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}/api/v1`;

        const buat = async (role: string, nama: string, perms: readonly string[]): Promise<Peran> => {
            const [u] = await kueri<{ id: string }>(`
                INSERT INTO users (nama, email, password_hash, nip_nis, role_id, status, must_change_password)
                VALUES ('${nama}', '${unik("u")}@uji-m11.sch.id', 'x', '${unik("N")}', (SELECT id FROM roles WHERE kode = '${role}'), 'AKTIF', false) RETURNING id::text`);
            return { id: Number(u?.id), perms };
        };
        const PELAPOR = ["damage.create", "damage.view:own"];
        const SARPRAS = ["damage.create", "damage.view", "damage.verify"];
        pengguna.guru = await buat("R-05", "Pak Budi Pelapor", PELAPOR);
        pengguna.guruLain = await buat("R-05", "Bu Ani Guru", PELAPOR);
        pengguna.petugas = await buat("R-02", "Bu Sari Petugas", SARPRAS);
        pengguna.petugasLain = await buat("R-02", "Pak Joko Petugas", SARPRAS);
        pengguna.pimpinan = await buat("R-03", "Bu Kepala Sekolah", ["damage.create", "damage.view"]);
        pengguna.tanpaIzin = await buat("R-05", "Tanpa Izin", []);

        const [g] = await kueri<{ id: string }>(`INSERT INTO buildings (nama, kode) VALUES ('Gedung B Uji Kerusakan', '${unik("G")}') RETURNING id::text`);
        gedung = g?.id ?? "";
        const [a] = await kueri<{ id: string }>(`INSERT INTO areas (building_id, nama, kode) VALUES (${gedung}, 'Lt 2', '${unik("A")}') RETURNING id::text`);
        area = a?.id ?? "";
        const ruangan = async (nama: string, status = "AKTIF") =>
            (await kueri<{ id: string }>(`INSERT INTO rooms (area_id, nama, kode, jenis, kapasitas, status) VALUES (${area}, '${nama}', '${unik("R")}', 'LABORATORIUM', 30, '${status}') RETURNING id::text`))[0]?.id ?? "";
        ruang.aset = await ruangan("Lab Komputer 1");
        ruang.lapor = await ruangan("Lab Kimia");
        ruang.nonaktif = await ruangan("Gudang Lama", "NONAKTIF");
        ruang.balap = await ruangan("Lab Fisika");
        kategori = (await kueri<{ id: string }>(`INSERT INTO asset_categories (nama, kode) VALUES ('Elektronik Uji', '${unik("K")}') RETURNING id::text`))[0]?.id ?? "";
        const barang = async (nama: string, dihapuskan = false) =>
            (await kueri<{ id: string }>(`INSERT INTO assets (kode_barang, nama, category_id, tahun_perolehan, sumber_perolehan, room_id, kondisi, dihapuskan)
                VALUES ('${unik("B")}', '${nama}', ${kategori}, 2024, 'PEMBELIAN', ${ruang.aset}, 'BAIK', ${String(dihapuskan)}) RETURNING id::text`))[0]?.id ?? "";
        aset.proyektor = await barang("Proyektor Epson");
        aset.kursi = await barang("Kursi Lab");
        aset.dihapus = await barang("Printer Rusak", true);
    });

    afterAll(async () => {
        await new Promise<void>((r) => server.close(() => r()));
        const ids = Object.values(pengguna).map((p) => p.id).join(",");
        const laporan = `SELECT id FROM damage_reports WHERE pelapor_id IN (${ids})`;
        await kueri(`DELETE FROM notifications WHERE user_id IN (${ids}) OR (referensi_jenis = 'damage_report' AND referensi_id IN (${laporan}))`);
        await kueri(`DELETE FROM event_outbox WHERE aggregate_type = 'damage_report' AND aggregate_id::bigint IN (${laporan})`);
        await kueri(`DELETE FROM damage_report_photos WHERE damage_report_id IN (${laporan})`);
        await kueri(`DELETE FROM damage_reports WHERE pelapor_id IN (${ids})`);
        await kueri(`DELETE FROM stored_files WHERE uploaded_by IN (${ids})`);
        await kueri(`DELETE FROM assets WHERE category_id = ${kategori}`);
        await kueri(`DELETE FROM asset_categories WHERE id = ${kategori}`);
        await kueri(`DELETE FROM rooms WHERE area_id = ${area}`);
        await kueri(`DELETE FROM areas WHERE id = ${area}`);
        await kueri(`DELETE FROM buildings WHERE id = ${gedung}`);
        await kueri(`DELETE FROM users WHERE id IN (${ids})`);
    });

    async function kirim<T>(metode: "GET" | "POST", path: string, siapa: Peran, body?: unknown): Promise<Jawaban<T>> {
        const r = await fetch(`${url}${path}`, {
            method: metode,
            headers: { "content-type": "application/json", "x-uji-user": String(siapa.id), "x-uji-perms": siapa.perms.join(",") },
            ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
        return { status: r.status, json: (await r.json()) as Jawaban<T>["json"] };
    }
    const lapor = (siapa: Peran, body: Record<string, unknown>) => kirim<DamageReportCreated>("POST", "/damage-reports", siapa, body);
    const terbuka = (siapa: Peran, q: string) => kirim<DamageReportOpen | null>("GET", `/damage-reports/open?${q}`, siapa);

    /** Pesanan berkas (SDD-09 §4.2 langkah 1); `terkonfirmasi` = checksum terisi (langkah 3). */
    async function foto(siapa: Peran, o: { terkonfirmasi?: boolean; jenis?: string; scan?: string } = {}): Promise<number> {
        const [b] = await kueri<{ id: string }>(`INSERT INTO stored_files (object_key, mime, ukuran, checksum, scan_status, owner_type, uploaded_by)
            VALUES ('damage/2027/11/${randomUUID()}.jpg', 'image/jpeg', 2048, ${o.terkonfirmasi === true ? `'${"a".repeat(64)}'` : "NULL"},
                '${o.scan ?? "PENDING"}', '${o.jenis ?? "DAMAGE_PHOTO"}', ${String(siapa.id)}) RETURNING id::text`);
        return Number(b?.id);
    }
    const pelaku = createSystemAuthContext("uji-m11");
    const drain = () => {
        const registry = new EventHandlerRegistry();
        pasangKonsumenNotifikasi(registry, { db: getDb, clock, ctx: () => pelaku });
        return new OutboxDispatcher({ registry, clock, db: getDb(), logger: new Logger({ clock, tulis: () => undefined }) }).drain();
    };
    const notifikasi = (reportId: string) =>
        kueri<{ user_id: string; kode: string; isi: string; deep_link: string | null }>(
            `SELECT user_id::text, kode, isi, deep_link FROM notifications WHERE referensi_jenis = 'damage_report' AND referensi_id = ${reportId} ORDER BY user_id`,
        );
    const jumlahTiket = async () => Number((await kueri<{ n: string }>(`SELECT count(*)::text AS n FROM damage_reports WHERE pelapor_id IN (${Object.values(pengguna).map((p) => p.id).join(",")})`))[0]?.n);

    describe("otorisasi (m11 §7, PM-01)", () => {
        it("tanpa damage.create → 403 di gerbang route; tanpa damage.view → GET /open 403", async () => {
            const f = await foto(pengguna.tanpaIzin);
            expect((await lapor(pengguna.tanpaIzin, { asset_id: Number(aset.kursi), deskripsi: "Kaki patah", urgensi: "RENDAH", foto_file_ids: [f] })).status).toBe(403);
            expect((await terbuka(pengguna.tanpaIzin, `asset_id=${aset.kursi}`)).status).toBe(403);
            expect(await jumlahTiket()).toBe(0);
        });
    });

    describe("validasi isian & BR-044", () => {
        it("tanpa foto → 422 pada foto_file_ids (BR-044); tak ada tiket", async () => {
            const r = await lapor(pengguna.guru, { asset_id: Number(aset.kursi), deskripsi: "Kaki patah", urgensi: "RENDAH", foto_file_ids: [] });
            expect(r.status).toBe(422);
            expect(r.json.error?.details?.map((d) => d.field)).toContain("foto_file_ids");
            const tanpa = await lapor(pengguna.guru, { asset_id: Number(aset.kursi), deskripsi: "Kaki patah", urgensi: "RENDAH" });
            expect(tanpa.status).toBe(422);
            expect(await jumlahTiket()).toBe(0);
        });

        it("objek harus tepat satu, terdaftar, belum dihapuskan / ruangan aktif (Preconditions, A4)", async () => {
            const f = await foto(pengguna.guru);
            const isi = { deskripsi: "Rusak", urgensi: "SEDANG", foto_file_ids: [f] };
            const dua = await lapor(pengguna.guru, { ...isi, asset_id: Number(aset.kursi), room_id: Number(ruang.lapor) });
            expect(dua.status).toBe(422);
            expect((await lapor(pengguna.guru, isi)).status).toBe(422);
            const dihapus = await lapor(pengguna.guru, { ...isi, asset_id: Number(aset.dihapus) });
            expect([dihapus.status, dihapus.json.error?.details?.[0]?.field]).toEqual([422, "asset_id"]);
            const nonaktif = await lapor(pengguna.guru, { ...isi, room_id: Number(ruang.nonaktif) });
            expect([nonaktif.status, nonaktif.json.error?.details?.[0]?.field]).toEqual([422, "room_id"]);
            expect(await jumlahTiket()).toBe(0);
        });

        it("foto milik orang lain, berjenis lain, atau terinfeksi → 422; transaksi bergulung (nomor & tiket tak tersisa)", async () => {
            const isi = { asset_id: Number(aset.kursi), deskripsi: "Rusak", urgensi: "SEDANG" };
            for (const f of [await foto(pengguna.guruLain), await foto(pengguna.guru, { jenis: "ASSET_DOCUMENT" }), await foto(pengguna.guru, { scan: "INFECTED" })]) {
                const r = await lapor(pengguna.guru, { ...isi, foto_file_ids: [await foto(pengguna.guru), f] });
                expect([r.status, r.json.error?.details?.[0]?.field]).toEqual([422, "foto_file_ids"]);
            }
            expect(await jumlahTiket()).toBe(0);
            expect(await kueri(`SELECT 1 FROM stored_files WHERE uploaded_by = ${String(pengguna.guru.id)} AND owner_id IS NOT NULL`)).toEqual([]);
        });
    });

    describe("FR-11.1 jalur utama + A2 + NT-19", () => {
        let tiket: DamageReportCreated;
        const fotoIds: number[] = [];

        it("tiket DILAPORKAN bernomor KRS, foto tertaut berurutan, foto belum terkonfirmasi dihitung tertunda; kondisi aset tak berubah", async () => {
            fotoIds.push(await foto(pengguna.guru, { terkonfirmasi: true }), await foto(pengguna.guru));
            const r = await lapor(pengguna.guru, { asset_id: Number(aset.proyektor), deskripsi: "Lampu proyektor mati total.", urgensi: "TINGGI", foto_file_ids: fotoIds });
            expect(r.status).toBe(201);
            tiket = r.json.data;
            expect(tiket.nomor).toMatch(/^KRS-2027-\d{4,}$/);
            expect([tiket.status, tiket.foto_tertunda]).toEqual(["DILAPORKAN", 1]);

            const [baris] = await kueri<{ status: string; urgensi: string; pelapor_id: string; asset_id: string; room_id: string | null }>(
                `SELECT status::text, urgensi::text, pelapor_id::text, asset_id::text, room_id::text FROM damage_reports WHERE id = ${tiket.id}`,
            );
            expect(baris).toEqual({ status: "DILAPORKAN", urgensi: "TINGGI", pelapor_id: String(pengguna.guru.id), asset_id: aset.proyektor, room_id: null });
            expect(await kueri(`SELECT file_id::text, urutan FROM damage_report_photos WHERE damage_report_id = ${tiket.id} ORDER BY urutan`)).toEqual(
                fotoIds.map((f, i) => ({ file_id: String(f), urutan: i + 1 })),
            );
            expect(await kueri(`SELECT owner_id::text FROM stored_files WHERE id IN (${fotoIds.join(",")})`)).toEqual([{ owner_id: tiket.id }, { owner_id: tiket.id }]);
            expect((await kueri<{ kondisi: string }>(`SELECT kondisi::text FROM assets WHERE id = ${aset.proyektor}`))[0]?.kondisi).toBe("BAIK");
            const [log] = await kueri<{ aksi: string; entitas_id: string }>(`SELECT aksi, entitas_id::text FROM activity_logs WHERE aksi = 'DAMAGE_REPORTED' AND entitas_id = '${tiket.id}'`);
            expect(log?.aksi).toBe("DAMAGE_REPORTED");
        });

        it("NT-19 lewat konsumen outbox ke setiap Petugas Sarpras; Pimpinan & pelapor tidak; deep link P-41", async () => {
            await drain();
            const n = await notifikasi(tiket.id);
            const untuk = (p: Peran) => n.filter((x) => x.user_id === String(p.id));
            for (const p of [pengguna.petugas, pengguna.petugasLain]) {
                expect(untuk(p)).toEqual([{ user_id: String(p.id), kode: "NT-19", isi: `Laporan kerusakan ${tiket.nomor} atas Proyektor Epson (${await kodeBarang(aset.proyektor)}) dari Pak Budi Pelapor.`, deep_link: `/kerusakan/${tiket.id}` }]);
            }
            expect(untuk(pengguna.pimpinan)).toEqual([]);
            expect(untuk(pengguna.guru)).toEqual([]);
            expect(n.every((x) => x.kode === "NT-19")).toBe(true);
        });

        it("A1: tiket terbuka atas aset yang sama → 409 DUPLICATE_CODE menyebut nomornya; foto yang sudah dipakai ditolak", async () => {
            const r = await lapor(pengguna.guruLain, { asset_id: Number(aset.proyektor), deskripsi: "Proyektor mati", urgensi: "RENDAH", foto_file_ids: [await foto(pengguna.guruLain)] });
            expect([r.status, r.json.error?.code]).toEqual([409, "DUPLICATE_CODE"]);
            expect(r.json.error?.message).toContain(tiket.nomor);
            const ulang = await lapor(pengguna.guru, { asset_id: Number(aset.kursi), deskripsi: "Kaki patah", urgensi: "RENDAH", foto_file_ids: [fotoIds[0]] });
            expect([ulang.status, ulang.json.error?.details?.[0]?.field]).toEqual([422, "foto_file_ids"]);
        });

        it("GET /open: ringkasan tanpa identitas pelapor, termasuk bagi scope own pihak lain; null bila tak ada; objek tepat satu", async () => {
            const milik = await terbuka(pengguna.guru, `asset_id=${aset.proyektor}`);
            expect(milik.status).toBe(200);
            expect(milik.json.data).toEqual({ id: tiket.id, nomor: tiket.nomor, status: "DILAPORKAN", urgensi: "TINGGI", dilaporkan_pada: expect.any(String), milik_sendiri: true });
            const lain = await terbuka(pengguna.guruLain, `asset_id=${aset.proyektor}`);
            expect(lain.json.data?.milik_sendiri).toBe(false);
            expect(Object.keys(lain.json.data ?? {})).not.toContain("pelapor_id");
            expect((await terbuka(pengguna.guru, `asset_id=${aset.kursi}`)).json.data).toBeNull();
            expect((await terbuka(pengguna.guru, `asset_id=${aset.kursi}&room_id=${ruang.lapor}`)).status).toBe(422);
            expect((await terbuka(pengguna.guru, "")).status).toBe(422);
        });

        it("tiket yang sudah Selesai/Ditolak tidak lagi menghalangi laporan baru", async () => {
            await kueri(`UPDATE damage_reports SET status = 'SELESAI' WHERE id = ${tiket.id}`);
            expect((await terbuka(pengguna.guru, `asset_id=${aset.proyektor}`)).json.data).toBeNull();
            const baru = await lapor(pengguna.guruLain, { asset_id: Number(aset.proyektor), deskripsi: "Mati lagi", urgensi: "SEDANG", foto_file_ids: [await foto(pengguna.guruLain)] });
            expect(baru.status).toBe(201);
            expect(baru.json.data.nomor).not.toBe(tiket.nomor);
        });
    });

    describe("A4 ruangan + urgensi Kritis → NT-20 (keputusan 20d)", () => {
        it("Petugas melaporkan ruangan KRITIS: NT-20 ke Petugas lain + Pimpinan, tanpa NT-19, pelapor tak dinotifikasi", async () => {
            const r = await lapor(pengguna.petugas, { room_id: Number(ruang.lapor), deskripsi: "Plafon runtuh sebagian.", urgensi: "KRITIS", foto_file_ids: [await foto(pengguna.petugas, { terkonfirmasi: true })] });
            expect(r.status).toBe(201);
            expect(r.json.data.foto_tertunda).toBe(0);
            await drain();
            const n = await notifikasi(r.json.data.id);
            expect(n.some((x) => x.kode === "NT-19")).toBe(false);
            const kritis = "KRITIS: Lab Kimia di Gedung B Uji Kerusakan dilaporkan rusak berat.";
            for (const p of [pengguna.petugasLain, pengguna.pimpinan]) {
                expect(n.filter((x) => x.user_id === String(p.id))).toEqual([{ user_id: String(p.id), kode: "NT-20", isi: kritis, deep_link: `/kerusakan/${r.json.data.id}` }]);
            }
            expect(n.filter((x) => x.user_id === String(pengguna.petugas.id))).toEqual([]);
        });
    });

    describe("konkurensi A1", () => {
        it("dua pelapor bersamaan atas ruangan yang sama → satu 201, satu 409 DUPLICATE_CODE (indeks unik parsial)", async () => {
            const [a, b] = await Promise.all([
                lapor(pengguna.guru, { room_id: Number(ruang.balap), deskripsi: "Stop kontak gosong", urgensi: "TINGGI", foto_file_ids: [await foto(pengguna.guru)] }),
                lapor(pengguna.guruLain, { room_id: Number(ruang.balap), deskripsi: "Stop kontak berasap", urgensi: "TINGGI", foto_file_ids: [await foto(pengguna.guruLain)] }),
            ]);
            expect([a.status, b.status].sort()).toEqual([201, 409]);
            expect([a, b].find((x) => x.status === 409)?.json.error?.code).toBe("DUPLICATE_CODE");
            expect(await kueri(`SELECT 1 FROM damage_reports WHERE room_id = ${ruang.balap}`)).toHaveLength(1);
        });
    });

    async function kodeBarang(id: string): Promise<string> {
        return (await kueri<{ kode_barang: string }>(`SELECT kode_barang FROM assets WHERE id = ${id}`))[0]?.kode_barang ?? "";
    }
});
