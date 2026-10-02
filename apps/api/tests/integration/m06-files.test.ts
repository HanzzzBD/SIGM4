// Acceptance PR-03-25 (FR-06.1, FR-01.4 A3, SDD-FS-01/02/03/06/09, Bab 17.5 poin 6; keputusan 7
// log phase-03): presign → PUT langsung ke MinIO NYATA → confirm, lalu foto profil lewat
// `PUT /me`/`GET /me` — HTTP penuh lewat `createApp()` terhadap PostgreSQL nyata.

import { createHash, randomUUID } from "node:crypto";
import { createServer } from "node:http";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import express from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/api/index.js";
import { fcmCheck } from "../../src/modules/m17-notifications/index.js";
import { AMR_OTP, createAuthContext, setAmr, setAuthContext } from "../../src/shared/auth/index.js";
import type { PermissionCache } from "../../src/shared/auth/index.js";
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
const PNG = Buffer.from("89504e470d0a1a0a-isi-foto-uji-PR-03-25");
const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");

describe.skipIf(!ADA)("PR-03-25 — unggah berkas presigned + foto profil (acceptance, MinIO nyata)", () => {
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
    const kunciDibuat: string[] = [];
    let sejakLog = 0;

    beforeAll(async () => {
        dbmate("up");
        const auth = { ...authPalsu(), permissions: { load: () => Promise.resolve({ scopes: new Map() }) } as unknown as PermissionCache };
        const app = createApp({
            appBaseUrl: "https://sigm4.sekolah.test",
            health: new HealthRegistry(30).register(fcmCheck(null)),
            limiter: { hit: () => Promise.resolve({ lolos: true, batas: 1000, sisa: 999, resetDetik: 60 }) },
            security: { objectStorageOrigin: k.publicEndpoint },
            logger: new Logger({ clock, tulis: () => undefined }),
            clock,
            db: getDb(),
            auth,
            penyimpanan: new PenyimpananS3(k, clock),
        });
        const luar = express();
        luar.use((req, res, next) => {
            const siapa = req.header("x-uji-user");
            if (siapa === undefined) return next();
            setAuthContext(res, createAuthContext({ userId: pengguna[siapa as "A" | "B"], roleCode: "R-05", scopes: new Map() }));
            setAmr(res, ["pwd", AMR_OTP]);
            next();
        });
        luar.use(app);
        server = createServer(luar);
        await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
        url = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}/api/v1`;
        for (const p of ["A", "B"] as const) {
            const [u] = await kueri<{ id: string }>(`
                INSERT INTO users (nama, email, password_hash, nip_nis, role_id, status, must_change_password)
                VALUES ('Guru ${p}', 'berkas-${randomUUID().slice(0, 8)}@sekolah.sch.id', 'x', 'NIPF${randomUUID().slice(0, 8)}', (SELECT id FROM roles WHERE kode = 'R-05'), 'AKTIF', false) RETURNING id::text`);
            pengguna[p] = Number(u?.id);
        }
    });
    beforeEach(async () => {
        sejakLog = Number((await kueri<{ n: string }>("SELECT coalesce(max(id), 0)::text AS n FROM activity_logs"))[0]?.n);
    });
    afterAll(async () => {
        await new Promise<void>((r) => server.close(() => r()));
        const ids = `${String(pengguna.A)}, ${String(pengguna.B)}`;
        await kueri(`UPDATE users SET foto_file_id = NULL WHERE id IN (${ids})`);
        await kueri(`DELETE FROM event_outbox WHERE aggregate_type = 'stored_file' AND aggregate_id IN (SELECT id FROM stored_files WHERE uploaded_by IN (${ids}))`);
        await kueri(`DELETE FROM stored_files WHERE uploaded_by IN (${ids})`);
        await kueri(`DELETE FROM users WHERE id IN (${ids})`);
        for (const key of kunciDibuat) await s3.send(new DeleteObjectCommand({ Bucket: k.bucket, Key: key }));
    });

    type Balasan = { status: number; json: { data?: Record<string, unknown>; error?: { code: string; message: string; details?: { field: string; message: string }[] } } };
    const minta = async (metode: string, path: string, siapa: "A" | "B" | null, body?: unknown): Promise<Balasan> => {
        const res = await fetch(`${url}${path}`, {
            method: metode,
            headers: { "content-type": "application/json", ...(siapa === null ? {} : { "x-uji-user": siapa }) },
            ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
        return { status: res.status, json: (await res.json()) as Balasan["json"] };
    };
    const presign = async (siapa: "A" | "B", jenis = "USER_PHOTO", isi = PNG) => {
        const r = await minta("POST", "/files/presign", siapa, { jenis, mime: "image/png", ukuran: isi.length });
        expect(r.status).toBe(201);
        const d = r.json.data as { upload_url: string; object_key: string; file_id: string; expires_in: number };
        kunciDibuat.push(d.object_key);
        return d;
    };
    const unggah = (d: { upload_url: string }, isi = PNG) => fetch(d.upload_url, { method: "PUT", headers: { "content-type": "image/png" }, body: new Uint8Array(isi) });
    /** Berkas siap ditautkan: presign → PUT → confirm. */
    const berkasTerkonfirmasi = async (siapa: "A" | "B", jenis = "USER_PHOTO") => {
        const d = await presign(siapa, jenis);
        expect((await unggah(d)).status).toBe(200);
        expect((await minta("POST", "/files/confirm", siapa, { file_id: d.file_id, checksum: sha(PNG) })).status).toBe(200);
        return d.file_id;
    };
    const baris = async (id: string) => (await kueri<{ checksum: string | null; owner_id: string | null; owner_type: string; uploaded_by: string }>(`SELECT checksum, owner_id::text, owner_type::text, uploaded_by::text FROM stored_files WHERE id = ${id}`))[0];
    const log = (aksi: string) => kueri<{ entitas_id: string; nilai_sebelum: Record<string, unknown> | null; nilai_sesudah: Record<string, unknown> }>(`SELECT entitas_id, nilai_sebelum, nilai_sesudah FROM activity_logs WHERE aksi = '${aksi}' AND id > ${String(sejakLog)} ORDER BY id`);
    const galat = (r: Balasan) => r.json.error?.details?.[0];

    describe("POST /files/presign (Bab 17.5 poin 6, SDD-09 §4.3)", () => {
        it("tanpa autentikasi → 401 (17.5 poin 1)", async () => {
            expect((await minta("POST", "/files/presign", null, { jenis: "USER_PHOTO", mime: "image/png", ukuran: 10 })).status).toBe(401);
        });

        it("kunci buram {jenis}/{yyyy}/{mm}/{uuid}.{ext}, URL 300 detik; baris pesanan belum dikonfirmasi & yatim; tidak dicatat", async () => {
            const d = await presign("A");
            const now = new Date();
            const bulan = String(now.getUTCMonth() + 1).padStart(2, "0");
            expect(d.object_key).toMatch(new RegExp(`^user-photo/${String(now.getUTCFullYear())}/${bulan}/[0-9a-f-]{36}\\.png$`));
            expect(d.expires_in).toBe(300);
            expect(new URL(d.upload_url).searchParams.get("X-Amz-Expires")).toBe("300");
            expect(await baris(d.file_id)).toEqual({ checksum: null, owner_id: null, owner_type: "USER_PHOTO", uploaded_by: String(pengguna.A) });
            expect(await log("FILE_UPLOADED")).toEqual([]);
        });

        it("FR-01.4 A3: foto profil bukan JPG/PNG atau > 2 MB → 422 dengan pesan spesifik; tidak ada baris dibuat", async () => {
            const sebelum = (await kueri<{ n: string }>(`SELECT count(*)::text AS n FROM stored_files WHERE uploaded_by = ${String(pengguna.A)}`))[0]?.n;
            const pdf = await minta("POST", "/files/presign", "A", { jenis: "USER_PHOTO", mime: "application/pdf", ukuran: 100 });
            expect(pdf.status).toBe(422);
            expect(galat(pdf)).toEqual({ field: "mime", message: "Foto profil harus berformat JPG atau PNG." });
            const besar = await minta("POST", "/files/presign", "A", { jenis: "USER_PHOTO", mime: "image/jpeg", ukuran: 2 * 1024 * 1024 + 1 });
            expect(besar.status).toBe(422);
            expect(galat(besar)).toEqual({ field: "ukuran", message: "Foto profil maksimal 2 MB." });
            expect((await kueri<{ n: string }>(`SELECT count(*)::text AS n FROM stored_files WHERE uploaded_by = ${String(pengguna.A)}`))[0]?.n).toBe(sebelum);
        });

        it("jenis di luar Bab 11.3 → 400 INVALID_REQUEST (validasi skema, 17.5 poin 5)", async () => {
            expect((await minta("POST", "/files/presign", "A", { jenis: "LAINNYA", mime: "image/png", ukuran: 10 })).status).toBe(400);
        });
    });

    describe("POST /files/confirm (SDD-09 §4.2 langkah 3)", () => {
        it("objek belum diunggah → 422; sesudah PUT → 200 PENDING, FILE_UPLOADED tanpa nama berkas, FileUploaded di outbox", async () => {
            const d = await presign("A");
            const belum = await minta("POST", "/files/confirm", "A", { file_id: d.file_id, checksum: sha(PNG) });
            expect(belum.status).toBe(422);
            expect(galat(belum)?.field).toBe("file_id");

            expect((await unggah(d)).status).toBe(200);
            const r = await minta("POST", "/files/confirm", "A", { file_id: d.file_id, checksum: sha(PNG) });
            expect(r.status).toBe(200);
            expect(r.json.data).toEqual({ file_id: d.file_id, scan_status: "PENDING" });
            expect((await baris(d.file_id))?.checksum).toBe(sha(PNG));
            expect(await log("FILE_UPLOADED")).toEqual([{ entitas_id: d.file_id, nilai_sebelum: null, nilai_sesudah: { file_id: d.file_id, jenis: "USER_PHOTO", mime: "image/png", ukuran: PNG.length } }]);
            const outbox = await kueri<{ payload: unknown }>(`SELECT payload FROM event_outbox WHERE event_name = 'FileUploaded' AND aggregate_type = 'stored_file' AND aggregate_id = '${d.file_id}'`);
            expect(outbox.map((o) => o.payload)).toEqual([{ file_id: d.file_id }]);
        });

        it("pengulangan dengan checksum sama → 200 tanpa log/event baru; checksum lain → 422", async () => {
            const id = await berkasTerkonfirmasi("A");
            sejakLog = Number((await kueri<{ n: string }>("SELECT coalesce(max(id), 0)::text AS n FROM activity_logs"))[0]?.n);
            expect((await minta("POST", "/files/confirm", "A", { file_id: id, checksum: sha(PNG) })).status).toBe(200);
            expect(await log("FILE_UPLOADED")).toEqual([]);
            expect((await kueri(`SELECT 1 FROM event_outbox WHERE event_name = 'FileUploaded' AND aggregate_id = '${id}'`)).length).toBe(1);
            const lain = await minta("POST", "/files/confirm", "A", { file_id: id, checksum: "0".repeat(64) });
            expect(lain.status).toBe(422);
            expect(galat(lain)?.field).toBe("checksum");
        });

        it("ukuran objek tidak cocok dengan deklarasi presign → 422, tidak dikonfirmasi", async () => {
            const d = await presign("A");
            // Ditulis langsung dengan kredensial server — presigned PUT sendiri menolak panjang lain.
            await s3.send(new PutObjectCommand({ Bucket: k.bucket, Key: d.object_key, Body: Buffer.concat([PNG, PNG]), ContentType: "image/png" }));
            const r = await minta("POST", "/files/confirm", "A", { file_id: d.file_id, checksum: sha(PNG) });
            expect(r.status).toBe(422);
            expect((await baris(d.file_id))?.checksum).toBeNull();
        });

        it("berkas unggahan pengguna lain → 404 tanpa membocorkan keberadaannya (17.5 poin 3)", async () => {
            const d = await presign("A");
            await unggah(d);
            const r = await minta("POST", "/files/confirm", "B", { file_id: d.file_id, checksum: sha(PNG) });
            expect(r.status).toBe(404);
            expect((await baris(d.file_id))?.checksum).toBeNull();
        });
    });

    describe("foto profil — PUT /me & GET /me (FR-01.4 langkah 5; keputusan 7b/7c)", () => {
        it("menautkan foto sendiri → owner_id terisi, PROFILE_UPDATED mencatat foto_file_id; PENDING tanpa URL", async () => {
            const id = await berkasTerkonfirmasi("A");
            const r = await minta("PUT", "/me", "A", { foto_file_id: id });
            expect(r.status).toBe(200);
            expect(r.json.data?.["user"]).toMatchObject({ foto_status: "PENDING", foto_url: null });
            expect((await baris(id))?.owner_id).toBe(String(pengguna.A));
            const [l] = await log("PROFILE_UPDATED");
            expect(l?.nilai_sesudah["foto_file_id"]).toBe(id);
            expect((await minta("GET", "/me", "A")).json.data?.["user"]).toMatchObject({ foto_status: "PENDING", foto_url: null });
        });

        it("SDD-FS-03: hanya CLEAN yang menghasilkan URL unduhan — dan URL itu mengembalikan isi berkas", async () => {
            const id = await berkasTerkonfirmasi("A");
            await minta("PUT", "/me", "A", { foto_file_id: id });
            for (const status of ["FAILED", "INFECTED"]) {
                await kueri(`UPDATE stored_files SET scan_status = '${status}' WHERE id = ${id}`);
                expect((await minta("GET", "/me", "A")).json.data?.["user"]).toMatchObject({ foto_status: status, foto_url: null });
            }
            await kueri(`UPDATE stored_files SET scan_status = 'CLEAN' WHERE id = ${id}`);
            const user = (await minta("GET", "/me", "A")).json.data?.["user"] as { foto_status: string; foto_url: string };
            expect(user.foto_status).toBe("CLEAN");
            const isi = await fetch(user.foto_url);
            expect(isi.status).toBe(200);
            expect(Buffer.from(await isi.arrayBuffer()).equals(PNG)).toBe(true);
        });

        it("berkas yang tidak sah → 422 foto_file_id, profil tidak berubah: belum dikonfirmasi, milik orang lain, jenis lain, INFECTED", async () => {
            const awal = await berkasTerkonfirmasi("B");
            await minta("PUT", "/me", "B", { foto_file_id: awal });
            const belum = (await presign("B")).file_id;
            const milikA = await berkasTerkonfirmasi("A");
            const kerusakan = await berkasTerkonfirmasi("B", "DAMAGE_PHOTO");
            const terinfeksi = await berkasTerkonfirmasi("B");
            await kueri(`UPDATE stored_files SET scan_status = 'INFECTED' WHERE id = ${terinfeksi}`);
            for (const id of [belum, milikA, kerusakan, terinfeksi]) {
                const r = await minta("PUT", "/me", "B", { foto_file_id: id, nama: "Tidak Boleh Tersimpan" });
                expect(r.status).toBe(422);
                expect(galat(r)?.field).toBe("foto_file_id");
                expect((await baris(id))?.owner_id).toBeNull();
            }
            const [u] = await kueri<{ foto_file_id: string; nama: string }>(`SELECT foto_file_id::text, nama FROM users WHERE id = ${String(pengguna.B)}`);
            expect(u).toEqual({ foto_file_id: awal, nama: "Guru B" });
        });

        it("mengganti foto melepas yang lama menjadi yatim (SDD-FS-09); foto_file_id null menghapus foto", async () => {
            const lama = await berkasTerkonfirmasi("A");
            await minta("PUT", "/me", "A", { foto_file_id: lama });
            const baru = await berkasTerkonfirmasi("A");
            expect((await minta("PUT", "/me", "A", { foto_file_id: baru })).status).toBe(200);
            expect((await baris(lama))?.owner_id).toBeNull();
            expect((await baris(baru))?.owner_id).toBe(String(pengguna.A));

            const hapus = await minta("PUT", "/me", "A", { foto_file_id: null });
            expect(hapus.status).toBe(200);
            expect(hapus.json.data?.["user"]).toMatchObject({ foto_status: null, foto_url: null });
            expect((await baris(baru))?.owner_id).toBeNull();
        });
    });
});
