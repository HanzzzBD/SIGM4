// Pemindaian berkas (SDD-09 §4.2 langkah 4, SDD-FS-04; PR-03-05): worker membaca objek, mencocokkan
// magic bytes dengan MIME deklarasi (§4.3), lalu memindainya dengan ClamAV. Modul ini tidak mengenal
// BullMQ — entrypoint worker yang memasangnya ke antrean (pola `user-import`, SDD-SYS-03).

import { performance } from "node:perf_hooks";
import { sql } from "kysely";
import type { Kysely } from "kysely";
import type { AuditLogger } from "../../../shared/audit/index.js";
import type { AuthContext } from "../../../shared/auth/index.js";
import type { Clock } from "../../../shared/clock/index.js";
import { withTransaction } from "../../../shared/db/index.js";
import type { Database, FileScanStatus } from "../../../shared/db/index.js";
import type { HealthCheck, Logger } from "../../../shared/observability/index.js";
import type { PenyimpananObjek } from "../../../shared/storage/index.js";
import { createStoredFileRepository } from "../repositories/stored-file.repository.js";
import type { PemindaiVirus } from "./clamd.js";
import { MIME_JPG, MIME_PNG } from "./kebijakan.js";

const MODUL = "m06-documents";

/** Nama pekerjaan pada antrean `sigm4-jobs` dan registri worker. */
export const NAMA_PEKERJAAN_PINDAI = "file-scan";
/** `jobId` tetap per berkas: event outbox at-least-once (SDD-EVT-07) tidak menggandakan pemindaian. */
export const idJobPindai = (fileId: string | number): string => `${NAMA_PEKERJAAN_PINDAI}-${String(fileId)}`;

/** Tanda tangan awal isi per MIME (SDD-09 §4.3). DOCX/XLSX adalah arsip ZIP (OOXML). */
const MAGIC: Readonly<Record<string, readonly number[]>> = {
    [MIME_JPG]: [0xff, 0xd8, 0xff],
    [MIME_PNG]: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    "application/pdf": [0x25, 0x50, 0x44, 0x46, 0x2d],
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [0x50, 0x4b, 0x03, 0x04],
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [0x50, 0x4b, 0x03, 0x04],
};

/** Isi cocok dengan MIME deklarasi? MIME tanpa tanda tangan dikenal dianggap tidak cocok. */
export function magicCocok(mime: string, isi: Buffer): boolean {
    const tanda = MAGIC[mime];
    return tanda !== undefined && isi.length >= tanda.length && tanda.every((b, i) => isi[i] === b);
}

export interface HasilPindai {
    readonly status: Exclude<FileScanStatus, "PENDING">;
    readonly alasan: string | null;
}

export class FileScanService {
    constructor(
        private readonly db: Kysely<Database>,
        private readonly penyimpanan: PenyimpananObjek,
        private readonly pemindai: PemindaiVirus,
        private readonly audit: AuditLogger,
        private readonly logger: Logger,
        private readonly clock: Clock,
    ) {}

    /**
     * Satu pekerjaan pindai. Galat sementara (storage/clamd) dilempar agar BullMQ mencoba ulang
     * (maks. 3×, SDD-09 §4.2); pada percobaan `akhir` berkas ditutup `FAILED`. Berkas yang sudah
     * diputus dilewati — kecuali `INFECTED` yang objeknya dipastikan terhapus (idempoten).
     */
    async pindai(ctx: AuthContext, fileId: string, akhir: boolean): Promise<HasilPindai | null> {
        const berkas = await createStoredFileRepository(this.db).ambil(ctx, fileId);
        if (berkas === undefined) return null;
        if (berkas.scan_status === "INFECTED") await this.penyimpanan.hapus(berkas.object_key);
        if (berkas.scan_status !== "PENDING") return null;

        let hasil: HasilPindai;
        try {
            const isi = await this.penyimpanan.ambil(berkas.object_key);
            if (isi === null) hasil = { status: "FAILED", alasan: "OBJEK_TIDAK_ADA" };
            // §4.3: magic bytes tak cocok dengan MIME deklarasi → INFECTED, sebelum isi dikirim ke clamd.
            else if (!magicCocok(berkas.mime, isi)) hasil = { status: "INFECTED", alasan: "MIME_TIDAK_COCOK" };
            else {
                const putusan = await this.pemindai.pindai(isi);
                hasil = putusan.bersih ? { status: "CLEAN", alasan: null } : { status: "INFECTED", alasan: putusan.tanda };
            }
        } catch (galat) {
            if (!akhir) throw galat;
            this.logger.error("Pemindaian berkas gagal pada percobaan terakhir", galat, { file_id: fileId });
            hasil = { status: "FAILED", alasan: "PEMINDAIAN_GAGAL" };
        }

        const tercatat = await withTransaction(
            ctx,
            async (scope) => {
                if (!(await createStoredFileRepository(scope.tx).tetapkanHasilPindai(ctx, fileId, hasil.status, this.clock.now()))) return false;
                // AL-01 (keputusan 8b): setiap putusan akhir, pelaku SYSTEM (AL-06).
                await this.audit.write(scope, {
                    modul: MODUL,
                    aksi: "FILE_SCANNED",
                    entitas: "stored_files",
                    entitasId: fileId,
                    nilaiSesudah: { file_id: fileId, hasil: hasil.status, alasan: hasil.alasan },
                });
                return true;
            },
            this.db,
        );
        if (!tercatat) return null;

        if (hasil.status === "INFECTED") {
            // Alarm keamanan (SDD-15 §4.6, keputusan 8c) — baris tetap sebagai jejak, objek dihapus (§4.6).
            this.logger.error("Berkas terinfeksi terdeteksi — objek dihapus", undefined, { alarm: "FILE_INFECTED", file_id: fileId, alasan: hasil.alasan, jenis: berkas.owner_type });
            await this.penyimpanan.hapus(berkas.object_key);
        }
        return hasil;
    }
}

/**
 * `av_scanner` di /health (OBS-06, SDD-15 §4.5): PING ke clamd + kedalaman antrean pindai —
 * berkas terkonfirmasi yang masih PENDING. Seperti `databaseCheck`, probe ini berbicara langsung
 * ke basis data tanpa `AuthContext`: yang dibaca hanya satu bilangan, bukan baris milik siapa pun.
 * Tidak menentukan `ready` (`MENENTUKAN_KESIAPAN`).
 */
export function avScannerCheck(pemindai: PemindaiVirus, db: Kysely<Database>): HealthCheck {
    return {
        name: "av_scanner",
        async probe() {
            const mulai = performance.now();
            await pemindai.ping();
            const latency = Math.round(performance.now() - mulai);
            const { rows } = await sql<{ n: string }>`SELECT count(*)::text AS n FROM stored_files WHERE scan_status = 'PENDING' AND checksum IS NOT NULL`.execute(db);
            return { status: "up", latency_ms: latency, queue: Number(rows[0]?.n ?? 0) };
        },
    };
}
