// Kalender ketersediaan ruangan — `GET /rooms/availability` (FR-07.1, AV-01…AV-05, CAL-UI-05/06/09;
// PR-03-09, keputusan 12 log phase-03). Hanya membaca: tanpa entri log (AL-01 untuk operasi tulis)
// dan tanpa cache (AV-04 — nilai operasional TBD-AVL-D belum ditetapkan, 0 = tanpa cache).

import type { RoomAvailability, SlotKetersediaan } from "@sigm4/schemas";
import type { Kysely } from "kysely";
import type { AuthContext } from "../../../shared/auth/index.js";
import { daftarSlotTerpakai } from "../../../shared/booking/index.js";
import type { SlotTerpakai } from "../../../shared/booking/index.js";
import type { BusinessCalendarService } from "../../../shared/calendar/index.js";
import type { Database } from "../../../shared/db/index.js";
import { createAvailabilityRepository } from "../repositories/availability.repository.js";
import { createBlockRepository } from "../repositories/block.repository.js";
import type { FilterRuangan, ReservasiRingkasRow } from "../repositories/availability.repository.js";

/** CAL-03 / CAL-UI-09: batas hari WIB (UTC+7, tanpa DST). */
const WIB_MS = 7 * 3_600_000;
const tanggalWib = (t: Date) => new Date(t.getTime() + WIB_MS).toISOString().slice(0, 10);
const jam = (menit: number) => `${String(Math.floor(menit / 60)).padStart(2, "0")}:${String(menit % 60).padStart(2, "0")}`;

export interface PermintaanKetersediaan extends FilterRuangan {
    readonly dari: Date;
    readonly sampai: Date;
}

/** CAL-UI-05: origin + status slot → keadaan tampilan. `loan` tak pernah menyasar ruangan. */
function keadaan(s: SlotTerpakai): SlotKetersediaan["keadaan"] {
    if (s.origin === "fixed_schedule") return "JADWAL_TETAP";
    if (s.origin === "maintenance" || s.origin === "manual_block") return "PEMELIHARAAN";
    return s.status === "TENTATIVE" ? "MENUNGGU_PERSETUJUAN" : "DISETUJUI";
}

export class AvailabilityService {
    constructor(
        private readonly db: Kysely<Database>,
        private readonly kalender: BusinessCalendarService,
    ) {}

    async ketersediaan(ctx: AuthContext, p: PermintaanKetersediaan): Promise<RoomAvailability> {
        const repo = createAvailabilityRepository(this.db);
        const ruangan = await repo.daftarRuangan(ctx, p);
        const slot = await daftarSlotTerpakai(this.db, "room", ruangan.map((r) => Number(r.id)), { mulai: p.dari, selesai: p.sampai });
        // FR-07.1 A1 / CAL-UI-06: Siswa/OSIS hanya melihat "Terpakai" — rincian pihak lain tidak pernah dibaca;
        // miliknya sendiri tetap berincian agar tertaut ke Detail Reservasi P-31 (keputusan 17b).
        const terbatas = ctx.scopeOf("reservation.view") === "restricted";
        const ids = slot.flatMap((s) => (s.reservation_id === null ? [] : [s.reservation_id]));
        const rincian = new Map<string, ReservasiRingkasRow>((await repo.ringkasReservasi(ctx, ids, terbatas ? ctx.userId : undefined)).map((r) => [r.id, r]));
        // FR-07.1 A4 (PR-03-13): label kegiatan blokade jadwal tetap/manual — bukan data pribadi, tampil bagi semua.
        const labelBlokade = await createBlockRepository(this.db).label(
            ctx,
            slot.flatMap((s) => (s.fixed_schedule_id === null ? [] : [s.fixed_schedule_id])),
            slot.flatMap((s) => (s.manual_block_id === null ? [] : [s.manual_block_id])),
        );
        const { hariKerja, libur } = await this.kalender.kalenderRentang(this.db, tanggalWib(p.dari), tanggalWib(new Date(p.sampai.getTime() - 1)));
        const { startMinute, endMinute } = await this.kalender.jamOperasional(this.db);

        return {
            dari: p.dari.toISOString(),
            sampai: p.sampai.toISOString(),
            zona_waktu: "Asia/Jakarta",
            granularitas_menit: await repo.granularitasMenit(ctx),
            jam_operasional: { hari: [...hariKerja], mulai: jam(startMinute), selesai: jam(endMinute) },
            hari_libur: [...libur],
            ruangan: ruangan.map((r) => ({ id: r.id, kode: r.kode, nama: r.nama, jenis: r.jenis, kapasitas: r.kapasitas, gedung: { id: r.gedung_id, nama: r.gedung_nama } })),
            slot: slot.map((s) => {
                const v = s.reservation_id === null ? undefined : rincian.get(s.reservation_id);
                return {
                    ruangan_id: s.resource_id,
                    mulai: s.mulai.toISOString(),
                    selesai: s.selesai.toISOString(),
                    keadaan: keadaan(s),
                    label: v?.nama_kegiatan ?? (s.fixed_schedule_id !== null ? labelBlokade.get(`t${s.fixed_schedule_id}`) : s.manual_block_id !== null ? labelBlokade.get(`m${s.manual_block_id}`) : undefined) ?? null,
                    reservasi: v === undefined ? null : { id: v.id, nomor: v.nomor, pemohon: v.pemohon },
                };
            }),
        };
    }
}
