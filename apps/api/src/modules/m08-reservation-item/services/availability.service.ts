import type { AssetAvailabilityGroup, AssetAvailabilityQuery, AssetAvailabilityResponse } from "@sigm4/schemas";
import type { Kysely } from "kysely";
import type { AuthContext } from "../../../shared/auth/index.js";
import { daftarSlotTerpakai } from "../../../shared/booking/index.js";
import type { SlotTerpakai } from "../../../shared/booking/index.js";
import type { Clock } from "../../../shared/clock/index.js";
import type { Database } from "../../../shared/db/index.js";
import { DomainError } from "../../../shared/errors/index.js";
import type { PenyimpananObjek } from "../../../shared/storage/index.js";
import { urlUnduhBerkas } from "../../m06-documents/index.js";
import { createAvailabilityRepository } from "../repositories/availability.repository.js";

/** FR-08.1 A2: mencari celah dengan durasi yang sama; batas [) memungkinkan slot berurutan. */
export function nextAvailableStart(start: number, duration: number, latestEnd: number, slots: readonly Pick<SlotTerpakai, "mulai" | "selesai">[]): number | null {
    let candidate = start;
    for (const slot of slots) {
        if (slot.selesai.getTime() <= candidate) continue;
        if (slot.mulai.getTime() >= candidate + duration) break;
        candidate = slot.selesai.getTime();
    }
    return candidate + duration <= latestEnd ? candidate : null;
}

export class AvailabilityService {
    constructor(private readonly db: Kysely<Database>, private readonly clock: Clock, private readonly storage: PenyimpananObjek) {}
    async get(ctx: AuthContext, q: AssetAvailabilityQuery): Promise<AssetAvailabilityResponse> {
        const repo = createAvailabilityRepository(this.db);
        const [assets, days] = await Promise.all([repo.eligible(ctx), repo.horizonDays(ctx)]);
        // BR-023c / CAL-03: horizon pada batas hari WIB, seperti pengajuan ruangan.
        const today = new Date(this.clock.now().getTime() + 7 * 3_600_000).toISOString().slice(0, 10);
        const latestEnd = Date.parse(`${today}T00:00:00+07:00`) + (days + 1) * 86_400_000;
        const start = Date.parse(q.dari), end = Date.parse(q.sampai), duration = end - start;
        if (start < Date.parse(`${today}T00:00:00+07:00`) || end > latestEnd) throw new DomainError("VALIDATION_ERROR", "Rentang berada di luar horizon pemesanan.", { errors: [{ field: "sampai", message: `Pilih rentang mulai hari ini hingga ${String(days)} hari ke depan (WIB).` }] });
        const categories = [...new Map(assets.map((a) => [a.category_id, { id: a.category_id, nama: a.category_name }])).values()].sort((a, b) => a.nama.localeCompare(b.nama, "id"));
        const filtered = assets.filter((a) => (q.kategori_id === undefined || a.category_id === String(q.kategori_id)) && (q.q === undefined || `${a.nama} ${a.category_name}`.toLocaleLowerCase("id").includes(q.q.toLocaleLowerCase("id"))));
        const occupied = await daftarSlotTerpakai(this.db, "asset", filtered.map((a) => Number(a.id)), { mulai: new Date(start), selesai: new Date(latestEnd) });
        const byUnit = new Map<string, SlotTerpakai[]>();
        for (const slot of occupied) { const list = byUnit.get(slot.resource_id) ?? []; list.push(slot); byUnit.set(slot.resource_id, list); }
        const groups = new Map<string, AssetAvailabilityGroup>();
        for (const a of filtered) {
            const key = JSON.stringify([a.category_id, a.nama, a.merek, a.model]);
            let group = groups.get(key);
            if (group === undefined) {
                group = { key, nama: a.nama, merek: a.merek, model: a.model, kategori: { id: a.category_id, nama: a.category_name }, jumlah_unit: 0, jumlah_tersedia: 0, tersedia_mulai: null, foto_url: null, unit: [] };
                groups.set(key, group);
            }
            const next = nextAvailableStart(start, duration, latestEnd, byUnit.get(a.id) ?? []);
            const available = next === start;
            const iso = next === null ? null : new Date(next).toISOString();
            group.unit.push({ id: a.id, kode_barang: a.kode_barang, kondisi: a.kondisi as "BAIK" | "RUSAK_RINGAN", tersedia: available, tersedia_mulai: iso });
            group.jumlah_unit++;
            if (available) group.jumlah_tersedia++;
            if (iso !== null && (group.tersedia_mulai === null || iso < group.tersedia_mulai)) group.tersedia_mulai = iso;
        }
        const sorted = [...groups.values()].filter((g) => q.hanya_tersedia !== "true" || g.jumlah_tersedia > 0).sort((a, b) => {
            const order = q.sort.endsWith("tersedia") ? a.jumlah_tersedia - b.jumlah_tersedia : a.nama.localeCompare(b.nama, "id");
            return (q.sort.startsWith("-") ? -order : order) || a.key.localeCompare(b.key);
        });
        const page = sorted.slice((q.page - 1) * q.per_page, q.page * q.per_page);
        const photos = await repo.photos(ctx, page.flatMap((g) => g.unit.map((u) => u.id)));
        const photoByUnit = new Map<string, (typeof photos)[number]>();
        for (const photo of photos) if (!photoByUnit.has(photo.asset_id)) photoByUnit.set(photo.asset_id, photo);
        await Promise.all(page.map(async (g) => {
            const photo = g.unit.map((u) => photoByUnit.get(u.id)).find((p) => p !== undefined);
            if (photo !== undefined) g.foto_url = (await urlUnduhBerkas(this.storage, this.clock, photo, "thumb")).url;
        }));
        return { success: true, data: { dari: new Date(start).toISOString(), sampai: new Date(end).toISOString(), zona_waktu: "Asia/Jakarta", horizon_sampai: new Date(latestEnd).toISOString(), kategori: categories, kelompok: page }, meta: { page: q.page, per_page: q.per_page, total: sorted.length, total_pages: Math.ceil(sorted.length / q.per_page) } };
    }
}
