// Keberadaan aset atas permintaan M-06 (FR-06.1 A3; PR-03-06): dokumen hanya ditautkan ke aset
// yang terdaftar. Aset terhapuskan tetap terdaftar (BR-008) — berita acara penghapusan pun dokumen.

import type { QueryExecutor } from "../../../shared/db/index.js";
import type { AuthContext } from "../../../shared/auth/index.js";
import { createAssetRepository } from "../repositories/asset.repository.js";

/** Id di antara `ids` yang TIDAK terdaftar (urut sesuai masukan, tanpa duplikat). */
export async function asetTidakTerdaftar(executor: QueryExecutor, ctx: AuthContext, ids: readonly number[]): Promise<readonly number[]> {
    const unik = [...new Set(ids)];
    const ada = new Set(await createAssetRepository(executor).idTerdaftar(ctx, unik));
    return unik.filter((id) => !ada.has(id));
}
