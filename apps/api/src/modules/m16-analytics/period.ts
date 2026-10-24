import type { AnalyticsPeriod, AnalyticsQuery } from "@sigm4/schemas";
import type { Clock } from "../../shared/clock/index.js";
import { DomainError } from "../../shared/errors/index.js";
const DAY = 86400000, WIB = 7 * 3600000;
export const analyticsInvalid = (field: string, message: string) => new DomainError("VALIDATION_ERROR", message, { field, errors: [{ field, message }] });
export interface ReportPeriod extends AnalyticsPeriod { readonly start: Date; readonly endExclusive: Date }
const day = (epoch: number) => new Date(epoch).toISOString().slice(0, 10);
export function analyticsPeriods(clock: Clock, query: AnalyticsQuery, maxDays = 366): { current: ReportPeriod; previous: ReportPeriod | null } {
    const today = day(clock.now().getTime() + WIB), end = query.tanggal_selesai ?? today;
    const start = query.tanggal_mulai ?? day(Date.parse(`${end}T00:00:00Z`) - 29 * DAY);
    const days = (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / DAY + 1;
    if (!Number.isInteger(days) || days < 1 || days > maxDays) throw analyticsInvalid("tanggal_mulai", `Periode harus berurutan dan paling lama ${maxDays} hari.`);
    const period = (from: string, to: string): ReportPeriod => ({ tanggal_mulai: from, tanggal_selesai: to, jumlah_hari: days, start: new Date(Date.parse(`${from}T00:00:00Z`) - WIB), endExclusive: new Date(Date.parse(`${to}T00:00:00Z`) + DAY - WIB) });
    return { current: period(start, end), previous: query.bandingkan === "true" ? period(day(Date.parse(`${start}T00:00:00Z`) - days * DAY), day(Date.parse(`${start}T00:00:00Z`) - DAY)) : null };
}
