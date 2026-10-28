// Penulisan kolom QR `assets` atas permintaan M-05 (FR-05.1; PR-03-01, keputusan 1 log phase-03),
// di TransactionScope pemanggil — aksi log milik M-05 (`ASSET_QR_REGENERATED`) dicatat pemanggil;
// penandaan label tercatat `ASSET_UPDATED` milik M-04 di sini (m04 §11).

import type { AuditLogger } from "../../../shared/audit/index.js";
import type { TransactionScope } from "../../../shared/db/index.js";
import { DomainError, NotFoundError } from "../../../shared/errors/index.js";
import { createQrRepository } from "../repositories/qr.repository.js";

const MODUL = "m04-assets";

/** FR-05.1 A2: UUID baru — QR lama otomatis tidak berlaku (uuid lamanya tak lagi menunjuk aset mana pun). */
export async function gantiUuidAset(scope: TransactionScope, assetId: number): Promise<{ readonly uuidLama: string; readonly uuidBaru: string }> {
    const repo = createQrRepository(scope.tx);
    const [baris] = await repo.kunci(scope.ctx, [assetId]);
    if (baris === undefined) throw new NotFoundError();
    return { uuidLama: baris.uuid, uuidBaru: await repo.gantiUuid(scope.ctx, assetId) };
}

export interface LabelAset {
    readonly id: number;
    readonly uuid: string;
    readonly kodeAset: string;
    readonly nama: string;
}

/**
 * FR-05.1 langkah 2–3 (PR-03-02): isi label untuk aset terpilih, URUT sesuai pilihan pengguna
 * (duplikat dibuang). Seluruh id wajib ada — PDF tidak dicetak dengan label yang diam-diam hilang.
 */
export async function asetUntukLabel(scope: TransactionScope, assetIds: readonly number[]): Promise<readonly LabelAset[]> {
    const unik = [...new Set(assetIds)];
    const baris = new Map((await createQrRepository(scope.tx).untukLabel(scope.ctx, unik)).map((b) => [Number(b.id), b]));
    const hilang = unik.filter((id) => !baris.has(id));
    if (hilang.length > 0) throw new DomainError("VALIDATION_ERROR", `Aset tidak ditemukan: ${hilang.join(", ")}.`, { field: "asset_ids" });
    return unik.map((id) => {
        const b = baris.get(id)!;
        return { id, uuid: b.uuid, kodeAset: b.kode_barang, nama: b.nama };
    });
}

/**
 * FR-05.1 langkah 5: tandai label QR terpasang (atau dilepas, mis. label rusak — A1). Seluruh id
 * wajib ada (atomik, pola mutasi FR-04.4); hanya aset yang nilainya BENAR berubah yang ditulis
 * dan dicatat `ASSET_UPDATED` (sebelum/sesudah). Mengembalikan id yang berubah.
 */
export async function tandaiQrTerpasang(scope: TransactionScope, audit: AuditLogger, assetIds: readonly number[], nilai: boolean): Promise<readonly number[]> {
    const unik = [...new Set(assetIds)];
    const repo = createQrRepository(scope.tx);
    const baris = await repo.kunci(scope.ctx, unik);
    if (baris.length !== unik.length) {
        const ada = new Set(baris.map((b) => Number(b.id)));
        throw new DomainError("VALIDATION_ERROR", `Aset tidak ditemukan: ${unik.filter((id) => !ada.has(id)).join(", ")}.`, { field: "asset_ids" });
    }
    const berubah = baris.filter((b) => b.qr_terpasang !== nilai).map((b) => Number(b.id));
    await repo.setQrTerpasang(scope.ctx, berubah, nilai);
    for (const id of berubah) {
        await audit.write(scope, { modul: MODUL, aksi: "ASSET_UPDATED", entitas: "assets", entitasId: String(id), nilaiSebelum: { qr_terpasang: !nilai }, nilaiSesudah: { qr_terpasang: nilai } });
    }
    return berubah;
}
