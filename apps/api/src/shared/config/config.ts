// Konfigurasi proses dari variabel lingkungan (SDD-SYS-14, SDD-INF-08, SDD-INF-09).
//
// Satu skema, satu tempat aturan: pembaca koneksi (`shared/db`, `shared/cache`),
// logger, dan kedua entrypoint memakai parser di sini, sehingga sebuah variabel
// tidak divalidasi dua kali dengan dua aturan berbeda. Skemanya bertahap —
// variabel `SDD-16 §4.7` masuk bersama PR pertama yang memakainya.
//
// Pesan galat menyebut NAMA variabel, tidak pernah nilainya (SDD-16 §4.7).

import { z } from "zod";
import { JwtKeys } from "../security/jwt.js";
import { KotakRahasia } from "../security/secret-box.js";

export const LEVEL_LOG = ["debug", "info", "warn", "error"] as const;
export type Level = (typeof LEVEL_LOG)[number];

/**
 * Bawaan pool. Nilai produksinya adalah `TBD-AVL-C` — dikalibrasi setelah uji beban
 * Phase 07-08 dan dibatasi tier langganan penyedia (SDD-16 §5), bukan ditebak di sini.
 */
const UKURAN_POOL_BAWAAN = 10;

/** Nama zona yang dilaporkan runtime untuk UTC. */
const ZONA_UTC: ReadonlySet<string> = new Set(["UTC", "Etc/UTC"]);

export class ConfigError extends Error {
    constructor(readonly masalah: readonly string[]) {
        super(
            `Konfigurasi tidak valid (SDD-INF-08):\n${masalah.map((m) => `  - ${m}`).join("\n")}`,
        );
        this.name = "ConfigError";
    }
}

const pesan = (nama: string, aturan: string, id = "SDD-INF-08"): string =>
    `Variabel lingkungan ${nama} ${aturan} (${id}).`;

const kosong = (v: string | undefined): boolean =>
    v === undefined || v.trim() === "";

function wajib(nama: string) {
    const galat = pesan(nama, "wajib diisi");
    return z
        .string({ error: galat })
        .trim()
        .min(1, { error: galat, abort: true });
}

/**
 * URL http(s) dengan host. `new URL` saja tidak cukup: `minio:9000` terurai sah
 * dengan skema `minio:` dan origin `"null"`, yang lalu diam-diam masuk `img-src`.
 */
function urlAbsolut(v: string): boolean {
    try {
        const url = new URL(v);
        return (
            (url.protocol === "http:" || url.protocol === "https:") &&
            url.host !== ""
        );
    } catch {
        return false;
    }
}

const bentukDatabase = {
    DATABASE_URL: wajib("DATABASE_URL"),
    DB_POOL_SIZE: z
        .string()
        .optional()
        .refine(
            (v) => kosong(v) || (Number.isInteger(Number(v)) && Number(v) >= 1),
            { error: pesan("DB_POOL_SIZE", "harus bilangan bulat >= 1") },
        )
        .transform((v) => (kosong(v) ? UKURAN_POOL_BAWAAN : Number(v))),
};

const bentukRedis = { REDIS_URL: wajib("REDIS_URL") };

const bentukLog = {
    LOG_LEVEL: z
        .string()
        .optional()
        .refine(
            (v) =>
                kosong(v) ||
                (LEVEL_LOG as readonly string[]).includes(
                    v!.trim().toLowerCase(),
                ),
            {
                error: pesan(
                    "LOG_LEVEL",
                    `harus salah satu dari ${LEVEL_LOG.join(", ")}`,
                ),
            },
        )
        .transform((v): Level =>
            kosong(v) ? "info" : (v!.trim().toLowerCase() as Level),
        ),
};

const bentukZona = {
    TZ: z
        .string({ error: pesan("TZ", "wajib bernilai UTC", "SDD-INF-09") })
        .refine((v) => v.trim() === "UTC", {
            error: pesan("TZ", "wajib bernilai UTC", "SDD-INF-09"),
        }),
};

const bentukPenyimpananPublik = {
    // Origin yang dijangkau peramban: presigned URL dan `img-src` (SDD-FS-13).
    S3_PUBLIC_ENDPOINT: wajib("S3_PUBLIC_ENDPOINT")
        .refine(urlAbsolut, {
            error: pesan(
                "S3_PUBLIC_ENDPOINT",
                "harus URL absolut berskema http atau https",
            ),
        })
        .transform((v) => new URL(v).origin),
};

/** Object storage S3-compatible tervalidasi (SDD-FS-13). Kunci rahasia tidak pernah dicetak. */
export interface KonfigurasiPenyimpanan {
    /** Origin operasi sisi server (HEAD, cek kesiapan). */
    readonly endpoint: string;
    /** Origin yang dijangkau peramban/mobile — host presigned URL (`S3_PUBLIC_ENDPOINT`). */
    readonly publicEndpoint: string;
    readonly region: string;
    readonly bucket: string;
    readonly accessKey: string;
    readonly secretKey: string;
}

// Operasi sisi server ke object storage (SDD-FS-13, PR-03-04; keputusan 5 log phase-03): MinIO di
// dev/CI, Backblaze B2 lewat API S3-compatible di produksi. Region wajib: SigV4 B2 menandatangani
// dengan region bucket (mis. `us-west-004`); MinIO menerima nilai apa pun.
const bentukPenyimpanan = {
    S3_ENDPOINT: wajib("S3_ENDPOINT")
        .refine(urlAbsolut, { error: pesan("S3_ENDPOINT", "harus URL absolut berskema http atau https") })
        .transform((v) => new URL(v).origin),
    S3_REGION: wajib("S3_REGION"),
    S3_BUCKET: wajib("S3_BUCKET"),
    S3_ACCESS_KEY: wajib("S3_ACCESS_KEY"),
    S3_SECRET_KEY: wajib("S3_SECRET_KEY"),
};

/** Alamat clamd (SDD-FS-04): `tcp://host:port`. */
export interface KonfigurasiAntivirus {
    readonly host: string;
    readonly port: number;
}

/** `tcp://host:port` tanpa jalur, kredensial, query, maupun fragmen. */
function urlClamd(v: string): KonfigurasiAntivirus | null {
    try {
        const u = new URL(v);
        if (u.protocol !== "tcp:" || u.hostname === "" || u.port === "" || u.username !== "" || u.password !== "" || u.search !== "" || u.hash !== "" || (u.pathname !== "" && u.pathname !== "/")) return null;
        return { host: u.hostname, port: Number(u.port) };
    } catch {
        return null;
    }
}

// ClamAV sebagai proses terpisah (SDD-FS-04; PR-03-05, keputusan 8a log phase-03). WAJIB bagi API
// (`av_scanner` di /health) dan worker (pemindaian): tanpanya berkas menumpuk PENDING dan tak
// pernah dapat diunduh — lebih baik ketahuan saat deploy.
const bentukAntivirus = {
    CLAMAV_URL: wajib("CLAMAV_URL").refine((v) => urlClamd(v) !== null, { error: pesan("CLAMAV_URL", "harus berbentuk tcp://host:port") }),
};

/** `APP_BASE_URL` sah: https, berhost, tanpa kredensial/query/fragmen — dasar URL permanen label QR. */
const urlDasarAplikasi = (v: string): boolean => {
    try {
        const u = new URL(v);
        return u.protocol === "https:" && u.hostname !== "" && u.username === "" && u.password === "" && u.search === "" && u.hash === "";
    } catch {
        return false;
    }
};

// Domain publik aplikasi (SDD-16 §4.7): label QR mencetak `https://{domain}/a/{asset_uuid}` secara
// PERMANEN (FR-05.1 langkah 1) — URL tak sah di sini berarti label mati, jadi ditolak saat startup.
const bentukAplikasi = {
    APP_BASE_URL: wajib("APP_BASE_URL")
        .refine(urlDasarAplikasi, { error: pesan("APP_BASE_URL", "harus URL https berhost tanpa query maupun fragmen") })
        .transform((v) => v.replace(/\/+$/, "")),
};

// Chromium pembangkit PDF (SDD-FS-12; PR-03-02, keputusan 2 log phase-03). OPSIONAL: kosong →
// Chrome terpasang (dev, runner CI); image Alpine mengisinya dengan Chromium dari apk.
const bentukPdf = {
    CHROMIUM_EXECUTABLE_PATH: z
        .string()
        .optional()
        .transform((v) => (kosong(v) ? null : v!.trim())),
};

// Kunci penandatangan access token (SDD-SESS-02, SDD-16 §4.7). PEM: PKCS#8 privat dan SPKI
// publik; `\n` literal diterima agar muat pada berkas env satu baris.
const bentukJwt = {
    JWT_PRIVATE_KEY: wajib("JWT_PRIVATE_KEY"),
    JWT_PUBLIC_KEY: wajib("JWT_PUBLIC_KEY"),
};

// Kunci enkripsi secret TOTP (SDD-SESS-08, SDD-16 §4.7; PR-02-07): base64 tepat 32 byte, TERPISAH
// dari kunci JWT. Diperiksa bentuknya di sini agar salah pasang gagal saat startup, bukan saat
// pengguna pertama mendaftar 2FA.
const bentukTotp = {
    TOTP_ENCRYPTION_KEY: wajib("TOTP_ENCRYPTION_KEY"),
};

function periksaKunciTotp(env: NodeJS.ProcessEnv): { masalah: string[]; kotak?: KotakRahasia } {
    if (kosong(env["TOTP_ENCRYPTION_KEY"])) return { masalah: [] };
    try {
        return { masalah: [], kotak: KotakRahasia.dariBase64(env["TOTP_ENCRYPTION_KEY"]!) };
    } catch (galat) {
        const alasan = galat instanceof Error ? galat.message : "tidak sah";
        return { masalah: [pesan("TOTP_ENCRYPTION_KEY", `tidak sah: ${alasan}`)] };
    }
}

/** Kredensial service account FCM yang sudah tervalidasi (`FCM_CREDENTIALS`, SDD-08 §4.4a). */
export interface KredensialFcm {
    readonly projectId: string;
    readonly clientEmail: string;
    readonly privateKey: string;
}

/**
 * `FCM_CREDENTIALS` OPSIONAL (keputusan 80a): JSON service account ber-base64. Tanpa itu push
 * dilewati dan /health melaporkan `fcm` tidak dikonfigurasi — tanpa memengaruhi `ready` (OBS-06).
 * Galat hanya menyebut NAMA variabel, tidak pernah isinya.
 */
function periksaKredensialFcm(env: NodeJS.ProcessEnv): { masalah: string[]; kredensial?: KredensialFcm } {
    if (kosong(env["FCM_CREDENTIALS"])) return { masalah: [] };
    try {
        const j = JSON.parse(Buffer.from(env["FCM_CREDENTIALS"]!.trim(), "base64").toString("utf8")) as Record<string, unknown>;
        const { project_id: projectId, client_email: clientEmail, private_key: privateKey } = j;
        if (typeof projectId !== "string" || typeof clientEmail !== "string" || typeof privateKey !== "string" || projectId === "" || clientEmail === "" || privateKey === "") {
            return { masalah: [pesan("FCM_CREDENTIALS", "tidak sah: wajib memuat project_id, client_email, private_key")] };
        }
        return { masalah: [], kredensial: { projectId, clientEmail, privateKey } };
    } catch {
        return { masalah: [pesan("FCM_CREDENTIALS", "tidak sah: bukan JSON ber-base64")] };
    }
}

/** Memeriksa PEM dan pasangannya; galatnya menyebut NAMA variabel saja, tidak pernah isinya. */
function periksaKunciJwt(env: NodeJS.ProcessEnv): { masalah: string[]; kunci?: JwtKeys } {
    if (kosong(env["JWT_PRIVATE_KEY"]) || kosong(env["JWT_PUBLIC_KEY"])) return { masalah: [] };
    try {
        return { masalah: [], kunci: JwtKeys.dariPem(env["JWT_PRIVATE_KEY"]!, env["JWT_PUBLIC_KEY"]!) };
    } catch (galat) {
        const alasan = galat instanceof Error ? galat.message : "tidak sah";
        return { masalah: [pesan("JWT_PRIVATE_KEY/JWT_PUBLIC_KEY", `tidak sah: ${alasan}`)] };
    }
}

/** Mengurai satu skema; seluruh masalah dilaporkan sekaligus, bukan satu per satu. */
function urai<T extends z.ZodType>(
    skema: T,
    env: NodeJS.ProcessEnv,
    tambahan: readonly string[] = [],
): z.output<T> {
    const hasil = skema.safeParse(env);
    const masalah = [
        ...(hasil.success ? [] : hasil.error.issues.map((i) => i.message)),
        ...tambahan,
    ];
    if (!hasil.success || masalah.length > 0) {
        throw new ConfigError([...new Set(masalah)]);
    }
    return hasil.data;
}

export interface DatabaseEnv {
    readonly connectionString: string;
    readonly poolSize: number;
}

export function parseDatabaseEnv(
    env: NodeJS.ProcessEnv = process.env,
): DatabaseEnv {
    const d = urai(z.object(bentukDatabase), env);
    return { connectionString: d.DATABASE_URL, poolSize: d.DB_POOL_SIZE };
}

export function parseRedisEnv(env: NodeJS.ProcessEnv = process.env): {
    readonly url: string;
} {
    return { url: urai(z.object(bentukRedis), env).REDIS_URL };
}

export function parseLogLevel(env: NodeJS.ProcessEnv = process.env): Level {
    return urai(z.object(bentukLog), env).LOG_LEVEL;
}

/** Zona waktu yang benar-benar berlaku di proses — bukan sekadar variabelnya. */
export function zonaProses(): string {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

function periksaZona(zona: string): string[] {
    return ZONA_UTC.has(zona)
        ? []
        : ["Zona waktu proses harus UTC, bukan zona lokal mesin (SDD-INF-09)."];
}

export interface ProcessConfig {
    readonly database: DatabaseEnv;
    readonly redis: { readonly url: string };
    readonly logLevel: Level;
}

/** Validasi startup yang berlaku bagi setiap proses — api dan worker (SDD-INF-08/09). */
export function readProcessConfig(
    env: NodeJS.ProcessEnv = process.env,
    zona: string = zonaProses(),
): ProcessConfig {
    const d = urai(
        z.object({
            ...bentukDatabase,
            ...bentukRedis,
            ...bentukLog,
            ...bentukZona,
        }),
        env,
        periksaZona(zona),
    );
    return {
        database: {
            connectionString: d.DATABASE_URL,
            poolSize: d.DB_POOL_SIZE,
        },
        redis: { url: d.REDIS_URL },
        logLevel: d.LOG_LEVEL,
    };
}

export interface ApiConfig extends ProcessConfig {
    /** `null` = push tidak dikonfigurasi (keputusan 80a). */
    readonly fcm: KredensialFcm | null;
    readonly objectStoragePublicOrigin: string;
    /** Akses object storage sisi server (SDD-FS-13, `PR-03-04`); penandatangan memakai origin publik. */
    readonly objectStorage: KonfigurasiPenyimpanan;
    /** `APP_BASE_URL` tanpa garis miring penutup — dasar payload QR (FR-05.1, `PR-03-01`). */
    readonly appBaseUrl: string;
    /** clamd (`CLAMAV_URL`, SDD-FS-04, `PR-03-05`). */
    readonly antivirus: KonfigurasiAntivirus;
    /** `CHROMIUM_EXECUTABLE_PATH`; `null` = Chrome terpasang (SDD-FS-12, `PR-03-02`). */
    readonly chromiumExecutablePath: string | null;
    /** Pasangan kunci Ed25519 penandatangan access token; sudah tervalidasi. */
    readonly jwtKeys: JwtKeys;
    /** Kotak enkripsi secret TOTP (`TOTP_ENCRYPTION_KEY`); sudah tervalidasi. */
    readonly totpKey: KotakRahasia;
}

export interface WorkerConfig extends ProcessConfig {
    readonly chromiumExecutablePath: string | null;
    /** `null` = push tidak dikonfigurasi (keputusan 80a). */
    readonly fcm: KredensialFcm | null;
    /**
     * Pemindai membaca isi objek dan menghapus yang terinfeksi (SDD-FS-04, `PR-03-05`). Worker
     * tidak pernah menandatangani URL untuk peramban, jadi `publicEndpoint` = `S3_ENDPOINT`.
     */
    readonly objectStorage: KonfigurasiPenyimpanan;
    readonly antivirus: KonfigurasiAntivirus;
    /** Kotak enkripsi secret TOTP (`TOTP_ENCRYPTION_KEY`); sudah tervalidasi. */
    readonly totpKey: KotakRahasia;
}

/**
 * Validasi startup sigm4-worker DAN CLI break-glass yang berjalan pada artefak yang sama
 * (`SDD-SESS-11`, `PR-02-08`). Worker tidak pernah menandatangani atau memverifikasi token
 * (tanpa `JWT_*`) maupun menyajikan presigned URL (tanpa `S3_PUBLIC_ENDPOINT`), tetapi
 * `TOTP_ENCRYPTION_KEY` operator sudah menyediakannya di berkas env yang sama dengan API
 * (`SDD-16 §4.7`) — memvalidasinya di sini menutup celah startup diam-diam (`SDD-INF-08`)
 * yang sebelumnya ada: variabel itu terpasang tetapi tidak pernah diperiksa proses worker.
 */
export function readWorkerConfig(
    env: NodeJS.ProcessEnv = process.env,
    zona: string = zonaProses(),
): WorkerConfig {
    const totp = periksaKunciTotp(env);
    const fcm = periksaKredensialFcm(env);
    const d = urai(
        z.object({
            ...bentukDatabase,
            ...bentukRedis,
            ...bentukLog,
            ...bentukZona,
            ...bentukTotp,
            ...bentukPenyimpanan,
            ...bentukAntivirus,
            ...bentukPdf,
        }),
        env,
        [...periksaZona(zona), ...totp.masalah, ...fcm.masalah],
    );
    return {
        database: {
            connectionString: d.DATABASE_URL,
            poolSize: d.DB_POOL_SIZE,
        },
        redis: { url: d.REDIS_URL },
        logLevel: d.LOG_LEVEL,
        // `periksaKunciTotp` hanya diam bila variabelnya sah.
        totpKey: totp.kotak!,
        fcm: fcm.kredensial ?? null,
        objectStorage: {
            endpoint: d.S3_ENDPOINT,
            publicEndpoint: d.S3_ENDPOINT,
            region: d.S3_REGION,
            bucket: d.S3_BUCKET,
            accessKey: d.S3_ACCESS_KEY,
            secretKey: d.S3_SECRET_KEY,
        },
        // `bentukAntivirus` sudah menolak bentuk yang tak terurai.
        antivirus: urlClamd(d.CLAMAV_URL)!,
        chromiumExecutablePath: d.CHROMIUM_EXECUTABLE_PATH,
    };
}

/** Validasi startup sigm4-api: skema proses ditambah variabel yang dipakai API. */
export function readApiConfig(
    env: NodeJS.ProcessEnv = process.env,
    zona: string = zonaProses(),
): ApiConfig {
    const jwt = periksaKunciJwt(env);
    const totp = periksaKunciTotp(env);
    const fcm = periksaKredensialFcm(env);
    const d = urai(
        z.object({
            ...bentukDatabase,
            ...bentukRedis,
            ...bentukLog,
            ...bentukZona,
            ...bentukPenyimpananPublik,
            ...bentukPenyimpanan,
            ...bentukAplikasi,
            ...bentukPdf,
            ...bentukAntivirus,
            ...bentukJwt,
            ...bentukTotp,
        }),
        env,
        [...periksaZona(zona), ...jwt.masalah, ...totp.masalah, ...fcm.masalah],
    );
    return {
        database: {
            connectionString: d.DATABASE_URL,
            poolSize: d.DB_POOL_SIZE,
        },
        redis: { url: d.REDIS_URL },
        logLevel: d.LOG_LEVEL,
        objectStoragePublicOrigin: d.S3_PUBLIC_ENDPOINT,
        objectStorage: {
            endpoint: d.S3_ENDPOINT,
            publicEndpoint: d.S3_PUBLIC_ENDPOINT,
            region: d.S3_REGION,
            bucket: d.S3_BUCKET,
            accessKey: d.S3_ACCESS_KEY,
            secretKey: d.S3_SECRET_KEY,
        },
        appBaseUrl: d.APP_BASE_URL,
        chromiumExecutablePath: d.CHROMIUM_EXECUTABLE_PATH,
        antivirus: urlClamd(d.CLAMAV_URL)!,
        // `periksaKunciJwt` tidak melaporkan masalah bila kedua variabel sah, jadi kunci ada.
        jwtKeys: jwt.kunci!,
        // Sama: `periksaKunciTotp` hanya diam bila variabelnya sah.
        totpKey: totp.kotak!,
        fcm: fcm.kredensial ?? null,
    };
}
