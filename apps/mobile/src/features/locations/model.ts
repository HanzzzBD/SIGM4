// Logika murni lokasi & blokade ruangan mobile (FR-03.x, FR-07.5; MS-37, MS-38) — aturan sama dengan web P-22/P-23.
import { RoomBlockCreateSchema } from "@sigm4/schemas";
import type { RoomBlockCreate } from "@sigm4/schemas";
import { isoWib, validDate, validTime } from "../../shared/wib";
import type { Building } from "./api";

export const ROOM_TYPES = ["KELAS", "LABORATORIUM", "AULA", "PERPUSTAKAAN", "KANTOR", "GUDANG", "LAPANGAN", "LAINNYA"] as const;
export const typeLabel = (s: string) => s.toLowerCase().replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase());
export const DAYS = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"] as const;

/** Pohon gedung → area → ruangan dijelajah satu tangan: hanya cabang terbuka yang dirender; pencarian membuka cabang yang cocok. */
type Area = Building["areas"][number];
export function visibleTree(tree: readonly Building[], query: string): { building: Building; areas: { area: Area; rooms: Area["rooms"][number][] }[] }[] {
    const q = query.trim().toLocaleLowerCase("id-ID"), hit = (s: string) => s.toLocaleLowerCase("id-ID").includes(q);
    return tree.map((building) => ({ building, areas: building.areas.map((area) => ({ area, rooms: q === "" || hit(building.nama) || hit(area.nama) ? [...area.rooms] : area.rooms.filter((r) => hit(r.nama) || hit(r.kode)) })).filter((a) => q === "" || a.rooms.length > 0 || hit(a.area.nama)) })).filter((b) => q === "" || b.areas.length > 0 || hit(b.building.nama));
}

export type LocationKind = "buildings" | "areas" | "rooms";
export interface LocationForm { nama: string; kode: string; extra: string; jenis: string; kapasitas: string; pj: string; reservable: boolean; students: boolean }
/** Body POST/PUT per tingkat lokasi (FR-03.1/03.2); kode unik di tingkat yang sama diputus server. */
export function locationBody(kind: LocationKind, f: LocationForm, parent: string): { body: Record<string, unknown> } | { error: string } {
    if (!f.nama.trim() || !f.kode.trim()) return { error: "Nama dan kode wajib diisi." };
    const common = { nama: f.nama.trim(), kode: f.kode.trim() };
    if (kind === "buildings") return { body: { ...common, keterangan: f.extra.trim() || null } };
    if (kind === "areas") return { body: { ...common, building_id: Number(parent), lantai: f.extra.trim() === "" ? null : Number(f.extra) } };
    if (f.kapasitas.trim() !== "" && !(Number(f.kapasitas) >= 1)) return { error: "Kapasitas minimal 1 orang." };
    return { body: { ...common, area_id: Number(parent), jenis: f.jenis, kapasitas: f.kapasitas.trim() === "" ? null : Number(f.kapasitas), penanggung_jawab_id: f.pj ? Number(f.pj) : null, dapat_direservasi: f.reservable, boleh_direservasi_siswa: f.reservable && f.students } };
}

export interface BlockForm { jenis: "JADWAL_TETAP" | "BLOKADE_MANUAL"; label: string; days: readonly number[]; start: string; end: string; from: string; until: string; startDate: string; endDate: string }
/** FR-07.5: jadwal tetap mingguan (hari, jam, rentang berlaku) atau blokade manual rentang tunggal; dibandingkan skema bersama. */
export function blockBody(f: BlockForm, cancelReason?: string): { body: RoomBlockCreate } | { error: string } {
    if (!validTime(f.start) || !validTime(f.end)) return { error: "Isi jam HH:MM, mis. 07:00." };
    if (f.jenis === "JADWAL_TETAP" ? !validDate(f.from) || !validDate(f.until) || f.until < f.from : !validDate(f.startDate) || !validDate(f.endDate)) return { error: "Pilih rentang tanggal yang sah." };
    const base = f.jenis === "JADWAL_TETAP" ? { jenis: f.jenis, hari: [...f.days].sort((a, b) => a - b), jam_mulai: f.start, jam_selesai: f.end, berlaku_mulai: f.from, berlaku_sampai: f.until, label_kegiatan: f.label } : { jenis: f.jenis, mulai: isoWib(f.startDate, f.start), selesai: isoWib(f.endDate, f.end), label_kegiatan: f.label };
    if (f.jenis === "BLOKADE_MANUAL" && Date.parse(isoWib(f.endDate, f.end)) <= Date.parse(isoWib(f.startDate, f.start))) return { error: "Waktu selesai harus sesudah waktu mulai." };
    const parsed = RoomBlockCreateSchema.safeParse(cancelReason === undefined ? base : { ...base, batalkan_bentrok: { alasan: cancelReason } });
    return parsed.success ? { body: parsed.data } : { error: parsed.error.issues.map((i) => i.message).join(" ") };
}
/** A1: reservasi bentrok butuh keputusan eksplisit membatalkannya; bentrok lain (blokade/pemeliharaan) wajib disesuaikan. */
export function blockDecision(preview: { bentrok_reservasi: readonly unknown[]; bentrok_lain: readonly unknown[] }): "OK" | "CANCEL_RESERVATIONS" | "ADJUST" {
    return preview.bentrok_lain.length > 0 ? "ADJUST" : preview.bentrok_reservasi.length > 0 ? "CANCEL_RESERVATIONS" : "OK";
}
