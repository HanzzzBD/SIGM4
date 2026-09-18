// ActivityLogService (FR-18.2). Batas transaksi SDD-07: meski operasi
// utamanya BACA, akses terhadap log itu sendiri wajib tercatat sebagai
// `ACTIVITY_LOG_VIEWED` (`m18-activity-log.md` §11) — AuditLogger.write()
// menuntut TransactionScope, sehingga pembacaan dibungkus transaksi sama
// seperti operasi tulis lainnya.

import type { Kysely } from "kysely";
import type { AuthContext } from "../../../shared/auth/index.js";
import type { AuditLogger } from "../../../shared/audit/index.js";
import type { Database } from "../../../shared/db/index.js";
import { withTransaction } from "../../../shared/db/index.js";
import type {
    ActivityLogRow,
    ListActivityLogsFilter,
} from "../repositories/activity-log.repository.js";
import { createActivityLogRepository } from "../repositories/activity-log.repository.js";

const MODUL = "m18-activity-log";

export interface ListActivityLogsResult {
    readonly rows: readonly ActivityLogRow[];
    readonly page: number;
    readonly perPage: number;
    readonly total: number;
    readonly totalPages: number;
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
                        filter: {
                            dari: filter.dari?.toISOString(),
                            sampai: filter.sampai?.toISOString(),
                            user_id: filter.userId,
                            role: filter.role,
                            modul: filter.modul,
                            aksi: filter.aksi,
                            entitas: filter.entitas,
                            entitas_id: filter.entitasId,
                        },
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
}
