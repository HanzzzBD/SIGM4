import { z } from "zod";
const CardType = z.enum(["KPI", "AKSI", "PERINGATAN", "STATUS", "GRAFIK_GARIS", "GRAFIK_DONAT", "GRAFIK_BATANG", "TABEL"]);
export const DashboardPeriodSchema = z.enum(["7_hari", "30_hari", "semester", "tahun_ajaran"]);
export const DashboardManifestResponseSchema = z.object({ success: z.literal(true), data: z.object({ templat: z.string().nullable(), kartu: z.array(z.object({ id: z.string(), judul: z.string(), zona: z.number(), jenis: CardType, berperiode: z.boolean(), drilldown: z.string().nullable() })) }), meta: z.null() });
export const DashboardCardResponseSchema = z.object({ success: z.literal(true), data: z.object({ id: z.string(), rentang: z.object({ jenis: DashboardPeriodSchema, mulai: z.string(), akhir: z.string() }).nullable(), diperbarui_pada: z.string(), isi: z.unknown() }), meta: z.null() });
export type DashboardCard = z.infer<typeof DashboardManifestResponseSchema>["data"]["kartu"][number];
export type DashboardPeriod = z.infer<typeof DashboardPeriodSchema>;
