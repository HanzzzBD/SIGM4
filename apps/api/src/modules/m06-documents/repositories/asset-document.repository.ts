// Repository dokumen aset (FR-06.1, SDD-AUTH-05; PR-03-06). Dokumen yang `dihapus` dan tautan yang
// tidak `aktif` tidak pernah terlihat lewat repository ini (SDD-09 §4.6: baris dipertahankan).
//
// PRIVAT terhadap modul (SDD-SYS-03).

import { sql } from "kysely";
import type { AuthContext } from "../../../shared/auth/index.js";
import { pelakuId } from "../../../shared/auth/index.js";
import { BaseRepository, defineRepository } from "../../../shared/db/index.js";
import type { AssetDocumentType, FileScanStatus, QueryExecutor } from "../../../shared/db/index.js";

type DocumentPermission = "asset_document.view" | "asset_document.manage";
function scopeDokumen(ctx: AuthContext, permission: DocumentPermission, aset = "a") {
    if (!ctx.can(permission) || ctx.roleCode === "R-07") return sql<boolean>`false`;
    switch (ctx.scopeOf(permission)) {
        case "all": return sql<boolean>`true`;
        case "own": return sql<boolean>`d.created_by = ${String(ctx.userId)}`;
        case "assigned": return sql<boolean>`${sql.ref(`${aset}.penanggung_jawab_id`)} = ${String(ctx.userId)}`;
        case "restricted": return sql<boolean>`false`;
    }
}
export interface FilterDokumen {
    readonly q?: string; readonly jenis?: AssetDocumentType; readonly kategoriId?: number;
    readonly garansi?: "AKTIF" | "BERAKHIR_30_HARI" | "BERAKHIR";
    readonly hariIni: string; readonly batasGaransi: string;
    readonly sort: "-diunggah_pada" | "garansi_selesai"; readonly page: number; readonly perPage: number;
}
export interface DokumenLintasRow extends DokumenRow { readonly asset_id: string; readonly kode_barang: string; readonly asset_nama: string }

export interface DokumenRow {
    readonly id: string;
    readonly jenis: AssetDocumentType;
    readonly nama_berkas: string;
    readonly keterangan: string | null;
    readonly garansi_mulai: string | null;
    readonly garansi_selesai: string | null;
    readonly mime: string;
    readonly ukuran: string;
    readonly scan_status: FileScanStatus;
    readonly diunggah_oleh: string | null;
    readonly created_at: Date;
    readonly jumlah_aset: number;
}

/** Dokumen + berkas + tautan aktifnya pada satu aset — bahan unduh dan hapus. */
export interface DokumenPadaAsetRow {
    readonly id: string;
    readonly link_id: string;
    readonly file_id: string;
    readonly object_key: string;
    readonly scan_status: FileScanStatus;
}

export interface DokumenBaru {
    readonly fileId: number;
    readonly jenis: AssetDocumentType;
    readonly namaBerkas: string;
    readonly keterangan: string | null;
    readonly garansiMulai: string | null;
    readonly garansiSelesai: string | null;
}

const tgl = (kolom: "d.garansi_mulai" | "d.garansi_selesai") => sql<string | null>`to_char(${sql.ref(kolom)}, 'YYYY-MM-DD')`;

export class AssetDocumentRepository extends BaseRepository {
    constructor(executor: QueryExecutor) {
        super(executor);
    }

    async asetDiLuarScope(ctx: AuthContext, ids: readonly number[]): Promise<readonly number[]> {
        if (!ctx.can("asset_document.manage") || ctx.roleCode === "R-07" || ctx.scopeOf("asset_document.manage") === "restricted") return ids;
        if (ctx.scopeOf("asset_document.manage") !== "assigned") return [];
        const rows = await this.query(ctx).selectFrom("assets").select("id").where("id", "in", ids.map(String)).where("penanggung_jawab_id", "=", String(ctx.userId)).execute();
        const ada = new Set(rows.map((r) => Number(r.id)));
        return ids.filter((id) => !ada.has(id));
    }

    private jumlahTerlihat(ctx: AuthContext, permission: DocumentPermission = "asset_document.view") {
        return sql<number>`(select count(*) from asset_document_links as l2 join assets as a2 on a2.id = l2.asset_id where l2.document_id = d.id and l2.aktif = true and ${scopeDokumen(ctx, permission, "a2")})`;
    }

    async daftarLintasAset(ctx: AuthContext, filter: FilterDokumen): Promise<{ readonly rows: readonly DokumenLintasRow[]; readonly total: number }> {
        let base = this.query(ctx).selectFrom("asset_document_links as l")
            .innerJoin("asset_documents as d", "d.id", "l.document_id")
            .innerJoin("stored_files as f", "f.id", "d.file_id")
            .innerJoin("assets as a", "a.id", "l.asset_id")
            .where("l.aktif", "=", true).where("d.dihapus", "=", false).where(scopeDokumen(ctx, "asset_document.view"));
        if (filter.q) {
            const term = `%${filter.q.replace(/[\\%_]/g, (v) => `\\${v}`)}%`;
            base = base.where((eb) => eb.or([eb("d.nama_berkas", "ilike", term), eb("a.kode_barang", "ilike", term), eb("a.nama", "ilike", term)]));
        }
        if (filter.jenis) base = base.where("d.jenis", "=", filter.jenis);
        if (filter.kategoriId !== undefined) base = base.where("a.category_id", "=", String(filter.kategoriId));
        if (filter.garansi) {
            base = base.where("d.jenis", "=", "GARANSI");
            if (filter.garansi === "BERAKHIR") base = base.where("d.garansi_selesai", "<", filter.hariIni);
            else {
                base = base.where("d.garansi_mulai", "<=", filter.hariIni).where("d.garansi_selesai", ">=", filter.hariIni);
                if (filter.garansi === "BERAKHIR_30_HARI") base = base.where("d.garansi_selesai", "<=", filter.batasGaransi);
            }
        }
        let data = base.select([
            "d.id", "d.jenis", "d.nama_berkas", "d.keterangan", tgl("d.garansi_mulai").as("garansi_mulai"), tgl("d.garansi_selesai").as("garansi_selesai"),
            "f.mime", "f.ukuran", "f.scan_status", "d.created_by as diunggah_oleh", "d.created_at", "a.id as asset_id", "a.kode_barang", "a.nama as asset_nama",
            this.jumlahTerlihat(ctx).as("jumlah_aset"),
        ]);
        data = filter.sort === "garansi_selesai" ? data.orderBy(sql`d.garansi_selesai asc nulls last`) : data.orderBy("d.created_at", "desc");
        const [rows, count] = await Promise.all([data.orderBy("d.id", "desc").orderBy("l.id", "desc").limit(filter.perPage).offset((filter.page - 1) * filter.perPage).execute(), base.select((eb) => eb.fn.countAll<string>().as("n")).executeTakeFirstOrThrow()]);
        return { rows: rows.map((r) => ({ ...r, jumlah_aset: Number(r.jumlah_aset) })), total: Number(count.n) };
    }

    async buat(ctx: AuthContext, d: DokumenBaru): Promise<string> {
        const pelaku = pelakuId(ctx);
        const r = await this.query(ctx)
            .insertInto("asset_documents")
            .values({ file_id: d.fileId, jenis: d.jenis, nama_berkas: d.namaBerkas, keterangan: d.keterangan, garansi_mulai: d.garansiMulai, garansi_selesai: d.garansiSelesai, created_by: pelaku, updated_by: pelaku })
            .returning("id")
            .executeTakeFirstOrThrow();
        return r.id;
    }

    async tautkan(ctx: AuthContext, documentId: string, assetIds: readonly number[]): Promise<void> {
        await this.query(ctx)
            .insertInto("asset_document_links")
            .values(assetIds.map((a) => ({ document_id: documentId, asset_id: a, created_by: pelakuId(ctx) })))
            .execute();
    }

    /**
     * BR-052 / FR-11.2 A3 (PR-03-15): dokumen GARANSI yang tertaut aktif ke aset dan masa berlakunya
     * mencakup `tanggal` (WIB, YYYY-MM-DD). Berakhir paling lambat dahulu.
     */
    async garansiAktif(ctx: AuthContext, assetId: number, tanggal: string): Promise<readonly { readonly id: string; readonly nama_berkas: string; readonly garansi_selesai: string }[]> {
        return this.query(ctx)
            .selectFrom("asset_documents as d")
            .innerJoin("asset_document_links as l", "l.document_id", "d.id")
            .innerJoin("assets as a", "a.id", "l.asset_id")
            .select(["d.id", "d.nama_berkas", sql<string>`to_char(d.garansi_selesai, 'YYYY-MM-DD')`.as("garansi_selesai")])
            .where("l.asset_id", "=", String(assetId))
            .where("l.aktif", "=", true)
            .where("d.dihapus", "=", false)
            .where("d.jenis", "=", "GARANSI")
            .where(scopeDokumen(ctx, "asset_document.view"))
            .where("d.garansi_mulai", "<=", tanggal)
            .where("d.garansi_selesai", ">=", tanggal)
            .orderBy("d.garansi_selesai")
            .orderBy("d.id")
            .execute();
    }

    /** Tab Dokumen (FR-06.1 langkah 1): terbaru dahulu; `jumlah_aset` = tautan aktif (A3). */
    async daftarUntukAset(ctx: AuthContext, assetId: number, permission: DocumentPermission = "asset_document.view"): Promise<readonly DokumenRow[]> {
        return this.query(ctx)
            .selectFrom("asset_document_links as l")
            .innerJoin("asset_documents as d", "d.id", "l.document_id")
            .innerJoin("stored_files as f", "f.id", "d.file_id")
            .innerJoin("assets as a", "a.id", "l.asset_id")
            .select([
                "d.id",
                "d.jenis",
                "d.nama_berkas",
                "d.keterangan",
                tgl("d.garansi_mulai").as("garansi_mulai"),
                tgl("d.garansi_selesai").as("garansi_selesai"),
                "f.mime",
                "f.ukuran",
                "f.scan_status",
                "d.created_by as diunggah_oleh",
                "d.created_at",
                this.jumlahTerlihat(ctx, permission).as("jumlah_aset"),
            ])
            .where("l.asset_id", "=", String(assetId))
            .where("l.aktif", "=", true)
            .where("d.dihapus", "=", false)
            .where(scopeDokumen(ctx, permission))
            .orderBy("d.created_at", "desc")
            .orderBy("d.id", "desc")
            .execute()
            .then((rows) => rows.map((r) => ({ ...r, jumlah_aset: Number(r.jumlah_aset) })));
    }

    /** Dokumen hidup yang tertaut AKTIF ke aset ini; `kunci` mengunci tautannya (hapus serentak). */
    async padaAset(ctx: AuthContext, assetId: number, documentId: number, kunci = false): Promise<DokumenPadaAsetRow | undefined> {
        let q = this.query(ctx)
            .selectFrom("asset_document_links as l")
            .innerJoin("asset_documents as d", "d.id", "l.document_id")
            .innerJoin("stored_files as f", "f.id", "d.file_id")
            .innerJoin("assets as a", "a.id", "l.asset_id")
            .select(["d.id", "l.id as link_id", "d.file_id", "f.object_key", "f.scan_status"])
            .where("l.asset_id", "=", String(assetId))
            .where("l.document_id", "=", String(documentId))
            .where("l.aktif", "=", true)
            .where("d.dihapus", "=", false).where(scopeDokumen(ctx, kunci ? "asset_document.manage" : "asset_document.view"));
        if (kunci) q = q.forUpdate();
        return q.executeTakeFirst();
    }

    async lepas(ctx: AuthContext, linkId: string, waktu: Date): Promise<void> {
        await this.query(ctx).updateTable("asset_document_links").set({ aktif: false, dilepas_pada: waktu, dilepas_oleh: pelakuId(ctx) }).where("id", "=", linkId).where("aktif", "=", true).execute();
    }

    async jumlahTautanAktif(ctx: AuthContext, documentId: string): Promise<number> {
        const r = await this.query(ctx).selectFrom("asset_document_links").select((e) => e.fn.countAll<string>().as("n")).where("document_id", "=", documentId).where("aktif", "=", true).executeTakeFirstOrThrow();
        return Number(r.n);
    }

    /** Tautan terakhir lepas → dokumen ditandai dihapus; objek & berkas dipertahankan (SDD-09 §4.6). */
    async hapus(ctx: AuthContext, documentId: string, waktu: Date): Promise<void> {
        await this.query(ctx).updateTable("asset_documents").set({ dihapus: true, dihapus_pada: waktu, dihapus_oleh: pelakuId(ctx), updated_by: pelakuId(ctx) }).where("id", "=", documentId).where("dihapus", "=", false).execute();
    }
}

/** Pintu masuk repository: `defineRepository` menolak metode yang tidak menerima `AuthContext` (SDD-AUTH-02). */
export function createAssetDocumentRepository(executor: QueryExecutor): AssetDocumentRepository {
    return defineRepository(new AssetDocumentRepository(executor));
}
