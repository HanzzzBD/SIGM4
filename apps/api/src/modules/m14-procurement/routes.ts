import express from "express";
import type { RequestHandler } from "express";
import { z } from "zod";
import { ProcurementSaveSchema,ProcurementCloseSchema,ProcurementReceiptSchema,ProcurementListQuerySchema,ProcurementListResponseSchema,ProcurementDetailResponseSchema,ProcurementOptionsResponseSchema } from "@sigm4/schemas";
import type { Kysely } from "kysely";
import type { Database } from "../../shared/db/index.js";
import type { Clock } from "../../shared/clock/index.js";
import type { AuditLogger } from "../../shared/audit/index.js";
import type { PenyimpananObjek } from "../../shared/storage/index.js";
import { requireAuthContext } from "../../shared/auth/index.js";
import { DomainError,ForbiddenError } from "../../shared/errors/index.js";
import { defineRoute,runIdempotent } from "../../shared/http/index.js";
import type { RouteDefinition } from "../../shared/http/index.js";
import { ApprovalService,DecisionService } from "../m10-approval/index.js";
import { registerProcurements } from "./registration.js";
import { ProcurementSubmissionService } from "./services/submission.service.js";
import { ProcurementReceiptService } from "./services/receipt.service.js";
import { ProcurementQueryService } from "./services/query.service.js";
import type { ProcurementPolicy } from "./services/rules.js";
import { createProcurementRepository } from "./repositories/procurement.repository.js";
const params=z.object({id:z.coerce.number().int().positive()}),empty=z.object({}).strict();
const route=(method:RouteDefinition["method"],path:string,permission:string,summary:string,extra:{params?:z.ZodType;query?:z.ZodType;body?:z.ZodType;response:z.ZodType})=>defineRoute({method,path,permission,summary,module:"m14-procurement",rateLimitClass:"default",...extra});
export const procurementListRoute=route("GET","/procurements","procurement.view","Daftar usulan sesuai scope",{query:ProcurementListQuerySchema,response:ProcurementListResponseSchema});
export const procurementOptionsRoute=route("GET","/procurements/options","procurement.view","Pilihan kategori dan unit kerja",{response:ProcurementOptionsResponseSchema});
export const procurementDetailRoute=route("GET","/procurements/:id","procurement.view","Detail usulan pengadaan",{params,response:ProcurementDetailResponseSchema});
export const procurementReviewRoute=route("GET","/procurements/:id/review","procurement.approve","Konteks usulan bagi pemutus langkah aktif",{params,response:ProcurementDetailResponseSchema});
export const procurementCreateRoute=route("POST","/procurements","procurement.create","Simpan draf atau ajukan usulan",{body:ProcurementSaveSchema,response:ProcurementDetailResponseSchema});
export const procurementUpdateRoute=route("PUT","/procurements/:id","procurement.create","Sunting draf atau usulan Perlu Revisi milik sendiri",{params,body:ProcurementSaveSchema,response:ProcurementDetailResponseSchema});
export const procurementSubmitRoute=route("POST","/procurements/:id/submit","procurement.create","Ajukan draf atau revisi dari awal",{params,body:empty,response:ProcurementDetailResponseSchema});
export const procurementCloseRoute=route("POST","/procurements/:id/close","procurement.receive","Tutup Tidak Direalisasikan sesudah tahun anggaran",{params,body:ProcurementCloseSchema,response:ProcurementDetailResponseSchema});
export const procurementReceiptRoute=route("POST","/procurements/:id/receipts","procurement.receive","Catat penerimaan dan daftarkan aset atomik",{params,body:ProcurementReceiptSchema,response:ProcurementDetailResponseSchema});
export const procurementRoutes=[procurementListRoute,procurementOptionsRoute,procurementDetailRoute,procurementReviewRoute,procurementCreateRoute,procurementUpdateRoute,procurementSubmitRoute,procurementCloseRoute,procurementReceiptRoute];
function parse<T>(schema:z.ZodType<T>,input:unknown):T{const r=schema.safeParse(input);if(!r.success)throw new DomainError("VALIDATION_ERROR","Isian pengadaan tidak sah.",{errors:r.error.issues.map(i=>({field:i.path.join("."),message:i.code==="custom"?i.message:"Nilai wajib lengkap dan sesuai batas yang ditentukan."}))});return r.data;}
export interface ProcurementDeps {db:Kysely<Database>;clock:Clock;audit:AuditLogger;storage:PenyimpananObjek;approval?:ApprovalService;decisions?:DecisionService;policy:ProcurementPolicy;}
export function procurementsRouter(d:ProcurementDeps,limit:(route:RouteDefinition)=>RequestHandler,authorize:(permission:string)=>RequestHandler){
 registerProcurements(d.audit,d.policy);
 const approval=d.approval??new ApprovalService(d.db,d.audit,d.clock),decisions=d.decisions??new DecisionService(d.db,d.audit,d.clock,approval),router=express.Router(),submission=new ProcurementSubmissionService(d.clock,d.audit,approval,d.policy),receipts=new ProcurementReceiptService(d.clock,d.audit,d.policy),query=new ProcurementQueryService(d.db,d.clock,d.storage);
 router.get(procurementListRoute.path,limit(procurementListRoute),authorize(procurementListRoute.permission!),async(req,res)=>res.json({success:true,...await query.list(requireAuthContext(res),parse(ProcurementListQuerySchema,req.query))}));
 router.get(procurementOptionsRoute.path,limit(procurementOptionsRoute),authorize(procurementOptionsRoute.permission!),async(_req,res)=>res.json({success:true,data:{...await createProcurementRepository(d.db).options(requireAuthContext(res)),bahan_dapat_diusulkan:d.policy.allowMaterialProposals},meta:null}));
 router.get(procurementDetailRoute.path,limit(procurementDetailRoute),authorize(procurementDetailRoute.permission!),async(req,res)=>res.json({success:true,data:await query.detail(requireAuthContext(res),parse(params,req.params).id),meta:null}));
 router.get(procurementReviewRoute.path,limit(procurementReviewRoute),authorize(procurementReviewRoute.permission!),async(req,res)=>{
  const ctx=requireAuthContext(res),id=parse(params,req.params).id;if(!ctx.can("approval.decide"))throw new ForbiddenError();
  let found=false;for(let page=1;!found;page++){const r=await decisions.pending(ctx,page,100);found=r.rows.some(i=>i.jenis_pengajuan==="PENGADAAN_BARANG"&&i.referensi_id===id);if(page*100>=r.total)break;}
  if(!found)throw new ForbiddenError();res.json({success:true,data:await query.detailForReview(ctx,id),meta:null});
 });
 for(const definition of [procurementCreateRoute,procurementUpdateRoute,procurementSubmitRoute,procurementCloseRoute,procurementReceiptRoute]){
  const handler:RequestHandler=async(req,res)=>{const ctx=requireAuthContext(res),id=definition===procurementCreateRoute?undefined:parse(params,req.params).id,body=parse(definition.body!,req.body);
   const response=await runIdempotent(d.db,ctx,{key:req.header("Idempotency-Key")??"",endpoint:`${definition.method} ${definition.path.replace(":id",String(id))}`,body:req.body},async scope=>{
    let orderId=id;
    if(definition===procurementCreateRoute||definition===procurementUpdateRoute)orderId=Number(await submission.save(scope,ProcurementSaveSchema.parse(body),id));
    else if(definition===procurementSubmitRoute)await submission.submit(scope,id!);
    else if(definition===procurementCloseRoute)await submission.close(scope,id!,ProcurementCloseSchema.parse(body).alasan);
    else await receipts.receive(scope,id!,ProcurementReceiptSchema.parse(body));
    return {statusCode:definition===procurementCreateRoute?201:200,body:{success:true,data:await query.detail(scope.ctx,orderId!,scope.tx),meta:null}};
   });res.status(response.statusCode).json(response.body);
  };
  router[definition.method==="PUT"?"put":"post"](definition.path,limit(definition),authorize(definition.permission!),handler);
 }
 return router;
}
