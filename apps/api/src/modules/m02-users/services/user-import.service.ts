// UserImportService (FR-02.1 A4, IMPT-01, IMPT-02). SINKRON saja — lihat
// schemas/user-import.schema.ts untuk batas dan alasan pemisahan `PR-01-17`.
//
// Setiap baris diproses lewat `UserService.create()` APA ADANYA — satu
// transaksi PER BARIS (bukan satu transaksi untuk seluruh berkas), sehingga
// baris yang gagal (duplikat, validasi) tidak pernah menggagalkan atau
// membatalkan baris lain yang sudah berhasil (IMPT-01).

import { Readable } from "node:stream";
import ExcelJS from "exceljs";
import type { Kysely } from "kysely";
import type { AuthContext } from "../../../shared/auth/index.js";
import type { AuditLogger } from "../../../shared/audit/index.js";
import type { Database } from "../../../shared/db/index.js";
import { withTransaction } from "../../../shared/db/index.js";
import { DomainError } from "../../../shared/errors/index.js";
import type { Logger } from "../../../shared/observability/index.js";
import {
    BATAS_BARIS_IMPOR,
    ImportUserRowSchema,
} from "../schemas/user-import.schema.js";
import type { UserService } from "./user.service.js";

const MODUL = "m02-users";

/** Kolom wajib ada di header — `kode_unit_kerja`/`telepon` opsional (skema). */
const KOLOM_WAJIB = ["nama_lengkap", "email", "nip_nis", "kode_role"] as const;

export interface ImportRowOutcome {
    readonly baris: number;
    readonly status: "SUKSES" | "GAGAL";
    readonly email: string | null;
    readonly pesan: string | null;
}

export interface ImportUsersResult {
    readonly total: number;
    readonly sukses: number;
    readonly gagal: number;
    readonly baris: readonly ImportRowOutcome[];
}

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

export class UserImportService {
    constructor(
        private readonly db: Kysely<Database>,
        private readonly userService: UserService,
        private readonly audit: AuditLogger,
        private readonly logger: Logger,
    ) {}

    async import(
        ctx: AuthContext,
        input: ImportUsersInput,
    ): Promise<ImportUsersResult> {
        const buffer = Buffer.from(input.contentBase64, "base64");
        const baris = await bacaBerkas(input.filename, buffer);

        if (baris.length > BATAS_BARIS_IMPOR) {
            throw new DomainError(
                "VALIDATION_ERROR",
                `Berkas melebihi ${String(BATAS_BARIS_IMPOR)} baris; pemrosesan asinkron belum tersedia (IMPT-04, PR-01-17).`,
                { batas: BATAS_BARIS_IMPOR, ditemukan: baris.length },
            );
        }

        const peranId = await this.petaRole();
        const unitId = await this.petaUnitKerja();
        const hasil: ImportRowOutcome[] = [];
        for (const b of baris) {
            hasil.push(await this.prosesBaris(ctx, b, peranId, unitId));
        }

        const sukses = hasil.filter((h) => h.status === "SUKSES").length;
        const gagal = hasil.length - sukses;
        await this.catatRingkasan(ctx, input.filename, hasil.length, sukses, gagal);

        return { total: hasil.length, sukses, gagal, baris: hasil };
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
    ): Promise<ImportRowOutcome> {
        const parsed = ImportUserRowSchema.safeParse(baris.data);
        if (!parsed.success) {
            const email =
                typeof baris.data["email"] === "string" ? baris.data["email"] : null;
            return {
                baris: baris.nomor,
                status: "GAGAL",
                email,
                pesan: ringkasZod(parsed.error),
            };
        }

        const roleId = peranId.get(parsed.data.kode_role);
        if (roleId === undefined) {
            return {
                baris: baris.nomor,
                status: "GAGAL",
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
                    status: "GAGAL",
                    email: parsed.data.email,
                    pesan: `Kode unit kerja tidak dikenal: ${parsed.data.kode_unit_kerja}`,
                };
            }
            workUnitId = ditemukan;
        }

        try {
            const dibuat = await this.userService.create(ctx, {
                nama: parsed.data.nama_lengkap,
                email: parsed.data.email,
                nipNis: parsed.data.nip_nis,
                roleId,
                workUnitId,
                telepon: parsed.data.telepon ?? null,
            });
            return {
                baris: baris.nomor,
                status: "SUKSES",
                email: dibuat.user.email,
                pesan: null,
            };
        } catch (galat) {
            if (galat instanceof DomainError) {
                return {
                    baris: baris.nomor,
                    status: "GAGAL",
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
                status: "GAGAL",
                email: parsed.data.email,
                pesan: "Kesalahan tak terduga saat memproses baris.",
            };
        }
    }

    private async catatRingkasan(
        ctx: AuthContext,
        namaBerkas: string,
        total: number,
        sukses: number,
        gagal: number,
    ): Promise<void> {
        await withTransaction(
            ctx,
            async (scope) => {
                await this.audit.write(scope, {
                    modul: MODUL,
                    aksi: "USER_IMPORTED",
                    entitas: "users",
                    nilaiSesudah: { nama_berkas: namaBerkas, total, sukses, gagal },
                });
            },
            this.db,
        );
    }
}
