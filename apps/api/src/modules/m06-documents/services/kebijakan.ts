// Kebijakan unggah per jenis berkas (SDD-09 §4.3) — diperiksa saat presign, sebelum URL
// unggah diterbitkan (Bab 17.5 poin 6). Validasi kedua lewat magic bytes milik pemindaian
// (SDD-FS-04, PR-03-05).

import type { FileOwnerType } from "../../../shared/db/index.js";

const MB = 1024 * 1024;

export const MIME_JPG = "image/jpeg";
export const MIME_PNG = "image/png";
const MIME_PDF = "application/pdf";
const MIME_DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const MIME_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** Ekstensi kunci objek (SDD-FS-06) — diturunkan dari MIME, bukan dari nama asli berkas. */
export const EKSTENSI: Readonly<Record<string, string>> = {
    [MIME_JPG]: "jpg",
    [MIME_PNG]: "png",
    [MIME_PDF]: "pdf",
    [MIME_DOCX]: "docx",
    [MIME_XLSX]: "xlsx",
};

export interface KebijakanJenis {
    readonly label: string;
    readonly mime: readonly string[];
    readonly format: string;
    readonly maksByte: number;
}

/** Seluruh foto: hasil kompresi klien ≤ 2 MB (MOB-MED-01); JPG/PNG. */
function foto(label: string): KebijakanJenis {
    return { label, mime: [MIME_JPG, MIME_PNG], format: "JPG atau PNG", maksByte: 2 * MB };
}

export const KEBIJAKAN: Readonly<Record<FileOwnerType, KebijakanJenis>> = {
    ASSET_MOVEMENT_DOCUMENT: { label: "Berita acara mutasi", mime: [], format: "keluaran sistem", maksByte: 0 },
    // FR-06.1
    ASSET_DOCUMENT: { label: "Dokumen aset", mime: [MIME_PDF, MIME_JPG, MIME_PNG, MIME_DOCX, MIME_XLSX], format: "PDF, JPG, PNG, DOCX, atau XLSX", maksByte: 10 * MB },
    // Keputusan 7a log phase-03: disamakan dengan foto lain.
    ASSET_PHOTO: foto("Foto aset"),
    // FR-01.4 A3
    USER_PHOTO: foto("Foto profil"),
    HANDOVER_PHOTO: foto("Foto kondisi"),
    // FR-11.1
    DAMAGE_PHOTO: foto("Foto kerusakan"),
    // FR-12.3
    WORK_ORDER_PHOTO: foto("Foto hasil perbaikan"),
    // FR-13.2
    STOCKTAKE_PHOTO: foto("Foto opname"),
};

/** Pesan pelanggaran kebijakan — spesifik per jenis (FR-01.4 A3); `null` bila lolos. */
export function periksaKebijakan(jenis: FileOwnerType, mime: string, ukuran: number): { field: string; message: string } | null {
    if (jenis === "ASSET_MOVEMENT_DOCUMENT") return { field: "jenis", message: "Berita acara mutasi hanya dapat dibuat sistem." };
    const k = KEBIJAKAN[jenis];
    if (!k.mime.includes(mime)) return { field: "mime", message: `${k.label} harus berformat ${k.format}.` };
    if (ukuran > k.maksByte) return { field: "ukuran", message: `${k.label} maksimal ${String(k.maksByte / MB)} MB.` };
    return null;
}
