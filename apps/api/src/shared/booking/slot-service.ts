// SlotService — SATU-SATUNYA penulis `booking_slots` (SDD-SYS-10, SDD-AVL-04).
// Enam modul (M-04, M-07, M-08, M-09, M-12, M-21) memesan dan melepas slot lewat
// antarmuka ini, tidak pernah menyentuh tabelnya langsung.
//
// Setiap metode berjalan di TransactionScope PEMANGGIL: slot dan dokumen bisnisnya
// (reservasi, peminjaman, work order) commit atau batal bersama (SDD-01 §4.2
// langkah 6-7, CI-03). Activity log dicatat pemanggil atas aksi bisnisnya dalam
// transaksi yang sama — slot adalah detail teknis operasi itu (keputusan 64).
//
// Yang BUKAN urusan layanan ini: aturan reservasi (blokir peminjam BR-030, kuota
// BR-023a, horizon BR-023c) milik M-07/M-08; kelayakan aset untuk `reserve()`
// milik pemanggil — blokade pemeliharaan (`maintenance`) justru menyasar aset rusak.

import { sql } from "kysely";
import type { Clock } from "../clock/index.js";
import type { QueryExecutor, TransactionScope } from "../db/index.js";
import { pelakuId } from "../auth/index.js";
import { DomainError } from "../errors/index.js";
import { publishAll } from "../events/index.js";

export type JenisSumberDaya = "room" | "asset";
export type AsalSlot = "reservation" | "loan" | "maintenance" | "fixed_schedule" | "manual_block";
export type StatusSlot = "TENTATIVE" | "CONFIRMED" | "ACTIVE" | "RELEASED";

export interface SumberDaya {
    readonly jenis: JenisSumberDaya;
    readonly id: number;
}

/** Rentang `[mulai, selesai)` — half-open, SELALU (SDD-AVL-02). */
export interface RentangWaktu {
    readonly mulai: Date;
    readonly selesai: Date;
}

export interface RujukanSlot {
    readonly reservationId?: number;
    readonly loanId?: number;
    readonly workOrderId?: number;
    /** Blokade ruangan FR-07.5 (0047, PR-03-13). */
    readonly fixedScheduleId?: number;
    readonly manualBlockId?: number;
}

/** `TENTATIVE` wajib ber-TTL (BR-023b, CHECK `tentative_needs_ttl`) — ditegakkan tipe. */
export type StatusAwal =
    | { readonly status: "TENTATIVE"; readonly kedaluwarsa: Date }
    | { readonly status: "CONFIRMED" };

export type PesanSlot = StatusAwal & {
    readonly sumberDaya: readonly SumberDaya[];
    readonly rentang: RentangWaktu;
    readonly asal: AsalSlot;
    readonly rujukan?: RujukanSlot;
};

export interface AlokasiUnit {
    readonly categoryId: number;
    readonly jumlah: number;
    readonly rentang: RentangWaktu;
    readonly kedaluwarsa: Date;
    readonly asal: "reservation" | "loan";
    /** Pemohon Siswa/OSIS: hanya unit `boleh_dipinjam_siswa` (BR-073, SDD-01 §4.2). */
    readonly untukSiswa: boolean;
    readonly rujukan?: RujukanSlot;
}

export interface SlotRow {
    readonly id: string;
    readonly resource_type: JenisSumberDaya;
    readonly resource_id: string;
    readonly slot_range: string | null;
    readonly status: StatusSlot;
    readonly origin: AsalSlot;
    readonly expires_at: Date | null;
}

const KOLOM_SLOT = ["id", "resource_type", "resource_id", "slot_range", "status", "origin", "expires_at"] as const;

/**
 * BR-005b: predikat "aset ini memiliki slot `CONFIRMED` yang mencakup `waktu`" (`[)`, SDD-AVL-02)
 * bagi `UPDATE assets` milik M-04 (job `slot-activation`) — modul tidak menyusun kueri
 * `booking_slots` sendiri. `kolomAsetId` = kolom id aset pada kueri pemanggil.
 */
export const adaSlotAsetTerkonfirmasi = (kolomAsetId: string, waktu: Date) => sql<boolean>`EXISTS (
    SELECT 1 FROM booking_slots s
     WHERE s.resource_type = 'asset' AND s.resource_id = ${sql.ref(kolomAsetId)}
       AND s.status = 'CONFIRMED' AND s.slot_range @> ${waktu}::timestamptz)`;

/** Slot yang memegang ketersediaan (`TENTATIVE`/`CONFIRMED`/`ACTIVE`) — bahan kalender (FR-07.1, AV-01). */
export interface SlotTerpakai {
    readonly id: string;
    readonly resource_id: string;
    readonly mulai: Date;
    readonly selesai: Date;
    readonly status: Exclude<StatusSlot, "RELEASED">;
    readonly origin: AsalSlot;
    readonly reservation_id: string | null;
    /** Sumber blokade (PR-03-13) — label kalender FR-07.1 A4. */
    readonly fixed_schedule_id: string | null;
    readonly manual_block_id: string | null;
}

/**
 * Pembacaan slot aktif yang beririsan `rentang` atas sumber daya `ids` — satu-satunya jalur baca
 * `booking_slots` bagi modul (SDD-SYS-10). Memakai indeks GiST `booking_slots_lookup` (AV-01).
 * Baris induk berulang (tanpa rentang, SDD-AVL-12) tidak pernah ikut.
 */
export async function daftarSlotTerpakai(
    executor: QueryExecutor,
    jenis: JenisSumberDaya,
    ids: readonly number[],
    rentang: RentangWaktu,
): Promise<readonly SlotTerpakai[]> {
    if (ids.length === 0) return [];
    const hasil = await sql<SlotTerpakai>`
        SELECT id::text AS id, resource_id::text AS resource_id, lower(slot_range) AS mulai, upper(slot_range) AS selesai,
               status, origin, reservation_id::text AS reservation_id,
               fixed_schedule_id::text AS fixed_schedule_id, manual_block_id::text AS manual_block_id
          FROM booking_slots
         WHERE resource_type = ${jenis}::booking_resource AND resource_id = ANY(${ids.map(String)}::bigint[])
           AND status IN ('TENTATIVE', 'CONFIRMED', 'ACTIVE')
           AND slot_range && tstzrange(${rentang.mulai}, ${rentang.selesai}, '[)')
         ORDER BY resource_id, lower(slot_range), id
    `.execute(executor);
    return hasil.rows;
}

/** Slot milik sebuah blokade ruangan (PR-03-13) — bahan materialisasi idempoten & pelepasan (FR-07.5 A3/A4). */
export interface SlotBlokade {
    readonly id: string;
    readonly fixed_schedule_id: string | null;
    readonly manual_block_id: string | null;
    readonly mulai: Date;
    readonly selesai: Date;
    readonly status: StatusSlot;
}

/** Slot belum dilepas milik blokade `sumber` yang berakhir setelah `sejak` (lewat shared/booking, SDD-SYS-10). */
export async function slotMilikBlokade(
    executor: QueryExecutor,
    sumber: { readonly fixedScheduleIds?: readonly number[]; readonly manualBlockIds?: readonly number[] },
    sejak: Date,
): Promise<readonly SlotBlokade[]> {
    const tetap = (sumber.fixedScheduleIds ?? []).map(String);
    const manual = (sumber.manualBlockIds ?? []).map(String);
    if (tetap.length === 0 && manual.length === 0) return [];
    const hasil = await sql<SlotBlokade>`
        SELECT id::text AS id, fixed_schedule_id::text AS fixed_schedule_id, manual_block_id::text AS manual_block_id,
               lower(slot_range) AS mulai, upper(slot_range) AS selesai, status
          FROM booking_slots
         WHERE (fixed_schedule_id = ANY(${tetap}::bigint[]) OR manual_block_id = ANY(${manual}::bigint[]))
           AND status <> 'RELEASED' AND upper(slot_range) > ${sejak}
         ORDER BY lower(slot_range), id
    `.execute(executor);
    return hasil.rows;
}

/** Slot sebuah reservasi beserta statusnya — bahan transisi milik modul pengaju (SDD-APR-17). */
export interface SlotReservasi {
    readonly id: string;
    readonly reservation_id: string;
    readonly status: StatusSlot;
}

/**
 * Slot milik reservasi-reservasi ini, seluruh status (`PR-03-10`). Pembacaan lewat shared/booking
 * agar modul tak menyentuh `booking_slots` (SDD-SYS-10); transisinya tetap lewat `SlotService`.
 */
export async function slotMilikReservasi(executor: QueryExecutor, reservationIds: readonly number[]): Promise<readonly SlotReservasi[]> {
    if (reservationIds.length === 0) return [];
    const hasil = await sql<SlotReservasi>`
        SELECT id::text AS id, reservation_id::text AS reservation_id, status
          FROM booking_slots
         WHERE reservation_id = ANY(${reservationIds.map(String)}::bigint[])
         ORDER BY reservation_id, id
    `.execute(executor);
    return hasil.rows;
}

/** `BR-023b`: pengajuan pemilik slot → Kedaluwarsa; dikonsumsi M-07 (`PR-03-10`) dan M-08 (`PR-04-02`). */
export const EVENT_SLOT_TENTATIF_KEDALUWARSA = "TentativeSlotExpired";

/** Batas baris per transaksi job `tentative-slot-expiry` — job mengulang sampai habis. */
export const BATCH_KEDALUWARSA = 500;

/** SQLSTATE `lock_not_available` — kegagalan `FOR UPDATE NOWAIT`. */
const LOCK_NOT_AVAILABLE = "55P03";

export class SlotService {
    constructor(private readonly clock: Clock) {}

    /**
     * Memesan slot atas sumber daya EKSPLISIT (ruangan, unit aset pilihan Petugas,
     * blokade pemeliharaan). Baris aset dikunci terurut `id` menaik (CI-02,
     * SDD-AVL-06) dengan `NOWAIT` — pilihan manual gagal CEPAT, bukan antre
     * (SDD-AVL-05). Baris ruangan lalu dikunci terurut `id` menaik dengan MENUNGGU
     * (SDD-AVL-06, keputusan 68): tanpa kunci, sisipan serentak yang beririsan saling
     * menunggu di exclusion constraint dan sebagian berakhir `40P01` (deadlock → 500),
     * bukan konflik. Dengan kunci, yang kalah selalu `23P01`. Irisan diputus exclusion
     * constraint (CI-01): `23P01` diteruskan ke ErrorMapper, yang memetakannya per nama
     * constraint (CI-04).
     */
    async reserve(scope: TransactionScope, pesan: PesanSlot): Promise<readonly SlotRow[]> {
        this.periksaRentang(pesan.rentang);
        if (pesan.sumberDaya.length === 0) return [];

        const asetIds = [...new Set(pesan.sumberDaya.filter((s) => s.jenis === "asset").map((s) => s.id))].sort(
            (a, b) => a - b,
        );
        const ruanganIds = [...new Set(pesan.sumberDaya.filter((s) => s.jenis === "room").map((s) => s.id))].sort(
            (a, b) => a - b,
        );

        if (asetIds.length > 0) {
            const terkunci = await this.kunciAsetNowait(scope, asetIds);
            if (terkunci.length !== asetIds.length) {
                throw new DomainError("VALIDATION_ERROR", "Aset yang dipesan tidak ditemukan.", { field: "sumber_daya" });
            }
        }
        if (ruanganIds.length > 0) {
            // Setelah aset: urutan kunci seragam di semua jalur, jadi tidak ada siklus (SDD-AVL-06).
            const ada = await scope.tx
                .selectFrom("rooms")
                .select("id")
                .where("id", "in", ruanganIds.map(String))
                .orderBy("id")
                .forUpdate()
                .execute();
            if (ada.length !== ruanganIds.length) {
                throw new DomainError("VALIDATION_ERROR", "Ruangan yang dipesan tidak ditemukan.", { field: "sumber_daya" });
            }
        }

        // Urutan sisip mengikuti urutan kunci (aset menaik, lalu ruangan) — deterministik.
        const urut: SumberDaya[] = [
            ...asetIds.map((id) => ({ jenis: "asset" as const, id })),
            ...ruanganIds.map((id) => ({ jenis: "room" as const, id })),
        ];
        return this.sisipkan(scope, urut, pesan.rentang, pesan.asal, pesan, pesan.rujukan);
    }

    /**
     * Blokade ruangan berulang (FR-07.5, PR-03-13): BANYAK rentang `CONFIRMED` atas SATU ruangan dalam
     * satu pernyataan — baris ruangan dikunci sekali (urutan kunci sama dengan `reserve`, SDD-AVL-06),
     * irisan tetap diputus exclusion constraint (CI-01). Regenerasi horizon 90 hari × 30 ruangan
     * memakai jalur ini agar memenuhi ≤ 10 detik (FR-07.5 AC).
     */
    async reserveRuanganBerulang(
        scope: TransactionScope,
        p: { readonly roomId: number; readonly rentang: readonly RentangWaktu[]; readonly asal: "fixed_schedule"; readonly rujukan: RujukanSlot },
    ): Promise<readonly SlotRow[]> {
        if (p.rentang.length === 0) return [];
        p.rentang.forEach((r) => this.periksaRentang(r));
        const ada = await scope.tx.selectFrom("rooms").select("id").where("id", "=", String(p.roomId)).forUpdate().execute();
        if (ada.length !== 1) throw new DomainError("VALIDATION_ERROR", "Ruangan yang dipesan tidak ditemukan.", { field: "sumber_daya" });
        return scope.tx
            .insertInto("booking_slots")
            .values(
                p.rentang.map((r) => ({
                    resource_type: "room" as const,
                    resource_id: p.roomId,
                    slot_range: this.rentangSql(r),
                    status: "CONFIRMED" as const,
                    origin: p.asal,
                    expires_at: null,
                    fixed_schedule_id: p.rujukan.fixedScheduleId ?? null,
                    created_by: pelakuId(scope.ctx),
                })),
            )
            .returning(KOLOM_SLOT)
            .execute();
    }

    /**
     * Alokasi unit OTOMATIS per kategori (FR-08.2; SDD-01 §4.2 langkah 4-6):
     * kandidat disaring kelayakan + ketiadaan slot aktif beririsan, dikunci
     * `ORDER BY id … FOR UPDATE SKIP LOCKED` (CI-02, SDD-AVL-05) sehingga
     * permintaan serentak mengambil unit bebas berikutnya alih-alih antre. Kurang
     * unit → `409 ASSET_NOT_AVAILABLE`. Pemeriksaan `NOT EXISTS` hanya penyaring;
     * penjamin kebenaran tetap exclusion constraint saat sisip.
     */
    async allocate(scope: TransactionScope, alokasi: AlokasiUnit): Promise<readonly SlotRow[]> {
        this.periksaRentang(alokasi.rentang);
        if (!Number.isInteger(alokasi.jumlah) || alokasi.jumlah < 1) {
            throw new DomainError("VALIDATION_ERROR", "Jumlah unit wajib bilangan bulat positif.", { field: "jumlah" });
        }

        const hasil = await sql<{ id: string }>`
            SELECT a.id::text AS id FROM assets a
             WHERE a.category_id = ${alokasi.categoryId}
               AND a.dapat_dipinjam AND NOT a.dihapuskan
               AND a.kondisi IN ('BAIK', 'RUSAK_RINGAN')
               AND a.status NOT IN ('DALAM_PERBAIKAN', 'TIDAK_TERSEDIA')
               AND (${!alokasi.untukSiswa} OR a.boleh_dipinjam_siswa)
               AND NOT EXISTS (
                     SELECT 1 FROM booking_slots s
                      WHERE s.resource_type = 'asset' AND s.resource_id = a.id
                        AND s.status IN ('TENTATIVE', 'CONFIRMED', 'ACTIVE')
                        AND s.slot_range && ${this.rentangSql(alokasi.rentang)})
             ORDER BY a.id
             LIMIT ${alokasi.jumlah}
             FOR UPDATE OF a SKIP LOCKED
        `.execute(scope.tx);

        if (hasil.rows.length < alokasi.jumlah) {
            throw new DomainError(
                "ASSET_NOT_AVAILABLE",
                `Hanya ${hasil.rows.length} dari ${alokasi.jumlah} unit tersedia pada rentang itu.`,
                { field: "jumlah" },
            );
        }

        return this.sisipkan(
            scope,
            hasil.rows.map((r) => ({ jenis: "asset" as const, id: Number(r.id) })),
            alokasi.rentang,
            alokasi.asal,
            { status: "TENTATIVE", kedaluwarsa: alokasi.kedaluwarsa },
            alokasi.rujukan,
        );
    }

    /** Persetujuan level terakhir: `TENTATIVE` → `CONFIRMED`, TTL dihapus (SDD-01 §4.3). */
    async confirm(scope: TransactionScope, slotIds: readonly number[]): Promise<readonly SlotRow[]> {
        return this.transisi(scope, slotIds, "TENTATIVE", "CONFIRMED");
    }

    /**
     * Job `tentative-slot-expiry` (BR-023b, SDD-01 §4.6): slot `TENTATIVE` yang melewati
     * `expires_at` → `RELEASED`, paling banyak `batas` baris. Berpenjaga status asal —
     * slot yang lebih dulu dikonfirmasi pada detik yang sama tidak ikut dilepas (`SKIP LOCKED`
     * melewati baris yang sedang dipegang transaksi lain). `TentativeSlotExpired` terbit per
     * slot di transaksi YANG SAMA (SDD-EVT-04): pengajuannya dikedaluwarsakan pemiliknya.
     */
    async lepasTentatifKedaluwarsa(scope: TransactionScope, batas = BATCH_KEDALUWARSA): Promise<readonly SlotRow[]> {
        const sekarang = this.clock.now();
        const dilepas = await sql<SlotRow & { reservation_id: string | null; loan_id: string | null }>`
            WITH dipilih AS MATERIALIZED (
                SELECT id FROM booking_slots
                 WHERE status = 'TENTATIVE' AND expires_at <= ${sekarang}
                 ORDER BY expires_at, id LIMIT ${batas}
                 FOR UPDATE SKIP LOCKED)
            -- CTE, bukan \`id IN (SELECT … LIMIT …)\`: subkueri IN dapat dieksekusi ulang
            -- sebagai join sehingga LIMIT tidak membatasi baris yang diubah (terbukti di uji).
            UPDATE booking_slots b SET status = 'RELEASED', expires_at = NULL
              FROM dipilih
             WHERE b.id = dipilih.id AND b.status = 'TENTATIVE'
            RETURNING b.id::text AS id, b.resource_type, b.resource_id::text AS resource_id, b.slot_range::text AS slot_range,
                      b.status, b.origin, b.expires_at, b.reservation_id::text AS reservation_id, b.loan_id::text AS loan_id
        `.execute(scope.tx);
        await publishAll(
            scope,
            dilepas.rows.map((b) => ({
                name: EVENT_SLOT_TENTATIF_KEDALUWARSA,
                aggregateType: "booking_slot",
                aggregateId: b.id,
                payload: { slot_id: b.id, origin: b.origin, resource_type: b.resource_type, resource_id: b.resource_id, reservation_id: b.reservation_id, loan_id: b.loan_id },
            })),
        );
        return dilepas.rows;
    }

    /** Serah terima: `CONFIRMED` → `ACTIVE` (SDD-01 §4.3). */
    async activate(scope: TransactionScope, slotIds: readonly number[]): Promise<readonly SlotRow[]> {
        return this.transisi(scope, slotIds, "CONFIRMED", "ACTIVE");
    }

    /**
     * `*` → `RELEASED` (pengembalian, penolakan, pembatalan, TTL habis, aset masuk
     * perbaikan — SDD-01 §4.3). Idempoten: slot yang sudah `RELEASED` dilewati.
     * Baris dipertahankan untuk analitik (TBD-AVL-A), bukan dihapus.
     */
    async release(scope: TransactionScope, slotIds: readonly number[]): Promise<readonly SlotRow[]> {
        if (slotIds.length === 0) return [];
        return scope.tx
            .updateTable("booking_slots")
            .set({ status: "RELEASED", expires_at: null })
            .where("id", "in", slotIds.map(String))
            .where("status", "<>", "RELEASED")
            .returning(KOLOM_SLOT)
            .execute();
    }

    /**
     * Transisi berpenjaga status asal: `UPDATE … WHERE status = asal` mengunci
     * barisnya, sehingga dua transisi serentak atas slot yang sama tak dapat
     * sama-sama berhasil. Slot yang tak lagi berstatus asal (mis. TTL-nya telah
     * dilepas job) menggagalkan seluruh transisi — pemanggil tak boleh diam-diam
     * mengonfirmasi sebagian.
     */
    private async transisi(
        scope: TransactionScope,
        slotIds: readonly number[],
        asal: StatusSlot,
        tujuan: "CONFIRMED" | "ACTIVE",
    ): Promise<readonly SlotRow[]> {
        const unik = [...new Set(slotIds)];
        if (unik.length === 0) return [];
        const hasil = await scope.tx
            .updateTable("booking_slots")
            .set({ status: tujuan, ...(tujuan === "CONFIRMED" ? { expires_at: null } : {}) })
            .where("id", "in", unik.map(String))
            .where("status", "=", asal)
            .returning(KOLOM_SLOT)
            .execute();
        if (hasil.length !== unik.length) {
            throw new DomainError(
                "RESERVATION_CONFLICT",
                `Sebagian slot tidak lagi berstatus ${asal}; transisi ke ${tujuan} dibatalkan.`,
            );
        }
        return hasil;
    }

    /** `FOR UPDATE NOWAIT`; `55P03` diterjemahkan DI SINI — hanya layanan ini tahu kuncinya milik aset (keputusan 64). */
    private async kunciAsetNowait(scope: TransactionScope, asetIds: readonly number[]): Promise<readonly { id: string }[]> {
        try {
            return await scope.tx
                .selectFrom("assets")
                .select("id")
                .where("id", "in", asetIds.map(String))
                .orderBy("id")
                .forUpdate()
                .noWait()
                .execute();
        } catch (e) {
            if ((e as { code?: unknown }).code === LOCK_NOT_AVAILABLE) {
                throw new DomainError("ASSET_NOT_AVAILABLE", "Aset sedang dipesan permintaan lain. Coba lagi.");
            }
            throw e;
        }
    }

    private async sisipkan(
        scope: TransactionScope,
        sumberDaya: readonly SumberDaya[],
        rentang: RentangWaktu,
        asal: AsalSlot,
        awal: StatusAwal,
        rujukan: RujukanSlot | undefined,
    ): Promise<readonly SlotRow[]> {
        if (awal.status === "TENTATIVE" && awal.kedaluwarsa <= this.clock.now()) {
            throw new DomainError("VALIDATION_ERROR", "Batas waktu slot sementara sudah lewat.", { field: "kedaluwarsa" });
        }
        return scope.tx
            .insertInto("booking_slots")
            .values(
                sumberDaya.map((s) => ({
                    resource_type: s.jenis,
                    resource_id: s.id,
                    slot_range: this.rentangSql(rentang),
                    status: awal.status,
                    origin: asal,
                    expires_at: awal.status === "TENTATIVE" ? awal.kedaluwarsa : null,
                    reservation_id: rujukan?.reservationId ?? null,
                    loan_id: rujukan?.loanId ?? null,
                    work_order_id: rujukan?.workOrderId ?? null,
                    fixed_schedule_id: rujukan?.fixedScheduleId ?? null,
                    manual_block_id: rujukan?.manualBlockId ?? null,
                    // SYSTEM (job materialisasi, AL-06) → NULL, bukan id 0 yang melanggar FK users.
                    created_by: pelakuId(scope.ctx),
                })),
            )
            .returning(KOLOM_SLOT)
            .execute();
    }

    /** SDD-AVL-02: literal SELALU `'[)'` — tak pernah dirakit sebagai teks. */
    private rentangSql(r: RentangWaktu) {
        return sql<string>`tstzrange(${r.mulai}, ${r.selesai}, '[)')`;
    }

    /** Rentang kosong/terbalik bukan slot: `tstzrange` terbalik adalah galat 22000 (500). */
    private periksaRentang(r: RentangWaktu): void {
        if (!(r.mulai < r.selesai)) {
            throw new DomainError("VALIDATION_ERROR", "Waktu mulai harus sebelum waktu selesai.", { field: "rentang" });
        }
    }
}
