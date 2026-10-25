import express from "express";
import type { RequestHandler } from "express";
import { z } from "zod";
import { MaterialBodySchema,MaterialPatchSchema,MaterialCategoryBodySchema,MaterialListQuerySchema,MaterialTransactionQuerySchema,MaterialDetailResponseSchema,MaterialListResponseSchema,MaterialCategoriesResponseSchema,MaterialCategoryResponseSchema,MaterialTransactionsResponseSchema,MaterialOptionsResponseSchema } from "@sigm4/schemas";
import type { Kysely } from "kysely";
import type { Database } from "../../shared/db/index.js";
import type { AuditLogger } from "../../shared/audit/index.js";
import { requireAuthContext } from "../../shared/auth/index.js";
import { defineRoute,runIdempotent } from "../../shared/http/index.js";
import type { RouteDefinition } from "../../shared/http/index.js";
import { DomainError } from "../../shared/errors/index.js";
import { materialUnitOptions } from "../m20-settings/index.js";
import { materialStorageOptions } from "../m03-locations/index.js";
import { MaterialService } from "./services/material.service.js";
const params=z.object({id:z.coerce.number().int().positive()}),uuid=z.object({uuid:z.uuidv4()}),empty=z.object({}).strict();
const route=(method:RouteDefinition["method"],path:string,permission:string,summary:string,extra:{params?:z.ZodType;query?:z.ZodType;body?:z.ZodType;response:z.ZodType})=>defineRoute({method,path,permission,summary,module:"m22-materials",rateLimitClass:"default",...extra});
export const materialListRoute=route("GET","/materials","material.view","Daftar bahan dan saldo total",{query:MaterialListQuerySchema,response:MaterialListResponseSchema});
export const materialOptionsRoute=route("GET","/materials/options","material.view","Kategori dan satuan bahan",{response:MaterialOptionsResponseSchema});
export const materialByUuidRoute=route("GET","/materials/by-uuid/:uuid","material.view","Detail jenis bahan dari QR, wajib login",{params:uuid,response:MaterialDetailResponseSchema});
export const materialDetailRoute=route("GET","/materials/:id","material.view","Detail bahan dan saldo lokasi",{params,response:MaterialDetailResponseSchema});
export const materialTransactionsRoute=route("GET","/materials/:id/transactions","material.view","Kartu stok berurutan waktu",{params,query:MaterialTransactionQuerySchema,response:MaterialTransactionsResponseSchema});
export const materialCreateRoute=route("POST","/materials","material.manage","Daftarkan jenis bahan dengan saldo awal nol",{body:MaterialBodySchema,response:MaterialDetailResponseSchema});
export const materialUpdateRoute=route("PATCH","/materials/:id","material.manage","Ubah master bahan tanpa menyunting saldo",{params,body:MaterialPatchSchema,response:MaterialDetailResponseSchema});
export const materialCategoriesRoute=route("GET","/material-categories","material.view","Daftar kategori bahan terpisah dari aset",{response:MaterialCategoriesResponseSchema});
export const materialCategoryCreateRoute=route("POST","/material-categories","material.manage","Buat kategori bahan",{body:MaterialCategoryBodySchema,response:MaterialCategoryResponseSchema});
export const materialCategoryUpdateRoute=route("PUT","/material-categories/:id","material.manage","Ubah kategori bahan",{params,body:MaterialCategoryBodySchema,response:MaterialCategoryResponseSchema});
export const materialCategoryDeleteRoute=route("DELETE","/material-categories/:id","material.manage","Hapus kategori yang belum dipakai",{params,body:empty,response:z.object({success:z.literal(true),data:z.object({id:z.string(),deleted:z.literal(true)}),meta:z.null()})});
export const materialRoutes=[materialListRoute,materialOptionsRoute,materialByUuidRoute,materialDetailRoute,materialTransactionsRoute,materialCreateRoute,materialUpdateRoute,materialCategoriesRoute,materialCategoryCreateRoute,materialCategoryUpdateRoute,materialCategoryDeleteRoute];
export function parseMaterial<T>(schema:z.ZodType<T>,value:unknown):T{const r=schema.safeParse(value);if(!r.success)throw new DomainError("VALIDATION_ERROR","Isian bahan tidak sah.",{errors:r.error.issues.map(i=>({field:i.path.join("."),message:i.code==="custom"?i.message:"Nilai wajib lengkap dan sesuai batas."}))});return r.data;}
export function mapMaterialWriteError(error:unknown):never{if(typeof error==="object"&&error!==null&&"code" in error){if(error.code==="23505")throw new DomainError("DUPLICATE_CODE","Nama atau kode sudah digunakan pada master terkait.");if(error.code==="23514")throw new DomainError("VALIDATION_ERROR","Perubahan melanggar aturan master atau ledger bahan.");}throw error;}
export function materialsRouter(d:{db:Kysely<Database>;audit:AuditLogger;appBaseUrl:string},limit:(r:RouteDefinition)=>RequestHandler,authorize:(permission:string)=>RequestHandler){
 const router=express.Router(),s=new MaterialService(d.db,d.audit,d.appBaseUrl);
 const read=(r:RouteDefinition,handler:RequestHandler)=>router.get(r.path,limit(r),authorize(r.permission!),handler);
 read(materialListRoute,async(req,res)=>res.json({success:true,...await s.list(requireAuthContext(res),parseMaterial(MaterialListQuerySchema,req.query))}));
 read(materialOptionsRoute,async(_req,res)=>{const ctx=requireAuthContext(res),[categories,units,rooms]=await Promise.all([s.categories(ctx),materialUnitOptions(ctx,d.db),materialStorageOptions(ctx,d.db)]);res.json({success:true,data:{categories,units,rooms},meta:null});});
 read(materialByUuidRoute,async(req,res)=>res.json({success:true,data:await s.byUuid(requireAuthContext(res),parseMaterial(uuid,req.params).uuid),meta:null}));
 read(materialDetailRoute,async(req,res)=>res.json({success:true,data:await s.detail(requireAuthContext(res),String(parseMaterial(params,req.params).id)),meta:null}));
 read(materialTransactionsRoute,async(req,res)=>{const f=parseMaterial(MaterialTransactionQuerySchema,req.query);res.json({success:true,...await s.transactions(requireAuthContext(res),String(parseMaterial(params,req.params).id),f.page,f.per_page,f.room_id)});});
 read(materialCategoriesRoute,async(_req,res)=>res.json({success:true,data:await s.categories(requireAuthContext(res)),meta:null}));
 for(const r of [materialCreateRoute,materialUpdateRoute,materialCategoryCreateRoute,materialCategoryUpdateRoute,materialCategoryDeleteRoute]){
  const handler:RequestHandler=async(req,res)=>{try{const ctx=requireAuthContext(res),id=r.params?parseMaterial(params,req.params).id:undefined,body=parseMaterial(r.body!,req.body??{});const result=await runIdempotent(d.db,ctx,{key:req.header("Idempotency-Key")??"",endpoint:`${r.method} ${r.path.replace(":id",String(id))}`,body},async scope=>{let data:unknown;if(r===materialCreateRoute||r===materialUpdateRoute)data=await s.save(scope,r===materialCreateRoute?MaterialBodySchema.parse(body):MaterialPatchSchema.parse(body),id);else if(r===materialCategoryDeleteRoute){await s.deleteCategory(scope,id!);data={id:String(id),deleted:true};}else data=await s.saveCategory(scope,MaterialCategoryBodySchema.parse(body),id);return {statusCode:r===materialCreateRoute||r===materialCategoryCreateRoute?201:200,body:{success:true,data,meta:null}};});res.status(result.statusCode).json(result.body);}catch(error){mapMaterialWriteError(error);}};
  router[r.method==="PATCH"?"patch":r.method==="PUT"?"put":r.method==="DELETE"?"delete":"post"](r.path,limit(r),authorize(r.permission!),handler);
 }return router;
}
