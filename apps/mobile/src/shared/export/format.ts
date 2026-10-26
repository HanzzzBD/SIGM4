// Nama & tipe berkas ekspor (keputusan 24) — murni, tanpa modul native.
export const MIME = { xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", pdf: "application/pdf" } as const;
export type ExportFormat = keyof typeof MIME;
/** Nama berkas aman untuk sistem berkas ponsel; ekstensi mengikuti format. */
export function safeFileName(name: string, format: ExportFormat): string {
    const base = name.replace(/\.(xlsx|pdf)$/i, "").replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120) || "ekspor";
    return `${base}.${format}`;
}
export const formatOf = (name: string): ExportFormat => /\.pdf$/i.test(name) ? "pdf" : "xlsx";
