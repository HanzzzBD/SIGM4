// Statistik & Analitik mobile (FR-16.x; MS-74, MS-75) — kontrak sama dengan web P-58/P-59. Selalu daring.
import type { AxiosInstance } from "axios";
import { AnalyticsCatalogResponseSchema, AnalyticsFilterOptionsResponseSchema, AnalyticsResponseSchema, ReportExportDownloadResponseSchema, ReportExportListResponseSchema, ReportExportResponseSchema } from "@sigm4/schemas";
import type { AnalyticsColumn, AnalyticsRow, AnalyticsType, ReportExport } from "@sigm4/schemas";

export const loadCatalog = async (api: AxiosInstance, signal: AbortSignal) => AnalyticsCatalogResponseSchema.parse((await api.get("/analytics", { signal })).data).data;
export const loadReport = async (api: AxiosInstance, jenis: AnalyticsType, query: Readonly<Record<string, unknown>>, signal: AbortSignal) => AnalyticsResponseSchema.parse((await api.get(`/analytics/${jenis}`, { params: query, signal })).data);
export const loadFilterOptions = async (api: AxiosInstance, jenis: AnalyticsType, signal: AbortSignal) => AnalyticsFilterOptionsResponseSchema.parse((await api.get(`/analytics/${jenis}/options`, { signal })).data).data;
export const loadExports = async (api: AxiosInstance, signal: AbortSignal) => ReportExportListResponseSchema.parse((await api.get("/report-exports", { signal })).data).data;
export const requestExport = async (api: AxiosInstance, jenis: AnalyticsType, body: unknown, key: string) => ReportExportResponseSchema.parse((await api.post(`/analytics/${jenis}/export`, body, { headers: { "Idempotency-Key": key } })).data).data;
export const exportDownload = async (api: AxiosInstance, id: string) => ReportExportDownloadResponseSchema.parse((await api.get(`/report-exports/${id}/download`)).data).data;
export const exportLabels: Readonly<Record<ReportExport["status"], string>> = { MENUNGGU: "Menunggu diproses", BERJALAN: "Sedang diproses", SIAP: "Siap disimpan", GAGAL: "Gagal", KEDALUWARSA: "Kedaluwarsa", DIBATALKAN: "Dibatalkan" };
export const running = (j: Pick<ReportExport, "status">) => j.status === "MENUNGGU" || j.status === "BERJALAN";

/** Desimal string ditampilkan utuh (melebihi presisi JS) dengan pemisah ribuan Indonesia. */
export function decimalDisplay(text: string): string {
    const [integer = "0", fraction] = text.split("."), negative = integer.startsWith("-"), digits = integer.replace(/^-/, "");
    return `${negative ? "-" : ""}${digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".")}${fraction ? `,${fraction}` : ""}`;
}
export function decimalDelta(a: string, b: string): string {
    const scale = Math.max(a.split(".")[1]?.length ?? 0, b.split(".")[1]?.length ?? 0);
    const integer = (s: string) => { const [whole = "0", fraction = ""] = s.replace(/^-/, "").split("."); return BigInt(whole + fraction.padEnd(scale, "0")) * (s.startsWith("-") ? -1n : 1n); };
    const delta = integer(a) - integer(b), sign = delta < 0n ? "-" : "", digits = (delta < 0n ? -delta : delta).toString().padStart(scale + 1, "0");
    return sign + (scale ? `${digits.slice(0, -scale)}.${digits.slice(-scale)}` : digits);
}
export function displayValue(value: AnalyticsRow[string] | undefined, column: Pick<AnalyticsColumn, "tipe" | "satuan" | "sensitivitas">): string {
    if (value === null || value === undefined) return "Belum tersedia";
    if (column.tipe === "BOOLEAN") return value ? "Ya" : "Tidak";
    const text = column.tipe === "DECIMAL" && typeof value === "string" ? decimalDisplay(value) : typeof value === "number" ? decimalDisplay(String(value)) : String(value);
    const money = column.satuan === "Rp" || column.tipe === "DECIMAL" && (column.sensitivitas === "ASSET_FINANCIAL" || column.sensitivitas === "MAINTENANCE_COST");
    return money ? `Rp${text}` : column.satuan ? `${text} ${column.satuan}` : text;
}
/** Selisih ringkasan terhadap periode pembanding; desimal string dihitung tepat. */
export function summaryDelta(current: AnalyticsRow[string] | undefined, previous: AnalyticsRow[string] | undefined, column: Pick<AnalyticsColumn, "tipe">): AnalyticsRow[string] | null {
    if (typeof current === "number" && typeof previous === "number") return current - previous;
    return column.tipe === "DECIMAL" && typeof current === "string" && typeof previous === "string" ? decimalDelta(current, previous) : null;
}
/** Tautan rincian mobile: aset → MS-09, ruangan → MS-38; hanya bila izinnya dipegang. */
export function drilldown(jenis: AnalyticsType, row: AnalyticsRow, can: (p: string) => boolean): string | undefined {
    if (["rekapitulasi-aset", "kebutuhan-pengadaan"].includes(jenis) && can("asset.view") && /^\d+$/.test(String(row["grup"]))) return `/aset/${row["grup"]}`;
    if (jenis === "pemanfaatan-fasilitas" && /^\d+$/.test(String(row["objek_id"]))) {
        if (row["jenis"] === "ASET" && can("asset.view")) return `/aset/${row["objek_id"]}`;
        if (row["jenis"] === "RUANGAN" && can("location.view")) return `/lokasi/ruangan/${row["objek_id"]}`;
    }
    return undefined;
}
export const rowLabel = (r: AnalyticsRow, columns: readonly Pick<AnalyticsColumn, "key" | "tipe">[]) => ["nama", "aset", "nomor", "bahan", "peminjam", "bulan", "kategori", "lokasi", "kondisi", "unit_kerja"].map((k) => r[k]).filter((v) => typeof v === "string" && v.length).join(" · ") || String(r[columns.find((c) => c.tipe === "TEXT" && c.key !== "grup")?.key ?? "grup"] ?? "Baris laporan");
/** Titik Grafik Mini C-33 (≤ 20 baris halaman); nilai di luar presisi aman tidak digambar. */
export function chartValues(rows: readonly AnalyticsRow[], key: string): number[] {
    return rows.slice(0, 20).map((r) => { const n = Number(r[key]); return Number.isFinite(n) && Math.abs(n) <= Number.MAX_SAFE_INTEGER ? Math.abs(n) : 0; });
}
export interface FilterDraft { start: string; end: string; room: string; category: string; unit: string; role: string; compare: boolean }
/** Kedua tanggal berpasangan dan berurutan; tanpa tanggal = periode bawaan server. */
export function filterQuery(d: FilterDraft, supported: readonly string[]): { query: Record<string, string | number> } | { error: string } {
    if (!!d.start !== !!d.end || (d.start && d.end && d.start > d.end)) return { error: "Isi kedua tanggal dengan urutan yang benar." };
    return { query: { bandingkan: d.compare ? "true" : "false", ...(d.start ? { tanggal_mulai: d.start, tanggal_selesai: d.end } : {}), ...(d.room && supported.includes("room_id") ? { room_id: Number(d.room) } : {}), ...(d.category && supported.includes("category_id") ? { category_id: Number(d.category) } : {}), ...(d.unit && supported.includes("work_unit_id") ? { work_unit_id: Number(d.unit) } : {}), ...(d.role && supported.includes("requester_role") ? { requester_role: d.role } : {}) } };
}
