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
    readWorkerConfig,
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
    S3_ENDPOINT: "http://minio:9000/",
    S3_REGION: "us-west-004",
    S3_BUCKET: "sigm4",
    S3_ACCESS_KEY: "kunci-akses",
    S3_SECRET_KEY: "kunci-rahasia",
    APP_BASE_URL: "https://sigm4.sekolah.example/",
    CLAMAV_URL: "tcp://clamav:3310",
};

/** Worker: S3 sisi server + clamd (PR-03-05) — tanpa JWT maupun S3_PUBLIC_ENDPOINT. */
const S3_DAN_AV = {
    S3_ENDPOINT: "http://minio:9000/",
    S3_REGION: "us-west-004",
    S3_BUCKET: "sigm4",
    S3_ACCESS_KEY: "kunci-akses",
    S3_SECRET_KEY: "kunci-rahasia",
    CLAMAV_URL: "tcp://clamav:3310",
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

describe("readApiConfig — APP_BASE_URL (FR-05.1, SDD-SYS-14; PR-03-01)", () => {
    it("wajib; garis miring penutup dibuang sehingga payload QR berbentuk https://{domain}/a/{uuid}", () => {
        expect(masalahDari(() => readApiConfig(tanpa(SAH_API, "APP_BASE_URL"), "UTC"))).toEqual(["Variabel lingkungan APP_BASE_URL wajib diisi (SDD-INF-08)."]);
        expect(readApiConfig(SAH_API, "UTC").appBaseUrl).toBe("https://sigm4.sekolah.example");
        expect(readApiConfig({ ...SAH_API, APP_BASE_URL: "https://sekolah.example/sigm4//" }, "UTC").appBaseUrl).toBe("https://sekolah.example/sigm4");
    });

    // Label QR dicetak PERMANEN: URL tak sah = label mati selamanya, maka ditolak saat startup.
    it.each(["http://sigm4.sekolah.example", "sigm4.sekolah.example", "https://", "https://sigm4.sekolah.example/?x=1", "https://sigm4.sekolah.example/#a", "https://u:p@sigm4.sekolah.example"])(
        "APP_BASE_URL = %s ditolak: harus https berhost tanpa query/fragmen/kredensial",
        (nilai) => {
            expect(() => readApiConfig({ ...SAH_API, APP_BASE_URL: nilai }, "UTC")).toThrow(/APP_BASE_URL harus URL https berhost/);
        },
    );
});

describe("readApiConfig — object storage sisi server (SDD-FS-13; PR-03-04)", () => {
    const S3 = ["S3_ENDPOINT", "S3_REGION", "S3_BUCKET", "S3_ACCESS_KEY", "S3_SECRET_KEY"];

    it("kelima variabel wajib; seluruh yang hilang dilaporkan sekaligus, tanpa mencetak nilai", () => {
        expect(masalahDari(() => readApiConfig(tanpa(SAH_API, ...S3), "UTC"))).toEqual(S3.map((n) => `Variabel lingkungan ${n} wajib diisi (SDD-INF-08).`));
        const pesan = masalahDari(() => readApiConfig({ ...SAH_API, S3_ENDPOINT: "minio:9000" }, "UTC")).join(" ");
        expect(pesan).toMatch(/S3_ENDPOINT harus URL absolut/);
        expect(pesan).not.toContain("kunci-rahasia");
    });

    it("endpoint menjadi origin; endpoint penandatangan = origin S3_PUBLIC_ENDPOINT; region B2 diteruskan apa adanya", () => {
        expect(readApiConfig(SAH_API, "UTC").objectStorage).toEqual({
            endpoint: "http://minio:9000",
            publicEndpoint: "https://storage.sekolah.example",
            region: "us-west-004",
            bucket: "sigm4",
            accessKey: "kunci-akses",
            secretKey: "kunci-rahasia",
        });
    });
});

describe("readApiConfig — CHROMIUM_EXECUTABLE_PATH (SDD-FS-12; PR-03-02)", () => {
    it("opsional: kosong/tak ada → null (Chrome terpasang); terisi → path dipangkas", () => {
        expect(readApiConfig(SAH_API, "UTC").chromiumExecutablePath).toBeNull();
        expect(readApiConfig({ ...SAH_API, CHROMIUM_EXECUTABLE_PATH: "  " }, "UTC").chromiumExecutablePath).toBeNull();
        expect(readApiConfig({ ...SAH_API, CHROMIUM_EXECUTABLE_PATH: " /usr/bin/chromium-browser " }, "UTC").chromiumExecutablePath).toBe("/usr/bin/chromium-browser");
    });
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

describe("readWorkerConfig — TOTP_ENCRYPTION_KEY masuk skema worker (SDD-SESS-11, PR-02-08)", () => {
    const SAH_WORKER = { ...SAH, ...S3_DAN_AV, TOTP_ENCRYPTION_KEY: KUNCI_TOTP };

    it("TOTP_ENCRYPTION_KEY wajib, dengan pesan yang sama dengan skema API", () => {
        expect(masalahDari(() => readWorkerConfig(tanpa(SAH_WORKER, "TOTP_ENCRYPTION_KEY"), "UTC"))).toEqual([
            "Variabel lingkungan TOTP_ENCRYPTION_KEY wajib diisi (SDD-INF-08).",
        ]);
    });

    it("kunci base64 32 byte terurai menjadi kotak yang dapat mengenkripsi dan mendekripsi", () => {
        const { totpKey } = readWorkerConfig(SAH_WORKER, "UTC");
        const kotak = totpKey.enkripsi(Buffer.from("rahasia-totp"), "totp:7");
        expect(totpKey.dekripsi(kotak, "totp:7").toString()).toBe("rahasia-totp");
    });

    it("bukan base64 32 byte ditolak saat startup tanpa membocorkan nilainya", () => {
        const masalah = masalahDari(() => readWorkerConfig({ ...SAH_WORKER, TOTP_ENCRYPTION_KEY: "rahasia bukan base64!" }, "UTC"));
        const teks = masalah.join("\n");
        expect(teks).toMatch(/TOTP_ENCRYPTION_KEY tidak sah/);
        expect(teks).not.toContain("rahasia bukan base64");
    });

    it("TIDAK menuntut JWT_PRIVATE_KEY/JWT_PUBLIC_KEY maupun S3_PUBLIC_ENDPOINT — worker tidak menandatangani token maupun menyajikan presigned URL", () => {
        expect(() => readWorkerConfig(SAH_WORKER, "UTC")).not.toThrow();
    });
});

describe("CLAMAV_URL — wajib bagi API dan worker (SDD-FS-04; PR-03-05, keputusan 8a)", () => {
    const SAH_WORKER = { ...SAH, ...S3_DAN_AV, TOTP_ENCRYPTION_KEY: KUNCI_TOTP };

    it("hilang → startup gagal di kedua proses, dengan pesan yang sama", () => {
        const pesanWajib = ["Variabel lingkungan CLAMAV_URL wajib diisi (SDD-INF-08)."];
        expect(masalahDari(() => readApiConfig(tanpa(SAH_API, "CLAMAV_URL"), "UTC"))).toEqual(pesanWajib);
        expect(masalahDari(() => readWorkerConfig(tanpa(SAH_WORKER, "CLAMAV_URL"), "UTC"))).toEqual(pesanWajib);
    });

    it.each(["clamav:3310", "http://clamav:3310", "tcp://clamav", "tcp://u:p@clamav:3310", "tcp://clamav:3310/x"])("%s ditolak: harus tcp://host:port", (nilai) => {
        expect(() => readApiConfig({ ...SAH_API, CLAMAV_URL: nilai }, "UTC")).toThrow("CLAMAV_URL harus berbentuk tcp://host:port");
    });

    it("terurai menjadi host + port", () => {
        expect(readApiConfig(SAH_API, "UTC").antivirus).toEqual({ host: "clamav", port: 3310 });
        expect(readWorkerConfig(SAH_WORKER, "UTC").antivirus).toEqual({ host: "clamav", port: 3310 });
    });

    it("worker menuntut S3 sisi server untuk membaca & menghapus objek; endpoint penandatangannya = S3_ENDPOINT", () => {
        expect(masalahDari(() => readWorkerConfig(tanpa(SAH_WORKER, "S3_BUCKET"), "UTC"))).toEqual(["Variabel lingkungan S3_BUCKET wajib diisi (SDD-INF-08)."]);
        expect(readWorkerConfig(SAH_WORKER, "UTC").objectStorage).toMatchObject({ endpoint: "http://minio:9000", publicEndpoint: "http://minio:9000", bucket: "sigm4" });
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

    it("sigm4-worker memakai skema worker sebelum membuka koneksi", async () => {
        await expect(bootstrap({}, "UTC")).rejects.toThrow(
            /DATABASE_URL wajib diisi/,
        );
    });

    it("sigm4-worker memakai skema worker — TOTP_ENCRYPTION_KEY ikut dituntut (PR-02-08)", async () => {
        await expect(bootstrap({ ...SAH }, "UTC")).rejects.toThrow(
            /TOTP_ENCRYPTION_KEY wajib diisi/,
        );
    });
});

describe("FCM_CREDENTIALS — opsional, tervalidasi saat startup (SDD-08 §4.4a, keputusan 80a)", () => {
    const SAH_WORKER = { ...SAH, ...S3_DAN_AV, TOTP_ENCRYPTION_KEY: KUNCI_TOTP };
    const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64");
    const AKUN = { project_id: "sigm4-uji", client_email: "push@sigm4-uji.iam.gserviceaccount.com", private_key: "-----BEGIN PRIVATE KEY-----\nrahasia\n-----END PRIVATE KEY-----\n" };

    it("tanpa variabel → fcm null (push dilewati), proses tetap menyala", () => {
        expect(readApiConfig(SAH_API, "UTC").fcm).toBeNull();
        expect(readWorkerConfig(SAH_WORKER, "UTC").fcm).toBeNull();
    });

    it("JSON service account ber-base64 → kredensial terurai di API dan worker", () => {
        const harap = { projectId: "sigm4-uji", clientEmail: AKUN.client_email, privateKey: AKUN.private_key };
        expect(readApiConfig({ ...SAH_API, FCM_CREDENTIALS: b64(AKUN) }, "UTC").fcm).toEqual(harap);
        expect(readWorkerConfig({ ...SAH_WORKER, FCM_CREDENTIALS: b64(AKUN) }, "UTC").fcm).toEqual(harap);
    });

    it("bukan base64 JSON, atau medan wajib kosong → ditolak tanpa membocorkan isinya", () => {
        const bukanJson = masalahDari(() => readWorkerConfig({ ...SAH_WORKER, FCM_CREDENTIALS: "rahasia-bukan-json" }, "UTC")).join("\n");
        expect(bukanJson).toMatch(/FCM_CREDENTIALS tidak sah: bukan JSON ber-base64/);
        expect(bukanJson).not.toContain("rahasia-bukan-json");
        const kurang = masalahDari(() => readApiConfig({ ...SAH_API, FCM_CREDENTIALS: b64({ ...AKUN, private_key: "" }) }, "UTC")).join("\n");
        expect(kurang).toMatch(/wajib memuat project_id, client_email, private_key/);
        expect(kurang).not.toContain("sigm4-uji");
    });
});
