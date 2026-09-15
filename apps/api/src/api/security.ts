// Header keamanan dan rate limit sigm4-api (NFR-S-07, NFR-S-11, SDD-SEC-03/04/05).
//
// Keduanya middleware aplikasi, bukan hanya konfigurasi Nginx (SDD-SEC-03), agar
// berlaku sama di pengembangan, staging, dan produksi.

import { randomBytes } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { RequestHandler, Response } from "express";
import helmet from "helmet";
import type { KodeGalat } from "../shared/errors/index.js";
import { KELAS_LIMIT } from "../shared/http/index.js";
import type {
    HasilLimit,
    Pemohon,
    RateLimiter,
    RouteDefinition,
} from "../shared/http/index.js";
import type { Logger } from "../shared/observability/index.js";
import {
    konteksSaatIni,
    requestIdBaru,
} from "../shared/observability/index.js";

export interface SecurityConfig {
    /** Origin object storage untuk `img-src` (SDD-13 §4.2). */
    readonly objectStorageOrigin: string;
}

/** Konfigurasi dari lingkungan (SDD-INF-08); pesan menyebut nama variabel, bukan nilainya. */
export function readSecurityConfig(
    env: NodeJS.ProcessEnv = process.env,
): SecurityConfig {
    const endpoint = env["S3_ENDPOINT"]?.trim();
    if (!endpoint) {
        throw new Error(
            "Variabel lingkungan S3_ENDPOINT wajib diisi (SDD-INF-08).",
        );
    }
    try {
        return { objectStorageOrigin: new URL(endpoint).origin };
    } catch {
        throw new Error(
            "Variabel lingkungan S3_ENDPOINT harus URL absolut (SDD-INF-08).",
        );
    }
}

const nonce = (_req: IncomingMessage, res: ServerResponse): string =>
    `'nonce-${String((res as Response).locals["cspNonce"])}'`;

/**
 * Header SDD-13 §4.2. Nonce dibangkitkan ulang setiap permintaan dan tersedia di
 * `res.locals.cspNonce`; `unsafe-inline` tidak pernah muncul (SDD-SEC-04).
 */
export function securityHeaders(config: SecurityConfig): RequestHandler[] {
    return [
        (_req, res, next) => {
            res.locals["cspNonce"] = randomBytes(16).toString("base64");
            // Satu-satunya header §4.2 yang tidak dikenal helmet.
            res.setHeader(
                "Permissions-Policy",
                "camera=(self), geolocation=(), microphone=()",
            );
            next();
        },
        helmet({
            contentSecurityPolicy: {
                // Tanpa bawaan helmet: kebijakan persis §4.2, tidak lebih longgar.
                useDefaults: false,
                directives: {
                    defaultSrc: ["'self'"],
                    scriptSrc: ["'self'", nonce],
                    styleSrc: ["'self'", nonce],
                    imgSrc: ["'self'", "data:", config.objectStorageOrigin],
                    connectSrc: ["'self'"],
                    frameAncestors: ["'none'"],
                    baseUri: ["'self'"],
                },
            },
            strictTransportSecurity: {
                maxAge: 31_536_000,
                includeSubDomains: true,
                preload: true,
            },
            xFrameOptions: { action: "deny" },
            referrerPolicy: { policy: "strict-origin-when-cross-origin" },
        }),
    ];
}

const KODE_TOLAK: KodeGalat = "RATE_LIMIT_EXCEEDED";

function tolak(res: Response, hasil?: HasilLimit): void {
    if (hasil !== undefined) {
        res.setHeader("Retry-After", hasil.resetDetik);
    }
    res.status(429).json({
        success: false,
        error: {
            code: KODE_TOLAK,
            message: "Terlalu banyak permintaan. Coba lagi beberapa saat lagi.",
        },
        request_id: konteksSaatIni()?.requestId ?? requestIdBaru(),
    });
}

/** Respons dianggap kegagalan bila berstatus ≥ 400, kecuali 429 milik limiter sendiri. */
function gagal(status: number): boolean {
    return status >= 400 && status !== 429;
}

/**
 * `rateLimit(kelas)` pada rantai SDD-06 §4.2, dengan kelas dari deklarasi route.
 * Header `X-RateLimit-*` disertakan pada setiap respons route (`NFR-S-07`).
 */
export function rateLimit(
    route: Pick<RouteDefinition, "rateLimitClass">,
    limiter: RateLimiter,
    logger: Logger,
): RequestHandler {
    const kelas = route.rateLimitClass;
    const { batas, gagalTertutup, hitung } = KELAS_LIMIT[kelas];
    return async (req, res, next) => {
        res.setHeader("X-RateLimit-Limit", batas);
        const userId = konteksSaatIni()?.userId;
        const pemohon: Pemohon =
            userId === undefined
                ? { ip: req.ip ?? "" }
                : { userId, ip: req.ip ?? "" };

        let hasil: HasilLimit;
        try {
            hasil = await limiter.hit(
                kelas,
                pemohon,
                hitung === "gagal" ? "periksa" : "hit",
            );
        } catch (galat) {
            // Redis tidak tersedia (SDD-13 §4.3, §6): `login` menolak, kelas lain
            // lolos — keduanya dengan alarm, karena perlindungannya sedang hilang.
            logger.error("Rate limit tidak dapat diperiksa", galat, {
                kelas,
                gagal_tertutup: gagalTertutup,
            });
            if (gagalTertutup) {
                tolak(res);
            } else {
                next();
            }
            return;
        }

        res.setHeader("X-RateLimit-Remaining", hasil.sisa);
        res.setHeader("X-RateLimit-Reset", hasil.resetDetik);
        if (!hasil.lolos) {
            tolak(res, hasil);
            return;
        }
        if (hitung === "gagal") {
            // Hasilnya baru diketahui setelah handler: hanya kegagalan yang dicatat
            // (SDD-13 §4.3). Tidak atomik terhadap pemeriksaan — kegagalan yang
            // benar-benar serentak dapat melampaui batas beberapa buah, dan sumbu
            // akun di PostgreSQL tetap mengunci (SDD-SESS-07).
            res.on("finish", () => {
                if (!gagal(res.statusCode)) return;
                limiter.hit(kelas, pemohon, "catat").catch((galat: unknown) => {
                    logger.error("Percobaan gagal tidak dapat dicatat", galat, {
                        kelas,
                    });
                });
            });
        }
        next();
    };
}
