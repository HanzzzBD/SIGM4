import { sql } from "kysely";
import type { AuthContext } from "../../../shared/auth/index.js";
import { BaseRepository, defineRepository } from "../../../shared/db/index.js";
import type { QueryExecutor } from "../../../shared/db/index.js";
import { studentObligations } from "../../m02-users/index.js";
import type { StudentObligationChecker } from "../../m02-users/index.js";

class ObligationRepository extends BaseRepository {
    constructor(db: QueryExecutor) { super(db); }
    async loans(ctx: AuthContext, userId: number) {
        return this.query(ctx).selectFrom("loans as l").select(["l.id", "l.nomor",
            sql<number>`(select count(*)::int from loan_items i where i.loan_id=l.id and i.status_kembali='BELUM_KEMBALI')`.as("unit")])
            .where("l.peminjam_id", "=", String(userId))
            .where(eb => eb.or([eb("l.tanggal_kembali", "is", null), eb.exists(eb.selectFrom("loan_items as i").select("i.id").whereRef("i.loan_id", "=", "l.id").where("i.status_kembali", "=", "BELUM_KEMBALI"))]))
            .orderBy("l.id").execute();
    }
    async fines(ctx: AuthContext, userId: number) {
        return this.query(ctx).selectFrom("fines as f").innerJoin("loans as l", "l.id", "f.loan_id")
            .select(["f.id", "f.jenis", "f.menunggu_penetapan", "l.nomor"])
            .where("f.peminjam_id", "=", String(userId)).where("f.status", "in", ["BELUM_DIBAYAR", "DIBEBASKAN_SEBAGIAN"]).orderBy("f.id").execute();
    }
}
/** SL-04 is stricter than the configurable booking block: no monetary threshold. */
export const loanStudentObligations: StudentObligationChecker = {
    nama: "m09-loans",
    async daftarKewajiban(scope, userId) {
        const repo = defineRepository(new ObligationRepository(scope.tx));
        const loans = await repo.loans(scope.ctx, userId), fines = await repo.fines(scope.ctx, userId);
        return [
            ...loans.map(l => ({ jenis: "PEMINJAMAN_AKTIF", keterangan: `Peminjaman ${l.nomor} (#${l.id}): ${l.unit} unit belum kembali; penyelesaian peminjaman masih terbuka.` })),
            ...fines.map(f => ({ jenis: f.jenis === "GANTI_RUGI" ? "GANTI_RUGI_BELUM_LUNAS" : "DENDA_BELUM_LUNAS", keterangan: `${f.jenis === "GANTI_RUGI" ? "Ganti rugi" : "Denda"} #${f.id} pada ${f.nomor} belum lunas${f.menunggu_penetapan ? "; menunggu penetapan nominal" : ""}.` })),
        ];
    },
};
/** Explicitly called by both process composition roots; safe for multiple app instances. */
export function installStudentObligations() {
    if (!studentObligations.has(loanStudentObligations.nama)) studentObligations.register(loanStudentObligations);
}
