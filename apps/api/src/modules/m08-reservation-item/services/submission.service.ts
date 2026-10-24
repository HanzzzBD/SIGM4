// FR-08.2 / BR-024b: reservasi, alokasi dan approval dalam transaksi pemanggil.
import type { AssetReservationBody, RoomReservationCreated, RoomReservationPreview } from "@sigm4/schemas";
import type { Kysely } from "kysely";
import type { AuthContext } from "../../../shared/auth/index.js";
import type { AuditLogger } from "../../../shared/audit/index.js";
import { daftarSlotTerpakai, SlotService } from "../../../shared/booking/index.js";
import type { Clock } from "../../../shared/clock/index.js";
import type { BusinessCalendarService } from "../../../shared/calendar/index.js";
import { withTransaction } from "../../../shared/db/index.js";
import type { Database, TransactionScope } from "../../../shared/db/index.js";
import { DomainError, ForbiddenError } from "../../../shared/errors/index.js";
import { DocumentNumberService } from "../../../shared/numbering/index.js";
import { ruanganUntukReservasi } from "../../m03-locations/index.js";
import type { ApprovalService, RuleConfigService, KamusFakta } from "../../m10-approval/index.js";
import { alasanTidakSah, jabarkan, kedaluwarsaTentatif, tanggalWib, tambahHari } from "../../m07-reservation-room/index.js";
import { createSubmissionRepository } from "../repositories/submission.repository.js";

export interface AssetSubmissionDeps {
    db: Kysely<Database>; clock: Clock; calendar: BusinessCalendarService; audit: AuditLogger; approval: ApprovalService; rules: RuleConfigService;
    blockers: { periksa(scope: TransactionScope, id: number): Promise<readonly { jenis: string; keterangan: string }[]> };
}
const invalid = (field: string, message: string) => new DomainError("VALIDATION_ERROR", message, { errors: [{ field, message }] });
export class AssetSubmissionService {
    constructor(private readonly deps: AssetSubmissionDeps) {}
    private async examine(scope: TransactionScope, body: AssetReservationBody) {
        const { clock, calendar, blockers } = this.deps;
        const student = scope.ctx.roleCode === "R-07" || (scope.ctx.can("reservation.view") && scope.ctx.scopeOf("reservation.view") === "restricted");
        if (body.aset.some((a) => a.asset_ids !== undefined) && !scope.ctx.can("reservation.cancel_any")) throw new ForbiddenError();
        if (body.aset.some((a) => a.asset_ids !== undefined) && body.aset.some((a) => a.asset_ids === undefined)) throw invalid("aset", "Pilih alokasi otomatis atau manual untuk seluruh kategori.");
        const blocked = await blockers.periksa(scope, scope.ctx.userId);
        if (blocked.length > 0) throw new DomainError("BORROWER_BLOCKED", blocked.map((b) => b.keterangan).join(" "));
        const repo = createSubmissionRepository(scope.tx), settings = await repo.settings(scope.ctx);
        const number = (key: string) => { const v = settings.get(key); if (typeof v !== "number") throw new Error(`Pengaturan ${key} tidak tersedia.`); return v; };
        const role = scope.ctx.roleCode.startsWith("R-") ? scope.ctx.roleCode.toLowerCase().replaceAll("-", "_") : "r_06";
        const roleKey = `reservasi.durasi_maksimum_${role}_hari`;
        const maxDays = number(settings.has(roleKey) ? roleKey : "reservasi.durasi_maksimum_r_06_hari");
        const start = new Date(body.waktu_mulai), end = new Date(body.waktu_selesai);
        if (end.getTime() - start.getTime() > maxDays * 86_400_000) throw invalid("waktu_selesai", `Durasi maksimum peminjaman untuk role Anda adalah ${String(maxDays)} hari.`);
        const occurrences = jabarkan(start, end, body.pengulangan);
        if (occurrences.length === 0) throw invalid("pengulangan", "Pola tidak menghasilkan tanggal.");
        const skip = new Set(body.lewati ?? []);
        if ([...skip].some((d) => !occurrences.some((o) => o.tanggal === d))) throw invalid("lewati", "Tanggal dilewati bukan bagian dari pola.");
        const first = occurrences[0]!, last = occurrences.at(-1)!;
        const { hariKerja, libur } = await calendar.kalenderRentang(scope.tx, first.tanggal, last.tanggal);
        const rules = { ...(body.room_id === undefined ? {} : { durasiMaksimumJam: number("reservasi.durasi_maksimum_jam") }), sekarang: clock.now(), jam: await calendar.jamOperasional(scope.tx), hariKerja: new Set(hariKerja), libur: new Map(libur.map((l) => [l.tanggal, l.nama])), granularitasMenit: number("reservasi.granularitas_menit"), jarakMinimumHari: number("reservasi.jarak_minimum_hari"), mendesak: scope.ctx.can("reservation.urgent"), horizonHari: number("reservasi.horizon_hari") };
        const room = body.room_id === undefined ? undefined : await ruanganUntukReservasi(scope, body.room_id, student);
        if (body.room_id !== undefined && room === undefined) throw invalid("room_id", "Ruangan tidak dapat direservasi.");
        if (room?.kapasitas !== null && room?.kapasitas !== undefined && (body.jumlah_peserta ?? 0) > room.kapasitas) throw invalid("jumlah_peserta", "Jumlah peserta melebihi kapasitas ruangan.");
        const candidates = await repo.candidates(scope.ctx, body.aset.map((a) => a.category_id), student);
        const occupied = await daftarSlotTerpakai(scope.tx, "asset", candidates.map((a) => Number(a.id)), { mulai: first.mulai, selesai: last.selesai });
        const roomSlots = room === undefined ? [] : await daftarSlotTerpakai(scope.tx, "room", [room.id], { mulai: first.mulai, selesai: last.selesai });
        const planned: { id: string; start: Date; end: Date }[] = [];
        const dates = occurrences.map((o) => {
            if (skip.has(o.tanggal)) return { ...o, keadaan: "DILEWATI" as const, alasan: null };
            let reason = room === undefined ? null : alasanTidakSah(o, rules);
            if (o.mulai <= clock.now()) reason = "Waktu mulai sudah lewat.";
            if (tanggalWib(o.selesai) > tambahHari(tanggalWib(clock.now()), rules.horizonHari)) reason = "Melewati horizon pemesanan.";
            if (!rules.mendesak && o.tanggal < tambahHari(tanggalWib(clock.now()), rules.jarakMinimumHari)) reason = `Pengajuan paling lambat H-${String(rules.jarakMinimumHari)}.`;
            if (reason !== null) return { ...o, keadaan: "TIDAK_SAH" as const, alasan: reason };
            const overlaps = (s: { mulai: Date; selesai: Date }) => s.mulai < o.selesai && o.mulai < s.selesai;
            const available = candidates.filter((a) => !occupied.some((s) => s.resource_id === a.id && overlaps(s)) && !planned.some((s) => s.id === a.id && s.start < o.selesai && o.mulai < s.end));
            const enough = body.aset.every((selection) => {
                const units = available.filter((a) => a.category_id === String(selection.category_id));
                return selection.asset_ids === undefined ? units.length >= selection.jumlah : selection.asset_ids.every((id) => units.some((u) => u.id === String(id)));
            });
            if (enough && !roomSlots.some(overlaps)) {
                for (const selection of body.aset) for (const unit of available.filter((a) => a.category_id === String(selection.category_id) && (selection.asset_ids === undefined || selection.asset_ids.includes(Number(a.id)))).slice(0, selection.jumlah)) planned.push({ id: unit.id, start: o.mulai, end: o.selesai });
                return { ...o, keadaan: "TERSEDIA" as const, alasan: null };
            }
            return { ...o, keadaan: "BENTROK" as const, alasan: "Sebagian ruangan atau aset tidak tersedia pada tanggal ini." };
        });
        const quota = { berjalan: await repo.pending(scope.ctx), batas: number(student ? "reservasi.kuota_tertunda_siswa_osis" : "reservasi.kuota_tertunda_guru_staf") };
        const predicted = candidates.filter((unit) => planned.some((p) => p.id === unit.id));
        const facts: KamusFakta = {
            requester_role: scope.ctx.roleCode, requester_id: scope.ctx.userId, requester_has_overdue: false,
            item_count: body.aset.reduce((n, a) => n + a.jumlah, 0),
            duration_days: Math.ceil((end.getTime() - start.getTime()) / 86_400_000),
            asset_category_id: body.aset.map((a) => a.category_id), asset_value_max: Math.max(0, ...predicted.map((a) => Number(a.nilai_perolehan ?? 0))),
            duration_hours: Math.ceil((end.getTime() - start.getTime()) / 3_600_000),
            is_recurring: body.pengulangan !== undefined, lead_time_hours: Math.max(0, Math.floor((start.getTime() - clock.now().getTime()) / 3_600_000)),
            ...(room === undefined ? {} : { room_id: [room.id], room_type: room.jenis, participant_count: body.jumlah_peserta ?? 0, is_outside_operating_hours: false }),
        };
        return { dates, quota, facts, student, ttl: number("reservasi.ttl_tentative_jam"), candidates, occupied };
    }
    async pratinjau(ctx: AuthContext, body: AssetReservationBody): Promise<RoomReservationPreview> {
        return withTransaction(ctx, async (scope) => {
            const review = await this.examine(scope, body), path = await this.deps.rules.jalurPemohon(scope, "RESERVASI_ASET", review.facts, ctx.userId);
            return { tanggal: review.dates.map((o) => ({ tanggal: o.tanggal, mulai: o.mulai.toISOString(), selesai: o.selesai.toISOString(), keadaan: o.keadaan, alasan: o.alasan })), kuota: review.quota, jalur_persetujuan: path.map((l) => ({ urutan: l.urutan, approver: l.approver.user?.nama ?? l.approver.role?.nama ?? "—", sla_jam: l.sla_jam, fallback: l.fallback, akan_dilewati: l.akan_dilewati })) };
        }, this.deps.db);
    }
    async ajukan(scope: TransactionScope, body: AssetReservationBody): Promise<RoomReservationCreated> {
        const repo = createSubmissionRepository(scope.tx);
        // Kunci yang sama dengan pengajuan ruangan: kuota tidak bisa dilampaui lintas jenis.
        await repo.lockRequester(scope.ctx);
        const review = await this.examine(scope, body);
        if (review.quota.berjalan >= review.quota.batas) throw invalid("kuota", `Anda memiliki ${String(review.quota.berjalan)} pengajuan yang masih menunggu persetujuan. Batas maksimum ${String(review.quota.batas)}.`);
        const bad = review.dates.filter((o) => o.keadaan === "TIDAK_SAH" || o.keadaan === "BENTROK");
        if (bad.length > 0) throw new DomainError(bad.some((d) => d.keadaan === "TIDAK_SAH") ? "VALIDATION_ERROR" : "ASSET_NOT_AVAILABLE", "Pengajuan tidak dapat diproses.", { errors: bad.map((d) => ({ field: "waktu_mulai", message: `${d.tanggal}: ${d.alasan ?? ""}` })) });
        const dates = review.dates.filter((d) => d.keadaan === "TERSEDIA");
        if (dates.length === 0) throw invalid("lewati", "Tidak ada tanggal yang diajukan.");
        const number = await new DocumentNumberService(this.deps.clock).next(scope.tx, "RSV-BR");
        const repeated = body.pengulangan !== undefined;
        const insert = async (nomor: string, start: Date, end: Date, parent: string | null) => (await scope.tx.insertInto("reservations").values({ nomor, jenis: "ASET", pemohon_id: scope.ctx.userId, room_id: body.room_id ?? null, parent_id: parent, waktu_mulai: start, waktu_selesai: end, nama_kegiatan: body.nama_kegiatan ?? null, jenis_kegiatan: body.jenis_kegiatan ?? null, jumlah_peserta: body.jumlah_peserta ?? null, keperluan: body.keperluan, lokasi_penggunaan: body.lokasi_penggunaan, kebutuhan_tambahan: null, keterangan: null, created_by: scope.ctx.userId, updated_by: scope.ctx.userId }).returning("id").executeTakeFirstOrThrow()).id;
        const root = await insert(number, dates[0]!.mulai, dates.at(-1)!.selesai, null);
        const rows: RoomReservationCreated["tanggal"] = [];
        const booking = new SlotService(this.deps.clock);
        const allocation: string[][] = dates.map(() => []);
        if (body.aset.every((s) => s.asset_ids !== undefined)) for (const chosen of allocation) chosen.push(...body.aset.flatMap((s) => s.asset_ids!.map(String)));
        else {
            const remaining = dates.map(() => new Map(body.aset.map((s) => [String(s.category_id), s.jumlah])));
            let after = "0";
            while (remaining.some((r) => [...r.values()].some((n) => n > 0))) {
                const candidates = review.candidates.filter((a) => remaining.some((r, index) => (r.get(a.category_id) ?? 0) > 0 && !review.occupied.some((s) => s.resource_id === a.id && s.mulai < dates[index]!.selesai && dates[index]!.mulai < s.selesai))).map((a) => a.id);
                const unit = await repo.lockNext(scope.ctx, candidates, after, review.student);
                if (unit === undefined) throw new DomainError("ASSET_NOT_AVAILABLE", "Unit yang diminta tidak tersedia; seluruh pengajuan dibatalkan.");
                after = unit.id;
                const occupied = await daftarSlotTerpakai(scope.tx, "asset", [Number(unit.id)], { mulai: dates[0]!.mulai, selesai: dates.at(-1)!.selesai });
                const assigned: { mulai: Date; selesai: Date }[] = [];
                for (const [index, occurrence] of dates.entries()) if ((remaining[index]!.get(unit.category_id) ?? 0) > 0 && !occupied.some((s) => s.mulai < occurrence.selesai && occurrence.mulai < s.selesai) && !assigned.some((s) => s.mulai < occurrence.selesai && occurrence.mulai < s.selesai)) {
                    allocation[index]!.push(unit.id); remaining[index]!.set(unit.category_id, remaining[index]!.get(unit.category_id)! - 1);
                    assigned.push(occurrence);
                }
            }
        }
        for (const [index, occurrence] of dates.entries()) {
            const childNumber = repeated ? `${number}.${String(index + 1).padStart(2, "0")}` : number;
            const id = repeated ? await insert(childNumber, occurrence.mulai, occurrence.selesai, root) : root;
            const chosen = allocation[index]!;
            // Reserve mengunci seluruh ID terurut; ruangan dikunci sesudah semua aset (SDD-AVL-06).
            await booking.reserve(scope, { sumberDaya: [...chosen.map((id) => ({ jenis: "asset" as const, id: Number(id) })), ...(body.room_id === undefined ? [] : [{ jenis: "room" as const, id: body.room_id }])], rentang: { mulai: occurrence.mulai, selesai: occurrence.selesai }, asal: "reservation", status: "TENTATIVE", kedaluwarsa: kedaluwarsaTentatif(this.deps.clock.now(), review.ttl, dates[0]!.mulai), rujukan: { reservationId: Number(id) } });
            const stillEligible = await repo.candidates(scope.ctx, body.aset.map((a) => a.category_id), review.student);
            if (chosen.some((id) => !stillEligible.some((a) => a.id === id))) throw new DomainError("ASSET_NOT_AVAILABLE", "Kelayakan aset telah berubah; seluruh pengajuan dibatalkan.");
            if (body.aset.some((s) => s.asset_ids?.some((id) => !stillEligible.some((a) => a.id === String(id) && a.category_id === String(s.category_id))))) throw new DomainError("ASSET_NOT_AVAILABLE", "Kategori unit manual telah berubah.");
            await scope.tx.insertInto("reservation_items").values(chosen.map((asset) => ({ reservation_id: id, asset_id: asset, jumlah: 1 }))).execute();
            rows.push({ id, nomor: childNumber, mulai: occurrence.mulai.toISOString(), selesai: occurrence.selesai.toISOString() });
        }
        const allocatedIds = new Set(allocation.flat());
        const allocated = (await repo.candidates(scope.ctx, body.aset.map((a) => a.category_id), review.student)).filter((a) => allocatedIds.has(a.id));
        const approval = await this.deps.approval.createInstance(scope, { jenis: "RESERVASI_ASET", referensiId: Number(root), pemohonId: scope.ctx.userId, fakta: { ...review.facts, asset_value_max: Math.max(0, ...allocated.map((a) => Number(a.nilai_perolehan ?? 0))) } });
        await this.deps.audit.write(scope, { modul: "m07-reservation-room", aksi: "RESERVATION_CREATED", entitas: "reservations", entitasId: root, nilaiSesudah: { nomor: number, jenis: "ASET", status: "MENUNGGU_PERSETUJUAN", tanggal: rows, kategori: body.aset.map((s) => ({ category_id: s.category_id, jumlah: s.jumlah })) } });
        return { id: root, nomor: number, status: "MENUNGGU_PERSETUJUAN", tanggal: rows, approval: { instance_id: approval.instanceId, langkah_aktif: approval.langkahAktif } };
    }
}
