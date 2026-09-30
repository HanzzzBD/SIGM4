// Kontrak dashboard (SDD-14 §4.3a): manifes tanpa data + data per kartu. Cache kartu
// 5 menit (SDD-11 §4.3, 19.1); `versi` > 0 = tombol muat ulang → `segarkan=true`
// melewati cache server (keputusan 82d).

import { queryOptions } from "@tanstack/react-query";
import { ambilData, api } from "../../shared/api";

import type { Rentang } from "./rentang";

export type { Rentang };

export interface KartuManifes {
    readonly id: string;
    readonly judul: string;
    readonly zona: 1 | 2 | 3 | 4;
    readonly jenis: string;
    readonly berperiode: boolean;
    readonly drilldown: string | null;
}

export interface Manifes {
    readonly templat: string | null;
    readonly kartu: readonly KartuManifes[];
}

export interface DataKartu {
    readonly id: string;
    readonly rentang: { readonly jenis: Rentang; readonly mulai: string; readonly akhir: string } | null;
    readonly diperbarui_pada: string;
    readonly isi: unknown;
}

const LIMA_MENIT = 5 * 60 * 1000;

export const kueriManifes = queryOptions({
    queryKey: ["dashboard", "manifes"],
    queryFn: () => ambilData<Manifes>(api.get("/dashboard")),
    staleTime: LIMA_MENIT,
});

export const kueriKartu = (id: string, rentang: Rentang, versi: number) =>
    queryOptions({
        queryKey: ["dashboard", "kartu", id, rentang, versi],
        queryFn: () => ambilData<DataKartu>(api.get(`/dashboard/cards/${encodeURIComponent(id)}`, { params: { rentang, segarkan: versi > 0 ? "true" : "false" } })),
        staleTime: LIMA_MENIT,
        retry: false,
    });
