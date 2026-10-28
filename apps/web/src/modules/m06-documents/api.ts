import { queryOptions } from "@tanstack/react-query";
import { DaftarDokumenAsetResponseSchema, DaftarDokumenLintasAsetResponseSchema, DokumenAsetResponseSchema, JENIS_DOKUMEN_ASET } from "@sigm4/schemas";
import { z } from "zod";
import { api } from "../../shared/api";

export const JENIS = JENIS_DOKUMEN_ASET;
export type Jenis = (typeof JENIS)[number];
export const LABEL_JENIS: Record<Jenis, string> = { FAKTUR: "Faktur", GARANSI: "Garansi", SERTIFIKAT: "Sertifikat", MANUAL: "Manual", BERITA_ACARA: "Berita Acara", LAINNYA: "Lainnya" };
export const GARANSI = ["AKTIF", "BERAKHIR_30_HARI", "BERAKHIR"] as const;
export type Garansi = (typeof GARANSI)[number];
export const LABEL_GARANSI: Record<Garansi, string> = { AKTIF: "Garansi aktif", BERAKHIR_30_HARI: "Berakhir dalam 30 hari", BERAKHIR: "Garansi berakhir" };
export interface FilterDokumen {
    readonly q?: string | undefined; readonly jenis?: Jenis | undefined; readonly garansi?: Garansi | undefined;
    readonly kategori?: string | undefined; readonly urut?: "garansi_selesai" | undefined; readonly page?: number | undefined; readonly per?: 50 | 100 | undefined;
}
export const dokumenKey = ["asset-documents"] as const;
export const dokumenAsetQuery = (id: string) => queryOptions({
    queryKey: [...dokumenKey, "aset", id],
    queryFn: async () => DaftarDokumenAsetResponseSchema.parse((await api.get(`/assets/${id}/documents`)).data).data,
    refetchInterval: (q) => q.state.data?.some((d) => d.scan_status === "PENDING") ? 5000 : false,
});
export const semuaDokumenQuery = (f: FilterDokumen) => queryOptions({
    queryKey: [...dokumenKey, "daftar", f],
    queryFn: async () => DaftarDokumenLintasAsetResponseSchema.parse((await api.get("/asset-documents", { params: { q: f.q, "filter[jenis]": f.jenis, "filter[garansi]": f.garansi, "filter[kategori_id]": f.kategori, sort: f.urut ?? "-diunggah_pada", page: f.page ?? 1, per_page: f.per ?? 25 } })).data),
    refetchInterval: (q) => q.state.data?.data.some((d) => d.scan_status === "PENDING") ? 5000 : false,
});
const SignedUrl = z.url().refine((v) => ["http:", "https:"].includes(new URL(v).protocol));
const Presign = z.object({ data: z.object({ upload_url: SignedUrl, file_id: z.string().regex(/^[1-9]\d*$/) }) });
const Confirm = z.object({ data: z.object({ file_id: z.string(), scan_status: z.enum(["PENDING", "CLEAN", "INFECTED", "FAILED"]) }) });
const EXT: Readonly<Record<string, string>> = {
    pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};
export const ACCEPT = ".pdf,.jpg,.jpeg,.png,.docx,.xlsx";
export class DocumentInputError extends Error {}
export function periksaBerkas(file: File): string {
    const mime = EXT[file.name.split(".").at(-1)?.toLowerCase() ?? ""];
    if (!mime || (file.type !== "" && file.type !== mime)) throw new DocumentInputError("Pilih berkas PDF, JPG, PNG, DOCX, atau XLSX dengan jenis yang sesuai.");
    if (file.size === 0) throw new DocumentInputError("Berkas kosong. Pilih berkas yang berisi dokumen.");
    if (file.size > 10 * 1024 * 1024) throw new DocumentInputError("Ukuran dokumen maksimal 10 MB.");
    if (file.name.length > 255) throw new DocumentInputError("Nama berkas maksimal 255 karakter.");
    return mime;
}
/** Byte hanya menuju object storage; klien API bersesi tidak dipakai untuk PUT. */
export async function unggahBerkas(file: File, progress: (message: string) => void): Promise<string> {
    const mime = periksaBerkas(file);
    progress("Menyiapkan dokumen…");
    const hash = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
    const checksum = [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
    const order = Presign.parse((await api.post("/files/presign", { jenis: "ASSET_DOCUMENT", mime, ukuran: file.size })).data).data;
    progress("Mengunggah berkas…");
    const uploaded = await fetch(order.upload_url, { method: "PUT", headers: { "content-type": mime }, credentials: "omit", body: file });
    if (!uploaded.ok) throw new DocumentInputError("Berkas belum terunggah. Periksa koneksi, lalu coba lagi.");
    progress("Mengonfirmasi unggahan…");
    const confirmed = Confirm.parse((await api.post("/files/confirm", { file_id: Number(order.file_id), checksum })).data).data;
    return confirmed.file_id;
}
export interface InputDokumen {
    readonly file_id: number; readonly jenis: Jenis; readonly nama_berkas: string; readonly keterangan: string | null;
    readonly garansi_mulai?: string; readonly garansi_selesai?: string; readonly asset_ids_tambahan: readonly number[];
}
export async function tautkanDokumen(id: string, body: InputDokumen) {
    return DokumenAsetResponseSchema.parse((await api.post(`/assets/${id}/documents`, body)).data).data;
}
export async function lepasDokumen(id: string, docId: string) {
    return z.object({ data: z.object({ dokumen_dihapus: z.boolean() }) }).parse((await api.delete(`/assets/${id}/documents/${docId}`)).data).data;
}
export async function unduhDokumen(id: string, docId: string) {
    return z.object({ data: z.object({ url: SignedUrl, expires_at: z.string() }) }).parse((await api.get(`/assets/${id}/documents/${docId}/download`)).data).data;
}
export const pilihanAsetQuery = (q: string) => queryOptions({
    queryKey: ["assets", "pilihan-dokumen", q], enabled: q.trim() !== "",
    queryFn: async () => z.object({ data: z.array(z.object({ id: z.string(), kode_barang: z.string(), nama: z.string() })) }).parse((await api.get("/assets", { params: { q: q.trim(), per_page: 25 } })).data).data,
});
export interface PilihanAset { readonly id: string; readonly kode_barang: string; readonly nama: string }
