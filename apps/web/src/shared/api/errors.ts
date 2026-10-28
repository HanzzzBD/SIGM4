// Amplop galat Bab 17.2 → objek galat klien. Pesan untuk pengguna berasal dari server
// (kalimat Bahasa Indonesia) atau pesan generik per keadaan; detail teknis tidak pernah
// ditampilkan, hanya `request_id` yang dapat disalin (NFR-R-10, UX §7.3).

export interface DetailGalat {
    readonly field: string;
    readonly message: string;
}

export class ApiError extends Error {
    constructor(
        readonly status: number,
        readonly kode: string,
        pesan: string,
        readonly requestId: string | null,
        readonly details: readonly DetailGalat[] = [],
        /** Detik tunggu dari `Retry-After` pada 429 (NFR-S-07). */
        readonly tungguDetik: number | null = null,
    ) {
        super(pesan);
        this.name = "ApiError";
    }
}

/** Koneksi tidak sampai ke server — keadaan luring (UX §7.3, `NO-07`). */
export class GalatJaringan extends Error {
    constructor() {
        super("Tidak dapat terhubung ke server. Periksa koneksi Anda, lalu coba lagi.");
        this.name = "GalatJaringan";
    }
}

const PESAN_UMUM = "Terjadi gangguan pada sistem. Coba lagi beberapa saat lagi.";

interface Amplop {
    readonly success?: false;
    readonly error?: { readonly code?: unknown; readonly message?: unknown; readonly details?: unknown };
    readonly request_id?: unknown;
}

/** Mengurai respons gagal; bentuk yang tak dikenal menjadi galat umum, bukan crash. */
export function dariRespons(status: number, data: unknown, header: (nama: string) => string | undefined): ApiError {
    const a = (typeof data === "object" && data !== null ? data : {}) as Amplop;
    const kode = typeof a.error?.code === "string" ? a.error.code : "INTERNAL_ERROR";
    const pesan = typeof a.error?.message === "string" ? a.error.message : PESAN_UMUM;
    const requestId = typeof a.request_id === "string" ? a.request_id : (header("x-request-id") ?? null);
    const details = Array.isArray(a.error?.details) ? (a.error.details as DetailGalat[]) : [];
    const retry = Number(header("retry-after"));
    return new ApiError(status, kode, status >= 500 ? PESAN_UMUM : pesan, requestId, details, Number.isFinite(retry) && retry > 0 ? retry : null);
}
