// UserImportService (FR-02.1 A4, IMPT-01 … IMPT-04). Setiap impor menjadi satu
// baris `user_import_jobs`: jangkar idempotensi hash-berkas (IMPT-03) dan sumber
// laporan per baris (IMPT-02).
//
// Berkas <= 200 baris diproses sinkron di dalam permintaan; di atasnya hanya
// dijadwalkan — baris pekerjaan + event outbox `UserImportRequested` dalam SATU
// transaksi (SDD-EVT-04) — dan diproses worker (IMPT-04).
//
// Setiap baris diproses lewat `UserService.create()` APA ADANYA — satu transaksi
// PER BARIS (bukan satu untuk seluruh berkas), sehingga baris yang gagal
// (duplikat, validasi) tidak pernah menggagalkan atau membatalkan baris lain
// yang sudah berhasil (IMPT-01).

import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import ExcelJS from "exceljs";
import type { Kysely } from "kysely";
import type { AuthContext } from "../../../shared/auth/index.js";
import type { AuditLogger } from "../../../shared/audit/index.js";
import { SystemClock } from "../../../shared/clock/index.js";
import type { Clock } from "../../../shared/clock/index.js";
import type { Database } from "../../../shared/db/index.js";
import { withTransaction } from "../../../shared/db/index.js";
import { DomainError, NotFoundError } from "../../../shared/errors/index.js";
import { publish } from "../../../shared/events/index.js";
import type { Logger } from "../../../shared/observability/index.js";
import { createUserImportRepository } from "../repositories/user-import.repository.js";
import type { ImportFailure, ImportJobRow } from "../repositories/user-import.repository.js";
import {
    BATAS_BARIS_IMPOR,
    ImportUserRowSchema,
} from "../schemas/user-import.schema.js";
import type { UserService } from "./user.service.js";

const MODUL = "m02-users";

/** IMPT-03: jendela idempotensi hash-berkas. */
export const JENDELA_IDEMPOTENSI_MS = 24 * 60 * 60 * 1000;

/** Event outbox pekerjaan impor (SDD-07 §4.3). */
export const EVENT_IMPOR_DIMINTA = "UserImportRequested";
export const EVENT_IMPOR_SELESAI = "UserImportCompleted";
const AGREGAT_IMPOR = "UserImportJob";

/** Kolom wajib ada di header — `kode_unit_kerja`/`telepon` opsional (skema). */
const KOLOM_WAJIB = ["nama_lengkap", "email", "nip_nis", "kode_role"] as const;

export interface ImportUsersInput {
    readonly filename: string;
    readonly contentBase64: string;
}

interface BarisMentah {
    readonly nomor: number;
    readonly data: Readonly<Record<string, string | undefined>>;
}

async function bacaBerkas(
    filename: string,
    buffer: Buffer,
): Promise<readonly BarisMentah[]> {
    const workbook = new ExcelJS.Workbook();
    let worksheet: ExcelJS.Worksheet;
    try {
        if (/\.csv$/i.test(filename)) {
            worksheet = await workbook.csv.read(Readable.from(buffer));
        } else {
            // exceljs mendeklarasikan ulang `Buffer` global sebagai
            // `extends ArrayBuffer` (node_modules/exceljs/index.d.ts baris 1),
            // bergabung dengan `Buffer` Node asli (`extends Uint8Array`) menjadi
            // tipe yang tidak dapat dipenuhi objek Buffer sungguhan apa pun — bug
            // definisi tipe pihak ketiga, bukan sesuatu yang dapat diperbaiki
            // lewat cast. Runtime-nya benar: `Workbook#load` menerima Buffer Node
            // biasa.
            // @ts-expect-error — lihat komentar di atas; exceljs@4.4.0.
            await workbook.xlsx.load(buffer);
            const pertama = workbook.worksheets[0];
            if (pertama === undefined) {
                throw new DomainError(
                    "INVALID_REQUEST",
                    "Berkas XLSX tidak memiliki sheet.",
                );
            }
            worksheet = pertama;
        }
    } catch (galat) {
        if (galat instanceof DomainError) throw galat;
        throw new DomainError(
            "INVALID_REQUEST",
            "Berkas tidak dapat dibaca sebagai CSV/XLSX yang sah.",
        );
    }

    const indeksKolom = new Map<string, number>();
    worksheet.getRow(1).eachCell((cell, kolom) => {
        const nama = String(cell.value ?? "")
            .trim()
            .toLowerCase();
        if (nama.length > 0) indeksKolom.set(nama, kolom);
    });

    const kolomHilang = KOLOM_WAJIB.filter((k) => !indeksKolom.has(k));
    if (kolomHilang.length > 0) {
        throw new DomainError(
            "INVALID_REQUEST",
            `Kolom wajib hilang pada header: ${kolomHilang.join(", ")}`,
        );
    }

    const hasil: BarisMentah[] = [];
    for (let r = 2; r <= worksheet.rowCount; r += 1) {
        const row = worksheet.getRow(r);
        if (row.actualCellCount === 0) continue; // baris kosong dilewati
        const data: Record<string, string | undefined> = {};
        for (const [nama, kolom] of indeksKolom) {
            const nilai = row.getCell(kolom).value;
            const teks =
                nilai === null || nilai === undefined ? "" : String(nilai).trim();
            // Sel kosong == kolom tidak diisi, apa pun bentuknya di berkas
            // (null XLSX, string kosong CSV pada kolom terakhir, dst.) — bukan
            // "diisi string kosong". Tanpa ini, `telepon`/`kode_unit_kerja`
            // opsional yang dikosongkan pengunggah salah ditolak `min(1)`.
            data[nama] = teks.length === 0 ? undefined : teks;
        }
        hasil.push({ nomor: r, data });
    }
    return hasil;
}

function ringkasZod(galat: { issues: readonly { message: string }[] }): string {
    return galat.issues.map((i) => i.message).join("; ");
}

export interface SubmitResult {
    readonly job: ImportJobRow;
    /** true bila berkas identik sudah diimpor dalam 24 jam dan hasilnya dikembalikan (IMPT-03). */
    readonly replay: boolean;
}

export class UserImportService {
    constructor(
        private readonly db: Kysely<Database>,
        private readonly userService: UserService,
        private readonly audit: AuditLogger,
        private readonly logger: Logger,
        private readonly clock: Clock = new SystemClock(),
    ) {}

    /**
     * Menerima berkas. Berkas identik dalam 24 jam mengembalikan pekerjaan yang
     * sudah ada tanpa memproses ulang (IMPT-03); selain itu <= 200 baris diproses
     * di sini dan lebih dari itu dijadwalkan ke worker (IMPT-04).
     */
    async submit(ctx: AuthContext, input: ImportUsersInput): Promise<SubmitResult> {
        const buffer = Buffer.from(input.contentBase64, "base64");
        // Berkas rusak / header kurang ditolak SEBELUM pekerjaan tercatat: yang
        // tercatat hanya impor yang benar-benar dapat diproses.
        const baris = await bacaBerkas(input.filename, buffer);
        const fileHash = createHash("sha256").update(buffer).digest("hex");
        const asinkron = baris.length > BATAS_BARIS_IMPOR;

        const diterima = await withTransaction(
            ctx,
            async (scope) => {
                const repo = createUserImportRepository(scope.tx);
                // Kunci di atas hash: dua unggahan identik bersamaan tidak bisa
                // sama-sama lolos pencarian (IMPT-03).
                await repo.lockHash(ctx, fileHash);
                const sejak = new Date(this.clock.now().getTime() - JENDELA_IDEMPOTENSI_MS);
                const ada = await repo.findReplay(ctx, fileHash, sejak);
                if (ada !== undefined) return { job: ada, replay: true };

                const job = await repo.insert(ctx, {
                    fileHash,
                    namaBerkas: input.filename,
                    status: asinkron ? "MENUNGGU" : "BERJALAN",
                    totalBaris: baris.length,
                    berkas: asinkron ? buffer : null,
                });
                await this.audit.write(scope, {
                    modul: MODUL,
                    aksi: "USER_IMPORT_REQUESTED",
                    entitas: "user_import_jobs",
                    entitasId: job.id,
                    nilaiSesudah: {
                        nama_berkas: input.filename,
                        total: baris.length,
                        mode: asinkron ? "ASINKRON" : "SINKRON",
                    },
                });
                if (asinkron) {
                    // SDD-EVT-04: terbit di dalam transaksi ini — pekerjaan tidak pernah
                    // dijadwalkan untuk baris yang ternyata di-rollback.
                    await publish(scope, {
                        name: EVENT_IMPOR_DIMINTA,
                        aggregateType: AGREGAT_IMPOR,
                        aggregateId: job.id,
                        payload: { job_id: job.id, oleh: ctx.userId },
                    });
                }
                return { job, replay: false };
            },
            this.db,
        );

        if (diterima.replay || asinkron) return diterima;
        return { job: await this.proses(ctx, diterima.job, baris), replay: false };
    }

    async get(ctx: AuthContext, id: number): Promise<ImportJobRow> {
        const job = await createUserImportRepository(this.db).findById(ctx, id);
        if (job === undefined) throw new NotFoundError("Pekerjaan impor tidak ditemukan.");
        return job;
    }

    /**
     * Dipanggil worker (JOB-01). Aman dijalankan ulang: pekerjaan yang sudah
     * berakhir dilewati, dan yang terputus melanjutkan dari `baris_terproses`
     * (JOB-06) — pengguna yang sudah dibuat tidak dibuat dua kali.
     */
    async jalankan(ctx: AuthContext, id: number): Promise<void> {
        const repo = createUserImportRepository(this.db);
        const job = await repo.mulai(ctx, id);
        if (job === undefined) return;
        if (job.created_by !== String(ctx.userId)) {
            throw new DomainError("FORBIDDEN", "Pekerjaan impor bukan milik pemanggil.");
        }
        const berkas = await repo.findBerkas(ctx, id);
        if (berkas === null || berkas === undefined) {
            await this.gagalkan(ctx, id, "Isi berkas impor tidak tersedia.");
            return;
        }
        const baris = await bacaBerkas(job.nama_berkas, berkas);
        await this.proses(ctx, job, baris);
    }

    /** Menutup pekerjaan sebagai GAGAL (mis. percobaan ulang habis, pengunggah tak berwenang lagi). */
    async gagalkan(ctx: AuthContext, id: number, pesan: string): Promise<void> {
        await this.tutup(ctx, id, (repo, sekarang) => repo.gagalkan(ctx, id, pesan, sekarang));
    }

    private async proses(
        ctx: AuthContext,
        job: ImportJobRow,
        baris: readonly BarisMentah[],
    ): Promise<ImportJobRow> {
        const repo = createUserImportRepository(this.db);
        const peranId = await this.petaRole();
        const unitId = await this.petaUnitKerja();
        const id = Number(job.id);

        for (let i = job.baris_terproses; i < baris.length; i += 1) {
            const b = baris[i];
            if (b === undefined) break;
            const gagal = await this.prosesBaris(ctx, b, peranId, unitId);
            await repo.catatBaris(ctx, id, i + 1, gagal);
        }
        return this.tutup(ctx, id, (r, sekarang) => r.selesai(ctx, id, sekarang));
    }

    /**
     * Menutup pekerjaan, mencatat ringkasannya (`USER_IMPORTED`), dan — untuk
     * jalur asinkron — menerbitkan `UserImportCompleted` (NT-52) dalam transaksi
     * yang sama.
     */
    private async tutup(
        ctx: AuthContext,
        id: number,
        tulis: (
            repo: ReturnType<typeof createUserImportRepository>,
            sekarang: Date,
        ) => Promise<ImportJobRow | undefined>,
    ): Promise<ImportJobRow> {
        return withTransaction(
            ctx,
            async (scope) => {
                const repo = createUserImportRepository(scope.tx);
                const ditutup = await tulis(repo, this.clock.now());
                // Sudah berakhir: tidak ada yang ditulis, jadi tidak ada yang dicatat.
                if (ditutup === undefined) {
                    const ada = await repo.findById(ctx, Number(id));
                    if (ada === undefined) throw new NotFoundError("Pekerjaan impor tidak ditemukan.");
                    return ada;
                }
                const job = ditutup;
                await this.audit.write(scope, {
                    modul: MODUL,
                    aksi: "USER_IMPORTED",
                    entitas: "user_import_jobs",
                    entitasId: job.id,
                    nilaiSesudah: {
                        nama_berkas: job.nama_berkas,
                        status: job.status,
                        total: job.total_baris,
                        sukses: job.sukses,
                        gagal: job.gagal,
                    },
                });
                if (job.total_baris > BATAS_BARIS_IMPOR) {
                    await publish(scope, {
                        name: EVENT_IMPOR_SELESAI,
                        aggregateType: AGREGAT_IMPOR,
                        aggregateId: job.id,
                        payload: { job_id: job.id, oleh: ctx.userId },
                    });
                }
                return job;
            },
            this.db,
        );
    }

    private async petaRole(): Promise<ReadonlyMap<string, number>> {
        const rows = await this.db
            .selectFrom("roles")
            .select(["id", "kode"])
            .execute();
        return new Map(rows.map((r) => [r.kode, Number(r.id)]));
    }

    /**
     * `kode` -> id `work_units`, dinormalisasi seperti indeks unik `0017`
     * (huruf kecil, spasi tepi dibuang). Status unit TIDAK disaring di sini:
     * `UserService.create()` menolak unit nonaktif dengan pesan yang jelas.
     */
    private async petaUnitKerja(): Promise<ReadonlyMap<string, number>> {
        const rows = await this.db
            .selectFrom("work_units")
            .select(["id", "kode"])
            .execute();
        return new Map(rows.map((r) => [r.kode.trim().toLowerCase(), Number(r.id)]));
    }

    private async prosesBaris(
        ctx: AuthContext,
        baris: BarisMentah,
        peranId: ReadonlyMap<string, number>,
        unitId: ReadonlyMap<string, number>,
    ): Promise<ImportFailure | null> {
        const parsed = ImportUserRowSchema.safeParse(baris.data);
        if (!parsed.success) {
            const email =
                typeof baris.data["email"] === "string" ? baris.data["email"] : null;
            return {
                baris: baris.nomor,
                email,
                pesan: ringkasZod(parsed.error),
            };
        }

        const roleId = peranId.get(parsed.data.kode_role);
        if (roleId === undefined) {
            return {
                baris: baris.nomor,
                email: parsed.data.email,
                pesan: `Kode role tidak dikenal: ${parsed.data.kode_role}`,
            };
        }

        // E.5.2: `kode_unit_kerja` harus ada pada master unit kerja (WU-01).
        let workUnitId: number | null = null;
        if (parsed.data.kode_unit_kerja !== undefined) {
            const ditemukan = unitId.get(parsed.data.kode_unit_kerja.toLowerCase());
            if (ditemukan === undefined) {
                return {
                    baris: baris.nomor,
                    email: parsed.data.email,
                    pesan: `Kode unit kerja tidak dikenal: ${parsed.data.kode_unit_kerja}`,
                };
            }
            workUnitId = ditemukan;
        }

        try {
            await this.userService.create(ctx, {
                nama: parsed.data.nama_lengkap,
                email: parsed.data.email,
                nipNis: parsed.data.nip_nis,
                roleId,
                workUnitId,
                consentWali: parsed.data.consent_wali === true,
                telepon: parsed.data.telepon ?? null,
            });
            return null;
        } catch (galat) {
            if (galat instanceof DomainError) {
                return {
                    baris: baris.nomor,
                    email: parsed.data.email,
                    pesan: galat.message,
                };
            }
            // IMPT-01: kegagalan tak terduga tetap tidak boleh menggagalkan
            // baris lain — dicatat untuk observability, baris ini ditandai gagal.
            this.logger.error("Baris impor pengguna gagal tak terduga", galat, {
                modul: MODUL,
                baris: baris.nomor,
            });
            return {
                baris: baris.nomor,
                email: parsed.data.email,
                pesan: "Kesalahan tak terduga saat memproses baris.",
            };
        }
    }
}
