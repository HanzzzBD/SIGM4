// Acceptance PR-03-07 (SDD-FS-06/07/09, SDD-09 §4.5/§4.6; keputusan 10 log phase-03): turunan gambar
// dan pembersihan berkas yatim terhadap PostgreSQL dan MinIO NYATA.

import { createHash, randomUUID } from "node:crypto";
import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DerivativeService } from "../../src/modules/m06-documents/index.js";
import { createSystemAuthContext } from "../../src/shared/auth/system-context.js";
import { FixedClock, SystemClock } from "../../src/shared/clock/index.js";
import type { KonfigurasiPenyimpanan } from "../../src/shared/config/index.js";
import { getDb } from "../../src/shared/db/index.js";
import { Logger } from "../../src/shared/observability/index.js";
import { PenyimpananS3 } from "../../src/shared/storage/index.js";
import { jalankanBersihYatim } from "../../src/worker/file-lifecycle.js";
import { dbmate, kueri } from "../helpers/db.js";

const env = process.env;
const ADA = env["DATABASE_URL"] !== undefined && env["S3_ENDPOINT"] !== undefined && env["S3_BUCKET"] !== undefined;
const clock = new SystemClock();

describe.skipIf(!ADA)("PR-03-07 — turunan gambar + siklus hidup berkas (acceptance, MinIO nyata)", () => {
    const k: KonfigurasiPenyimpanan = {
        endpoint: new URL(env["S3_ENDPOINT"] ?? "http://x").origin,
        publicEndpoint: new URL(env["S3_ENDPOINT"] ?? "http://x").origin,
        region: env["S3_REGION"] ?? "",
        bucket: env["S3_BUCKET"] ?? "",
        accessKey: env["S3_ACCESS_KEY"] ?? "",
        secretKey: env["S3_SECRET_KEY"] ?? "",
    };
    const s3 = new S3Client({ endpoint: k.endpoint, region: k.region, forcePathStyle: true, credentials: { accessKeyId: k.accessKey, secretAccessKey: k.secretKey } });
    const penyimpanan = new PenyimpananS3(k, clock);
    const ctx = createSystemAuthContext("file-derivatives");
    const peringatan: Record<string, unknown>[] = [];
    const turunan = () => new DerivativeService(getDb(), penyimpanan, new Logger({ clock, tulis: (b) => peringatan.push(JSON.parse(b) as Record<string, unknown>) }));
    let pengguna = 0;
    const kunciDibuat: string[] = [];
    let foto: Buffer;

    beforeAll(async () => {
        dbmate("up");
        foto = await sharp({ create: { width: 1600, height: 1200, channels: 3, background: { r: 10, g: 120, b: 200 } } }).jpeg().toBuffer();
        const [u] = await kueri<{ id: string }>(`
            INSERT INTO users (nama, email, password_hash, nip_nis, role_id, status, must_change_password)
            VALUES ('Siklus Berkas', 'sb-${randomUUID().slice(0, 8)}@sekolah.sch.id', 'x', 'NIPSB${randomUUID().slice(0, 8)}', (SELECT id FROM roles WHERE kode = 'R-02'), 'AKTIF', false) RETURNING id::text`);
        pengguna = Number(u?.id);
    });
    afterAll(async () => {
        await kueri(`UPDATE users SET foto_file_id = NULL WHERE id = ${String(pengguna)}`);
        await kueri(`DELETE FROM stored_files WHERE uploaded_by = ${String(pengguna)}`);
        await kueri(`DELETE FROM users WHERE id = ${String(pengguna)}`);
        for (const key of kunciDibuat) await s3.send(new DeleteObjectCommand({ Bucket: k.bucket, Key: key }));
    });

    interface Opsi {
        readonly mime?: string;
        readonly isi?: Buffer;
        readonly status?: string;
        readonly umurJam?: number;
        readonly pemilik?: number | null;
        readonly unggah?: boolean;
    }
    /** Baris stored_files terkonfirmasi + objeknya; `umurJam` memundurkan created_at. */
    async function berkas(o: Opsi = {}): Promise<{ id: string; key: string }> {
        const isi = o.isi ?? foto;
        const mime = o.mime ?? "image/jpeg";
        const key = `uji-siklus/${randomUUID()}.${mime === "image/jpeg" ? "jpg" : mime === "image/png" ? "png" : "pdf"}`;
        kunciDibuat.push(key, key.replace(/\.[^.]+$/, "-thumb.webp"), key.replace(/\.[^.]+$/, "-medium.webp"));
        if (o.unggah ?? true) await s3.send(new PutObjectCommand({ Bucket: k.bucket, Key: key, Body: isi, ContentType: mime }));
        const [r] = await kueri<{ id: string }>(`
            INSERT INTO stored_files (object_key, mime, ukuran, checksum, scan_status, owner_type, owner_id, uploaded_by, created_at)
            VALUES ('${key}', '${mime}', ${String(isi.length)}, '${createHash("sha256").update(isi).digest("hex")}', '${o.status ?? "CLEAN"}', 'DAMAGE_PHOTO',
                    ${o.pemilik === undefined || o.pemilik === null ? "NULL" : String(o.pemilik)}, ${String(pengguna)}, now() - interval '${String(o.umurJam ?? 0)} hours') RETURNING id::text`);
        return { id: r!.id, key };
    }
    const kolom = async (id: string) => (await kueri<{ thumb_key: string | null; medium_key: string | null }>(`SELECT thumb_key, medium_key FROM stored_files WHERE id = ${id}`))[0];
    const ada = async (key: string | null) => key !== null && (await penyimpanan.info(key)) !== null;

    describe("turunan gambar (SDD-FS-07)", () => {
        it("CLEAN JPEG → thumb 200 px & medium 800 px WebP di storage, kuncinya tercatat; pengulangan tidak membuat ulang", async () => {
            const f = await berkas();
            expect(await turunan().buat(ctx, f.id, false)).toBe(true);
            const { thumb_key, medium_key } = (await kolom(f.id))!;
            expect(thumb_key).toBe(f.key.replace(/\.jpg$/, "-thumb.webp"));
            expect(medium_key).toBe(f.key.replace(/\.jpg$/, "-medium.webp"));
            for (const [key, w] of [[thumb_key!, 200], [medium_key!, 800]] as const) {
                const m = await sharp((await penyimpanan.ambil(key))!).metadata();
                expect([m.format, m.width]).toEqual(["webp", w]);
            }
            expect(await turunan().buat(ctx, f.id, false)).toBe(false);
        });

        it("keputusan 10b: berkas yang belum CLEAN tidak pernah dibuka; PDF bukan gambar dilewati", async () => {
            for (const status of ["PENDING", "INFECTED", "FAILED"]) {
                const f = await berkas({ status });
                expect(await turunan().buat(ctx, f.id, false)).toBe(false);
                expect(await kolom(f.id)).toEqual({ thumb_key: null, medium_key: null });
                // Tidak ada turunan yang ditulis ke storage — sharp tidak pernah dijalankan atas berkas ini.
                expect(await ada(f.key.replace(/\.jpg$/, "-thumb.webp"))).toBe(false);
            }
            const pdf = await berkas({ mime: "application/pdf", isi: Buffer.from("%PDF-1.7 x") });
            expect(await turunan().buat(ctx, pdf.id, false)).toBe(false);
        });

        it("gambar rusak: percobaan biasa melempar (dicoba ulang); percobaan akhir hanya memperingatkan, kolom tetap NULL", async () => {
            const f = await berkas({ mime: "image/png", isi: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]) });
            await expect(turunan().buat(ctx, f.id, false)).rejects.toThrow();
            peringatan.length = 0;
            expect(await turunan().buat(ctx, f.id, true)).toBe(false);
            expect(await kolom(f.id)).toEqual({ thumb_key: null, medium_key: null });
            expect(peringatan.some((l) => l["level"] === "warn" && l["file_id"] === f.id)).toBe(true);
        });
    });

    describe("berkas yatim (SDD-FS-09, SDD-09 §4.6)", () => {
        it("> 24 jam tanpa pemilik → baris, objek, dan turunannya dihapus; INFECTED, bertuan, dan yang masih baru dipertahankan; ringkasan JOB-05", async () => {
            const yatim = await berkas({ umurJam: 25 });
            await turunan().buat(ctx, yatim.id, false);
            const t = (await kolom(yatim.id))!;
            const yatimTanpaObjek = await berkas({ umurJam: 30, status: "PENDING", unggah: false });
            const terinfeksi = await berkas({ umurJam: 48, status: "INFECTED" });
            const bertuan = await berkas({ umurJam: 48, pemilik: pengguna });
            const baru = await berkas({ umurJam: 23 });

            const sejak = Number((await kueri<{ n: string }>("SELECT coalesce(max(id), 0)::text AS n FROM activity_logs"))[0]?.n);
            const ringkas = await jalankanBersihYatim(getDb(), penyimpanan, clock);
            expect(ringkas.galat).toBe(0);
            expect(ringkas.diproses).toBeGreaterThanOrEqual(2);

            const sisa = new Set((await kueri<{ id: string }>(`SELECT id::text FROM stored_files WHERE uploaded_by = ${String(pengguna)}`)).map((r) => r.id));
            expect(sisa.has(yatim.id)).toBe(false);
            expect(sisa.has(yatimTanpaObjek.id)).toBe(false);
            for (const tetap of [terinfeksi, bertuan, baru]) expect(sisa.has(tetap.id)).toBe(true);
            for (const key of [yatim.key, t.thumb_key, t.medium_key]) expect(await ada(key)).toBe(false);
            expect(await ada(bertuan.key)).toBe(true);
            expect(await ada(baru.key)).toBe(true);

            const [log] = await kueri<{ nilai_sesudah: Record<string, unknown>; hasil: string }>(`SELECT nilai_sesudah, hasil FROM activity_logs WHERE aksi = 'SCHEDULED_JOB_EXECUTED' AND id > ${String(sejak)} AND nilai_sesudah->>'pekerjaan' = 'orphan-file-cleanup'`);
            expect(log?.hasil).toBe("SUKSES");
            expect(log?.nilai_sesudah["diproses"]).toBe(ringkas.diproses);
        });

        it("batas 24 jam dihitung dari Clock yang di-inject (SDD-SYS-07)", async () => {
            const f = await berkas({ umurJam: 1 });
            await jalankanBersihYatim(getDb(), penyimpanan, new FixedClock(new Date(Date.now() + 2 * 24 * 3600_000)));
            expect((await kueri(`SELECT 1 FROM stored_files WHERE id = ${f.id}`)).length).toBe(0);
        });
    });
});
