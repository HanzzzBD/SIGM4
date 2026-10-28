import { z } from "zod";
const Id=z.number().int().positive(),Text=z.string().trim(),Qty=z.number().int().min(0).max(2147483647);
export const MaterialStatusSchema=z.enum(["AKTIF","NONAKTIF"]);
export const MaterialBodySchema=z.object({nama:Text.min(1).max(200),material_category_id:Id,satuan_id:Id,stok_minimum:Qty,room_id_default:Id,boleh_diminta_siswa:z.boolean().optional(),keterangan:Text.max(2000).nullable().optional(),status:MaterialStatusSchema.default("AKTIF")}).strict();
export const MaterialPatchSchema=MaterialBodySchema.omit({status:true}).partial().extend({status:MaterialStatusSchema.optional()}).refine(v=>Object.keys(v).length>0,{message:"Isi minimal satu perubahan."});
export const MaterialOptionsResponseSchema=z.object({success:z.literal(true),data:z.object({categories:z.array(z.object({id:z.string(),nama:z.string(),status:MaterialStatusSchema})),units:z.array(z.object({id:z.string(),nama:z.string(),simbol:z.string(),status:MaterialStatusSchema})),rooms:z.array(z.object({id:z.string(),nama:z.string(),aktif:z.boolean()}))}),meta:z.null()});
export const MaterialCategoryBodySchema=z.object({nama:Text.min(1).max(100),kode:Text.min(1).max(30).regex(/^[A-Za-z0-9_-]+$/),keterangan:Text.max(2000).nullable().optional(),status:MaterialStatusSchema.default("AKTIF")}).strict();
export const MaterialUnitBodySchema=z.object({nama:Text.min(1).max(50),simbol:Text.min(1).max(20),keterangan:Text.max(2000).nullable().optional(),status:MaterialStatusSchema.default("AKTIF")}).strict();
export const MaterialListQuerySchema=z.object({page:z.coerce.number().int().positive().default(1),per_page:z.coerce.number().int().min(1).max(100).default(20),q:Text.max(100).optional(),category_id:z.coerce.number().int().positive().optional(),room_id:z.coerce.number().int().positive().optional(),status:MaterialStatusSchema.optional(),bersaldo:z.enum(["true","false"]).optional(),stok:z.enum(["MENIPIS","AMAN"]).optional(),urut:z.enum(["nama","saldo"]).default("nama")}).strict();
export const MaterialTransactionQuerySchema=z.object({page:z.coerce.number().int().positive().default(1),per_page:z.coerce.number().int().min(1).max(100).default(20),room_id:z.coerce.number().int().positive().optional()}).strict();
const Ref=z.object({id:z.string(),nama:z.string()}),Master=Ref.extend({keterangan:z.string().nullable(),status:MaterialStatusSchema});
export const MaterialCategorySchema=Master.extend({kode:z.string(),jumlah_bahan:z.number()});
export const MaterialUnitSchema=Master.extend({simbol:z.string()});
export const MaterialSummarySchema=z.object({id:z.string(),uuid:z.uuid(),nama:z.string(),kategori:Ref,satuan:Ref.extend({simbol:z.string()}),stok_minimum:z.number().nullable(),saldo_total:z.number().nullable(),stok_menipis:z.boolean(),status_stok:z.enum(["TERSEDIA","TERBATAS","HABIS"]),boleh_diminta_siswa:z.boolean(),lokasi_bawaan:Ref,status:MaterialStatusSchema,keterangan:z.string().nullable(),qr_url:z.url()});
export const MaterialDetailSchema=MaterialSummarySchema.extend({saldo_lokasi:z.array(z.object({room_id:z.string(),lokasi:z.string(),saldo:z.number()})),satuan_terkunci:z.boolean()});
export const MaterialTransactionSchema=z.object({id:z.string(),room_id:z.string(),lokasi:z.string(),jenis:z.enum(["PENERIMAAN","PENGELUARAN","PENYESUAIAN","OPNAME"]),jumlah:z.number(),saldo_sesudah:z.number(),referensi_jenis:z.string(),referensi_id:z.string(),referensi_url:z.string().nullable().optional(),referensi_label:z.string().nullable().optional(),alasan:z.string().nullable(),pelaku:Ref,created_at:z.string()});
const Meta=z.object({page:z.number(),per_page:z.number(),total:z.number(),total_pages:z.number()});
export const MaterialListResponseSchema=z.object({success:z.literal(true),data:z.array(MaterialSummarySchema),meta:Meta});
export const MaterialDetailResponseSchema=z.object({success:z.literal(true),data:MaterialDetailSchema,meta:z.null()});
export const MaterialTransactionsResponseSchema=z.object({success:z.literal(true),data:z.array(MaterialTransactionSchema),meta:Meta});
export const MaterialCategoriesResponseSchema=z.object({success:z.literal(true),data:z.array(MaterialCategorySchema),meta:z.null()});
export const MaterialCategoryResponseSchema=z.object({success:z.literal(true),data:MaterialCategorySchema,meta:z.null()});
export const MaterialUnitsResponseSchema=z.object({success:z.literal(true),data:z.array(MaterialUnitSchema),meta:z.null()});
export const MaterialUnitResponseSchema=z.object({success:z.literal(true),data:MaterialUnitSchema,meta:z.null()});
export const MaterialQrPrintBodySchema=z.object({material_ids:z.array(Id).min(1).max(200).refine(ids=>new Set(ids).size===ids.length,{message:"Setiap jenis bahan hanya dipilih sekali."}),tata_letak:z.enum(["A4_3X8","A4_4X10","A4_2X5"]).default("A4_3X8"),nama:z.boolean().default(true)}).strict();
export type MaterialBody=z.output<typeof MaterialBodySchema>;
export type MaterialDetail=z.infer<typeof MaterialDetailSchema>;
export type MaterialSummary=z.infer<typeof MaterialSummarySchema>;
export type MaterialListQuery=z.output<typeof MaterialListQuerySchema>;
export type MaterialTransaction=z.infer<typeof MaterialTransactionSchema>;
export type MaterialCategory=z.infer<typeof MaterialCategorySchema>;

/** QR Bahan menunjuk jenis, bukan unit aset. Resolver selalu memakai origin aplikasi. */
export function parseMaterialQr(value:string,trustedOrigin:string):string|null{
 try{
  const url=new URL(value.trim()),origin=new URL(trustedOrigin),uuid=url.pathname.slice(3);
  if(url.protocol==="https:"&&url.origin===origin.origin&&!url.username&&!url.password&&!url.search&&!url.hash&&url.pathname.startsWith("/b/")&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(uuid))return uuid.toLowerCase();
 }catch{ /* Isi non-URL tidak dikenali. */ }
 return null;
}
