// Sesi & permission klien (SDD-FE-04, PM-04, SDD-AUTH-05): satu-satunya sumber adalah
// `GET /me`. Klien TIDAK PERNAH menyimpulkan hak akses dari role — `<Can>` hanya
// menanyakan "apakah saya memegang permission X?". Server tetap memeriksa ulang setiap
// permintaan (NFR-S-05); gerbang UI hanya kenyamanan.

import { queryOptions, useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { ambilData, api } from "../api";

export interface PenggunaSesi {
    readonly id: string;
    readonly nama: string;
    readonly email: string;
    readonly telepon: string | null;
    readonly role_kode: string;
    readonly must_change_password: boolean;
}

export interface Sesi {
    readonly user: PenggunaSesi;
    /** Kode permission → scope efektif (`all`/`own`/`assigned`/`restricted`). */
    readonly permissions: Readonly<Record<string, string>>;
}

export const KUNCI_ME = ["me"] as const;

/** SDD-11 §4.3: dimuat sekali saat masuk; dimuat ulang saat token disegarkan. */
export const kueriMe = queryOptions({
    queryKey: KUNCI_ME,
    queryFn: () => ambilData<Sesi>(api.get("/me")),
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
});

/** Sesi aktif. Hanya dipakai di bawah shell, yang memastikan `/me` sudah termuat. */
export function useSesi(): Sesi {
    const { data } = useQuery(kueriMe);
    if (data === undefined) throw new Error("useSesi dipakai di luar shell terautentikasi.");
    return data;
}

/** `can(permission)` — memegang permission pada scope apa pun (PM-04). */
export function useCan(): (permission: string) => boolean {
    const { data } = useQuery(kueriMe);
    return (permission) => data?.permissions[permission] !== undefined;
}

/** Satu-satunya cara menyembunyikan UI berdasarkan hak akses (SDD-11 §4.2). */
export function Can({ permission, children }: { readonly permission: string; readonly children: ReactNode }): ReactNode {
    return useCan()(permission) ? children : null;
}
