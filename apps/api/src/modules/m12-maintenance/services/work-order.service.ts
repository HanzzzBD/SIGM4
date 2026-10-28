import type { WorkOrderCreate } from "@sigm4/schemas";
import type { Kysely } from "kysely";
import { pelakuId } from "../../../shared/auth/index.js";
import type { AuthContext } from "../../../shared/auth/index.js";
import type { AuditLogger } from "../../../shared/audit/index.js";
import type { Clock } from "../../../shared/clock/index.js";
import type { Database, TransactionScope } from "../../../shared/db/index.js";
import { DomainError, NotFoundError } from "../../../shared/errors/index.js";
import { publish } from "../../../shared/events/index.js";
import { DocumentNumberService } from "../../../shared/numbering/index.js";
import { TitikWorkOrderKerusakan } from "../../m11-damage-reports/index.js";
import { cancelReservationsForUnavailableAsset } from "../../m07-reservation-room/index.js";
import { garansiAktifAset } from "../../m06-documents/index.js";
import { createWorkOrderRepository } from "../repositories/work-order.repository.js";
import { createMaintenanceRepository } from "../repositories/maintenance.repository.js";

export const EVENT_WORK_ORDER_ASSIGNED = "WorkOrderAssigned";
const invalid = (field: string, message: string) => new DomainError("VALIDATION_ERROR", message, { errors: [{ field, message }] });
export const tanggalWib = (d: Date) => new Date(d.getTime() + 7 * 3600000).toISOString().slice(0, 10);
export function canReadWorkOrderCosts(ctx:AuthContext,technicianId:string){
    return ctx.can("maintenance.view_cost")&&(ctx.scopeOf("maintenance.view_cost")==="all"||technicianId===String(ctx.userId));
}
export function maskWorkOrderCosts<T extends { estimasi_biaya: string; biaya: string; teknisi_id:string }>(ctx: AuthContext, row: T) {
    const allowed=canReadWorkOrderCosts(ctx,row.teknisi_id);
    return { ...row, estimasi_biaya: allowed ? row.estimasi_biaya : null, biaya: allowed ? row.biaya : null };
}

export async function validateWorkOrderTechnician(scope: TransactionScope, id: number) {
    if (!await createWorkOrderRepository(scope.tx).technician(scope.ctx, id, true)) throw invalid("teknisi_id", "Penanggung jawab harus pengguna Teknisi aktif.");
}
export async function validateWorkOrderTarget(scope: TransactionScope, assetId: string | null, roomId: string | null, deactivate: boolean) {
    if (assetId !== null) {
        const asset = await scope.tx.selectFrom("assets").select(["id", "nama", "status", "dihapuskan"]).where("id", "=", assetId).forUpdate().executeTakeFirst();
        if (!asset || asset.dihapuskan) throw new NotFoundError("Aset tidak ditemukan.");
        if (deactivate && asset.status === "DIPINJAM") throw invalid("asset_id", "Aset masih dipinjam; kembalikan dahulu sebelum masuk perbaikan.");
        if (!deactivate && asset.status !== "TERSEDIA") throw invalid("nonaktifkan_aset", "Perawatan ringan memerlukan aset Tersedia.");
        return asset;
    }
    const room = await scope.tx.selectFrom("rooms").select("id").where("id", "=", roomId!).where("status", "=", "AKTIF").forUpdate().executeTakeFirst();
    if (!room) throw new NotFoundError("Ruangan tidak ditemukan.");
    return null;
}

export class WorkOrderService {
    constructor(private readonly db: Kysely<Database>, private readonly clock: Clock, private readonly audit: AuditLogger) {}
    async create(scope: TransactionScope, input: WorkOrderCreate, replay = false) {
        const repo = createWorkOrderRepository(scope.tx);
        const hook = new TitikWorkOrderKerusakan(this.audit);
        // Lock the source ticket first for both manual requests and event delivery.
        if (input.damage_report_id !== undefined) {
            await scope.tx.selectFrom("damage_reports").select("id").where("id", "=", String(input.damage_report_id)).forUpdate().executeTakeFirst();
            const existing = await repo.byTicket(scope.ctx, input.damage_report_id);
            if (existing) {
                if (replay) return this.dto(scope, existing);
                throw invalid("damage_report_id", "Laporan kerusakan sudah memiliki work order.");
            }
        }
        const ticket = input.damage_report_id === undefined ? null : await hook.tiketUntukWorkOrder(scope, input.damage_report_id);
        const details = ticket === null ? null : await scope.tx.selectFrom("damage_reports").select(["deskripsi", "urgensi"]).where("id", "=", ticket.id).executeTakeFirstOrThrow();
        const assetId = ticket?.asset_id ?? (input.asset_id === undefined ? null : String(input.asset_id));
        const roomId = ticket?.room_id ?? (input.room_id === undefined ? null : String(input.room_id));
        if ((assetId !== null) === (roomId !== null)) throw invalid("asset_id", "Work order harus memiliki tepat satu aset atau ruangan.");
        if (ticket && ((input.asset_id !== undefined && String(input.asset_id) !== ticket.asset_id) || (input.room_id !== undefined && String(input.room_id) !== ticket.room_id))) throw invalid("damage_report_id", "Objek harus sesuai tiket kerusakan.");
        await validateWorkOrderTechnician(scope, input.teknisi_id);
        if (!replay && input.target_selesai < tanggalWib(this.clock.now())) throw invalid("target_selesai", "Target selesai tidak boleh sebelum hari ini.");
        const asset = await validateWorkOrderTarget(scope, assetId, roomId, input.nonaktifkan_aset);
        if (assetId !== null && asset !== null) {
            if (input.nonaktifkan_aset) {
                await createMaintenanceRepository(scope.tx).setUnderRepair(scope.ctx, assetId);
                if (asset.status !== "DALAM_PERBAIKAN") await this.audit.write(scope, { modul: "m04-assets", aksi: "ASSET_STATUS_CHANGED", entitas: "assets", entitasId: assetId, nilaiSebelum: { status: asset.status }, nilaiSesudah: { status: "DALAM_PERBAIKAN" } });
                await cancelReservationsForUnavailableAsset(scope, Number(assetId), this.clock, this.audit, asset.nama);
            }
        }
        const row = await scope.tx.insertInto("work_orders").values({
            nomor: await new DocumentNumberService(this.clock).next(scope.tx, "WO"), jenis: "KOREKTIF", asset_id: assetId, room_id: roomId,
            damage_report_id: ticket?.id ?? null, teknisi_id: String(input.teknisi_id), prioritas: details?.urgensi ?? input.prioritas,
            deskripsi: details?.deskripsi ?? input.deskripsi, target_selesai: input.target_selesai, estimasi_biaya: input.estimasi_biaya.toFixed(2), nonaktifkan_aset: input.nonaktifkan_aset,
            created_by: pelakuId(scope.ctx), updated_by: pelakuId(scope.ctx),
        }).returningAll().executeTakeFirstOrThrow();
        if (ticket) await hook.tandaiDalamPerbaikan(scope, Number(ticket.id));
        for (const aksi of ["WORKORDER_CREATED", "WORKORDER_ASSIGNED"]) await this.audit.write(scope, { modul: "m12-maintenance", aksi, entitas: "work_orders", entitasId: row.id, nilaiSesudah: { nomor: row.nomor, teknisi_id: row.teknisi_id, prioritas: row.prioritas, target_selesai: row.target_selesai, damage_report_id: row.damage_report_id } });
        await publish(scope, { name: EVENT_WORK_ORDER_ASSIGNED, aggregateType: "work_order", aggregateId: row.id, payload: { work_order_id: Number(row.id), nomor: row.nomor, teknisi_id: Number(row.teknisi_id), prioritas: row.prioritas } });
        return this.dto(scope, row);
    }
    private async dto(scope: TransactionScope, row: Awaited<ReturnType<ReturnType<typeof createWorkOrderRepository>["byTicket"]>> & {}) {
        const warranty = row.asset_id === null ? [] : await garansiAktifAset(scope.tx, scope.ctx, Number(row.asset_id), tanggalWib(this.clock.now()));
        return { ...maskWorkOrderCosts(scope.ctx, row), garansi_aktif: scope.ctx.can("asset_document.view") ? warranty.length > 0 : null };
    }
    async detail(ctx: AuthContext, id: number) {
        const row = await createWorkOrderRepository(this.db).read(ctx, id);
        if (!row) throw new NotFoundError("Work order tidak ditemukan.");
        const warranty = row.asset_id === null ? [] : await garansiAktifAset(this.db, ctx, Number(row.asset_id), tanggalWib(this.clock.now()));
        return { ...maskWorkOrderCosts(ctx, row), garansi_aktif: ctx.can("asset_document.view") ? warranty.length > 0 : null };
    }
}
