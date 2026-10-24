import { sql } from "kysely";
import { DomainError } from "../../../shared/errors/index.js";
import type { FineListQuery, LoanListQuery } from "@sigm4/schemas";
import type { AuthContext } from "../../../shared/auth/index.js";
import { BaseRepository, defineRepository } from "../../../shared/db/index.js";
import type { QueryExecutor } from "../../../shared/db/index.js";

class ManagementRepository extends BaseRepository {
 constructor(db: QueryExecutor) { super(db); }
 async filterOptions(ctx: AuthContext, kind: "loans" | "fines") {
  const all = ctx.scopeOf(kind === "loans" ? "loan.view" : "fine.view") === "all";
  let users = this.query(ctx).selectFrom("users as u").select(["u.id", "u.nama"]).where((e) => kind === "loans" ? e.exists(e.selectFrom("loans as l").select("l.id").whereRef("l.peminjam_id", "=", "u.id")) : e.exists(e.selectFrom("fines as f").select("f.id").whereRef("f.peminjam_id", "=", "u.id")));
  if (!all) users = users.where("u.id", "=", String(ctx.userId));
  const categories = this.query(ctx).selectFrom("asset_categories as c").select(["c.id", "c.nama"]).where((e) => { let owned = e.selectFrom("loan_items as i").innerJoin("assets as a", "a.id", "i.asset_id").innerJoin("loans as l", "l.id", "i.loan_id").select("i.id").whereRef("a.category_id", "=", "c.id"); if (!all) owned = owned.where("l.peminjam_id", "=", String(ctx.userId)); return e.exists(owned); });
  const [peminjam, kategori] = await Promise.all([users.orderBy("u.nama").execute(), kind === "loans" ? categories.orderBy("c.nama").execute() : Promise.resolve([])]);
  return { peminjam, kategori };
 }
 async threshold(ctx: AuthContext) { return (await this.query(ctx).selectFrom("system_settings").select("value").where("key", "=", "denda.ambang_blokir").executeTakeFirst())?.value; }
 async debt(ctx: AuthContext, user: number, now: Date) {
  const overdue = await this.query(ctx).selectFrom("loans as l").select("l.nomor").where("l.peminjam_id", "=", String(user)).where("l.tanggal_jatuh_tempo", "<", now).where((e) => e.exists(e.selectFrom("loan_items as i").select("i.id").whereRef("i.loan_id", "=", "l.id").where("i.status_kembali", "=", "BELUM_KEMBALI"))).orderBy("l.id").execute();
  const total = await this.query(ctx).selectFrom("fines").select(sql<string>`coalesce(sum(jumlah-jumlah_dibebaskan),0)::text`.as("total")).where("peminjam_id", "=", String(user)).where("status", "in", ["BELUM_DIBAYAR", "DIBEBASKAN_SEBAGIAN"]).executeTakeFirstOrThrow();
  return { overdue, total: total.total };
 }
 async lockBorrower(ctx: AuthContext, user: number) { await this.query(ctx).selectFrom("users").select("id").where("id", "=", String(user)).forUpdate().execute(); }
 async block(ctx: AuthContext, user: number) { return this.query(ctx).selectFrom("borrower_blocks").selectAll().where("user_id", "=", String(user)).executeTakeFirst(); }
 async saveBlock(ctx: AuthContext, user: number, active: boolean, reasons: readonly string[], now: Date) {
  await this.query(ctx).insertInto("borrower_blocks").values({ user_id: user, aktif: active, alasan: JSON.stringify(reasons), updated_at: now }).onConflict((c) => c.column("user_id").doUpdateSet({ aktif: active, alasan: JSON.stringify(reasons), updated_at: now })).execute();
 }
 async loan(ctx: AuthContext, id: number, lock = false) {
  const q = this.query(ctx).selectFrom("loans as l").innerJoin("users as u", "u.id", "l.peminjam_id").innerJoin("roles as r", "r.id", "u.role_id").selectAll("l").select(["u.nama as peminjam_nama", "r.kode as role"]).where("l.id", "=", String(id));
  if (!lock) return q.executeTakeFirst();
  try { return await q.forUpdate("l").noWait().executeTakeFirst(); }
  catch (error) { if ((error as { code?: string }).code === "55P03") throw new DomainError("REQUEST_IN_PROGRESS", "Peminjaman sedang diproses. Coba lagi."); throw error; }
 }
 async settings(ctx: AuthContext) { const r = await this.query(ctx).selectFrom("system_settings").select(["key", "value"]).where("kelompok", "in", ["RESERVASI", "PEMINJAMAN"]).execute(); return new Map(r.map((i) => [i.key, i.value])); }
 async extensions(ctx: AuthContext, loan: string) { return this.query(ctx).selectFrom("loan_extensions").selectAll().where("loan_id", "=", loan).orderBy("id").execute(); }
 async extension(ctx: AuthContext, id: number) { return this.query(ctx).selectFrom("loan_extensions").selectAll().where("id", "=", String(id)).executeTakeFirst(); }
 async createExtension(ctx: AuthContext, loan: string, borrower: string, oldEnd: Date, newEnd: Date, reason: string, expiry: Date) {
  return this.query(ctx).insertInto("loan_extensions").values({ loan_id: loan, pemohon_id: borrower, jatuh_tempo_lama: oldEnd, jatuh_tempo_baru: newEnd, alasan: reason, kedaluwarsa_pada: expiry, created_by: ctx.userId }).returningAll().executeTakeFirstOrThrow();
 }
 async extensionItems(ctx: AuthContext, id: string) { return this.query(ctx).selectFrom("loan_extension_items as e").innerJoin("loan_items as i", "i.id", "e.loan_item_id").select(["e.slot_id", "i.id as item_id", "i.asset_id", "i.status_kembali", "i.slot_id as active_slot_id"]).where("e.extension_id", "=", id).orderBy("i.asset_id").execute(); }
 async holds(ctx: AuthContext, extension: string, items: readonly { item: string; slot: string }[]) { await this.query(ctx).insertInto("loan_extension_items").values(items.map((i) => ({ extension_id: extension, loan_item_id: i.item, slot_id: i.slot }))).execute(); }
 async setInstance(ctx: AuthContext, id: string, instance: number) { await this.query(ctx).updateTable("loan_extensions").set({ approval_instance_id: instance }).where("id", "=", id).execute(); }
 async extensionStatus(ctx: AuthContext, id: string, status: string, now: Date) { await this.query(ctx).updateTable("loan_extensions").set({ status, diputuskan_pada: now }).where("id", "=", id).execute(); }
 async extendLoan(ctx: AuthContext, id: string, end: Date) { await this.query(ctx).updateTable("loans").set({ tanggal_jatuh_tempo: end, jumlah_perpanjangan: sql`jumlah_perpanjangan+1`, status: "DIPINJAM", updated_by: ctx.userId === 0 ? null : ctx.userId }).where("id", "=", id).execute(); }
 async accrueDays(ctx: AuthContext, items: readonly string[], days: number) { if (items.length && days > 0) await this.query(ctx).updateTable("loan_items").set({ hari_terlambat_terakumulasi: sql`hari_terlambat_terakumulasi+${days}` }).where("id", "in", [...items]).execute(); }
 async extensionForSlot(ctx: AuthContext, id: string) { return this.query(ctx).selectFrom("loan_extension_items").select("extension_id").where("slot_id", "=", id).executeTakeFirst(); }
 async openIds(ctx: AuthContext) { return this.query(ctx).selectFrom("loans").select(["id", "peminjam_id"]).where("tanggal_kembali", "is", null).orderBy("id").execute(); }
 async blockUsers(ctx: AuthContext) { return this.query(ctx).selectFrom("users as u").select("u.id").where((e) => e.or([e.exists(e.selectFrom("loans as l").select("l.id").whereRef("l.peminjam_id", "=", "u.id")), e.exists(e.selectFrom("borrower_blocks as b").select("b.user_id").whereRef("b.user_id", "=", "u.id"))])).execute(); }
 async overdue(ctx: AuthContext, id: string) { await this.query(ctx).updateTable("loans").set({ status: "TERLAMBAT" }).where("id", "=", id).where("status", "in", ["DIPINJAM", "SEBAGIAN_DIKEMBALIKAN"]).execute(); }
 async daily(ctx: AuthContext, id: string, day: string, kind: string, due: Date) { return (await this.query(ctx).insertInto("loan_daily_events").values({ loan_id: id, tanggal: day, jenis: kind, jatuh_tempo: due }).onConflict((c) => c.doNothing()).returning("loan_id").executeTakeFirst()) !== undefined; }
 async recap(ctx: AuthContext, day: string) { return (await this.query(ctx).insertInto("loan_recap_days").values({ tanggal: day }).onConflict((c) => c.doNothing()).returning("tanggal").executeTakeFirst()) !== undefined; }
 async listLoans(ctx: AuthContext, filter: LoanListQuery, now: Date) {
  let q = this.query(ctx).selectFrom("loans as l").innerJoin("users as u", "u.id", "l.peminjam_id").selectAll("l").select(["u.nama as peminjam_nama", sql<string>`count(*) over()`.as("total")]);
  if (ctx.scopeOf("loan.view") !== "all") q = q.where("l.peminjam_id", "=", String(ctx.userId));
  if (filter.tab === "selesai") q = q.where("l.tanggal_kembali", "is not", null);
  else { q = q.where("l.tanggal_kembali", "is", null); if (filter.tab === "terlambat") q = q.where("l.tanggal_jatuh_tempo", "<", now); if (filter.tab === "akan_jatuh_tempo") q = q.where("l.tanggal_jatuh_tempo", ">=", now).where("l.tanggal_jatuh_tempo", "<=", new Date(now.getTime() + 3 * 86_400_000)); }
  if (filter.q) q = q.where((e) => e.or([e("l.nomor", "ilike", `%${filter.q.replace(/[\\%_]/g, "\\$&")}%`), e("u.nama", "ilike", `%${filter.q.replace(/[\\%_]/g, "\\$&")}%`)]));
  if (filter.peminjam) q = q.where("l.peminjam_id", "=", String(filter.peminjam));
  if (filter.kategori) q = q.where((e) => e.exists(e.selectFrom("loan_items as i").innerJoin("assets as a", "a.id", "i.asset_id").select("i.id").whereRef("i.loan_id", "=", "l.id").where("a.category_id", "=", String(filter.kategori))));
  if (filter.dari) q = q.where("l.tanggal_pinjam", ">=", new Date(`${filter.dari}T00:00:00+07:00`));
  if (filter.sampai) q = q.where("l.tanggal_pinjam", "<", new Date(new Date(`${filter.sampai}T00:00:00+07:00`).getTime() + 86_400_000));
  return q.orderBy("l.tanggal_jatuh_tempo").orderBy("l.id").offset((filter.page - 1) * filter.per_page).limit(filter.per_page).execute();
 }
 private fineQuery(ctx: AuthContext, permission: string) {
  let q = this.query(ctx).selectFrom("fines as f").innerJoin("loans as l", "l.id", "f.loan_id").innerJoin("loan_items as i", "i.id", "f.loan_item_id").innerJoin("assets as a", "a.id", "i.asset_id").innerJoin("users as u", "u.id", "f.peminjam_id").selectAll("f").select(["l.nomor as nomor_peminjaman", "a.kode_barang", "a.nama as nama_aset", "u.nama as peminjam_nama", "u.pseudonymized_at as peminjam_pseudonymized_at"]);
  if (ctx.scopeOf(permission) !== "all") q = q.where("f.peminjam_id", "=", String(ctx.userId));
  return q;
 }
 async fine(ctx: AuthContext, id: number, permission = "fine.view", lock = false) { const q = this.fineQuery(ctx, permission).where("f.id", "=", String(id)); return lock ? q.forUpdate("f").executeTakeFirst() : q.executeTakeFirst(); }
 async listFines(ctx: AuthContext, filter: FineListQuery) {
  let q = this.fineQuery(ctx, "fine.view").select(sql<string>`count(*) over()`.as("total"));
  if (filter.jenis) q = q.where("f.jenis", "=", filter.jenis); if (filter.status) q = q.where("f.status", "=", filter.status);
  if (filter.peminjam) q = q.where("f.peminjam_id", "=", String(filter.peminjam));
  if (filter.q) q = q.where((e) => e.or([e("l.nomor", "ilike", `%${filter.q.replace(/[\\%_]/g, "\\$&")}%`), e("u.nama", "ilike", `%${filter.q.replace(/[\\%_]/g, "\\$&")}%`)]));
  if (filter.dari) q = q.where("f.created_at", ">=", new Date(`${filter.dari}T00:00:00+07:00`));
  if (filter.sampai) q = q.where("f.created_at", "<", new Date(new Date(`${filter.sampai}T00:00:00+07:00`).getTime() + 86_400_000));
  return q.orderBy("f.created_at", "desc").orderBy("f.id", "desc").offset((filter.page - 1) * filter.per_page).limit(filter.per_page).execute();
 }
 async action(ctx: AuthContext, id: string, action: string, amount: string | null, reason: string | null, now: Date) { await this.query(ctx).insertInto("fine_actions").values({ fine_id: id, aksi: action, jumlah: amount, alasan: reason, oleh: ctx.userId, pada: now }).execute(); }
 async actions(ctx: AuthContext, id: string) { return this.query(ctx).selectFrom("fine_actions as f").innerJoin("users as u", "u.id", "f.oleh").select(["f.id", "f.aksi", "f.jumlah", "f.alasan", "u.nama as oleh", "f.pada"]).where("f.fine_id", "=", id).orderBy("f.id").execute(); }
 async proposals(ctx: AuthContext, id: string) { return this.query(ctx).selectFrom("compensation_proposals as p").innerJoin("users as u", "u.id", "p.diusulkan_oleh").selectAll("p").select("u.nama as pengusul").where("p.fine_id", "=", id).orderBy("p.id").execute(); }
 async proposal(ctx: AuthContext, id: number, fine: string) { return this.query(ctx).selectFrom("compensation_proposals").selectAll().where("id", "=", String(id)).where("fine_id", "=", fine).executeTakeFirst(); }
 async propose(ctx: AuthContext, fine: string, amount: string, reason: string, now: Date) { return this.query(ctx).insertInto("compensation_proposals").values({ fine_id: fine, jumlah: amount, alasan: reason, diusulkan_oleh: ctx.userId, diusulkan_pada: now }).returningAll().executeTakeFirstOrThrow(); }
 async decideProposal(ctx: AuthContext, id: string, decision: string, note: string, now: Date) { await this.query(ctx).updateTable("compensation_proposals").set({ status: decision, diputuskan_oleh: ctx.userId, diputuskan_pada: now, catatan_keputusan: note }).where("id", "=", id).execute(); }
 async setAmount(ctx: AuthContext, id: string, amount: string) { await this.query(ctx).updateTable("fines").set({ jumlah: amount, jumlah_sebelum_cap: amount, menunggu_penetapan: false, updated_by: ctx.userId }).where("id", "=", id).execute(); }
 async pay(ctx: AuthContext, id: string, date: Date, proof: string) { await this.query(ctx).updateTable("fines").set({ status: "LUNAS", tanggal_bayar: date, nomor_bukti: proof, updated_by: ctx.userId }).where("id", "=", id).execute(); }
 async waive(ctx: AuthContext, id: string, cumulative: string, all: boolean, reason: string) { await this.query(ctx).updateTable("fines").set({ jumlah_dibebaskan: cumulative, status: all ? "DIBEBASKAN" : "DIBEBASKAN_SEBAGIAN", alasan_pembebasan: reason, dibebaskan_oleh: ctx.userId, updated_by: ctx.userId }).where("id", "=", id).execute(); }
 async reopen(ctx: AuthContext, id: string, partial: boolean) { await this.query(ctx).updateTable("fines").set({ status: partial ? "DIBEBASKAN_SEBAGIAN" : "BELUM_DIBAYAR", tanggal_bayar: null, nomor_bukti: null, updated_by: ctx.userId }).where("id", "=", id).execute(); }
 async lockPrivacyBorrower(ctx: AuthContext, id: string) { return this.query(ctx).selectFrom("users").select("pseudonymized_at").where("id", "=", id).forUpdate().executeTakeFirstOrThrow(); }
}
export const createManagementRepository = (db: QueryExecutor) => defineRepository(new ManagementRepository(db));
