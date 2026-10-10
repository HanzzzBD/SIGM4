// Blokade jadwal tetap & blokade manual ruangan (FR-07.5; PR-03-13, keputusan 19 log phase-03).
//   * Jadwal tetap = ATURAN mingguan (satu baris per hari); slot `fixed_schedule` CONFIRMED
//     dimaterialisasi per kemunculan dalam horizon — saat aturan dibuat (sinkron) dan oleh job
//     harian `fixed-schedule-materialize` yang memperpanjang horizon & melepas kemunculan yang
//     kini jatuh pada hari libur (A4).
//   * Blokade manual = satu rentang menerus = satu slot `manual_block`.
//   * A1 (keputusan 19c): reservasi menunggu/disetujui yang beririsan tak pernah dibatalkan diam-diam
//     — penyimpanan ditolak 409 kecuali pengguna memilih eksplisit membatalkannya (beralasan, NT-08).
//   * Blokade mutlak (keputusan 19d): `reservation.urgent` pun tak memesan di atasnya.
//   * Aturan tak dapat disunting (keputusan 19f): nonaktifkan (slot mendatang dilepas, A3) lalu buat baru.

import type { RoomBlockCreated, RoomBlockList, RoomBlockPreview } from "@sigm4/schemas";
import type { Kysely } from "kysely";
import { ruanganUntukReservasi } from "../../m03-locations/index.js";
import { periodeAkademikAktif } from "../../m20-settings/index.js";
import type { AuditLogger } from "../../../shared/audit/index.js";
import type { AuthContext } from "../../../shared/auth/index.js";
import { SlotService, daftarSlotTerpakai, slotMilikBlokade } from "../../../shared/booking/index.js";
import type { SlotTerpakai } from "../../../shared/booking/index.js";
import type { BusinessCalendarService } from "../../../shared/calendar/index.js";
import type { Clock } from "../../../shared/clock/index.js";
import type { Database, TransactionScope } from "../../../shared/db/index.js";
import { withTransaction } from "../../../shared/db/index.js";
import { DomainError, NotFoundError } from "../../../shared/errors/index.js";
import type { AturanTersimpan } from "../repositories/block.repository.js";
import { createBlockRepository } from "../repositories/block.repository.js";
import { createReservationRepository } from "../repositories/reservation.repository.js";
import type { AturanMingguan, GalatIsian, KemunculanBlokade, KonteksValidasi } from "./block-plan.js";
import { galatAturanMingguan, galatBlokadeManual, jabarkanAturan } from "./block-plan.js";
import type { CancellationService } from "./cancellation.service.js";
import { tambahHari, tanggalWib } from "./schedule.js";

const MODUL = "m07-reservation-room";

export type IsianBlokade =
    | { readonly jenis: "JADWAL_TETAP"; readonly hari: readonly number[]; readonly jam_mulai: string; readonly jam_selesai: string; readonly berlaku_mulai: string; readonly berlaku_sampai: string; readonly label_kegiatan: string }
    | { readonly jenis: "BLOKADE_MANUAL"; readonly mulai: string; readonly selesai: string; readonly label_kegiatan: string };

export interface HasilSinkronAturan {
    readonly dibuat: number;
    readonly dilepas: number;
    /** Kemunculan yang beririsan slot lain — dilewati, dicoba lagi putaran berikut (keputusan 19c). */
    readonly bentrok: number;
}

export interface KonteksSinkron {
    readonly k: KonteksValidasi & { readonly horizonAkhir: string };
    readonly libur: ReadonlyMap<string, string>;
}

const tolak = (galat: readonly GalatIsian[]) => new DomainError("VALIDATION_ERROR", galat[0]?.message ?? "Isian blokade tidak sah.", { errors: galat });
const beririsan = (s: SlotTerpakai, k: { readonly mulai: Date; readonly selesai: Date }) => s.mulai < k.selesai && k.mulai < s.selesai;

export class BlockService {
    constructor(
        private readonly db: Kysely<Database>,
        private readonly clock: Clock,
        private readonly kalender: BusinessCalendarService,
        private readonly audit: AuditLogger,
        private readonly pembatalan: CancellationService,
    ) {}

    private async konteks(scope: TransactionScope): Promise<KonteksValidasi & { readonly horizonAkhir: string }> {
        const sekarang = this.clock.now();
        const hariIni = tanggalWib(sekarang);
        const p = await createReservationRepository(scope.tx).pengaturan(scope.ctx);
        const { startMinute, endMinute } = await this.kalender.jamOperasional(scope.tx);
        const { hariKerja } = await this.kalender.kalenderRentang(scope.tx, hariIni, hariIni);
        const { tahunAjaran } = await periodeAkademikAktif(scope, hariIni);
        return {
            sekarang,
            hariIni,
            horizonHari: p.horizonHari,
            horizonAkhir: tambahHari(hariIni, p.horizonHari),
            granularitasMenit: p.granularitasMenit,
            jamOperasional: { mulai: startMinute, selesai: endMinute },
            hariKerja: new Set(hariKerja),
            tahunAjaran: tahunAjaran === null ? null : { mulai: tahunAjaran.mulai, akhir: tahunAjaran.akhir },
        };
    }

    private async libur(scope: TransactionScope, dari: string, sampai: string): Promise<ReadonlyMap<string, string>> {
        if (sampai < dari) return new Map();
        const { libur } = await this.kalender.kalenderRentang(scope.tx, dari, sampai);
        return new Map(libur.map((l) => [l.tanggal, l.nama]));
    }

    /** Validasi + kemunculan + bentrok — bersama bagi pratinjau dan penyimpanan. */
    private async kaji(scope: TransactionScope, roomId: number, isian: IsianBlokade) {
        if ((await ruanganUntukReservasi(scope, roomId, false)) === undefined) throw new NotFoundError("Ruangan tidak ditemukan atau tidak dapat direservasi.");
        const k = await this.konteks(scope);
        let kemunculan: readonly KemunculanBlokade[] = [];
        let dilewati: readonly { tanggal: string; alasan: string }[] = [];
        if (isian.jenis === "JADWAL_TETAP") {
            const aturan: AturanMingguan = { hari: isian.hari, jamMulai: isian.jam_mulai, jamSelesai: isian.jam_selesai, berlakuMulai: isian.berlaku_mulai, berlakuSampai: isian.berlaku_sampai };
            const galat = galatAturanMingguan(aturan, k);
            if (galat.length > 0) throw tolak(galat);
            const hasil = jabarkanAturan(aturan, k.hariIni, k.horizonAkhir, await this.libur(scope, k.hariIni, k.horizonAkhir));
            kemunculan = hasil.kemunculan.filter((x) => x.mulai > k.sekarang);
            dilewati = hasil.dilewati;
        } else {
            const mulai = new Date(isian.mulai);
            const selesai = new Date(isian.selesai);
            const galat = galatBlokadeManual(mulai, selesai, k);
            if (galat.length > 0) throw tolak(galat);
            kemunculan = [{ tanggal: tanggalWib(mulai), hari: 0, mulai, selesai }];
        }
        const terpakai =
            kemunculan.length === 0
                ? []
                : (await daftarSlotTerpakai(scope.tx, "room", [roomId], { mulai: kemunculan[0]!.mulai, selesai: kemunculan.reduce((a, b) => (b.selesai > a ? b.selesai : a), kemunculan[0]!.selesai) })).filter((s) =>
                      kemunculan.some((x) => beririsan(s, x)),
                  );
        const slotReservasi = terpakai.filter((s) => s.reservation_id !== null);
        const lain = terpakai.filter((s) => s.reservation_id === null);
        const blk = createBlockRepository(scope.tx);
        const ringkas = await blk.reservasiRingkas(scope.ctx, slotReservasi.map((s) => s.reservation_id!));
        const label = await blk.label(
            scope.ctx,
            lain.flatMap((s) => (s.fixed_schedule_id === null ? [] : [s.fixed_schedule_id])),
            lain.flatMap((s) => (s.manual_block_id === null ? [] : [s.manual_block_id])),
        );
        const preview: RoomBlockPreview = {
            kemunculan: kemunculan.map((x) => ({ mulai: x.mulai.toISOString(), selesai: x.selesai.toISOString() })),
            dilewati: [...dilewati],
            bentrok_reservasi: ringkas.map((r) => {
                const s = slotReservasi.find((x) => x.reservation_id === r.id)!;
                return { reservation_id: r.id, nomor: r.nomor, status: r.status, pemohon: r.pemohon, nama_kegiatan: r.nama_kegiatan, mulai: s.mulai.toISOString(), selesai: s.selesai.toISOString() };
            }),
            bentrok_lain: lain.map((s) => ({
                asal: s.origin,
                label: (s.fixed_schedule_id !== null ? label.get(`t${s.fixed_schedule_id}`) : s.manual_block_id !== null ? label.get(`m${s.manual_block_id}`) : undefined) ?? null,
                mulai: s.mulai.toISOString(),
                selesai: s.selesai.toISOString(),
            })),
        };
        return { preview, kemunculan, k };
    }

    /** `POST /rooms/{id}/blocks/preview` — tanpa efek (pola keputusan 14f). */
    async pratinjau(ctx: AuthContext, roomId: number, isian: IsianBlokade): Promise<RoomBlockPreview> {
        return withTransaction(ctx, async (scope) => (await this.kaji(scope, roomId, isian)).preview, this.db);
    }

    async buat(ctx: AuthContext, roomId: number, isian: IsianBlokade, batalkan: { readonly alasan: string } | undefined): Promise<RoomBlockCreated> {
        return withTransaction(
            ctx,
            async (scope) => {
                const { preview, kemunculan, k } = await this.kaji(scope, roomId, isian);
                if (preview.bentrok_lain.length > 0) {
                    throw new DomainError("RESERVATION_CONFLICT", "Blokade beririsan dengan blokade atau pemeliharaan lain; sesuaikan rentangnya.", {
                        errors: preview.bentrok_lain.map((b) => ({ field: "bentrok_lain", message: `${b.label ?? b.asal}: ${b.mulai}–${b.selesai}` })),
                    });
                }
                const dibatalkan: { id: string; nomor: string }[] = [];
                if (preview.bentrok_reservasi.length > 0) {
                    // FR-07.5 A1: tak pernah membatalkan tanpa keputusan eksplisit penggunanya.
                    if (batalkan === undefined) {
                        throw new DomainError("RESERVATION_CONFLICT", "Blokade beririsan dengan reservasi yang sudah diajukan. Batalkan reservasi tersebut atau sesuaikan blokade.", {
                            errors: preview.bentrok_reservasi.map((r) => ({ field: "bentrok_reservasi", message: `${r.nomor} — ${r.nama_kegiatan ?? "tanpa nama"} (${r.pemohon})` })),
                        });
                    }
                    // Pemeriksaan pembatalan (status, sudah dimulai, cancel_any bagi milik pihak lain) dan NT-08 milik CancellationService.
                    for (const r of preview.bentrok_reservasi) {
                        const h = await this.pembatalan.batalkanDalam(scope, Number(r.reservation_id), batalkan.alasan);
                        dibatalkan.push(...h.dibatalkan);
                    }
                }
                const blk = createBlockRepository(scope.tx);
                const slot = new SlotService(this.clock);
                const ids: string[] = [];
                let slotDibuat = 0;
                if (isian.jenis === "JADWAL_TETAP") {
                    for (const hari of [...isian.hari].sort((a, b) => a - b)) {
                        const id = await blk.buatAturan(scope.ctx, { roomId, hari, jamMulai: isian.jam_mulai, jamSelesai: isian.jam_selesai, berlakuMulai: isian.berlaku_mulai, berlakuSampai: isian.berlaku_sampai, label: isian.label_kegiatan });
                        ids.push(id);
                        const dibuat = await slot.reserveRuanganBerulang(scope, { roomId, rentang: kemunculan.filter((y) => y.hari === hari), asal: "fixed_schedule", rujukan: { fixedScheduleId: Number(id) } });
                        slotDibuat += dibuat.length;
                        await this.audit.write(scope, {
                            modul: MODUL,
                            aksi: "ROOM_BLOCK_CREATED",
                            entitas: "room_fixed_schedules",
                            entitasId: id,
                            nilaiSesudah: { room_id: roomId, hari, jam_mulai: isian.jam_mulai, jam_selesai: isian.jam_selesai, berlaku_mulai: isian.berlaku_mulai, berlaku_sampai: isian.berlaku_sampai, label_kegiatan: isian.label_kegiatan, horizon_sampai: k.horizonAkhir, reservasi_dibatalkan: dibatalkan.map((d) => d.id) },
                        });
                    }
                } else {
                    const mulai = new Date(isian.mulai);
                    const selesai = new Date(isian.selesai);
                    const id = await blk.buatBlokadeManual(scope.ctx, { roomId, mulai, selesai, label: isian.label_kegiatan });
                    ids.push(id);
                    await slot.reserve(scope, { status: "CONFIRMED", sumberDaya: [{ jenis: "room", id: roomId }], rentang: { mulai, selesai }, asal: "manual_block", rujukan: { manualBlockId: Number(id) } });
                    slotDibuat = 1;
                    await this.audit.write(scope, {
                        modul: MODUL,
                        aksi: "ROOM_BLOCK_CREATED",
                        entitas: "room_manual_blocks",
                        entitasId: id,
                        nilaiSesudah: { room_id: roomId, mulai: isian.mulai, selesai: isian.selesai, label_kegiatan: isian.label_kegiatan, reservasi_dibatalkan: dibatalkan.map((d) => d.id) },
                    });
                }
                return { jenis: isian.jenis, ids, slot_dibuat: slotDibuat, reservasi_dibatalkan: dibatalkan };
            },
            this.db,
        );
    }

    async daftar(ctx: AuthContext, roomId: number): Promise<RoomBlockList> {
        return withTransaction(
            ctx,
            async (scope) => {
                const { aturan, manual } = await createBlockRepository(scope.tx).daftarRuangan(scope.ctx, roomId);
                return {
                    jadwal_tetap: aturan.map((a) => ({ id: a.id, hari: a.hari, jam_mulai: a.jam_mulai, jam_selesai: a.jam_selesai, berlaku_mulai: a.berlaku_mulai, berlaku_sampai: a.berlaku_sampai, label_kegiatan: a.label_kegiatan, status: a.status })),
                    blokade_manual: manual.map((m) => ({ id: m.id, mulai: m.mulai.toISOString(), selesai: m.selesai.toISOString(), label_kegiatan: m.label_kegiatan, status: m.status })),
                };
            },
            this.db,
        );
    }

    /** FR-07.5 A3: slot yang BELUM dimulai dilepas; yang lewat/berjalan tetap sebagai arsip utilisasi. */
    async nonaktifkan(ctx: AuthContext, jenis: "JADWAL_TETAP" | "BLOKADE_MANUAL", id: number): Promise<{ readonly id: string; readonly status: "NONAKTIF"; readonly slot_dilepas: number }> {
        return withTransaction(
            ctx,
            async (scope) => {
                const blk = createBlockRepository(scope.tx);
                const baris = jenis === "JADWAL_TETAP" ? await blk.kunciAturan(scope.ctx, id) : await blk.kunciBlokadeManual(scope.ctx, id);
                if (baris === undefined) throw new NotFoundError("Blokade tidak ditemukan.");
                if (baris.status !== "AKTIF") throw new DomainError("VALIDATION_ERROR", "Blokade sudah nonaktif.", { errors: [{ field: "status", message: "Blokade sudah nonaktif." }] });
                const sekarang = this.clock.now();
                const milik = await slotMilikBlokade(scope.tx, jenis === "JADWAL_TETAP" ? { fixedScheduleIds: [id] } : { manualBlockIds: [id] }, sekarang);
                const lepas = milik.filter((s) => s.mulai > sekarang).map((s) => Number(s.id));
                await new SlotService(this.clock).release(scope, lepas);
                await blk.nonaktifkan(scope.ctx, jenis === "JADWAL_TETAP" ? "room_fixed_schedules" : "room_manual_blocks", id);
                await this.audit.write(scope, {
                    modul: MODUL,
                    aksi: "ROOM_BLOCK_DEACTIVATED",
                    entitas: jenis === "JADWAL_TETAP" ? "room_fixed_schedules" : "room_manual_blocks",
                    entitasId: id,
                    nilaiSebelum: { status: "AKTIF" },
                    nilaiSesudah: { status: "NONAKTIF", slot_dilepas: lepas.length },
                });
                return { id: String(id), status: "NONAKTIF" as const, slot_dilepas: lepas.length };
            },
            this.db,
        );
    }

    /**
     * Satu aturan, di transaksi pemanggil (job): kemunculan mendatang yang belum ber-slot dibuat bila
     * tak beririsan apa pun (yang beririsan dilewati & dicoba lagi putaran berikut — tak pernah
     * membatalkan), dan slot mendatang yang kini jatuh pada hari libur dilepas (A4). Idempoten (JOB-03).
     */
    async sinkronAturan(scope: TransactionScope, id: number, bersama?: KonteksSinkron): Promise<HasilSinkronAturan> {
        const a: AturanTersimpan | undefined = await createBlockRepository(scope.tx).kunciAturan(scope.ctx, id);
        if (a === undefined || a.status !== "AKTIF") return { dibuat: 0, dilepas: 0, bentrok: 0 };
        const { k, libur } = bersama ?? (await this.siapkanSinkron(scope));
        const roomId = Number(a.room_id);
        const { kemunculan } = jabarkanAturan({ hari: [a.hari], jamMulai: a.jam_mulai, jamSelesai: a.jam_selesai, berlakuMulai: a.berlaku_mulai, berlakuSampai: a.berlaku_sampai }, k.hariIni, k.horizonAkhir, libur);
        const ada = await slotMilikBlokade(scope.tx, { fixedScheduleIds: [id] }, k.sekarang);
        const slot = new SlotService(this.clock);

        const keLibur = ada.filter((s) => s.mulai > k.sekarang && libur.has(tanggalWib(s.mulai))).map((s) => Number(s.id));
        await slot.release(scope, keLibur);

        const sudah = new Set(ada.map((s) => s.mulai.getTime()));
        const baru = kemunculan.filter((x) => x.mulai > k.sekarang && !sudah.has(x.mulai.getTime()));
        let dibuat = 0;
        let bentrok = 0;
        if (baru.length > 0) {
            const terpakai = await daftarSlotTerpakai(scope.tx, "room", [roomId], { mulai: baru[0]!.mulai, selesai: baru[baru.length - 1]!.selesai });
            const bebas = baru.filter((x) => !terpakai.some((s) => beririsan(s, x)));
            bentrok = baru.length - bebas.length;
            dibuat = (await slot.reserveRuanganBerulang(scope, { roomId, rentang: bebas, asal: "fixed_schedule", rujukan: { fixedScheduleId: id } })).length;
        }
        if (dibuat + keLibur.length + bentrok > 0) {
            await this.audit.write(scope, {
                modul: MODUL,
                aksi: "ROOM_BLOCK_SYNCED",
                entitas: "room_fixed_schedules",
                entitasId: id,
                keterangan: "Materialisasi horizon jadwal tetap (FR-07.5 langkah 4, A4)",
                nilaiSesudah: { slot_dibuat: dibuat, slot_dilepas_libur: keLibur.length, kemunculan_bentrok: bentrok, horizon_sampai: k.horizonAkhir },
            });
        }
        return { dibuat, dilepas: keLibur.length, bentrok };
    }

    /** Konteks bersama satu putaran job — dihitung sekali, bukan per aturan (FR-07.5 AC ≤ 10 detik). */
    async siapkanSinkron(scope: TransactionScope): Promise<KonteksSinkron> {
        const k = await this.konteks(scope);
        return { k, libur: await this.libur(scope, k.hariIni, k.horizonAkhir) };
    }

    /** Id aturan aktif bagi job (berpelaku SYSTEM). */
    async idAturanAktif(scope: TransactionScope): Promise<readonly number[]> {
        return createBlockRepository(scope.tx).idAturanAktif(scope.ctx, tanggalWib(this.clock.now()));
    }
}
