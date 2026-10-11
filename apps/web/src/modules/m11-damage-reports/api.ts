// Kontrak M-11 di klien web (m11 §7; FR-11.1–FR-11.3; PR-03-32). Respons diurai skema bersama
// (SDD-FE-05); unggah foto lewat presign → PUT → confirm M-06 (SDD-09 §4.2).

import { queryOptions } from "@tanstack/react-query";
import {
    DamageReportCreatedResponseSchema,
    DamageReportDetailResponseSchema,
    DamageReportListResponseSchema,
    DamageReportNoteResponseSchema,
    DamageReportOpenResponseSchema,
    DamageReportVerifiedResponseSchema,
} from "@sigm4/schemas";
import type { DamageReportCreate, DamageReportListQuery, DamageReportNoteCreate, DamageReportVerify } from "@sigm4/schemas";
import { ApiError, api } from "../../shared/api";
import type { Semantik } from "../../shared/ui/primitives";

export const STATUS = ["DILAPORKAN", "DIVERIFIKASI", "DALAM_PERBAIKAN", "SELESAI", "DITOLAK"] as const;
export type StatusTiket = (typeof STATUS)[number];
export const URGENSI = ["RENDAH", "SEDANG", "TINGGI", "KRITIS"] as const;
export type Urgensi = (typeof URGENSI)[number];

/** Bab 11.3 "Status Laporan Kerusakan" & "Urgensi Kerusakan" — label kata per kata. */
export const LABEL_STATUS: Record<StatusTiket, string> = { DILAPORKAN: "Dilaporkan", DIVERIFIKASI: "Diverifikasi", DALAM_PERBAIKAN: "Dalam Perbaikan", SELESAI: "Selesai", DITOLAK: "Ditolak" };
export const LABEL_URGENSI: Record<Urgensi, string> = { RENDAH: "Rendah", SEDANG: "Sedang", TINGGI: "Tinggi", KRITIS: "Kritis" };
/** DESIGN-SYSTEM §6.3: Selesai success, Ditolak & Kritis error, sedang berjalan info. */
export const VARIAN_STATUS: Record<StatusTiket, Semantik | "neutral"> = { DILAPORKAN: "neutral", DIVERIFIKASI: "info", DALAM_PERBAIKAN: "info", SELESAI: "success", DITOLAK: "error" };
export const VARIAN_URGENSI: Record<Urgensi, Semantik | "neutral"> = { RENDAH: "neutral", SEDANG: "neutral", TINGGI: "warning", KRITIS: "error" };
export const TERBUKA: ReadonlySet<StatusTiket> = new Set(["DILAPORKAN", "DIVERIFIKASI", "DALAM_PERBAIKAN"]);

const jawaban = (e: unknown) => e instanceof ApiError && (e.status === 403 || e.status === 404);

/** FR-11.3 (P-39): saringan sebagai query; jumlah per status untuk tab. */
export const daftarQuery = (q: DamageReportListQuery) =>
    queryOptions({
        queryKey: ["damage-reports", "daftar", q],
        queryFn: async () => DamageReportListResponseSchema.parse((await api.get("/damage-reports", { params: q })).data),
    });

export const detailQuery = (id: string) =>
    queryOptions({
        queryKey: ["damage-reports", id],
        queryFn: async () => DamageReportDetailResponseSchema.parse((await api.get(`/damage-reports/${id}`)).data).data,
        retry: (n, e) => !jawaban(e) && n < 2,
    });

/** FR-11.1 A1: tiket terbuka atas objek terpilih (ringkasan tanpa identitas pelapor). */
export async function tiketTerbuka(objek: { readonly asset_id?: string | undefined; readonly room_id?: string | undefined }) {
    return DamageReportOpenResponseSchema.parse((await api.get("/damage-reports/open", { params: objek })).data).data;
}

export async function laporkan(body: DamageReportCreate) {
    return DamageReportCreatedResponseSchema.parse((await api.post("/damage-reports", body)).data).data;
}

export async function tambahCatatan(id: string, body: DamageReportNoteCreate) {
    return DamageReportNoteResponseSchema.parse((await api.post(`/damage-reports/${id}/notes`, body)).data).data;
}

export async function verifikasi(id: string, body: DamageReportVerify) {
    return DamageReportVerifiedResponseSchema.parse((await api.post(`/damage-reports/${id}/verify`, body)).data).data;
}

async function sha256(berkas: Blob): Promise<string> {
    const hash = await crypto.subtle.digest("SHA-256", await berkas.arrayBuffer());
    return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Satu foto kerusakan: pesanan `DAMAGE_PHOTO` → PUT ke URL bertanda tangan → confirm (SDD-09 §4.2).
 * Gagal di tengah tetap mengembalikan `file_id` pesanan: tiket boleh dibuat dengan unggahan tertunda
 * (FR-11.1 A2, keputusan 20b) — server menandainya `BELUM_TERUNGGAH`.
 */
export async function unggahFoto(berkas: File): Promise<{ readonly fileId: number; readonly tertunda: boolean }> {
    const pesanan = (await api.post("/files/presign", { jenis: "DAMAGE_PHOTO", mime: berkas.type, ukuran: berkas.size })).data as { data: { upload_url: string; file_id: string } };
    const fileId = Number(pesanan.data.file_id);
    try {
        const r = await fetch(pesanan.data.upload_url, { method: "PUT", headers: { "content-type": berkas.type }, body: berkas });
        if (!r.ok) return { fileId, tertunda: true };
        await api.post("/files/confirm", { file_id: fileId, checksum: await sha256(berkas) });
        return { fileId, tertunda: false };
    } catch {
        return { fileId, tertunda: true };
    }
}

/** Pilihan ruangan — hanya bagi pemegang `location.view` (m03 §7). */
export const ruanganQuery = queryOptions({
    queryKey: ["locations", "tree", "ruangan-kerusakan"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
        const pohon = (await api.get("/locations/tree")).data as { data: { id: string; nama: string; areas: { rooms: { id: string; nama: string }[] }[] }[] };
        return pohon.data.flatMap((g) => g.areas.flatMap((a) => a.rooms.map((r) => ({ id: r.id, nama: `${r.nama} · ${g.nama}`, gedungId: g.id }))));
    },
});

/** Pencarian aset untuk objek laporan (katalog M-04, scope pemanggil). */
export async function cariAset(q: string): Promise<readonly { readonly id: string; readonly kode_barang: string; readonly nama: string }[]> {
    return ((await api.get("/assets", { params: { q, per_page: 10 } })).data as { data: { id: string; kode_barang: string; nama: string }[] }).data;
}

const WAKTU = new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", dateStyle: "medium", timeStyle: "short" });
export const waktuWib = (iso: string) => `${WAKTU.format(new Date(iso))} WIB`;
