// PasswordResetService — reset password administratif (FR-01.3, PR-02-05). Sistem tidak memakai
// kanal email: pemohon mengajukan permintaan, Administrator memverifikasi identitasnya luring,
// mencatat metode verifikasi, lalu menerbitkan password sementara yang tampil SATU KALI.
//
// Yang tidak pernah terjadi di sini: password sementara tidak disimpan (hanya hash-nya pada
// `users.password_hash`), tidak masuk activity log (AL-05), tidak masuk payload event, dan tidak
// dikirim lewat kanal notifikasi mana pun (FR-01.3 AC) — ia hanya kembali sebagai nilai balik
// `terbitkan*` untuk ditampilkan controller sekali.
//
// Yang berubah pada akun sasaran saat penerbitan (keputusan pemilik produk, 19 September 2026):
// password diganti, `must_change_password` menyala, penghitung dan kunci login dihapus, dan
// SELURUH sesi dicabut (`SessionRevoked`, alasan `password_reset`).

import type { Kysely } from "kysely";
import type { AuditEntry, AuditLogger } from "../../../shared/audit/index.js";
import { createAuthContext } from "../../../shared/auth/index.js";
import type { AuthContext } from "../../../shared/auth/index.js";
import type { Clock } from "../../../shared/clock/index.js";
import { withTransaction } from "../../../shared/db/index.js";
import type { Database, TransactionScope } from "../../../shared/db/index.js";
import { DomainError, NotFoundError } from "../../../shared/errors/index.js";
import { publish, publishAll } from "../../../shared/events/index.js";
import type { Logger } from "../../../shared/observability/index.js";
import { generateTemporaryPassword, hashPassword } from "../../../shared/security/index.js";
import { AuthRepository } from "../repositories/auth.repository.js";
import { createPasswordResetRepository } from "../repositories/password-reset.repository.js";
import type {
    FilterAntrean,
    MetodeVerifikasi,
    PenggunaSasaran,
    PermintaanRow,
    PermintaanTampil,
} from "../repositories/password-reset.repository.js";
import { jejakKlien } from "./klien.js";
import type { KlienPermintaan } from "./klien.js";
import { eventSesiDicabut } from "./sesi-event.js";

const MODUL = "m01-auth";

/** FR-01.3 A3: password sementara berlaku 72 jam. */
export const MASA_PASSWORD_SEMENTARA_MS = 72 * 60 * 60_000;
/** FR-01.3 A4: paling banyak 3 permintaan per akun per 24 jam. */
export const BATAS_PERMINTAAN = 3;
export const JENDELA_PERMINTAAN_MS = 24 * 60 * 60_000;

/** Event outbox (SDD-07 §4.3): konsumennya — notifikasi `NT-37` dan `NT-38` — dipasang `PR-02-25`. */
export const EVENT_RESET_DIMINTA = "PasswordResetRequested";
export const EVENT_RESET_DITERBITKAN = "PasswordResetIssued";
const AGREGAT_PENGGUNA = "user";

/** `refresh_tokens.revoke_reason` (SDD-04 §4.7). */
const ALASAN_SESI_RESET = "password_reset";

/** Alasan internal pada `PASSWORD_RESET_REQUESTED` GAGAL; TIDAK pernah sampai ke pemohon (FR-01.3 A1). */
const ALASAN_EMAIL_TIDAK_DIKENAL = "EMAIL_TIDAK_DIKENAL";
const ALASAN_AKUN_NONAKTIF = "AKUN_NONAKTIF";
const ALASAN_MELEBIHI_BATAS = "MELEBIHI_BATAS";

export interface HasilPenerbitan {
    readonly permintaan: PermintaanTampil;
    /** Ditampilkan SATU kali; tidak ada jalan untuk membacanya lagi (FR-01.3 AC). */
    readonly passwordSementara: string;
}

/** Entri `PASSWORD_RESET_REQUESTED` bagi pemohon yang belum diautentikasi: sasaran pada entitas, bukan pelaku. */
function entriDiminta(
    targetId: string | null,
    hasil: "SUKSES" | "GAGAL",
    nilai: Readonly<Record<string, unknown>>,
    klien: KlienPermintaan,
): AuditEntry {
    return {
        modul: MODUL,
        aksi: "PASSWORD_RESET_REQUESTED",
        hasil,
        ...(targetId === null ? {} : { entitas: "users", entitasId: targetId }),
        nilaiSesudah: nilai,
        ...jejakKlien(klien),
    };
}

export class PasswordResetService {
    constructor(
        private readonly db: Kysely<Database>,
        private readonly audit: AuditLogger,
        private readonly clock: Clock,
        private readonly logger: Logger,
    ) {}

    /**
     * `POST /auth/password/forgot` (FR-01.3 langkah 1–2). Selalu selesai tanpa galat dan tanpa
     * membedakan hasilnya — email tak terdaftar, akun nonaktif, permintaan melebihi batas, dan
     * permintaan yang dibuat semuanya kembali sama (A1). Perbedaannya hanya ada di log internal.
     */
    async ajukan(email: string, klien: KlienPermintaan): Promise<void> {
        const sekarang = this.clock.now();
        const user = await new AuthRepository(this.db).cariUserByEmail(email);

        if (user === undefined) {
            await this.catatDitolakAnonim(null, ALASAN_EMAIL_TIDAK_DIKENAL, klien);
            return;
        }
        if (user.status !== "AKTIF") {
            await this.catatDitolakAnonim(user.id, ALASAN_AKUN_NONAKTIF, klien);
            return;
        }

        const melebihi = await this.db.transaction().setIsolationLevel("read committed").execute(async (tx) => {
            const repo = new AuthRepository(tx);
            // Kunci baris pengguna lebih dulu: dua permintaan serentak tidak boleh sama-sama lolos batas 3.
            await repo.kunciUser(user.id);
            const jumlah = await repo.hitungPermintaanReset(user.id, new Date(sekarang.getTime() - JENDELA_PERMINTAAN_MS));
            if (jumlah >= BATAS_PERMINTAAN) {
                await this.audit.writeAnonim(tx, entriDiminta(user.id, "GAGAL", { alasan: ALASAN_MELEBIHI_BATAS, jumlah_24_jam: jumlah }, klien));
                return true;
            }
            const permintaanId = await repo.sisipPermintaanReset(user.id, sekarang);
            await this.audit.writeAnonim(tx, entriDiminta(user.id, "SUKSES", { permintaan_id: permintaanId }, klien));
            // SDD-EVT-04: terbit di dalam transaksi; konsumen NT-37 (Administrator) dipasang PR-02-25. Pelaku
            // outbox adalah pemohon — permintaan ini tidak berautentikasi dan `publish` mensyaratkan konteks.
            await publish(
                { ctx: createAuthContext({ userId: Number(user.id), roleCode: user.role_kode, scopes: new Map() }), tx },
                {
                    name: EVENT_RESET_DIMINTA,
                    aggregateType: AGREGAT_PENGGUNA,
                    aggregateId: user.id,
                    payload: { permintaan_id: permintaanId, user_id: user.id },
                },
            );
            return false;
        });

        if (melebihi) {
            // NFR-S-16, OBS-05, FR-01.3 A4: anomali keamanan. Pemohon tetap menerima jawaban netral.
            this.logger.warn("Permintaan reset password melampaui batas per 24 jam", {
                user_id: user.id,
                batas: BATAS_PERMINTAAN,
            });
        }
    }

    /** `GET /auth/password/requests` (P-67). Status yang lewat 72 jam tampil `KEDALUWARSA`. */
    async daftar(ctx: AuthContext, filter: FilterAntrean): Promise<{ rows: readonly PermintaanTampil[]; total: number }> {
        return createPasswordResetRepository(this.db).daftar(ctx, this.clock.now(), filter);
    }

    /** `POST /auth/password/requests/{id}/issue` (FR-01.3 langkah 3–4). */
    async terbitkan(ctx: AuthContext, permintaanId: string, metode: MetodeVerifikasi, klien: KlienPermintaan): Promise<HasilPenerbitan> {
        const awal = await createPasswordResetRepository(this.db).cari(ctx, permintaanId);
        if (awal === undefined) throw new NotFoundError();
        return this.terbitkanUntuk(ctx, awal.user_id, permintaanId, metode, klien);
    }

    /**
     * `POST /users/{id}/reset-password` (M-02, P-63): reset langsung dari detail pengguna. Bila akun itu
     * punya permintaan `MENUNGGU`, permintaan itulah yang diselesaikan (tak ada permintaan ganda);
     * bila tidak, dicatat permintaan baru yang langsung `DITERBITKAN` — metode verifikasi tetap wajib.
     */
    async terbitkanLangsung(ctx: AuthContext, userId: string, metode: MetodeVerifikasi, klien: KlienPermintaan): Promise<HasilPenerbitan> {
        return this.terbitkanUntuk(ctx, userId, undefined, metode, klien);
    }

    /** `POST /auth/password/requests/{id}/reject` (FR-01.3 A2). Pemohon diberi tahu luring. */
    async tolak(ctx: AuthContext, permintaanId: string, alasan: string, klien: KlienPermintaan): Promise<PermintaanTampil> {
        const awal = await createPasswordResetRepository(this.db).cari(ctx, permintaanId);
        if (awal === undefined) throw new NotFoundError();

        await withTransaction(
            ctx,
            async (scope) => {
                const repo = createPasswordResetRepository(scope.tx);
                // Urutan kunci sama dengan penerbitan: pengguna lebih dulu, baru permintaan.
                await repo.kunciPengguna(ctx, awal.user_id);
                const permintaan = await repo.kunciPermintaan(ctx, permintaanId);
                if (permintaan === undefined) throw new NotFoundError();
                if (permintaan.status !== "MENUNGGU") throw new DomainError("VALIDATION_ERROR", "Permintaan ini sudah diproses.");

                const sekarang = this.clock.now();
                await repo.tolak(ctx, permintaanId, { oleh: ctx.userId, pada: sekarang, alasan });
                // AL-01: dalam transaksi yang sama. `alasan` adalah teks Administrator, bukan rahasia.
                await this.audit.write(scope, {
                    modul: MODUL,
                    aksi: "PASSWORD_RESET_REJECTED",
                    entitas: "users",
                    entitasId: permintaan.user_id,
                    nilaiSesudah: { permintaan_id: permintaanId, alasan },
                    ...jejakKlien(klien),
                });
            },
            this.db,
        );
        return this.bacaSatu(ctx, permintaanId);
    }

    // -------------------------------------------------------------------------------------------

    /** Kegagalan tanpa permintaan (email tak dikenal / akun nonaktif): dicatat, tidak ada baris permintaan. */
    private async catatDitolakAnonim(targetId: string | null, alasan: string, klien: KlienPermintaan): Promise<void> {
        await this.db
            .transaction()
            .setIsolationLevel("read committed")
            .execute((tx) => this.audit.writeAnonim(tx, entriDiminta(targetId, "GAGAL", { alasan }, klien)));
    }

    private async terbitkanUntuk(
        ctx: AuthContext,
        userId: string,
        permintaanId: string | undefined,
        metode: MetodeVerifikasi,
        klien: KlienPermintaan,
    ): Promise<HasilPenerbitan> {
        const hasil = await withTransaction(
            ctx,
            async (scope) => {
                const repo = createPasswordResetRepository(scope.tx);
                // Urutan kunci TETAP: pengguna, lalu permintaan. Jalur per-permintaan dan jalur langsung
                // tidak akan saling menunggu dalam urutan terbalik (deadlock).
                const pengguna = await repo.kunciPengguna(ctx, userId);
                if (pengguna === undefined) throw new NotFoundError();
                if (pengguna.status !== "AKTIF") {
                    throw new DomainError("VALIDATION_ERROR", "Akun pengguna tidak aktif; aktifkan akun lebih dulu.");
                }

                const menunggu =
                    permintaanId === undefined
                        ? await repo.kunciMenungguTerbaru(ctx, userId)
                        : await repo.kunciPermintaan(ctx, permintaanId);
                if (permintaanId !== undefined) {
                    if (menunggu === undefined) throw new NotFoundError();
                    if (menunggu.status !== "MENUNGGU") throw new DomainError("VALIDATION_ERROR", "Permintaan ini sudah diproses.");
                }

                const sekarang = this.clock.now();
                const kedaluwarsa = new Date(sekarang.getTime() + MASA_PASSWORD_SEMENTARA_MS);
                const data = { metode, oleh: ctx.userId, pada: sekarang, kedaluwarsa };

                const passwordSementara = generateTemporaryPassword({ nama: pengguna.nama, email: pengguna.email, nipNis: pengguna.nip_nis });
                await repo.tetapkanPasswordSementara(ctx, userId, await hashPassword(passwordSementara));

                let idPermintaan: string;
                if (menunggu === undefined) {
                    idPermintaan = await repo.sisipDiterbitkanLangsung(ctx, userId, data);
                } else {
                    idPermintaan = menunggu.id;
                    await repo.tandaiDiterbitkan(ctx, idPermintaan, data);
                }
                await repo.kedaluwarsakanPenerbitanLain(ctx, userId, idPermintaan);

                const sesiDicabut = await repo.cabutSemuaSesi(ctx, userId, sekarang, ALASAN_SESI_RESET);
                await this.tulisJejakPenerbitan(scope, pengguna, idPermintaan, data, sesiDicabut.length, klien);
                await publishAll(scope, [
                    {
                        name: EVENT_RESET_DITERBITKAN,
                        aggregateType: AGREGAT_PENGGUNA,
                        aggregateId: userId,
                        payload: { permintaan_id: idPermintaan, user_id: userId, oleh: String(ctx.userId), kedaluwarsa_pada: kedaluwarsa.toISOString() },
                    },
                    ...sesiDicabut.map((s) => eventSesiDicabut(userId, s, ALASAN_SESI_RESET)),
                ]);
                return { idPermintaan, passwordSementara };
            },
            this.db,
        );

        return { permintaan: await this.bacaSatu(ctx, hasil.idPermintaan), passwordSementara: hasil.passwordSementara };
    }

    /** AL-01/AL-05: memuat siapa, siapa sasarannya, dan metode — TIDAK memuat password sementara. */
    private async tulisJejakPenerbitan(
        scope: TransactionScope,
        pengguna: PenggunaSasaran,
        permintaanId: string,
        data: { metode: MetodeVerifikasi; kedaluwarsa: Date },
        jumlahSesi: number,
        klien: KlienPermintaan,
    ): Promise<void> {
        await this.audit.write(scope, {
            modul: MODUL,
            aksi: "PASSWORD_RESET_ISSUED",
            entitas: "users",
            entitasId: pengguna.id,
            nilaiSesudah: {
                permintaan_id: permintaanId,
                metode_verifikasi: data.metode,
                kedaluwarsa_pada: data.kedaluwarsa.toISOString(),
                sesi_dicabut: jumlahSesi,
            },
            ...jejakKlien(klien),
        });
    }

    private async bacaSatu(ctx: AuthContext, permintaanId: string): Promise<PermintaanTampil> {
        const baris = await createPasswordResetRepository(this.db).ambilTampil(ctx, this.clock.now(), permintaanId);
        if (baris === undefined) throw new NotFoundError();
        return baris;
    }
}

export type { PermintaanRow };
