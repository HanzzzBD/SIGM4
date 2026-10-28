// CalendarService: hari libur dan hari kerja sekolah (Lampiran E.2, CAL-01).
// Batas transaksi SDD-07: perubahan dan entri log (§11) satu transaksi.

import type { Kysely } from "kysely";
import type { AuthContext } from "../../../shared/auth/index.js";
import type { AuditLogger } from "../../../shared/audit/index.js";
import type { Database } from "../../../shared/db/index.js";
import { withTransaction } from "../../../shared/db/index.js";
import { NotFoundError } from "../../../shared/errors/index.js";
import { createCalendarRepository } from "../repositories/calendar.repository.js";
import type { CalendarRepository, HolidayData, HolidayRow, WorkDayRow } from "../repositories/calendar.repository.js";
import { MODUL, duplikat, tolak } from "./rules.js";

export interface ListHolidaysResult {
    readonly rows: readonly HolidayRow[];
    readonly page: number;
    readonly perPage: number;
    readonly total: number;
    readonly totalPages: number;
}

function snapshot(h: HolidayRow): Record<string, unknown> {
    return { tanggal: h.tanggal, nama: h.nama, jenis: h.jenis, academic_year_id: h.academic_year_id };
}

export class CalendarService {
    constructor(
        private readonly db: Kysely<Database>,
        private readonly audit: AuditLogger,
    ) {}

    async listHolidays(
        ctx: AuthContext,
        filter: { readonly page: number; readonly perPage: number; readonly academicYearId?: number },
    ): Promise<ListHolidaysResult> {
        const { rows, total } = await createCalendarRepository(this.db).listHolidays(ctx, filter);
        return {
            rows,
            page: filter.page,
            perPage: filter.perPage,
            total,
            totalPages: Math.max(1, Math.ceil(total / filter.perPage)),
        };
    }

    async createHoliday(ctx: AuthContext, input: HolidayData): Promise<HolidayRow> {
        return withTransaction(
            ctx,
            async (scope) => {
                const repo = createCalendarRepository(scope.tx);
                await this.validasiLibur(repo, ctx, input);
                const baris = await repo.insertHoliday(ctx, input);
                await this.audit.write(scope, {
                    modul: MODUL,
                    aksi: "HOLIDAY_CREATED",
                    entitas: "holidays",
                    entitasId: baris.id,
                    nilaiSesudah: snapshot(baris),
                });
                return baris;
            },
            this.db,
        );
    }

    async updateHoliday(ctx: AuthContext, id: number, input: HolidayData): Promise<HolidayRow> {
        return withTransaction(
            ctx,
            async (scope) => {
                const repo = createCalendarRepository(scope.tx);
                const sebelum = await repo.findHoliday(ctx, id);
                if (sebelum === undefined) throw new NotFoundError("Hari libur tidak ditemukan.");
                await this.validasiLibur(repo, ctx, input, id);

                const sesudah = await repo.updateHoliday(ctx, id, input);
                if (JSON.stringify(snapshot(sebelum)) === JSON.stringify(snapshot(sesudah))) return sesudah;
                await this.audit.write(scope, {
                    modul: MODUL,
                    aksi: "HOLIDAY_UPDATED",
                    entitas: "holidays",
                    entitasId: id,
                    nilaiSebelum: snapshot(sebelum),
                    nilaiSesudah: snapshot(sesudah),
                });
                return sesudah;
            },
            this.db,
        );
    }

    async deleteHoliday(ctx: AuthContext, id: number): Promise<void> {
        await withTransaction(
            ctx,
            async (scope) => {
                const repo = createCalendarRepository(scope.tx);
                const sebelum = await repo.findHoliday(ctx, id);
                if (sebelum === undefined) throw new NotFoundError("Hari libur tidak ditemukan.");
                await repo.deleteHoliday(ctx, id);
                await this.audit.write(scope, {
                    modul: MODUL,
                    aksi: "HOLIDAY_DELETED",
                    entitas: "holidays",
                    entitasId: id,
                    nilaiSebelum: snapshot(sebelum),
                });
            },
            this.db,
        );
    }

    async workDays(ctx: AuthContext): Promise<readonly WorkDayRow[]> {
        return createCalendarRepository(this.db).workDays(ctx);
    }

    /** Pengganti penuh ketujuh hari; hanya hari yang berubah ditulis, dan tanpa perubahan tidak ada entri log. */
    async updateWorkDays(ctx: AuthContext, hariKerja: readonly WorkDayRow[]): Promise<readonly WorkDayRow[]> {
        // Tanpa satu pun hari aktif, `BusinessCalendarService` (CAL-01) tidak pernah menemukan
        // hari kerja dan SLA persetujuan tidak dapat dihitung.
        if (!hariKerja.some((h) => h.aktif)) tolak("Minimal satu hari kerja harus aktif.", "hari_kerja");
        return withTransaction(
            ctx,
            async (scope) => {
                const repo = createCalendarRepository(scope.tx);
                const sebelum = await repo.workDays(ctx);
                const lama = new Map(sebelum.map((h) => [h.hari, h.aktif] as const));
                const berubah = hariKerja.filter((h) => lama.get(h.hari) !== h.aktif);
                if (berubah.length === 0) return sebelum;

                for (const h of berubah) await repo.setWorkDay(ctx, h.hari, h.aktif);
                const sesudah = await repo.workDays(ctx);
                await this.audit.write(scope, {
                    modul: MODUL,
                    aksi: "WORK_DAYS_UPDATED",
                    entitas: "work_days",
                    nilaiSebelum: { hari_kerja: sebelum },
                    nilaiSesudah: { hari_kerja: sesudah },
                });
                return sesudah;
            },
            this.db,
        );
    }

    private async validasiLibur(repo: CalendarRepository, ctx: AuthContext, input: HolidayData, kecualiId?: number): Promise<void> {
        if (input.academicYearId !== null && !(await repo.tahunAjaranAda(ctx, input.academicYearId))) {
            tolak("Tahun ajaran tidak ditemukan.", "academic_year_id");
        }
        if (await repo.tanggalSudahDipakai(ctx, input.tanggal, kecualiId)) {
            duplikat("Tanggal tersebut sudah terdaftar sebagai hari libur.", "tanggal");
        }
    }
}
