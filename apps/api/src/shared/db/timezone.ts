// Zona waktu sesi basis data (SDD-INF-09, INF-07).
//
// Kolom `timestamptz` menyimpan instan yang sama apa pun zona sesinya, tetapi SQL
// yang menafsirkan tanggal tidak: batas partisi `activity_logs` di 0008 ditulis
// sebagai tanggal, sehingga dibaca memakai zona SESI. Karena itu zona dipaksa pada
// setiap koneksi — tidak bergantung pada setelan penyedia basis data terkelola —
// dan diverifikasi saat startup untuk membuktikan paksaannya benar-benar bekerja.

import { sql } from "kysely";
import type { Kysely } from "kysely";
import type { Database } from "./schema.js";

/** Parameter sesi yang dipaksakan pada setiap koneksi pool aplikasi. */
export const OPSI_SESI_UTC = "-c TimeZone=UTC";

/** Nama zona yang dilaporkan PostgreSQL untuk UTC. */
const ZONA_UTC: ReadonlySet<string> = new Set(["UTC", "Etc/UTC"]);

/** Menolak menyala bila sesi basis data tidak berjalan dalam UTC. */
export async function assertDatabaseTimeZoneUtc(
    db: Kysely<Database>,
): Promise<void> {
    const { rows } = await sql<{
        zona: string;
    }>`select current_setting('TimeZone') as zona`.execute(db);
    const zona = rows[0]?.zona;
    if (zona === undefined || !ZONA_UTC.has(zona)) {
        throw new Error(
            "Zona waktu sesi basis data harus UTC, bukan zona bawaan penyedia (SDD-INF-09).",
        );
    }
}
