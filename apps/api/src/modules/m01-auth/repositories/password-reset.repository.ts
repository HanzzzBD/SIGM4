// Repository permintaan reset password sisi Administrator (FR-01.3, SDD-AUTH-05): semua metode
// menerima `AuthContext`. Yang dibaca dan diubah di sini adalah baris `password_reset_requests`,
// serta — pada penerbitan — `users` dan `refresh_tokens` MILIK PENGGUNA SASARAN, bukan pemanggil;
// izinnya `user.reset_password` (scope `all`), ditegakkan `authorize` pada routenya.
//
// PRIVAT terhadap modul (SDD-SYS-03).

import { sql } from "kysely";
import type { AuthContext } from "../../../shared/auth/index.js";
import { BaseRepository, defineRepository } from "../../../shared/db/index.js";
import type { QueryExecutor } from "../../../shared/db/index.js";
import type { PlatformSesi, SesiDicabut } from "./session.repository.js";

export type StatusPermintaan = "MENUNGGU" | "DITERBITKAN" | "DITOLAK" | "SELESAI" | "KEDALUWARSA";
export type MetodeVerifikasi = "KARTU_IDENTITAS_TATAP_MUKA" | "KONFIRMASI_ATASAN_ATAU_WALI_KELAS";

export interface PermintaanRow {
    readonly id: string;
    readonly user_id: string;
    readonly status: StatusPermintaan;
    readonly metode_verifikasi: MetodeVerifikasi | null;
    readonly diminta_pada: Date;
    readonly diproses_oleh: string | null;
    readonly diproses_pada: Date | null;
    readonly kedaluwarsa_pada: Date | null;
    readonly alasan_penolakan: string | null;
}

/** Baris antrean (P-67): permintaan + identitas pemohon (dasar verifikasi luring) + status efektif. */
export interface PermintaanTampil extends PermintaanRow {
    readonly pemohon_nama: string;
    readonly pemohon_email: string;
    readonly pemohon_nip_nis: string;
    readonly pemohon_role_kode: string;
    readonly diproses_oleh_nama: string | null;
}

export interface PenggunaSasaran {
    readonly id: string;
    readonly nama: string;
    readonly email: string;
    readonly nip_nis: string;
    readonly status: "AKTIF" | "NONAKTIF";
}

export interface FilterAntrean {
    readonly status?: StatusPermintaan;
    readonly page: number;
    readonly perPage: number;
}

const KOLOM = [
    "id",
    "user_id",
    "status",
    "metode_verifikasi",
    "diminta_pada",
    "diproses_oleh",
    "diproses_pada",
    "kedaluwarsa_pada",
    "alasan_penolakan",
] as const;

/**
 * Status yang DILIHAT pembaca: `DITERBITKAN` yang lewat 72 jam tampil `KEDALUWARSA` meski barisnya
 * belum disentuh login (kedaluwarsa ditegakkan saat dibaca, tanpa pekerjaan terjadwal — keputusan
 * PR-02-05). Ekspresi SQL tunggal agar filter dan tampilan tidak dapat berbeda.
 */
const statusEfektif = (sekarang: Date) =>
    sql<StatusPermintaan>`CASE WHEN r.status = 'DITERBITKAN' AND r.kedaluwarsa_pada <= ${sekarang} THEN 'KEDALUWARSA' ELSE r.status::text END`;

export class PasswordResetRepository extends BaseRepository {
    constructor(executor: QueryExecutor) {
        super(executor);
    }

    /** Permintaan + pemohon (dasar verifikasi luring) + pemroses, dengan status efektif (`statusEfektif`). */
    private tampil(ctx: AuthContext, sekarang: Date) {
        return this.query(ctx)
            .selectFrom("password_reset_requests as r")
            .innerJoin("users as u", "u.id", "r.user_id")
            .innerJoin("roles as ro", "ro.id", "u.role_id")
            .leftJoin("users as p", "p.id", "r.diproses_oleh")
            .select([
                "r.id",
                "r.user_id",
                statusEfektif(sekarang).as("status"),
                "r.metode_verifikasi",
                "r.diminta_pada",
                "r.diproses_oleh",
                "r.diproses_pada",
                "r.kedaluwarsa_pada",
                "r.alasan_penolakan",
                "u.nama as pemohon_nama",
                "u.email as pemohon_email",
                "u.nip_nis as pemohon_nip_nis",
                "ro.kode as pemohon_role_kode",
                "p.nama as diproses_oleh_nama",
            ]);
    }

    /** Antrean: terbaru dulu. */
    async daftar(ctx: AuthContext, sekarang: Date, filter: FilterAntrean): Promise<{ rows: readonly PermintaanTampil[]; total: number }> {
        const efektif = statusEfektif(sekarang);
        const saring = filter.status === undefined ? undefined : sql<boolean>`${efektif} = ${filter.status}`;
        let baris = this.tampil(ctx, sekarang);
        let hitung = this.query(ctx)
            .selectFrom("password_reset_requests as r")
            .select((eb) => eb.fn.countAll<string>().as("n"));
        if (saring !== undefined) {
            baris = baris.where(saring);
            hitung = hitung.where(saring);
        }
        const [rows, jumlah] = await Promise.all([
            baris
                .orderBy("r.diminta_pada", "desc")
                .orderBy("r.id", "desc")
                .limit(filter.perPage)
                .offset((filter.page - 1) * filter.perPage)
                .execute(),
            hitung.executeTakeFirstOrThrow(),
        ]);
        return { rows, total: Number(jumlah.n) };
    }

    async ambilTampil(ctx: AuthContext, sekarang: Date, id: string): Promise<PermintaanTampil | undefined> {
        return this.tampil(ctx, sekarang).where("r.id", "=", id).executeTakeFirst();
    }

    /** Tanpa kunci: dipakai hanya untuk mengetahui `user_id` sebelum urutan kunci (pengguna lebih dulu). */
    async cari(ctx: AuthContext, id: string): Promise<PermintaanRow | undefined> {
        return this.query(ctx).selectFrom("password_reset_requests").select(KOLOM).where("id", "=", id).executeTakeFirst();
    }

    /** Mengunci baris permintaan; dipanggil SETELAH pengguna dikunci (urutan tetap → tanpa deadlock). */
    async kunciPermintaan(ctx: AuthContext, id: string): Promise<PermintaanRow | undefined> {
        return this.query(ctx).selectFrom("password_reset_requests").select(KOLOM).where("id", "=", id).forUpdate().executeTakeFirst();
    }

    /** Permintaan `MENUNGGU` terbaru akun ini, dikunci — dipakai reset langsung agar tak menggandakannya. */
    async kunciMenungguTerbaru(ctx: AuthContext, userId: string): Promise<PermintaanRow | undefined> {
        return this.query(ctx)
            .selectFrom("password_reset_requests")
            .select(KOLOM)
            .where("user_id", "=", userId)
            .where("status", "=", "MENUNGGU")
            .orderBy("diminta_pada", "desc")
            .orderBy("id", "desc")
            .limit(1)
            .forUpdate()
            .executeTakeFirst();
    }

    async kunciPengguna(ctx: AuthContext, userId: string): Promise<PenggunaSasaran | undefined> {
        return this.query(ctx)
            .selectFrom("users")
            .select(["id", "nama", "email", "nip_nis", "status"])
            .where("id", "=", userId)
            .forUpdate()
            .executeTakeFirst();
    }

    async tandaiDiterbitkan(
        ctx: AuthContext,
        id: string,
        data: { metode: MetodeVerifikasi; oleh: number; pada: Date; kedaluwarsa: Date },
    ): Promise<void> {
        await this.query(ctx)
            .updateTable("password_reset_requests")
            .set({
                status: "DITERBITKAN",
                metode_verifikasi: data.metode,
                diproses_oleh: data.oleh,
                diproses_pada: data.pada,
                kedaluwarsa_pada: data.kedaluwarsa,
            })
            .where("id", "=", id)
            .where("status", "=", "MENUNGGU")
            .execute();
    }

    /** Reset langsung dari detail pengguna (P-63) tanpa permintaan pemohon: langsung `DITERBITKAN`. */
    async sisipDiterbitkanLangsung(
        ctx: AuthContext,
        userId: string,
        data: { metode: MetodeVerifikasi; oleh: number; pada: Date; kedaluwarsa: Date },
    ): Promise<string> {
        const baris = await this.query(ctx)
            .insertInto("password_reset_requests")
            .values({
                user_id: userId,
                status: "DITERBITKAN",
                metode_verifikasi: data.metode,
                diminta_pada: data.pada,
                diproses_oleh: data.oleh,
                diproses_pada: data.pada,
                kedaluwarsa_pada: data.kedaluwarsa,
            })
            .returning("id")
            .executeTakeFirstOrThrow();
        return baris.id;
    }

    /** Password sementara sebelumnya tidak berlaku lagi begitu yang baru terbit (hash-nya sudah diganti). */
    async kedaluwarsakanPenerbitanLain(ctx: AuthContext, userId: string, kecuali: string): Promise<void> {
        await this.query(ctx)
            .updateTable("password_reset_requests")
            .set({ status: "KEDALUWARSA" })
            .where("user_id", "=", userId)
            .where("status", "=", "DITERBITKAN")
            .where("id", "<>", kecuali)
            .execute();
    }

    async tolak(ctx: AuthContext, id: string, data: { oleh: number; pada: Date; alasan: string }): Promise<void> {
        await this.query(ctx)
            .updateTable("password_reset_requests")
            .set({ status: "DITOLAK", diproses_oleh: data.oleh, diproses_pada: data.pada, alasan_penolakan: data.alasan })
            .where("id", "=", id)
            .where("status", "=", "MENUNGGU")
            .execute();
    }

    /**
     * Menetapkan password sementara: hash baru, `must_change_password` menyala (FR-01.3 langkah 4),
     * dan penghitung/penguncian login dihapus — identitas pemilik akun sudah diverifikasi luring,
     * sehingga kunci yang tersisa tidak boleh menghalanginya masuk dengan password barunya.
     */
    async tetapkanPasswordSementara(ctx: AuthContext, userId: string, passwordHash: string): Promise<void> {
        await this.query(ctx)
            .updateTable("users")
            .set({
                password_hash: passwordHash,
                must_change_password: true,
                failed_login_count: 0,
                failed_login_window_start: null,
                locked_until: null,
            })
            .where("id", "=", userId)
            .execute();
    }

    /** Mencabut SELURUH sesi pengguna sasaran; satu entri per keluarga yang benar-benar dicabut. */
    async cabutSemuaSesi(ctx: AuthContext, userId: string, waktu: Date, alasan: string): Promise<readonly SesiDicabut[]> {
        const baris = await this.query(ctx)
            .updateTable("refresh_tokens")
            .set({ revoked_at: waktu, revoke_reason: alasan })
            .where("user_id", "=", userId)
            .where("revoked_at", "is", null)
            .returning(["family_id", "platform"])
            .execute();
        const perKeluarga = new Map<string, SesiDicabut>();
        for (const b of baris) perKeluarga.set(b.family_id, { familyId: b.family_id, platform: b.platform as PlatformSesi });
        return [...perKeluarga.values()];
    }
}

/** Pintu masuk repository: `defineRepository` menolak metode yang tidak menerima `AuthContext` (SDD-AUTH-02). */
export function createPasswordResetRepository(executor: QueryExecutor): PasswordResetRepository {
    return defineRepository(new PasswordResetRepository(executor));
}
