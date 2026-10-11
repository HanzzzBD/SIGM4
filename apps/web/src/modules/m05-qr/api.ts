// Kontrak M-05 di klien web (m05 §7; FR-05.1, FR-05.2; PR-03-28). Respons dicerminkan Zod dari skema
// `apps/api` M-05; pencarian kode manual memakai katalog M-04 (`GET /assets?q=`, FR-05.2 A1).

import { queryOptions } from "@tanstack/react-query";
// zod/mini: API skema yang sama dengan bundel jauh lebih kecil (NFR-P-03, SDD-11 §4.7).
import { z } from "zod/mini";
import { ApiError, api } from "../../shared/api";

const KONDISI = ["BAIK", "RUSAK_RINGAN", "RUSAK_BERAT", "HILANG"] as const;
const STATUS = ["TERSEDIA", "DIRESERVASI", "DIPINJAM", "DALAM_PERBAIKAN", "TIDAK_TERSEDIA"] as const;
const Lokasi = z.object({ gedung: z.string(), area: z.string(), ruang: z.string() });

/** FR-05.2 A3, DP-05: atribut non-sensitif saja. */
const Publik = z.object({ kode_barang: z.string(), nama: z.string(), kategori: z.string(), lokasi: Lokasi, kondisi: z.enum(KONDISI), status: z.enum(STATUS), aktif: z.boolean() });
export type ProfilPublik = z.infer<typeof Publik>;

export const profilPublikQuery = (uuid: string) =>
    queryOptions({
        queryKey: ["public-assets", uuid],
        queryFn: async () => z.object({ data: Publik }).parse((await api.get(`/public/assets/${encodeURIComponent(uuid)}`)).data).data,
        retry: (n, e) => !(e instanceof ApiError && e.status < 500) && n < 2,
    });

const Pindaian = z.object({ id: z.string(), kode_barang: z.string(), nama: z.string(), kategori_nama: z.string(), lokasi: Lokasi, kondisi: z.enum(KONDISI), status: z.enum(STATUS), dihapuskan: z.boolean() });
export type AsetPindaian = z.infer<typeof Pindaian>;

/** Payload QR permanen `https://{domain}/a/{uuid}` (FR-05.1 langkah 1) → UUID; selain itu `null`. */
export function uuidDariQr(isi: string): string | null {
    const cocok = /\/a\/([0-9a-fA-F-]{36})\/?$/.exec(isi.trim());
    return cocok?.[1]?.toLowerCase() ?? null;
}

/** FR-05.2 langkah 3 — 404 = QR tak dikenali (A1), pesan dari server. */
export async function asetDariUuid(uuid: string): Promise<AsetPindaian> {
    return z.object({ data: Pindaian }).parse((await api.get(`/assets/by-uuid/${encodeURIComponent(uuid)}`)).data).data;
}

const Ringkas = z.object({ id: z.string(), kode_barang: z.string(), nama: z.string(), qr_terpasang: z.boolean() });
export type AsetRingkas = z.infer<typeof Ringkas>;
const Katalog = z.object({ data: z.array(Ringkas) });

/** FR-05.2 A1: kode aset manual — hanya kecocokan persis (tanpa memedulikan huruf besar/kecil). */
export async function asetDariKode(kode: string): Promise<AsetRingkas | null> {
    const hasil = Katalog.parse((await api.get("/assets", { params: { q: kode.trim(), per_page: 10 } })).data).data;
    return hasil.find((a) => a.kode_barang.toLowerCase() === kode.trim().toLowerCase()) ?? null;
}

/** P-24: cari aset untuk ditambahkan ke lembar label. */
export const cariAsetQuery = (q: string) =>
    queryOptions({
        queryKey: ["assets", "label-qr", q],
        enabled: q.trim() !== "",
        queryFn: async () => Katalog.parse((await api.get("/assets", { params: { q: q.trim(), per_page: 25 } })).data).data,
    });

/** Aset terpilih lewat `?aset=` (P-16, P-18) — detail ringkas per id (PR-03-24). */
export const asetRingkasQuery = (id: string) =>
    queryOptions({
        queryKey: ["assets", id, "ringkas"],
        queryFn: async () => z.object({ data: Ringkas }).parse((await api.get(`/assets/${id}`)).data).data,
        retry: false,
    });

export const TATA_LETAK = ["A4_3X8", "A4_4X10", "A4_2X5"] as const;
export type TataLetak = (typeof TATA_LETAK)[number];
export const LABEL_TATA_LETAK: Record<TataLetak, string> = { A4_3X8: "A4 · 3 × 8 (24 label)", A4_4X10: "A4 · 4 × 10 (40 label kecil)", A4_2X5: "A4 · 2 × 5 (10 label besar)" };
/** AC FR-05.1: hingga 200 label per cetak. */
export const MAKS_LABEL = 200;

/** FR-05.1 langkah 2–4: PDF biner; nama berkas dari `Content-Disposition` bila ada. */
export async function cetakLabel(body: { readonly asset_ids: readonly number[]; readonly tata_letak: TataLetak; readonly elemen: { readonly kode_aset: boolean; readonly nama: boolean } }): Promise<{ readonly blob: Blob; readonly nama: string }> {
    const r = await api.post("/assets/qr/print", body, { responseType: "blob" });
    const cd = String(r.headers["content-disposition"] ?? "");
    const nama = /filename="?([^";]+)"?/.exec(cd)?.[1] ?? "label-qr.pdf";
    return { blob: r.data as Blob, nama };
}

/** FR-05.1 langkah 5. */
export async function tandaiTerpasang(ids: readonly number[], terpasang: boolean): Promise<number> {
    return z.object({ meta: z.object({ jumlah_diubah: z.number() }) }).parse((await api.patch("/assets/qr-terpasang", { asset_ids: ids, qr_terpasang: terpasang })).data).meta.jumlah_diubah;
}
