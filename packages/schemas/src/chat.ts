import { z } from "zod";
const Id=z.string().regex(/^[1-9]\d*$/);
export const ChatReferenceSchema=z.object({label:z.string().max(200),url:z.string().regex(/^\/(?!\/)[a-zA-Z0-9/_?=&.-]+$/).refine(v=>!v.split("?")[0]!.split("/").includes(".."))});
export const ChatSessionSchema=z.object({id:Id,judul:z.string(),dimulai_pada:z.string(),terakhir_aktif:z.string(),reported:z.boolean()});
export const ChatMessageSchema=z.object({id:Id,peran:z.enum(["USER","ASSISTANT"]),isi:z.string(),status:z.enum(["PROCESSING","COMPLETED","FAILED","INCOMPLETE"]),waktu:z.string(),umpan_balik:z.enum(["UP","DOWN"]).nullable(),references:z.array(ChatReferenceSchema),error_code:z.string().nullable()});
export type ChatSession=z.infer<typeof ChatSessionSchema>;
export type ChatMessage=z.infer<typeof ChatMessageSchema>;
export type ChatReference=z.infer<typeof ChatReferenceSchema>;
export const ChatSendSchema=z.object({session_id:Id,client_message_id:z.uuidv4(),pesan:z.string().trim().min(1).max(500)}).strict();
export type ChatSend=z.infer<typeof ChatSendSchema>;
export const ChatFeedbackSchema=z.object({nilai:z.enum(["UP","DOWN"])}).strict();
export const ChatReportSchema=z.object({message_id:Id,alasan:z.string().trim().min(1).max(500),izinkan_berbagi:z.literal(true)}).strict();
export const ChatRestrictionSchema=z.object({blocked:z.boolean(),alasan:z.string().trim().min(1).max(500)}).strict();
export const ChatListQuerySchema=z.object({page:z.coerce.number().int().positive().default(1),per_page:z.coerce.number().int().min(1).max(100).default(20)}).strict();
const envelope=<T extends z.ZodType>(data:T)=>z.object({success:z.literal(true),data,meta:z.null()});
export const ChatSessionResponseSchema=envelope(ChatSessionSchema);
export const ChatSessionsResponseSchema=z.object({success:z.literal(true),data:z.array(ChatSessionSchema),meta:z.object({page:z.number(),per_page:z.number(),total:z.number(),total_pages:z.number()})});
export const ChatDetailSchema=z.object({session:ChatSessionSchema,messages:z.array(ChatMessageSchema),has_more:z.boolean(),report_note:z.string().nullable().optional()});
export const ChatDetailResponseSchema=envelope(ChatDetailSchema);
export const ChatEventSchema=z.discriminatedUnion("type",[
 z.object({type:z.literal("start"),message_id:Id}),z.object({type:z.literal("delta"),text:z.string()}),
 z.object({type:z.literal("done"),message:ChatMessageSchema}),
 z.object({type:z.literal("error"),code:z.string(),message:z.string(),retry_at:z.string().optional()})
]);
export type ChatEvent=z.infer<typeof ChatEventSchema>;
export const ChatMonitorSchema=z.object({messages:z.number(),failures:z.number(),positive:z.number(),negative:z.number(),input_tokens:z.number(),output_tokens:z.number(),cached_tokens:z.number(),thought_tokens:z.number(),average_latency_ms:z.number(),chat_cache_read_ratio:z.number(),tool_counts:z.record(z.string(),z.number()),reports:z.array(ChatSessionSchema),latest_evaluation:z.object({mode:z.enum(["LIVE","CONTRACT"]),model:z.string(),pada:z.string(),accuracy:z.number(),critical_failures:z.number(),total:z.number()}).nullable(),quota_alarm:z.boolean(),llm_status:z.string()});
export const ChatMonitorResponseSchema=envelope(ChatMonitorSchema);
export const ChatUsageResponseSchema=envelope(z.object({tanggal:z.string(),batas:z.number(),terpakai:z.number(),tersisa:z.number(),reset_at:z.string(),token_input:z.number(),token_output:z.number(),capability:z.enum(["AVAILABLE","DISABLED","UNAVAILABLE"]).optional()}));
export const CHAT_TOOL_LABELS:Readonly<Record<string,string>>={search_assets:"Lokasi dan pencarian aset",get_asset_detail:"Detail dan kondisi aset",check_asset_availability:"Ketersediaan aset",get_room_schedule:"Jadwal ruangan",get_my_loans:"Peminjaman pribadi",get_my_requests:"Pengajuan pribadi",get_my_fines:"Denda pribadi",get_damage_report_status:"Tindak lanjut kerusakan",get_operational_summary:"Ringkasan operasional",get_material_stock:"Saldo bahan",get_low_stock_materials:"Bahan menipis",get_help_article:"Panduan penggunaan"};
