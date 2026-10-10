// Acceptance PR-03-15 (FR-11.2, BR-045, BR-052; keputusan 21 log phase-03): detail tiket (foto, foto tertunda,
// garansi aktif, scope), verifikasi tiga hasil + kondisi aset atomik, NT-21 lewat JALUR WORKER, dan titik
// ekstensi work order — terhadap PostgreSQL nyata lewat `createApp()`.
//
// Object storage diganti penyimpanan palsu: yang diuji di sini ialah kapan URL diterbitkan (hanya CLEAN,
// varian medium), bukan adapter S3 (diuji `PR-03-04`).

import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { DamageReportCreated, DamageReportDetail, DamageReportVerified } from "@sigm4/schemas";
import express from "express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../src/api/index.js";
import { TitikWorkOrderKerusakan } from "../../src/modules/m11-damage-reports/index.js";
import { fcmCheck, pasangKonsumenNotifikasi } from "../../src/modules/m17-notifications/index.js";
import { AuditLogger } from "../../src/shared/audit/index.js";
import { AMR_OTP, createAuthContext, setAmr, setAuthContext } from "../../src/shared/auth/index.js";
import type { Scope } from "../../src/shared/auth/index.js";
import { createSystemAuthContext } from "../../src/shared/auth/system-context.js";
import { FixedClock } from "../../src/shared/clock/index.js";
import { getDb, withTransaction } from "../../src/shared/db/index.js";
import type { TransactionScope } from "../../src/shared/db/index.js";
import { EventHandlerRegistry, OutboxDispatcher } from "../../src/shared/events/index.js";
import { HealthRegistry, Logger } from "../../src/shared/observability/index.js";
import type { PenyimpananObjek } from "../../src/shared/storage/index.js";
import { authPalsu } from "../helpers/auth.js";
import { dbmate, kueri } from "../helpers/db.js";

// Dilewati hanya tanpa basis data; prasyarat lain yang hilang = FAILED (templates/PULL-REQUEST.md).
const ADA = process.env["DATABASE_URL"] !== undefined;
// Senin 15 November 2027 10.00 WIB → "hari ini" garansi = 2027-11-15.
const clock = new FixedClock(new Date("2027-11-15T03:00:00Z"));
const unik = (a: string) => `VRF${a}${randomUUID().slice(0, 6)}`;
const logger = new Logger({ clock, tulis: () => undefined });

/** Hanya URL unduhan yang dipakai detail; selain itu galat keras agar pemakaian tak sengaja ketahuan. */
const penyimpanan: PenyimpananObjek = {
    urlUnduh: (kunci) => Promise.resolve(`https://unduh.uji/${kunci}`),
    urlUnggah: () => Promise.reject(new Error("tak dipakai")),
    info: () => Promise.reject(new Error("tak dipakai")),
    ambil: () => Promise.reject(new Error("tak dipakai")),
    simpan: () => Promise.reject(new Error("tak dipakai")),
    hapus: () => Promise.reject(new Error("tak dipakai")),
    periksa: () => Promise.resolve(),
};

interface Peran {
    readonly id: number;
    readonly perms: readonly string[];
}
type Jawaban<T> = { status: number; json: { success: boolean; data: T; error?: { code: string; message: string; details?: { field: string; message: string }[] } } };

describe.skipIf(!ADA)("PR-03-15 — verifikasi & tindak lanjut laporan kerusakan (acceptance)", () => {
    let server: Server;
    let url = "";
    let gedung = "";
    let area = "";
    let kategori = "";
    let ruang = "";
    let ruangLapor = "";
    const aset: Record<"bergaransi" | "kursi" | "meja" | "lemari" | "papan" | "balap" | "rak" | "wo", string> = {} as never;
    const pengguna: Record<"guru" | "guruLain" | "petugas" | "verifikatorTerbatas" | "tanpaIzin", Peran> = {} as never;

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
            logger,
            clock,
            db: getDb(),
            auth: authPalsu(),
            penyimpanan,
        });
        const luar = express();
        luar.use((req, res, next) => {
            const perms = (req.header("x-uji-perms") ?? "").split(",").filter((p) => p !== "");
            setAuthContext(res, createAuthContext({ userId: Number(req.header("x-uji-user")), roleCode: "R-02", scopes: new Map<string, Scope>(perms.map((p) => [p.split(":")[0]!, (p.split(":")[1] ?? "all") as Scope])) }));
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
                VALUES ('${nama}', '${unik("u")}@uji-m11v.sch.id', 'x', '${unik("N")}', (SELECT id FROM roles WHERE kode = '${role}'), 'AKTIF', false) RETURNING id::text`);
            return { id: Number(u?.id), perms };
        };
        const PELAPOR = ["damage.create", "damage.view:own"];
        pengguna.guru = await buat("R-05", "Pak Budi Pelapor", PELAPOR);
        pengguna.guruLain = await buat("R-05", "Bu Ani Guru", PELAPOR);
        pengguna.petugas = await buat("R-02", "Bu Sari Petugas", ["damage.create", "damage.view", "damage.verify", "asset.update_condition", "asset_document.view"]);
        // damage.verify TANPA asset.update_condition maupun asset_document.view.
        pengguna.verifikatorTerbatas = await buat("R-02", "Pak Joko Petugas", ["damage.view", "damage.verify"]);
        pengguna.tanpaIzin = await buat("R-05", "Tanpa Izin", ["damage.create"]);

        const [g] = await kueri<{ id: string }>(`INSERT INTO buildings (nama, kode) VALUES ('Gedung C Uji Verifikasi', '${unik("G")}') RETURNING id::text`);
        gedung = g?.id ?? "";
        const [a] = await kueri<{ id: string }>(`INSERT INTO areas (building_id, nama, kode) VALUES (${gedung}, 'Lt 3', '${unik("A")}') RETURNING id::text`);
        area = a?.id ?? "";
        const ruangan = async (nama: string) =>
            (await kueri<{ id: string }>(`INSERT INTO rooms (area_id, nama, kode, jenis, kapasitas, status) VALUES (${area}, '${nama}', '${unik("R")}', 'KELAS', 30, 'AKTIF') RETURNING id::text`))[0]?.id ?? "";
        ruang = await ruangan("Kelas XII-A");
        ruangLapor = await ruangan("Kelas XII-B");
        kategori = (await kueri<{ id: string }>(`INSERT INTO asset_categories (nama, kode) VALUES ('Perabot Uji', '${unik("K")}') RETURNING id::text`))[0]?.id ?? "";
        for (const [k, nama] of [["bergaransi", "Proyektor Bergaransi"], ["kursi", "Kursi Guru"], ["meja", "Meja Guru"], ["lemari", "Lemari Arsip"], ["papan", "Papan Tulis"], ["balap", "Kipas Angin"], ["rak", "Rak Buku"], ["wo", "AC Ruang Guru"]] as const) {
            aset[k] = (await kueri<{ id: string }>(`INSERT INTO assets (kode_barang, nama, category_id, tahun_perolehan, sumber_perolehan, room_id, kondisi)
                VALUES ('${unik("B")}', '${nama}', ${kategori}, 2025, 'PEMBELIAN', ${ruang}, 'BAIK') RETURNING id::text`))[0]?.id ?? "";
        }
        // BR-052: satu garansi aktif (berakhir TEPAT hari ini — inklusif), satu kedaluwarsa kemarin, satu dihapus,
        // satu dilepas dari aset, satu belum mulai.
        const dokumen = async (nama: string, mulai: string, selesai: string, o: { dihapus?: boolean; lepas?: boolean } = {}) => {
            const [b] = await kueri<{ id: string }>(`INSERT INTO stored_files (object_key, mime, ukuran, checksum, scan_status, owner_type, uploaded_by)
                VALUES ('asset-document/2027/11/${randomUUID()}.pdf', 'application/pdf', 1000, '${"b".repeat(64)}', 'CLEAN', 'ASSET_DOCUMENT', ${String(pengguna.petugas.id)}) RETURNING id::text`);
            const [d] = await kueri<{ id: string }>(`INSERT INTO asset_documents (file_id, jenis, nama_berkas, garansi_mulai, garansi_selesai, dihapus, dihapus_pada)
                VALUES (${b?.id ?? ""}, 'GARANSI', '${nama}', '${mulai}', '${selesai}', ${String(o.dihapus === true)}, ${o.dihapus === true ? "now()" : "NULL"}) RETURNING id::text`);
            await kueri(`INSERT INTO asset_document_links (document_id, asset_id, aktif, dilepas_pada) VALUES (${d?.id ?? ""}, ${aset.bergaransi}, ${String(o.lepas !== true)}, ${o.lepas === true ? "now()" : "NULL"})`);
            return d?.id ?? "";
        };
        await dokumen("garansi-aktif.pdf", "2026-11-15", "2027-11-15");
        await dokumen("garansi-kedaluwarsa.pdf", "2026-01-01", "2027-11-14");
        await dokumen("garansi-dihapus.pdf", "2027-01-01", "2028-12-31", { dihapus: true });
        await dokumen("garansi-dilepas.pdf", "2027-01-01", "2028-12-31", { lepas: true });
        await dokumen("garansi-belum-mulai.pdf", "2027-11-16", "2028-12-31");
    });

    afterAll(async () => {
        await new Promise<void>((r) => server.close(() => r()));
        const ids = Object.values(pengguna).map((p) => p.id).join(",");
        const laporan = `SELECT id FROM damage_reports WHERE pelapor_id IN (${ids})`;
        await kueri(`DELETE FROM notifications WHERE user_id IN (${ids}) OR (referensi_jenis = 'damage_report' AND referensi_id IN (${laporan}))`);
        await kueri(`DELETE FROM event_outbox WHERE aggregate_type = 'damage_report' AND aggregate_id::bigint IN (${laporan})`);
        await kueri(`DELETE FROM damage_report_photos WHERE damage_report_id IN (${laporan})`);
        await kueri(`DELETE FROM damage_reports WHERE pelapor_id IN (${ids})`);
        await kueri(`DELETE FROM asset_document_links WHERE asset_id IN (SELECT id FROM assets WHERE category_id = ${kategori})`);
        await kueri(`DELETE FROM asset_documents WHERE file_id IN (SELECT id FROM stored_files WHERE uploaded_by IN (${ids}))`);
        await kueri(`DELETE FROM stored_files WHERE uploaded_by IN (${ids})`);
        await kueri(`DELETE FROM asset_condition_history WHERE asset_id IN (SELECT id FROM assets WHERE category_id = ${kategori})`);
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
    /** Pesanan berkas foto; `scan` tanpa `terkonfirmasi` = belum terunggah (A2). */
    async function foto(siapa: Peran, o: { terkonfirmasi?: boolean; scan?: string; medium?: boolean } = {}): Promise<number> {
        const kunci = `damage/2027/11/${randomUUID()}`;
        const [b] = await kueri<{ id: string }>(`INSERT INTO stored_files (object_key, mime, ukuran, checksum, scan_status, owner_type, uploaded_by, medium_key)
            VALUES ('${kunci}.jpg', 'image/jpeg', 2048, ${o.terkonfirmasi === true ? `'${"a".repeat(64)}'` : "NULL"}, '${o.scan ?? "PENDING"}', 'DAMAGE_PHOTO', ${String(siapa.id)},
                ${o.medium === true ? `'${kunci}-medium.webp'` : "NULL"}) RETURNING id::text`);
        return Number(b?.id);
    }
    async function lapor(siapa: Peran, objek: Record<string, number>, fotoIds?: number[]): Promise<DamageReportCreated> {
        const r = await kirim<DamageReportCreated>("POST", "/damage-reports", siapa, { ...objek, deskripsi: "Rusak saat dipakai.", urgensi: "SEDANG", foto_file_ids: fotoIds ?? [await foto(siapa)] });
        expect(r.status).toBe(201);
        return r.json.data;
    }
    const verifikasi = (id: string, siapa: Peran, body: unknown) => kirim<DamageReportVerified>("POST", `/damage-reports/${id}/verify`, siapa, body);
    const detail = (id: string, siapa: Peran) => kirim<DamageReportDetail>("GET", `/damage-reports/${id}`, siapa);
    const status = async (id: string) => (await kueri<{ status: string }>(`SELECT status::text FROM damage_reports WHERE id = ${id}`))[0]?.status;
    const log = (id: string) => kueri<{ aksi: string; keterangan: string | null }>(`SELECT aksi, keterangan FROM activity_logs WHERE entitas = 'damage_reports' AND entitas_id = ${id} ORDER BY id`);
    const pelaku = createSystemAuthContext("uji-m11v");
    const drain = () => {
        const registry = new EventHandlerRegistry();
        pasangKonsumenNotifikasi(registry, { db: getDb, clock, ctx: () => pelaku });
        return new OutboxDispatcher({ registry, clock, db: getDb(), logger }).drain();
    };
    const nt21 = (id: string) => kueri<{ user_id: string; isi: string; deep_link: string | null }>(`SELECT user_id::text, isi, deep_link FROM notifications WHERE kode = 'NT-21' AND referensi_jenis = 'damage_report' AND referensi_id = ${id}`);

    describe("otorisasi & scope (m11 §7, FR-11.3 A1)", () => {
        it("tanpa damage.verify → 403; tanpa damage.view → 403; scope own atas tiket orang lain → 404; milik sendiri → 200", async () => {
            const t = await lapor(pengguna.guru, { asset_id: Number(aset.kursi) });
            expect((await verifikasi(t.id, pengguna.guru, { keputusan: "TINDAK_LANJUT" })).status).toBe(403);
            expect((await detail(t.id, pengguna.tanpaIzin)).status).toBe(403);
            expect((await detail(t.id, pengguna.guruLain)).status).toBe(404);
            expect((await detail(t.id, pengguna.guru)).status).toBe(200);
            expect((await detail("999999999", pengguna.petugas)).status).toBe(404);
            expect(await status(t.id)).toBe("DILAPORKAN");
        });
    });

    describe("detail (FR-11.2 langkah 1–2, A2, A3/BR-052)", () => {
        it("foto: belum terunggah / PENDING tanpa URL, CLEAN ber-URL varian medium (jatuh ke asli bila belum ada); foto_tertunda dihitung", async () => {
            const f = [await foto(pengguna.guru), await foto(pengguna.guru, { terkonfirmasi: true }), await foto(pengguna.guru, { terkonfirmasi: true, scan: "CLEAN", medium: true }), await foto(pengguna.guru, { terkonfirmasi: true, scan: "CLEAN" })];
            const t = await lapor(pengguna.guru, { asset_id: Number(aset.meja) }, f);
            const d = (await detail(t.id, pengguna.petugas)).json.data;
            const kunci = await kueri<{ id: string; object_key: string; medium_key: string | null }>(`SELECT id::text, object_key, medium_key FROM stored_files WHERE id IN (${f.join(",")}) ORDER BY id`);
            expect(d.foto).toEqual([
                { file_id: String(f[0]), urutan: 1, status: "BELUM_TERUNGGAH", url: null },
                { file_id: String(f[1]), urutan: 2, status: "PENDING", url: null },
                { file_id: String(f[2]), urutan: 3, status: "CLEAN", url: `https://unduh.uji/${kunci[2]?.medium_key ?? ""}` },
                { file_id: String(f[3]), urutan: 4, status: "CLEAN", url: `https://unduh.uji/${kunci[3]?.object_key ?? ""}` },
            ]);
            expect(d.foto_tertunda).toBe(1);
            expect(d.objek).toEqual({ jenis: "ASET", id: aset.meja, label: expect.stringMatching(/^Meja Guru \(VRFB/), lokasi: "Kelas XII-A, Gedung C Uji Verifikasi" });
            expect([d.pelapor.nama, d.status, d.diverifikasi_oleh, d.catatan_verifikasi]).toEqual(["Pak Budi Pelapor", "DILAPORKAN", null, null]);
        });

        it("garansi aktif hari ini (WIB, batas inklusif) saja — bukan kedaluwarsa/dihapus/dilepas/belum mulai; null tanpa asset_document.view dan bagi ruangan", async () => {
            const t = await lapor(pengguna.guru, { asset_id: Number(aset.bergaransi) });
            expect((await detail(t.id, pengguna.petugas)).json.data.garansi).toEqual([{ dokumen_id: expect.any(String), nama_berkas: "garansi-aktif.pdf", garansi_selesai: "2027-11-15" }]);
            expect((await detail(t.id, pengguna.verifikatorTerbatas)).json.data.garansi).toBeNull();
            const r = await lapor(pengguna.guru, { room_id: Number(ruangLapor) });
            const dr = (await detail(r.id, pengguna.petugas)).json.data;
            expect([dr.garansi, dr.objek.jenis, dr.objek.label, dr.objek.lokasi]).toEqual([null, "RUANGAN", "Kelas XII-B", "Gedung C Uji Verifikasi"]);
            // Tiket ruangan dipakai uji kondisi di bawah — tutup agar tak menghalangi.
            await verifikasi(r.id, pengguna.petugas, { keputusan: "TOLAK", catatan: "Uji detail." });
        });
    });

    describe("verifikasi (FR-11.2 langkah 3–5)", () => {
        it("TINDAK_LANJUT → DIVERIFIKASI, pelaku & waktu tercatat (SC-07), DAMAGE_VERIFIED, NT-21 ke pelapor; verifikasi kedua ditolak", async () => {
            const t = await lapor(pengguna.guru, { asset_id: Number(aset.lemari) });
            const r = await verifikasi(t.id, pengguna.petugas, { keputusan: "TINDAK_LANJUT" });
            expect(r.status).toBe(200);
            expect(r.json.data).toEqual({ id: t.id, nomor: t.nomor, status: "DIVERIFIKASI", diverifikasi_pada: clock.now().toISOString(), kondisi_aset: null });
            const [b] = await kueri<{ diverifikasi_oleh: string; diverifikasi_pada: Date }>(`SELECT diverifikasi_oleh::text, diverifikasi_pada FROM damage_reports WHERE id = ${t.id}`);
            expect([b?.diverifikasi_oleh, b?.diverifikasi_pada.toISOString()]).toEqual([String(pengguna.petugas.id), clock.now().toISOString()]);
            expect((await log(t.id)).map((l) => l.aksi)).toEqual(["DAMAGE_REPORTED", "DAMAGE_VERIFIED"]);
            await drain();
            expect(await nt21(t.id)).toEqual([{ user_id: String(pengguna.guru.id), isi: `Laporan ${t.nomor} telah diverifikasi dan akan ditindaklanjuti.`, deep_link: `/kerusakan/${t.id}` }]);
            const ulang = await verifikasi(t.id, pengguna.petugas, { keputusan: "TOLAK", catatan: "Berubah pikiran." });
            expect([ulang.status, ulang.json.error?.details?.[0]?.field]).toEqual([422, "id"]);
            expect(await status(t.id)).toBe("DIVERIFIKASI");
        });

        it("TOLAK wajib beralasan; alasan terlihat pelapor pada detail (FR-11.2 AC) dan NT-21", async () => {
            const t = await lapor(pengguna.guru, { asset_id: Number(aset.papan) });
            const tanpa = await verifikasi(t.id, pengguna.petugas, { keputusan: "TOLAK" });
            expect([tanpa.status, tanpa.json.error?.details?.[0]?.field]).toEqual([422, "catatan"]);
            expect((await verifikasi(t.id, pengguna.petugas, { keputusan: "TOLAK", catatan: "Papan masih layak, hanya kotor." })).json.data.status).toBe("DITOLAK");
            const d = (await detail(t.id, pengguna.guru)).json.data;
            expect([d.status, d.catatan_verifikasi, d.diverifikasi_oleh?.nama]).toEqual(["DITOLAK", "Papan masih layak, hanya kotor.", "Bu Sari Petugas"]);
            expect((await log(t.id)).map((l) => [l.aksi, l.keterangan])).toEqual([["DAMAGE_REPORTED", null], ["DAMAGE_REJECTED", "Papan masih layak, hanya kotor."]]);
            await drain();
            expect((await nt21(t.id))[0]?.isi).toBe(`Laporan ${t.nomor} telah ditolak. Papan masih layak, hanya kotor.`);
        });

        it("PERBAIKAN_RINGAN wajib catatan; menutup tiket + kondisi aset RUSAK_BERAT atomik (riwayat ber-referensi tiket, status Tidak Tersedia)", async () => {
            const t = await lapor(pengguna.guru, { asset_id: Number(aset.balap) });
            expect((await verifikasi(t.id, pengguna.petugas, { keputusan: "PERBAIKAN_RINGAN" })).json.error?.details?.[0]?.field).toBe("catatan");
            const r = await verifikasi(t.id, pengguna.petugas, { keputusan: "PERBAIKAN_RINGAN", catatan: "Baling-baling diganti.", kondisi_aset: { kondisi: "RUSAK_BERAT" } });
            expect([r.status, r.json.data.status, r.json.data.kondisi_aset]).toEqual([200, "SELESAI", "RUSAK_BERAT"]);
            expect((await kueri(`SELECT kondisi::text, status::text FROM assets WHERE id = ${aset.balap}`))[0]).toEqual({ kondisi: "RUSAK_BERAT", status: "TIDAK_TERSEDIA" });
            expect(await kueri(`SELECT referensi_jenis, referensi_id::text, alasan FROM asset_condition_history WHERE asset_id = ${aset.balap}`)).toEqual([
                { referensi_jenis: "damage_report", referensi_id: t.id, alasan: `Verifikasi laporan kerusakan ${t.nomor}` },
            ]);
            expect((await log(t.id)).map((l) => l.aksi)).toEqual(["DAMAGE_REPORTED", "DAMAGE_VERIFIED", "DAMAGE_CLOSED"]);
            const aksiAset = await kueri<{ aksi: string }>(`SELECT aksi FROM activity_logs WHERE entitas = 'assets' AND entitas_id = ${aset.balap} ORDER BY id`);
            expect(aksiAset.map((x) => x.aksi)).toEqual(["ASSET_CONDITION_CHANGED", "ASSET_STATUS_CHANGED"]);
            await drain();
            expect((await nt21(t.id))[0]?.isi).toBe(`Laporan ${t.nomor} telah diverifikasi dan diselesaikan dengan perbaikan ringan. Baling-baling diganti.`);
        });

        it("kondisi_aset: tiket ruangan → 422; tanpa asset.update_condition → 403 dan seluruhnya bergulung; HILANG ditolak skema", async () => {
            const r = await lapor(pengguna.guru, { room_id: Number(ruangLapor) });
            const ruangKondisi = await verifikasi(r.id, pengguna.petugas, { keputusan: "TINDAK_LANJUT", kondisi_aset: { kondisi: "RUSAK_RINGAN" } });
            expect([ruangKondisi.status, ruangKondisi.json.error?.details?.[0]?.field]).toEqual([422, "kondisi_aset"]);
            const t = await lapor(pengguna.guru, { asset_id: Number(aset.rak) });
            expect((await verifikasi(t.id, pengguna.verifikatorTerbatas, { keputusan: "TINDAK_LANJUT", kondisi_aset: { kondisi: "RUSAK_RINGAN" } })).status).toBe(403);
            expect(await status(t.id)).toBe("DILAPORKAN");
            expect((await kueri(`SELECT kondisi::text FROM assets WHERE id = ${aset.rak}`))[0]?.kondisi).toBe("BAIK");
            expect((await verifikasi(t.id, pengguna.petugas, { keputusan: "TINDAK_LANJUT", kondisi_aset: { kondisi: "HILANG" } })).status).toBe(422);
            // Tanpa kondisi, pemegang damage.verify saja cukup.
            expect((await verifikasi(t.id, pengguna.verifikatorTerbatas, { keputusan: "TINDAK_LANJUT" })).json.data.status).toBe("DIVERIFIKASI");
            await verifikasi(r.id, pengguna.petugas, { keputusan: "TOLAK", catatan: "Uji." });
        });

        it("Petugas memverifikasi laporannya sendiri → tanpa NT-21", async () => {
            const t = await lapor(pengguna.petugas, { room_id: Number(ruangLapor) });
            await verifikasi(t.id, pengguna.petugas, { keputusan: "TOLAK", catatan: "Salah lapor." });
            await drain();
            expect(await nt21(t.id)).toEqual([]);
        });

        it("dua verifikasi serentak → tepat satu berhasil (kunci baris), satu 422", async () => {
            const t = await lapor(pengguna.guru, { room_id: Number(ruangLapor) });
            const [a, b] = await Promise.all([
                verifikasi(t.id, pengguna.petugas, { keputusan: "TINDAK_LANJUT" }),
                verifikasi(t.id, pengguna.verifikatorTerbatas, { keputusan: "TOLAK", catatan: "Duplikat." }),
            ]);
            expect([a.status, b.status].sort()).toEqual([200, 422]);
            expect((await log(t.id)).filter((l) => l.aksi !== "DAMAGE_REPORTED")).toHaveLength(1);
        });
    });

    describe("titik ekstensi work order (keputusan 21d, BR-045, BR-050)", () => {
        const titik = new TitikWorkOrderKerusakan(new AuditLogger({ clock, logger }));
        const dalam = <T>(kerja: (s: TransactionScope) => Promise<T>): Promise<T> => withTransaction(createAuthContext({ userId: pengguna.petugas.id, roleCode: "R-02", scopes: new Map() }), kerja, getDb());

        it("tiket DILAPORKAN ditolak (BR-045); DIVERIFIKASI → DALAM_PERBAIKAN → ditutup SELESAI + DAMAGE_CLOSED (BR-050); penutupan dari status lain ditolak", async () => {
            const t = await lapor(pengguna.guru, { asset_id: Number(aset.wo) });
            await expect(dalam((s) => titik.tiketUntukWorkOrder(s, Number(t.id)))).rejects.toThrow("sudah diverifikasi");
            await verifikasi(t.id, pengguna.petugas, { keputusan: "TINDAK_LANJUT" });
            await expect(dalam((s) => titik.tutupDariWorkOrder(s, Number(t.id), 1))).rejects.toThrow("sedang dalam perbaikan");
            expect((await dalam((s) => titik.tiketUntukWorkOrder(s, Number(t.id)))).nomor).toBe(t.nomor);
            await dalam((s) => titik.tandaiDalamPerbaikan(s, Number(t.id)));
            expect(await status(t.id)).toBe("DALAM_PERBAIKAN");
            await expect(dalam((s) => titik.tandaiDalamPerbaikan(s, Number(t.id)))).rejects.toThrow("sudah diverifikasi");
            await dalam((s) => titik.tutupDariWorkOrder(s, Number(t.id), 77));
            expect(await status(t.id)).toBe("SELESAI");
            const [akhir] = await kueri<{ aksi: string; nilai_sesudah: { work_order_id: number } }>(`SELECT aksi, nilai_sesudah FROM activity_logs WHERE entitas = 'damage_reports' AND entitas_id = ${t.id} ORDER BY id DESC LIMIT 1`);
            expect([akhir?.aksi, akhir?.nilai_sesudah.work_order_id]).toEqual(["DAMAGE_CLOSED", 77]);
        });
    });
});
