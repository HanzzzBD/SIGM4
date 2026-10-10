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
    /** FR-11.3 / SC-07: tenggat absolut yang ditetapkan saat lapor (0050, pola SDD-APR-07). */
    readonly batasSla: Date;
}

/** Saringan `GET /damage-reports` (FR-11.3 langkah 3); rentang sudah berupa instan WIB `[dari, sampai)`. */
export interface SaringanDaftar {
    readonly q?: string | undefined;
    readonly status?: StatusLaporanKerusakan | undefined;
    readonly urgensi?: UrgensiKerusakan | undefined;
    readonly buildingId?: number | undefined;
    readonly roomId?: number | undefined;
    readonly categoryId?: number | undefined;
    readonly pelaporId?: number | undefined;
    readonly dari?: Date | undefined;
    readonly sampai?: Date | undefined;
    readonly melampauiSla?: boolean | undefined;
    readonly urut: "dilaporkan" | "urgensi";
    readonly page: number;
    readonly perPage: number;
    /** Saat ini menurut `Clock` — pembanding tiket yang masih menunggu verifikasi. */
    readonly sekarang: Date;
}

export interface BarisDaftar {
    readonly id: string;
    readonly nomor: string;
    readonly status: StatusLaporanKerusakan;
    readonly urgensi: UrgensiKerusakan;
    readonly asset_id: string | null;
    readonly room_id: string | null;
    readonly pelapor_id: string;
    readonly pelapor_nama: string;
    readonly created_at: Date;
    readonly diverifikasi_pada: Date | null;
    readonly batas_sla: Date | null;
    readonly melampaui_sla: boolean;
    readonly aset_nama: string | null;
    readonly kode_barang: string | null;
    readonly ruangan: string | null;
    readonly gedung: string | null;
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

/** Scope `damage.view` selain `all` = tiket milik sendiri (FR-11.3 A1; Teknisi `own` sampai work order Phase 04). */
const milikSendiri = (ctx: AuthContext) => ctx.scopeOf("damage.view") !== "all";

/** `%`, `_`, dan `\` pada kata kunci dicari harfiah, bukan sebagai pola. */
const pola = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

/**
 * FR-11.3 langkah 4 (keputusan 22b): lewat `batas_sla` = diverifikasi sesudahnya, atau masih `DILAPORKAN`
 * sementara tenggat sudah lewat. `batas_sla` NULL (tiket pra-0050) tidak pernah ditandai.
 */
const melampauiSla = (sekarang: Date) =>
    sql<boolean>`coalesce(k.batas_sla < coalesce(k.diverifikasi_pada, CASE WHEN k.status = 'DILAPORKAN' THEN ${sekarang}::timestamptz END), false)`;

/** Urut urgensi: Kritis lebih dulu. */
const PERINGKAT_URGENSI = sql<number>`CASE k.urgensi WHEN 'KRITIS' THEN 4 WHEN 'TINGGI' THEN 3 WHEN 'SEDANG' THEN 2 ELSE 1 END`;

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
                batas_sla: t.batasSla,
                created_by: pelakuId(ctx),
                updated_by: pelakuId(ctx),
            })
            .returning("id")
            .executeTakeFirstOrThrow();
        return r.id;
    }

    /** SLA tindak lanjut urgensi ini dalam hari kerja (0050); baris seed wajib ada. */
    async slaHari(ctx: AuthContext, urgensi: UrgensiKerusakan): Promise<number> {
        const key = `maintenance.sla_tindak_lanjut_hari_${urgensi.toLowerCase()}`;
        const r = await this.query(ctx).selectFrom("system_settings").select("value").where("key", "=", key).executeTakeFirst();
        if (typeof r?.value !== "number") throw new Error(`Pengaturan ${key} hilang atau bukan angka.`);
        return r.value;
    }

    /**
     * FR-11.3: daftar tersaring scope (SDD-AUTH-05) + jumlah per status dalam saringan yang sama minus
     * `status` (langkah 2, tab P-39).
     */
    async daftar(ctx: AuthContext, s: SaringanDaftar): Promise<{ readonly baris: readonly BarisDaftar[]; readonly total: number; readonly perStatus: ReadonlyMap<StatusLaporanKerusakan, number> }> {
        let dasar = this.query(ctx)
            .selectFrom("damage_reports as k")
            .leftJoin("assets as s", "s.id", "k.asset_id")
            // Lokasi = ruangan tiket (A4) atau ruangan aset.
            .leftJoin("rooms as r", (j) => j.on(sql<boolean>`r.id = coalesce(k.room_id, s.room_id)`))
            .leftJoin("areas as a", "a.id", "r.area_id")
            .leftJoin("buildings as g", "g.id", "a.building_id")
            .$if(milikSendiri(ctx), (q) => q.where("k.pelapor_id", "=", String(ctx.userId)));
        if (s.q !== undefined && s.q !== "") {
            const p = pola(s.q);
            dasar = dasar.where((eb) => eb.or([eb("k.nomor", "ilike", p), eb("s.kode_barang", "ilike", p)]));
        }
        if (s.urgensi !== undefined) dasar = dasar.where("k.urgensi", "=", s.urgensi);
        if (s.roomId !== undefined) dasar = dasar.where("r.id", "=", String(s.roomId));
        if (s.buildingId !== undefined) dasar = dasar.where("g.id", "=", String(s.buildingId));
        if (s.categoryId !== undefined) dasar = dasar.where("s.category_id", "=", String(s.categoryId));
        if (s.pelaporId !== undefined) dasar = dasar.where("k.pelapor_id", "=", String(s.pelaporId));
        if (s.dari !== undefined) dasar = dasar.where("k.created_at", ">=", s.dari);
        if (s.sampai !== undefined) dasar = dasar.where("k.created_at", "<", s.sampai);
        if (s.melampauiSla !== undefined) dasar = dasar.where(melampauiSla(s.sekarang), "=", s.melampauiSla);

        const perStatus = await dasar.select(["k.status", (eb) => eb.fn.countAll<string>().as("n")]).groupBy("k.status").execute();
        const berstatus = s.status === undefined ? dasar : dasar.where("k.status", "=", s.status);
        const total = await berstatus.select((eb) => eb.fn.countAll<string>().as("n")).executeTakeFirstOrThrow();
        const baris = await berstatus
            .innerJoin("users as p", "p.id", "k.pelapor_id")
            .select([
                "k.id", "k.nomor", "k.status", "k.urgensi", "k.asset_id", "k.room_id", "k.pelapor_id", "k.created_at", "k.diverifikasi_pada", "k.batas_sla",
                "p.nama as pelapor_nama", "s.nama as aset_nama", "s.kode_barang", "r.nama as ruangan", "g.nama as gedung",
                melampauiSla(s.sekarang).as("melampaui_sla"),
            ])
            .$call((q) => (s.urut === "urgensi" ? q.orderBy(PERINGKAT_URGENSI, "desc") : q))
            .orderBy("k.created_at", "desc")
            .orderBy("k.id", "desc")
            .limit(s.perPage)
            .offset((s.page - 1) * s.perPage)
            .execute();
        return { baris, total: Number(total.n), perStatus: new Map(perStatus.map((r) => [r.status, Number(r.n)])) };
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
