// UserService (FR-02.1). Batas transaksi SDD-07: tulis + AuditLogger.write()
// sinkron di dalam satu transaksi (SDD-EVT-02, AL-01) — tidak ada outbox di sini,
// sebab tidak ada efek yang boleh tertunda pada CRUD pengguna itu sendiri.

import type { Kysely } from "kysely";
import type { AuthContext } from "../../../shared/auth/index.js";
import type { AuditLogger } from "../../../shared/audit/index.js";
import type { Database } from "../../../shared/db/index.js";
import { withTransaction } from "../../../shared/db/index.js";
import { DomainError, NotFoundError } from "../../../shared/errors/index.js";
import { hashPassword } from "../../../shared/security/index.js";
import type {
    ListUsersFilter,
    ListUsersResult,
    UserRow,
} from "../repositories/user.repository.js";
import {
    KODE_ROLE_ADMINISTRATOR,
    createUserRepository,
} from "../repositories/user.repository.js";
import { generateTemporaryPassword } from "./temporary-password.js";

const MODUL = "m02-users";

/**
 * BR-068 + BR-070a (SDD-05 §4.3, keputusan pemilik produk 16 September 2026):
 * sistem wajib memiliki minimal DUA akun Administrator aktif setiap saat —
 * bukan hanya satu. Menonaktifkan akun yang menyisakan kurang dari ini ditolak.
 */
const AMBANG_ADMIN_AKTIF = 2;

export interface CreateUserInput {
    readonly nama: string;
    readonly email: string;
    readonly nipNis: string;
    readonly roleId: number;
    readonly unitKerja: string | null;
    readonly telepon: string | null;
}

export type UpdateUserInput = CreateUserInput;

export interface UpdateStatusInput {
    readonly status: "AKTIF" | "NONAKTIF";
    readonly alasan: string | undefined;
}

export interface CreatedUser {
    readonly user: UserRow;
    readonly passwordSementara: string;
}

function tolakDuplikat(field: "email" | "nip_nis"): never {
    const pesan =
        field === "email" ? "Email sudah digunakan." : "NIP/NIS sudah digunakan.";
    throw new DomainError("DUPLICATE_CODE", pesan, { field });
}

export class UserService {
    constructor(
        private readonly db: Kysely<Database>,
        private readonly audit: AuditLogger,
    ) {}

    async list(ctx: AuthContext, filter: ListUsersFilter): Promise<ListUsersResult> {
        return createUserRepository(this.db).list(ctx, filter);
    }

    async getById(ctx: AuthContext, id: number): Promise<UserRow> {
        const user = await createUserRepository(this.db).findById(ctx, id);
        if (user === undefined) throw new NotFoundError("Pengguna tidak ditemukan.");
        return user;
    }

    /** FR-02.1 langkah 1-5: akun lahir `AKTIF` berpassword sementara (BR-067). */
    async create(ctx: AuthContext, input: CreateUserInput): Promise<CreatedUser> {
        return withTransaction(
            ctx,
            async (scope) => {
                const repo = createUserRepository(scope.tx);
                if (await repo.existsByEmail(scope.ctx, input.email))
                    tolakDuplikat("email");
                if (await repo.existsByNipNis(scope.ctx, input.nipNis))
                    tolakDuplikat("nip_nis");

                const passwordSementara = generateTemporaryPassword({
                    nama: input.nama,
                    email: input.email,
                    nipNis: input.nipNis,
                });
                const passwordHash = await hashPassword(passwordSementara);

                const user = await repo.insert(scope.ctx, {
                    nama: input.nama,
                    email: input.email,
                    nipNis: input.nipNis,
                    roleId: input.roleId,
                    unitKerja: input.unitKerja,
                    telepon: input.telepon,
                    passwordHash,
                });

                await this.audit.write(scope, {
                    modul: MODUL,
                    aksi: "USER_CREATED",
                    entitas: "users",
                    entitasId: user.id,
                    nilaiSesudah: user,
                });

                return { user, passwordSementara };
            },
            this.db,
        );
    }

    /** FR-02.1 langkah 6. */
    async update(
        ctx: AuthContext,
        id: number,
        input: UpdateUserInput,
    ): Promise<UserRow> {
        return withTransaction(
            ctx,
            async (scope) => {
                const repo = createUserRepository(scope.tx);
                const before = await repo.findById(scope.ctx, id);
                if (before === undefined)
                    throw new NotFoundError("Pengguna tidak ditemukan.");

                if (
                    before.email.toLowerCase() !== input.email.toLowerCase() &&
                    (await repo.existsByEmail(scope.ctx, input.email, id))
                )
                    tolakDuplikat("email");
                if (
                    before.nip_nis !== input.nipNis &&
                    (await repo.existsByNipNis(scope.ctx, input.nipNis, id))
                )
                    tolakDuplikat("nip_nis");

                const after = await repo.update(scope.ctx, id, input);

                await this.audit.write(scope, {
                    modul: MODUL,
                    aksi: "USER_UPDATED",
                    entitas: "users",
                    entitasId: id,
                    nilaiSebelum: before,
                    nilaiSesudah: after,
                });

                return after;
            },
            this.db,
        );
    }

    /** FR-02.1 langkah 7, BR-067 (soft delete), BR-068 + BR-070a (admin terakhir). */
    async updateStatus(
        ctx: AuthContext,
        id: number,
        input: UpdateStatusInput,
    ): Promise<UserRow> {
        return withTransaction(
            ctx,
            async (scope) => {
                const repo = createUserRepository(scope.tx);
                const before = await repo.findById(scope.ctx, id);
                if (before === undefined)
                    throw new NotFoundError("Pengguna tidak ditemukan.");

                if (input.status === "NONAKTIF" && before.status === "AKTIF") {
                    const rolKode = await repo.findRoleKode(scope.ctx, id);
                    if (rolKode === KODE_ROLE_ADMINISTRATOR) {
                        const adminAktif = await repo.lockActiveUserIdsByRole(
                            scope.ctx,
                            before.role_id,
                        );
                        if (adminAktif.length <= AMBANG_ADMIN_AKTIF) {
                            throw new DomainError(
                                "VALIDATION_ERROR",
                                "Penonaktifan ditolak — sistem wajib memiliki minimal dua akun Administrator aktif.",
                                { rule: "BR-068+BR-070a" },
                            );
                        }
                    }
                }

                const after = await repo.updateStatus(scope.ctx, id, input.status);

                await this.audit.write(scope, {
                    modul: MODUL,
                    aksi:
                        input.status === "NONAKTIF"
                            ? "USER_DEACTIVATED"
                            : "USER_REACTIVATED",
                    entitas: "users",
                    entitasId: id,
                    nilaiSebelum: before,
                    nilaiSesudah: after,
                    ...(input.alasan === undefined ? {} : { keterangan: input.alasan }),
                });

                return after;
            },
            this.db,
        );
    }
}
