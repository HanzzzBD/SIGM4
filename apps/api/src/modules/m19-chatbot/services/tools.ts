import { z } from "zod";
import type { AuthContext } from "../../../shared/auth/index.js";
import type { QueryExecutor } from "../../../shared/db/index.js";
import type { Clock } from "../../../shared/clock/index.js";
import { chatAssets } from "../../m04-assets/index.js";
import { chatRooms } from "../../m03-locations/index.js";
import { chatLoans } from "../../m09-loans/index.js";
import { chatRequests } from "../../m10-approval/index.js";
import { chatDamage } from "../../m11-damage-reports/index.js";
import { chatSummary } from "../../m15-dashboard/index.js";
import { chatMaterials } from "../../m22-materials/index.js";
const text=z.string().trim().min(1).max(100),optional=text.optional();
const dates={tanggal_mulai:z.iso.datetime({offset:true}),tanggal_selesai:z.iso.datetime({offset:true})};
const period=(s:z.ZodObject)=>s.refine(v=>Date.parse(v["tanggal_mulai"] as string)<Date.parse(v["tanggal_selesai"] as string),"Rentang harus berurutan.");
const tools=[
 {name:"search_assets",description:"Panggil untuk mencari kode/lokasi/kondisi aset. Gunakan kata kunci pengguna; jangan menebak aset atau mengirim identitas pemilik. Hasil maksimal 20 unit sesuai hak penanya.",schema:z.object({kata_kunci:optional,kategori:optional,kondisi:z.enum(["BAIK","RUSAK_RINGAN","RUSAK_BERAT","HILANG"]).optional(),lokasi:optional,hanya_dapat_dipinjam:z.boolean().optional()}).strict()},
 {name:"get_asset_detail",description:"Panggil ketika kode barang atau UUID aset diketahui. Jangan mengubah identitas menjadi ID pengguna. Hanya detail yang diizinkan dan ringkasan riwayat; data kosong berarti tidak ditemukan atau tidak berhak.",schema:z.object({kode_barang:optional,uuid:z.uuid().optional()}).strict().refine(v=>(v.kode_barang!==undefined)!==(v.uuid!==undefined))},
 {name:"check_asset_availability",description:"Panggil untuk ketersediaan unit pada rentang tanggal/jam. Wajib ISO 8601 dengan offset WIB +07:00 dan batas akhir eksklusif. Hitung besok dari konteks waktu server. Jangan menyimpulkan ketersediaan dari status aset saja.",schema:period(z.object({nama:optional,kategori:optional,...dates}).strict())},
 {name:"get_room_schedule",description:"Panggil untuk waktu kosong/terpakai ruangan. Wajib nama ruangan dan rentang ISO ber-offset, akhir eksklusif. Tidak memuat identitas pemohon, alasan reservasi atau rincian pengguna.",schema:period(z.object({ruangan:text,...dates}).strict())},
 {name:"get_my_loans",description:"Panggil untuk peminjaman pribadi penanya, tenggat dan statusnya. Server menentukan pemilik; jangan memberi parameter user_id. Tidak dipakai untuk peminjaman orang lain.",schema:z.object({status:optional}).strict()},
 {name:"get_my_requests",description:"Panggil untuk status pengajuan milik penanya. Server memaksakan pemilik meskipun penanya Admin. Gunakan jenis/status kode sistem bila pengguna memfilter; jangan membaca pengajuan orang lain.",schema:z.object({jenis:optional,status:optional}).strict()},
 {name:"get_my_fines",description:"Panggil untuk mengetahui status denda penanya. Hanya nomor/status/jenis; angka biaya tidak dikirim ke model. Arahkan ke detail Denda untuk nominal, jangan mengarang jumlah.",schema:z.object({status:optional}).strict()},
 {name:"get_damage_report_status",description:"Panggil untuk status tiket kerusakan menurut nomor tiket/kode barang. Pelapor hanya membaca tiketnya sendiri; Admin/Petugas membaca sesuai izin. Hasil tidak menyertakan nama pelapor atau isi catatan pribadi.",schema:z.object({nomor_tiket:optional,kode_barang:optional}).strict()},
 {name:"get_operational_summary",description:"Panggil untuk jumlah agregat operasional hanya Admin/Petugas/Pimpinan yang berhak. Tidak boleh membaca daftar identitas; jenis aset, peminjaman atau kerusakan. Periode memakai ISO dengan offset, akhir eksklusif.",schema:period(z.object({jenis_ringkasan:z.enum(["aset","peminjaman","kerusakan"]),...dates}).strict())},
 {name:"get_material_stock",description:"Panggil untuk saldo Bahan agregat per lokasi, satuan dan stok minimum. Jangan meminta transaksi, nama peminta atau saldo pengguna lain. Tanpa material.view hasil kosong. Tautan ke detail Bahan berasal dari server.",schema:z.object({nama_bahan:optional,kategori:optional,lokasi:optional}).strict()},
 {name:"get_low_stock_materials",description:"Panggil untuk daftar bahan aktif yang saldo totalnya mencapai/di bawah stok minimum. Per lokasi hanya menyaring tampilan, bukan mengubah definisi ambang global. Tidak memuat kartu transaksi maupun identitas peminta.",schema:z.object({kategori:optional,lokasi:optional}).strict()},
 {name:"get_help_article",description:"Panggil untuk petunjuk memakai fitur atau ketika diminta melakukan aksi tulis. Hanya panduan statis dengan tautan menuju form berizin; jangan menjanjikan membuat, menyetujui atau mengubah data.",schema:z.object({topik:text}).strict()}
].sort((a,b)=>a.name.localeCompare(b.name,"en"));
export const TOOL_DECLARATIONS=tools.map(t=>({type:"function" as const,name:t.name,description:t.description,parameters:z.toJSONSchema(t.schema,{unrepresentable:"any"})}));
export const TOOL_NAMES=tools.map(t=>t.name);
const FIELDS=new Set(["id","kode_barang","nama","kategori","lokasi","kondisi","status","tersedia","ruangan","mulai","selesai","nomor","jenis","jatuh_tempo","diajukan","jumlah","saldo","satuan","stok_minimum","tautan","panduan","jumlah_perbaikan"]);
// Diulang sampai stabil: pembuangan sekali jalan dapat menyusun ulang tag terlarang dari potongannya.
export function sanitizeText(value:string){let text=value,before="";while(text!==before){before=text;text=text.replace(/(?:ignore|abaikan)\s+(?:all|semua|previous|instruksi)[^\n]{0,200}/gi,"[instruksi dihapus]").replace(/<\/?(?:system|script|assistant)[^>]*>/gi,"");}return [...text].filter(c=>c.charCodeAt(0)>=32||c==="\n"||c==="\t").join("").slice(0,200);}
export function safeToolData(data:unknown):Record<string,unknown>[] {
 if(!Array.isArray(data))return [];
 return data.slice(0,40).filter(r=>typeof r==="object"&&r!==null).map(r=>Object.fromEntries(Object.entries(r as Record<string,unknown>).filter(([k,v])=>FIELDS.has(k)&&(v===null||["string","boolean","number"].includes(typeof v))).map(([k,v])=>[k,typeof v==="string"?sanitizeText(v):v])));
}
export class ToolExecutor {
 constructor(private readonly db:QueryExecutor,private readonly clock:Clock){}
 async run(ctx:AuthContext,name:string,input:unknown){
  const tool=tools.find(t=>t.name===name);if(!tool)return [];
  const parsed=tool.schema.safeParse(input);if(!parsed.success)return [];
  const args=parsed.data as Record<string,unknown>;
  if(args["tanggal_mulai"]){const range=Date.parse(String(args["tanggal_selesai"]))-Date.parse(String(args["tanggal_mulai"]));if(range>366*86400000)return [];}
  const timed={...args,now:this.clock.now()};let result:unknown;
  switch(name){
   case "search_assets":case "get_asset_detail":result=await chatAssets(this.db,ctx,args);break;
   case "check_asset_availability":result=await chatAssets(this.db,ctx,timed,true);break;
   case "get_room_schedule":result=await chatRooms(this.db,ctx,timed);break;
   case "get_my_loans":result=await chatLoans(this.db,ctx,args["status"] as string|undefined);break;
   case "get_my_fines":result=await chatLoans(this.db,ctx,args["status"] as string|undefined,true);break;
   case "get_my_requests":result=await chatRequests(this.db,ctx,args["jenis"] as string|undefined,args["status"] as string|undefined);break;
   case "get_damage_report_status":result=await chatDamage(this.db,ctx,args);break;
   case "get_operational_summary":result=await chatSummary(this.db,ctx,String(args["jenis_ringkasan"]),new Date(String(args["tanggal_mulai"])),new Date(String(args["tanggal_selesai"])));break;
   case "get_material_stock":case "get_low_stock_materials":result=await chatMaterials(this.db,ctx,args,name==="get_low_stock_materials");break;
   case "get_help_article":{const topic=String(args["topik"]).toLocaleLowerCase("id");const guides=[{match:"reservasi",permission:"reservation.create",panduan:"Buka formulir, pilih objek, tanggal dan keperluan; kirim pengajuan lalu tunggu persetujuan.",tautan:"/reservasi/baru"},{match:"kerusakan",permission:"damage.create",panduan:"Buka Lapor Kerusakan, pilih objek, tulis deskripsi dan urgensi, lalu kirim laporan.",tautan:"/kerusakan/baru"},{match:"bahan",permission:"material.view",panduan:"Lihat saldo jenis bahan dan satuan pada katalog; ajukan permintaan melalui formulir jika berhak.",tautan:"/bahan"},{match:"peminjaman",permission:"loan.view",panduan:"Lihat detail peminjaman untuk tenggat, pengembalian dan perpanjangan. Chatbot hanya memberi informasi.",tautan:"/peminjaman"}];result=guides.filter(g=>topic.includes(g.match)&&ctx.can(g.permission)).map(g=>({nama:g.match,panduan:g.panduan,tautan:g.tautan}));break;}
   default:result=[];
  }return safeToolData(result);
 }
}
