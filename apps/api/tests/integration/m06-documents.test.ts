// Acceptance PR-03-06 (FR-06.1 langkah 1–5, A1–A3, AC unduhan & BR-073; SDD-09 §4.2 langkah 5,
// §4.4, §4.6; keputusan 9 log phase-03): dokumen aset lewat HTTP penuh `createApp()` terhadap
// PostgreSQL dan MinIO NYATA.

import { createHash, randomUUID } from "node:crypto";
import { createServer } from "node:http";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { DeleteObjectCommand, S3Client } from "@aws-sdk/client-s3";
import express from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/api/index.js";
import { fcmCheck } from "../../src/modules/m17-notifications/index.js";
import { AMR_OTP, createAuthContext, setAmr, setAuthContext } from "../../src/shared/auth/index.js";
import type { Scope } from "../../src/shared/auth/index.js";
import { SystemClock } from "../../src/shared/clock/index.js";
import type { KonfigurasiPenyimpanan } from "../../src/shared/config/index.js";
import { getDb } from "../../src/shared/db/index.js";
import { HealthRegistry, Logger } from "../../src/shared/observability/index.js";
import { PenyimpananS3 } from "../../src/shared/storage/index.js";
import { authPalsu } from "../helpers/auth.js";
import { dbmate, kueri } from "../helpers/db.js";

const env = process.env;
const ADA = env["DATABASE_URL"] !== undefined && env["REDIS_URL"] !== undefined && env["S3_ENDPOINT"] !== undefined && env["S3_BUCKET"] !== undefined;
const clock = new SystemClock();
const PDF = Buffer.from("%PDF-1.7\nfaktur uji PR-03-06");
const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");

// Petugas Sarpras: kelola; Guru: lihat saja; Siswa: tanpa permission dokumen (BR-073).
const PETUGAS = ["asset.view", "asset.create", "asset_document.view", "asset_document.manage"];
const GURU = ["asset_document.view"];
const SISWA = ["asset.view:restricted"];

describe.skipIf(!ADA)("PR-03-06 — dokumen aset (acceptance, PostgreSQL & MinIO nyata)", () => {
    const k: KonfigurasiPenyimpanan = {
        endpoint: new URL(env["S3_ENDPOINT"] ?? "http://x").origin,
        publicEndpoint: new URL(env["S3_ENDPOINT"] ?? "http://x").origin,
        region: env["S3_REGION"] ?? "",
        bucket: env["S3_BUCKET"] ?? "",
        accessKey: env["S3_ACCESS_KEY"] ?? "",
        secretKey: env["S3_SECRET_KEY"] ?? "",
    };
    const s3 = new S3Client({ endpoint: k.endpoint, region: k.region, forcePathStyle: true, credentials: { accessKeyId: k.accessKey, secretAccessKey: k.secretKey } });
    let server: Server;
    let url = "";
    const pengguna: Record<"A" | "B", number> = { A: 0, B: 0 };
    let ruang = "";
    let kategori = "";
    const aset: string[] = [];
    const kunciDibuat: string[] = [];
    let sejakLog = 0;

    beforeAll(async () => {
        dbmate("up");
        const app = createApp({
            appBaseUrl: "https://sigm4.sekolah.test",
            health: new HealthRegistry(30).register(fcmCheck(null)),
            limiter: { hit: () => Promise.resolve({ lolos: true, batas: 1000, sisa: 999, resetDetik: 60 }) },
            security: { objectStorageOrigin: k.publicEndpoint },
            logger: new Logger({ clock, tulis: () => undefined }),
            clock,
            db: getDb(),
            auth: authPalsu(),
            penyimpanan: new PenyimpananS3(k, clock),
        });
        const luar = express();
        luar.use((req, res, next) => {
            const siapa = (req.header("x-uji-user") ?? "A") as "A" | "B";
            const perms = (req.header("x-uji-perms") ?? "").split(",").filter((p) => p !== "");
            setAuthContext(res, createAuthContext({ userId: pengguna[siapa], roleCode: "R-02", scopes: new Map<string, Scope>(perms.map((p) => [p.split(":")[0]!, (p.split(":")[1] ?? "all") as Scope])) }));
            setAmr(res, ["pwd", AMR_OTP]);
            next();
        });
        luar.use(app);
        server = createServer(luar);
        await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
        url = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}/api/v1`;
        const sfx = () => randomUUID().slice(0, 6);
        for (const p of ["A", "B"] as const) {
            const [u] = await kueri<{ id: string }>(`
                INSERT INTO users (nama, email, password_hash, nip_nis, role_id, status, must_change_password)
                VALUES ('Petugas ${p}', 'dok-${sfx()}@sekolah.sch.id', 'x', 'NIPD${sfx()}', (SELECT id FROM roles WHERE kode = 'R-02'), 'AKTIF', false) RETURNING id::text`);
            pengguna[p] = Number(u?.id);
        }
        const [g] = await kueri<{ id: string }>(`INSERT INTO buildings (nama, kode) VALUES ('G', 'GD${sfx()}') RETURNING id::text`);
        const [a] = await kueri<{ id: string }>(`INSERT INTO areas (building_id, nama, kode) VALUES (${String(g?.id)}, 'A', 'AD${sfx()}') RETURNING id::text`);
        const [r] = await kueri<{ id: string }>(`INSERT INTO rooms (area_id, nama, kode, jenis) VALUES (${String(a?.id)}, 'R', 'RD${sfx()}', 'KELAS') RETURNING id::text`);
        ruang = r?.id ?? "";
        const [kat] = await kueri<{ id: string }>(`INSERT INTO asset_categories (nama, kode) VALUES ('Kursi Dok', 'KD${sfx()}') RETURNING id::text`);
        kategori = kat?.id ?? "";
        const res = await minta("POST", "/assets", PETUGAS, { nama: "Kursi", category_id: Number(kategori), tahun_perolehan: 2024, sumber_perolehan: "PEMBELIAN", room_id: Number(ruang), kondisi: "BAIK", jumlah_unit: 3 });
        expect(res.status).toBe(201);
        aset.push(...(res.json.data as { id: string }[]).map((x) => x.id));
    });
    beforeEach(async () => {
        sejakLog = Number((await kueri<{ n: string }>("SELECT coalesce(max(id), 0)::text AS n FROM activity_logs"))[0]?.n);
    });
    afterAll(async () => {
        await new Promise<void>((r) => server.close(() => r()));
        const ids = `${String(pengguna.A)}, ${String(pengguna.B)}`;
        await kueri(`DELETE FROM asset_document_links WHERE asset_id IN (${aset.join(", ")})`);
        await kueri(`DELETE FROM asset_documents WHERE file_id IN (SELECT id FROM stored_files WHERE uploaded_by IN (${ids}))`);
        await kueri(`DELETE FROM event_outbox WHERE aggregate_type = 'stored_file' AND aggregate_id IN (SELECT id FROM stored_files WHERE uploaded_by IN (${ids}))`);
        await kueri(`DELETE FROM stored_files WHERE uploaded_by IN (${ids})`);
        await kueri(`DELETE FROM assets WHERE category_id = ${kategori}`);
        await kueri(`DELETE FROM asset_code_counters WHERE category_id = ${kategori}`);
        await kueri(`DELETE FROM asset_categories WHERE id = ${kategori}`);
        await kueri(`DELETE FROM users WHERE id IN (${ids})`);
        for (const key of kunciDibuat) await s3.send(new DeleteObjectCommand({ Bucket: k.bucket, Key: key }));
    });

    type Balasan = { status: number; json: { data?: unknown; error?: { code: string; details?: { field: string; message: string }[] } } };
    async function minta(metode: string, path: string, perms: readonly string[], body?: unknown, siapa: "A" | "B" = "A"): Promise<Balasan> {
        const res = await fetch(`${url}${path}`, {
            method: metode,
            headers: { "content-type": "application/json", "x-uji-perms": perms.join(","), "x-uji-user": siapa },
            ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
        return { status: res.status, json: (await res.json()) as Balasan["json"] };
    }
    /** Berkas ASSET_DOCUMENT terkonfirmasi milik `siapa` (presign → PUT → confirm, PR-03-25). */
    async function berkas(siapa: "A" | "B" = "A", jenis = "ASSET_DOCUMENT", konfirmasi = true): Promise<number> {
        const mime = jenis === "ASSET_DOCUMENT" ? "application/pdf" : "image/png";
        const p = (await minta("POST", "/files/presign", [], { jenis, mime, ukuran: PDF.length }, siapa)).json.data as { upload_url: string; file_id: string; object_key: string };
        kunciDibuat.push(p.object_key);
        await fetch(p.upload_url, { method: "PUT", headers: { "content-type": mime }, body: new Uint8Array(PDF) });
        if (konfirmasi) expect((await minta("POST", "/files/confirm", [], { file_id: p.file_id, checksum: sha(PDF) }, siapa)).status).toBe(200);
        return Number(p.file_id);
    }
    type Dok = { id: string; jenis: string; nama_berkas: string; garansi_mulai: string | null; garansi_selesai: string | null; scan_status: string; jumlah_aset: number; ukuran: number };
    const daftar = async (asetId: string) => (await minta("GET", `/assets/${asetId}/documents`, GURU)).json.data as Dok[];
    const log = (aksi: string) => kueri<{ entitas_id: string; nilai_sesudah: Record<string, unknown> }>(`SELECT entitas_id, nilai_sesudah FROM activity_logs WHERE aksi = '${aksi}' AND id > ${String(sejakLog)} ORDER BY id`);
    const galat = (r: Balasan) => r.json.error?.details?.[0];

    describe("POST /assets/{id}/documents (FR-06.1 langkah 2–5)", () => {
        it("A3: satu faktur untuk tiga aset — satu dokumen, tiga tautan; berkas dimiliki dokumen; DOCUMENT_UPLOADED memuat seluruh aset", async () => {
            const fileId = await berkas();
            const r = await minta("POST", `/assets/${aset[0]!}/documents`, PETUGAS, { file_id: fileId, jenis: "FAKTUR", nama_berkas: "Faktur-Kursi-2026.pdf", keterangan: "Pembelian 3 kursi", asset_ids_tambahan: [Number(aset[1]), Number(aset[2]), Number(aset[1])] });
            expect(r.status).toBe(201);
            const dok = r.json.data as Dok;
            expect(dok).toMatchObject({ jenis: "FAKTUR", nama_berkas: "Faktur-Kursi-2026.pdf", scan_status: "PENDING", jumlah_aset: 3, ukuran: PDF.length, garansi_mulai: null });
            for (const a of aset) expect((await daftar(a)).map((d) => d.id)).toContain(dok.id);
            const [f] = await kueri<{ owner_id: string }>(`SELECT owner_id::text FROM stored_files WHERE id = ${String(fileId)}`);
            expect(f?.owner_id).toBe(dok.id);
            const [l] = await log("DOCUMENT_UPLOADED");
            expect(l?.entitas_id).toBe(dok.id);
            expect(l?.nilai_sesudah).toMatchObject({ file_id: String(fileId), jenis: "FAKTUR", asset_ids: aset.map(Number) });
        });

        it("langkah 3: garansi wajib bagi GARANSI dan dilarang bagi jenis lain; tanggal kembali sebagai YYYY-MM-DD", async () => {
            const fileId = await berkas();
            expect((await minta("POST", `/assets/${aset[0]!}/documents`, PETUGAS, { file_id: fileId, jenis: "GARANSI", nama_berkas: "garansi.pdf" })).status).toBe(400);
            expect((await minta("POST", `/assets/${aset[0]!}/documents`, PETUGAS, { file_id: fileId, jenis: "MANUAL", nama_berkas: "m.pdf", garansi_mulai: "2026-01-01", garansi_selesai: "2027-01-01" })).status).toBe(400);
            expect((await minta("POST", `/assets/${aset[0]!}/documents`, PETUGAS, { file_id: fileId, jenis: "GARANSI", nama_berkas: "g.pdf", garansi_mulai: "2027-01-01", garansi_selesai: "2026-01-01" })).status).toBe(400);
            const ok = await minta("POST", `/assets/${aset[0]!}/documents`, PETUGAS, { file_id: fileId, jenis: "GARANSI", nama_berkas: "Kartu Garansi.pdf", garansi_mulai: "2026-10-01", garansi_selesai: "2028-09-30" });
            expect(ok.status).toBe(201);
            expect(ok.json.data).toMatchObject({ garansi_mulai: "2026-10-01", garansi_selesai: "2028-09-30", jumlah_aset: 1 });
        });

        it("berkas yang tak sah → 422 file_id dan tidak ada dokumen: belum dikonfirmasi, milik orang lain, jenis foto, sudah dipakai", async () => {
            const terpakai = await berkas();
            expect((await minta("POST", `/assets/${aset[0]!}/documents`, PETUGAS, { file_id: terpakai, jenis: "SERTIFIKAT", nama_berkas: "a.pdf" })).status).toBe(201);
            const kasus = [await berkas("A", "ASSET_DOCUMENT", false), await berkas("B"), await berkas("A", "DAMAGE_PHOTO"), terpakai];
            for (const fileId of kasus) {
                const r = await minta("POST", `/assets/${aset[0]!}/documents`, PETUGAS, { file_id: fileId, jenis: "LAINNYA", nama_berkas: "x.pdf" });
                expect(r.status).toBe(422);
                expect(galat(r)?.field).toBe("file_id");
            }
            expect((await kueri(`SELECT 1 FROM asset_documents WHERE file_id IN (${kasus.slice(0, 3).join(", ")})`)).length).toBe(0);
        });

        it("aset tak terdaftar → 404; aset tambahan tak terdaftar → 422 asset_ids_tambahan", async () => {
            const fileId = await berkas();
            expect((await minta("POST", "/assets/999999999/documents", PETUGAS, { file_id: fileId, jenis: "FAKTUR", nama_berkas: "a.pdf" })).status).toBe(404);
            const r = await minta("POST", `/assets/${aset[0]!}/documents`, PETUGAS, { file_id: fileId, jenis: "FAKTUR", nama_berkas: "a.pdf", asset_ids_tambahan: [999999998] });
            expect(r.status).toBe(422);
            expect(galat(r)?.field).toBe("asset_ids_tambahan");
            expect((await minta("GET", "/assets/999999999/documents", GURU)).status).toBe(404);
        });
    });

    describe("hak akses (PM-02, BR-073, FR-06.1 AC)", () => {
        it("tanpa asset_document.manage → 403 untuk tautkan & hapus; Siswa tanpa asset_document.view → 403 untuk daftar & unduh", async () => {
            const fileId = await berkas();
            expect((await minta("POST", `/assets/${aset[0]!}/documents`, GURU, { file_id: fileId, jenis: "FAKTUR", nama_berkas: "a.pdf" })).status).toBe(403);
            const dok = (await minta("POST", `/assets/${aset[0]!}/documents`, PETUGAS, { file_id: fileId, jenis: "FAKTUR", nama_berkas: "a.pdf" })).json.data as Dok;
            expect((await minta("DELETE", `/assets/${aset[0]!}/documents/${dok.id}`, GURU)).status).toBe(403);
            expect((await minta("GET", `/assets/${aset[0]!}/documents`, SISWA)).status).toBe(403);
            expect((await minta("GET", `/assets/${aset[0]!}/documents/${dok.id}/download`, SISWA)).status).toBe(403);
            expect((await daftar(aset[0]!)).map((d) => d.id)).toContain(dok.id);
        });
    });

    describe("GET …/download (SDD-09 §4.4, SDD-FS-03/05)", () => {
        it("PENDING → 409 tanpa log; CLEAN → URL 15 menit yang mengunduh isi persis + DOCUMENT_DOWNLOADED; dokumen milik aset lain → 404", async () => {
            const fileId = await berkas();
            const dok = (await minta("POST", `/assets/${aset[0]!}/documents`, PETUGAS, { file_id: fileId, jenis: "MANUAL", nama_berkas: "manual.pdf" })).json.data as Dok;
            const tertahan = await minta("GET", `/assets/${aset[0]!}/documents/${dok.id}/download`, GURU);
            expect(tertahan.status).toBe(409);
            expect(tertahan.json.error?.code).toBe("FILE_NOT_SCANNED");
            expect(await log("DOCUMENT_DOWNLOADED")).toEqual([]);

            await kueri(`UPDATE stored_files SET scan_status = 'CLEAN' WHERE id = ${String(fileId)}`);
            const r = await minta("GET", `/assets/${aset[0]!}/documents/${dok.id}/download`, GURU);
            expect(r.status).toBe(200);
            const d = r.json.data as { url: string; expires_at: string };
            expect(new URL(d.url).searchParams.get("X-Amz-Expires")).toBe("900");
            expect(Math.abs(new Date(d.expires_at).getTime() - Date.now() - 900_000)).toBeLessThan(10_000);
            expect(Buffer.from(await (await fetch(d.url)).arrayBuffer()).equals(PDF)).toBe(true);
            expect(await log("DOCUMENT_DOWNLOADED")).toEqual([{ entitas_id: dok.id, nilai_sesudah: { document_id: dok.id, asset_id: Number(aset[0]) } }]);

            expect((await minta("GET", `/assets/${aset[1]!}/documents/${dok.id}/download`, GURU)).status).toBe(404);
        });
    });

    describe("DELETE …/documents/{docId} (FR-06.1 A2, SDD-09 §4.6, keputusan 9b)", () => {
        it("melepas tautan aset ini saja; tautan terakhir → dokumen dihapus; berkas & objek dipertahankan; tiap hapus tercatat", async () => {
            const fileId = await berkas();
            const dok = (await minta("POST", `/assets/${aset[0]!}/documents`, PETUGAS, { file_id: fileId, jenis: "FAKTUR", nama_berkas: "a.pdf", asset_ids_tambahan: [Number(aset[1])] })).json.data as Dok;

            const pertama = await minta("DELETE", `/assets/${aset[0]!}/documents/${dok.id}`, PETUGAS);
            expect(pertama.status).toBe(200);
            expect(pertama.json.data).toEqual({ dokumen_dihapus: false });
            expect((await daftar(aset[0]!)).map((d) => d.id)).not.toContain(dok.id);
            expect((await daftar(aset[1]!)).find((d) => d.id === dok.id)?.jumlah_aset).toBe(1);
            expect((await minta("DELETE", `/assets/${aset[0]!}/documents/${dok.id}`, PETUGAS)).status).toBe(404);

            const terakhir = await minta("DELETE", `/assets/${aset[1]!}/documents/${dok.id}`, PETUGAS);
            expect(terakhir.json.data).toEqual({ dokumen_dihapus: true });
            expect((await daftar(aset[1]!)).map((d) => d.id)).not.toContain(dok.id);
            const [baris] = await kueri<{ dihapus: boolean; owner_id: string }>(`SELECT d.dihapus, f.owner_id::text FROM asset_documents d JOIN stored_files f ON f.id = d.file_id WHERE d.id = ${dok.id}`);
            expect(baris).toEqual({ dihapus: true, owner_id: dok.id });
            const [kunci] = await kueri<{ object_key: string }>(`SELECT object_key FROM stored_files WHERE id = ${String(fileId)}`);
            expect(await new PenyimpananS3(k, clock).info(kunci!.object_key)).not.toBeNull();
            expect((await log("DOCUMENT_DELETED")).map((l) => l.nilai_sesudah)).toEqual([
                { document_id: dok.id, asset_id: Number(aset[0]), dokumen_dihapus: false },
                { document_id: dok.id, asset_id: Number(aset[1]), dokumen_dihapus: true },
            ]);
            await kueri(`UPDATE stored_files SET scan_status = 'CLEAN' WHERE id = ${String(fileId)}`);
            expect((await minta("GET", `/assets/${aset[1]!}/documents/${dok.id}/download`, GURU)).status).toBe(404);
        });
    });
});
