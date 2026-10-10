// Pengajuan reservasi ruangan (FR-07.2, sekuens 15.2; PR-03-10, keputusan 14 log phase-03).
// `pratinjau` dan `ajukan` menjalankan pemeriksaan YANG SAMA — P-29 langkah 3 menampilkan persis
// apa yang akan ditolak atau dibentuk. `ajukan` berjalan di transaksi idempoten pemanggil (ID-01):
// reservasi, slot TENTATIVE, dan instance approval lahir dalam SATU transaksi (SDD-AVL-06).

import type { RoomReservationCreated, RoomReservationPreview, TanggalPengajuanRuangan } from "@sigm4/schemas";
import type { Kysely } from "kysely";
import { ruanganUntukReservasi } from "../../m03-locations/index.js";
import type { RuanganReservasi } from "../../m03-locations/index.js";
import type { ApprovalService, KamusFakta, RuleConfigService } from "../../m10-approval/index.js";
import type { AuthContext } from "../../../shared/auth/index.js";
import { daftarSlotTerpakai } from "../../../shared/booking/index.js";
import type { BusinessCalendarService } from "../../../shared/calendar/index.js";
import type { Clock } from "../../../shared/clock/index.js";
import type { Database, TransactionScope } from "../../../shared/db/index.js";
import { withTransaction } from "../../../shared/db/index.js";
import { DomainError } from "../../../shared/errors/index.js";
import type { PengaturanPengajuan } from "../repositories/reservation.repository.js";
import { createReservationRepository } from "../repositories/reservation.repository.js";
import type { RegistriBlokirPemohon } from "./borrower-block-registry.js";
import { blokirPemohon } from "./borrower-block-registry.js";
import type { ReservationService } from "./reservation.service.js";
import type { Kemunculan } from "./schedule.js";
import { alasanTidakSah, jabarkan, kedaluwarsaTentatif } from "./schedule.js";

const JAM_MS = 3_600_000;

/** Isian tervalidasi Zod (`RoomReservationBodySchema`). */
export interface IsianPengajuan {
    readonly room_id: number;
    readonly waktu_mulai: string;
    readonly waktu_selesai: string;
    readonly nama_kegiatan: string;
    readonly jenis_kegiatan: string;
    readonly jumlah_peserta: number;
    readonly keperluan: string | null;
    readonly kebutuhan_tambahan: string | null;
    readonly keterangan: string | null;
    readonly pengulangan?: { readonly hari: readonly number[]; readonly sampai: string } | undefined;
    readonly lewati?: readonly string[] | undefined;
}

interface Kajian {
    readonly ruang: RuanganReservasi;
    readonly pengaturan: PengaturanPengajuan;
    readonly tanggal: readonly (Kemunculan & { readonly keadaan: TanggalPengajuanRuangan["keadaan"]; readonly alasan: string | null })[];
    readonly kuota: { readonly berjalan: number; readonly batas: number };
    readonly fakta: KamusFakta;
}

const galat = (field: string, message: string, ringkas = "Pengajuan reservasi tidak sah."): DomainError =>
    new DomainError("VALIDATION_ERROR", ringkas, { errors: [{ field, message }] });

/** Siswa/OSIS = scope `restricted` pada `reservation.view` — tafsiran yang sama dengan kalender P-27 (BR-022). */
const untukSiswa = (ctx: AuthContext): boolean => ctx.can("reservation.view") && ctx.scopeOf("reservation.view") === "restricted";

export class SubmissionService {
    constructor(
        private readonly db: Kysely<Database>,
        private readonly clock: Clock,
        private readonly kalender: BusinessCalendarService,
        private readonly reservasi: ReservationService,
        private readonly approval: ApprovalService,
        private readonly aturan: RuleConfigService,
        private readonly blokir: RegistriBlokirPemohon = blokirPemohon,
    ) {}

    /** `POST /reservations/preview` — keputusan 14f: tanpa efek samping; kuota dilaporkan, tidak ditolak. */
    async pratinjau(ctx: AuthContext, isian: IsianPengajuan): Promise<RoomReservationPreview> {
        return withTransaction(
            ctx,
            async (scope) => {
                const k = await this.kaji(scope, isian);
                const jalur = await this.aturan.jalurPemohon(scope, "RESERVASI_RUANGAN", k.fakta, ctx.userId);
                return {
                    tanggal: k.tanggal.map((t) => ({ tanggal: t.tanggal, mulai: t.mulai.toISOString(), selesai: t.selesai.toISOString(), keadaan: t.keadaan, alasan: t.alasan })),
                    jalur_persetujuan: jalur.map((l) => ({
                        urutan: l.urutan,
                        approver: l.approver.user?.nama ?? l.approver.role?.nama ?? "—",
                        sla_jam: l.sla_jam,
                        fallback: l.fallback,
                        akan_dilewati: l.akan_dilewati,
                    })),
                    kuota: k.kuota,
                };
            },
            this.db,
        );
    }

    /** `POST /reservations` (FR-07.2 langkah 4-7) — di transaksi idempoten pemanggil. */
    async ajukan(scope: TransactionScope, isian: IsianPengajuan): Promise<RoomReservationCreated> {
        // BR-023a tanpa celah balapan: pengajuan serentak pemohon yang sama berurutan sampai commit.
        await createReservationRepository(scope.tx).kunciPemohon(scope.ctx, scope.ctx.userId);
        const k = await this.kaji(scope, isian);
        if (k.kuota.berjalan >= k.kuota.batas) {
            throw galat(
                "kuota",
                `Anda memiliki ${String(k.kuota.berjalan)} pengajuan yang menunggu persetujuan; batasnya ${String(k.kuota.batas)}.`,
                "Kuota pengajuan yang menunggu persetujuan sudah penuh.",
            );
        }
        const field = isian.pengulangan === undefined ? "waktu_mulai" : "pengulangan";
        const tidakSah = k.tanggal.filter((t) => t.keadaan === "TIDAK_SAH");
        if (tidakSah.length > 0) {
            throw new DomainError("VALIDATION_ERROR", "Sebagian tanggal tidak dapat diajukan.", {
                errors: tidakSah.map((t) => ({ field, message: `${t.tanggal}: ${t.alasan ?? ""}` })),
            });
        }
        // FR-07.2 A1 / BR-024a A4: tanggal bentrok disebut satu per satu — pemohon menyesuaikan atau melewatinya.
        const bentrok = k.tanggal.filter((t) => t.keadaan === "BENTROK");
        if (bentrok.length > 0) {
            throw new DomainError("RESERVATION_CONFLICT", "Slot baru saja dipesan pengguna lain.", {
                errors: bentrok.map((t) => ({ field, message: `${t.tanggal}: ${t.alasan ?? ""}` })),
            });
        }
        const dipesan = k.tanggal.filter((t) => t.keadaan === "TERSEDIA");
        const [pertama] = dipesan;
        if (pertama === undefined) throw galat("lewati", "Seluruh tanggal dilewati — tidak ada yang dapat diajukan.");

        const p = await this.reservasi.buatPengajuanRuangan(scope, {
            roomId: k.ruang.id,
            tanggal: dipesan.map((t) => ({ mulai: t.mulai, selesai: t.selesai })),
            berulang: isian.pengulangan !== undefined,
            kedaluwarsa: kedaluwarsaTentatif(this.clock.now(), k.pengaturan.ttlJam, pertama.mulai),
            namaKegiatan: isian.nama_kegiatan,
            jenisKegiatan: isian.jenis_kegiatan,
            jumlahPeserta: isian.jumlah_peserta,
            keperluan: isian.keperluan,
            kebutuhanTambahan: isian.kebutuhan_tambahan,
            keterangan: isian.keterangan,
        });
        // FR-07.2 langkah 5 / BR-024a: SATU instance bagi seluruh tanggal, merujuk akar pengajuan.
        const inst = await this.approval.createInstance(scope, { jenis: "RESERVASI_RUANGAN", referensiId: Number(p.id), pemohonId: scope.ctx.userId, fakta: k.fakta });
        return {
            id: p.id,
            nomor: p.nomor,
            status: "MENUNGGU_PERSETUJUAN",
            tanggal: p.tanggal.map((t) => ({ id: t.id, nomor: t.nomor, mulai: t.mulai.toISOString(), selesai: t.selesai.toISOString() })),
            approval: { instance_id: inst.instanceId, langkah_aktif: inst.langkahAktif },
        };
    }

    /** Pemeriksaan bersama pratinjau & pengajuan. Galat tingkat pengajuan dilempar; tingkat tanggal dilaporkan. */
    private async kaji(scope: TransactionScope, isian: IsianPengajuan): Promise<Kajian> {
        const ctx = scope.ctx;
        const siswa = untukSiswa(ctx);
        // BR-016 / BR-022: tak layak dijawab sama dengan tak ada (SDD-AUTH-08).
        const ruang = await ruanganUntukReservasi(scope, isian.room_id, siswa);
        if (ruang === undefined) throw galat("room_id", "Ruangan tidak ditemukan atau tidak dapat direservasi.");
        // BR-019 / FR-07.2 A2. Kapasitas kosong = belum ditetapkan M-03, tidak membatasi.
        if (ruang.kapasitas !== null && isian.jumlah_peserta > ruang.kapasitas) {
            throw galat("jumlah_peserta", `Jumlah peserta melebihi kapasitas ruangan (${String(ruang.kapasitas)} orang).`);
        }
        // BR-030 / FR-07.2 A5 (keputusan 14d): titik ekstensi peminjaman & denda.
        const blokir = await this.blokir.periksa(scope, ctx.userId);
        if (blokir.length > 0) {
            throw new DomainError("BORROWER_BLOCKED", "Selesaikan kewajiban terlebih dahulu.", {
                errors: blokir.map((b) => ({ field: "pemohon", message: b.keterangan })),
            });
        }

        const repo = createReservationRepository(scope.tx);
        const pengaturan = await repo.pengaturan(ctx);
        const kuota = { berjalan: await repo.jumlahMenunggu(ctx, ctx.userId), batas: siswa ? pengaturan.kuotaSiswa : pengaturan.kuotaGuruStaf };

        const mulai = new Date(isian.waktu_mulai);
        const selesai = new Date(isian.waktu_selesai);
        const pola = isian.pengulangan;
        const kemunculan = jabarkan(mulai, selesai, pola);
        if (pola !== undefined && kemunculan.length === 0) throw galat("pengulangan", "Pola pengulangan tidak menghasilkan satu pun tanggal.");
        const lewati = new Set(isian.lewati ?? []);
        const asing = [...lewati].filter((t) => !kemunculan.some((k) => k.tanggal === t));
        if (asing.length > 0) throw galat("lewati", `Tanggal ${asing.join(", ")} bukan bagian dari pola pengulangan.`);

        const [pertama] = kemunculan;
        const terakhir = kemunculan.at(-1);
        if (pertama === undefined || terakhir === undefined) throw galat("waktu_mulai", "Waktu pengajuan tidak sah.");
        const { hariKerja, libur } = await this.kalender.kalenderRentang(scope.tx, pertama.tanggal, terakhir.tanggal);
        const aturan = {
            sekarang: this.clock.now(),
            jam: await this.kalender.jamOperasional(scope.tx),
            hariKerja: new Set(hariKerja),
            libur: new Map(libur.map((l) => [l.tanggal, l.nama])),
            granularitasMenit: pengaturan.granularitasMenit,
            jarakMinimumHari: pengaturan.jarakMinimumHari,
            mendesak: ctx.can("reservation.urgent"),
            horizonHari: pengaturan.horizonHari,
        };
        // BR-017: pratinjau bentrok lewat indeks GiST (AV-01); penjamin akhirnya tetap exclusion constraint.
        const terpakai = await daftarSlotTerpakai(scope.tx, "room", [ruang.id], { mulai: pertama.mulai, selesai: terakhir.selesai });
        const tanggal = kemunculan.map((k) => {
            if (lewati.has(k.tanggal)) return { ...k, keadaan: "DILEWATI" as const, alasan: null };
            const alasan = alasanTidakSah(k, aturan);
            if (alasan !== null) return { ...k, keadaan: "TIDAK_SAH" as const, alasan };
            const irisan = terpakai.some((s) => s.mulai.getTime() < k.selesai.getTime() && k.mulai.getTime() < s.selesai.getTime());
            return irisan ? { ...k, keadaan: "BENTROK" as const, alasan: "Ruangan sudah terpakai pada rentang ini." } : { ...k, keadaan: "TERSEDIA" as const, alasan: null };
        });

        const durasiMenit = (selesai.getTime() - mulai.getTime()) / 60_000;
        // FactAdapter RESERVASI_RUANGAN (SDD-APR-09, Lampiran D.2). Pemohon terblokir sudah ditolak di
        // atas, dan di luar jam operasional ditolak BR-018 — keduanya selalu `false` bagi instance yang lahir.
        const fakta: KamusFakta = {
            requester_role: ctx.roleCode,
            requester_id: ctx.userId,
            requester_has_overdue: false,
            duration_hours: Math.ceil(durasiMenit / 60),
            room_type: ruang.jenis,
            room_id: [ruang.id],
            participant_count: isian.jumlah_peserta,
            is_recurring: pola !== undefined,
            is_outside_operating_hours: tanggal.some((t) => t.alasan?.startsWith("Di luar jam operasional") === true),
            lead_time_hours: Math.max(0, Math.floor((pertama.mulai.getTime() - aturan.sekarang.getTime()) / JAM_MS)),
        };
        return { ruang, pengaturan, tanggal, kuota, fakta };
    }
}
