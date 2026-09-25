// Repository profil & ganti password sendiri (FR-01.4, SDD-AUTH-05). Semua metode terbatas
// pada baris milik pemanggil sendiri (`ctx.userId`) — scope `own`, tidak menerima id lain.
//
// PRIVAT terhadap modul (SDD-SYS-03).

import type { AuthContext } from "../../../shared/auth/index.js";
import { BaseRepository, defineRepository } from "../../../shared/db/index.js";
import type { QueryExecutor } from "../../../shared/db/index.js";

export interface ProfilRow {
    readonly id: string;
    readonly nama: string;
    readonly email: string;
    readonly telepon: string | null;
    readonly role_kode: string;
    readonly must_change_password: boolean;
}

/** Bahan verifikasi password lama dan kebijakan password baru (`NFR-S-03a`). */
export interface KredensialRow {
    readonly password_hash: string;
    readonly nama: string;
    readonly email: string;
    readonly nip_nis: string;
}

export interface PembaruanProfil {
    readonly nama?: string | undefined;
    readonly telepon?: string | null | undefined;
}

export class ProfileRepository extends BaseRepository {
    constructor(executor: QueryExecutor) {
        super(executor);
    }

    async ambil(ctx: AuthContext): Promise<ProfilRow | undefined> {
        return this.query(ctx)
            .selectFrom("users as u")
            .innerJoin("roles as r", "r.id", "u.role_id")
            .select(["u.id", "u.nama", "u.email", "u.telepon", "r.kode as role_kode", "u.must_change_password"])
            .where("u.id", "=", String(ctx.userId))
            .executeTakeFirst();
    }

    /** FR-01.4 langkah 5: nama/telepon saja — email dan role tidak diterima di sini (BR-069). */
    async perbarui(ctx: AuthContext, input: PembaruanProfil): Promise<ProfilRow> {
        await this.query(ctx)
            .updateTable("users")
            .set({
                ...(input.nama === undefined ? {} : { nama: input.nama }),
                ...(input.telepon === undefined ? {} : { telepon: input.telepon }),
            })
            .where("id", "=", String(ctx.userId))
            .execute();
        const setelah = await this.ambil(ctx);
        if (setelah === undefined) throw new Error("Profil tidak ditemukan setelah diperbarui.");
        return setelah;
    }

    /** Mengunci baris pemanggil untuk ganti password (FR-01.4 langkah 2-4): serialisasi permintaan serentak. */
    async kunciUntukGantiPassword(ctx: AuthContext): Promise<KredensialRow | undefined> {
        return this.query(ctx)
            .selectFrom("users")
            .select(["password_hash", "nama", "email", "nip_nis"])
            .where("id", "=", String(ctx.userId))
            .forUpdate()
            .executeTakeFirst();
    }

    async simpanPasswordBaru(ctx: AuthContext, hash: string): Promise<void> {
        await this.query(ctx)
            .updateTable("users")
            .set({ password_hash: hash, must_change_password: false })
            .where("id", "=", String(ctx.userId))
            .execute();
    }

    /**
     * Penerbitan reset password milik pemanggil yang masih `DITERBITKAN`, dikunci. Bila ada,
     * password baru ini menyelesaikannya (FR-01.3 -> `NT-38a`, `phase-02.md` §3 keputusan `PR-02-06`).
     */
    async kunciPenerbitanDiterbitkan(ctx: AuthContext): Promise<{ readonly id: string } | undefined> {
        return this.query(ctx)
            .selectFrom("password_reset_requests")
            .select("id")
            .where("user_id", "=", String(ctx.userId))
            .where("status", "=", "DITERBITKAN")
            .orderBy("diproses_pada", "desc")
            .orderBy("id", "desc")
            .limit(1)
            .forUpdate()
            .executeTakeFirst();
    }

    async tandaiSelesai(ctx: AuthContext, id: string): Promise<void> {
        await this.query(ctx)
            .updateTable("password_reset_requests")
            .set({ status: "SELESAI" })
            .where("id", "=", id)
            .where("status", "=", "DITERBITKAN")
            .execute();
    }
}

/** Pintu masuk repository: `defineRepository` menolak metode yang tidak menerima `AuthContext` (SDD-AUTH-02). */
export function createProfileRepository(executor: QueryExecutor): ProfileRepository {
    return defineRepository(new ProfileRepository(executor));
}
