import express from "express";
import type { RequestHandler } from "express";
import { z } from "zod";
import { StocktakeCreateSchema, StocktakeScanSchema, StocktakeFindingSchema, StocktakeReconcileSchema, StocktakeFindingReviewSchema, StocktakeReasonSchema, StocktakeQuerySchema, StocktakeListSchema, StocktakeResponseSchema, StocktakeItemsSchema, StocktakeFindingsSchema, StocktakeScanResponseSchema, StocktakeItemSchema } from "@sigm4/schemas";
import { sql } from "kysely";
import type { Kysely } from "kysely";
import type { Database } from "../../shared/db/index.js";
import { withTransaction } from "../../shared/db/index.js";
import type { Clock } from "../../shared/clock/index.js";
import type { AuditLogger } from "../../shared/audit/index.js";
import type { PenyimpananObjek } from "../../shared/storage/index.js";
import { requireAuthContext } from "../../shared/auth/index.js";
import { DomainError } from "../../shared/errors/index.js";
import { defineRoute, runIdempotent } from "../../shared/http/index.js";
import type { RouteDefinition } from "../../shared/http/index.js";
import { StocktakeSessionService } from "./services/session.service.js";
import { StocktakeScanService } from "./services/scan.service.js";
import { StocktakeReconciliationService } from "./services/reconciliation.service.js";
import { StocktakeReportService } from "./services/report.service.js";
import { createStocktakeRepository } from "./repositories/stocktake.repository.js";
import { requireAssignee } from "./access.js";
import { MaterialStocktakeService } from "./services/material-stocktake.service.js";
import { createMaterialStocktakeRepository } from "./repositories/material-stocktake.repository.js";
import { MaterialStocktakeCountSchema,MaterialStocktakeNoteSchema,MaterialStocktakeItemsSchema,MaterialStocktakeItemResponseSchema } from "@sigm4/schemas";

const params = z.object({ id: z.string().regex(/^[1-9]\d*$/) }), itemParams = params.extend({ itemId: z.string().regex(/^[1-9]\d*$/) });
const Empty = z.object({}).strict(), Room = z.object({ room_id: z.number().int().positive() }).strict();
const Decision = z.object({ keputusan: z.enum(["SETUJU", "TOLAK"]), catatan: z.string().trim().max(2000).default("") }).strict().refine(v => v.keputusan !== "TOLAK" || v.catatan.length > 0, { path: ["catatan"], message: "Catatan penolakan wajib." });
const base = { module: "m13-audit-stocktake", rateLimitClass: "default" as const };
const Resolve = z.object({ code: z.string().trim().min(1).max(200).optional(), uuid: z.uuid().optional() }).strict().refine(v => (v.code !== undefined) !== (v.uuid !== undefined), { message: "Pilih kode aset atau UUID." });
const optionsSchema = z.object({ success: z.literal(true), data: z.object({ categories: z.array(z.object({ id: z.string(), nama: z.string() })), rooms: z.array(z.object({ id: z.string(), nama: z.string(), building_id: z.string() })), buildings: z.array(z.object({ id: z.string(), nama: z.string() })), people: z.array(z.object({ id: z.string(), nama: z.string() })) }), meta: z.null() });
const action = (path: string, permission: string, body: z.ZodType = Empty, response: z.ZodType = StocktakeResponseSchema, method: "POST" | "PUT" = "POST") => defineRoute({ ...base, method, path, permission, params: path.includes(":itemId") ? itemParams : params, body, response, idempotent: true, successStatus: 200, summary: path });
const create = defineRoute({ ...base, method: "POST", path: "/audit-sessions", permission: "audit.manage", body: StocktakeCreateSchema, response: StocktakeResponseSchema, idempotent: true, summary: "Buat sesi opname dan bekukan snapshot" });
const mutations = [
    action("/audit-sessions/:id/material-counts","audit.execute",MaterialStocktakeCountSchema,StocktakeScanResponseSchema),
    action("/audit-sessions/:id/material-items/:itemId/reconcile","audit.manage",MaterialStocktakeNoteSchema,StocktakeResponseSchema,"PUT"),
    action("/audit-sessions/:id/scan", "audit.execute", StocktakeScanSchema, StocktakeScanResponseSchema),
    action("/audit-sessions/:id/findings", "audit.execute", StocktakeFindingSchema, StocktakeScanResponseSchema),
    action("/audit-sessions/:id/complete-location", "audit.execute", Room),
    action("/audit-sessions/:id/finalize", "audit.manage"), action("/audit-sessions/:id/submit", "audit.manage"),
    action("/audit-sessions/:id/approve", "audit.approve", Decision), action("/audit-sessions/:id/cancel", "audit.manage", StocktakeReasonSchema),
    action("/audit-sessions/:id/items/:itemId/reconcile", "audit.manage", StocktakeReconcileSchema, StocktakeResponseSchema, "PUT"),
    action("/audit-sessions/:id/findings/:itemId", "audit.manage", StocktakeFindingReviewSchema, StocktakeResponseSchema, "PUT"),
    action("/audit-sessions/:id/report/retry", "audit.manage"),
    action("/audit-sessions/:id/photos/:itemId/remove", "audit.manage", StocktakeReasonSchema),
];
export const stocktakeRoutes = [create,
    defineRoute({ ...base, method: "GET", path: "/audit-sessions/options", permission: "audit.manage", response: optionsSchema, summary: "Pemilih cakupan dan pelaksana opname" }),
    defineRoute({ ...base, method: "GET", path: "/audit-sessions", permission: "audit.view", query: StocktakeQuerySchema, response: StocktakeListSchema, summary: "Daftar sesi opname" }),
    defineRoute({ ...base, method: "GET", path: "/audit-sessions/mine", permission: "audit.execute", query: StocktakeQuerySchema, response: StocktakeListSchema, summary: "Sesi penugasan opname saya" }),
    defineRoute({ ...base, method: "GET", path: "/audit-sessions/:id", permission: "audit.view", params, response: StocktakeResponseSchema, summary: "Detail dan progres opname" }),
    ...(["items", "results", "findings"] as const).map(kind => defineRoute({ ...base, method: "GET", path: `/audit-sessions/:id/${kind}`, permission: kind === "items" ? "audit.execute" : "audit.view", params, query: StocktakeQuerySchema, response: kind === "findings" ? StocktakeFindingsSchema : StocktakeItemsSchema, summary: kind === "items" ? "Target pemeriksaan per lokasi (maksimal 500)" : "Hasil opname berhalaman" })),
    defineRoute({ ...base, method: "GET", path: "/audit-sessions/:id/context", permission: "audit.execute", params, response: z.object({ success: z.literal(true), data: z.object({ categories: z.array(z.object({ id: z.string(), nama: z.string() })) }), meta: z.null() }), summary: "Pilihan kategori untuk temuan baru pelaksana" }),
    defineRoute({ ...base, method: "GET", path: "/audit-sessions/:id/resolve", permission: "audit.execute", params, query: Resolve, response: z.object({ success: z.literal(true), data: StocktakeItemSchema, meta: z.null() }), summary: "Cari kode/UUID aset dalam snapshot sesi" }),
    defineRoute({ ...base, method: "GET", path: "/audit-sessions/:id/report", permission: "audit.view", params, response: z.object({ success: z.literal(true), data: z.object({ status: z.string(), url: z.string().nullable(), file_id: z.string().nullable() }), meta: z.null() }), summary: "URL berita acara PDF dari snapshot disetujui" }),
    defineRoute({ ...base, method: "GET", path: "/audit-sessions/:id/export", permission: "audit.view", params, response: z.string(), contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", summary: "Ekspor XLSX hasil opname disetujui" }),
    defineRoute({ ...base, method: "GET", path: "/audit-sessions/:id/photos", permission: "audit.view", params, query: StocktakeQuerySchema, response: z.object({ success: z.literal(true), data: z.array(z.object({ file_id: z.string(), item_id: z.string().nullable(), finding_id: z.string().nullable(), status: z.string(), url: z.string().nullable() })), meta: z.null() }), summary: "Bukti opname; URL hanya untuk foto CLEAN" }),
    ...mutations,
    defineRoute({...base,method:"GET",path:"/audit-sessions/:id/material-items",permission:"audit.execute",params,query:StocktakeQuerySchema,response:MaterialStocktakeItemsSchema,summary:"Target Bahan per lokasi penyimpanan"}),
    defineRoute({...base,method:"GET",path:"/audit-sessions/:id/material-results",permission:"audit.view",params,query:StocktakeQuerySchema,response:MaterialStocktakeItemsSchema,summary:"Hitungan dan rekonsiliasi Bahan"}),
    defineRoute({...base,method:"GET",path:"/audit-sessions/:id/material-resolve",permission:"audit.execute",params,query:z.object({uuid:z.uuidv4(),room_id:z.coerce.number().int().positive()}).strict(),response:MaterialStocktakeItemResponseSchema,summary:"QR jenis Bahan dalam target lokasi sesi"}),
];
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
    const result = schema.safeParse(value);
    if (!result.success) throw new DomainError("VALIDATION_ERROR", "Isian opname tidak sah.", { errors: result.error.issues.map(i => ({ field: i.path.join("."), message: i.message })) });
    return result.data;
}
export function stocktakeRouter(deps: { db: Kysely<Database>; clock: Clock; audit: AuditLogger; storage: PenyimpananObjek }, limit: (r: RouteDefinition) => RequestHandler, authorize: (p: string) => RequestHandler) {
    const router = express.Router(), session = new StocktakeSessionService(deps.clock, deps.audit), scan = new StocktakeScanService(deps.clock, deps.audit), recon = new StocktakeReconciliationService(deps.clock, deps.audit), report = new StocktakeReportService(deps.db, deps.clock, deps.audit, deps.storage);
    for (const route of stocktakeRoutes) {
        const handler: RequestHandler = async (req, res) => {
            const ctx = requireAuthContext(res), repo = createStocktakeRepository(deps.db);
            if (route.method === "GET") {
                if (route.path.endsWith("/options")) {
                    const [categories, rooms, buildings, people] = await Promise.all([deps.db.selectFrom("asset_categories").select(["id", "nama"]).orderBy("nama").execute(), deps.db.selectFrom("rooms as r").innerJoin("areas as a", "a.id", "r.area_id").select(["r.id", "r.nama", "a.building_id"]).where("r.status", "=", "AKTIF").orderBy("r.nama").execute(), deps.db.selectFrom("buildings").select(["id", "nama"]).orderBy("nama").execute(), deps.db.selectFrom("users as u").innerJoin("roles as r", "r.id", "u.role_id").select(["u.id", "u.nama"]).where("u.status", "=", "AKTIF").where("r.kode", "in", ["R-01", "R-02"]).orderBy("u.nama").execute()]);
                    res.json({ success: true, data: { categories, rooms, buildings, people }, meta: null }); return;
                }
                const q = (route.path.endsWith("/resolve")||route.path.endsWith("/material-resolve")) ? StocktakeQuerySchema.parse({}) : parse(StocktakeQuerySchema, req.query);
                if (["/audit-sessions", "/audit-sessions/mine"].includes(route.path)) {
                    const result = await repo.list(ctx, q.page, q.per_page, q.status, route.path.endsWith("/mine"));
                    res.json({ success: true, ...result }); return;
                }
                const id = parse(params, req.params).id;
                if(route.path.endsWith("/material-items")||route.path.endsWith("/material-results")||route.path.endsWith("/material-resolve")){
                    if(!route.path.endsWith("/material-results"))await withTransaction(ctx,s=>requireAssignee(s,id),deps.db);
                    const materialRepo=createMaterialStocktakeRepository(deps.db);
                    if(route.path.endsWith("/material-resolve")){
                        const input=parse(z.object({uuid:z.uuidv4(),room_id:z.coerce.number().int().positive()}).strict(),req.query);
                        await repo.detail(ctx,id);
                        const target=await deps.db.selectFrom("audit_material_items").select("material_id").where("session_id","=",id).where("room_id","=",String(input.room_id)).where("uuid","=",input.uuid).executeTakeFirst();
                        if(!target)throw new DomainError("NOT_FOUND","QR Bahan tidak termasuk target lokasi ini.");
                        res.json({success:true,data:(await materialRepo.items(ctx,id,1,1,input.room_id,false,target.material_id)).data[0],meta:null});
                    }else res.json({success:true,...await materialRepo.items(ctx,id,q.page,q.per_page,q.room_id,q.hanya_selisih==="true")});
                    return;
                }
                if(["/resolve","/context","/items","/results","/findings"].some(p=>route.path.endsWith(p))&&(await repo.detail(ctx,id)).domain!=="ASET")throw new DomainError("VALIDATION_ERROR","Endpoint Aset hanya untuk sesi domain Aset.");
                if (route.path.endsWith("/resolve")) { await withTransaction(ctx, scope => requireAssignee(scope, id), deps.db); const query = parse(Resolve, req.query); const asset = await deps.db.selectFrom("audit_items").select("asset_id").where("session_id", "=", id).$if(query.uuid !== undefined, q => q.where("uuid", "=", query.uuid!)).$if(query.code !== undefined, q => q.where(sql<boolean>`lower(kode_barang) = lower(${query.code!})`)).executeTakeFirst(); if (!asset) throw new DomainError("NOT_FOUND", "Aset tidak termasuk snapshot sesi."); res.json({ success: true, data: (await repo.items(ctx, id, 1, 1, undefined, false, asset.asset_id)).data[0], meta: null }); return; }
                if (route.path.endsWith("/context")) { await withTransaction(ctx, scope => requireAssignee(scope, id), deps.db); res.json({ success: true, data: { categories: await deps.db.selectFrom("asset_categories").select(["id", "nama"]).orderBy("nama").execute() }, meta: null }); return; }
                if (route.path.endsWith("/report")) { res.json({ success: true, data: await report.download(ctx, id), meta: null }); return; }
                if (route.path.endsWith("/export")) { const output = await report.exportXlsx(ctx, id); res.type("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet").setHeader("Content-Disposition", `attachment; filename="${output.filename}"`); res.send(output.bytes); return; }
                if (route.path.endsWith("/photos")) {
                    await repo.detail(ctx, id);
                    const photos = await deps.db.selectFrom("audit_photos as p").innerJoin("stored_files as f", "f.id", "p.file_id").select(["p.file_id", "p.item_id", "p.finding_id", "f.scan_status", "f.checksum", "f.object_key", "f.thumb_key"]).where("p.session_id", "=", id).orderBy("p.id").limit(q.per_page).offset((q.page - 1) * q.per_page).execute();
                    const data = await Promise.all(photos.map(p => ({ file_id: p.file_id, item_id: p.item_id, finding_id: p.finding_id, status: p.checksum === null ? "BELUM_TERUNGGAH" : p.scan_status, url: p.checksum && p.scan_status === "CLEAN" ? deps.storage.urlUnduh(p.thumb_key ?? p.object_key, 300) : null })).map(async p => ({ ...p, url: await p.url })));
                    res.json({ success: true, data, meta: null }); return;
                }
                if (route.path.endsWith("/items")) await withTransaction(ctx, scope => requireAssignee(scope, id), deps.db);
                if (route.path.endsWith("/items") || route.path.endsWith("/results")) res.json({ success: true, ...await repo.items(ctx, id, q.page, q.per_page, q.room_id, q.hanya_selisih === "true") });
                else if (route.path.endsWith("/findings")) res.json({ success: true, ...await repo.findings(ctx, id, q.page, q.per_page) });
                else res.json({ success: true, data: await repo.detail(ctx, id), meta: null });
                return;
            }
            const body = parse(route.body!, req.body ?? {}), id = route === create ? null : parse(params, req.params).id;
            const result = await runIdempotent(deps.db, ctx, { key: req.header("Idempotency-Key") ?? "", endpoint: `${route.method} ${req.path}`, body: req.body ?? {} }, async scope => {
                let data: unknown;
                if (id === null) data = await session.create(scope, StocktakeCreateSchema.parse(body));
                else {
                    await createStocktakeRepository(scope.tx).detail(ctx, id);
                    if(route.path.endsWith("/material-counts"))data=await new MaterialStocktakeService(deps.clock,deps.audit).count(scope,id,MaterialStocktakeCountSchema.parse(body));
                    else if(route.path.includes("/material-items/")&&route.path.endsWith("/reconcile")){const b=MaterialStocktakeNoteSchema.parse(body);await new MaterialStocktakeService(deps.clock,deps.audit).note(scope,id,parse(itemParams,req.params).itemId,b.keterangan,b.revision);}
                    else if (route.path.endsWith("/scan")) data = await scan.record(scope, id, StocktakeScanSchema.parse(body));
                    else if (route.path.endsWith("/findings")) data = await scan.record(scope, id, StocktakeFindingSchema.parse(body));
                    else if (route.path.endsWith("/complete-location")) await scan.completeLocation(scope, id, Room.parse(body).room_id);
                    else if (route.path.endsWith("/finalize")) await recon.finalize(scope, id);
                    else if (route.path.endsWith("/submit")) await recon.submit(scope, id);
                    else if (route.path.endsWith("/approve")) { const d = Decision.parse(body); await recon.decide(scope, id, d.keputusan, d.catatan); }
                    else if (route.path.endsWith("/cancel")) await session.cancel(scope, id, StocktakeReasonSchema.parse(body).alasan);
                    else if (route.path.endsWith("/reconcile")) await recon.reconcile(scope, id, parse(itemParams, req.params).itemId, StocktakeReconcileSchema.parse(body));
                    else if (route.path.endsWith("/retry")) await report.retry(scope, id);
                    else if (route.path.endsWith("/remove")) await scan.removeFailedPhoto(scope, id, parse(itemParams, req.params).itemId, StocktakeReasonSchema.parse(body).alasan);
                    else await recon.reviewFinding(scope, id, parse(itemParams, req.params).itemId, StocktakeFindingReviewSchema.parse(body));
                    data ??= await createStocktakeRepository(scope.tx).detail(ctx, id);
                }
                return { statusCode: id === null ? 201 : 200, body: { success: true, data, meta: null } };
            });
            res.status(result.statusCode).json(result.body);
        };
        if (route.method === "GET") router.get(route.path, limit(route), authorize(route.permission!), handler);
        else if (route.method === "PUT") router.put(route.path, limit(route), authorize(route.permission!), handler);
        else router.post(route.path, limit(route), authorize(route.permission!), handler);
    }
    return router;
}
