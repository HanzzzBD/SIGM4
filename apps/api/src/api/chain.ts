// Ujung rantai middleware SDD-06 §4.2 di sigm4-api: `requestId` di depan, 404
// dan `errorMapper` di belakang (SDD-API-04, SDD-OBS-03, NFR-R-10).
//
// Tanpa keduanya Express menjawab dengan HTML bawaannya — di luar production
// lengkap dengan pesan galat asli dan stack trace.

import type { ErrorRequestHandler, RequestHandler, Response } from "express";
import type { KodeGalat } from "../shared/errors/index.js";
import { mapError, statusUntuk } from "../shared/errors/index.js";
import type { RateLimiter } from "../shared/http/index.js";
import type { Logger } from "../shared/observability/index.js";
import {
    denganKonteks,
    konteksSaatIni,
    requestIdBaru,
} from "../shared/observability/index.js";
import { rateLimit, securityHeaders } from "./security.js";
import type { SecurityConfig } from "./security.js";

/**
 * Pesan pengguna yang dikirim ujung rantai ini. Klien memetakan `code` ke
 * pesannya sendiri (NFR-AC-09); yang di sini hanya pengganti yang aman.
 */
const PESAN: Partial<Record<KodeGalat, string>> = {
    INVALID_REQUEST: "Permintaan tidak valid.",
    NOT_FOUND: "Sumber daya tidak ditemukan.",
    RATE_LIMIT_EXCEEDED:
        "Terlalu banyak permintaan. Coba lagi beberapa saat lagi.",
    INTERNAL_ERROR: "Terjadi kesalahan pada server.",
};

/** Amplop galat Bab 17.2, dengan `request_id` yang sama dengan `X-Request-Id`. */
export function kirimGalat(res: Response, kode: KodeGalat): void {
    res.status(statusUntuk(kode)).json({
        success: false,
        error: {
            code: kode,
            message: PESAN[kode] ?? "Permintaan tidak dapat diproses.",
        },
        request_id: konteksSaatIni()?.requestId ?? requestIdBaru(),
    });
}

/**
 * `requestId` — mata rantai pertama (SDD-OBS-03). Dibangkitkan di sini, tidak
 * diambil dari header masuk: klien dapat memalsukannya, dan Nginx belum
 * ditetapkan membangkitkannya.
 */
export function requestId(): RequestHandler {
    return (_req, res, next) => {
        const id = requestIdBaru();
        res.setHeader("X-Request-Id", id);
        denganKonteks({ requestId: id, modul: "api" }, () => {
            next();
        });
    };
}

/** Galat berstatus 4xx dari lapisan HTTP itu sendiri, mis. URL yang rusak. */
function galatKlien(galat: unknown): boolean {
    const status =
        typeof galat === "object" && galat !== null
            ? (galat as { status?: unknown }).status
            : undefined;
    return typeof status === "number" && status >= 400 && status < 500;
}

/**
 * `errorMapper` — mata rantai terakhir (SDD-API-04, SDD-06 §4.4). Pesan asli
 * hanya masuk log terstruktur bersama `request_id`, tidak pernah ke klien
 * (`NFR-R-10`).
 */
export function errorHandler(logger: Logger): ErrorRequestHandler {
    return (galat: unknown, _req, res, next) => {
        if (res.headersSent) {
            next(galat);
            return;
        }
        const hasil = galatKlien(galat)
            ? { kode: "INVALID_REQUEST" as const, status: 400, alarm: false }
            : mapError(galat);
        if (hasil.status >= 500 || hasil.alarm) {
            logger.error("Permintaan gagal ditangani", galat, {
                kode: hasil.kode,
            });
        }
        kirimGalat(res, hasil.kode);
    };
}

/** Mata rantai sebelum route: `requestId` lalu header keamanan (SDD-06 §4.2). */
export function awalRantai(deps: {
    readonly security: SecurityConfig;
}): RequestHandler[] {
    return [requestId(), ...securityHeaders(deps.security)];
}

/**
 * Mata rantai sesudah route: 404 berkelas limit `default` — agar respons itu
 * pun membawa `X-RateLimit-*` (`NFR-S-07`) — lalu `errorMapper`.
 */
export function ujungRantai(deps: {
    readonly limiter: RateLimiter;
    readonly logger: Logger;
}): (RequestHandler | ErrorRequestHandler)[] {
    const tidakDitemukan: RequestHandler = (_req, res) => {
        kirimGalat(res, "NOT_FOUND");
    };
    return [
        rateLimit({ rateLimitClass: "default" }, deps.limiter, deps.logger),
        tidakDitemukan,
        errorHandler(deps.logger),
    ];
}
