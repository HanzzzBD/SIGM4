// Verifikasi & tindak lanjut laporan `POST /damage-reports/{id}/verify` (FR-11.2; PR-03-15, keputusan 21
// log phase-03). Satu transaksi dari tiket `DILAPORKAN`: kondisi aset opsional lewat inti M-04 (langkah 4 /
// A1, riwayat ber-referensi tiket), status hasil, pelaku & waktu verifikasi (SLA SC-07), entri log, dan
// `DamageReportVerified` ke outbox — konsumen M-17 menerbitkan NT-21 ke pelapor (langkah 5).

import type { DamageReportVerified } from "@sigm4/schemas";
import type { Kysely } from "kysely";
import { AssetService } from "../../m04-assets/index.js";
import type { AuditLogger } from "../../../shared/audit/index.js";
import type { AuthContext } from "../../../shared/auth/index.js";
import type { Clock } from "../../../shared/clock/index.js";
import type { Database, StatusLaporanKerusakan } from "../../../shared/db/index.js";
import { withTransaction } from "../../../shared/db/index.js";
import { DomainError, ForbiddenError, NotFoundError } from "../../../shared/errors/index.js";
import { publish } from "../../../shared/events/index.js";
import { createDamageReportRepository } from "../repositories/damage-report.repository.js";

const MODUL = "m11-damage-reports";

/** FR-11.2 langkah 5 — konsumen M-17: NT-21 ke pelapor. */
export const EVENT_KERUSAKAN_DIVERIFIKASI = "DamageReportVerified";

export type KeputusanVerifikasi = "TINDAK_LANJUT" | "PERBAIKAN_RINGAN" | "TOLAK";

export interface IsianVerifikasi {
    readonly keputusan: KeputusanVerifikasi;
    readonly catatan: string | null;
    readonly kondisiAset: { readonly kondisi: "BAIK" | "RUSAK_RINGAN" | "RUSAK_BERAT"; readonly alasan: string | null } | null;
}

/** Keputusan 21b: hasil → status tiket dan aksi log (m11 §11). */
const HASIL: Readonly<Record<KeputusanVerifikasi, { readonly status: StatusLaporanKerusakan; readonly aksi: readonly string[] }>> = {
    TINDAK_LANJUT: { status: "DIVERIFIKASI", aksi: ["DAMAGE_VERIFIED"] },
    PERBAIKAN_RINGAN: { status: "SELESAI", aksi: ["DAMAGE_VERIFIED", "DAMAGE_CLOSED"] },
    TOLAK: { status: "DITOLAK", aksi: ["DAMAGE_REJECTED"] },
};

const galat = (field: string, message: string) => new DomainError("VALIDATION_ERROR", message, { errors: [{ field, message }] });

export class VerificationService {
    constructor(
        private readonly db: Kysely<Database>,
        private readonly clock: Clock,
        private readonly audit: AuditLogger,
    ) {}

    async verifikasi(ctx: AuthContext, id: number, isian: IsianVerifikasi): Promise<DamageReportVerified> {
        return withTransaction(
            ctx,
            async (scope) => {
                const repo = createDamageReportRepository(scope.tx);
                const tiket = await repo.kunci(scope.ctx, id);
                if (tiket === undefined) throw new NotFoundError("Laporan kerusakan tidak ditemukan.");
                // FR-11.2 Preconditions: hanya tiket `DILAPORKAN`; verifikasi serentak kedua menunggu kunci lalu ditolak.
                if (tiket.status !== "DILAPORKAN") throw galat("id", `Laporan ${tiket.nomor} sudah diverifikasi sebelumnya.`);

                let kondisiAset: string | null = null;
                if (isian.kondisiAset !== null) {
                    if (tiket.asset_id === null) throw galat("kondisi_aset", "Laporan atas ruangan tidak memiliki kondisi aset.");
                    // Langkah 4 menuntut hak mengubah kondisi aset itu sendiri (m04 §10), bukan hanya `damage.verify`.
                    if (!ctx.can("asset.update_condition")) throw new ForbiddenError();
                    const aset = await new AssetService(this.db, this.audit, this.clock).ubahKondisiDalam(scope, Number(tiket.asset_id), {
                        kondisi: isian.kondisiAset.kondisi,
                        alasan: isian.kondisiAset.alasan ?? `Verifikasi laporan kerusakan ${tiket.nomor}`,
                        referensiJenis: "damage_report",
                        referensiId: id,
                    });
                    kondisiAset = aset.kondisi;
                }

                const hasil = HASIL[isian.keputusan];
                const waktu = this.clock.now();
                await repo.tetapkanVerifikasi(scope.ctx, tiket.id, { status: hasil.status, catatan: isian.catatan, waktu });
                for (const aksi of hasil.aksi) {
                    await this.audit.write(scope, {
                        modul: MODUL,
                        aksi,
                        entitas: "damage_reports",
                        entitasId: tiket.id,
                        ...(isian.catatan === null ? {} : { keterangan: isian.catatan }),
                        nilaiSebelum: { status: tiket.status },
                        nilaiSesudah: { status: hasil.status, keputusan: isian.keputusan, kondisi_aset: kondisiAset },
                    });
                }
                await publish(scope, {
                    name: EVENT_KERUSAKAN_DIVERIFIKASI,
                    aggregateType: "damage_report",
                    aggregateId: tiket.id,
                    payload: { damage_report_id: id, nomor: tiket.nomor, pelapor_id: Number(tiket.pelapor_id), pelaku_id: ctx.userId, status: hasil.status, catatan: isian.catatan },
                });
                return { id: tiket.id, nomor: tiket.nomor, status: hasil.status, diverifikasi_pada: waktu.toISOString(), kondisi_aset: kondisiAset };
            },
            this.db,
        );
    }
}
