// Sumber linimasa aset jenis KERUSAKAN (FR-04.2 langkah 5 "laporan kerusakan terkait"; keputusan 24b,
// PR-03-24). Ringkasan saja — nomor, status, urgensi, waktu lapor — tanpa identitas pelapor maupun isi
// laporan, sehingga aman bagi setiap pemegang `asset.view` (pola `GET /damage-reports/open`, keputusan 20e).

import { sql } from "kysely";
import type { SumberLinimasaAset } from "../../m04-assets/index.js";
import { sumberLinimasaAset } from "../../m04-assets/index.js";

export const SUMBER_KERUSAKAN: SumberLinimasaAset = {
    jenis: "KERUSAKAN",
    fragmen: (_ctx, assetId) => sql`
        SELECT k.id::text AS id, k.created_at AS waktu,
               jsonb_build_object('laporan_id', k.id::text, 'nomor', k.nomor, 'status', k.status, 'urgensi', k.urgensi) AS data
          FROM damage_reports k WHERE k.asset_id = ${assetId}`,
};

/** Sekali per proses — perakit router dapat dipanggil berulang (uji). */
export function daftarkanSumberLinimasaKerusakan(): void {
    if (sumberLinimasaAset.cari(SUMBER_KERUSAKAN.jenis) === undefined) sumberLinimasaAset.daftar(SUMBER_KERUSAKAN);
}
