import express from "express";
import type { RequestHandler } from "express";
import type { Kysely } from "kysely";
import { z } from "zod";
import { WorkOrderProgressSchema,WorkOrderCompleteSchema,WorkOrderVerifySchema,WorkOrderPauseSchema,WorkOrderIrreparableSchema,WorkOrderPhotoInputSchema,WorkOrderEstimateSchema,WorkOrderEstimateDecisionSchema,WorkOrderDetailResponseSchema,ServiceHistoryResponseSchema,WorkOrderQuerySchema } from "@sigm4/schemas";
import type { Clock } from "../../shared/clock/index.js";
import type { Database } from "../../shared/db/index.js";
import type { AuditLogger } from "../../shared/audit/index.js";
import type { PenyimpananObjek } from "../../shared/storage/index.js";
import { requireAuthContext } from "../../shared/auth/index.js";
import { defineRoute,runIdempotent } from "../../shared/http/index.js";
import type { RouteDefinition } from "../../shared/http/index.js";
import { DomainError } from "../../shared/errors/index.js";
import { ExecutionService } from "./services/execution.service.js";
import { ExecutionQueryService } from "./services/execution-query.service.js";
import { ServiceHistoryService } from "./services/service-history.service.js";
const params=z.object({id:z.coerce.number().int().positive()});
const action=(method:"POST"|"PATCH",path:string,permission:string,body:z.ZodType,summary:string)=>defineRoute({method,path,permission,body,params,response:WorkOrderDetailResponseSchema,module:"m12-maintenance",rateLimitClass:"default",summary});
export const startWorkOrderRoute=action("PATCH","/work-orders/:id/start","workorder.execute",z.object({}).strict(),"Mulai atau lanjutkan pekerjaan");
export const progressWorkOrderRoute=action("PATCH","/work-orders/:id/progress","workorder.execute",WorkOrderProgressSchema,"Catat progres checklist dan biaya");
export const photoWorkOrderRoute=action("POST","/work-orders/:id/photos","workorder.execute",WorkOrderPhotoInputSchema,"Tautkan foto hasil, termasuk unggahan tertunda");
export const pauseWorkOrderRoute=action("POST","/work-orders/:id/pause","workorder.execute",WorkOrderPauseSchema,"Tunda pekerjaan dengan alasan dan tanggal lanjut");
export const irreparableWorkOrderRoute=action("POST","/work-orders/:id/irreparable","workorder.execute",WorkOrderIrreparableSchema,"Ajukan hasil Tidak Dapat Diperbaiki untuk verifikasi");
export const completeWorkOrderRoute=action("POST","/work-orders/:id/complete","workorder.execute",WorkOrderCompleteSchema,"Ajukan penyelesaian dengan foto terunggah");
export const verifyWorkOrderRoute=action("POST","/work-orders/:id/verify","workorder.verify",WorkOrderVerifySchema,"Verifikasi dan tutup atau kembalikan hasil");
export const proposeWorkOrderEstimateRoute=action("POST","/work-orders/:id/estimate","workorder.execute",WorkOrderEstimateSchema,"Ajukan perubahan estimasi biaya");
export const decideWorkOrderEstimateRoute=action("POST","/work-orders/:id/estimate/decide","workorder.verify",WorkOrderEstimateDecisionSchema,"Putuskan estimasi oleh Petugas/Admin");
export const serviceHistoryRoute=defineRoute({method:"GET",path:"/assets/:id/service-history",permission:"asset.view",params,query:WorkOrderQuerySchema,response:ServiceHistoryResponseSchema,module:"m12-maintenance",rateLimitClass:"default",summary:"Riwayat servis, biaya kumulatif dan rekomendasi penggantian"});
const mutationRoutes=[startWorkOrderRoute,progressWorkOrderRoute,photoWorkOrderRoute,pauseWorkOrderRoute,irreparableWorkOrderRoute,completeWorkOrderRoute,verifyWorkOrderRoute,proposeWorkOrderEstimateRoute,decideWorkOrderEstimateRoute];
export const removeWorkOrderPhotoRoute=defineRoute({method:"DELETE",path:"/work-orders/:id/photos/:fileId",permission:"workorder.execute",params:params.extend({fileId:z.coerce.number().int().positive()}),body:z.object({}).strict(),response:WorkOrderDetailResponseSchema,module:"m12-maintenance",rateLimitClass:"default",summary:"Lepas foto hasil sebelum penyelesaian"});
export const executionRoutes=[...mutationRoutes,serviceHistoryRoute,removeWorkOrderPhotoRoute];
export function executionRouter(deps:{db:Kysely<Database>;clock:Clock;audit:AuditLogger;storage:PenyimpananObjek},limit:(r:RouteDefinition)=>RequestHandler,authorize:(permission:string)=>RequestHandler){
 const router=express.Router(),service=new ExecutionService(deps.clock,deps.audit),query=new ExecutionQueryService(deps.db,deps.clock,deps.storage);
 for(const route of mutationRoutes){
  const handler:RequestHandler=async(req,res)=>{
   const id=params.parse(req.params).id,body=route.body!.safeParse(req.body??{});
   if(!body.success)throw new DomainError("VALIDATION_ERROR","Isian pekerjaan tidak sah.",{errors:body.error.issues.map(i=>({field:i.path.join("."),message:i.message}))});
   const ctx=requireAuthContext(res);
   const result=await runIdempotent(deps.db,ctx,{key:req.header("Idempotency-Key")??"",endpoint:`${route.method} /work-orders/${id}/${route.path.split("/").slice(3).join("/")}`,body:req.body??{}},async scope=>{
    if(route===startWorkOrderRoute)await service.start(scope,id);
    if(route===progressWorkOrderRoute)await service.progress(scope,id,WorkOrderProgressSchema.parse(body.data));
    if(route===photoWorkOrderRoute)await service.photos(scope,id,WorkOrderPhotoInputSchema.parse(body.data).foto_file_ids);
    if(route===pauseWorkOrderRoute)await service.pause(scope,id,WorkOrderPauseSchema.parse(body.data));
    if(route===irreparableWorkOrderRoute)await service.complete(scope,id,{hasil:WorkOrderIrreparableSchema.parse(body.data).rekomendasi},true);
    if(route===completeWorkOrderRoute)await service.complete(scope,id,WorkOrderCompleteSchema.parse(body.data));
    if(route===verifyWorkOrderRoute)await service.verify(scope,id,WorkOrderVerifySchema.parse(body.data));
    if(route===proposeWorkOrderEstimateRoute)await service.proposeEstimate(scope,id,WorkOrderEstimateSchema.parse(body.data));
    if(route===decideWorkOrderEstimateRoute)await service.decideEstimate(scope,id,WorkOrderEstimateDecisionSchema.parse(body.data));
    return {statusCode:200,body:{success:true,data:await query.detail(ctx,id,scope.tx),meta:null}};
   });res.status(result.statusCode).json(result.body);
  };
  if(route.method==="PATCH")router.patch(route.path,limit(route),authorize(route.permission!),handler);else router.post(route.path,limit(route),authorize(route.permission!),handler);
 }
 router.delete(removeWorkOrderPhotoRoute.path,limit(removeWorkOrderPhotoRoute),authorize("workorder.execute"),async(req,res)=>{const p=removeWorkOrderPhotoRoute.params.parse(req.params),ctx=requireAuthContext(res);const result=await runIdempotent(deps.db,ctx,{key:req.header("Idempotency-Key")??"",endpoint:`DELETE /work-orders/${p.id}/photos/${p.fileId}`,body:{}},async scope=>{await service.removePhoto(scope,p.id,p.fileId);return {statusCode:200,body:{success:true,data:await query.detail(ctx,p.id,scope.tx),meta:null}};});res.status(result.statusCode).json(result.body);});
 router.get(serviceHistoryRoute.path,limit(serviceHistoryRoute),authorize("asset.view"),async(req,res)=>{const p=params.parse(req.params),q=WorkOrderQuerySchema.parse(req.query);res.json({success:true,...await new ServiceHistoryService(deps.db).get(requireAuthContext(res),p.id,q.page,q.per_page)});});
 return router;
}
