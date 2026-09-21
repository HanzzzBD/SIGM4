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
    readonly objectStoragePublicOrigin: string;
    /** Pasangan kunci Ed25519 penandatangan access token; sudah tervalidasi. */
    readonly jwtKeys: JwtKeys;
    /** Kotak enkripsi secret TOTP (`TOTP_ENCRYPTION_KEY`); sudah tervalidasi. */
    readonly totpKey: KotakRahasia;
}

/** Validasi startup sigm4-api: skema proses ditambah variabel yang dipakai API. */
export function readApiConfig(
    env: NodeJS.ProcessEnv = process.env,
    zona: string = zonaProses(),
): ApiConfig {
    const jwt = periksaKunciJwt(env);
    const totp = periksaKunciTotp(env);
    const d = urai(
        z.object({
            ...bentukDatabase,
            ...bentukRedis,
            ...bentukLog,
            ...bentukZona,
            ...bentukPenyimpananPublik,
            ...bentukJwt,
            ...bentukTotp,
        }),
        env,
        [...periksaZona(zona), ...jwt.masalah, ...totp.masalah],
    );
    return {
        database: {
            connectionString: d.DATABASE_URL,
            poolSize: d.DB_POOL_SIZE,
        },
        redis: { url: d.REDIS_URL },
        logLevel: d.LOG_LEVEL,
        objectStoragePublicOrigin: d.S3_PUBLIC_ENDPOINT,
        // `periksaKunciJwt` tidak melaporkan masalah bila kedua variabel sah, jadi kunci ada.
        jwtKeys: jwt.kunci!,
        // Sama: `periksaKunciTotp` hanya diam bila variabelnya sah.
        totpKey: totp.kotak!,
    };
}
