// WorkUnitService (Lampiran E.3, WU-01, WU-02, SDD-05 §4.7c). Batas transaksi
// SDD-07: perubahan dan entri log (§11) satu transaksi. Tidak ada hapus (WU-02):
// unit yang pernah dipakai hanya dinonaktifkan.

import type { Kysely } from "kysely";
import type { AuthContext } from "../../../shared/auth/index.js";
import type { AuditLogger } from "../../../shared/audit/index.js";
import type { Database } from "../../../shared/db/index.js";
import { withTransaction } from "../../../shared/db/index.js";
import { NotFoundError } from "../../../shared/errors/index.js";
import { createWorkUnitRepository } from "../repositories/work-unit.repository.js";
import type {
    ListWorkUnitsFilter,
    StatusUnit,
    WorkUnitData,
    WorkUnitRepository,
    WorkUnitRow,
} from "../repositories/work-unit.repository.js";
import { MODUL, duplikat, tolak } from "./rules.js";

export interface ListWorkUnitsResult {
    readonly rows: readonly WorkUnitRow[];
    readonly page: number;
    readonly perPage: number;
    readonly total: number;
    readonly totalPages: number;
}

function snapshot(u: WorkUnitRow): Record<string, unknown> {
    return { nama: u.nama, kode: u.kode, jenis: u.jenis, kepala_unit_id: u.kepala_unit_id, status: u.status };
}

export class WorkUnitService {
    constructor(
        private readonly db: Kysely<Database>,
        private readonly audit: AuditLogger,
    ) {}

    async list(ctx: AuthContext, filter: ListWorkUnitsFilter): Promise<ListWorkUnitsResult> {
        const { rows, total } = await createWorkUnitRepository(this.db).list(ctx, filter);
        return {
            rows,
            page: filter.page,
            perPage: filter.perPage,
            total,
            totalPages: Math.max(1, Math.ceil(total / filter.perPage)),
        };
    }

    async create(ctx: AuthContext, input: WorkUnitData): Promise<WorkUnitRow> {
        return withTransaction(
            ctx,
            async (scope) => {
                const repo = createWorkUnitRepository(scope.tx);
                await this.validasi(repo, ctx, input);
                const baris = await repo.insert(ctx, input);
                await this.audit.write(scope, {
                    modul: MODUL,
                    aksi: "WORK_UNIT_CREATED",
                    entitas: "work_units",
                    entitasId: baris.id,
                    nilaiSesudah: snapshot(baris),
                });
                return baris;
            },
            this.db,
        );
    }

    async update(ctx: AuthContext, id: number, input: WorkUnitData): Promise<WorkUnitRow> {
        return withTransaction(
            ctx,
            async (scope) => {
                const repo = createWorkUnitRepository(scope.tx);
                const sebelum = await repo.findById(ctx, id);
                if (sebelum === undefined) throw new NotFoundError("Unit kerja tidak ditemukan.");
                await this.validasi(repo, ctx, input, id);
                // SDD-05 §4.7d: `kelas_id` wajib menunjuk unit berjenis KELAS.
                if (sebelum.jenis === "KELAS" && input.jenis !== "KELAS" && (await repo.dipakaiSebagaiKelas(ctx, id))) {
                    tolak("Jenis unit tidak dapat diubah dari Kelas: masih dipakai sebagai kelas siswa.", "jenis");
                }

                const sesudah = await repo.update(ctx, id, input);
                if (JSON.stringify(snapshot(sebelum)) === JSON.stringify(snapshot(sesudah))) return sesudah;
                await this.audit.write(scope, {
                    modul: MODUL,
                    aksi: "WORK_UNIT_UPDATED",
                    entitas: "work_units",
                    entitasId: id,
                    nilaiSebelum: snapshot(sebelum),
                    nilaiSesudah: snapshot(sesudah),
                });
                return sesudah;
            },
            this.db,
        );
    }

    /** Aktifkan/nonaktifkan (WU-02). Status yang sama tidak mengubah apa pun dan tidak dicatat. */
    async updateStatus(ctx: AuthContext, id: number, status: StatusUnit): Promise<WorkUnitRow> {
        return withTransaction(
            ctx,
            async (scope) => {
                const repo = createWorkUnitRepository(scope.tx);
                const sebelum = await repo.findById(ctx, id);
                if (sebelum === undefined) throw new NotFoundError("Unit kerja tidak ditemukan.");
                if (sebelum.status === status) return sebelum;

                const sesudah = await repo.setStatus(ctx, id, status);
                await this.audit.write(scope, {
                    modul: MODUL,
                    aksi: status === "NONAKTIF" ? "WORK_UNIT_DEACTIVATED" : "WORK_UNIT_REACTIVATED",
                    entitas: "work_units",
                    entitasId: id,
                    nilaiSebelum: { status: sebelum.status },
                    nilaiSesudah: { status: sesudah.status },
                });
                return sesudah;
            },
            this.db,
        );
    }

    private async validasi(repo: WorkUnitRepository, ctx: AuthContext, input: WorkUnitData, kecualiId?: number): Promise<void> {
        if (await repo.kodeSudahDipakai(ctx, input.kode, kecualiId)) duplikat("Kode unit kerja sudah digunakan.", "kode");
        if (await repo.namaSudahDipakai(ctx, input.nama, kecualiId)) duplikat("Nama unit kerja sudah digunakan.", "nama");
        if (input.kepalaUnitId !== null && !(await repo.penggunaAda(ctx, input.kepalaUnitId))) {
            tolak("Kepala unit tidak ditemukan.", "kepala_unit_id");
        }
    }
}
