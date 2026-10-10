// Dokumen aset (FR-06.1; PR-03-06, keputusan 9 log phase-03): daftar, tautkan berkas terdaftar,
// lepas/hapus, dan unduh lewat penjaga SDD-FS-03. Siswa/OSIS tidak memegang `asset_document.*`
// sama sekali (BR-073) — otorisasi di route, sebelum layanan ini.

import type { Kysely } from "kysely";
import { asetTidakTerdaftar } from "../../m04-assets/index.js";
import type { AuditLogger } from "../../../shared/audit/index.js";
import type { AuthContext } from "../../../shared/auth/index.js";
import type { Clock } from "../../../shared/clock/index.js";
import { withTransaction } from "../../../shared/db/index.js";
import type { AssetDocumentType, Database, QueryExecutor } from "../../../shared/db/index.js";
import { DomainError, NotFoundError } from "../../../shared/errors/index.js";
import type { PenyimpananObjek } from "../../../shared/storage/index.js";
import { createAssetDocumentRepository } from "../repositories/asset-document.repository.js";
import type { DokumenRow } from "../repositories/asset-document.repository.js";
import { createStoredFileRepository } from "../repositories/stored-file.repository.js";
import { urlUnduhBerkas } from "./file.service.js";

const MODUL = "m06-documents";

export interface InputDokumen {
    readonly fileId: number;
    readonly jenis: AssetDocumentType;
    readonly namaBerkas: string;
    readonly keterangan: string | null;
    readonly garansiMulai: string | null;
    readonly garansiSelesai: string | null;
    /** FR-06.1 A3: aset lain yang memakai dokumen yang sama (mis. satu faktur untuk 20 kursi). */
    readonly assetIdsTambahan: readonly number[];
}

function galatValidasi(field: string, message: string): DomainError {
    return new DomainError("VALIDATION_ERROR", message, { errors: [{ field, message }] });
}

export class DocumentService {
    constructor(
        private readonly db: Kysely<Database>,
        private readonly penyimpanan: PenyimpananObjek,
        private readonly audit: AuditLogger,
        private readonly clock: Clock,
    ) {}

    /** `GET /assets/{id}/documents` — aset tak terdaftar → 404. */
    async daftar(ctx: AuthContext, assetId: number): Promise<readonly DokumenRow[]> {
        if ((await asetTidakTerdaftar(this.db, ctx, [assetId])).length > 0) throw new NotFoundError();
        return createAssetDocumentRepository(this.db).daftarUntukAset(ctx, assetId);
    }

    /** `POST /assets/{id}/documents` (SDD-09 §4.2 langkah 5): berkas terdaftar → dokumen bertaut. */
    async unggah(ctx: AuthContext, assetId: number, input: InputDokumen): Promise<DokumenRow> {
        const asetIds = [...new Set([assetId, ...input.assetIdsTambahan])];
        const hilang = await asetTidakTerdaftar(this.db, ctx, asetIds);
        if (hilang.includes(assetId)) throw new NotFoundError();
        if (hilang.length > 0) throw galatValidasi("asset_ids_tambahan", `Aset tidak ditemukan: ${hilang.join(", ")}.`);

        const id = await withTransaction(
            ctx,
            async (scope) => {
                const berkas = createStoredFileRepository(scope.tx);
                const f = await berkas.kunciBerkasDokumen(ctx, input.fileId);
                if (f === undefined) throw galatValidasi("file_id", "Berkas tidak ditemukan, belum dikonfirmasi, sudah dipakai, atau bukan unggahan dokumen aset Anda.");
                const repo = createAssetDocumentRepository(scope.tx);
                const docId = await repo.buat(ctx, input);
                await repo.tautkan(ctx, docId, asetIds);
                await berkas.tetapkanPemilik(ctx, f.id, docId);
                // AL-01 (m06 §11): satu entri per dokumen, seluruh aset yang ditautkan ikut tercatat.
                await this.audit.write(scope, {
                    modul: MODUL,
                    aksi: "DOCUMENT_UPLOADED",
                    entitas: "asset_documents",
                    entitasId: docId,
                    nilaiSesudah: { document_id: docId, file_id: f.id, jenis: input.jenis, nama_berkas: input.namaBerkas, asset_ids: asetIds, garansi_mulai: input.garansiMulai, garansi_selesai: input.garansiSelesai },
                });
                return docId;
            },
            this.db,
        );
        const baru = (await createAssetDocumentRepository(this.db).daftarUntukAset(ctx, assetId)).find((d) => d.id === id);
        if (baru === undefined) throw new Error("Dokumen tidak ditemukan setelah disimpan.");
        return baru;
    }

    /**
     * `DELETE /assets/{id}/documents/{docId}` (FR-06.1 A2, keputusan 9b): melepas tautan aset ini;
     * tautan terakhir → dokumen ditandai dihapus. Objek & berkas dipertahankan (SDD-09 §4.6).
     */
    async hapus(ctx: AuthContext, assetId: number, documentId: number): Promise<{ readonly dokumenDihapus: boolean }> {
        return withTransaction(
            ctx,
            async (scope) => {
                const repo = createAssetDocumentRepository(scope.tx);
                const dok = await repo.padaAset(ctx, assetId, documentId, true);
                if (dok === undefined) throw new NotFoundError();
                const waktu = this.clock.now();
                await repo.lepas(ctx, dok.link_id, waktu);
                const dokumenDihapus = (await repo.jumlahTautanAktif(ctx, dok.id)) === 0;
                if (dokumenDihapus) await repo.hapus(ctx, dok.id, waktu);
                await this.audit.write(scope, {
                    modul: MODUL,
                    aksi: "DOCUMENT_DELETED",
                    entitas: "asset_documents",
                    entitasId: dok.id,
                    nilaiSesudah: { document_id: dok.id, asset_id: assetId, dokumen_dihapus: dokumenDihapus },
                });
                return { dokumenDihapus };
            },
            this.db,
        );
    }

    /**
     * `GET /assets/{id}/documents/{docId}/download` (SDD-09 §4.4): URL 15 menit hanya bila `CLEAN`
     * (409 `FILE_NOT_SCANNED`); setiap unduhan tercatat `DOCUMENT_DOWNLOADED` (FR-06.1 AC).
     */
    async unduh(ctx: AuthContext, assetId: number, documentId: number): Promise<{ url: string; expiresAt: Date }> {
        const dok = await createAssetDocumentRepository(this.db).padaAset(ctx, assetId, documentId);
        if (dok === undefined) throw new NotFoundError();
        const hasil = await urlUnduhBerkas(this.penyimpanan, this.clock, dok);
        await withTransaction(
            ctx,
            (scope) =>
                this.audit.write(scope, {
                    modul: MODUL,
                    aksi: "DOCUMENT_DOWNLOADED",
                    entitas: "asset_documents",
                    entitasId: dok.id,
                    nilaiSesudah: { document_id: dok.id, asset_id: assetId },
                }),
            this.db,
        );
        return hasil;
    }
}

/**
 * Garansi aktif sebuah aset bagi M-11 (BR-052, FR-11.2 A3; PR-03-15) — pemilik data garansi tetap M-06.
 * Pemeriksaan `asset_document.view` milik pemanggil.
 */
export async function garansiAktifAset(executor: QueryExecutor, ctx: AuthContext, assetId: number, tanggal: string): Promise<readonly { readonly id: string; readonly nama_berkas: string; readonly garansi_selesai: string }[]> {
    return createAssetDocumentRepository(executor).garansiAktif(ctx, assetId, tanggal);
}
