// Label & varian Badge C-13 "Status Reservasi" (Bab 11.3; COMPONENTS C-13). Kode teknis dari API,
// label Bahasa Indonesia di sini (lapisan penyajian).
import type { StatusReservasi } from "@sigm4/schemas";
import type { Semantik } from "../../shared/ui/primitives";

export const LABEL_STATUS_RESERVASI: Readonly<Record<StatusReservasi, string>> = {
    DRAF: "Draf",
    MENUNGGU_PERSETUJUAN: "Menunggu Persetujuan",
    DISETUJUI: "Disetujui",
    DITOLAK: "Ditolak",
    PERLU_REVISI: "Perlu Revisi",
    DIBATALKAN: "Dibatalkan",
    KEDALUWARSA: "Kedaluwarsa",
    BERLANGSUNG: "Berlangsung",
    SELESAI: "Selesai",
    TIDAK_DIGUNAKAN: "Tidak Digunakan",
};

/** C-13: Selesai success · Ditolak error · Berlangsung info · Draf/Dibatalkan/Kedaluwarsa/Tidak Digunakan neutral. */
export const VARIAN_STATUS_RESERVASI: Readonly<Record<StatusReservasi, Semantik | "neutral">> = {
    DRAF: "neutral",
    MENUNGGU_PERSETUJUAN: "warning",
    DISETUJUI: "success",
    DITOLAK: "error",
    PERLU_REVISI: "warning",
    DIBATALKAN: "neutral",
    KEDALUWARSA: "neutral",
    BERLANGSUNG: "info",
    SELESAI: "success",
    TIDAK_DIGUNAKAN: "neutral",
};

/** Aksi activity log → kalimat riwayat P-31 (m07 §11). Aksi lain ditampilkan kodenya. */
export const LABEL_AKSI_RIWAYAT: Readonly<Record<string, string>> = {
    RESERVATION_CREATED: "Diajukan",
    RESERVATION_UPDATED: "Diperbarui",
    RESERVATION_CANCELLED: "Dibatalkan",
    RESERVATION_EXPIRED: "Kedaluwarsa",
};
