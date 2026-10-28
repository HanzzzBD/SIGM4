import { z } from "zod";
export const ANALYTICS_TYPES = ["kondisi-aset", "pemanfaatan-fasilitas", "biaya-pemeliharaan", "tren-kerusakan", "aktivitas-peminjaman", "konsumsi-bahan", "kebutuhan-pengadaan", "rekapitulasi-aset"] as const;
export const AnalyticsTypeSchema = z.enum(ANALYTICS_TYPES);
const Id = z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const Key = z.string().regex(/^[a-z][a-z0-9_]{0,63}$/).refine(v => !["constructor", "prototype"].includes(v));
const QueryFields = z.object({
    tanggal_mulai: z.iso.date().optional(), tanggal_selesai: z.iso.date().optional(),
    room_id: Id.optional(), category_id: Id.optional(), work_unit_id: Id.optional(),
    requester_role: z.string().regex(/^R-[A-Z0-9_-]{2,30}$/).optional(),
    bandingkan: z.enum(["true", "false"]).default("false"),
    page: z.coerce.number().int().min(1).max(1000000).default(1), per_page: z.coerce.number().int().min(1).max(100).default(25),
    sort: z.string().regex(/^-?[a-z][a-z0-9_]{0,63}$/).optional(),
}).strict();
const paired = (v: { tanggal_mulai?: string | undefined; tanggal_selesai?: string | undefined }) => !!v.tanggal_mulai === !!v.tanggal_selesai;
export const AnalyticsQuerySchema = QueryFields.refine(paired, { message: "Isi kedua tanggal atau gunakan periode bawaan.", path: ["tanggal_mulai"] });
export const AnalyticsExportBodySchema = z.object({ format: z.enum(["XLSX", "PDF"]), filter: QueryFields.omit({ page: true, per_page: true }).refine(paired, { message: "Isi kedua tanggal atau gunakan periode bawaan.", path: ["tanggal_mulai"] }) }).strict();
export const AnalyticsPeriodSchema = z.object({ tanggal_mulai: z.iso.date(), tanggal_selesai: z.iso.date(), jumlah_hari: z.number().int().positive().max(366) });
export const AnalyticsAppliedFiltersSchema = z.object({ room_id: Id.optional(), category_id: Id.optional(), work_unit_id: Id.optional(), requester_role: z.string().optional(), bandingkan: z.boolean() }).strict();
export const AnalyticsColumnSchema = z.object({ key: Key, label: z.string().min(1).max(200), tipe: z.enum(["TEXT", "NUMBER", "DECIMAL", "DATE", "BOOLEAN"]), satuan: z.string().max(50).optional(), sensitivitas: z.enum(["PUBLIC", "ASSET_FINANCIAL", "MAINTENANCE_COST"]) }).strict();
export const AnalyticsCellSchema = z.union([z.string().max(2000), z.number().finite(), z.boolean(), z.null()]);
export const AnalyticsRowSchema = z.record(Key, AnalyticsCellSchema);
const Meta = z.object({ page: z.number().int().positive(), per_page: z.number().int().min(1).max(100), total: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER), total_pages: z.number().int().positive() });
export const AnalyticsResponseSchema = z.object({ success: z.literal(true), data: z.array(AnalyticsRowSchema), meta: Meta, report: z.object({ jenis: AnalyticsTypeSchema, judul: z.string(), periode: AnalyticsPeriodSchema, filter: AnalyticsAppliedFiltersSchema, zona_waktu: z.literal("Asia/Jakarta"), dibuat_pada: z.iso.datetime(), kolom: z.array(AnalyticsColumnSchema), kolom_ringkasan: z.array(AnalyticsColumnSchema), metodologi: z.array(z.string().max(1000)).optional(), ringkasan: AnalyticsRowSchema, pembanding: z.object({ periode: AnalyticsPeriodSchema, ringkasan: AnalyticsRowSchema }).nullable() }) });
export const AnalyticsCatalogResponseSchema = z.object({ success: z.literal(true), data: z.array(z.object({ jenis: AnalyticsTypeSchema, judul: z.string(), status: z.enum(["SIAP", "BELUM_TERSEDIA"]), filter: z.array(z.enum(["room_id", "category_id", "work_unit_id", "requester_role"])), kolom: z.array(AnalyticsColumnSchema) })), meta: z.null() });
export type AnalyticsType = z.infer<typeof AnalyticsTypeSchema>;
export type AnalyticsQuery = z.output<typeof AnalyticsQuerySchema>;
export type AnalyticsRow = z.infer<typeof AnalyticsRowSchema>;
export type AnalyticsColumn = z.output<typeof AnalyticsColumnSchema>;
export type AnalyticsPeriod = z.infer<typeof AnalyticsPeriodSchema>;

export type AnalyticsResponse = z.infer<typeof AnalyticsResponseSchema>;
