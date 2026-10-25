import type { AnalyticsResponse } from "@sigm4/schemas";
import { displayValue, decimalDelta } from "./format";
export function AnalyticsSummary({ report }: { readonly report: AnalyticsResponse["report"] }) {
    return <section aria-label="Ringkasan dan perbandingan" className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">{report.kolom_ringkasan.map(c => {
        const current = report.ringkasan[c.key], previous = report.pembanding?.ringkasan[c.key];
        const delta = typeof current === "number" && typeof previous === "number" ? current - previous : c.tipe === "DECIMAL" && typeof current === "string" && typeof previous === "string" ? decimalDelta(current, previous) : null;
        return <div key={c.key} className="rounded-md border border-border-subtle bg-surface-default p-4"><h2 className="text-sm font-medium text-text-secondary">{c.label}</h2><p className="mt-2 break-words text-xl font-semibold text-text-heading tabular-nums">{displayValue(current, c)}</p>{report.pembanding && <p className="mt-2 text-sm text-text-secondary">Sebelumnya {displayValue(previous, c)}{delta === null ? "" : ` · Selisih ${displayValue(delta, c)}`}</p>}</div>;
    })}</section>;
}
