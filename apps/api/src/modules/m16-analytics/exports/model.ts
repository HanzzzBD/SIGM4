import type { AnalyticsColumn, AnalyticsRow } from "@sigm4/schemas";
export interface ExportDataset {
    readonly columns: readonly AnalyticsColumn[];
    readonly rows: readonly AnalyticsRow[];
    readonly summary?: AnalyticsRow;
    readonly summaryColumns?: readonly AnalyticsColumn[];
    readonly comparison?: { readonly period: string; readonly summary: AnalyticsRow } | null;
    readonly period?: string;
}
export const EXPORT_LIMITS = { XLSX: 100000, PDF: 5000 } as const;
export const EXPORT_JOB = "report-export";
export const EXPORT_REQUESTED = "ExportRequested";
export const EXPORT_READY = "ExportReady";
export const EXPORT_CLEANUP_JOB = "report-export-cleanup";
export const exportColumn = (key: string, label: string, tipe: AnalyticsColumn["tipe"] = "TEXT"): AnalyticsColumn => ({ key, label, tipe, sensitivitas: "PUBLIC" });
export const wibTime = (value: Date | null) => value === null ? null : `${new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Jakarta", dateStyle: "short", timeStyle: "medium" }).format(value)} WIB`;
