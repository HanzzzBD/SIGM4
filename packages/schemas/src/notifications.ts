import { z } from "zod";
export const NotificationGroupSchema = z.enum(["PERSETUJUAN", "RESERVASI_PEMINJAMAN", "DENDA_KEWAJIBAN", "KERUSAKAN_PERAWATAN", "OPNAME_PENGADAAN", "AKUN_SISTEM"]);
export const NotificationSchema = z.object({ id: z.number(), kode: z.string(), jenis: NotificationGroupSchema, judul: z.string(), isi: z.string(), referensi_jenis: z.string().nullable(), referensi_id: z.number().nullable(), deep_link: z.string().nullable(), wajib: z.boolean(), dibaca_pada: z.string().nullable(), created_at: z.string() });
export const NotificationsResponseSchema = z.object({ success: z.literal(true), data: z.array(NotificationSchema), meta: z.object({ page: z.number(), per_page: z.number(), total: z.number(), total_pages: z.number(), unread_count: z.number() }) });
export type Notification = z.infer<typeof NotificationSchema>;
