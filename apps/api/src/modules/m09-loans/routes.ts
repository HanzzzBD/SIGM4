import express from "express";
import type { ZodType } from "zod";
import { LoanResolveQuerySchema, LoanResolvedUnitResponseSchema, LoanBorrowerQuerySchema, LoanBorrowersResponseSchema } from "@sigm4/schemas";
import type { RequestHandler } from "express";
import type { Kysely } from "kysely";
import { LoanCheckoutBodySchema, LoanCheckinBodySchema, LoanDetailResponseSchema, LoanResultResponseSchema, LoanCheckinPreviewResponseSchema, LoanIdSchema, LoanUuidSchema, LoanPageQuerySchema, ReadyCheckoutResponseSchema } from "@sigm4/schemas";
import type { Database } from "../../shared/db/index.js";
import { withTransaction } from "../../shared/db/index.js";
import type { Clock } from "../../shared/clock/index.js";
import type { AuditLogger } from "../../shared/audit/index.js";
import type { PenyimpananObjek } from "../../shared/storage/index.js";
import { requireAuthContext } from "../../shared/auth/index.js";
import { defineRoute, runIdempotent } from "../../shared/http/index.js";
import type { RouteDefinition } from "../../shared/http/index.js";
import { DomainError, NotFoundError } from "../../shared/errors/index.js";
import { checkoutLoan } from "./services/checkout.service.js";
import { checkinLoan, previewLoanReturn } from "./services/checkin.service.js";
import { loanDetail, readyCheckout } from "./services/query.service.js";
import { createLoanRepository } from "./repositories/loan.repository.js";
import { registerLoanTimeline } from "./services/timeline-source.js";

const module = "m09-loans";
function parseBody<T>(schema: ZodType<T>, body: unknown): T {
    const result = schema.safeParse(body);
    if (!result.success) throw new DomainError("VALIDATION_ERROR", "Isian peminjaman tidak sah.", { errors: result.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })) });
    return result.data;
}
export const readyCheckoutRoute = defineRoute({ module, method: "GET", path: "/loans/ready-checkout", permission: "loan.manage", rateLimitClass: "default", query: LoanPageQuerySchema, response: ReadyCheckoutResponseSchema, summary: "Antrean reservasi aset siap diserahkan hari ini (FR-09.1)" });
export const loanResolveRoute = defineRoute({ module, method: "GET", path: "/loans/units/resolve", permission: "loan.manage", rateLimitClass: "default", query: LoanResolveQuerySchema, response: LoanResolvedUnitResponseSchema, summary: "Verifikasi kode atau UUID unit tanpa data finansial" });
export const loanBorrowersRoute = defineRoute({ module, method: "GET", path: "/loans/borrowers", permission: "loan.manage", rateLimitClass: "default", query: LoanBorrowerQuerySchema, response: LoanBorrowersResponseSchema, summary: "Pemilih peminjam aktif untuk serah terima langsung" });
export const loanByAssetRoute = defineRoute({ module, method: "GET", path: "/loans/by-asset/{uuid}", permission: "loan.manage", rateLimitClass: "default", params: LoanUuidSchema, response: LoanDetailResponseSchema, summary: "Peminjaman aktif atas QR unit" });
export const checkoutRoute = defineRoute({ module, method: "POST", path: "/loans/checkout", permission: "loan.manage", rateLimitClass: "default", body: LoanCheckoutBodySchema, response: LoanResultResponseSchema, summary: "Serah terima aset dan bukti digital idempoten" });
export const loanDetailRoute = defineRoute({ module, method: "GET", path: "/loans/{id}", permission: "loan.view", rateLimitClass: "default", params: LoanIdSchema, response: LoanDetailResponseSchema, summary: "Detail peminjaman, bukti privat dan kewajiban per unit" });
export const checkinPreviewRoute = defineRoute({ module, method: "POST", path: "/loans/{id}/checkin/preview", permission: "loan.manage", rateLimitClass: "default", params: LoanIdSchema, body: LoanCheckinBodySchema, response: LoanCheckinPreviewResponseSchema, summary: "Tinjauan pengembalian dan kewajiban tanpa menyimpan" });
export const checkinRoute = defineRoute({ module, method: "POST", path: "/loans/{id}/checkin", permission: "loan.manage", rateLimitClass: "default", params: LoanIdSchema, body: LoanCheckinBodySchema, response: LoanResultResponseSchema, summary: "Pengembalian sebagian/penuh dan pelepasan slot atomik" });
export function loansRouter(deps: { db: Kysely<Database>; clock: Clock; audit: AuditLogger; storage: PenyimpananObjek }, limiter: (route: RouteDefinition) => RequestHandler, authorize: (permission: string) => RequestHandler) {
    const router = express.Router();
    registerLoanTimeline();
    const url = (route: RouteDefinition) => route.path.replace(/\{(\w+)\}/g, ":$1");
    router.get(url(loanResolveRoute), limiter(loanResolveRoute), authorize("loan.manage"), async (req, res) => { const p = LoanResolveQuerySchema.parse(req.query); const row = await createLoanRepository(deps.db).resolveUnit(requireAuthContext(res), p.code); if (!row) throw new NotFoundError("Kode unit tidak ditemukan."); const { status, dapat_dipinjam, dihapuskan, ...identity } = row; res.setHeader("Cache-Control", "no-store"); res.json({ success: true, data: { ...identity, layak: !dihapuskan && dapat_dipinjam && ["BAIK", "RUSAK_RINGAN"].includes(identity.kondisi) && !["DIPINJAM", "DALAM_PERBAIKAN", "TIDAK_TERSEDIA"].includes(status) }, meta: null }); });
    router.get(url(loanBorrowersRoute), limiter(loanBorrowersRoute), authorize("loan.manage"), async (req, res) => { const p = LoanBorrowerQuerySchema.parse(req.query); const rows = await createLoanRepository(deps.db).borrowers(requireAuthContext(res), p.q, p.page), total = Number(rows[0]?.total ?? 0); res.setHeader("Cache-Control", "no-store"); res.json({ success: true, data: rows.map(({ id, nama, role }) => ({ id, nama, role })), meta: { page: p.page, per_page: 25, total, total_pages: Math.max(1, Math.ceil(total / 25)) } }); });
    router.get(url(readyCheckoutRoute), limiter(readyCheckoutRoute), authorize("loan.manage"), async (req, res) => { const q = LoanPageQuerySchema.parse(req.query); const result = await withTransaction(requireAuthContext(res), (scope) => readyCheckout(scope, deps.clock, q.page, q.per_page, q.reservation_id), deps.db); res.setHeader("Cache-Control", "no-store"); res.json({ success: true, ...result }); });
    router.get(url(loanByAssetRoute), limiter(loanByAssetRoute), authorize("loan.manage"), async (req, res) => { const p = LoanUuidSchema.parse(req.params); const data = await withTransaction(requireAuthContext(res), async (scope) => { const found = await createLoanRepository(scope.tx).byAsset(scope.ctx, p.uuid); if (!found) throw new NotFoundError(); return loanDetail(scope, Number(found.id), deps.storage, deps.clock, true); }, deps.db); res.setHeader("Cache-Control", "no-store"); res.json({ success: true, data, meta: null }); });
    router.post(url(checkoutRoute), limiter(checkoutRoute), authorize("loan.manage"), async (req, res) => { const body = parseBody(LoanCheckoutBodySchema, req.body); const result = await runIdempotent(deps.db, requireAuthContext(res), { key: req.header("Idempotency-Key") ?? "", endpoint: "POST /loans/checkout", body: req.body }, async (scope) => ({ statusCode: 201, body: { success: true, data: await checkoutLoan(scope, body, deps.clock, deps.audit), meta: null } })); res.status(result.statusCode).json(result.body); });
    router.get(url(loanDetailRoute), limiter(loanDetailRoute), authorize("loan.view"), async (req, res) => { const p = LoanIdSchema.parse(req.params); const data = await withTransaction(requireAuthContext(res), (scope) => loanDetail(scope, p.id, deps.storage, deps.clock), deps.db); res.setHeader("Cache-Control", "no-store"); res.json({ success: true, data, meta: null }); });
    router.post(url(checkinPreviewRoute), limiter(checkinPreviewRoute), authorize("loan.manage"), async (req, res) => { const p = LoanIdSchema.parse(req.params), body = parseBody(LoanCheckinBodySchema, req.body); const data = await withTransaction(requireAuthContext(res), (scope) => previewLoanReturn(scope, p.id, body, deps.clock), deps.db); res.json({ success: true, data, meta: null }); });
    router.post(url(checkinRoute), limiter(checkinRoute), authorize("loan.manage"), async (req, res) => { const p = LoanIdSchema.parse(req.params), body = parseBody(LoanCheckinBodySchema, req.body); const result = await runIdempotent(deps.db, requireAuthContext(res), { key: req.header("Idempotency-Key") ?? "", endpoint: `POST /loans/${p.id}/checkin`, body: req.body }, async (scope) => ({ statusCode: 200, body: { success: true, data: await checkinLoan(scope, p.id, body, deps.clock, deps.audit), meta: null } })); res.status(result.statusCode).json(result.body); });
    return router;
}
