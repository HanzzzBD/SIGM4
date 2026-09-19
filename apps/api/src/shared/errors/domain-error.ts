// Galat domain: dilempar service, dipetakan ErrorMapper menjadi respons HTTP.
// Service tidak pernah menyebut status HTTP — itu urusan lapisan API (SDD-06 §4.4).

import type { KodeGalat } from "./codes.js";

/**
 * Galat yang membawa kode Bab 17.3.
 *
 * `pesan` yang DIISI pengembang adalah kalimat Bahasa Indonesia untuk pengguna
 * (mis. "Kode unit kerja sudah digunakan.") dan boleh sampai ke klien;
 * `pesanEksplisit` menandainya. Tanpa `pesan`, `message` hanya berisi kode —
 * bukan kalimat untuk pengguna — dan tidak pernah dikirim. Jangan menyisipkan data
 * pribadi ke `pesan` (mis. nama pengguna): ia ikut ke respons dan log klien.
 *
 * `detail` adalah konteks bagi log dan uji, bukan kontrak klien: ErrorMapper
 * hanya menurunkan `details` Bab 17.2 dari `detail.field` dan `detail.errors`
 * (larik `{ field, message }`); kunci lain (`rule`, `kewajiban`, …) tidak dikirim.
 */
export class DomainError extends Error {
    readonly pesanEksplisit: boolean;

    constructor(
        readonly kode: KodeGalat,
        pesan?: string,
        readonly detail?: Readonly<Record<string, unknown>>,
    ) {
        super(pesan ?? kode);
        this.name = "DomainError";
        this.pesanEksplisit = pesan !== undefined;
    }
}

/** Autentikasi gagal atau token kedaluwarsa (401). */
export class AuthError extends DomainError {
    constructor(
        kode: Extract<
            KodeGalat,
            "UNAUTHENTICATED" | "TOKEN_EXPIRED"
        > = "UNAUTHENTICATED",
    ) {
        super(kode);
        this.name = "AuthError";
    }
}

/**
 * Tidak berhak (403). SDD-AUTH-08: ketiadaan hak atas objek yang ADA dan objek
 * yang TIDAK ADA menghasilkan respons yang sama — karena itu tidak ada varian
 * "not found" yang boleh dipakai untuk membedakan keduanya.
 */
export class ForbiddenError extends DomainError {
    constructor(
        kode: Extract<
            KodeGalat,
            "FORBIDDEN" | "INSUFFICIENT_PERMISSION"
        > = "FORBIDDEN",
    ) {
        super(kode);
        this.name = "ForbiddenError";
    }
}

/** Sumber daya tidak ada, dan pemanggil memang berhak mengetahuinya (404). */
export class NotFoundError extends DomainError {
    constructor(pesan?: string) {
        super("NOT_FOUND", pesan);
        this.name = "NotFoundError";
    }
}
