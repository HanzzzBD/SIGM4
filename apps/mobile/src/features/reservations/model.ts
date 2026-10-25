// Logika murni reservasi mobile (FR-07.1/07.2, FR-08.1/08.2; UXD-04, CAL-UI-07): aturan sama dengan web
// P-27/P-29 — kalender ponsel berupa daftar per hari, wizard tiga layar. Seluruh waktu WIB.
import type { AssetReservationBody, KeadaanSlot, ReservationDetail, RoomAvailability, RoomReservationBody, SlotKetersediaan, StatusReservasi } from "@sigm4/schemas";
import type { StatusTone } from "../../shared/ui/status";
import { atWib, dateWib, fromMinutes, isoWeekday, isoWib, timeWib, toMinutes, validDate, validTime } from "../../shared/wib";

export const STATUS_LABEL: Readonly<Record<StatusReservasi, string>> = { DRAF: "Draf", MENUNGGU_PERSETUJUAN: "Menunggu Persetujuan", DISETUJUI: "Disetujui", DITOLAK: "Ditolak", PERLU_REVISI: "Perlu Revisi", DIBATALKAN: "Dibatalkan", KEDALUWARSA: "Kedaluwarsa", BERLANGSUNG: "Berlangsung", SELESAI: "Selesai", TIDAK_DIGUNAKAN: "Tidak Digunakan" };
/** C-13 web: menunggu/perlu revisi peringatan, selesai/disetujui sukses, ditolak galat, berlangsung info; sisanya netral (garis putus). */
export const STATUS_TONE: Readonly<Record<StatusReservasi, StatusTone>> = { DRAF: "pending", MENUNGGU_PERSETUJUAN: "warning", DISETUJUI: "success", DITOLAK: "error", PERLU_REVISI: "warning", DIBATALKAN: "pending", KEDALUWARSA: "pending", BERLANGSUNG: "info", SELESAI: "success", TIDAK_DIGUNAKAN: "pending" };
export const SLOT_LABEL: Readonly<Record<KeadaanSlot, string>> = { MENUNGGU_PERSETUJUAN: "Menunggu Persetujuan", DISETUJUI: "Disetujui", JADWAL_TETAP: "Jadwal Tetap", PEMELIHARAAN: "Dalam Pemeliharaan" };
export const SLOT_TONE: Readonly<Record<KeadaanSlot, StatusTone>> = { MENUNGGU_PERSETUJUAN: "warning", DISETUJUI: "info", JADWAL_TETAP: "pending", PEMELIHARAAN: "error" };
export const WEEKDAYS: readonly (readonly [number, string])[] = [[1, "Sen"], [2, "Sel"], [3, "Rab"], [4, "Kam"], [5, "Jum"], [6, "Sab"], [7, "Min"]];

type Hours = Pick<RoomAvailability, "jam_operasional" | "hari_libur">;
/** Hari libur (FR-07.1 A5) atau bukan hari kerja (A3) — berlaku seharian. */
export function dayClosure(date: string, data: Hours): string | null {
    const holiday = data.hari_libur.find((h) => h.tanggal === date);
    if (holiday) return `Hari libur: ${holiday.nama}.`;
    return data.jam_operasional.hari.includes(isoWeekday(date)) ? null : "Bukan hari kerja sekolah.";
}
/** Slot ruangan yang beririsan `[mulai, selesai)` (SDD-AVL-02). */
export const overlapping = (slots: readonly SlotKetersediaan[], roomId: string, start: Date, end: Date) => slots.filter((s) => s.ruangan_id === roomId && Date.parse(s.mulai) < end.getTime() && Date.parse(s.selesai) > start.getTime());

/** Daftar per hari (CAL-UI-07): tiap ruangan dengan slot terpakainya, terurut waktu, dan sisa menit kosong. */
export function dayAgenda(data: RoomAvailability, date: string) {
    const open = atWib(date, data.jam_operasional.mulai).getTime(), close = atWib(date, data.jam_operasional.selesai).getTime();
    return data.ruangan.map((room) => {
        const slots = overlapping(data.slot, room.id, new Date(open), new Date(close)).sort((a, b) => Date.parse(a.mulai) - Date.parse(b.mulai));
        const used = slots.reduce((sum, s) => sum + Math.max(0, Math.min(Date.parse(s.selesai), close) - Math.max(Date.parse(s.mulai), open)), 0);
        return { room, slots, freeMinutes: Math.max(0, Math.round((close - open - used) / 60_000)) };
    });
}

/** Pilihan jam pada batas granularitas di dalam jam operasional (CAL-UI-02). */
export function timeOptions(data: Pick<RoomAvailability, "granularitas_menit" | "jam_operasional">): { start: string[]; end: string[] } {
    const start: string[] = [], end: string[] = [];
    for (let m = toMinutes(data.jam_operasional.mulai); m + data.granularitas_menit <= toMinutes(data.jam_operasional.selesai); m += data.granularitas_menit) { start.push(fromMinutes(m)); end.push(fromMinutes(m + data.granularitas_menit)); }
    return { start, end };
}

export interface RoomDraft { room: string; date: string; start: string; end: string; name: string; activity: string; participants: string; purpose: string; needs: string; note: string; recurring: boolean; days: readonly number[]; until: string; skip: readonly string[] }
export const EMPTY_ROOM: RoomDraft = { room: "", date: "", start: "", end: "", name: "", activity: "", participants: "", purpose: "", needs: "", note: "", recurring: false, days: [], until: "", skip: [] };

/** Langkah 1: hanya yang dapat dijawab data kalender — aturan lain (H-1, horizon) diputus server lewat pratinjau. */
export function timeProblem(data: RoomAvailability, d: Pick<RoomDraft, "room" | "date" | "start" | "end">): string | null {
    if (!d.room) return "Pilih ruangan.";
    if (!validDate(d.date) || !validTime(d.start) || !validTime(d.end)) return "Pilih tanggal, jam mulai, dan jam selesai.";
    if (toMinutes(d.end) <= toMinutes(d.start)) return "Jam selesai harus sesudah jam mulai.";
    const closed = dayClosure(d.date, data); if (closed) return closed;
    return overlapping(data.slot, d.room, atWib(d.date, d.start), atWib(d.date, d.end)).length > 0 ? "Ruangan sudah terpakai pada rentang ini." : null;
}
/** FR-07.2 A1: slot kosong TERDEKAT berdurasi sama di ruangan dan hari yang sama. */
export function nearestSlot(data: RoomAvailability, room: string, date: string, start: string, end: string): { start: string; end: string } | null {
    if (dayClosure(date, data)) return null;
    const asked = atWib(date, start).getTime(), duration = atWib(date, end).getTime() - asked, close = atWib(date, data.jam_operasional.selesai).getTime();
    const best = timeOptions(data).start.map((s) => atWib(date, s).getTime()).filter((m) => m !== asked && m + duration <= close && overlapping(data.slot, room, new Date(m), new Date(m + duration)).length === 0).sort((a, b) => Math.abs(a - asked) - Math.abs(b - asked) || a - b)[0];
    return best === undefined ? null : { start: timeWib(new Date(best)), end: timeWib(new Date(best + duration)) };
}
/** FR-07.2 A2: maks tiga ruangan lain yang menampung peserta dan kosong pada rentang yang sama. */
export function roomsWithCapacity(data: RoomAvailability, d: Pick<RoomDraft, "room" | "date" | "start" | "end">, participants: number) {
    const s = atWib(d.date, d.start), e = atWib(d.date, d.end);
    return data.ruangan.filter((r) => r.id !== d.room && r.kapasitas !== null && r.kapasitas >= participants && overlapping(data.slot, r.id, s, e).length === 0).sort((a, b) => (a.kapasitas ?? 0) - (b.kapasitas ?? 0)).slice(0, 3);
}

const text = (v: string) => v.trim() === "" ? null : v.trim();
/** Body `POST /reservations` ruangan; validasi tetap milik skema bersama. */
export function roomBody(d: RoomDraft): RoomReservationBody {
    return { room_id: Number(d.room), waktu_mulai: isoWib(d.date, d.start), waktu_selesai: isoWib(d.date, d.end), nama_kegiatan: d.name, jenis_kegiatan: d.activity, jumlah_peserta: d.participants.trim() === "" ? Number.NaN : Number(d.participants), keperluan: text(d.purpose), kebutuhan_tambahan: text(d.needs), keterangan: text(d.note), ...(d.recurring ? { pengulangan: { hari: [...d.days].sort((a, b) => a - b), sampai: d.until }, lewati: [...d.skip].sort() } : {}) };
}

export interface AssetDraft { selections: readonly { category: string; quantity: string }[]; units: readonly string[]; startDate: string; startTime: string; endDate: string; endTime: string; purpose: string; location: string; room: string; name: string; activity: string; participants: string; recurring: boolean; days: readonly number[]; until: string }
export const EMPTY_ASSET: AssetDraft = { selections: [{ category: "", quantity: "1" }], units: [], startDate: "", startTime: "08:00", endDate: "", endTime: "17:00", purpose: "", location: "", room: "", name: "", activity: "", participants: "", recurring: false, days: [], until: "" };
/** Body aset; `room` terisi = reservasi gabungan BR-024b (kegiatan wajib). Unit manual hanya untuk kategori pertama (sama dengan web). */
export function assetBody(d: AssetDraft): AssetReservationBody {
    return {
        jenis: "ASET", aset: d.selections.map((s, i) => ({ category_id: Number(s.category), jumlah: Number(s.quantity), ...(i === 0 && d.units.length > 0 ? { asset_ids: d.units.map(Number) } : {}) })),
        waktu_mulai: isoWib(d.startDate, d.startTime), waktu_selesai: isoWib(d.endDate, d.endTime), keperluan: d.purpose, lokasi_penggunaan: d.location,
        ...(d.room === "" ? {} : { room_id: Number(d.room), nama_kegiatan: d.name, jenis_kegiatan: d.activity, jumlah_peserta: Number(d.participants) }),
        ...(d.recurring ? { pengulangan: { hari: [...d.days].sort((a, b) => a - b), sampai: d.until } } : {}),
    };
}

/** Isian awal dari Kalender (ruangan + tanggal) atau Katalog (kategori + rentang) — "slot terisi otomatis" (F-09). */
export function draftsFromParams(p: { mode?: string; ruangan?: string; tanggal?: string; kategori?: string; mulai?: string; selesai?: string }, today: string): { mode: "RUANGAN" | "ASET"; room: RoomDraft; asset: AssetDraft } {
    const id = (v?: string) => v !== undefined && /^[1-9]\d*$/.test(v) ? v : "", instant = (v?: string) => v !== undefined && Number.isFinite(Date.parse(v)) ? new Date(v) : null;
    const tomorrow = dateWib(atWib(today, "00:00").getTime() + 86_400_000), start = instant(p.mulai), end = instant(p.selesai), mode = p.mode === "ASET" ? "ASET" : "RUANGAN";
    return {
        mode,
        room: { ...EMPTY_ROOM, room: id(p.ruangan), date: p.tanggal !== undefined && validDate(p.tanggal) ? p.tanggal : tomorrow },
        asset: { ...EMPTY_ASSET, selections: [{ category: id(p.kategori), quantity: "1" }], startDate: start ? dateWib(start) : tomorrow, startTime: start ? timeWib(start) : EMPTY_ASSET.startTime, endDate: end ? dateWib(end) : tomorrow, endTime: end ? timeWib(end) : EMPTY_ASSET.endTime, room: mode === "ASET" ? id(p.ruangan) : "" },
    };
}

/** Ubah jadwal / Ajukan Ulang (BR-024, keputusan 17d web): pengajuan BARU terisi dari reservasi lama. */
export function draftsFromDetail(d: ReservationDetail): { mode: "RUANGAN"; room: RoomDraft } | { mode: "ASET"; asset: AssetDraft } {
    const first = d.tanggal[0] ?? d, start = new Date(first.waktu_mulai), end = new Date(first.waktu_selesai), t = (v: string | null) => v ?? "";
    if (d.jenis === "RUANGAN") return { mode: "RUANGAN", room: { ...EMPTY_ROOM, room: d.ruangan?.id ?? "", date: dateWib(start), start: timeWib(start), end: timeWib(end), name: t(d.nama_kegiatan), activity: t(d.jenis_kegiatan), participants: d.jumlah_peserta === null ? "" : String(d.jumlah_peserta), purpose: t(d.keperluan), needs: t(d.kebutuhan_tambahan), note: t(d.keterangan) } };
    const counts = new Map<string, number>(); for (const item of d.aset ?? []) if (item.reservation_id === first.id) counts.set(item.category_id, (counts.get(item.category_id) ?? 0) + 1);
    const selections = [...counts].map(([category, n]) => ({ category, quantity: String(n) }));
    return { mode: "ASET", asset: { ...EMPTY_ASSET, selections: selections.length ? selections : EMPTY_ASSET.selections, startDate: dateWib(start), startTime: timeWib(start), endDate: dateWib(end), endTime: timeWib(end), purpose: t(d.keperluan), location: t(d.lokasi_penggunaan ?? null), room: d.ruangan?.id ?? "", name: t(d.nama_kegiatan), activity: t(d.jenis_kegiatan), participants: d.jumlah_peserta === null ? "" : String(d.jumlah_peserta) } };
}

/** Ringkasan langkah Tinjau (BR-024a/b): tanggal yang dipesan vs bentrok/tidak sah/dilewati. */
export function previewSummary(dates: readonly { keadaan: "TERSEDIA" | "BENTROK" | "TIDAK_SAH" | "DILEWATI" }[]) {
    const count = (k: string) => dates.filter((d) => d.keadaan === k).length;
    const booked = count("TERSEDIA"), blocked = count("BENTROK") + count("TIDAK_SAH");
    return { booked, blocked, skipped: count("DILEWATI"), canSubmit: booked > 0 && blocked === 0 };
}
