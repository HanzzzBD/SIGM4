// Sumber linimasa aset jenis DOKUMEN (FR-04.2 langkah 5; keputusan 9d log phase-03, PR-03-24): satu
// entri saat dokumen ditautkan dan satu saat tautannya dilepas (FR-06.1 A2/A3). Tak terlihat bagi
// pemanggil tanpa `asset_document.view` maupun scope `restricted` (FR-04.2 A1, BR-073).

import { sql } from "kysely";
import type { SumberLinimasaAset } from "../../m04-assets/index.js";
import { sumberLinimasaAset } from "../../m04-assets/index.js";

const pelaku = (kolom: string) => sql`(SELECT jsonb_build_object('id', u.id::text, 'nama', u.nama) FROM users u WHERE u.id = ${sql.ref(kolom)})`;
const data = (aksi: "DITAUTKAN" | "DILEPAS", kolomPelaku: string) =>
    sql`jsonb_build_object('aksi', ${aksi}::text, 'dokumen_id', d.id::text, 'jenis_dokumen', d.jenis, 'nama_berkas', d.nama_berkas, 'pelaku', ${pelaku(kolomPelaku)})`;

export const SUMBER_DOKUMEN: SumberLinimasaAset = {
    jenis: "DOKUMEN",
    fragmen: (ctx, assetId) =>
        !ctx.can("asset_document.view") || ctx.scopeOf("asset.view") === "restricted"
            ? null
            : sql`
                SELECT l.id::text AS id, l.created_at AS waktu, ${data("DITAUTKAN", "l.created_by")} AS data
                  FROM asset_document_links l JOIN asset_documents d ON d.id = l.document_id
                 WHERE l.asset_id = ${assetId}
                UNION ALL
                SELECT l.id::text || '-dilepas', l.dilepas_pada, ${data("DILEPAS", "l.dilepas_oleh")}
                  FROM asset_document_links l JOIN asset_documents d ON d.id = l.document_id
                 WHERE l.asset_id = ${assetId} AND l.dilepas_pada IS NOT NULL`,
};

/** Sekali per proses — perakit router dapat dipanggil berulang (uji). */
export function daftarkanSumberLinimasaDokumen(): void {
    if (sumberLinimasaAset.cari(SUMBER_DOKUMEN.jenis) === undefined) sumberLinimasaAset.daftar(SUMBER_DOKUMEN);
}
