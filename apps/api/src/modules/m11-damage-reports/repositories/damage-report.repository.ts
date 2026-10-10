// Repository laporan kerusakan (FR-11.1; PR-03-14, keputusan 20 log phase-03). PRIVAT terhadap modul.
// Penautan berkas foto bukan urusan berkas ini — pemilik `stored_files` adalah M-06 (SDD-FS-02).

import type { AuthContext } from "../../../shared/auth/index.js";
import { pelakuId } from "../../../shared/auth/index.js";
import { BaseRepository, defineRepository } from "../../../shared/db/index.js";
import type { QueryExecutor, StatusLaporanKerusakan, UrgensiKerusakan } from "../../../shared/db/index.js";

/** Objek tiket — tepat satu terisi (FR-11.1 langkah 3, A4). */
export interface ObjekLaporan {
    readonly assetId?: number | undefined;
    readonly roomId?: number | undefined;
}

/** Identitas objek bagi notifikasi `{aset}` / `{lokasi}` (NT-19, NT-20). */
export interface ObjekTerdaftar {
    readonly label: string;
    readonly lokasi: string;
}

export interface TiketTerbuka {
    readonly id: string;
    readonly nomor: string;
    readonly status: StatusLaporanKerusakan;
    readonly urgensi: UrgensiKerusakan;
    readonly pelapor_id: string;
    readonly created_at: Date;
}

export interface TiketBaru extends ObjekLaporan {
    readonly nomor: string;
    readonly deskripsi: string;
    readonly urgensi: UrgensiKerusakan;
}

/** FR-11.1 A1: tiket yang belum Selesai/Ditolak — cermin indeks unik parsial 0048. */
const TERBUKA: readonly StatusLaporanKerusakan[] = ["DILAPORKAN", "DIVERIFIKASI", "DALAM_PERBAIKAN"];

export class DamageReportRepository extends BaseRepository {
    constructor(executor: QueryExecutor) {
        super(executor);
    }

    /** Precondition FR-11.1: aset terdaftar dan belum dihapuskan; ruangan terdaftar dan aktif. */
    async objek(ctx: AuthContext, o: ObjekLaporan): Promise<ObjekTerdaftar | undefined> {
        if (o.assetId !== undefined) {
            const r = await this.query(ctx)
                .selectFrom("assets as s")
                .innerJoin("rooms as r", "r.id", "s.room_id")
                .innerJoin("areas as a", "a.id", "r.area_id")
                .innerJoin("buildings as g", "g.id", "a.building_id")
                .select(["s.nama", "s.kode_barang", "r.nama as ruangan", "g.nama as gedung"])
                .where("s.id", "=", String(o.assetId))
                .where("s.dihapuskan", "=", false)
                .executeTakeFirst();
            return r === undefined ? undefined : { label: `${r.nama} (${r.kode_barang})`, lokasi: `${r.ruangan}, ${r.gedung}` };
        }
        const r = await this.query(ctx)
            .selectFrom("rooms as r")
            .innerJoin("areas as a", "a.id", "r.area_id")
            .innerJoin("buildings as g", "g.id", "a.building_id")
            .select(["r.nama", "g.nama as gedung"])
            .where("r.id", "=", String(o.roomId))
            .where("r.status", "=", "AKTIF")
            .executeTakeFirst();
        return r === undefined ? undefined : { label: r.nama, lokasi: r.gedung };
    }

    async terbuka(ctx: AuthContext, o: ObjekLaporan): Promise<TiketTerbuka | undefined> {
        let q = this.query(ctx)
            .selectFrom("damage_reports")
            .select(["id", "nomor", "status", "urgensi", "pelapor_id", "created_at"])
            .where("status", "in", TERBUKA);
        q = o.assetId !== undefined ? q.where("asset_id", "=", String(o.assetId)) : q.where("room_id", "=", String(o.roomId));
        return q.executeTakeFirst();
    }

    async buat(ctx: AuthContext, t: TiketBaru): Promise<string> {
        const r = await this.query(ctx)
            .insertInto("damage_reports")
            .values({
                nomor: t.nomor,
                pelapor_id: ctx.userId,
                asset_id: t.assetId ?? null,
                room_id: t.roomId ?? null,
                deskripsi: t.deskripsi,
                urgensi: t.urgensi,
                created_by: pelakuId(ctx),
                updated_by: pelakuId(ctx),
            })
            .returning("id")
            .executeTakeFirstOrThrow();
        return r.id;
    }

    /** Urutan foto = urutan isian pelapor (1–5). */
    async tambahFoto(ctx: AuthContext, reportId: string, fileIds: readonly number[]): Promise<void> {
        await this.query(ctx)
            .insertInto("damage_report_photos")
            .values(fileIds.map((fileId, i) => ({ damage_report_id: reportId, file_id: fileId, urutan: i + 1, created_by: pelakuId(ctx) })))
            .execute();
    }
}

export function createDamageReportRepository(executor: QueryExecutor) {
    return defineRepository(new DamageReportRepository(executor));
}
