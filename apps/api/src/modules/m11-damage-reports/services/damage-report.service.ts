// Pelaporan kerusakan `POST /damage-reports` dan `GET /damage-reports/open` (FR-11.1, BR-044; PR-03-14,
// keputusan 20 log phase-03). Satu transaksi: nomor KRS, tiket `DILAPORKAN`, foto ditautkan, entri
// `DAMAGE_REPORTED`, dan `DamageReported` ke outbox — konsumen M-17 menerbitkan NT-19/NT-20 (SDD-07).
// Kondisi aset TIDAK berubah di sini (Post Conditions: baru setelah verifikasi, FR-11.2).

import type { DamageReportCreated, DamageReportOpen } from "@sigm4/schemas";
import type { Kysely } from "kysely";
import { tautkanFotoKerusakan } from "../../m06-documents/index.js";
import type { AuditLogger } from "../../../shared/audit/index.js";
import type { AuthContext } from "../../../shared/auth/index.js";
import { BusinessCalendarService } from "../../../shared/calendar/index.js";
import type { Clock } from "../../../shared/clock/index.js";
import type { Database, UrgensiKerusakan } from "../../../shared/db/index.js";
import { withTransaction } from "../../../shared/db/index.js";
import { DomainError } from "../../../shared/errors/index.js";
import { publish } from "../../../shared/events/index.js";
import { DocumentNumberService } from "../../../shared/numbering/index.js";
import { createDamageReportRepository } from "../repositories/damage-report.repository.js";
import type { ObjekLaporan, TiketTerbuka } from "../repositories/damage-report.repository.js";

const MODUL = "m11-damage-reports";

/** FR-11.1 langkah 5 — konsumen M-17: NT-19, atau NT-20 bila `KRITIS` (keputusan 20d). */
export const EVENT_KERUSAKAN_DILAPORKAN = "DamageReported";

export interface IsianLaporan extends ObjekLaporan {
    readonly deskripsi: string;
    readonly urgensi: UrgensiKerusakan;
    readonly fotoFileIds: readonly number[];
}

const fieldObjek = (o: ObjekLaporan): string => (o.assetId !== undefined ? "asset_id" : "room_id");

function ringkas(ctx: AuthContext, t: TiketTerbuka): DamageReportOpen {
    return { id: t.id, nomor: t.nomor, status: t.status, urgensi: t.urgensi, dilaporkan_pada: t.created_at.toISOString(), milik_sendiri: t.pelapor_id === String(ctx.userId) };
}

export class DamageReportService {
    constructor(
        private readonly db: Kysely<Database>,
        private readonly clock: Clock,
        private readonly audit: AuditLogger,
        private readonly kalender: BusinessCalendarService = new BusinessCalendarService(),
    ) {}

    /**
     * FR-11.1 A1: ringkasan tiket terbuka atas objek — tanpa identitas pelapor maupun isi laporan,
     * sehingga pengguna ber-scope `own` pun dapat ditawari tiket eksisting (keputusan 20e).
     */
    async terbuka(ctx: AuthContext, o: ObjekLaporan): Promise<DamageReportOpen | null> {
        const t = await createDamageReportRepository(this.db).terbuka(ctx, o);
        return t === undefined ? null : ringkas(ctx, t);
    }

    async buat(ctx: AuthContext, isian: IsianLaporan): Promise<DamageReportCreated> {
        return withTransaction(
            ctx,
            async (scope) => {
                const repo = createDamageReportRepository(scope.tx);
                const field = fieldObjek(isian);
                const objek = await repo.objek(scope.ctx, isian);
                if (objek === undefined) {
                    const pesan = field === "asset_id" ? "Aset tidak ditemukan atau sudah dihapuskan." : "Ruangan tidak ditemukan atau nonaktif.";
                    throw new DomainError("VALIDATION_ERROR", pesan, { errors: [{ field, message: pesan }] });
                }
                // FR-11.1 A1 (keputusan 20c): tidak membuat duplikat. Balapan dua pelapor ditangkap indeks
                // unik parsial 0048 → 23505 → DUPLICATE_CODE yang sama.
                const ada = await repo.terbuka(scope.ctx, isian);
                if (ada !== undefined) {
                    const pesan = `Sudah ada laporan ${ada.nomor} yang masih terbuka untuk objek ini. Tambahkan informasi ke laporan tersebut.`;
                    throw new DomainError("DUPLICATE_CODE", pesan, { errors: [{ field, message: pesan }] });
                }

                // SEQ-02: nomor dari penghitung di transaksi yang sama.
                const nomor = await new DocumentNumberService(this.clock).next(scope.tx, "KRS");
                // FR-11.3 / SC-07: tenggat tindak lanjut absolut sejak lapor (0050, pola SDD-APR-07).
                const batasSla = await this.kalender.endOfNthWorkingDayAfter(scope.tx, this.clock.now(), await repo.slaHari(scope.ctx, isian.urgensi));
                const id = await repo.buat(scope.ctx, { ...isian, nomor, batasSla });
                // BR-044: minimal satu foto (skema); di sini dipastikan foto itu milik pelapor dan berjenis benar.
                const fotoTertunda = await tautkanFotoKerusakan(scope, isian.fotoFileIds, Number(id));
                await repo.tambahFoto(scope.ctx, id, isian.fotoFileIds);

                await this.audit.write(scope, {
                    modul: MODUL,
                    aksi: "DAMAGE_REPORTED",
                    entitas: "damage_reports",
                    entitasId: id,
                    nilaiSesudah: { nomor, asset_id: isian.assetId ?? null, room_id: isian.roomId ?? null, urgensi: isian.urgensi, status: "DILAPORKAN", foto: isian.fotoFileIds.length, foto_tertunda: fotoTertunda },
                });
                await publish(scope, {
                    name: EVENT_KERUSAKAN_DILAPORKAN,
                    aggregateType: "damage_report",
                    aggregateId: id,
                    payload: { damage_report_id: Number(id), nomor, urgensi: isian.urgensi, pelapor_id: scope.ctx.userId, objek: objek.label, lokasi: objek.lokasi },
                });
                return { id, nomor, status: "DILAPORKAN" as const, foto_tertunda: fotoTertunda };
            },
            this.db,
        );
    }
}
