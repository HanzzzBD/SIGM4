import express from "express";
import type { RequestHandler } from "express";
import { z } from "zod";
import { MaterialUnitBodySchema,MaterialUnitResponseSchema,MaterialUnitsResponseSchema,MaterialStatusSchema } from "@sigm4/schemas";
import type { Kysely } from "kysely";
import type { Database } from "../../shared/db/index.js";
import type { AuditLogger } from "../../shared/audit/index.js";
import { requireAuthContext } from "../../shared/auth/index.js";
import { defineRoute,runIdempotent } from "../../shared/http/index.js";
import type { RouteDefinition } from "../../shared/http/index.js";
import { DomainError } from "../../shared/errors/index.js";
import { MaterialUnitService,materialUnitOptions } from "./services/material-unit.service.js";
const params=z.object({id:z.coerce.number().int().positive()}),body=z.object({status:MaterialStatusSchema}).strict();
export const materialUnitListRoute=defineRoute({method:"GET",path:"/material-units",permission:"setting.view",module:"m20-settings",rateLimitClass:"default",summary:"Master satuan bahan",response:MaterialUnitsResponseSchema});
export const materialUnitCreateRoute=defineRoute({method:"POST",path:"/material-units",permission:"setting.manage",module:"m20-settings",rateLimitClass:"default",summary:"Administrator menambah satuan bahan",body:MaterialUnitBodySchema,response:MaterialUnitResponseSchema});
export const materialUnitStatusRoute=defineRoute({method:"PATCH",path:"/material-units/:id/status",permission:"setting.manage",module:"m20-settings",rateLimitClass:"default",summary:"Administrator mengubah status satuan bahan",params,body,response:MaterialUnitResponseSchema});
export const materialUnitRoutes=[materialUnitListRoute,materialUnitCreateRoute,materialUnitStatusRoute];
function parse<T>(s:z.ZodType<T>,v:unknown):T{const r=s.safeParse(v);if(!r.success)throw new DomainError("VALIDATION_ERROR","Isian satuan bahan tidak sah.");return r.data;}
export function materialUnitsRouter(d:{db:Kysely<Database>;audit:AuditLogger},limit:(r:RouteDefinition)=>RequestHandler,authorize:(permission:string)=>RequestHandler){const router=express.Router(),s=new MaterialUnitService(d.audit);router.get(materialUnitListRoute.path,limit(materialUnitListRoute),authorize("setting.view"),async(_req,res)=>res.json({success:true,data:await materialUnitOptions(requireAuthContext(res),d.db),meta:null}));for(const r of [materialUnitCreateRoute,materialUnitStatusRoute]){const handler:RequestHandler=async(req,res)=>{try{const ctx=requireAuthContext(res),id=r===materialUnitStatusRoute?parse(params,req.params).id:undefined,b=r===materialUnitStatusRoute?parse(body,req.body):parse(MaterialUnitBodySchema,req.body),result=await runIdempotent(d.db,ctx,{key:req.header("Idempotency-Key")??"",endpoint:`${r.method} ${r.path.replace(":id",String(id))}`,body:b},async scope=>({statusCode:r===materialUnitCreateRoute?201:200,body:{success:true,data:id?await s.status(scope,id,parse(body,b).status):await s.create(scope,parse(MaterialUnitBodySchema,b)),meta:null}}));res.status(result.statusCode).json(result.body);}catch(error){if(typeof error==="object"&&error!==null&&"code" in error&&error.code==="23505")throw new DomainError("DUPLICATE_CODE","Nama atau simbol satuan sudah digunakan.");throw error;}};router[r.method==="PATCH"?"patch":"post"](r.path,limit(r),authorize(r.permission!),handler);}return router;}
