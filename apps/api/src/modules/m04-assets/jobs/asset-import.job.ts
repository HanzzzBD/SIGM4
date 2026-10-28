// Worker memeriksa izin TERBARU, bertindak sebagai pengunggah (PM-05, IMPT-04).
import { z } from "zod";
import type { Kysely } from "kysely";
import { createAuthContext } from "../../../shared/auth/index.js";
import type { EffectivePermissions } from "../../../shared/auth/index.js";
import type { Database } from "../../../shared/db/index.js";
import type { AssetImportService } from "../services/asset-import.service.js";

export const ASSET_IMPORT_JOB_NAME = "asset-import";
export const assetImportQueueId = (id: string | number): string => `asset-import-${id}`;
const Payload = z.object({ job_id: z.coerce.number().int().positive(), oleh: z.number().int().positive() });
export class AssetImportRunner {
    constructor(private readonly db: Kysely<Database>, private readonly permissions: { load(id: number): Promise<EffectivePermissions | undefined> }, private readonly service: AssetImportService) {}
    async run(data: unknown, last: boolean): Promise<void> {
        const { job_id: id, oleh: userId } = Payload.parse(data);
        const effective = await this.permissions.load(userId);
        if (effective === undefined) throw new Error("Pengunggah impor aset tidak ditemukan.");
        const ctx = createAuthContext({ userId, roleCode: effective.roleCode, scopes: effective.scopes });
        const user = await this.db.selectFrom("users").select("status").where("id", "=", String(userId)).executeTakeFirst();
        if (user?.status !== "AKTIF" || !ctx.can("asset.create")) {
            await this.service.fail(ctx, id, "Pengunggah tidak lagi berwenang mengimpor aset.");
            return;
        }
        try { await this.service.run(ctx, id); }
        catch (error) {
            if (last) await this.service.fail(ctx, id, "Pemrosesan impor aset berhenti karena kesalahan sistem.");
            throw error;
        }
    }
}
