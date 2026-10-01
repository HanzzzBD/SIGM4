// Layanan siklus hidup QR aset (FR-05.1; PR-03-01, keputusan 1 log phase-03). Kolom QR milik
// `assets` (M-04) ditulis lewat `index.ts` M-04 di transaksi yang sama dengan entri log-nya
// (AL-01, SDD-SYS-03). Pembuatan payload & matriks QR: `shared/qr`.

import type { Kysely } from "kysely";
import { gantiUuidAset, tandaiQrTerpasang } from "../../m04-assets/index.js";
import type { AuditLogger } from "../../../shared/audit/index.js";
import type { AuthContext } from "../../../shared/auth/index.js";
import type { Database } from "../../../shared/db/index.js";
import { withTransaction } from "../../../shared/db/index.js";
import { urlQrAset } from "../../../shared/qr/index.js";

const MODUL = "m05-qr";

export class QrService {
    constructor(
        private readonly db: Kysely<Database>,
        private readonly audit: AuditLogger,
        /** `APP_BASE_URL` tervalidasi (`shared/config`). */
        private readonly dasarQr: string,
    ) {}

    /**
     * FR-05.1 A2: UUID baru → QR lama otomatis tidak berlaku (uuid lama tak lagi menunjuk aset
     * mana pun; pemindaiannya dijawab "tidak dikenali", FR-05.2 A1). Hanya `asset.qr_regenerate`
     * (inti Administrator). Alasan wajib (UX-04) tersimpan di `keterangan` entri log.
     */
    async regenerasi(ctx: AuthContext, assetId: number, alasan: string): Promise<{ readonly id: string; readonly uuid: string; readonly qr_url: string }> {
        return withTransaction(
            ctx,
            async (scope) => {
                const { uuidLama, uuidBaru } = await gantiUuidAset(scope, assetId);
                await this.audit.write(scope, {
                    modul: MODUL,
                    aksi: "ASSET_QR_REGENERATED",
                    entitas: "assets",
                    entitasId: String(assetId),
                    nilaiSebelum: { uuid: uuidLama },
                    nilaiSesudah: { uuid: uuidBaru },
                    keterangan: alasan,
                });
                return { id: String(assetId), uuid: uuidBaru, qr_url: urlQrAset(this.dasarQr, uuidBaru) };
            },
            this.db,
        );
    }

    /** FR-05.1 langkah 5 (dan A1 — label dilepas): atomik; `ASSET_UPDATED` per aset yang berubah. */
    async tandaiTerpasang(ctx: AuthContext, assetIds: readonly number[], nilai: boolean): Promise<readonly number[]> {
        return withTransaction(ctx, (scope) => tandaiQrTerpasang(scope, this.audit, assetIds, nilai), this.db);
    }
}
