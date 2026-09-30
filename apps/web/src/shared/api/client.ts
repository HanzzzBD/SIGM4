// Klien HTTP web (SDD-FE-16, SDD-11 §4.4). Sesi web hidup di cookie httpOnly
// (SDD-SESS-05): klien TIDAK pernah membaca atau menyimpan token. Access token
// kedaluwarsa (401) ditukar diam-diam lewat SATU `POST /auth/refresh` bersama — permintaan
// paralel menunggu hasil yang sama, sebab dua refresh serentak memicu pencabutan seluruh
// keluarga token (SDD-FE-07, SDD-SESS-04). Refresh yang gagal = sesi berakhir.

import axios from "axios";
import type { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from "axios";
import { ApiError, GalatJaringan, dariRespons } from "./errors";

export const BASE_API = "/api/v1";

/** Titik yang tidak boleh memicu refresh: kegagalannya bermakna sendiri (F-01). */
const TANPA_REFRESH = ["/auth/login", "/auth/2fa/verify", "/auth/refresh", "/auth/logout", "/auth/logout-all"];

export interface OpsiKlien {
    /** Dipanggil sekali saat sesi tak dapat dipulihkan — aplikasi mengarahkan ke Login. */
    readonly onSesiBerakhir: () => void;
    /** Dipanggil setelah refresh berhasil — `/me` dimuat ulang (SDD-11 §4.3). */
    readonly onSesiDisegarkan?: () => void;
}

type ConfigUlang = InternalAxiosRequestConfig & { _sudahDiulang?: boolean };

export function buatKlien(opsi: OpsiKlien): AxiosInstance {
    const klien = axios.create({ baseURL: BASE_API, withCredentials: true, headers: { Accept: "application/json" } });
    let refreshBersama: Promise<void> | null = null;

    const segarkan = (): Promise<void> => {
        refreshBersama ??= klien
            .post("/auth/refresh", {}, { _sudahDiulang: true } as ConfigUlang)
            .then(() => opsi.onSesiDisegarkan?.())
            .finally(() => {
                refreshBersama = null;
            });
        return refreshBersama;
    };

    klien.interceptors.response.use(undefined, async (galat: AxiosError) => {
        const cfg = galat.config as ConfigUlang | undefined;
        if (galat.response === undefined) throw new GalatJaringan();
        const { status, data, headers } = galat.response;
        const jalur = cfg?.url ?? "";
        if (status === 401 && cfg !== undefined && cfg._sudahDiulang !== true && !TANPA_REFRESH.some((j) => jalur.startsWith(j))) {
            try {
                await segarkan();
            } catch {
                opsi.onSesiBerakhir();
                throw dariRespons(status, data, (n) => headers[n] as string | undefined);
            }
            return klien.request({ ...cfg, _sudahDiulang: true } as ConfigUlang);
        }
        throw dariRespons(status, data, (n) => headers[n] as string | undefined);
    });
    return klien;
}

/** Hanya `data` dari amplop sukses Bab 17.1. */
export async function ambilData<T>(janji: Promise<{ data: { data: T } }>): Promise<T> {
    return (await janji).data.data;
}

export { ApiError, GalatJaringan };
