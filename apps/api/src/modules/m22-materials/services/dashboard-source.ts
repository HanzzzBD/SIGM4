import type { TransactionScope } from "../../../shared/db/index.js";
import { ForbiddenError } from "../../../shared/errors/index.js";
import { createMaterialRepository } from "../repositories/material.repository.js";
/** Read-only public source: saldo remains owned by the material ledger. */
export async function materialLowStock(scope: TransactionScope): Promise<{ jumlah: number; daftar: { id: string; nama: string; saldo: number; minimum: number; satuan: string }[] }> {
    if (!scope.ctx.can("material.view")) throw new ForbiddenError();
    const result = await createMaterialRepository(scope.tx).list(scope.ctx, { page: 1, per_page: 20, status: "AKTIF", stok: "MENIPIS", urut: "nama" });
    return { jumlah: result.meta.total, daftar: result.data.map(r => ({ id: r.id, nama: r.nama, saldo: Number(r.saldo_total), minimum: r.stok_minimum, satuan: r.simbol })) };
}
