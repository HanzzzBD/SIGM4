// Repository M-04 (SDD-AUTH-02, PM-03). PRIVAT terhadap modul (SDD-SYS-03) —
// hanya service/asset.service.ts yang boleh memanggilnya.
//
// `roomExists` mengueri `rooms` LANGSUNG, bukan lewat repository m03-locations
// (dilarang lintas modul, SDD-00 §4.2) — `m04-assets.md` §13 menyatakan M-04
// bergantung M-03 justru pada data lokasi ini.

import type { AuthContext } from "../../../shared/auth/index.js";
import { BaseRepository, defineRepository } from "../../../shared/db/index.js";
import type { QueryExecutor } from "../../../shared/db/index.js";

export class AssetRepository extends BaseRepository {
    constructor(executor: QueryExecutor) {
        super(executor);
    }

    async roomExists(ctx: AuthContext, roomId: number): Promise<boolean> {
        return (
            (await this.query(ctx)
                .selectFrom("rooms")
                .select("id")
                .where("id", "=", String(roomId))
                .executeTakeFirst()) !== undefined
        );
    }
}

/** Gerbang kompilasi `ScopedRepository` (SDD-AUTH-02). */
export function createAssetRepository(executor: QueryExecutor): AssetRepository {
    return defineRepository(new AssetRepository(executor));
}
