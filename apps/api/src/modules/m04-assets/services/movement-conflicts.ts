import { slotPenghalangMutasi } from "../../../shared/booking/index.js";
import type { RentangWaktu } from "../../../shared/booking/index.js";
import type { QueryExecutor } from "../../../shared/db/index.js";
import { DomainError } from "../../../shared/errors/index.js";

/** Tanggal tanpa jam mencakup satu hari WIB, half-open; tidak bergantung zona waktu server. */
export function movementDay(tanggal: string): RentangWaktu {
    const mulai = new Date(`${tanggal}T00:00:00+07:00`);
    return { mulai, selesai: new Date(mulai.getTime() + 24 * 60 * 60 * 1000) };
}

export async function assertNoMovementConflicts(executor: QueryExecutor, assets: readonly { readonly id: string; readonly kode_barang: string }[], tanggal: string): Promise<void> {
    const slots = await slotPenghalangMutasi(executor, assets.map((asset) => Number(asset.id)), movementDay(tanggal));
    if (slots.length === 0) return;
    const codes = new Map(assets.map((asset) => [asset.id, asset.kode_barang]));
    const time = (date: Date) => date.toLocaleString("id-ID", { timeZone: "Asia/Jakarta" });
    throw new DomainError("ASSET_NOT_AVAILABLE", "Mutasi ditolak karena aset memiliki reservasi atau pinjaman pada tanggal yang dipilih.", {
        errors: slots.map((slot) => {
            const reference = slot.origin === "loan" ? slot.loan_id : slot.reservation_id;
            return { field: "asset_ids", message: `${codes.get(slot.resource_id) ?? slot.resource_id}: ${slot.origin === "loan" ? "Pinjaman" : "Reservasi"} ${reference === null ? `(slot #${slot.id})` : `#${reference}`} (${slot.status}), ${time(slot.mulai)} sampai ${time(slot.selesai)} WIB.` };
        }),
    });
}
