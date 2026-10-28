// Acceptance PR-03-05 (SDD-FS-04/05, SDD-09 §4.2 langkah 4 & §4.3/§4.6, OBS-06; keputusan 8 log
// phase-03): pemindaian terhadap ClamAV, MinIO, dan PostgreSQL NYATA. Berkas terinfeksi tidak pernah
// dapat diunduh; `av_scanner` di /health melaporkan clamd dan kedalaman antrean pindai.
//
// Uji EICAR dibangun saat uji berjalan (base64) agar berkas sumber ini sendiri tidak dikarantina
// antivirus mesin pengembang; dibungkus ZIP agar lolos magic bytes DOCX dan tetap dikenali ClamAV.

import { createHash, randomUUID } from "node:crypto";
import { crc32 } from "node:zlib";
import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { FileScanService, KlienClamd, avScannerCheck, urlUnduhBerkas } from "../../src/modules/m06-documents/index.js";
import { AuditLogger } from "../../src/shared/audit/index.js";
import { createSystemAuthContext } from "../../src/shared/auth/system-context.js";
import { SystemClock } from "../../src/shared/clock/index.js";
import type { KonfigurasiAntivirus, KonfigurasiPenyimpanan } from "../../src/shared/config/index.js";
import { getDb } from "../../src/shared/db/index.js";
import { HealthRegistry, Logger } from "../../src/shared/observability/index.js";
import { PenyimpananS3 } from "../../src/shared/storage/index.js";
import { dbmate, kueri } from "../helpers/db.js";

const env = process.env;
const ADA = env["DATABASE_URL"] !== undefined && env["S3_ENDPOINT"] !== undefined && env["CLAMAV_URL"] !== undefined;
const clock = new SystemClock();
const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52]);
const EICAR = Buffer.from("WDVPIVAlQEFQWzRcUFpYNTQoUF4pN0NDKTd9JEVJQ0FSLVNUQU5EQVJELUFOVElWSVJVUy1URVNULUZJTEUhJEgrSCo=", "base64");

/** ZIP satu entri tanpa kompresi — bentuk kontainer DOCX/XLSX (magic `PK\x03\x04`). */
function zip(nama: string, isi: Buffer): Buffer {
    const n = Buffer.from(nama);
    const c = crc32(isi);
    const lokal = Buffer.alloc(30);
    lokal.writeUInt32LE(0x04034b50, 0);
    lokal.writeUInt16LE(20, 4);
    lokal.writeUInt32LE(c, 14);
    lokal.writeUInt32LE(isi.length, 18);
    lokal.writeUInt32LE(isi.length, 22);
    lokal.writeUInt16LE(n.length, 26);
    const pusat = Buffer.alloc(46);
    pusat.writeUInt32LE(0x02014b50, 0);
    pusat.writeUInt16LE(20, 4);
    pusat.writeUInt16LE(20, 6);
    pusat.writeUInt32LE(c, 16);
    pusat.writeUInt32LE(isi.length, 20);
    pusat.writeUInt32LE(isi.length, 24);
    pusat.writeUInt16LE(n.length, 28);
    const direktori = Buffer.concat([pusat, n]);
    const akhir = Buffer.alloc(22);
    akhir.writeUInt32LE(0x06054b50, 0);
    akhir.writeUInt16LE(1, 8);
    akhir.writeUInt16LE(1, 10);
    akhir.writeUInt32LE(direktori.length, 12);
    akhir.writeUInt32LE(30 + n.length + isi.length, 16);
    return Buffer.concat([lokal, n, isi, direktori, akhir]);
}

describe.skipIf(!ADA)("PR-03-05 — pemindaian antivirus + karantina (acceptance, ClamAV & MinIO nyata)", () => {
    const k: KonfigurasiPenyimpanan = {
        endpoint: new URL(env["S3_ENDPOINT"] ?? "http://x").origin,
        publicEndpoint: new URL(env["S3_ENDPOINT"] ?? "http://x").origin,
        region: env["S3_REGION"] ?? "",
        bucket: env["S3_BUCKET"] ?? "",
        accessKey: env["S3_ACCESS_KEY"] ?? "",
        secretKey: env["S3_SECRET_KEY"] ?? "",
    };
    const clamUrl = new URL(env["CLAMAV_URL"] ?? "tcp://x:1");
    const av: KonfigurasiAntivirus = { host: clamUrl.hostname, port: Number(clamUrl.port) };
    const s3 = new S3Client({ endpoint: k.endpoint, region: k.region, forcePathStyle: true, credentials: { accessKeyId: k.accessKey, secretAccessKey: k.secretKey } });
    const penyimpanan = new PenyimpananS3(k, clock);
    const ctx = createSystemAuthContext("file-scan");
    const catatanLog: Record<string, unknown>[] = [];
    const logger = new Logger({ clock, tulis: (baris) => catatanLog.push(JSON.parse(baris) as Record<string, unknown>) });
    const layanan = (pemindai = new KlienClamd(av)) => new FileScanService(getDb(), penyimpanan, pemindai, new AuditLogger({ clock, logger }), logger, clock);
    let pengguna = 0;
    const kunciDibuat: string[] = [];
    let sejakLog = 0;

    beforeAll(async () => {
        dbmate("up");
        const [u] = await kueri<{ id: string }>(`
            INSERT INTO users (nama, email, password_hash, nip_nis, role_id, status, must_change_password)
            VALUES ('Pengunggah AV', 'av-${randomUUID().slice(0, 8)}@sekolah.sch.id', 'x', 'NIPAV${randomUUID().slice(0, 8)}', (SELECT id FROM roles WHERE kode = 'R-02'), 'AKTIF', false) RETURNING id::text`);
        pengguna = Number(u?.id);
    });
    beforeEach(async () => {
        catatanLog.length = 0;
        sejakLog = Number((await kueri<{ n: string }>("SELECT coalesce(max(id), 0)::text AS n FROM activity_logs"))[0]?.n);
    });
    afterAll(async () => {
        await kueri(`DELETE FROM event_outbox WHERE aggregate_type = 'stored_file' AND aggregate_id IN (SELECT id FROM stored_files WHERE uploaded_by = ${String(pengguna)})`);
        await kueri(`DELETE FROM stored_files WHERE uploaded_by = ${String(pengguna)}`);
        await kueri(`DELETE FROM users WHERE id = ${String(pengguna)}`);
        for (const key of kunciDibuat) await s3.send(new DeleteObjectCommand({ Bucket: k.bucket, Key: key }));
    });

    /** Berkas terkonfirmasi (langkah 3 selesai) berisi `isi`; `unggah: false` = objek tak pernah ada. */
    const berkas = async (mime: string, isi: Buffer, jenis = "ASSET_DOCUMENT", unggah = true): Promise<{ id: string; key: string }> => {
        const key = `uji-av/${randomUUID()}`;
        kunciDibuat.push(key);
        if (unggah) await s3.send(new PutObjectCommand({ Bucket: k.bucket, Key: key, Body: isi, ContentType: mime }));
        const [r] = await kueri<{ id: string }>(`
            INSERT INTO stored_files (object_key, mime, ukuran, checksum, owner_type, uploaded_by)
            VALUES ('${key}', '${mime}', ${String(isi.length)}, '${createHash("sha256").update(isi).digest("hex")}', '${jenis}', ${String(pengguna)}) RETURNING id::text`);
        return { id: r!.id, key };
    };
    const status = async (id: string) => (await kueri<{ scan_status: string; scanned_at: Date | null }>(`SELECT scan_status::text, scanned_at FROM stored_files WHERE id = ${id}`))[0];
    const logPindai = () => kueri<{ entitas_id: string; nilai_sesudah: Record<string, unknown>; user_id: string | null }>(`SELECT entitas_id, nilai_sesudah, user_id::text FROM activity_logs WHERE aksi = 'FILE_SCANNED' AND id > ${String(sejakLog)} ORDER BY id`);
    const adaObjek = async (key: string) => (await penyimpanan.info(key)) !== null;

    it("berkas bersih → CLEAN + scanned_at, FILE_SCANNED berpelaku SYSTEM; URL unduhan kini terbit (SDD-FS-03/05)", async () => {
        const f = await berkas("image/png", PNG, "USER_PHOTO");
        await expect(urlUnduhBerkas(penyimpanan, clock, { object_key: f.key, scan_status: "PENDING" })).rejects.toMatchObject({ kode: "FILE_NOT_SCANNED" });
        expect(await layanan().pindai(ctx, f.id, false)).toEqual({ status: "CLEAN", alasan: null });
        expect(await status(f.id)).toMatchObject({ scan_status: "CLEAN", scanned_at: expect.any(Date) as Date });
        expect(await logPindai()).toEqual([{ entitas_id: f.id, user_id: null, nilai_sesudah: { file_id: f.id, hasil: "CLEAN", alasan: null } }]);
        // PR-03-07: putusan terbit ke outbox dalam transaksi yang sama — konsumen menjadwalkan turunan gambar.
        const terbit = await kueri<{ payload: unknown }>(`SELECT payload FROM event_outbox WHERE event_name = 'FileScanned' AND aggregate_id = '${f.id}'`);
        expect(terbit.map((r) => r.payload)).toEqual([{ file_id: f.id, hasil: "CLEAN" }]);
        expect(await adaObjek(f.key)).toBe(true);
        const r = await fetch((await urlUnduhBerkas(penyimpanan, clock, { object_key: f.key, scan_status: "CLEAN" })).url);
        expect(Buffer.from(await r.arrayBuffer()).equals(PNG)).toBe(true);
    });

    it("EICAR di dalam DOCX → INFECTED oleh ClamAV: objek dihapus, baris dipertahankan, alarm FILE_INFECTED, unduhan 409", async () => {
        const f = await berkas(DOCX, zip("eicar.com", EICAR));
        const hasil = await layanan().pindai(ctx, f.id, false);
        expect(hasil?.status).toBe("INFECTED");
        expect(hasil?.alasan).toMatch(/Eicar/i);
        expect((await status(f.id))?.scan_status).toBe("INFECTED");
        expect(await adaObjek(f.key)).toBe(false);
        expect((await logPindai())[0]?.nilai_sesudah).toMatchObject({ file_id: f.id, hasil: "INFECTED" });
        expect(catatanLog.some((l) => l["level"] === "error" && l["alarm"] === "FILE_INFECTED" && l["file_id"] === f.id)).toBe(true);
        await expect(urlUnduhBerkas(penyimpanan, clock, { object_key: f.key, scan_status: "INFECTED" })).rejects.toMatchObject({ kode: "FILE_NOT_SCANNED" });
    });

    it("§4.3: magic bytes tak cocok dengan MIME deklarasi (PDF bertopeng PNG) → INFECTED MIME_TIDAK_COCOK, objek dihapus", async () => {
        const f = await berkas("image/png", Buffer.from("%PDF-1.7\nbukan gambar"), "USER_PHOTO");
        expect(await layanan().pindai(ctx, f.id, false)).toEqual({ status: "INFECTED", alasan: "MIME_TIDAK_COCOK" });
        expect(await adaObjek(f.key)).toBe(false);
        expect(catatanLog.some((l) => l["level"] === "error" && l["alarm"] === "FILE_INFECTED")).toBe(true);
    });

    it("clamd tak terjangkau: percobaan biasa melempar (tetap PENDING, tanpa log) — percobaan terakhir menutup FAILED", async () => {
        const f = await berkas("image/png", PNG, "USER_PHOTO");
        const mati = new KlienClamd({ host: "127.0.0.1", port: 1 }, 2_000);
        await expect(layanan(mati).pindai(ctx, f.id, false)).rejects.toThrow();
        expect((await status(f.id))?.scan_status).toBe("PENDING");
        expect(await logPindai()).toEqual([]);
        expect(await layanan(mati).pindai(ctx, f.id, true)).toEqual({ status: "FAILED", alasan: "PEMINDAIAN_GAGAL" });
        expect((await logPindai())[0]?.nilai_sesudah).toMatchObject({ hasil: "FAILED", alasan: "PEMINDAIAN_GAGAL" });
        // FAILED tidak pernah dapat diunduh (Bab 17.5 poin 6).
        await expect(urlUnduhBerkas(penyimpanan, clock, { object_key: f.key, scan_status: "FAILED" })).rejects.toMatchObject({ kode: "FILE_NOT_SCANNED" });
    });

    it("objek hilang dari storage → FAILED OBJEK_TIDAK_ADA tanpa menunggu percobaan ulang", async () => {
        const f = await berkas("image/png", PNG, "USER_PHOTO", false);
        expect(await layanan().pindai(ctx, f.id, false)).toEqual({ status: "FAILED", alasan: "OBJEK_TIDAK_ADA" });
    });

    it("idempoten (event at-least-once): berkas yang sudah diputus tidak dipindai ulang maupun dicatat lagi", async () => {
        const f = await berkas("image/png", PNG, "USER_PHOTO");
        await layanan().pindai(ctx, f.id, false);
        sejakLog = Number((await kueri<{ n: string }>("SELECT coalesce(max(id), 0)::text AS n FROM activity_logs"))[0]?.n);
        expect(await layanan().pindai(ctx, f.id, false)).toBeNull();
        expect(await logPindai()).toEqual([]);
    });

    it("INFECTED yang objeknya masih ada (hapus gagal sebelumnya) → pengulangan menghapusnya", async () => {
        const f = await berkas("image/png", PNG, "USER_PHOTO");
        await kueri(`UPDATE stored_files SET scan_status = 'INFECTED' WHERE id = ${f.id}`);
        expect(await layanan().pindai(ctx, f.id, false)).toBeNull();
        expect(await adaObjek(f.key)).toBe(false);
    });

    it("OBS-06: av_scanner up + kedalaman antrean = berkas terkonfirmasi yang masih PENDING; clamd mati → down", async () => {
        const sebelum = Number((await kueri<{ n: string }>("SELECT count(*)::text AS n FROM stored_files WHERE scan_status = 'PENDING' AND checksum IS NOT NULL"))[0]?.n);
        await berkas("image/png", PNG, "USER_PHOTO");
        const hasil = await avScannerCheck(new KlienClamd(av), getDb()).probe();
        expect(hasil).toMatchObject({ status: "up", queue: sebelum + 1 });
        const ringkasan = await new HealthRegistry(30).register(avScannerCheck(new KlienClamd({ host: "127.0.0.1", port: 1 }, 1_000), getDb())).summary();
        expect(ringkasan.checks.av_scanner?.status).toBe("down");
    });
});
