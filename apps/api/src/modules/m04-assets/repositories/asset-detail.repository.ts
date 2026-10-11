// Detail aset & linimasa riwayat (FR-04.2 langkah 5 & A1, BR-073; PR-03-24). BR-073 dan scope
// `restricted` ditegakkan di sini (SDD-AUTH-06), sama dengan katalog dan resolusi QR.

import { sql } from "kysely";
import type { RawBuilder } from "kysely";
import type { AuthContext } from "../../../shared/auth/index.js";
import { BaseRepository, defineRepository } from "../../../shared/db/index.js";
import type { QueryExecutor } from "../../../shared/db/index.js";
import type { SumberLinimasaAset } from "../services/timeline-registry.js";

const KOLOM_DETAIL = [
    "assets.id",
    "assets.uuid",
    "assets.kode_barang",
    "assets.nama",
    "assets.category_id",
    "asset_categories.nama as kategori_nama",
    "assets.merek",
    "assets.model",
    "assets.nomor_seri",
    "assets.tahun_perolehan",
    "assets.room_id",
    "rooms.nama as ruang_nama",
    "areas.nama as area_nama",
    "buildings.nama as gedung_nama",
    "assets.kondisi",
    "assets.status",
    "assets.dapat_dipinjam",
    "assets.boleh_dipinjam_siswa",
    "assets.penanggung_jawab_id",
    "pj.nama as penanggung_jawab_nama",
    "assets.qr_terpasang",
    "assets.dihapuskan",
    "assets.tanggal_penghapusan",
    "assets.created_at",
] as const;

/** BR-073: hanya ter-SELECT bila pemanggil memegang `asset.view_financial`. */
const KOLOM_FINANSIAL = ["assets.nilai_perolehan", "assets.sumber_perolehan"] as const;

export interface BarisLinimasa {
    readonly jenis: string;
    readonly id: string;
    readonly waktu: Date;
    readonly data: Readonly<Record<string, unknown>>;
}

/** `pelaku` jsonb dari `users` — `null` bila tak ada baris pengguna (Sistem, AL-06). */
export const pelakuJson = (kolomId: RawBuilder<unknown>) =>
    sql`(SELECT jsonb_build_object('id', u.id::text, 'nama', u.nama) FROM users u WHERE u.id = ${kolomId})`;

/** Sumber milik M-04: riwayat kondisi (`PR-02-13`) dan mutasi (`PR-02-14`). */
export const SUMBER_M04: readonly SumberLinimasaAset[] = [
    {
        jenis: "KONDISI",
        fragmen: (_ctx, assetId) => sql`
            SELECT h.id::text AS id, h.diubah_pada AS waktu,
                   jsonb_build_object('kondisi_lama', h.kondisi_lama, 'kondisi_baru', h.kondisi_baru, 'alasan', h.alasan,
                                      'pelaku', ${pelakuJson(sql.ref("h.diubah_oleh"))},
                                      'referensi_jenis', h.referensi_jenis, 'referensi_id', h.referensi_id::text) AS data
              FROM asset_condition_history h WHERE h.asset_id = ${assetId}`,
    },
    {
        jenis: "MUTASI",
        // `asset_movements` tak berkolom waktu: waktu = penerbitan berita acara (operasi mutasi), atau
        // tengah malam WIB tanggal mutasi bagi baris pra-berita acara (PR-02-14).
        fragmen: (_ctx, assetId) => sql`
            SELECT m.id::text AS id, COALESCE(d.created_at, m.tanggal::timestamp AT TIME ZONE 'Asia/Jakarta') AS waktu,
                   jsonb_build_object('tanggal', to_char(m.tanggal, 'YYYY-MM-DD'),
                                      'ruang_asal', jsonb_build_object('id', ra.id::text, 'nama', ra.nama),
                                      'ruang_tujuan', jsonb_build_object('id', rt.id::text, 'nama', rt.nama),
                                      'alasan', m.alasan, 'pelaku', ${pelakuJson(sql.ref("m.dilakukan_oleh"))},
                                      'document_id', m.document_id::text) AS data
              FROM asset_movements m
              JOIN rooms ra ON ra.id = m.room_asal_id
              JOIN rooms rt ON rt.id = m.room_tujuan_id
              LEFT JOIN asset_movement_documents d ON d.id = m.document_id
             WHERE m.asset_id = ${assetId}`,
    },
];

export class AssetDetailRepository extends BaseRepository {
    constructor(executor: QueryExecutor) {
        super(executor);
    }

    /**
     * Aset terhapuskan TETAP ditemukan (BR-065d). Scope `restricted` (Siswa/OSIS) hanya melihat
     * `boleh_dipinjam_siswa` — selain itu tidak ditemukan, sama dengan katalog (FR-04.2 A1).
     */
    async detail(ctx: AuthContext, id: number): Promise<Record<string, unknown> | undefined> {
        let q = this.query(ctx)
            .selectFrom("assets")
            .innerJoin("asset_categories", "asset_categories.id", "assets.category_id")
            .innerJoin("rooms", "rooms.id", "assets.room_id")
            .innerJoin("areas", "areas.id", "rooms.area_id")
            .innerJoin("buildings", "buildings.id", "areas.building_id")
            .leftJoin("users as pj", "pj.id", "assets.penanggung_jawab_id")
            .where("assets.id", "=", String(id));
        if (ctx.scopeOf("asset.view") === "restricted") q = q.where("assets.boleh_dipinjam_siswa", "=", true);
        return ctx.can("asset.view_financial") ? q.select([...KOLOM_DETAIL, ...KOLOM_FINANSIAL]).executeTakeFirst() : q.select(KOLOM_DETAIL).executeTakeFirst();
    }

    /** Satu UNION ALL atas seluruh sumber yang boleh dilihat, terbaru lebih dulu, offset (SDD-API-05). */
    async linimasa(ctx: AuthContext, assetId: number, sumber: readonly SumberLinimasaAset[], page: number, perPage: number): Promise<{ readonly baris: readonly BarisLinimasa[]; readonly total: number }> {
        const bagian = sumber.flatMap((s) => {
            const f = s.fragmen(ctx, assetId);
            return f === null ? [] : [sql`SELECT ${s.jenis}::text AS jenis, x.id, x.waktu, x.data FROM (${f}) x`];
        });
        if (bagian.length === 0) return { baris: [], total: 0 };
        const hasil = await sql<BarisLinimasa & { total: string }>`
            SELECT jenis, id, waktu, data, count(*) OVER () AS total
              FROM (${sql.join(bagian, sql` UNION ALL `)}) semua
             ORDER BY waktu DESC, jenis, id DESC
             LIMIT ${perPage} OFFSET ${(page - 1) * perPage}`.execute(this.query(ctx));
        return { baris: hasil.rows.map((b) => ({ jenis: b.jenis, id: b.id, waktu: b.waktu, data: b.data })), total: hasil.rows.length > 0 ? Number(hasil.rows[0]?.total) : 0 };
    }
}

/** Gerbang kompilasi `ScopedRepository` (SDD-AUTH-02). */
export function createAssetDetailRepository(executor: QueryExecutor): AssetDetailRepository {
    return defineRepository(new AssetDetailRepository(executor));
}
