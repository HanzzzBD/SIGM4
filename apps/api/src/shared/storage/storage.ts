// Object storage S3-compatible (INF-02, SDD-09; PR-03-04, keputusan 5 log phase-03): MinIO di
// dev/CI, Backblaze B2 lewat API S3-compatible di produksi — kode yang sama, hanya endpoint yang
// berganti. Byte berkas tidak pernah melewati proses API (SDD-FS-01): yang diterbitkan di sini
// hanya presigned URL, ditambah HEAD untuk verifikasi `confirm` dan cek kesiapan. Isi berkas
// hanya dibaca WORKER pemindai, dan objek terinfeksi dihapus olehnya (SDD-FS-04, PR-03-05).

import { DeleteObjectCommand, GetObjectCommand, HeadBucketCommand, HeadObjectCommand, NotFound, PutObjectCommand, S3Client, S3ServiceException } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { Clock } from "../clock/index.js";
import type { KonfigurasiPenyimpanan } from "../config/index.js";

export interface InfoObjek {
    readonly ukuran: number;
}

export interface PenyimpananObjek {
    /** Presigned PUT (SDD-FS-01). `mime` dan `ukuran` ikut ditandatangani — klien tak bisa menukarnya. */
    urlUnggah(kunci: string, mime: string, ukuran: number, berlakuDetik: number): Promise<string>;
    /** Presigned GET (SDD-FS-05). Pemeriksaan permission & `scan_status` milik PEMANGGIL (SDD-FS-03). */
    urlUnduh(kunci: string, berlakuDetik: number): Promise<string>;
    /** HEAD objek; `null` bila belum/tidak ada (verifikasi `confirm`, SDD-09 §4.2 langkah 3). */
    info(kunci: string): Promise<InfoObjek | null>;
    /** Isi objek bagi pemindai AV (SDD-FS-04); `null` bila tidak ada. Hanya dipakai worker. */
    ambil(kunci: string): Promise<Buffer | null>;
    /** Menghapus objek — berkas `INFECTED` (SDD-09 §4.6). Idempoten: objek yang tak ada bukan galat. */
    hapus(kunci: string): Promise<void>;
    /** Bucket terjangkau dengan kredensial ini — `object_storage` di `/health` (OBS-06). */
    periksa(): Promise<void>;
}

/**
 * Dua klien (SDD-FS-13): `server` berbicara ke `S3_ENDPOINT` (jaringan internal), `penanda`
 * hanya menandatangani dengan host `S3_PUBLIC_ENDPOINT` — tanda tangan SigV4 mengikat host,
 * jadi URL untuk peramban harus ditandatangani dengan host yang dijangkau peramban. Path-style
 * (`{endpoint}/{bucket}/{key}`) agar seluruh berkas satu origin bagi CSP `img-src`.
 */
export class PenyimpananS3 implements PenyimpananObjek {
    private readonly server: S3Client;
    private readonly penanda: S3Client;

    constructor(
        private readonly konfigurasi: KonfigurasiPenyimpanan,
        private readonly clock: Clock,
    ) {
        const dasar = {
            region: konfigurasi.region,
            forcePathStyle: true,
            credentials: { accessKeyId: konfigurasi.accessKey, secretAccessKey: konfigurasi.secretKey },
            // B2 menolak header checksum CRC bawaan SDK ≥ 3.729 pada presigned PUT; hanya bila diminta.
            requestChecksumCalculation: "WHEN_REQUIRED",
            responseChecksumValidation: "WHEN_REQUIRED",
        } as const;
        this.server = new S3Client({ ...dasar, endpoint: konfigurasi.endpoint });
        this.penanda = new S3Client({ ...dasar, endpoint: konfigurasi.publicEndpoint });
    }

    urlUnggah(kunci: string, mime: string, ukuran: number, berlakuDetik: number): Promise<string> {
        const perintah = new PutObjectCommand({ Bucket: this.konfigurasi.bucket, Key: kunci, ContentType: mime, ContentLength: ukuran });
        // Waktu tanda tangan dari Clock yang di-inject (SDD-SYS-07), bukan jam sistem SDK.
        return getSignedUrl(this.penanda, perintah, { expiresIn: berlakuDetik, signingDate: this.clock.now(), signableHeaders: new Set(["content-type", "content-length"]) });
    }

    urlUnduh(kunci: string, berlakuDetik: number): Promise<string> {
        return getSignedUrl(this.penanda, new GetObjectCommand({ Bucket: this.konfigurasi.bucket, Key: kunci }), { expiresIn: berlakuDetik, signingDate: this.clock.now() });
    }

    async info(kunci: string): Promise<InfoObjek | null> {
        try {
            const h = await this.server.send(new HeadObjectCommand({ Bucket: this.konfigurasi.bucket, Key: kunci }));
            return { ukuran: h.ContentLength ?? 0 };
        } catch (galat) {
            // HEAD tak bertubuh: SDK hanya punya kode status untuk "tidak ada".
            if (galat instanceof NotFound || (galat instanceof S3ServiceException && galat.$metadata.httpStatusCode === 404)) return null;
            throw galat;
        }
    }

    async ambil(kunci: string): Promise<Buffer | null> {
        try {
            const o = await this.server.send(new GetObjectCommand({ Bucket: this.konfigurasi.bucket, Key: kunci }));
            return o.Body === undefined ? Buffer.alloc(0) : Buffer.from(await o.Body.transformToByteArray());
        } catch (galat) {
            if (galat instanceof S3ServiceException && galat.$metadata.httpStatusCode === 404) return null;
            throw galat;
        }
    }

    async hapus(kunci: string): Promise<void> {
        await this.server.send(new DeleteObjectCommand({ Bucket: this.konfigurasi.bucket, Key: kunci }));
    }

    async periksa(): Promise<void> {
        await this.server.send(new HeadBucketCommand({ Bucket: this.konfigurasi.bucket }));
    }
}
