// Turunan gambar (SDD-FS-07, SDD-09 §4.5; PR-03-07, keputusan 10 log phase-03): `thumb` 200 px dan
// `medium` 800 px sisi terpanjang, WebP. Dibuat worker HANYA untuk berkas yang sudah `CLEAN` —
// pengolah gambar tidak pernah membuka berkas yang belum lolos ClamAV dan magic bytes (keputusan 10b).
// Kegagalan tidak menggagalkan apa pun: kolom tetap NULL dan klien jatuh ke berkas asli (§4.5).

import sharp from "sharp";
import type { Kysely } from "kysely";
import type { AuthContext } from "../../../shared/auth/index.js";
import { withTransaction } from "../../../shared/db/index.js";
import type { Database } from "../../../shared/db/index.js";
import type { Logger } from "../../../shared/observability/index.js";
import type { PenyimpananObjek } from "../../../shared/storage/index.js";
import { createStoredFileRepository } from "../repositories/stored-file.repository.js";
import { MIME_JPG, MIME_PNG } from "./kebijakan.js";

/** Nama pekerjaan pada antrean `sigm4-jobs`; dijadwalkan konsumen `FileScanned` berhasil `CLEAN`. */
export const NAMA_PEKERJAAN_TURUNAN = "file-derivatives";
export const idJobTurunan = (fileId: string | number): string => `${NAMA_PEKERJAAN_TURUNAN}-${String(fileId)}`;

/** SDD-09 §4.5 — sisi terpanjang. */
export const UKURAN_TURUNAN = { thumb: 200, medium: 800 } as const;
const MIME_WEBP = "image/webp";

/** Kunci turunan dari kunci asli: tetap buram (SDD-FS-06) dan berada di "folder" yang sama. */
export function kunciTurunan(objectKey: string, varian: keyof typeof UKURAN_TURUNAN): string {
    return `${objectKey.replace(/\.[^./]+$/, "")}-${varian}.webp`;
}

/**
 * Satu varian: orientasi EXIF diterapkan lalu SELURUH metadata dibuang (sharp tidak menyalinnya
 * ke keluaran) — lokasi GPS foto ponsel tidak ikut ke turunan. Tidak pernah diperbesar.
 */
export function buatVarian(isi: Buffer, sisi: number): Promise<Buffer> {
    return sharp(isi, { failOn: "error" }).rotate().resize(sisi, sisi, { fit: "inside", withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
}

export class DerivativeService {
    constructor(
        private readonly db: Kysely<Database>,
        private readonly penyimpanan: PenyimpananObjek,
        private readonly logger: Logger,
    ) {}

    /**
     * Idempoten (event at-least-once): berkas bukan gambar, belum CLEAN, atau sudah berturunan
     * dilewati. Galat sementara dilempar agar antrean mencoba ulang; percobaan `akhir` yang gagal
     * hanya dicatat sebagai peringatan.
     */
    async buat(ctx: AuthContext, fileId: string, akhir: boolean): Promise<boolean> {
        const berkas = await createStoredFileRepository(this.db).ambil(ctx, fileId);
        if (berkas === undefined || berkas.scan_status !== "CLEAN" || berkas.thumb_key !== null) return false;
        if (berkas.mime !== MIME_JPG && berkas.mime !== MIME_PNG) return false;
        try {
            const isi = await this.penyimpanan.ambil(berkas.object_key);
            if (isi === null) return false;
            const thumb = kunciTurunan(berkas.object_key, "thumb");
            const medium = kunciTurunan(berkas.object_key, "medium");
            await this.penyimpanan.simpan(thumb, await buatVarian(isi, UKURAN_TURUNAN.thumb), MIME_WEBP);
            await this.penyimpanan.simpan(medium, await buatVarian(isi, UKURAN_TURUNAN.medium), MIME_WEBP);
            // Turunan adalah cache teknis yang dapat dibuat ulang dari asli, bukan data bisnis —
            // tidak dicatat activity log (keputusan 10 log phase-03).
            return await withTransaction(ctx, (scope) => createStoredFileRepository(scope.tx).tetapkanTurunan(ctx, fileId, thumb, medium), this.db);
        } catch (galat) {
            if (!akhir) throw galat;
            this.logger.warn("Turunan gambar gagal dibuat — klien memakai berkas asli", { file_id: fileId, galat: galat instanceof Error ? galat.message : String(galat) });
            return false;
        }
    }
}
