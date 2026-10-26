// Progres tur produk milik sendiri: `GET/PUT /me/tours` — satu catatan per akun, berlaku di
// semua perangkat. Disimpan hanya saat tur selesai atau dilewati, bukan per langkah.

import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { api } from "../api";

const Tur = z.object({ kunci: z.string(), status: z.enum(["SELESAI", "DILEWATI"]), versi: z.number().int(), diperbarui_pada: z.string() });
export type ProgresTur = z.infer<typeof Tur>;

export const KUNCI_TUR = ["me", "tours"] as const;

export const progresTurQuery = queryOptions({
    queryKey: KUNCI_TUR,
    queryFn: async () => z.object({ data: z.object({ tur: z.array(Tur) }) }).parse((await api.get("/me/tours")).data).data.tur,
    staleTime: Number.POSITIVE_INFINITY,
});

export async function simpanProgresTur(kunci: string, status: ProgresTur["status"], versi: number): Promise<ProgresTur> {
    return z.object({ data: z.object({ tur: Tur }) }).parse((await api.put(`/me/tours/${kunci}`, { status, versi })).data).data.tur;
}

/** Tur perlu diputar otomatis bila belum pernah selesai/dilewati, atau versinya sudah usang. */
export function perluDiputar(progres: readonly ProgresTur[], kunci: string, versi: number): boolean {
    const p = progres.find((x) => x.kunci === kunci);
    return p === undefined || p.versi < versi;
}
