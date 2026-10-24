import { WorkOrderChecklistSchema,WorkOrderDetailSchema } from "@sigm4/schemas";
import type { Kysely } from "kysely";
import type { AuthContext } from "../../../shared/auth/index.js";
import type { Database,QueryExecutor } from "../../../shared/db/index.js";
import type { Clock } from "../../../shared/clock/index.js";
import type { PenyimpananObjek } from "../../../shared/storage/index.js";
import { NotFoundError } from "../../../shared/errors/index.js";
import { garansiAktifAset,urlUnduhBerkas } from "../../m06-documents/index.js";
import { createExecutionRepository } from "../repositories/execution.repository.js";
import { maskWorkOrderCosts,canReadWorkOrderCosts,tanggalWib } from "./work-order.service.js";

export class ExecutionQueryService {
 constructor(private readonly db:Kysely<Database>,private readonly clock:Clock,private readonly storage:PenyimpananObjek){}
 async detail(ctx:AuthContext,id:number,executor:QueryExecutor=this.db){
  const repo=createExecutionRepository(executor),row=await repo.detail(ctx,id);if(!row)throw new NotFoundError("Work order tidak ditemukan.");
  const [photos,costs,warranty,reporter]=await Promise.all([repo.photos(ctx,row.id),canReadWorkOrderCosts(ctx,row.teknisi_id)?repo.costs(ctx,row.id):[],row.asset_id&&ctx.can("asset_document.view")?garansiAktifAset(executor,ctx,Number(row.asset_id),tanggalWib(this.clock.now())):[],row.damage_report_id?repo.reporterPhotos(ctx,row.damage_report_id):[]]);
  const photo=async(p:typeof photos[number])=>({file_id:p.file_id,urutan:p.urutan,status:p.checksum===null?"BELUM_TERUNGGAH":p.scan_status,url:p.checksum!==null&&p.scan_status==="CLEAN"?(await urlUnduhBerkas(this.storage,this.clock,p,"medium")).url:null});
  const data={...maskWorkOrderCosts(ctx,row),created_at:row.created_at.toISOString(),checklist:WorkOrderChecklistSchema.parse(row.checklist),waktu_mulai:row.waktu_mulai?.toISOString()??null,waktu_selesai:row.waktu_selesai?.toISOString()??null,diverifikasi_pada:row.diverifikasi_pada?.toISOString()??null,
   objek:{jenis:row.asset_id?"ASET":"RUANGAN",id:row.asset_id??row.room_id!,label:row.objek_label,kode:row.kode_barang},teknisi:{id:row.teknisi_id,nama:row.teknisi_nama},
   garansi_aktif:ctx.can("asset_document.view")?warranty.length>0:null,rincian_biaya:costs,foto:await Promise.all(photos.map(photo)),foto_tertunda:photos.filter(p=>p.checksum===null||p.scan_status!=="CLEAN").length,
   estimasi_diusulkan:canReadWorkOrderCosts(ctx,row.teknisi_id)?row.estimasi_diusulkan:null,
   foto_pelapor:await Promise.all(reporter.map(async p=>({file_id:p.file_id,status:p.checksum===null?"BELUM_TERUNGGAH":p.scan_status,url:p.checksum!==null&&p.scan_status==="CLEAN"?(await urlUnduhBerkas(this.storage,this.clock,p,"medium")).url:null}))),
  };
  return WorkOrderDetailSchema.parse(data);
 }
}
