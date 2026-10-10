// Repository dokumen aset (FR-06.1, SDD-AUTH-05; PR-03-06). Dokumen yang `dihapus` dan tautan yang
// tidak `aktif` tidak pernah terlihat lewat repository ini (SDD-09 §4.6: baris dipertahankan).
//
// PRIVAT terhadap modul (SDD-SYS-03).

import { sql } from "kysely";
import type { AuthContext } from "../../../shared/auth/index.js";
import { pelakuId } from "../../../shared/auth/index.js";
import { BaseRepository, defineRepository } from "../../../shared/db/index.js";
import type { AssetDocumentType, FileScanStatus, QueryExecutor } from "../../../shared/db/index.js";

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
            .select(["d.id", "d.nama_berkas", sql<string>`to_char(d.garansi_selesai, 'YYYY-MM-DD')`.as("garansi_selesai")])
            .where("l.asset_id", "=", String(assetId))
            .where("l.aktif", "=", true)
            .where("d.dihapus", "=", false)
            .where("d.jenis", "=", "GARANSI")
            .where("d.garansi_mulai", "<=", tanggal)
            .where("d.garansi_selesai", ">=", tanggal)
            .orderBy("d.garansi_selesai")
            .orderBy("d.id")
            .execute();
    }

    /** Tab Dokumen (FR-06.1 langkah 1): terbaru dahulu; `jumlah_aset` = tautan aktif (A3). */
    async daftarUntukAset(ctx: AuthContext, assetId: number): Promise<readonly DokumenRow[]> {
        return this.query(ctx)
            .selectFrom("asset_document_links as l")
            .innerJoin("asset_documents as d", "d.id", "l.document_id")
            .innerJoin("stored_files as f", "f.id", "d.file_id")
            .select((eb) => [
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
                eb
                    .selectFrom("asset_document_links as l2")
                    .select((e) => e.fn.countAll<string>().as("n"))
                    .whereRef("l2.document_id", "=", "d.id")
                    .where("l2.aktif", "=", true)
                    .as("jumlah_aset"),
            ])
            .where("l.asset_id", "=", String(assetId))
            .where("l.aktif", "=", true)
            .where("d.dihapus", "=", false)
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
            .select(["d.id", "l.id as link_id", "d.file_id", "f.object_key", "f.scan_status"])
            .where("l.asset_id", "=", String(assetId))
            .where("l.document_id", "=", String(documentId))
            .where("l.aktif", "=", true)
            .where("d.dihapus", "=", false);
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
