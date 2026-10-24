import express from "express";
import type { RequestHandler } from "express";
import { MaterialQrPrintBodySchema } from "@sigm4/schemas";
import type { Kysely } from "kysely";
import type { Database } from "../../shared/db/index.js";
import { withTransaction } from "../../shared/db/index.js";
import { requireAuthContext } from "../../shared/auth/index.js";
import { defineRoute } from "../../shared/http/index.js";
import type { RouteDefinition } from "../../shared/http/index.js";
import type { AuditLogger } from "../../shared/audit/index.js";
import type { PembangkitPdf } from "../../shared/pdf/index.js";
import { DomainError } from "../../shared/errors/index.js";
import { materialQrTargets } from "../m22-materials/index.js";
import { htmlLabel } from "./services/label-html.js";
import { PrintQrResponseSchema } from "./schemas/qr.schema.js";
export const materialQrPrintRoute=defineRoute({method:"POST",path:"/materials/qr/print",permission:"material.qr_print",module:"m05-qr",rateLimitClass:"qr-print",summary:"PDF label QR per jenis Bahan, 1 sampai 200 label",body:MaterialQrPrintBodySchema,response:PrintQrResponseSchema,contentType:"application/pdf"});
export function materialQrRouter(d:{db:Kysely<Database>;audit:AuditLogger;pdf:PembangkitPdf;appBaseUrl:string},limit:(r:RouteDefinition)=>RequestHandler,authorize:(permission:string)=>RequestHandler){const router=express.Router();router.post(materialQrPrintRoute.path,limit(materialQrPrintRoute),authorize("material.qr_print"),async(req,res)=>{const ctx=requireAuthContext(res),parsed=MaterialQrPrintBodySchema.safeParse(req.body);if(!parsed.success)throw new DomainError("VALIDATION_ERROR","Pilih 1 sampai 200 jenis bahan dan tata letak label yang sah.");const b=parsed.data,targets=await withTransaction(ctx,s=>materialQrTargets(s,b.material_ids),d.db),html=htmlLabel(d.appBaseUrl,targets.map(t=>({uuid:t.uuid,kodeAset:"",nama:t.nama,qrUrl:new URL(`/b/${t.uuid}`,d.appBaseUrl).href})),b.tata_letak,{kodeAset:false,nama:b.nama}),pdf=await d.pdf.render(html);await withTransaction(ctx,s=>d.audit.write(s,{modul:"m05-qr",aksi:"MATERIAL_QR_PRINTED",entitas:"materials",nilaiSesudah:{jumlah:targets.length,material_ids:b.material_ids,tata_letak:b.tata_letak}}),d.db);res.setHeader("Content-Disposition",'attachment; filename="label-qr-bahan.pdf"');res.type("application/pdf").send(pdf);});return router;}
