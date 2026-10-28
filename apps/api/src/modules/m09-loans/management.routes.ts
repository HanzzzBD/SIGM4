import express from "express";
import type { RequestHandler } from "express";
import type { Kysely } from "kysely";
import type { ZodType } from "zod";
import { z } from "zod";
import { LoanExtensionContextResponseSchema, LoanFilterOptionsResponseSchema, LoanIdSchema, LoanListQuerySchema, FineListQuerySchema, LoanListResponseSchema, FineListResponseSchema, FineDetailResponseSchema, LoanExtendBodySchema, LoanExtensionResponseSchema, FinePayBodySchema, FineWaiveBodySchema, CompensationWaiveBodySchema, FineMutationResponseSchema, CompensationProposalBodySchema, CompensationProposalResponseSchema, CompensationDecisionBodySchema, CompensationProposalParamsSchema, LoanExportQuerySchema, FineExportQuerySchema } from "@sigm4/schemas";
import type { Database, TransactionScope } from "../../shared/db/index.js";
import { withTransaction } from "../../shared/db/index.js";
import type { Clock } from "../../shared/clock/index.js";
import type { AuditLogger } from "../../shared/audit/index.js";
import type { PembangkitPdf } from "../../shared/pdf/index.js";
import { requireAuthContext } from "../../shared/auth/index.js";
import { defineRoute, runIdempotent } from "../../shared/http/index.js";
import type { RouteDefinition } from "../../shared/http/index.js";
import { ApprovalService, HistoryService } from "../m10-approval/index.js";
import { createLoanRepository } from "./repositories/loan.repository.js";
import { extensionRow } from "./services/extension.service.js";
import { DomainError, NotFoundError, ForbiddenError } from "../../shared/errors/index.js";
import { listLoans, listFines } from "./services/monitoring.service.js";
import { fineDetail, changeFine, proposeCompensation, decideCompensation } from "./services/fine-management.service.js";
import { requestExtension } from "./services/extension.service.js";
import { registerLoans } from "./registration.js";
import { createManagementRepository } from "./repositories/management.repository.js";
import { exportLoans } from "./services/export.service.js";

const base = { module: "m09-loans", rateLimitClass: "default" as const };
export const listLoansRoute = defineRoute({ ...base, method: "GET", path: "/loans", permission: "loan.view", query: LoanListQuerySchema, response: LoanListResponseSchema, summary: "Daftar peminjaman dan estimasi berjalan tersaring scope" });
export const listFinesRoute = defineRoute({ ...base, method: "GET", path: "/fines", permission: "fine.view", query: FineListQuerySchema, response: FineListResponseSchema, summary: "Daftar kewajiban per unit tersaring scope" });
export const detailFineRoute = defineRoute({ ...base, method: "GET", path: "/fines/{id}", permission: "fine.view", params: LoanIdSchema, response: FineDetailResponseSchema, summary: "Rincian dan riwayat kewajiban" });
export const extendLoanRoute = defineRoute({ ...base, method: "POST", path: "/loans/{id}/extend", permission: "loan.extend", params: LoanIdSchema, body: LoanExtendBodySchema, response: LoanExtensionResponseSchema, summary: "Ajukan perpanjangan melalui approval" });
export const payFineRoute = defineRoute({ ...base, method: "PATCH", path: "/fines/{id}/pay", permission: "fine.manage", params: LoanIdSchema, body: FinePayBodySchema, response: FineMutationResponseSchema, summary: "Catat pembayaran luring" });
export const waiveFineRoute = defineRoute({ ...base, method: "PATCH", path: "/fines/{id}/waive", permission: "fine.waive", params: LoanIdSchema, body: FineWaiveBodySchema, response: FineMutationResponseSchema, summary: "Bebaskan denda keterlambatan beralasan" });
export const waiveCompensationRoute = defineRoute({ ...base, method: "PATCH", path: "/fines/{id}/waive-compensation", permission: "fine.waive_compensation", params: LoanIdSchema, body: CompensationWaiveBodySchema, response: FineMutationResponseSchema, summary: "Pimpinan membebaskan ganti rugi penuh/sebagian" });
export const reopenFineRoute = defineRoute({ ...base, method: "PATCH", path: "/fines/{id}/reopen", permission: "fine.manage", params: LoanIdSchema, body: FineWaiveBodySchema, response: FineMutationResponseSchema, summary: "Administrator mengoreksi status lunas beralasan" });
export const proposeCompensationRoute = defineRoute({ ...base, method: "POST", path: "/fines/{id}/replacement-proposals", permission: "fine.manage", params: LoanIdSchema, body: CompensationProposalBodySchema, response: CompensationProposalResponseSchema, summary: "Usulkan nilai ganti rugi menunggu penetapan" });
export const decideCompensationRoute = defineRoute({ ...base, method: "POST", path: "/fines/{id}/replacement-proposals/{proposalId}/decide", permission: "approval.decide", params: CompensationProposalParamsSchema, body: CompensationDecisionBodySchema, response: CompensationProposalResponseSchema, summary: "Pimpinan memutus usulan nilai penggantian" });
export const exportLoansRoute = defineRoute({ ...base, rateLimitClass: "export", method: "GET", path: "/loans/export", permission: "report.export", query: LoanExportQuerySchema, response: z.string(), contentType: "application/octet-stream", summary: "Ekspor XLSX/PDF peminjaman tersaring scope" });
export const exportFinesRoute = defineRoute({ ...base, rateLimitClass: "export", method: "GET", path: "/fines/export", permission: "report.export", query: FineExportQuerySchema, response: z.string(), contentType: "application/octet-stream", summary: "Ekspor XLSX/PDF kewajiban tersaring scope" });
export const loanFiltersRoute = defineRoute({ ...base, method: "GET", path: "/loans/filter-options", permission: "loan.view", response: LoanFilterOptionsResponseSchema, summary: "Pilihan saringan peminjaman tersaring scope" });
export const fineFiltersRoute = defineRoute({ ...base, method: "GET", path: "/fines/filter-options", permission: "fine.view", response: LoanFilterOptionsResponseSchema, summary: "Pilihan saringan kewajiban tersaring scope" });
export const loanExtensionContextRoute = defineRoute({ ...base, method: "GET", path: "/loan-extensions/{id}", permission: "approval.view", params: LoanIdSchema, response: LoanExtensionContextResponseSchema, summary: "Konteks perpanjangan bagi pembaca instance yang berwenang" });
export const loanManagementRoutes = [loanExtensionContextRoute, loanFiltersRoute, fineFiltersRoute, listLoansRoute, listFinesRoute, detailFineRoute, extendLoanRoute, payFineRoute, waiveFineRoute, waiveCompensationRoute, reopenFineRoute, proposeCompensationRoute, decideCompensationRoute, exportLoansRoute, exportFinesRoute];

function parseBody<T>(schema: ZodType<T>, value: unknown): T { const r = schema.safeParse(value); if (!r.success) throw new DomainError("VALIDATION_ERROR", "Isian tidak sah.", { errors: r.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })) }); return r.data; }
export function loanManagementRouter(deps: { db: Kysely<Database>; clock: Clock; audit: AuditLogger; pdf: PembangkitPdf }, limiter: (r: RouteDefinition) => RequestHandler, authorize: (p: string) => RequestHandler) {
 const router = express.Router(); registerLoans(deps.clock, deps.audit); const url = (r: RouteDefinition) => r.path.replace(/\{(\w+)\}/g, ":$1");
 const tx = <T>(res: express.Response, run: (scope: TransactionScope) => Promise<T>) => withTransaction(requireAuthContext(res), run, deps.db);
 const read = (data: unknown, res: express.Response) => { res.setHeader("Cache-Control", "no-store"); res.json({ success: true, data, meta: null }); };
 router.get(url(loanExtensionContextRoute), limiter(loanExtensionContextRoute), authorize("approval.view"), async (req, res) => {
  const ctx = requireAuthContext(res), p = LoanIdSchema.parse(req.params), repo = createManagementRepository(deps.db), ext = await repo.extension(ctx, p.id);
  if (!ext || ext.approval_instance_id === null) throw ctx.scopeOf("approval.view") === "all" ? new NotFoundError() : new ForbiddenError();
  await new HistoryService(deps.db, deps.clock, new ApprovalService(deps.db, deps.audit, deps.clock)).linimasa(ctx, Number(ext.approval_instance_id));
  const l = await repo.loan(ctx, Number(ext.loan_id)); if (!l) throw new NotFoundError();
  const units = await createLoanRepository(deps.db).items(ctx, l.id);
  read({ pengajuan: extensionRow(ext), peminjaman: { id: l.id, nomor: l.nomor, peminjam: l.peminjam_nama, role: l.role, jatuh_tempo: l.tanggal_jatuh_tempo.toISOString(), unit: units.map((i) => ({ kode_barang: i.kode_barang, nama: i.nama, kondisi_awal: i.kondisi_awal, status_kembali: i.status_kembali })) } }, res);
 });
 router.get("/loans", limiter(listLoansRoute), authorize("loan.view"), async (req, res) => { const filter = LoanListQuerySchema.parse(req.query); res.setHeader("Cache-Control", "no-store"); res.json({ success: true, ...await tx(res, (s) => listLoans(s, filter, deps.clock)) }); });
 router.get("/fines", limiter(listFinesRoute), authorize("fine.view"), async (req, res) => { const filter = FineListQuerySchema.parse(req.query); res.setHeader("Cache-Control", "no-store"); res.json({ success: true, ...await tx(res, (s) => listFines(s, filter)) }); });
 for (const route of [exportLoansRoute, exportFinesRoute]) router.get(url(route), limiter(route), authorize("report.export"), async (req, res) => { const kind = route === exportLoansRoute ? "loans" : "fines", filter = kind === "loans" ? LoanExportQuerySchema.parse(req.query) : FineExportQuerySchema.parse(req.query); const bytes = await tx(res, (s) => exportLoans(s, kind, filter, filter.format, deps.clock, deps.audit, deps.pdf)); res.setHeader("Cache-Control", "no-store"); res.setHeader("Content-Disposition", `attachment; filename="${kind}.${filter.format}"`); res.type(filter.format === "xlsx" ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "application/pdf").send(bytes); });
 for (const [route, kind] of [[loanFiltersRoute, "loans"], [fineFiltersRoute, "fines"]] as const) router.get(url(route), limiter(route), authorize(route.permission), async (_req, res) => read(await createManagementRepository(deps.db).filterOptions(requireAuthContext(res), kind), res));
 router.get(url(detailFineRoute), limiter(detailFineRoute), authorize("fine.view"), async (req, res) => { const p = LoanIdSchema.parse(req.params); read(await tx(res, (s) => fineDetail(s, p.id, deps.clock)), res); });
 router.post(url(extendLoanRoute), limiter(extendLoanRoute), authorize("loan.extend"), async (req, res) => { const p = LoanIdSchema.parse(req.params), body = parseBody(LoanExtendBodySchema, req.body); const result = await runIdempotent(deps.db, requireAuthContext(res), { key: req.header("Idempotency-Key") ?? "", endpoint: `POST /loans/${p.id}/extend`, body: req.body }, async (s) => ({ statusCode: 201, body: { success: true, data: await requestExtension(s, p.id, body, deps.clock, deps.audit), meta: null } })); res.status(result.statusCode).json(result.body); });
 for (const [route, action] of [[payFineRoute, "pay"], [waiveFineRoute, "waive"], [waiveCompensationRoute, "waive-compensation"], [reopenFineRoute, "reopen"]] as const) router.patch(url(route), limiter(route), authorize(route.permission), async (req, res) => { const p = LoanIdSchema.parse(req.params), body = action === "pay" ? parseBody(FinePayBodySchema, req.body) : action === "waive-compensation" ? parseBody(CompensationWaiveBodySchema, req.body) : parseBody(FineWaiveBodySchema, req.body); const result = await runIdempotent(deps.db, requireAuthContext(res), { key: req.header("Idempotency-Key") ?? "", endpoint: `PATCH /fines/${p.id}/${action}`, body: req.body }, async (s) => ({ statusCode: 200, body: { success: true, data: await changeFine(s, p.id, action, body, deps.clock, deps.audit), meta: null } })); res.status(result.statusCode).json(result.body); });
 router.post(url(proposeCompensationRoute), limiter(proposeCompensationRoute), authorize("fine.manage"), async (req, res) => { const p = LoanIdSchema.parse(req.params), body = parseBody(CompensationProposalBodySchema, req.body); const result = await runIdempotent(deps.db, requireAuthContext(res), { key: req.header("Idempotency-Key") ?? "", endpoint: `POST /fines/${p.id}/replacement-proposals`, body: req.body }, async (s) => ({ statusCode: 201, body: { success: true, data: await proposeCompensation(s, p.id, body, deps.clock, deps.audit), meta: null } })); res.status(result.statusCode).json(result.body); });
 router.post(url(decideCompensationRoute), limiter(decideCompensationRoute), authorize("approval.decide"), async (req, res) => { const p = CompensationProposalParamsSchema.parse(req.params), body = parseBody(CompensationDecisionBodySchema, req.body); const result = await runIdempotent(deps.db, requireAuthContext(res), { key: req.header("Idempotency-Key") ?? "", endpoint: `POST /fines/${p.id}/replacement-proposals/${p.proposalId}/decide`, body: req.body }, async (s) => ({ statusCode: 200, body: { success: true, data: await decideCompensation(s, p.id, p.proposalId, body, deps.clock, deps.audit), meta: null } })); res.status(result.statusCode).json(result.body); });
 return router;
}
