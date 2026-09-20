// Skema konfigurasi terpusat (SDD-SYS-14, SDD-INF-08, SDD-INF-09).
//
// Zona waktu proses selalu disuntikkan: mesin pengembang tidak berjalan dalam
// UTC, dan uji ini tidak boleh bergantung pada zona mesin yang menjalankannya.

import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { start } from "../../src/api/index.js";
import {
    ConfigError,
    parseLogLevel,
    readApiConfig,
    readProcessConfig,
} from "../../src/shared/config/index.js";
import { bootstrap } from "../../src/worker/index.js";
import { bangkitkanPem, envJwtUji } from "../helpers/auth.js";

const SAH = {
    DATABASE_URL: "postgres://sigm4:rahasia@db:5432/sigm4",
    REDIS_URL: "redis://:rahasia@redis:6379",
    TZ: "UTC",
};

// Skema API menuntut pasangan kunci JWT (SDD-SESS-02) dan kunci enkripsi TOTP (SDD-SESS-08); skema proses tidak.
const PEM = bangkitkanPem();
const KUNCI_TOTP = randomBytes(32).toString("base64");
const SAH_API = {
    ...SAH,
    ...envJwtUji(PEM),
    TOTP_ENCRYPTION_KEY: KUNCI_TOTP,
    S3_PUBLIC_ENDPOINT: "https://storage.sekolah.example/sigm4/",
};

/** Salinan `env` tanpa variabel tertentu. */
function tanpa(env: Record<string, string>, ...kunci: string[]): Record<string, string> {
    return Object.fromEntries(Object.entries(env).filter(([k]) => !kunci.includes(k)));
}

function masalahDari(fn: () => unknown): readonly string[] {
    try {
        fn();
    } catch (galat) {
        if (galat instanceof ConfigError) return galat.masalah;
        throw galat;
    }
    throw new Error("Tidak ada ConfigError yang dilempar.");
}

describe("readProcessConfig", () => {
    it("konfigurasi lengkap → nilai terurai beserta bawaannya", () => {
        expect(readProcessConfig(SAH, "UTC")).toEqual({
            database: {
                connectionString: SAH.DATABASE_URL,
                poolSize: 10,
            },
            redis: { url: SAH.REDIS_URL },
            logLevel: "info",
        });
    });

    it("seluruh masalah dilaporkan sekaligus, bukan satu per satu", () => {
        const masalah = masalahDari(() =>
            readProcessConfig({}, "Asia/Jakarta"),
        );
        const teks = masalah.join("\n");
        expect(teks).toMatch(/DATABASE_URL wajib diisi/);
        expect(teks).toMatch(/REDIS_URL wajib diisi/);
        expect(teks).toMatch(/TZ wajib bernilai UTC/);
        expect(teks).toMatch(/Zona waktu proses harus UTC/);
    });

    it("LOG_LEVEL tak dikenal DITOLAK — dulu diam-diam menjadi info", () => {
        expect(() =>
            readProcessConfig({ ...SAH, LOG_LEVEL: "verbose" }, "UTC"),
        ).toThrow(/LOG_LEVEL harus salah satu dari/);
        expect(
            readProcessConfig({ ...SAH, LOG_LEVEL: " WARN " }, "UTC").logLevel,
        ).toBe("warn");
    });

    it.each([undefined, "Asia/Jakarta", "utc "])(
        "TZ = %s ditolak (SDD-INF-09)",
        (tz) => {
            const env = { ...SAH, TZ: tz };
            expect(() => readProcessConfig(env, "UTC")).toThrow(
                /TZ wajib bernilai UTC/,
            );
        },
    );

    it("zona proses bukan UTC ditolak meski TZ=UTC — yang diperiksa zona yang berlaku", () => {
        expect(() => readProcessConfig(SAH, "Asia/Jakarta")).toThrow(
            /Zona waktu proses harus UTC/,
        );
        expect(() => readProcessConfig(SAH, "Etc/UTC")).not.toThrow();
    });

    it("DB_POOL_SIZE tidak sah ditolak lewat skema yang sama", () => {
        expect(() =>
            readProcessConfig({ ...SAH, DB_POOL_SIZE: "0" }, "UTC"),
        ).toThrow(/DB_POOL_SIZE harus bilangan bulat/);
    });

    it("pesan galat tidak pernah memuat nilai variabel (SDD-16 §4.7)", () => {
        const masalah = masalahDari(() =>
            readProcessConfig(
                {
                    ...SAH,
                    DB_POOL_SIZE: "rahasia",
                    LOG_LEVEL: "rahasia",
                    TZ: "rahasia",
                },
                "UTC",
            ),
        );
        expect(masalah.length).toBeGreaterThanOrEqual(3);
        expect(masalah.join("\n")).not.toContain("rahasia");
    });
});

describe("readApiConfig — skema bertahap", () => {
    it("variabel fitur yang belum dibangun tidak dituntut (GEMINI_API_KEY, FCM_CREDENTIALS, S3_ENDPOINT)", () => {
        const config = readApiConfig(SAH_API, "UTC");
        expect(config.objectStoragePublicOrigin).toBe(
            "https://storage.sekolah.example",
        );
    });

    it("S3_PUBLIC_ENDPOINT wajib, dan kosong hanya melaporkan satu masalah", () => {
        expect(masalahDari(() => readApiConfig(tanpa(SAH_API, "S3_PUBLIC_ENDPOINT"), "UTC"))).toEqual([
            "Variabel lingkungan S3_PUBLIC_ENDPOINT wajib diisi (SDD-INF-08).",
        ]);
        expect(
            masalahDari(() =>
                readApiConfig({ ...SAH_API, S3_PUBLIC_ENDPOINT: "  " }, "UTC"),
            ),
        ).toHaveLength(1);
    });

    // Keempatnya terurai sah oleh `new URL` saja — `minio:9000` bahkan menghasilkan
    // origin "null" yang akan diam-diam masuk `img-src`.
    it.each([
        "minio:9000",
        "localhost:9000",
        "ftp://storage.sekolah.example",
        "http://",
    ])(
        "S3_PUBLIC_ENDPOINT = %s ditolak: harus URL http(s) dengan host",
        (nilai) => {
            expect(() =>
                readApiConfig({ ...SAH_API, S3_PUBLIC_ENDPOINT: nilai }, "UTC"),
            ).toThrow(
                /S3_PUBLIC_ENDPOINT harus URL absolut berskema http atau https/,
            );
        },
    );
});

describe("readApiConfig — kunci JWT (SDD-SESS-02, SDD-SYS-14)", () => {
    it("JWT_PRIVATE_KEY dan JWT_PUBLIC_KEY wajib", () => {
        const tanpaJwt = tanpa(SAH_API, "JWT_PRIVATE_KEY", "JWT_PUBLIC_KEY");
        expect(masalahDari(() => readApiConfig(tanpaJwt, "UTC"))).toEqual([
            "Variabel lingkungan JWT_PRIVATE_KEY wajib diisi (SDD-INF-08).",
            "Variabel lingkungan JWT_PUBLIC_KEY wajib diisi (SDD-INF-08).",
        ]);
    });

    it("kunci terurai menjadi JwtKeys yang dapat menerbitkan dan memverifikasi", () => {
        const { jwtKeys } = readApiConfig(SAH_API, "UTC");
        const sekarang = new Date("2026-09-19T00:00:00Z");
        const token = jwtKeys.terbitkan({ sub: "7", sid: "s", pwd: false, amr: ["pwd"] }, sekarang);
        expect(jwtKeys.verifikasi(token, sekarang).sub).toBe("7");
    });

    it("PEM dengan \\n literal (berkas env satu baris) diterima", () => {
        const satuBaris = {
            ...SAH_API,
            JWT_PRIVATE_KEY: PEM.privat.trim().replaceAll("\n", "\\n"),
            JWT_PUBLIC_KEY: PEM.publik.trim().replaceAll("\n", "\\n"),
        };
        expect(() => readApiConfig(satuBaris, "UTC")).not.toThrow();
    });

    it("bukan PEM, atau bukan pasangan, ditolak saat startup tanpa membocorkan isinya", () => {
        const sampah = masalahDari(() =>
            readApiConfig({ ...SAH_API, JWT_PRIVATE_KEY: "rahasia-bukan-pem" }, "UTC"),
        );
        expect(sampah.join("\n")).toMatch(/JWT_PRIVATE_KEY\/JWT_PUBLIC_KEY tidak sah/);
        expect(sampah.join("\n")).not.toContain("rahasia-bukan-pem");

        const lain = bangkitkanPem();
        const bukanPasangan = masalahDari(() =>
            readApiConfig({ ...SAH_API, JWT_PUBLIC_KEY: lain.publik }, "UTC"),
        );
        expect(bukanPasangan.join("\n")).toMatch(/bukan pasangan/);
    });
});

describe("readApiConfig — kunci enkripsi TOTP (SDD-SESS-08, SDD-SYS-14)", () => {
    it("TOTP_ENCRYPTION_KEY wajib", () => {
        expect(masalahDari(() => readApiConfig(tanpa(SAH_API, "TOTP_ENCRYPTION_KEY"), "UTC"))).toEqual([
            "Variabel lingkungan TOTP_ENCRYPTION_KEY wajib diisi (SDD-INF-08).",
        ]);
    });

    it("kunci base64 32 byte terurai menjadi kotak yang dapat mengenkripsi dan mendekripsi", () => {
        const { totpKey } = readApiConfig(SAH_API, "UTC");
        const kotak = totpKey.enkripsi(Buffer.from("rahasia-totp"), "totp:7");
        expect(totpKey.dekripsi(kotak, "totp:7").toString()).toBe("rahasia-totp");
    });

    it("bukan base64 atau bukan 32 byte ditolak saat startup tanpa membocorkan nilainya", () => {
        const bukanBase64 = masalahDari(() => readApiConfig({ ...SAH_API, TOTP_ENCRYPTION_KEY: "rahasia bukan base64!" }, "UTC"));
        const teksBukanBase64 = bukanBase64.join("\n");
        expect(teksBukanBase64).toMatch(/TOTP_ENCRYPTION_KEY tidak sah/);
        expect(teksBukanBase64).not.toContain("rahasia bukan base64");

        const pendek = randomBytes(16).toString("base64");
        const salahPanjang = masalahDari(() => readApiConfig({ ...SAH_API, TOTP_ENCRYPTION_KEY: pendek }, "UTC"));
        const teksSalahPanjang = salahPanjang.join("\n");
        expect(teksSalahPanjang).toMatch(/TOTP_ENCRYPTION_KEY tidak sah: harus tepat 32 byte/);
        expect(teksSalahPanjang).not.toContain(pendek);
    });
});

describe("parseLogLevel", () => {
    it("bawaan info bila tidak disetel; ditolak bila tak dikenal", () => {
        expect(parseLogLevel({})).toBe("info");
        expect(() => parseLogLevel({ LOG_LEVEL: "berisik" })).toThrow(
            ConfigError,
        );
    });
});

describe("entrypoint menolak menyala dengan konfigurasi tidak valid", () => {
    it("sigm4-api memakai skema API — S3_PUBLIC_ENDPOINT ikut dituntut", async () => {
        await expect(start({ ...SAH }, "UTC")).rejects.toThrow(
            /S3_PUBLIC_ENDPOINT wajib diisi/,
        );
    });

    it("sigm4-api menolak zona proses bukan UTC sebelum membuka koneksi", async () => {
        await expect(
            start(
                { ...SAH, S3_PUBLIC_ENDPOINT: "http://localhost:9000" },
                "Asia/Jakarta",
            ),
        ).rejects.toThrow(/Zona waktu proses harus UTC/);
    });

    it("sigm4-worker memakai skema proses sebelum membuka koneksi", async () => {
        await expect(bootstrap({}, "UTC")).rejects.toThrow(
            /DATABASE_URL wajib diisi/,
        );
    });
});
