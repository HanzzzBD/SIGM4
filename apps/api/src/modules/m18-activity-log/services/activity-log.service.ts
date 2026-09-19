// ActivityLogService (FR-18.2). Batas transaksi SDD-07: meski operasi
// utamanya BACA, akses terhadap log itu sendiri wajib tercatat sebagai
// `ACTIVITY_LOG_VIEWED` (`m18-activity-log.md` §11) — AuditLogger.write()
// menuntut TransactionScope, sehingga pembacaan dibungkus transaksi sama
// seperti operasi tulis lainnya.

import ExcelJS from "exceljs";
import type { Kysely } from "kysely";
import type { AuthContext } from "../../../shared/auth/index.js";
import type { AuditLogger } from "../../../shared/audit/index.js";
import type { Database } from "../../../shared/db/index.js";
import { withTransaction } from "../../../shared/db/index.js";
import { DomainError } from "../../../shared/errors/index.js";
import type {
    ActivityLogFilter,
    ActivityLogRow,
    ListActivityLogsFilter,
} from "../repositories/activity-log.repository.js";
import { createActivityLogRepository } from "../repositories/activity-log.repository.js";

const MODUL = "m18-activity-log";

/**
 * Cakupan sinkron PR-01-09 (dikonfirmasi pemilik produk 19 September 2026):
 * ekspor dijalankan di dalam permintaan HTTP, BUKAN lewat outbox/worker
 * (SDD-07 §3 "Ekspor & PDF: Asinkron") — `stored_files` (`SDD-09`) dan
 * handler worker ekspor belum ada (ditunda `PR-03-04` dst., pola sama
 * `PR-01-06`/`PR-01-07`). Batas ini menjaga `SDD-PERF-06` ("> 5 detik wajib
 * asinkron") tetap terpenuhi tanpa infrastruktur itu.
 */
export const BATAS_EKSPOR = 5000;

const KOLOM_XLSX: ReadonlyArray<Partial<ExcelJS.Column>> = [
    { header: "ID", key: "id", width: 12 },
    { header: "Waktu", key: "waktu", width: 22 },
    { header: "ID Pengguna", key: "user_id", width: 12 },
    { header: "Nama Pengguna", key: "user_nama", width: 24 },
    { header: "Role", key: "role", width: 20 },
    { header: "Alamat IP", key: "ip", width: 16 },
    { header: "Perangkat", key: "user_agent", width: 28 },
    { header: "Modul", key: "modul", width: 20 },
    { header: "Aksi", key: "aksi", width: 24 },
    { header: "Entitas", key: "entitas", width: 16 },
    { header: "ID Entitas", key: "entitas_id", width: 12 },
    { header: "Nilai Sebelum", key: "nilai_sebelum", width: 40 },
    { header: "Nilai Sesudah", key: "nilai_sesudah", width: 40 },
    { header: "Keterangan", key: "keterangan", width: 30 },
    { header: "Hasil", key: "hasil", width: 10 },
    { header: "Request ID", key: "request_id", width: 16 },
];

function keTeksJson(nilai: unknown): string {
    return nilai === null || nilai === undefined ? "" : JSON.stringify(nilai);
}

/** FR-18.2 langkah 5. Satu sheet, header Bahasa Indonesia (`21.2` struktur entri log). */
async function buatBufferXlsx(rows: readonly ActivityLogRow[]): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Activity Log");
    sheet.columns = [...KOLOM_XLSX];
    for (const baris of rows) {
        sheet.addRow({
            ...baris,
            waktu: baris.waktu.toISOString(),
            nilai_sebelum: keTeksJson(baris.nilai_sebelum),
            nilai_sesudah: keTeksJson(baris.nilai_sesudah),
        });
    }
    // @ts-expect-error — tipe `Buffer` exceljs bertabrakan dengan `Buffer` Node
    // asli (index.d.ts baris 1); runtime-nya mengembalikan Buffer Node biasa.
    return workbook.xlsx.writeBuffer();
}

function ringkasFilter(filter: ActivityLogFilter): Record<string, unknown> {
    return {
        dari: filter.dari?.toISOString(),
        sampai: filter.sampai?.toISOString(),
        user_id: filter.userId,
        role: filter.role,
        modul: filter.modul,
        aksi: filter.aksi,
        entitas: filter.entitas,
        entitas_id: filter.entitasId,
    };
}

export interface ListActivityLogsResult {
    readonly rows: readonly ActivityLogRow[];
    readonly page: number;
    readonly perPage: number;
    readonly total: number;
    readonly totalPages: number;
}

export interface ExportActivityLogsResult {
    readonly buffer: Buffer;
    readonly jumlahBaris: number;
}

export class ActivityLogService {
    constructor(
        private readonly db: Kysely<Database>,
        private readonly audit: AuditLogger,
    ) {}

    /** `GET /activity-logs` (FR-18.2 langkah 2-4). */
    async list(ctx: AuthContext, filter: ListActivityLogsFilter): Promise<ListActivityLogsResult> {
        return withTransaction(
            ctx,
            async (scope) => {
                const repo = createActivityLogRepository(scope.tx);
                const hasil = await repo.list(scope.ctx, filter);

                await this.audit.write(scope, {
                    modul: MODUL,
                    aksi: "ACTIVITY_LOG_VIEWED",
                    nilaiSesudah: {
                        filter: ringkasFilter(filter),
                        halaman: filter.page,
                        jumlah_hasil: hasil.total,
                    },
                });

                return {
                    rows: hasil.rows,
                    page: filter.page,
                    perPage: filter.perPage,
                    total: hasil.total,
                    totalPages: Math.max(1, Math.ceil(hasil.total / filter.perPage)),
                };
            },
            this.db,
        );
    }

    /**
     * `GET /activity-logs/export` (FR-18.2 langkah 5, AL-10). Sinkron — lihat
     * `BATAS_EKSPOR`. Melebihi batas ditolak SEBELUM baris diambil, sejalan
     * A1 ("hasil filter sangat besar... menyarankan penyempitan rentang").
     */
    async export(ctx: AuthContext, filter: ActivityLogFilter): Promise<ExportActivityLogsResult> {
        return withTransaction(
            ctx,
            async (scope) => {
                const repo = createActivityLogRepository(scope.tx);
                const rows = await repo.listForExport(scope.ctx, filter, BATAS_EKSPOR + 1);
                if (rows.length > BATAS_EKSPOR) {
                    throw new DomainError(
                        "VALIDATION_ERROR",
                        `Hasil filter melebihi ${BATAS_EKSPOR} baris. Persempit rentang tanggal atau filter lainnya sebelum mengekspor.`,
                        { rule: "FR-18.2-A1" },
                    );
                }

                const buffer = await buatBufferXlsx(rows);

                await this.audit.write(scope, {
                    modul: MODUL,
                    aksi: "ACTIVITY_LOG_EXPORTED",
                    nilaiSesudah: {
                        filter: ringkasFilter(filter),
                        jumlah_baris: rows.length,
                    },
                });

                return { buffer, jumlahBaris: rows.length };
            },
            this.db,
        );
    }
}
