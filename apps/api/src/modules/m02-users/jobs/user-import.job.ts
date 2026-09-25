// Pekerjaan asinkron impor pengguna (IMPT-04, JOB-01, JOB-06). Modul ini tidak
// mengenal BullMQ: entrypoint worker yang memasangnya ke antrean dan ke handler
// outbox, sehingga batas modul tetap bersih (SDD-SYS-03).

import { z } from "zod";
import type { Kysely } from "kysely";
import { createAuthContext } from "../../../shared/auth/index.js";
import type { EffectivePermissions } from "../../../shared/auth/index.js";
import type { Database } from "../../../shared/db/index.js";
import type { Logger } from "../../../shared/observability/index.js";
import type { UserImportService } from "../services/user-import.service.js";

/** Nama pekerjaan pada antrean `sigm4-jobs` dan pada registri worker. */
export const NAMA_PEKERJAAN_IMPOR = "user-import";

const DataPekerjaanSchema = z.object({
    job_id: z.union([z.string().regex(/^\d+$/), z.number().int().positive()]),
    oleh: z.number().int().positive(),
});

export type DataPekerjaanImpor = z.infer<typeof DataPekerjaanSchema>;

/** `jobId` BullMQ: satu pekerjaan impor = paling banyak satu job antrean (event outbox at-least-once, SDD-EVT-07). */
export function idJobAntreanImpor(jobId: string | number): string {
    return `${NAMA_PEKERJAAN_IMPOR}-${String(jobId)}`;
}

export interface PembacaPermission {
    load(userId: number): Promise<EffectivePermissions | undefined>;
}

const PESAN_TIDAK_BERWENANG = "Pengunggah tidak lagi berwenang mengimpor pengguna.";
const PESAN_GALAT_SISTEM = "Pemrosesan berhenti karena kesalahan sistem; unggah ulang berkas.";

export class UserImportRunner {
    constructor(
        private readonly db: Kysely<Database>,
        private readonly permissions: PembacaPermission,
        private readonly service: UserImportService,
        private readonly logger: Logger,
    ) {}

    /**
     * Menjalankan satu pekerjaan atas nama pengunggahnya. `akhir` true pada
     * percobaan terakhir BullMQ (JOB-06): bila masih gagal, pekerjaan ditutup
     * GAGAL agar tidak menggantung BERJALAN selamanya.
     */
    async run(data: unknown, akhir: boolean): Promise<void> {
        const { job_id: jobId, oleh } = DataPekerjaanSchema.parse(data);
        const id = Number(jobId);

        const efektif = await this.permissions.load(oleh);
        if (efektif === undefined) {
            throw new Error(`Pengunggah impor tidak ditemukan: ${String(oleh)}`);
        }
        // AuthContext dibangun ulang dari basis data pada saat pekerjaan berjalan,
        // bukan dipercaya dari waktu unggah: peran yang dicabut atau akun yang
        // dinonaktifkan di antaranya membuat pekerjaan berhenti (PM-05).
        const ctx = createAuthContext({
            userId: oleh,
            roleCode: efektif.roleCode,
            scopes: efektif.scopes,
        });
        const pengunggah = await this.db
            .selectFrom("users")
            .select("status")
            .where("id", "=", String(oleh))
            .executeTakeFirst();
        if (pengunggah?.status !== "AKTIF" || !ctx.can("user.create")) {
            await this.service.gagalkan(ctx, id, PESAN_TIDAK_BERWENANG);
            return;
        }

        try {
            await this.service.jalankan(ctx, id);
        } catch (galat) {
            if (akhir) {
                try {
                    await this.service.gagalkan(ctx, id, PESAN_GALAT_SISTEM);
                } catch (galatTutup) {
                    this.logger.error("Gagal menutup pekerjaan impor", galatTutup, { job_id: id });
                }
            }
            throw galat;
        }
    }
}
