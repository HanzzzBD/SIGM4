import type { Kysely } from "kysely";
import type { AssetPhoto } from "@sigm4/schemas";
import type { Database } from "../../../shared/db/index.js";
import type { AuthContext } from "../../../shared/auth/index.js";
import type { Clock } from "../../../shared/clock/index.js";
import type { PenyimpananObjek } from "../../../shared/storage/index.js";
import { NotFoundError } from "../../../shared/errors/index.js";
import { urlUnduhBerkas } from "../../m06-documents/index.js";
import { createAssetDetailRepository } from "../repositories/asset-detail.repository.js";
import { createAssetPhotoRepository } from "../repositories/asset-photo.repository.js";

export class AssetPhotoService {
    constructor(private readonly db: Kysely<Database>, private readonly storage: PenyimpananObjek, private readonly clock: Clock) {}
    async list(ctx: AuthContext, id: number, page: number, perPage: number) {
        if (await createAssetDetailRepository(this.db).detail(ctx, id) === undefined) throw new NotFoundError("Aset tidak ditemukan.");
        const { rows, total } = await createAssetPhotoRepository(this.db).list(id, page, perPage);
        const photos: AssetPhoto[] = await Promise.all(rows.map(async (row) => {
            const visible = row.scan_status === "CLEAN" && row.checksum !== null;
            const full = visible ? await urlUnduhBerkas(this.storage, this.clock, row, "medium") : null;
            const thumb = visible ? await urlUnduhBerkas(this.storage, this.clock, row, "thumb") : null;
            return { id: String(row.id), file_id: String(row.file_id), urutan: row.urutan, is_primary: row.is_primary,
                status: visible ? "CLEAN" : row.scan_status === "CLEAN" ? "PENDING" : row.scan_status,
                url: full?.url ?? null, thumbnail_url: thumb?.url ?? null, expires_at: full?.expiresAt.toISOString() ?? null };
        }));
        return { photos, total };
    }
}
