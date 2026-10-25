import type { TransactionScope } from "../../../shared/db/index.js";
import { assertAuthContext } from "../../../shared/auth/index.js";
/** Public school identity used by trusted report renderers, never secret settings. */
export async function reportLetterhead(scope: TransactionScope): Promise<string[]> {
    assertAuthContext(scope.ctx);
    const rows = await scope.tx.selectFrom("system_settings").select(["key", "value"]).where("key", "in", ["sekolah.nama", "sekolah.npsn", "sekolah.alamat"]).execute();
    const values = new Map(rows.map(r => [r.key, r.value]));
    return ["sekolah.nama", "sekolah.npsn", "sekolah.alamat"].flatMap(key => { const value = values.get(key); return typeof value === "string" && value.trim() ? [key === "sekolah.npsn" ? `NPSN: ${value.trim()}` : value.trim()] : []; });
}

export async function reportSchoolName(scope: TransactionScope): Promise<string | null> {
    assertAuthContext(scope.ctx);
    const row = await scope.tx.selectFrom("system_settings").select("value").where("key", "=", "sekolah.nama").executeTakeFirst();
    return typeof row?.value === "string" && row.value.trim() ? row.value.trim() : null;
}
