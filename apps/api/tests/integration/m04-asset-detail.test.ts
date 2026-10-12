// Acceptance PR-03-24 (FR-04.2 langkah 5 & A1, BR-073; keputusan 4 log phase-03 & 24): detail aset dan
// linimasa berjenis — HTTP penuh lewat `createApp()` terhadap PostgreSQL nyata.

import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AssetDetail, EntriLinimasaAset } from "@sigm4/schemas";
import { AssetDetailResponseSchema, AssetPhotosResponseSchema, AssetTimelineResponseSchema } from "@sigm4/schemas";
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
const DASAR = "https://sigm4.sekolah.test";
const clock = new FixedClock(new Date("2026-10-11T03:00:00Z"));

const PETUGAS = ["asset.view", "asset.view_financial", "asset.create", "asset.update", "asset.update_condition", "asset_document.view"];
const GURU = ["asset.view"];
const SISWA = ["asset.view:restricted", "asset_document.view"];

let urut = 0;
const kode = (a: string) => `${a}${String(++urut)}${randomUUID().slice(0, 6)}`;

describe.skipIf(!ADA)("PR-03-24 — detail aset + linimasa (acceptance)", () => {
    let server: Server;
    let url = "";
    let pengguna = 0;
    const ruang: string[] = [];
    let kategori = "";

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
            penyimpanan: {
                urlUnduh: (key, seconds) => Promise.resolve(`https://media.sekolah.test/private/${encodeURIComponent(key)}?expires=${seconds}`),
                urlUnggah: () => Promise.reject(new Error("Tidak dipakai")), info: () => Promise.resolve(null),
                ambil: () => Promise.resolve(null), simpan: () => Promise.resolve(), hapus: () => Promise.resolve(), periksa: () => Promise.resolve(),
            },
        });
        const luar = express();
        luar.use((req, res, next) => {
            if (req.header("x-uji-anonim") === "true") { next(); return; }
            const perms = (req.header("x-uji-perms") ?? "").split(",").filter((p) => p !== "");
            setAuthContext(res, createAuthContext({ userId: pengguna, roleCode: "R-02", scopes: new Map<string, Scope>(perms.map((p) => [p.split(":")[0]!, (p.split(":")[1] ?? "all") as Scope])) }));
            setAmr(res, ["pwd", AMR_OTP]);
            next();
        });
        luar.use(app);
        server = createServer(luar);
        await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
        url = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}/api/v1`;
        const [u] = await kueri<{ id: string }>(`
            INSERT INTO users (nama, email, password_hash, nip_nis, role_id, status, must_change_password)
            VALUES ('Petugas Detail', 'detail-${randomUUID().slice(0, 8)}@sekolah.sch.id', 'x', '${kode("NIPD")}', (SELECT id FROM roles WHERE kode = 'R-02'), 'AKTIF', false) RETURNING id::text`);
        pengguna = Number(u?.id);
        const [g] = await kueri<{ id: string }>(`INSERT INTO buildings (nama, kode) VALUES ('Gedung Detail', '${kode("GD")}') RETURNING id::text`);
        const [a] = await kueri<{ id: string }>(`INSERT INTO areas (building_id, nama, kode) VALUES (${String(g?.id)}, 'Lantai 1', '${kode("AD")}') RETURNING id::text`);
        for (const nama of ["Lab Komputer", "Gudang"]) {
            const [r] = await kueri<{ id: string }>(`INSERT INTO rooms (area_id, nama, kode, jenis) VALUES (${String(a?.id)}, '${nama}', '${kode("RD")}', 'KELAS') RETURNING id::text`);
            ruang.push(r?.id ?? "");
        }
        const [k] = await kueri<{ id: string }>(`INSERT INTO asset_categories (nama, kode) VALUES ('Laptop Detail', '${kode("KD")}') RETURNING id::text`);
        kategori = k?.id ?? "";
    });
    afterAll(async () => {
        await new Promise<void>((r) => server.close(() => r()));
        const aset = `SELECT id FROM assets WHERE category_id = ${kategori}`;
        await kueri(`DELETE FROM asset_photos WHERE asset_id IN (${aset})`);
        await kueri(`DELETE FROM damage_reports WHERE asset_id IN (${aset})`);
        await kueri(`DELETE FROM asset_document_links WHERE asset_id IN (${aset})`);
        await kueri(`DELETE FROM asset_documents WHERE file_id IN (SELECT id FROM stored_files WHERE uploaded_by = ${String(pengguna)})`);
        await kueri(`DELETE FROM stored_files WHERE uploaded_by = ${String(pengguna)}`);
        await kueri(`DELETE FROM asset_condition_history WHERE asset_id IN (${aset})`);
        const berita = (await kueri<{ id: string }>(`SELECT document_id::text AS id FROM asset_movements WHERE asset_id IN (${aset}) AND document_id IS NOT NULL`)).map((b) => b.id);
        await kueri(`DELETE FROM asset_movements WHERE asset_id IN (${aset})`);
        if (berita.length > 0) await kueri(`DELETE FROM asset_movement_documents WHERE id IN (${berita.join(",")})`);
        await kueri(`DELETE FROM assets WHERE category_id = ${kategori}`);
        await kueri(`DELETE FROM asset_code_counters WHERE category_id = ${kategori}`);
        await kueri(`DELETE FROM asset_categories WHERE id = ${kategori}`);
        await kueri(`DELETE FROM users WHERE id = ${String(pengguna)}`);
    });

    type Balasan = { status: number; json: { data?: unknown; meta?: { total: number; total_pages: number }; error?: { code: string } } };
    const minta = async (metode: string, path: string, perms: readonly string[], body?: unknown): Promise<Balasan> => {
        const res = await fetch(`${url}${path}`, { method: metode, headers: { "x-uji-perms": perms.join(","), "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
        return { status: res.status, json: (await res.json()) as Balasan["json"] };
    };
    const buat = async (o: { siswa?: boolean } = {}): Promise<string> => {
        const r = await minta("POST", "/assets", PETUGAS, {
            nama: "Laptop Guru", category_id: Number(kategori), merek: "Lenovo", nomor_seri: kode("SN"), tahun_perolehan: 2024, sumber_perolehan: "HIBAH", nilai_perolehan: 8_500_000,
            room_id: Number(ruang[0]), kondisi: "BAIK", boleh_dipinjam_siswa: o.siswa === true, penanggung_jawab_id: pengguna,
        });
        expect(r.status).toBe(201);
        return (r.json.data as { id: string }[])[0]!.id;
    };
    const detail = (id: string, perms: readonly string[]) => minta("GET", `/assets/${id}`, perms);
    const linimasa = (id: string, perms: readonly string[], q = "") => minta("GET", `/assets/${id}/timeline${q}`, perms);
    const dokumen = async (asetId: string, nama: string, lepas = false) => {
        const [b] = await kueri<{ id: string }>(`INSERT INTO stored_files (object_key, mime, ukuran, checksum, scan_status, owner_type, uploaded_by)
            VALUES ('asset-document/2026/10/${randomUUID()}.pdf', 'application/pdf', 1000, '${"c".repeat(64)}', 'CLEAN', 'ASSET_DOCUMENT', ${String(pengguna)}) RETURNING id::text`);
        const [d] = await kueri<{ id: string }>(`INSERT INTO asset_documents (file_id, jenis, nama_berkas) VALUES (${b?.id ?? ""}, 'FAKTUR', '${nama}') RETURNING id::text`);
        await kueri(`INSERT INTO asset_document_links (document_id, asset_id, aktif, created_at, created_by, dilepas_pada, dilepas_oleh)
            VALUES (${d?.id ?? ""}, ${asetId}, ${String(!lepas)}, '2026-10-05T03:00:00Z', ${String(pengguna)}, ${lepas ? "'2026-10-06T03:00:00Z'" : "NULL"}, ${lepas ? String(pengguna) : "NULL"})`);
        return d?.id ?? "";
    };

    describe("GET /assets/{id} (FR-04.2 langkah 5)", () => {
        it("identitas lengkap: kategori, lokasi bertingkat, penanggung jawab, QR, finansial bagi pemegang asset.view_financial", async () => {
            const id = await buat();
            const r = await detail(id, PETUGAS);
            expect(r.status).toBe(200);
            const d = AssetDetailResponseSchema.parse(r.json).data;
            expect(d).toMatchObject({
                id, nama: "Laptop Guru", merek: "Lenovo", kategori: { id: kategori, nama: "Laptop Detail" },
                lokasi: { room_id: ruang[0], ruang: "Lab Komputer", area: "Lantai 1", gedung: "Gedung Detail" },
                penanggung_jawab: { id: String(pengguna), nama: "Petugas Detail" }, kondisi: "BAIK", status: "TERSEDIA",
                dihapuskan: false, tanggal_penghapusan: null, sumber_perolehan: "HIBAH", nilai_perolehan: "8500000.00",
            });
            expect(d.qr_url).toBe(`${DASAR}/a/${d.uuid}`);
        });

        it("BR-073: tanpa asset.view_financial kunci finansial TIDAK ADA (bukan null)", async () => {
            const d = (await detail(await buat(), GURU)).json.data as AssetDetail;
            expect("sumber_perolehan" in d).toBe(false);
            expect("nilai_perolehan" in d).toBe(false);
        });

        it("FR-04.2 A1: scope restricted hanya melihat boleh_dipinjam_siswa — lainnya 404 sama dengan tak ada (SDD-AUTH-08)", async () => {
            const boleh = await buat({ siswa: true });
            const tidak = await buat();
            expect((await detail(boleh, SISWA)).status).toBe(200);
            const tertutup = await detail(tidak, SISWA);
            const takAda = await detail("999999999", SISWA);
            expect(tertutup.status).toBe(404);
            expect(tertutup.json.error).toEqual(takAda.json.error);
        });

        it("BR-065d: aset terhapuskan tetap dapat dibuka, bertanda", async () => {
            const id = await buat();
            await kueri(`UPDATE assets SET dihapuskan = true, tanggal_penghapusan = '2026-10-09T02:00:00Z' WHERE id = ${id}`);
            expect((await detail(id, GURU)).json.data).toMatchObject({ dihapuskan: true, tanggal_penghapusan: "2026-10-09T02:00:00.000Z" });
        });

        it("otorisasi & bentuk: tanpa asset.view → 403; id cacat → 400", async () => {
            const id = await buat();
            expect((await detail(id, ["asset.create"])).status).toBe(403);
            expect((await detail("abc", GURU)).status).toBe(400);
        });
    });

    describe("GET /assets/{id}/photos (PR-05-32)", () => {
        const foto = async (id: string, status: string, confirmed = true, primary = false, order = 0, owner = "ASSET_PHOTO") => {
            const [file] = await kueri<{ id: string }>(`INSERT INTO stored_files (object_key, thumb_key, medium_key, mime, ukuran, checksum, scan_status, owner_type, uploaded_by)
                VALUES ('private-${randomUUID()}.jpg', '${randomUUID()}-thumb.jpg', '${randomUUID()}-medium.jpg', 'image/jpeg', 1000, ${confirmed ? `'${"a".repeat(64)}'` : "NULL"}, '${status}', '${owner}', ${pengguna}) RETURNING id::text`);
            const [photo] = await kueri<{ id: string }>(`INSERT INTO asset_photos (asset_id, file_id, urutan, is_primary, diunggah_oleh) VALUES (${id}, ${file?.id}, ${order}, ${primary}, ${pengguna}) RETURNING id::text`);
            return photo!.id;
        };
        it("CLEAN terkonfirmasi saja mendapat URL; metadata tidak mengandung object key/pengunggah; primary lebih dulu", async () => {
            const id = await buat();
            await foto(id, "PENDING"); await foto(id, "INFECTED"); await foto(id, "FAILED"); await foto(id, "CLEAN", false);
            const primary = await foto(id, "CLEAN", true, true, 5);
            await foto(id, "CLEAN", true, false, 1, "USER_PHOTO");
            const response = await minta("GET", `/assets/${id}/photos`, GURU);
            expect(response.status).toBe(200);
            const data = AssetPhotosResponseSchema.parse(response.json);
            expect(data.meta.total).toBe(5); expect(data.data[0]!.id).toBe(primary);
            expect(data.data[0]).toMatchObject({ status: "CLEAN", url: expect.stringContaining("medium.jpg"), thumbnail_url: expect.stringContaining("thumb.jpg"), expires_at: "2026-10-11T03:15:00.000Z" });
            for (const photo of data.data.slice(1)) expect(photo).toMatchObject({ url: null, thumbnail_url: null, expires_at: null });
            expect(JSON.stringify(response.json)).not.toMatch(/object_key|diunggah_oleh|uploaded_by|private-/);
        });
        it("scope restricted, izin, id dan paginasi memakai penjaga detail aset", async () => {
            const inaccessible = await buat(); const visible = await buat({ siswa: true });
            await foto(visible, "PENDING"); await foto(visible, "CLEAN");
            const hidden = await minta("GET", `/assets/${inaccessible}/photos`, SISWA);
            const absent = await minta("GET", "/assets/999999999/photos", SISWA);
            expect(hidden.status).toBe(404); expect(hidden.json.error).toEqual(absent.json.error);
            expect((await minta("GET", `/assets/${visible}/photos`, [])).status).toBe(403);
            expect((await fetch(`${url}/assets/${visible}/photos`, { headers: { "x-uji-anonim": "true" } })).status).toBe(401);
            expect((await minta("GET", "/assets/abc/photos", GURU)).status).toBe(400);
            const page = await minta("GET", `/assets/${visible}/photos?page=2&per_page=1`, SISWA);
            expect(AssetPhotosResponseSchema.parse(page.json).meta).toMatchObject({ page: 2, total: 2, total_pages: 2 });
            expect((await minta("GET", `/assets/${visible}/photos?per_page=101`, GURU)).status).toBe(400);
        });
        it("constraint DB: satu foto utama, pasangan unik, urutan nonnegatif dan FK", async () => {
            const id = await buat(); const photoId = await foto(id, "PENDING", true, true);
            const second = await foto(id, "PENDING");
            await expect(kueri(`UPDATE asset_photos SET is_primary = true WHERE id = ${second}`)).rejects.toMatchObject({ code: "23505" });
            await expect(kueri(`UPDATE asset_photos SET urutan = -1 WHERE id = ${photoId}`)).rejects.toMatchObject({ code: "23514" });
            await expect(kueri(`UPDATE asset_photos SET file_id = 999999999 WHERE id = ${photoId}`)).rejects.toMatchObject({ code: "23503" });
            await expect(kueri(`UPDATE asset_photos SET file_id = (SELECT file_id FROM asset_photos WHERE id = ${photoId}) WHERE id = ${second}`)).rejects.toMatchObject({ code: "23505" });
        });
    });

    describe("GET /assets/{id}/timeline (keputusan 4b & 24)", () => {
        it("KONDISI, MUTASI, DOKUMEN (tautkan + lepas), KERUSAKAN — terbaru lebih dulu, berpelaku", async () => {
            const id = await buat();
            expect((await minta("PATCH", `/assets/${id}/condition`, PETUGAS, { kondisi: "RUSAK_RINGAN", alasan: "Engsel layar retak" })).status).toBe(200);
            await kueri(`UPDATE asset_condition_history SET diubah_pada = '2026-10-03T03:00:00Z' WHERE asset_id = ${id}`);
            expect((await minta("POST", "/assets/move", PETUGAS, { asset_ids: [Number(id)], room_tujuan_id: Number(ruang[1]), tanggal_mutasi: "2026-10-04", alasan: "Dipindah ke gudang" })).status).toBe(200);
            await kueri(`UPDATE asset_movement_documents SET created_at = '2026-10-04T05:00:00Z' WHERE id = (SELECT document_id FROM asset_movements WHERE asset_id = ${id})`);
            const dok = await dokumen(id, "faktur-laptop.pdf", true);
            await kueri(`INSERT INTO damage_reports (nomor, pelapor_id, asset_id, deskripsi, urgensi, status, created_at)
                VALUES ('KRS-2026-${String(900000 + Math.floor(Math.random() * 99999))}', ${String(pengguna)}, ${id}, 'Keyboard tidak merespons', 'TINGGI', 'DILAPORKAN', '2026-10-07T03:00:00Z')`);

            const r = await linimasa(id, PETUGAS);
            expect(r.status).toBe(200);
            const entri = AssetTimelineResponseSchema.parse(r.json).data;
            expect(entri.map((e) => [e.jenis, e.waktu])).toEqual([
                ["KERUSAKAN", "2026-10-07T03:00:00.000Z"],
                ["DOKUMEN", "2026-10-06T03:00:00.000Z"],
                ["DOKUMEN", "2026-10-05T03:00:00.000Z"],
                ["MUTASI", "2026-10-04T05:00:00.000Z"],
                ["KONDISI", "2026-10-03T03:00:00.000Z"],
            ]);
            const cari = <J extends EntriLinimasaAset["jenis"]>(j: J) => entri.filter((e): e is Extract<EntriLinimasaAset, { jenis: J }> => e.jenis === j);
            expect(cari("KONDISI")[0]).toMatchObject({ kondisi_lama: "BAIK", kondisi_baru: "RUSAK_RINGAN", alasan: "Engsel layar retak", pelaku: { id: String(pengguna), nama: "Petugas Detail" } });
            expect(cari("MUTASI")[0]).toMatchObject({ tanggal: "2026-10-04", ruang_asal: { nama: "Lab Komputer" }, ruang_tujuan: { nama: "Gudang" }, alasan: "Dipindah ke gudang" });
            expect(cari("DOKUMEN").map((e) => [e.aksi, e.dokumen_id, e.nama_berkas])).toEqual([["DILEPAS", dok, "faktur-laptop.pdf"], ["DITAUTKAN", dok, "faktur-laptop.pdf"]]);
            // Ringkasan tanpa identitas pelapor maupun isi laporan.
            expect(cari("KERUSAKAN")[0]).toMatchObject({ status: "DILAPORKAN", urgensi: "TINGGI" });
            expect(JSON.stringify(cari("KERUSAKAN")[0])).not.toContain("Keyboard");
        });

        it("FR-04.2 A1: DOKUMEN tidak terlihat bagi scope restricted maupun tanpa asset_document.view", async () => {
            const id = await buat({ siswa: true });
            await dokumen(id, "garansi.pdf");
            expect((await linimasa(id, PETUGAS)).json.data).toEqual(expect.arrayContaining([expect.objectContaining({ jenis: "DOKUMEN" })]));
            const jenis = async (perms: readonly string[]) => ((await linimasa(id, perms)).json.data as EntriLinimasaAset[]).map((e) => e.jenis);
            expect(await jenis(SISWA)).not.toContain("DOKUMEN");
            expect(await jenis(GURU)).not.toContain("DOKUMEN");
        });

        it("paginasi offset dengan total (SDD-API-05)", async () => {
            const id = await buat();
            for (const [i, k] of (["RUSAK_RINGAN", "BAIK", "RUSAK_RINGAN"] as const).entries()) {
                expect((await minta("PATCH", `/assets/${id}/condition`, PETUGAS, { kondisi: k, alasan: `Perubahan ${String(i)}` })).status).toBe(200);
            }
            const hal1 = await linimasa(id, PETUGAS, "?per_page=2");
            expect(hal1.json.meta).toMatchObject({ total: 3, total_pages: 2 });
            expect(hal1.json.data).toHaveLength(2);
            expect((await linimasa(id, PETUGAS, "?per_page=2&page=2")).json.data).toHaveLength(1);
            expect((await linimasa(id, PETUGAS, "?per_page=101")).status).toBe(400);
        });

        it("aset di luar scope → 404 sebelum riwayat dibaca; aset tanpa riwayat → kosong", async () => {
            const id = await buat();
            expect((await linimasa(id, SISWA)).status).toBe(404);
            expect((await linimasa(id, GURU)).json).toMatchObject({ data: [], meta: { total: 0, total_pages: 1 } });
        });
    });
});
