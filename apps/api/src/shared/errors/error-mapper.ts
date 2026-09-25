// ErrorMapper (SDD-SYS-06, SDD-06 §4.4). Satu-satunya tempat galat berubah
// menjadi respons HTTP; controller tidak pernah menyebut status.
//
// Urutan pencocokan MENGIKAT: yang lebih khusus lebih dulu, `always` terakhir.
// Menukar urutannya mengubah kode yang diterima klien tanpa satu pun tipe berubah.

import { DomainError } from "./domain-error.js";
import type { KodeGalat } from "./codes.js";
import { statusUntuk } from "./codes.js";

/** Galat PostgreSQL membawa `code` SQLSTATE lima karakter. */
interface PgGalat {
    code: string;
    constraint?: string;
}

function pgGalat(galat: unknown): PgGalat | undefined {
    if (galat === null || typeof galat !== "object") return undefined;
    const c = (galat as { code?: unknown }).code;
    return typeof c === "string" && /^[0-9A-Z]{5}$/.test(c)
        ? (galat as unknown as PgGalat)
        : undefined;
}

/** Galat validasi skema (Zod) — dikenali dari bentuknya, bukan dari `instanceof`. */
function zodGalat(galat: unknown): boolean {
    return (
        galat !== null &&
        typeof galat === "object" &&
        (galat as { name?: unknown }).name === "ZodError" &&
        Array.isArray((galat as { issues?: unknown }).issues)
    );
}

/** Satu butir `error.details` Bab 17.2: isian yang bermasalah beserta alasannya. */
export interface ErrorDetail {
    readonly field: string;
    readonly message: string;
}

export interface HasilPemetaan {
    readonly status: number;
    readonly kode: KodeGalat;
    /**
     * Kalimat untuk pengguna dari `DomainError` (Bab 17.2 `error.message`). Hanya ada
     * bila aman dikirim — lihat `bolehDikirim`. Tanpanya ujung rantai memakai
     * pesan generik per kode.
     */
    readonly pesan?: string;
    /** `error.details` Bab 17.2. Tidak pernah memuat pesan galat asli sistem. */
    readonly details?: readonly ErrorDetail[];
    /** true bila kejadiannya wajib memicu alarm, bukan sekadar dikembalikan. */
    readonly alarm: boolean;
}

/**
 * Memetakan galat apa pun menjadi status + kode Bab 17.3.
 *
 * Galat 500 **tidak pernah** menyertakan pesan asli ke klien (`NFR-R-10`);
 * pesan asli hanya masuk log terstruktur bersama `request_id`.
 */
export function mapError(galat: unknown): HasilPemetaan {
    if (zodGalat(galat)) return hasil("INVALID_REQUEST");

    if (galat instanceof DomainError) return hasilDomain(galat);

    const pg = pgGalat(galat);
    if (pg !== undefined) {
        // CI-04: pelanggaran exclusion constraint booking_slots.
        // SDD-06 §4.4 — dibedakan berdasarkan nama constraint yang dilanggar,
        // karena aset dan ruangan memberi pesan berbeda kepada pengguna.
        if (pg.code === "23P01") {
            const aset = pg.constraint?.includes("asset") ?? false;
            return hasil(aset ? "ASSET_NOT_AVAILABLE" : "RESERVATION_CONFLICT");
        }
        if (pg.code === "23505") return hasil("DUPLICATE_CODE");
        // 23514 hanya dapat dilanggar dari jalur pengguna lewat
        // material_balances_non_negatif — jaring terakhir SDD-DB-14. Bila IA yang
        // menolak, ada jalur kode yang lupa mengunci baris: wajib alarm.
        if (pg.code === "23514")
            return hasil("INSUFFICIENT_BALANCE", true);
    }

    return hasil("INTERNAL_ERROR", true);
}

/**
 * Kode yang pesannya TIDAK pernah dikirim meski pengembang mengisinya: jawaban
 * autentikasi/otorisasi harus seragam agar tidak membedakan objek yang ada dari
 * yang tidak ada (`SDD-AUTH-08`).
 */
const KODE_TANPA_PESAN: ReadonlySet<KodeGalat> = new Set<KodeGalat>([
    "UNAUTHENTICATED",
    "TOKEN_EXPIRED",
    "FORBIDDEN",
    "INSUFFICIENT_PERMISSION",
]);

/**
 * Pesan dan `details` sebuah `DomainError` hanya dikirim bila (1) pengembang
 * sengaja menuliskan pesannya, (2) ia galat klien (4xx) — galat 5xx tidak pernah
 * membawa pesan (`NFR-R-10`) — dan (3) kodenya bukan jawaban autentikasi/otorisasi.
 */
function bolehDikirim(galat: DomainError): boolean {
    const status = statusUntuk(galat.kode);
    return (
        galat.pesanEksplisit &&
        status >= 400 &&
        status < 500 &&
        !KODE_TANPA_PESAN.has(galat.kode)
    );
}

/**
 * Menurunkan `error.details` Bab 17.2 dari `DomainError.detail`:
 * `{ field }` menjadi satu butir berpesan galat itu sendiri, dan
 * `{ errors: [{ field, message }] }` diteruskan butir per butir. Kunci lain
 * (`rule`, `kewajiban`, `permissions`, …) bukan kontrak klien dan tidak dikirim.
 */
function turunkanDetails(galat: DomainError): readonly ErrorDetail[] | undefined {
    const detail = galat.detail;
    if (detail === undefined) return undefined;
    const butir: ErrorDetail[] = [];
    if (typeof detail["field"] === "string") {
        butir.push({ field: detail["field"], message: galat.message });
    }
    const errors = detail["errors"];
    if (Array.isArray(errors)) {
        for (const e of errors as readonly unknown[]) {
            if (e === null || typeof e !== "object") continue;
            const { field, message } = e as { field?: unknown; message?: unknown };
            if (typeof field === "string" && typeof message === "string") {
                butir.push({ field, message });
            }
        }
    }
    return butir.length > 0 ? butir : undefined;
}

function hasilDomain(galat: DomainError): HasilPemetaan {
    const dasar = hasil(galat.kode);
    if (!bolehDikirim(galat)) return dasar;
    const details = turunkanDetails(galat);
    return {
        ...dasar,
        pesan: galat.message,
        ...(details === undefined ? {} : { details }),
    };
}

function hasil(kode: KodeGalat, alarm = false): HasilPemetaan {
    return { status: statusUntuk(kode), kode, alarm };
}
