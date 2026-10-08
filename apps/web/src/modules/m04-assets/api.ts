// Kontrak P-17, E.5.1, IMPT-01…05. HTTP melewati klien sesi bersama.
import { queryOptions } from "@tanstack/react-query";
import { ASSET_IMPORT_COLUMNS, AssetImportResponseSchema, ImportAssetsBodySchema } from "@sigm4/schemas";
import type { AssetImportJob } from "@sigm4/schemas";
import { api } from "../../shared/api";

export const importJobKey = (id: number | null) => ["asset-import", id] as const;
export const runningImport = (job: AssetImportJob | undefined): boolean => job?.status === "MENUNGGU" || job?.status === "BERJALAN";
export const importJobQuery = (id: number | null) => queryOptions({ queryKey: importJobKey(id), enabled: id !== null, queryFn: async () => AssetImportResponseSchema.parse((await api.get(`/assets/import/${id}`)).data).data, refetchInterval: (q) => runningImport(q.state.data) ? 1500 : false });

/** Pesan validasi berkas lokal aman ditampilkan; galat sistem tetap melalui states bersama. */
export class AssetImportInputError extends Error {}

function fileBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => typeof reader.result === "string" ? resolve(reader.result.split(",")[1] ?? "") : reject(new AssetImportInputError("Berkas tidak dapat dibaca."));
        reader.onerror = () => reject(new AssetImportInputError("Berkas tidak dapat dibaca. Pilih berkas kembali."));
        reader.onabort = () => reject(new AssetImportInputError("Pembacaan berkas dibatalkan."));
        reader.readAsDataURL(file);
    });
}
export async function uploadAssets(file: File) {
    // JSON body API 8mb, termasuk base64 dan metadata (SDD-06 §4.2).
    if (!/\.(csv|xlsx)$/i.test(file.name)) throw new AssetImportInputError("Pilih berkas CSV atau XLSX.");
    if (file.size === 0) throw new AssetImportInputError("Berkas kosong. Pilih berkas yang berisi data aset.");
    if (file.size > 6_000_000) throw new AssetImportInputError("Ukuran berkas maksimal 6 MB.");
    const body = ImportAssetsBodySchema.parse({ filename: file.name, content_base64: await fileBase64(file) });
    return AssetImportResponseSchema.parse((await api.post("/assets/import", body)).data);
}
export function saveDownload(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = filename; link.click();
    // Memberi peramban kesempatan memulai unduhan sebelum URL dilepas.
    setTimeout(() => URL.revokeObjectURL(url), 0);
}
export async function downloadTemplate(): Promise<void> {
    const response = await api.get<Blob>("/assets/import/template", { responseType: "blob" });
    saveDownload(response.data, "template_aset.xlsx");
}
function csvCell(value: string | number): string {
    const text = String(value);
    // Mencegah formula spreadsheet dari isian pengguna saat unduh koreksi/laporan.
    const safe = /^[\s]*[=+@-]/.test(text) ? `'${text}` : text;
    return `"${safe.replaceAll('"', '""')}"`;
}
export function importReportCsv(job: AssetImportJob, correction: boolean): string {
    const headers = correction ? [...ASSET_IMPORT_COLUMNS, "baris_asal", "pesan_galat"] : ["baris", "nama_barang", "pesan_galat"];
    const rows = job.laporan_gagal.map((f) => correction ? [...ASSET_IMPORT_COLUMNS.map((name) => f.data[name] ?? ""), f.baris, f.pesan] : [f.baris, f.nama_barang ?? "", f.pesan]);
    const summary = correction ? [] : [["Ringkasan", `${job.sukses} baris berhasil; ${job.gagal} gagal; ${job.unit_dibuat} unit dibuat`, job.pesan_galat ?? ""]];
    return "\uFEFF" + [headers, ...rows, ...summary].map((row) => row.map(csvCell).join(",")).join("\r\n");
}
