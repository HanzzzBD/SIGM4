import type { AnalyticsColumn, AnalyticsRow, AssetExportFilter } from "@sigm4/schemas";
import type { AuthContext } from "../../../shared/auth/index.js";
import { assertAuthContext, isSystemAuthContext } from "../../../shared/auth/index.js";
import { ForbiddenError } from "../../../shared/errors/index.js";
import type { QueryExecutor, TransactionScope } from "../../../shared/db/index.js";
import { createAssetRepository } from "../repositories/asset.repository.js";

/** BR-073/074: hak ekspor tidak memperluas hak baca; scope tanpa aturan ditolak. */
export function assetExportAccess(ctx: AuthContext) {
    assertAuthContext(ctx);
    if (isSystemAuthContext(ctx) || !ctx.can("asset.view") || !ctx.can("asset.export")) throw new ForbiddenError();
    const view = ctx.scopeOf("asset.view"), exp = ctx.scopeOf("asset.export");
    if (!["all", "own", "restricted"].includes(view) || !["all", "own"].includes(exp)) throw new ForbiddenError();
    const own = view === "own" || exp === "own";
    const financial = ctx.roleCode !== "R-07" && ctx.can("asset.view_financial") &&
        (ctx.scopeOf("asset.view_financial") === "all" || ctx.scopeOf("asset.view_financial") === "own" && own);
    return { own, financial };
}
export const assetExportRepoFilter = (f: AssetExportFilter) => ({
    sort: f.sort,
    ...(f.q === undefined ? {} : { q: f.q }),
    ...(f.kategori_id === undefined ? {} : { categoryId: f.kategori_id }),
    ...(f.lokasi_id === undefined ? {} : { roomId: f.lokasi_id }),
    ...(f.kondisi === undefined ? {} : { kondisi: f.kondisi }),
    ...(f.status === undefined ? {} : { status: f.status }),
    ...(f.tahun_perolehan === undefined ? {} : { tahunPerolehan: f.tahun_perolehan }),
    ...(f.dapat_dipinjam === undefined ? {} : { dapatDipinjam: f.dapat_dipinjam }),
    ...(f.qr_terpasang === undefined ? {} : { qrTerpasang: f.qr_terpasang }),
    ...(f.import_job_id === undefined ? {} : { importJobId: f.import_job_id }),
});
const col = (key: string, label: string, tipe: AnalyticsColumn["tipe"] = "TEXT", sensitivitas: AnalyticsColumn["sensitivitas"] = "PUBLIC"): AnalyticsColumn => ({ key, label, tipe, sensitivitas });
export async function assetExportDataset(scope: TransactionScope, filter: AssetExportFilter, limit: number) {
    const access = assetExportAccess(scope.ctx), columns = [
        col("kode_barang", "Kode aset"), col("nama", "Nama aset"), col("merek", "Merek"), col("model", "Model/tipe"), col("nomor_seri", "Nomor seri"),
        col("kategori", "Kategori"), col("gedung", "Gedung"), col("ruangan", "Ruangan"), col("kondisi", "Kondisi"), col("status", "Status"),
        col("tahun_perolehan", "Tahun perolehan", "NUMBER"), col("dapat_dipinjam", "Dapat dipinjam", "BOOLEAN"),
        col("boleh_dipinjam_siswa", "Boleh dipinjam siswa", "BOOLEAN"), col("penanggung_jawab", "Penanggung jawab"), col("qr_terpasang", "QR terpasang", "BOOLEAN"),
    ];
    if (access.financial) columns.push(col("sumber_perolehan", "Sumber perolehan", "TEXT", "ASSET_FINANCIAL"), col("nilai_perolehan", "Nilai perolehan (Rp)", "DECIMAL", "ASSET_FINANCIAL"));
    const rows = await createAssetRepository(scope.tx).exportRows(scope.ctx, assetExportRepoFilter(filter), limit, access);
    return { columns, rows: rows as AnalyticsRow[] };
}
/** Membership dipakai ulang saat unduh; perubahan pemilik/kelayakan membatalkan file lama. */
export async function assetExportScopeHash(db: QueryExecutor, ctx: AuthContext) {
    assetExportAccess(ctx);
    return createAssetRepository(db).exportScopeHash(ctx);
}
