// Pendaftaran & pencabutan token perangkat (FR-17.2 langkah 1, AC "token dihapus saat
// logout", MOB-SEC-05; keputusan 80b). M-17 §11: tanpa aksi activity log khusus.

import type { Kysely } from "kysely";
import type { AuthContext } from "../../../shared/auth/index.js";
import type { Clock } from "../../../shared/clock/index.js";
import type { Database } from "../../../shared/db/index.js";
import { withTransaction } from "../../../shared/db/index.js";
import { DomainError, NotFoundError } from "../../../shared/errors/index.js";
import type { TokenPerangkat } from "../repositories/device-token.repository.js";
import { createDeviceTokenRepository } from "../repositories/device-token.repository.js";

export class DeviceTokenService {
    constructor(
        private readonly db: Kysely<Database>,
        private readonly clock: Clock,
    ) {}

    /** `familyId` = klaim `sid` sesi pemanggil — token dicabut bersama sesi itu (MOB-SEC-05). */
    async daftarkan(ctx: AuthContext, familyId: string | undefined, token: string, platform: "ANDROID" | "IOS"): Promise<TokenPerangkat> {
        if (familyId === undefined) {
            throw new DomainError("VALIDATION_ERROR", "Token perangkat hanya dapat didaftarkan dari sesi login aplikasi mobile.", { field: "token" });
        }
        return withTransaction(ctx, (scope) => createDeviceTokenRepository(scope.tx).daftarkan(scope.ctx, token, platform, familyId, this.clock.now()), this.db);
    }

    async cabut(ctx: AuthContext, token: string): Promise<void> {
        const ada = await withTransaction(ctx, (scope) => createDeviceTokenRepository(scope.tx).cabut(scope.ctx, token), this.db);
        if (!ada) throw new NotFoundError("Token perangkat tidak ditemukan.");
    }
}
