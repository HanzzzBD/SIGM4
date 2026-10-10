// Kontrak M-17 di klien web (m17 §7; FR-17.1, FR-17.3; SDD-08 §4.3a, §4.5). Respons diurai Zod
// (SDD-FE-05) — bentuknya cermin skema `apps/api` modul notifikasi.

import { queryOptions } from "@tanstack/react-query";
import { LABEL_KELOMPOK_NOTIFIKASI } from "@sigm4/schemas";
// zod/mini: API skema yang sama dengan bundel jauh lebih kecil (NFR-P-03, SDD-11 §4.7).
import { z } from "zod/mini";
import { api } from "../../shared/api";

/** Urutan Bab 11.3 "Kelompok Notifikasi" (UXD-05). */
export const KELOMPOK = ["PERSETUJUAN", "RESERVASI_PEMINJAMAN", "DENDA_KEWAJIBAN", "KERUSAKAN_PERAWATAN", "OPNAME_PENGADAAN", "AKUN_SISTEM"] as const satisfies readonly (keyof typeof LABEL_KELOMPOK_NOTIFIKASI)[];
export type Kelompok = (typeof KELOMPOK)[number];
const Kelompok = z.enum(KELOMPOK);

const Notifikasi = z.object({
    id: z.number(),
    kode: z.string(),
    jenis: Kelompok,
    judul: z.string(),
    isi: z.string(),
    deep_link: z.nullable(z.string()),
    wajib: z.boolean(),
    dibaca_pada: z.nullable(z.string()),
    created_at: z.string(),
});
export type Notifikasi = z.infer<typeof Notifikasi>;

const DaftarSchema = z.object({
    data: z.array(Notifikasi),
    meta: z.object({ page: z.number(), per_page: z.number(), total: z.number(), total_pages: z.number(), unread_count: z.number() }),
});
export type DaftarNotifikasi = z.infer<typeof DaftarSchema>;

export interface SaringanNotifikasi {
    readonly jenis?: Kelompok | undefined;
    readonly belumDibaca?: boolean | undefined;
    /** UXD-10: arsip > 90 hari saling meniadakan dengan daftar aktif. */
    readonly arsip?: boolean | undefined;
    readonly page?: number | undefined;
    readonly perPage?: number | undefined;
}

export const KUNCI_NOTIFIKASI = ["notifications"] as const;

/** FR-17.1 langkah 3, A2, A3. */
export const daftarNotifikasiQuery = (s: SaringanNotifikasi) =>
    queryOptions({
        queryKey: [...KUNCI_NOTIFIKASI, "list", s.jenis ?? null, s.belumDibaca === true, s.arsip === true, s.page ?? 1, s.perPage ?? 25],
        // Daftar disegarkan oleh aliran SSE/polling, bukan oleh umur cache.
        staleTime: 0,
        queryFn: async () =>
            DaftarSchema.parse(
                (
                    await api.get("/notifications", {
                        params: { jenis: s.jenis, belum_dibaca: s.belumDibaca === true ? "true" : undefined, arsip: s.arsip === true ? "true" : undefined, page: s.page, per_page: s.perPage },
                    })
                ).data,
            ),
    });

/** Penghitung dari server (NTF-05) — dipakai jalur polling dan pemulihan aliran. */
export async function hitungBelumDibaca(): Promise<number> {
    return DaftarSchema.parse((await api.get("/notifications", { params: { per_page: 1 } })).data).meta.unread_count;
}

const BacaSchema = z.object({ data: z.object({ id: z.number(), dibaca_pada: z.string(), unread_count: z.number() }) });
export async function tandaiTerbaca(id: number): Promise<number> {
    return BacaSchema.parse((await api.patch(`/notifications/${String(id)}/read`)).data).data.unread_count;
}

const BacaSemuaSchema = z.object({ data: z.object({ ditandai: z.number(), unread_count: z.number() }) });
export async function tandaiSemuaTerbaca(): Promise<{ readonly ditandai: number; readonly unread_count: number }> {
    return BacaSemuaSchema.parse((await api.patch("/notifications/read-all")).data).data;
}

const Preferensi = z.object({ jenis: Kelompok, in_app: z.boolean(), push: z.boolean(), terkunci: z.boolean() });
export type Preferensi = z.infer<typeof Preferensi>;
const PreferensiSchema = z.object({ data: z.array(Preferensi) });

export const preferensiQuery = queryOptions({
    queryKey: [...KUNCI_NOTIFIKASI, "preferences"],
    queryFn: async () => PreferensiSchema.parse((await api.get("/notifications/preferences")).data).data,
});

/** FR-17.3 langkah 3 — berlaku seketika; kelompok terkunci tidak dikirim (keputusan 81e). */
export async function simpanPreferensi(daftar: readonly Pick<Preferensi, "jenis" | "in_app" | "push">[]): Promise<Preferensi[]> {
    return PreferensiSchema.parse((await api.put("/notifications/preferences", { preferensi: daftar })).data).data;
}

/** Isi `data:` aliran SSE (SDD-08 §4.3a). */
export const PesanAliran = z.union([
    z.object({ jenis: z.literal("notifikasi"), unread_count: z.number() }),
    z.object({ jenis: z.literal("hitungan"), unread_count: z.number() }),
]);
