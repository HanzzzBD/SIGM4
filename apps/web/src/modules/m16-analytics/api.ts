import { queryOptions } from "@tanstack/react-query";
import { AssetExportBodySchema, AnalyticsCatalogResponseSchema, AnalyticsResponseSchema, AnalyticsFilterOptionsResponseSchema, ReportExportResponseSchema, ReportExportListResponseSchema, ReportExportDownloadResponseSchema } from "@sigm4/schemas";
import type { AnalyticsQuery, AnalyticsType, ReportExport } from "@sigm4/schemas";
import { api } from "../../shared/api";
export const analyticsCatalogQuery = queryOptions({ queryKey: ["analytics", "catalog"], queryFn: async () => AnalyticsCatalogResponseSchema.parse((await api.get("/analytics")).data).data });
export const analyticsReportQuery = (jenis: AnalyticsType, query: AnalyticsQuery) => queryOptions({ queryKey: ["analytics", jenis, query], queryFn: async () => AnalyticsResponseSchema.parse((await api.get(`/analytics/${jenis}`, { params: query })).data) });
export const analyticsOptionsQuery = (jenis: AnalyticsType) => queryOptions({ queryKey: ["analytics", jenis, "options"], queryFn: async () => AnalyticsFilterOptionsResponseSchema.parse((await api.get(`/analytics/${jenis}/options`)).data).data });
export const runningExport = (job: ReportExport | undefined) => job?.status === "MENUNGGU" || job?.status === "BERJALAN";
export const exportListQuery = queryOptions({ queryKey: ["report-exports"], queryFn: async () => ReportExportListResponseSchema.parse((await api.get("/report-exports")).data).data, refetchInterval: q => q.state.data?.some(runningExport) ? 2000 : false });
export const assetExportListQuery = queryOptions({ queryKey: ["report-exports", "assets"], queryFn: async () => ReportExportListResponseSchema.parse((await api.get("/assets/exports")).data).data, refetchInterval: q => q.state.data?.some(runningExport) ? 2000 : false });
export const exportStatusQuery = (id: string | undefined, jenis?: string) => queryOptions({ queryKey: ["report-exports", jenis ?? "report", id], enabled: !!id, queryFn: async () => ReportExportResponseSchema.parse((await api.get(`${jenis === "assets" ? "/assets/exports" : "/report-exports"}/${id}`)).data).data, refetchInterval: q => runningExport(q.state.data) ? 2000 : false });
export const requestExport = async (path: string, body: unknown, key: string) => {
    const headers = { "Idempotency-Key": key };
    if (path === "/assets/export") {
        const { format, filter } = AssetExportBodySchema.parse(body);
        const params = Object.fromEntries(Object.entries(filter).map(([k, v]) => [["q", "sort"].includes(k) ? k : `filter[${k}]`, v]));
        return ReportExportResponseSchema.parse((await api.get(path, { params: { ...params, format }, headers })).data).data;
    }
    return ReportExportResponseSchema.parse((await api.post(path, body, { headers })).data).data;
};
export const downloadExport = async (id: string, jenis?: string) => ReportExportDownloadResponseSchema.parse((await api.get(`${jenis === "assets" ? "/assets/exports" : "/report-exports"}/${id}/download`)).data).data;
