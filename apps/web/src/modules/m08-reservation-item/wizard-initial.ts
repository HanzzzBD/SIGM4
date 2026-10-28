import type { ReservationDetail } from "@sigm4/schemas";
import type { AssetWizardInitial } from "./AssetReservationWizardPage";
export function assetWizardInitial(detail: ReservationDetail): AssetWizardInitial {
    const first = detail.tanggal[0] ?? detail;
    const quantities = new Map<string, number>();
    for (const item of detail.aset ?? []) if (item.reservation_id === first.id) quantities.set(item.category_id, (quantities.get(item.category_id) ?? 0) + 1);
    const selections = [...quantities].map(([category, quantity]) => ({ category, quantity }));
    const inWib = (iso: string) => new Date(Date.parse(iso) + 7 * 3_600_000);
    return { selections, category: selections[0]?.category, quantity: selections[0]?.quantity, room: detail.ruangan?.id, start: first.waktu_mulai, end: first.waktu_selesai, purpose: detail.keperluan ?? undefined, location: detail.lokasi_penggunaan ?? undefined, name: detail.nama_kegiatan ?? undefined, activity: detail.jenis_kegiatan ?? undefined, participants: detail.jumlah_peserta ?? undefined, ...(detail.tanggal.length === 0 ? {} : { pattern: { hari: [...new Set(detail.tanggal.map((d) => inWib(d.waktu_mulai).getUTCDay() || 7))], sampai: inWib(detail.tanggal.at(-1)!.waktu_mulai).toISOString().slice(0, 10) } }) };
}
