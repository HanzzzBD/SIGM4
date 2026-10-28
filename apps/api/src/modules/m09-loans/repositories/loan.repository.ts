import { sql } from "kysely";
import type { Insertable, Selectable } from "kysely";
import type { AuthContext } from "../../../shared/auth/index.js";
import { BaseRepository, defineRepository } from "../../../shared/db/index.js";
import type { Database, QueryExecutor } from "../../../shared/db/index.js";
import { DomainError } from "../../../shared/errors/index.js";
import { adaSlotAsetTerkonfirmasi } from "../../../shared/booking/index.js";

// SDD-AVL-11: adapter tulis LoanService; seluruh perubahan status aset melalui pemilik ini.
class LoanRepository extends BaseRepository {
    constructor(db: QueryExecutor) { super(db); }
    async settings(ctx: AuthContext) {
        const rows = await this.query(ctx).selectFrom("system_settings").select(["key", "value"]).where("kelompok", "in", ["DENDA", "RESERVASI"]).execute();
        return new Map(rows.map((r) => [r.key, r.value]));
    }
    async reservationLinks(ctx: AuthContext, ids: readonly string[]) {
        let query = this.query(ctx).selectFrom("loans").select(["id", "nomor", "reservation_id"]).where("reservation_id", "in", [...ids]);
        if (ctx.scopeOf("loan.view") !== "all") query = query.where("peminjam_id", "=", String(ctx.userId));
        return query.orderBy("id").execute();
    }
    async borrower(ctx: AuthContext, id: number) {
        return this.query(ctx).selectFrom("users as u").innerJoin("roles as r", "r.id", "u.role_id").select(["u.id", "u.nama", "u.status", "r.kode as role"]).where("u.id", "=", String(id)).forUpdate("u").executeTakeFirst();
    }
    async reservationItems(ctx: AuthContext, id: number) {
        return this.query(ctx).selectFrom("reservation_items").select(["asset_id", "confirmed_at"]).where("reservation_id", "=", String(id)).orderBy("asset_id").execute();
    }
    async lockAssets(ctx: AuthContext, ids: readonly number[]) {
        try { return await this.query(ctx).selectFrom("assets").selectAll().where("id", "in", [...new Set(ids)].map(String)).orderBy("id").forUpdate().noWait().execute(); }
        catch (error) { if ((error as { code?: string }).code === "55P03") throw new DomainError("ASSET_NOT_AVAILABLE", "Unit sedang diproses transaksi lain."); throw error; }
    }
    async activeItems(ctx: AuthContext, ids: readonly number[]) {
        return this.query(ctx).selectFrom("loan_items").select("asset_id").where("asset_id", "in", ids.map(String)).where("status_kembali", "=", "BELUM_KEMBALI").execute();
    }
    async createLoan(ctx: AuthContext, input: Insertable<Database["loans"]>) {
        return (await this.query(ctx).insertInto("loans").values(input).returningAll().executeTakeFirstOrThrow());
    }
    async createItem(ctx: AuthContext, input: Insertable<Database["loan_items"]>) {
        return (await this.query(ctx).insertInto("loan_items").values(input).returning("id").executeTakeFirstOrThrow()).id;
    }
    async photos(ctx: AuthContext, item: string, phase: "AWAL" | "AKHIR", ids: readonly number[]) {
        await this.query(ctx).insertInto("loan_item_photos").values(ids.map((file, i) => ({ loan_item_id: item, file_id: file, tahap: phase, urutan: i + 1 }))).execute();
    }
    async setAsset(ctx: AuthContext, asset: Selectable<Database["assets"]>, condition: "BAIK" | "RUSAK_RINGAN" | "RUSAK_BERAT" | "HILANG", status: "DIPINJAM" | "TERSEDIA" | "DIRESERVASI" | "TIDAK_TERSEDIA", reason: string, loanId: string, now: Date) {
        await this.query(ctx).updateTable("assets").set({ kondisi: condition, status, updated_by: ctx.userId }).where("id", "=", asset.id).execute();
        if (condition !== asset.kondisi) await this.query(ctx).insertInto("asset_condition_history").values({ asset_id: asset.id, kondisi_lama: asset.kondisi, kondisi_baru: condition, alasan: reason, referensi_jenis: "loan", referensi_id: loanId, diubah_oleh: ctx.userId, diubah_pada: now }).execute();
    }
    private loanQuery(ctx: AuthContext, permission: "loan.view" | "loan.manage") {
        let query = this.query(ctx).selectFrom("loans as l").innerJoin("reservations as r", "r.id", "l.reservation_id").innerJoin("users as u", "u.id", "l.peminjam_id").innerJoin("users as p", "p.id", "l.petugas_serah_id").selectAll("l").select(["r.nomor as nomor_reservasi", "r.bypass_approval", "r.alasan_bypass", "u.nama as peminjam_nama", "p.nama as petugas_nama"]);
        if (ctx.scopeOf(permission) !== "all") query = query.where("l.peminjam_id", "=", String(ctx.userId));
        return query;
    }
    async loan(ctx: AuthContext, id: number, write = false) {
        const query = this.loanQuery(ctx, write ? "loan.manage" : "loan.view").where("l.id", "=", String(id));
        return write ? query.forUpdate("l").executeTakeFirst() : query.executeTakeFirst();
    }
    async loanReference(ctx: AuthContext, id: number) { return this.loanQuery(ctx, "loan.manage").where("l.id", "=", String(id)).executeTakeFirst(); }
    async confirmedNow(ctx: AuthContext, asset: number, now: Date) { return (await this.query(ctx).selectFrom("assets").select(adaSlotAsetTerkonfirmasi("assets.id", now).as("reserved")).where("id", "=", String(asset)).executeTakeFirst())?.reserved === true; }
    async byAsset(ctx: AuthContext, uuid: string) {
        let query = this.query(ctx).selectFrom("loan_items as i").innerJoin("assets as a", "a.id", "i.asset_id").innerJoin("loans as l", "l.id", "i.loan_id").select("l.id").where("a.uuid", "=", uuid).where("i.status_kembali", "=", "BELUM_KEMBALI");
        if (ctx.scopeOf("loan.manage") !== "all") query = query.where("l.peminjam_id", "=", String(ctx.userId));
        return query.executeTakeFirst();
    }
    async items(ctx: AuthContext, loan: string) {
        return this.query(ctx).selectFrom("loan_items as i").innerJoin("assets as a", "a.id", "i.asset_id").leftJoin("loan_item_damage_reports as d", "d.loan_item_id", "i.id").selectAll("i").select(["a.uuid", "a.kode_barang", "a.nama", "a.category_id", "d.damage_report_id"]).where("i.loan_id", "=", loan).orderBy("i.id").execute();
    }
    async itemPhotos(ctx: AuthContext, loan: string) {
        return this.query(ctx).selectFrom("loan_item_photos as p").innerJoin("loan_items as i", "i.id", "p.loan_item_id").innerJoin("stored_files as f", "f.id", "p.file_id").select(["p.loan_item_id", "p.tahap", "p.urutan", "f.id as file_id", "f.object_key", "f.scan_status"]).where("i.loan_id", "=", loan).orderBy("p.urutan").execute();
    }
    async signature(ctx: AuthContext, file: string) { return this.query(ctx).selectFrom("stored_files").select(["id as file_id", "object_key", "scan_status"]).where("id", "=", file).executeTakeFirst(); }
    async fines(ctx: AuthContext, loan: string) { return this.query(ctx).selectFrom("fines").selectAll().where("loan_id", "=", loan).orderBy("id").execute(); }
    async returnItem(ctx: AuthContext, id: string, condition: "BAIK" | "RUSAK_RINGAN" | "RUSAK_BERAT" | "HILANG", incomplete: boolean, note: string | null, now: Date) {
        await this.query(ctx).updateTable("loan_items").set({ kondisi_akhir: condition, tidak_lengkap: incomplete, status_kembali: condition === "HILANG" ? "HILANG" : "DIKEMBALIKAN", tanggal_kembali: now, petugas_kembali_id: ctx.userId, catatan_pengembalian: note }).where("id", "=", id).where("status_kembali", "=", "BELUM_KEMBALI").execute();
    }
    async closeLoan(ctx: AuthContext, id: string, now: Date) {
        const units = await this.items(ctx, id), outstanding = units.some((u) => u.status_kembali === "BELUM_KEMBALI");
        const status = outstanding ? "SEBAGIAN_DIKEMBALIKAN" : units.some((u) => u.status_kembali === "HILANG") ? "HILANG" : "DIKEMBALIKAN";
        await this.query(ctx).updateTable("loans").set({ status, tanggal_kembali: outstanding ? null : now, updated_by: ctx.userId }).where("id", "=", id).execute();
        return status;
    }
    async fine(ctx: AuthContext, input: Insertable<Database["fines"]>) { return (await this.query(ctx).insertInto("fines").values(input).returning("id").executeTakeFirstOrThrow()).id; }
    async ready(ctx: AuthContext, start: Date, end: Date, page: number, perPage: number, reservationId?: number, now = start) {
        let query = this.query(ctx).selectFrom("reservations as r").innerJoin("users as u", "u.id", "r.pemohon_id").select(["r.id", "r.nomor", "r.pemohon_id", "u.nama", "r.waktu_mulai", "r.waktu_selesai", "r.lokasi_penggunaan", sql<string>`count(*) over()`.as("total")]).where("r.jenis", "=", "ASET").where("r.status", "=", "DISETUJUI").where("r.waktu_mulai", ">=", start).where("r.waktu_mulai", "<", end).where("r.waktu_selesai", ">", now).where((e) => e.exists(e.selectFrom("reservation_items as i").select("i.id").whereRef("i.reservation_id", "=", "r.id")));
        if (ctx.scopeOf("loan.manage") !== "all") query = query.where("r.pemohon_id", "=", String(ctx.userId));
        if (reservationId !== undefined) query = query.where("r.id", "=", String(reservationId));
        return query.orderBy("r.waktu_mulai").orderBy("r.id").limit(perPage).offset((page - 1) * perPage).execute();
    }
    async readyUnits(ctx: AuthContext, id: string) { return this.query(ctx).selectFrom("reservation_items as i").innerJoin("assets as a", "a.id", "i.asset_id").select(["a.id as asset_id", "a.uuid", "a.kode_barang", "a.nama", "a.kondisi"]).where("i.reservation_id", "=", id).orderBy("a.id").execute(); }
    async resolveUnit(ctx: AuthContext, code: string) {
        return this.query(ctx).selectFrom("assets").select(["id as asset_id", "uuid", "kode_barang", "nama", "category_id", "kondisi", "status", "dapat_dipinjam", "dihapuskan"])
            .where((e) => e.or([e("kode_barang", "=", code), ...(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(code) ? [e("uuid", "=", code)] : [])])).executeTakeFirst();
    }
    async borrowers(ctx: AuthContext, q: string, page: number) {
        let query = this.query(ctx).selectFrom("users as u").innerJoin("roles as r", "r.id", "u.role_id").select(["u.id", "u.nama", "r.nama as role", sql<string>`count(*) over()`.as("total")]).where("u.status", "=", "AKTIF");
        if (ctx.scopeOf("loan.manage") !== "all") query = query.where("u.id", "=", String(ctx.userId));
        if (q) query = query.where("u.nama", "ilike", `%${q.replace(/[\\%_]/g, "\\$&")}%`);
        return query.orderBy("u.nama").orderBy("u.id").offset((page - 1) * 25).limit(25).execute();
    }
}
export const createLoanRepository = (db: QueryExecutor) => defineRepository(new LoanRepository(db));
