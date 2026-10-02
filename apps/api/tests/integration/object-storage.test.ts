// Acceptance PR-03-04 (SDD-FS-01/05/13, OBS-06; keputusan 5 log phase-03): adapter object storage
// terhadap MinIO NYATA — pengganti lokal Backblaze B2 (API S3-compatible yang sama).

import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DeleteObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { KonfigurasiPenyimpanan } from "../../src/shared/config/index.js";
import { FixedClock, SystemClock } from "../../src/shared/clock/index.js";
import { objectStorageCheck, PenyimpananS3 } from "../../src/shared/storage/index.js";

const env = process.env;
const ADA = env["S3_ENDPOINT"] !== undefined && env["S3_BUCKET"] !== undefined;

describe.skipIf(!ADA)("PR-03-04 — object storage S3-compatible (acceptance, MinIO nyata)", () => {
    // Host publik SENGAJA berbeda dari host server (127.0.0.1 ↔ localhost, keduanya menjangkau MinIO
    // yang sama): tanpa itu, penandatangan yang keliru memakai S3_ENDPOINT tidak akan ketahuan.
    const server = new URL(env["S3_ENDPOINT"] ?? "http://x");
    const publik = new URL(server.href);
    publik.hostname = server.hostname === "localhost" ? "127.0.0.1" : "localhost";
    const k: KonfigurasiPenyimpanan = {
        endpoint: server.origin,
        publicEndpoint: publik.origin,
        region: env["S3_REGION"] ?? "",
        bucket: env["S3_BUCKET"] ?? "",
        accessKey: env["S3_ACCESS_KEY"] ?? "",
        secretKey: env["S3_SECRET_KEY"] ?? "",
    };
    const penyimpanan = new PenyimpananS3(k, new SystemClock());
    const dibuat: string[] = [];
    const kunci = () => {
        const x = `uji/${randomUUID()}.png`;
        dibuat.push(x);
        return x;
    };
    const ISI = Buffer.from("isi berkas uji PR-03-04");
    const unggah = (url: string, mime: string, isi: Buffer) => fetch(url, { method: "PUT", headers: { "content-type": mime }, body: new Uint8Array(isi) });

    let pembersih: S3Client;
    beforeAll(() => {
        pembersih = new S3Client({ endpoint: k.endpoint, region: k.region, forcePathStyle: true, credentials: { accessKeyId: k.accessKey, secretAccessKey: k.secretKey } });
    });
    afterAll(async () => {
        for (const key of dibuat) await pembersih.send(new DeleteObjectCommand({ Bucket: k.bucket, Key: key }));
    });

    it("SDD-FS-01/13: presigned PUT path-style di host S3_PUBLIC_ENDPOINT → objek tersimpan; HEAD melaporkan ukurannya", async () => {
        const key = kunci();
        const url = await penyimpanan.urlUnggah(key, "image/png", ISI.length, 300);
        const u = new URL(url);
        expect(u.origin).toBe(k.publicEndpoint);
        expect(u.origin).not.toBe(k.endpoint);
        expect(u.pathname).toBe(`/${k.bucket}/${key}`);
        expect(await penyimpanan.info(key)).toBeNull();
        expect((await unggah(url, "image/png", ISI)).status).toBe(200);
        expect(await penyimpanan.info(key)).toEqual({ ukuran: ISI.length });
    });

    it("MIME dan ukuran ikut ditandatangani: klien yang menukar jenis atau panjang berkas ditolak (403)", async () => {
        const key = kunci();
        const url = await penyimpanan.urlUnggah(key, "image/png", ISI.length, 300);
        expect((await unggah(url, "application/pdf", ISI)).status).toBe(403);
        expect((await unggah(url, "image/png", Buffer.concat([ISI, ISI]))).status).toBe(403);
        expect(await penyimpanan.info(key)).toBeNull();
    });

    it("SDD-FS-05: presigned GET mengembalikan isi persis", async () => {
        const key = kunci();
        await unggah(await penyimpanan.urlUnggah(key, "image/png", ISI.length, 300), "image/png", ISI);
        const r = await fetch(await penyimpanan.urlUnduh(key, 900));
        expect(r.status).toBe(200);
        expect(Buffer.from(await r.arrayBuffer()).equals(ISI)).toBe(true);
    });

    it("SDD-SYS-07: waktu tanda tangan dari Clock — URL yang ditandatangani 1 jam lalu (berlaku 5 menit) sudah kedaluwarsa", async () => {
        const key = kunci();
        const lampau = new PenyimpananS3(k, new FixedClock(new Date(Date.now() - 3_600_000)));
        expect((await unggah(await lampau.urlUnggah(key, "image/png", ISI.length, 300), "image/png", ISI)).status).toBe(403);
        expect((await fetch(await lampau.urlUnduh(key, 300))).status).toBe(403);
    });

    it("OBS-06: object_storage up dengan bucket sungguhan; down bila bucket salah atau kredensial salah", async () => {
        expect((await objectStorageCheck(penyimpanan).probe()).status).toBe("up");
        await expect(new PenyimpananS3({ ...k, bucket: `tidak-ada-${randomUUID().slice(0, 8)}` }, new SystemClock()).periksa()).rejects.toThrow();
        await expect(new PenyimpananS3({ ...k, secretKey: "salah" }, new SystemClock()).periksa()).rejects.toThrow();
    });
});
