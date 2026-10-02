// Layanan berkas — unggah presigned + konfirmasi (SDD-09 §4.2, Bab 17.5 poin 6; PR-03-25) dan
// penjaga unduh (SDD-FS-03). Byte berkas tidak pernah melewati proses ini (SDD-FS-01).

import { randomUUID } from "node:crypto";
import type { Kysely } from "kysely";
import type { AuditLogger } from "../../../shared/audit/index.js";
import type { AuthContext } from "../../../shared/auth/index.js";
import type { Clock } from "../../../shared/clock/index.js";
import { withTransaction } from "../../../shared/db/index.js";
import type { Database, FileOwnerType, FileScanStatus, TransactionScope } from "../../../shared/db/index.js";
import { DomainError, NotFoundError } from "../../../shared/errors/index.js";
import { publish } from "../../../shared/events/index.js";
import type { InfoObjek, PenyimpananObjek } from "../../../shared/storage/index.js";
import { createStoredFileRepository } from "../repositories/stored-file.repository.js";
import type { BerkasRow } from "../repositories/stored-file.repository.js";
import { EKSTENSI, periksaKebijakan } from "./kebijakan.js";

const MODUL = "m06-documents";

/** Masa berlaku URL unggah (SDD-09 §4.2 langkah 1). */
export const BERLAKU_UNGGAH_DETIK = 300;
/** Masa berlaku URL unduhan (SDD-FS-05, FR-06.1). */
export const BERLAKU_UNDUH_DETIK = 900;

/** Event outbox (SDD-07 §4.3) — konsumen pemindaian AV dipasang `PR-03-05` (SDD-FS-04). */
export const EVENT_BERKAS_TERUNGGAH = "FileUploaded";

export interface HasilPresign {
    readonly fileId: string;
    readonly objectKey: string;
    readonly uploadUrl: string;
}

export interface HasilKonfirmasi {
    readonly fileId: string;
    readonly scanStatus: FileScanStatus;
}

function galatValidasi(field: string, message: string): DomainError {
    return new DomainError("VALIDATION_ERROR", message, { errors: [{ field, message }] });
}

/**
 * SDD-FS-03: satu-satunya jalan menuju presigned GET. Berkas yang belum `CLEAN` → `409
 * FILE_NOT_SCANNED`; pemeriksaan permission tetap milik pemanggil, SEBELUM fungsi ini.
 */
export async function urlUnduhBerkas(penyimpanan: PenyimpananObjek, clock: Clock, berkas: { readonly object_key: string; readonly scan_status: FileScanStatus }): Promise<{ url: string; expiresAt: Date }> {
    if (berkas.scan_status !== "CLEAN") throw new DomainError("FILE_NOT_SCANNED", "Berkas masih diperiksa atau tidak lolos pemindaian, belum dapat diunduh.");
    const url = await penyimpanan.urlUnduh(berkas.object_key, BERLAKU_UNDUH_DETIK);
    return { url, expiresAt: new Date(clock.now().getTime() + BERLAKU_UNDUH_DETIK * 1000) };
}

/** Idempoten bagi klien yang mengulang (antrean unggah mobile, MOB-OFF-02); checksum lain ditolak. */
function sudahDikonfirmasi(berkas: BerkasRow, checksum: string): HasilKonfirmasi {
    if (berkas.checksum !== checksum) throw galatValidasi("checksum", "Berkas ini sudah dikonfirmasi dengan checksum berbeda.");
    return { fileId: berkas.id, scanStatus: berkas.scan_status };
}

export class FileService {
    constructor(
        private readonly db: Kysely<Database>,
        private readonly penyimpanan: PenyimpananObjek,
        private readonly audit: AuditLogger,
        private readonly clock: Clock,
    ) {}

    /** `POST /files/presign`. Tidak dicatat: pesanan yang tak dikonfirmasi dibersihkan SDD-FS-09 (keputusan 5c). */
    async presign(ctx: AuthContext, input: { jenis: FileOwnerType; mime: string; ukuran: number }): Promise<HasilPresign> {
        const pelanggaran = periksaKebijakan(input.jenis, input.mime, input.ukuran);
        if (pelanggaran !== null) throw galatValidasi(pelanggaran.field, pelanggaran.message);

        // SDD-FS-06: `{jenis}/{yyyy}/{mm}/{uuid}.{ext}` — tanpa nama asli, ID entitas, atau identitas.
        const sekarang = this.clock.now();
        const bulan = String(sekarang.getUTCMonth() + 1).padStart(2, "0");
        const objectKey = `${input.jenis.toLowerCase().replaceAll("_", "-")}/${String(sekarang.getUTCFullYear())}/${bulan}/${randomUUID()}.${EKSTENSI[input.mime] ?? "bin"}`;

        const fileId = await withTransaction(ctx, (scope) => createStoredFileRepository(scope.tx).pesan(ctx, { objectKey, mime: input.mime, ukuran: input.ukuran, jenis: input.jenis }), this.db);
        const uploadUrl = await this.penyimpanan.urlUnggah(objectKey, input.mime, input.ukuran, BERLAKU_UNGGAH_DETIK);
        return { fileId, objectKey, uploadUrl };
    }

    /** `POST /files/confirm` (SDD-09 §4.2 langkah 3). Berkas orang lain tampak tidak ada (17.5 poin 3). */
    async konfirmasi(ctx: AuthContext, fileId: number, checksum: string): Promise<HasilKonfirmasi> {
        const berkas = await createStoredFileRepository(this.db).milikPengunggah(ctx, fileId);
        if (berkas === undefined) throw new NotFoundError();
        if (berkas.checksum !== null) return sudahDikonfirmasi(berkas, checksum);

        // HEAD di luar transaksi: tidak menahan koneksi basis data selama panggilan jaringan.
        let objek: InfoObjek | null;
        try {
            objek = await this.penyimpanan.info(berkas.object_key);
        } catch {
            throw new DomainError("STORAGE_UNAVAILABLE");
        }
        if (objek === null) throw galatValidasi("file_id", "Berkas belum terunggah ke penyimpanan.");
        if (objek.ukuran !== Number(berkas.ukuran)) throw galatValidasi("file_id", "Ukuran berkas terunggah tidak sesuai dengan yang dideklarasikan.");

        const hasil = await withTransaction(
            ctx,
            async (scope): Promise<HasilKonfirmasi | null> => {
                if (!(await createStoredFileRepository(scope.tx).konfirmasi(ctx, berkas.id, checksum))) return null;
                // AL-01: dalam transaksi yang sama; tanpa nama asli berkas (SDD-FS-06, m06 §11).
                await this.audit.write(scope, {
                    modul: MODUL,
                    aksi: "FILE_UPLOADED",
                    entitas: "stored_files",
                    entitasId: berkas.id,
                    nilaiSesudah: { file_id: berkas.id, jenis: berkas.owner_type, mime: berkas.mime, ukuran: Number(berkas.ukuran) },
                });
                // SDD-EVT-03: pemindaian AV setelah commit, lewat outbox.
                await publish(scope, { name: EVENT_BERKAS_TERUNGGAH, aggregateType: "stored_file", aggregateId: berkas.id, payload: { file_id: berkas.id } });
                return { fileId: berkas.id, scanStatus: "PENDING" };
            },
            this.db,
        );
        if (hasil !== null) return hasil;
        // Kalah dari konfirmasi serentak: berlaku sebagai pengulangan.
        const terkini = await createStoredFileRepository(this.db).milikPengunggah(ctx, fileId);
        if (terkini === undefined) throw new NotFoundError();
        return sudahDikonfirmasi(terkini, checksum);
    }
}

/** Keadaan foto profil bagi `GET /me` (keputusan 7c log phase-03): URL hanya bila `CLEAN`. */
export interface TampilanFoto {
    readonly status: FileScanStatus;
    readonly url: string | null;
}

/**
 * Pintu foto profil bagi M-01 (`PUT /me`, `GET /me`): bentuknya didefinisikan pemakai dan
 * dipenuhi secara struktural di composition root — M-01 tidak menyentuh `stored_files`.
 */
export function buatPengelolaFotoProfil(db: Kysely<Database>, penyimpanan: PenyimpananObjek, clock: Clock) {
    return {
        /** Dalam transaksi `PUT /me`: tautkan foto baru, lepas yang lama (keputusan 7b). */
        async ganti(scope: TransactionScope, baru: number | null, lama: string | null): Promise<void> {
            const repo = createStoredFileRepository(scope.tx);
            if (baru !== null && !(await repo.tautkanFotoProfil(scope.ctx, baru))) {
                throw galatValidasi("foto_file_id", "Foto profil tidak ditemukan, belum dikonfirmasi, atau bukan unggahan Anda.");
            }
            if (lama !== null && lama !== String(baru)) await repo.lepasFotoProfil(scope.ctx, lama);
        },
        async tampil(ctx: AuthContext, fileId: string | null): Promise<TampilanFoto | null> {
            if (fileId === null) return null;
            const berkas = await createStoredFileRepository(db).ambil(ctx, fileId);
            if (berkas === undefined) return null;
            if (berkas.scan_status !== "CLEAN") return { status: berkas.scan_status, url: null };
            return { status: "CLEAN", url: (await urlUnduhBerkas(penyimpanan, clock, berkas)).url };
        },
    };
}
