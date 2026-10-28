// Aliran notifikasi web (FR-17.1 langkah 1 & A4; SDD-NTF-01…05; UX F-23). SSE lebih dulu; tiga
// kegagalan beruntun tanpa satu pun koneksi terbuka → polling 60 detik, dan UI menjelaskan
// penurunannya. Server memutus koneksi terlama bila melebihi batas (NTF-03, `event: putus`):
// tab itu beralih ke polling dengan alasan dari server — menyambung ulang hanya akan memutus
// tab lain. Penghitung belum dibaca selalu dari server (NTF-05), tak pernah dihitung klien.

import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { BASE_API } from "../../shared/api";
import { KUNCI_NOTIFIKASI, PesanAliran, hitungBelumDibaca } from "./api";

/** SDD-NTF-01: ambang kegagalan dan selang polling. */
export const AMBANG_GAGAL_SSE = 3;
export const SELANG_POLLING_MS = 60_000;
/** Jeda sebelum menyambung ulang — sama dengan `retry:` yang dikirim server (RETRY_MS). */
const JEDA_SAMBUNG_MS = 5_000;

export interface KeadaanAliran {
    readonly unread: number | null;
    readonly mode: "sse" | "polling" | "menyambung";
    /** Penjelasan penurunan ke polling (UX F-23); `null` selama SSE sehat. */
    readonly alasan: string | null;
}

const AWAL: KeadaanAliran = { unread: null, mode: "menyambung", alasan: null };
/** Di luar awalan `notifications`: invalidasi daftar tak boleh mengembalikannya ke AWAL. */
const KUNCI_ALIRAN = ["notifications-aliran"] as const;

/** Keadaan aliran dibagikan lewat cache: lonceng menulisnya, P-13 membacanya. */
export const aliranQuery = queryOptions({ queryKey: KUNCI_ALIRAN, queryFn: () => AWAL, initialData: AWAL, staleTime: Number.POSITIVE_INFINITY });
export const useKeadaanAliran = (): KeadaanAliran => useQuery(aliranQuery).data;

/** Hitungan dari respons tandai-terbaca (server, NTF-05) — tanpa menunggu siaran berikutnya. */
export function aturPenghitung(qc: QueryClient, unread: number): void {
    qc.setQueryData<KeadaanAliran>(KUNCI_ALIRAN, (l) => ({ ...(l ?? AWAL), unread }));
}

export const ALASAN_GAGAL = "Koneksi real-time tidak tersedia di jaringan ini. Notifikasi diperbarui otomatis setiap 60 detik.";

/** Dipasang sekali per tab (di lonceng topbar shell). */
export function useAliranNotifikasi(): void {
    const qc = useQueryClient();
    useEffect(() => {
        let es: EventSource | null = null;
        let gagal = 0;
        let berhenti = false;
        let jeda: ReturnType<typeof setTimeout> | undefined;
        let polling: ReturnType<typeof setInterval> | undefined;
        const tulis = (p: Partial<KeadaanAliran>) => qc.setQueryData<KeadaanAliran>(KUNCI_ALIRAN, (l) => ({ ...(l ?? AWAL), ...p }));
        const segarkanDaftar = () => void qc.invalidateQueries({ queryKey: [...KUNCI_NOTIFIKASI, "list"] });
        // Lewat klien HTTP: 401 memicu refresh sesi bersama (SDD-FE-07) — penyebab tersering SSE gagal.
        const tarik = async () => {
            try {
                tulis({ unread: await hitungBelumDibaca() });
                segarkanDaftar();
            } catch {
                /* jaringan putus: banner luring yang menjelaskan; putaran berikutnya mencoba lagi */
            }
        };
        const kePolling = (alasan: string) => {
            es?.close();
            es = null;
            tulis({ mode: "polling", alasan });
            void tarik();
            polling = setInterval(() => void tarik(), SELANG_POLLING_MS);
        };
        const buka = () => {
            if (berhenti) return;
            if (typeof EventSource === "undefined") return kePolling(ALASAN_GAGAL);
            const sumber = new EventSource(`${BASE_API}/notifications/stream`, { withCredentials: true });
            es = sumber;
            sumber.onopen = () => {
                gagal = 0;
                tulis({ mode: "sse", alasan: null });
            };
            sumber.onmessage = (m: MessageEvent<string>) => {
                const p = PesanAliran.safeParse(JSON.parse(m.data));
                if (!p.success) return;
                tulis({ unread: p.data.unread_count });
                if (p.data.jenis === "notifikasi") segarkanDaftar();
            };
            sumber.addEventListener("putus", (m: MessageEvent<string>) => {
                let alasan = "Koneksi notifikasi dibuka di tempat lain.";
                try {
                    alasan = (JSON.parse(m.data) as { alasan?: string }).alasan ?? alasan;
                } catch {
                    /* alasan bawaan */
                }
                kePolling(`${alasan} Di tab ini notifikasi diperbarui setiap 60 detik.`);
            });
            sumber.onerror = () => {
                // Penyambungan otomatis peramban dimatikan: hitungan kegagalan milik kita.
                sumber.close();
                es = null;
                gagal += 1;
                if (gagal >= AMBANG_GAGAL_SSE) return kePolling(ALASAN_GAGAL);
                tulis({ mode: "menyambung" });
                void tarik().finally(() => {
                    if (!berhenti && polling === undefined) jeda = setTimeout(buka, JEDA_SAMBUNG_MS);
                });
            };
        };
        buka();
        return () => {
            berhenti = true;
            es?.close();
            clearTimeout(jeda);
            clearInterval(polling);
        };
    }, [qc]);
}
