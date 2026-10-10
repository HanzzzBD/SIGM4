// Titik ekstensi work order (FR-11.2 → FR-12.1; PR-03-15, keputusan 21d log phase-03). Disiapkan, belum
// dipanggil siapa pun: M-12 (Phase 04) memanggilnya lewat `index.ts` di dalam transaksinya sendiri.
// Ketiganya mengunci tiket lebih dulu — dua work order serentak atas satu tiket tidak dapat lolos bersamaan.

import type { AuditLogger } from "../../../shared/audit/index.js";
import type { StatusLaporanKerusakan, TransactionScope } from "../../../shared/db/index.js";
import { DomainError, NotFoundError } from "../../../shared/errors/index.js";
import { createDamageReportRepository } from "../repositories/damage-report.repository.js";
import type { TiketTerkunci } from "../repositories/damage-report.repository.js";

const MODUL = "m11-damage-reports";

async function kunciBerstatus(scope: TransactionScope, id: number, harus: StatusLaporanKerusakan, pesan: string): Promise<TiketTerkunci> {
    const tiket = await createDamageReportRepository(scope.tx).kunci(scope.ctx, id);
    if (tiket === undefined) throw new NotFoundError("Laporan kerusakan tidak ditemukan.");
    if (tiket.status !== harus) throw new DomainError("VALIDATION_ERROR", pesan, { errors: [{ field: "damage_report_id", message: pesan }] });
    return tiket;
}

export class TitikWorkOrderKerusakan {
    constructor(private readonly audit: AuditLogger) {}

    /** BR-045: work order hanya dari tiket yang sudah diverifikasi untuk ditindaklanjuti. */
    async tiketUntukWorkOrder(scope: TransactionScope, id: number): Promise<TiketTerkunci> {
        return kunciBerstatus(scope, id, "DIVERIFIKASI", "Work order hanya dapat dibuat dari laporan kerusakan yang sudah diverifikasi.");
    }

    /**
     * Work order terbentuk → tiket `DALAM_PERBAIKAN`. Tanpa entri log sendiri: m11 §11 tidak punya aksi untuk
     * transisi ini — pembuatan work order tercatat oleh M-12 di transaksi yang sama.
     */
    async tandaiDalamPerbaikan(scope: TransactionScope, id: number): Promise<void> {
        const tiket = await this.tiketUntukWorkOrder(scope, id);
        await createDamageReportRepository(scope.tx).ubahStatus(scope.ctx, tiket.id, "DALAM_PERBAIKAN");
    }

    /** BR-050: penutupan work order menutup tiket asalnya — `DAMAGE_CLOSED`. */
    async tutupDariWorkOrder(scope: TransactionScope, id: number, workOrderId: number): Promise<void> {
        const tiket = await kunciBerstatus(scope, id, "DALAM_PERBAIKAN", "Hanya laporan yang sedang dalam perbaikan yang dapat ditutup oleh work order.");
        await createDamageReportRepository(scope.tx).ubahStatus(scope.ctx, tiket.id, "SELESAI");
        await this.audit.write(scope, {
            modul: MODUL,
            aksi: "DAMAGE_CLOSED",
            entitas: "damage_reports",
            entitasId: tiket.id,
            nilaiSebelum: { status: tiket.status },
            nilaiSesudah: { status: "SELESAI", work_order_id: workOrderId },
        });
    }
}
