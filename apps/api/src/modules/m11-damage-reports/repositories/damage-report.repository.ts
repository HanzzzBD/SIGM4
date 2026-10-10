// Repository laporan kerusakan (FR-11.1; PR-03-14, keputusan 20 log phase-03). PRIVAT terhadap modul.
// Penautan berkas foto bukan urusan berkas ini — pemilik `stored_files` adalah M-06 (SDD-FS-02).

import { sql } from "kysely";
import type { AuthContext } from "../../../shared/auth/index.js";
import { pelakuId } from "../../../shared/auth/index.js";
import { BaseRepository, defineRepository } from "../../../shared/db/index.js";
import type { FileScanStatus, QueryExecutor, StatusLaporanKerusakan, UrgensiKerusakan } from "../../../shared/db/index.js";

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

/** Baris tiket yang dikunci untuk transisi status (verifikasi, titik ekstensi work order). */
export interface TiketTerkunci {
    readonly id: string;
    readonly nomor: string;
    readonly status: StatusLaporanKerusakan;
    readonly pelapor_id: string;
    readonly asset_id: string | null;
    readonly room_id: string | null;
}

export interface TiketDetail extends TiketTerkunci {
    readonly urgensi: UrgensiKerusakan;
    readonly deskripsi: string;
    readonly created_at: Date;
    readonly pelapor_nama: string;
    readonly diverifikasi_oleh: string | null;
    readonly verifikator_nama: string | null;
    readonly diverifikasi_pada: Date | null;
    readonly catatan_verifikasi: string | null;
    readonly aset_nama: string | null;
    readonly kode_barang: string | null;
    readonly ruangan: string | null;
    readonly gedung: string | null;
}

export interface FotoTiket {
    readonly file_id: string;
    readonly urutan: number;
    readonly checksum: string | null;
    readonly scan_status: FileScanStatus;
    readonly object_key: string;
    readonly thumb_key: string | null;
    readonly medium_key: string | null;
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

    async kunci(ctx: AuthContext, id: number): Promise<TiketTerkunci | undefined> {
        return this.query(ctx)
            .selectFrom("damage_reports")
            .select(["id", "nomor", "status", "pelapor_id", "asset_id", "room_id"])
            .where("id", "=", String(id))
            .forUpdate()
            .executeTakeFirst();
    }

    /** FR-11.2 langkah 3 + AC SLA (SC-07): pelaku & waktu verifikasi dicatat pada ketiga hasil. */
    async tetapkanVerifikasi(ctx: AuthContext, id: string, v: { readonly status: StatusLaporanKerusakan; readonly catatan: string | null; readonly waktu: Date }): Promise<void> {
        await this.query(ctx)
            .updateTable("damage_reports")
            .set({ status: v.status, catatan_verifikasi: v.catatan, diverifikasi_oleh: ctx.userId, diverifikasi_pada: v.waktu, updated_by: pelakuId(ctx) })
            .where("id", "=", id)
            .execute();
    }

    async ubahStatus(ctx: AuthContext, id: string, status: StatusLaporanKerusakan): Promise<void> {
        await this.query(ctx).updateTable("damage_reports").set({ status, updated_by: pelakuId(ctx) }).where("id", "=", id).execute();
    }

    /** Scope `damage.view` ditegakkan di kueri (SDD-AUTH-05): selain `all` hanya tiket milik sendiri (FR-11.3 A1). */
    async detail(ctx: AuthContext, id: number): Promise<TiketDetail | undefined> {
        let q = this.query(ctx)
            .selectFrom("damage_reports as k")
            .innerJoin("users as p", "p.id", "k.pelapor_id")
            .leftJoin("users as v", "v.id", "k.diverifikasi_oleh")
            .leftJoin("assets as s", "s.id", "k.asset_id")
            .leftJoin("rooms as r", (j) => j.on(sql<boolean>`r.id = coalesce(k.room_id, s.room_id)`))
            .leftJoin("areas as a", "a.id", "r.area_id")
            .leftJoin("buildings as g", "g.id", "a.building_id")
            .select([
                "k.id", "k.nomor", "k.status", "k.urgensi", "k.deskripsi", "k.pelapor_id", "k.asset_id", "k.room_id", "k.created_at",
                "k.diverifikasi_oleh", "k.diverifikasi_pada", "k.catatan_verifikasi",
                "p.nama as pelapor_nama", "v.nama as verifikator_nama", "s.nama as aset_nama", "s.kode_barang", "r.nama as ruangan", "g.nama as gedung",
            ])
            .where("k.id", "=", String(id));
        if (ctx.scopeOf("damage.view") !== "all") q = q.where("k.pelapor_id", "=", String(ctx.userId));
        return q.executeTakeFirst();
    }

    async foto(ctx: AuthContext, id: string): Promise<readonly FotoTiket[]> {
        return this.query(ctx)
            .selectFrom("damage_report_photos as f")
            .innerJoin("stored_files as b", "b.id", "f.file_id")
            .select(["f.file_id", "f.urutan", "b.checksum", "b.scan_status", "b.object_key", "b.thumb_key", "b.medium_key"])
            .where("f.damage_report_id", "=", id)
            .orderBy("f.urutan")
            .execute();
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
