// Daftar & detail reservasi `GET /reservations`, `GET /reservations/{id}` (m07 §7, UX P-30/P-31,
// FR-07.3 langkah 1; PR-03-27, keputusan 17 log phase-03). Aksi yang ditawarkan layar diturunkan
// dari fungsi aturan YANG SAMA dengan endpoint tulisnya — klien tak pernah menebak (pembatalan
// keputusan 15, pencatatan keputusan 16).

import type { ReservationDetail, ReservationListItem } from "@sigm4/schemas";
import type { Kysely } from "kysely";
import type { ApprovalService } from "../../m10-approval/index.js";
import { riwayatEntitas } from "../../m18-activity-log/index.js";
import type { AuditLogger } from "../../../shared/audit/index.js";
import type { AuthContext } from "../../../shared/auth/index.js";
import type { Clock } from "../../../shared/clock/index.js";
import type { Database, StatusReservasi } from "../../../shared/db/index.js";
import { withTransaction } from "../../../shared/db/index.js";
import { NotFoundError } from "../../../shared/errors/index.js";
import type { BarisKelompok, SaringanDaftar } from "../repositories/reservation-query.repository.js";
import { createReservationQueryRepository } from "../repositories/reservation-query.repository.js";
import { rencanakanPembatalan } from "./cancellation-plan.js";
import { tambahHari, tengahMalamWib } from "./schedule.js";
import { alasanTolakPencatatan } from "./usage.service.js";

/** Keputusan 17d: pengajuan baru terisi dari pengajuan yang berakhir tanpa terlaksana. */
const DAPAT_DIAJUKAN_ULANG: ReadonlySet<StatusReservasi> = new Set(["PERLU_REVISI", "DITOLAK", "KEDALUWARSA"]);

export interface QueryDaftar {
    readonly q?: string | undefined;
    readonly jenis?: "RUANGAN" | "ASET" | undefined;
    readonly status?: StatusReservasi | undefined;
    readonly pemohon?: "saya" | number | undefined;
    readonly dari?: string | undefined;
    readonly sampai?: string | undefined;
    readonly urut: "diajukan" | "mulai";
    readonly page: number;
    readonly per_page: number;
}

export interface HalamanDaftar {
    readonly data: readonly ReservationListItem[];
    readonly meta: { readonly page: number; readonly per_page: number; readonly total: number; readonly total_pages: number };
}

/** Aksi P-31 bagi pemanggil atas baris `id` dalam `kelompok` — murni, diuji tersendiri. */
export function aksiTersedia(ctx: AuthContext, kelompok: readonly BarisKelompok[], id: string, sudahDicatat: boolean, sekarang: Date): ReservationDetail["aksi"] {
    const baris = kelompok.find((b) => b.id === id);
    const akar = kelompok.find((b) => b.parent_id === null);
    if (baris === undefined || akar === undefined) return { batalkan: false, ubah_jadwal: false, ajukan_ulang: false, catat_penggunaan: { kondisi: false, tidak_digunakan: false } };
    const pemilik = akar.pemohon_id === String(ctx.userId);
    const indukBerulang = baris.parent_id === null && kelompok.length > 1;
    // m07 §7 + keputusan 15b: gerbang `cancel_own`, pihak lain menuntut tambahan `cancel_any`.
    const bolehBatal = ctx.can("reservation.cancel_own") && (pemilik || ctx.can("reservation.cancel_any"));
    const batalkan = bolehBatal && rencanakanPembatalan(kelompok, akar.id, id, sekarang).sah;
    const pengaju = pemilik && ctx.can("reservation.create");
    // Pencatatan per tanggal pemegang slot (keputusan 16b).
    const catat = (hasil: "BAIK" | "TIDAK_DIGUNAKAN") => ctx.can("reservation.record_usage") && !indukBerulang && alasanTolakPencatatan(baris.status, sudahDicatat, hasil) === null;
    return {
        batalkan,
        ubah_jadwal: batalkan && pengaju && !indukBerulang,
        ajukan_ulang: pengaju && baris.parent_id === null && DAPAT_DIAJUKAN_ULANG.has(baris.status),
        catat_penggunaan: { kondisi: catat("BAIK"), tidak_digunakan: catat("TIDAK_DIGUNAKAN") },
    };
}

export class ReservationQueryService {
    constructor(
        private readonly db: Kysely<Database>,
        private readonly clock: Clock,
        private readonly audit: AuditLogger,
        private readonly approval: ApprovalService,
    ) {}

    async daftar(ctx: AuthContext, q: QueryDaftar): Promise<HalamanDaftar> {
        const saringan: SaringanDaftar = {
            q: q.q,
            jenis: q.jenis,
            status: q.status,
            pemohonId: q.pemohon === "saya" ? ctx.userId : q.pemohon,
            dari: q.dari === undefined ? undefined : tengahMalamWib(q.dari),
            // `sampai` inklusif: sampai 00.00 WIB hari sesudahnya.
            sampai: q.sampai === undefined ? undefined : tengahMalamWib(tambahHari(q.sampai, 1)),
            urut: q.urut,
            page: q.page,
            perPage: q.per_page,
        };
        const { baris, total } = await createReservationQueryRepository(this.db).daftar(ctx, saringan);
        return {
            data: baris.map((b) => ({
                id: b.id,
                nomor: b.nomor,
                jenis: b.jenis,
                status: b.status,
                nama_kegiatan: b.nama_kegiatan,
                ruangan: b.room_id === null || b.ruangan === null ? null : { id: b.room_id, nama: b.ruangan },
                pemohon: { id: b.pemohon_id, nama: b.pemohon },
                waktu_mulai: b.waktu_mulai.toISOString(),
                waktu_selesai: b.waktu_selesai.toISOString(),
                diajukan_pada: b.created_at.toISOString(),
                jumlah_tanggal: Number(b.jumlah_tanggal),
            })),
            meta: { page: q.page, per_page: q.per_page, total, total_pages: Math.ceil(total / q.per_page) },
        };
    }

    /** Di luar scope = 404, sama dengan tidak ada (SDD-AUTH-08). Penyajian riwayat tercatat (keputusan 17e). */
    async detail(ctx: AuthContext, id: number): Promise<ReservationDetail> {
        return withTransaction(
            ctx,
            async (scope) => {
                const repo = createReservationQueryRepository(scope.tx);
                const v = await repo.detail(scope.ctx, id);
                if (v === undefined) throw new NotFoundError("Reservasi tidak ditemukan.");
                const akarId = Number(v.parent_id ?? v.id);
                const kelompok = await repo.kelompok(scope.ctx, akarId);
                const turunan = v.parent_id === null ? kelompok.filter((b) => b.parent_id !== null) : [];
                const induk = v.parent_id === null ? undefined : kelompok.find((b) => b.id === v.parent_id);
                const nomor = new Map(kelompok.map((b) => [b.id, b.nomor]));
                const riwayat = await riwayatEntitas(scope, this.audit, "reservations", [v.id, ...turunan.map((t) => t.id)], "reservasi");
                return {
                    id: v.id,
                    nomor: v.nomor,
                    jenis: v.jenis,
                    status: v.status,
                    ruangan: v.room_id === null || v.ruangan === null ? null : { id: v.room_id, nama: v.ruangan, gedung: v.gedung ?? "" },
                    pemohon: { id: v.pemohon_id, nama: v.pemohon },
                    nama_kegiatan: v.nama_kegiatan,
                    jenis_kegiatan: v.jenis_kegiatan,
                    jumlah_peserta: v.jumlah_peserta,
                    keperluan: v.keperluan,
                    kebutuhan_tambahan: v.kebutuhan_tambahan,
                    keterangan: v.keterangan,
                    waktu_mulai: v.waktu_mulai.toISOString(),
                    waktu_selesai: v.waktu_selesai.toISOString(),
                    diajukan_pada: v.created_at.toISOString(),
                    induk: induk === undefined ? null : { id: induk.id, nomor: induk.nomor },
                    tanggal: turunan.map((t) => ({ id: t.id, nomor: t.nomor, status: t.status, waktu_mulai: t.waktu_mulai.toISOString(), waktu_selesai: t.waktu_selesai.toISOString() })),
                    penggunaan:
                        v.penggunaan_dicatat_pada === null
                            ? null
                            : { kondisi_ruangan: v.kondisi_ruangan, catatan: v.catatan_penggunaan, dicatat_oleh: v.dicatat_oleh, dicatat_pada: v.penggunaan_dicatat_pada.toISOString() },
                    approval_instance_id: (await this.approval.instanceObjek(scope, v.jenis === "RUANGAN" ? "RESERVASI_RUANGAN" : "RESERVASI_ASET", akarId)) ?? null,
                    aksi: aksiTersedia(scope.ctx, kelompok, v.id, v.penggunaan_dicatat_pada !== null, this.clock.now()),
                    riwayat: riwayat.map((r) => ({
                        waktu: r.waktu.toISOString(),
                        aksi: r.aksi,
                        pelaku: r.user_nama,
                        nomor: r.entitas_id === null ? null : (nomor.get(r.entitas_id) ?? null),
                        status: r.status,
                        keterangan: r.keterangan,
                    })),
                };
            },
            this.db,
        );
    }
}
