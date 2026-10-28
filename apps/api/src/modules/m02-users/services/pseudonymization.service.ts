import type { Kysely } from "kysely";
import type { AuthContext, SystemAuthContext } from "../../../shared/auth/index.js";
import { isSystemAuthContext } from "../../../shared/auth/index.js";
import type { Clock } from "../../../shared/clock/index.js";
import type { AuditLogger } from "../../../shared/audit/index.js";
import { withTransaction } from "../../../shared/db/index.js";
import type { Database, TransactionScope } from "../../../shared/db/index.js";
import { DomainError, ForbiddenError, NotFoundError } from "../../../shared/errors/index.js";
import { privacyRepository } from "../repositories/privacy.repository.js";
import { studentObligations } from "./student-obligation-registry.js";
import type { StudentObligationRegistry } from "./student-obligation-registry.js";

export interface PseudonymizationInput {
    readonly alasan: string;
    readonly referensi_permintaan: string;
    readonly metode_verifikasi: "KARTU_IDENTITAS_TATAP_MUKA" | "KONFIRMASI_ATASAN_ATAU_WALI_KELAS";
}
export class PseudonymizationService {
    constructor(private readonly db: Kysely<Database>, private readonly clock: Clock, private readonly audit: AuditLogger,
        private readonly obligations: StudentObligationRegistry = studentObligations) {}
    async request(ctx: AuthContext, id: number, input: PseudonymizationInput) {
        if (isSystemAuthContext(ctx) || ctx.roleCode !== "R-01" || !ctx.can("user.update") || ctx.scopeOf("user.update") !== "all" || ctx.userId === id) throw new ForbiddenError();
        if (!input.alasan.trim() || !input.referensi_permintaan.trim()) throw new DomainError("VALIDATION_ERROR", "Alasan dan referensi permintaan wajib diisi.");
        return withTransaction(ctx, async scope => {
            const repo = privacyRepository(scope.tx);
            if (!await repo.administrator(ctx)) throw new ForbiddenError();
            const user = await repo.lock(ctx, id); if (!user) throw new NotFoundError();
            if (user.pseudonymized_at) return { id: user.id, pseudonymized_at: user.pseudonymized_at.toISOString() };
            if (user.status !== "NONAKTIF") throw new DomainError("VALIDATION_ERROR", "Nonaktifkan akun terlebih dahulu sebelum pseudonimisasi.");
            const obligations = await this.obligations.cek(scope, id);
            if (obligations.length) throw new DomainError("VALIDATION_ERROR", `Pseudonimisasi ditolak — ${obligations.map(o => o.keterangan).join(" ")}`, { rule: "DP-10", kewajiban: obligations });
            const erasedAt = await this.erase(scope, id, { alasan: input.alasan, referensi_permintaan: input.referensi_permintaan, metode_verifikasi: input.metode_verifikasi });
            return { id: user.id, pseudonymized_at: erasedAt.toISOString() };
        }, this.db);
    }
    private async erase(scope: TransactionScope, id: number, detail: Record<string, string>) {
        const now = this.clock.now();
        await privacyRepository(scope.tx).erase(scope.ctx, id, now);
        // Do not copy the old identity/password into a new immutable audit entry.
        await this.audit.write(scope, { modul: "m02-users", aksi: "USER_PSEUDONYMIZED", entitas: "users", entitasId: id,
            nilaiSesudah: { pseudonymized_at: now.toISOString(), ...detail },
            keterangan: detail["alasan"] ?? "Pseudonimisasi akun." });
        return now;
    }
    async automatic(ctx: SystemAuthContext) {
        if (!isSystemAuthContext(ctx)) throw new ForbiddenError();
        let after = 0, diproses = 0, dipseudonimkan = 0, terblokir = 0;
        for (;;) {
            const candidates = await privacyRepository(this.db).due(ctx, this.clock.now(), after);
            if (!candidates.length) break;
            for (const candidate of candidates) {
                const id = Number(candidate.id); after = id; diproses++;
                const result = await withTransaction(ctx, async scope => {
                    const repo = privacyRepository(scope.tx), user = await repo.lock(ctx, id);
                    if (!user || user.status !== "NONAKTIF" || user.role !== "R-07" || user.pseudonymized_at || !await repo.dueLocked(ctx, id, this.clock.now())) return "LEWAT";
                    if ((await this.obligations.cek(scope, id)).length) return "TERBLOKIR";
                    await this.erase(scope, id, { alasan: "Retensi akun siswa nonaktif dua tahun telah berakhir (SL-05/DP-10).", sumber: "RETENSI_OTOMATIS" });
                    return "SELESAI";
                }, this.db);
                if (result === "SELESAI") dipseudonimkan++;
                if (result === "TERBLOKIR") terblokir++;
            }
        }
        return { diproses, dipseudonimkan, terblokir };
    }
}
