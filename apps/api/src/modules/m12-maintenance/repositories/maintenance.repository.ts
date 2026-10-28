// Adapter tunggal MaintenanceService untuk assets.status (SDD-AVL-11).
import type { AuthContext } from "../../../shared/auth/index.js";
import { sql } from "kysely";
import { pelakuId } from "../../../shared/auth/index.js";
import { BaseRepository, defineRepository } from "../../../shared/db/index.js";
import type { QueryExecutor } from "../../../shared/db/index.js";

class MaintenanceRepository extends BaseRepository {
    constructor(executor: QueryExecutor) { super(executor); }
    async setUnderRepair(ctx: AuthContext, assetId: string) {
        await this.query(ctx).updateTable("assets").set({ status: "DALAM_PERBAIKAN", updated_by: pelakuId(ctx) }).where("id", "=", assetId).execute();
    }
    async restoreAfterRepair(ctx:AuthContext,assetId:string,now:Date) {
        const asset=await this.query(ctx).selectFrom("assets").select(["status","kondisi","dihapuskan"]).where("id","=",assetId).forUpdate().executeTakeFirstOrThrow();
        const other=await this.query(ctx).selectFrom("work_orders").select("id").where("asset_id","=",assetId).where("nonaktifkan_aset","=",true).where("status","in",["DITUGASKAN","DIKERJAKAN","TERTUNDA","MENUNGGU_VERIFIKASI","TIDAK_DAPAT_DIPERBAIKI"]).executeTakeFirst();
        const loan=await this.query(ctx).selectFrom("loan_items").select("id").where("asset_id","=",assetId).where("status_kembali","=","BELUM_KEMBALI").executeTakeFirst();
        const slot=await this.query(ctx).selectFrom("booking_slots").select("id").where("resource_type","=","asset").where("resource_id","=",assetId).where("status","=","CONFIRMED").where(sql<boolean>`slot_range @> ${now}::timestamptz`).executeTakeFirst();
        const status=asset.dihapuskan||["RUSAK_BERAT","HILANG"].includes(asset.kondisi)?"TIDAK_TERSEDIA":other?"DALAM_PERBAIKAN":loan?"DIPINJAM":slot?"DIRESERVASI":"TERSEDIA";
        await this.query(ctx).updateTable("assets").set({status,updated_by:pelakuId(ctx)}).where("id","=",assetId).execute();
        return {sebelum:asset.status,sesudah:status};
    }
}
export const createMaintenanceRepository = (executor: QueryExecutor) => defineRepository(new MaintenanceRepository(executor));
