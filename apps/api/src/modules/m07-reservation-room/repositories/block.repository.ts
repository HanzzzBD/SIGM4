// Repository blokade ruangan (FR-07.5; PR-03-13, keputusan 19 log phase-03). PRIVAT terhadap modul.
// Slot blokade TIDAK ditulis di sini — penulisnya tetap SlotService (SDD-SYS-10). Kolom `date`
// dibaca lewat `to_char` (pola `holidays`): driver mengembalikan `Date`, bukan teks.

import { sql } from "kysely";
import type { AuthContext } from "../../../shared/auth/index.js";
import { pelakuId } from "../../../shared/auth/index.js";
import { BaseRepository, defineRepository } from "../../../shared/db/index.js";
import type { QueryExecutor, StatusBlokadeRuangan } from "../../../shared/db/index.js";

export interface AturanTersimpan {
    readonly id: string;
    readonly room_id: string;
    readonly hari: number;
    /** `HH:MM`. */
    readonly jam_mulai: string;
    readonly jam_selesai: string;
    readonly berlaku_mulai: string;
    readonly berlaku_sampai: string;
    readonly label_kegiatan: string;
    readonly status: StatusBlokadeRuangan;
}

export interface BlokadeManualTersimpan {
    readonly id: string;
    readonly room_id: string;
    readonly mulai: Date;
    readonly selesai: Date;
    readonly label_kegiatan: string;
    readonly status: StatusBlokadeRuangan;
}

export interface ReservasiRingkas {
    readonly id: string;
    readonly nomor: string;
    readonly status: string;
    readonly pemohon: string;
    readonly nama_kegiatan: string | null;
}

const KOLOM_ATURAN = sql<string>`to_char(berlaku_mulai, 'YYYY-MM-DD')`;

export class BlockRepository extends BaseRepository {
    constructor(executor: QueryExecutor) {
        super(executor);
    }

    private aturan(ctx: AuthContext) {
        return this.query(ctx)
            .selectFrom("room_fixed_schedules")
            .select([
                "id",
                "room_id",
                "hari",
                sql<string>`to_char(jam_mulai, 'HH24:MI')`.as("jam_mulai"),
                sql<string>`to_char(jam_selesai, 'HH24:MI')`.as("jam_selesai"),
                KOLOM_ATURAN.as("berlaku_mulai"),
                sql<string>`to_char(berlaku_sampai, 'YYYY-MM-DD')`.as("berlaku_sampai"),
                "label_kegiatan",
                "status",
            ]);
    }

    async buatAturan(ctx: AuthContext, a: { readonly roomId: number; readonly hari: number; readonly jamMulai: string; readonly jamSelesai: string; readonly berlakuMulai: string; readonly berlakuSampai: string; readonly label: string }): Promise<string> {
        const pelaku = pelakuId(ctx);
        const b = await this.query(ctx)
            .insertInto("room_fixed_schedules")
            .values({ room_id: a.roomId, hari: a.hari, jam_mulai: a.jamMulai, jam_selesai: a.jamSelesai, berlaku_mulai: a.berlakuMulai, berlaku_sampai: a.berlakuSampai, label_kegiatan: a.label, created_by: pelaku, updated_by: pelaku })
            .returning("id")
            .executeTakeFirstOrThrow();
        return b.id;
    }

    async buatBlokadeManual(ctx: AuthContext, b: { readonly roomId: number; readonly mulai: Date; readonly selesai: Date; readonly label: string }): Promise<string> {
        const pelaku = pelakuId(ctx);
        const r = await this.query(ctx)
            .insertInto("room_manual_blocks")
            .values({ room_id: b.roomId, mulai: b.mulai, selesai: b.selesai, label_kegiatan: b.label, created_by: pelaku, updated_by: pelaku })
            .returning("id")
            .executeTakeFirstOrThrow();
        return r.id;
    }

    async daftarRuangan(ctx: AuthContext, roomId: number): Promise<{ readonly aturan: readonly AturanTersimpan[]; readonly manual: readonly BlokadeManualTersimpan[] }> {
        const aturan = await this.aturan(ctx).where("room_id", "=", String(roomId)).orderBy("status").orderBy("hari").orderBy("jam_mulai").orderBy("id").execute();
        const manual = await this.query(ctx)
            .selectFrom("room_manual_blocks")
            .select(["id", "room_id", "mulai", "selesai", "label_kegiatan", "status"])
            .where("room_id", "=", String(roomId))
            .orderBy("status")
            .orderBy("mulai")
            .orderBy("id")
            .execute();
        return { aturan, manual };
    }

    /** Dikunci: penonaktifan dan job materialisasi tak saling menimpa (keputusan 19e). */
    async kunciAturan(ctx: AuthContext, id: number): Promise<AturanTersimpan | undefined> {
        return this.aturan(ctx).where("id", "=", String(id)).forUpdate().executeTakeFirst();
    }

    async kunciBlokadeManual(ctx: AuthContext, id: number): Promise<BlokadeManualTersimpan | undefined> {
        return this.query(ctx).selectFrom("room_manual_blocks").select(["id", "room_id", "mulai", "selesai", "label_kegiatan", "status"]).where("id", "=", String(id)).forUpdate().executeTakeFirst();
    }

    async nonaktifkan(ctx: AuthContext, tabel: "room_fixed_schedules" | "room_manual_blocks", id: number): Promise<void> {
        await this.query(ctx).updateTable(tabel).set({ status: "NONAKTIF", updated_by: pelakuId(ctx) }).where("id", "=", String(id)).where("status", "=", "AKTIF").execute();
    }

    /** Job materialisasi: id aturan aktif yang masa berlakunya belum berakhir. */
    async idAturanAktif(ctx: AuthContext, hariIni: string): Promise<readonly number[]> {
        const b = await this.query(ctx).selectFrom("room_fixed_schedules").select("id").where("status", "=", "AKTIF").where("berlaku_sampai", ">=", hariIni).orderBy("id").execute();
        return b.map((x) => Number(x.id));
    }

    /** Label kalender FR-07.1 A4 bagi slot blokade (kunci: `t<id>` jadwal tetap, `m<id>` manual). */
    async label(ctx: AuthContext, aturanIds: readonly string[], manualIds: readonly string[]): Promise<ReadonlyMap<string, string>> {
        const peta = new Map<string, string>();
        if (aturanIds.length > 0) for (const b of await this.query(ctx).selectFrom("room_fixed_schedules").select(["id", "label_kegiatan"]).where("id", "in", [...new Set(aturanIds)]).execute()) peta.set(`t${b.id}`, b.label_kegiatan);
        if (manualIds.length > 0) for (const b of await this.query(ctx).selectFrom("room_manual_blocks").select(["id", "label_kegiatan"]).where("id", "in", [...new Set(manualIds)]).execute()) peta.set(`m${b.id}`, b.label_kegiatan);
        return peta;
    }

    /** Ringkasan reservasi yang beririsan blokade baru (FR-07.5 A1). */
    async reservasiRingkas(ctx: AuthContext, ids: readonly string[]): Promise<readonly ReservasiRingkas[]> {
        if (ids.length === 0) return [];
        return this.query(ctx)
            .selectFrom("reservations as v")
            .innerJoin("users as u", "u.id", "v.pemohon_id")
            .select(["v.id", "v.nomor", sql<string>`v.status::text`.as("status"), "u.nama as pemohon", "v.nama_kegiatan"])
            .where("v.id", "in", [...new Set(ids)])
            .orderBy("v.waktu_mulai")
            .execute();
    }
}

/** Gerbang kompilasi `ScopedRepository` (SDD-AUTH-02). */
export function createBlockRepository(executor: QueryExecutor): BlockRepository {
    return defineRepository(new BlockRepository(executor));
}
