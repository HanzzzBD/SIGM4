// CategoryService (FR-04.5, `m04-assets.md` §7). Tulis: validasi + tulis +
// `AuditLogger.write()` sinkron dalam SATU transaksi (SDD-EVT-02, AL-01); tanpa
// efek tertunda, jadi tanpa outbox. A3/A4 diputuskan pemilik produk (keputusan
// 62 log phase-02) dan dinaikkan ke PRD lebih dulu.

import type { Kysely } from "kysely";
import type { AuditLogger } from "../../../shared/audit/index.js";
import type { AuthContext } from "../../../shared/auth/index.js";
import type { Database } from "../../../shared/db/index.js";
import { withTransaction } from "../../../shared/db/index.js";
import type { TransactionScope } from "../../../shared/db/index.js";
import { DomainError, NotFoundError } from "../../../shared/errors/index.js";
import type {
    CategoryRepository,
    KategoriAsetRow,
    KategoriFields,
} from "../repositories/category.repository.js";
import { createCategoryRepository } from "../repositories/category.repository.js";

const MODUL = "m04-assets";

export interface ListKategoriOutput {
    readonly rows: readonly KategoriAsetRow[];
    readonly page: number;
    readonly perPage: number;
    readonly total: number;
    readonly totalPages: number;
}

export class CategoryService {
    constructor(
        private readonly db: Kysely<Database>,
        private readonly audit: AuditLogger,
    ) {}

    /** `GET /asset-categories` — terurut kode. */
    async list(
        ctx: AuthContext,
        page: number,
        perPage: number,
    ): Promise<ListKategoriOutput> {
        const { rows, total } = await createCategoryRepository(this.db).list(
            ctx,
            page,
            perPage,
        );
        return {
            rows,
            page,
            perPage,
            total,
            totalPages: total === 0 ? 1 : Math.ceil(total / perPage),
        };
    }

    /** `POST /asset-categories` (FR-04.5 langkah 2-3, A1). */
    async buat(
        ctx: AuthContext,
        input: KategoriFields,
    ): Promise<KategoriAsetRow> {
        return withTransaction(
            ctx,
            async (scope) => {
                const repo = createCategoryRepository(scope.tx);
                await this.periksaKodeUnik(repo, scope, input.kode, null);
                if (input.parentId !== null)
                    await this.periksaIndukAda(repo, scope, input.parentId);

                const kategori = await repo.insert(scope.ctx, input);
                await this.audit.write(scope, {
                    modul: MODUL,
                    aksi: "CATEGORY_CREATED",
                    entitas: "asset_categories",
                    entitasId: kategori.id,
                    nilaiSesudah: kategori,
                });
                return kategori;
            },
            this.db,
        );
    }

    /** `PUT /asset-categories/{id}` — A1 (kode unik), A4 (kode kategori terpakai tetap). */
    async ubah(
        ctx: AuthContext,
        id: number,
        input: KategoriFields,
    ): Promise<KategoriAsetRow> {
        return withTransaction(
            ctx,
            async (scope) => {
                const repo = createCategoryRepository(scope.tx);
                const lama = await repo.findById(scope.ctx, id);
                if (lama === undefined)
                    throw new NotFoundError("Kategori aset tidak ditemukan.");

                if (input.kode !== lama.kode) {
                    await this.periksaKodeUnik(repo, scope, input.kode, id);
                    const jumlahAset = await repo.countAssets(scope.ctx, id);
                    if (jumlahAset > 0) {
                        throw new DomainError(
                            "VALIDATION_ERROR",
                            `Kode kategori tidak dapat diubah: sudah dipakai ${jumlahAset} aset (kode aset tidak berubah, BR-002).`,
                            { field: "kode" },
                        );
                    }
                }
                if (input.parentId !== null) {
                    await this.periksaIndukAda(repo, scope, input.parentId);
                    if (await repo.wouldCycle(scope.ctx, id, input.parentId)) {
                        throw new DomainError(
                            "VALIDATION_ERROR",
                            "Kategori induk tidak boleh kategori itu sendiri atau salah satu subkategorinya.",
                            { field: "parent_id" },
                        );
                    }
                }

                const baru = await repo.update(scope.ctx, id, input);
                await this.audit.write(scope, {
                    modul: MODUL,
                    aksi: "CATEGORY_UPDATED",
                    entitas: "asset_categories",
                    entitasId: String(id),
                    nilaiSebelum: lama,
                    nilaiSesudah: baru,
                });
                return baru;
            },
            this.db,
        );
    }

    /** `DELETE /asset-categories/{id}` — A2 (dipakai aset), A3 (punya subkategori). */
    async hapus(ctx: AuthContext, id: number): Promise<void> {
        await withTransaction(
            ctx,
            async (scope) => {
                const repo = createCategoryRepository(scope.tx);
                const lama = await repo.findById(scope.ctx, id);
                if (lama === undefined)
                    throw new NotFoundError("Kategori aset tidak ditemukan.");

                const jumlahAset = await repo.countAssets(scope.ctx, id);
                if (jumlahAset > 0) {
                    throw new DomainError(
                        "VALIDATION_ERROR",
                        `Kategori masih dipakai ${jumlahAset} aset dan tidak dapat dihapus.`,
                        { rule: "FR-04.5 A2", jumlah_aset: jumlahAset },
                    );
                }
                const jumlahAnak = await repo.countChildren(scope.ctx, id);
                if (jumlahAnak > 0) {
                    throw new DomainError(
                        "VALIDATION_ERROR",
                        `Kategori masih memiliki ${jumlahAnak} subkategori; pindahkan atau hapus subkategorinya lebih dulu.`,
                        { rule: "FR-04.5 A3", jumlah_subkategori: jumlahAnak },
                    );
                }

                await repo.delete(scope.ctx, id);
                await this.audit.write(scope, {
                    modul: MODUL,
                    aksi: "CATEGORY_DELETED",
                    entitas: "asset_categories",
                    entitasId: String(id),
                    nilaiSebelum: lama,
                });
            },
            this.db,
        );
    }

    private async periksaKodeUnik(
        repo: CategoryRepository,
        scope: TransactionScope,
        kode: string,
        kecualiId: number | null,
    ): Promise<void> {
        if (await repo.existsKode(scope.ctx, kode, kecualiId)) {
            throw new DomainError(
                "DUPLICATE_CODE",
                "Kode kategori sudah digunakan.",
                { field: "kode" },
            );
        }
    }

    private async periksaIndukAda(
        repo: CategoryRepository,
        scope: TransactionScope,
        parentId: number,
    ): Promise<void> {
        if ((await repo.findById(scope.ctx, parentId)) === undefined) {
            throw new DomainError(
                "VALIDATION_ERROR",
                "Kategori induk tidak ditemukan.",
                { field: "parent_id" },
            );
        }
    }
}
