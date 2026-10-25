import { sql } from "kysely";
import { DisposalCandidateSchema, DisposalSummarySchema, DisposalDetailSchema } from "@sigm4/schemas";
import type { DisposalQuerySchema, DisposalCandidate } from "@sigm4/schemas";
import type { z } from "zod";
import type { AuthContext } from "../../../shared/auth/index.js";
import { BaseRepository, defineRepository } from "../../../shared/db/index.js";
import type { QueryExecutor, TransactionScope } from "../../../shared/db/index.js";
import type { PenyimpananObjek } from "../../../shared/storage/index.js";
import { NotFoundError } from "../../../shared/errors/index.js";
import { disposalWarrantyFacts } from "../../m06-documents/index.js";
import { disposalMaintenanceFacts, disposalCandidatePredicate } from "../../m12-maintenance/index.js";
import { disposalLossSession } from "../../m13-audit-stocktake/index.js";
import { dateColumn, disposalBlockers, wibDate } from "../access.js";
type Query = z.infer<typeof DisposalQuerySchema>;
const iso = (d: Date | null) => d?.toISOString() ?? null;
const meta = (page: number, size: number, total: number) => ({ page, per_page: size, total, total_pages: Math.max(1, Math.ceil(total / size)) });
export function maskDisposalCandidate(ctx: AuthContext, value: DisposalCandidate) {
    return { ...value, nilai_perolehan: ctx.can("asset.view_financial") ? value.nilai_perolehan : null, biaya_pemeliharaan: ctx.can("maintenance.view_cost") && ctx.scopeOf("maintenance.view_cost") === "all" ? value.biaya_pemeliharaan : null };
}
export class DisposalRepository extends BaseRepository {
    constructor(private readonly source: QueryExecutor) { super(source); }
    private visible(ctx: AuthContext) {
        const all = ["disposal.view", "disposal.approve", "disposal.execute"].some(p => ctx.can(p) && ctx.scopeOf(p) === "all");
        return this.query(ctx).selectFrom("asset_disposals as d").$if(!all, q => q.where("d.pengusul_id", "=", String(ctx.userId)));
    }
    async lock(ctx: AuthContext, id: string) {
        const r = await this.visible(ctx).selectAll("d").where("d.id", "=", id).forUpdate().executeTakeFirst(); if (!r) throw new NotFoundError("Usulan penghapusan tidak ditemukan."); return r;
    }
    async candidate(ctx: AuthContext, scope: TransactionScope, id: string, now: Date, owner?: string, raw = false) {
        const a = await this.query(scope.ctx).selectFrom("assets as a").innerJoin("asset_categories as c", "c.id", "a.category_id").innerJoin("rooms as r", "r.id", "a.room_id").select(["a.id", "a.uuid", "a.kode_barang", "a.nama", "a.category_id", "c.nama as kategori", "c.umur_teknis_tahun", "a.room_id", "r.nama as lokasi", "a.kondisi", "a.tahun_perolehan", "a.nilai_perolehan"]).where("a.id", "=", id).where("a.dihapuskan", "=", false).executeTakeFirst();
        if (!a) throw new NotFoundError("Aset aktif tidak ditemukan.");
        const [maintenance, loss, warranty, blockers] = await Promise.all([disposalMaintenanceFacts(this.source, id), disposalLossSession(this.source, id), disposalWarrantyFacts(this.source, ctx, id, wibDate(now)), disposalBlockers(scope, [id], now, owner)]);
        const result = DisposalCandidateSchema.parse({ ...a, umur_tahun: Math.max(0, Number(wibDate(now).slice(0, 4)) - a.tahun_perolehan), umur_teknis: a.umur_teknis_tahun, biaya_pemeliharaan: maintenance.cost, jumlah_work_order: maintenance.count, rekomendasi_penggantian: maintenance.recommended, work_order_id: maintenance.work_order_id, loss_session_id: loss, garansi: warranty, penghalang: blockers.get(id)! });
        return raw ? result : maskDisposalCandidate(scope.ctx, result);
    }
    async candidates(ctx: AuthContext, scope: TransactionScope, q: Query, now: Date) {
        const query = this.query(scope.ctx).selectFrom("assets as a").where("a.dihapuskan", "=", false).where(disposalCandidatePredicate("a"))
            .$if(q.asset_id !== undefined, b => b.where("a.id", "=", String(q.asset_id)))
            .$if(q.category_id !== undefined, b => b.where("a.category_id", "=", String(q.category_id)))
            .$if(q.room_id !== undefined, b => b.where("a.room_id", "=", String(q.room_id)))
            .$if(!!q.q, b => b.where(e => e.or([e("a.nama", "ilike", `%${q.q!}%`), e("a.kode_barang", "ilike", `%${q.q!}%`)])));
        const count = await query.select(e => e.fn.countAll<string>().as("n")).executeTakeFirstOrThrow();
        const ids = await query.select("a.id").orderBy("a.id").offset((q.page - 1) * q.per_page).limit(q.per_page).execute();
        const candidates = []; for (const a of ids) { const c = await this.candidate(ctx, scope, a.id, now); if (["RUSAK_BERAT", "HILANG"].includes(c.kondisi) || c.rekomendasi_penggantian) candidates.push(c); }
        return { data: candidates, meta: meta(q.page, q.per_page, Number(count.n)) };
    }
    async items(ctx: AuthContext, id: string) {
        return this.query(ctx).selectFrom("asset_disposal_items as i").innerJoin("assets as a", "a.id", "i.asset_id").selectAll("i").select(["a.kondisi as kondisi_sekarang", "a.room_id as room_id_sekarang", "a.dihapuskan"]).where("i.disposal_id", "=", id).orderBy("i.asset_id").execute();
    }
    private filtered(ctx: AuthContext, q: Query) {
        return this.visible(ctx).$if(q.tab === "ARSIP", b => b.where("d.status", "=", "SELESAI"))
            .$if(q.status !== undefined, b => b.where("d.status", "=", q.status!)).$if(q.alasan !== undefined, b => b.where("d.alasan", "=", q.alasan!))
            .$if(q.tahun !== undefined, b => b.where(sql<boolean>`extract(year from coalesce(d.tanggal_pelaksanaan,d.created_at AT TIME ZONE 'Asia/Jakarta'))=${q.tahun}`))
            .$if(q.dari !== undefined, b => b.where(sql<boolean>`coalesce(d.tanggal_pelaksanaan,(d.created_at AT TIME ZONE 'Asia/Jakarta')::date)>=${q.dari}::date`))
            .$if(q.sampai !== undefined, b => b.where(sql<boolean>`coalesce(d.tanggal_pelaksanaan,(d.created_at AT TIME ZONE 'Asia/Jakarta')::date)<=${q.sampai}::date`))
            .$if(!!q.q || q.category_id !== undefined || q.room_id !== undefined || q.asset_id !== undefined, b => b.where(e => e.exists(e.selectFrom("asset_disposal_items as f").select("f.id").whereRef("f.disposal_id", "=", "d.id")
                .$if(q.tab === "ARSIP", b => b.where("f.executed_at", "is not", null))
                .$if(!!q.q, b => b.where(sql<boolean>`(f.snapshot->>'kode_barang' ILIKE ${`%${q.q!}%`} OR f.snapshot->>'nama' ILIKE ${`%${q.q!}%`} OR d.nomor ILIKE ${`%${q.q!}%`})`))
                .$if(q.category_id !== undefined, b => b.where(sql<boolean>`f.snapshot->>'category_id'=${String(q.category_id)}`))
                .$if(q.room_id !== undefined, b => b.where(sql<boolean>`f.snapshot->>'room_id'=${String(q.room_id)}`))
                .$if(q.asset_id !== undefined, b => b.where("f.asset_id", "=", String(q.asset_id))))));
    }
    async summary(ctx: AuthContext, id: string) {
        const r = await this.visible(ctx).innerJoin("users as u", "u.id", "d.pengusul_id").leftJoin("users as executor", "executor.id", "d.dilaksanakan_oleh").selectAll("d").select(["u.nama as pengusul", "executor.nama as pelaksana", dateColumn("d.tanggal_pelaksanaan").as("tanggal_pelaksanaan"), sql<number>`(select count(*)::int from asset_disposal_items i where i.disposal_id=d.id)`.as("jumlah_aset"), sql<number>`(select count(*)::int from asset_disposal_items i where i.disposal_id=d.id and i.disetujui)`.as("jumlah_disetujui")]).where("d.id", "=", id).executeTakeFirst();
        if (!r) throw new NotFoundError("Usulan penghapusan tidak ditemukan.");
        return DisposalSummarySchema.parse({ ...r, total_nilai: ctx.can("asset.view_financial") ? r.total_nilai : null, disetujui_pada: iso(r.disetujui_pada), created_at: r.created_at.toISOString() });
    }
    async list(ctx: AuthContext, q: Query) {
        const query = this.filtered(ctx, q), count = await query.select(e => e.fn.countAll<string>().as("n")).executeTakeFirstOrThrow(), rows = await query.select("d.id").orderBy("d.id", "desc").offset((q.page - 1) * q.per_page).limit(q.per_page).execute();
        const totals = await query.innerJoin("asset_disposal_items as i", "i.disposal_id", "d.id")
            .$if(q.category_id !== undefined, b => b.where(sql<boolean>`i.snapshot->>'category_id'=${String(q.category_id)}`))
            .$if(q.room_id !== undefined, b => b.where(sql<boolean>`i.snapshot->>'room_id'=${String(q.room_id)}`))
            .$if(q.asset_id !== undefined, b => b.where("i.asset_id", "=", String(q.asset_id)))
            .$if(!!q.q, b => b.where(sql<boolean>`(i.snapshot->>'kode_barang' ILIKE ${`%${q.q!}%`} OR i.snapshot->>'nama' ILIKE ${`%${q.q!}%`} OR d.nomor ILIKE ${`%${q.q!}%`})`))
            .select([sql<number>`count(*) filter(where i.executed_at IS NOT NULL)::int`.as("unit"), sql<string>`coalesce(sum((i.snapshot->>'nilai_perolehan')::numeric) filter(where i.executed_at IS NOT NULL),0)::text`.as("nilai")]).executeTakeFirstOrThrow();
        const data = []; for (const row of rows) data.push(await this.summary(ctx, row.id));
        return { data, meta: meta(q.page, q.per_page, Number(count.n)), ringkasan: { unit: totals.unit, nilai: ctx.can("asset.view_financial") ? totals.nilai : null } };
    }
    async detail(ctx: AuthContext, id: string, storage?: PenyimpananObjek) {
        const summary = await this.summary(ctx, id), items = await this.items(ctx, id);
        const files = await this.query(ctx).selectFrom("asset_disposal_files as p").innerJoin("stored_files as f", "f.id", "p.file_id").select(["p.file_id", "p.nama_berkas", "p.jenis", "f.checksum", "f.scan_status", "f.object_key"]).where("p.disposal_id", "=", id).orderBy("p.file_id").execute();
        const links = await Promise.all(files.map(async p => ({ file_id: p.file_id, nama_berkas: p.nama_berkas, jenis: p.jenis, status: p.checksum ? p.scan_status : "BELUM_TERUNGGAH", url: storage && p.checksum && p.scan_status === "CLEAN" ? await storage.urlUnduh(p.object_key, 300) : null })));
        return DisposalDetailSchema.parse({ ...summary, items: items.map(i => ({ ...i, snapshot: maskDisposalCandidate(ctx, DisposalCandidateSchema.parse(i.snapshot)), executed_at: iso(i.executed_at), reinstated_at: iso(i.reinstated_at) })), lampiran: links.filter(f => f.jenis !== "FOTO_PELAKSANAAN"), foto_pelaksanaan: links.filter(f => f.jenis === "FOTO_PELAKSANAAN") });
    }
}
export const createDisposalRepository = (db: QueryExecutor) => defineRepository(new DisposalRepository(db));
