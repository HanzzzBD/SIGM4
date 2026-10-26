// Penggerak tur produk web (driver.js). Tur utama per role diputar otomatis sekali setelah
// login pertama; mini-tur halaman inti diputar otomatis saat halamannya pertama kali dibuka,
// setelah tur utama tuntas. Keduanya dapat diputar ulang dari menu akun dan tombol bantuan.
// Progres disimpan di server per akun (`/me/tours`) saat tur selesai atau dilewati.

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";
import { driver } from "driver.js";
import type { Driver } from "driver.js";
import "driver.js/dist/driver.css";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef } from "react";
import type { ReactNode } from "react";
import { useSesi } from "../auth";
import { KUNCI_TUR, perluDiputar, progresTurQuery, simpanProgresTur } from "./api";
import type { ProgresTur } from "./api";
import { VERSI_TUR, turHalaman, turUtama } from "./katalog";
import type { LangkahTur, Tur } from "./katalog";
import "./tour.css";

/**
 * Jeda sebelum tur otomatis: konten halaman dimuat asinkron, dan langkah yang elemennya belum
 * dirender akan dilewati. Tur yang diputar pengguna sendiri tidak menunggu.
 */
const JEDA_OTOMATIS_MS = 1200;

interface KendaliTur {
    readonly mulaiUtama: () => void;
    readonly mulaiHalaman: () => void;
    readonly adaTurHalaman: boolean;
}

const KonteksTur = createContext<KendaliTur | null>(null);

/** Elemen pertama yang cocok DAN terlihat; elemen tersembunyi (drawer tertutup, layar sempit) dilewati. */
function cariElemen(selektor: readonly string[]): Element | null {
    for (const s of selektor) {
        const el = document.querySelector(s);
        if (el !== null && el.getClientRects().length > 0) return el;
    }
    return null;
}

function susunLangkah(langkah: readonly LangkahTur[]) {
    return langkah.flatMap((l) => {
        if (l.elemen === undefined) return [{ popover: { title: l.judul, description: l.isi } }];
        const el = cariElemen(l.elemen);
        return el === null ? [] : [{ element: el, popover: { title: l.judul, description: l.isi } }];
    });
}

export function TourProvider({ children }: { readonly children: ReactNode }) {
    const sesi = useSesi();
    const path = useRouterState({ select: (s) => s.location.pathname });
    const queryClient = useQueryClient();
    const progres = useQuery(progresTurQuery);
    const aktif = useRef<{ readonly d: Driver; readonly kunci: string } | null>(null);

    const utama = useMemo(() => turUtama(sesi.user.role_kode, sesi.user.nama), [sesi.user.role_kode, sesi.user.nama]);
    const halaman = turHalaman(path);

    const simpan = useCallback(
        (kunci: string, status: ProgresTur["status"]) => {
            // Optimistis: tur tidak diputar ulang otomatis walau permintaan gagal; tur muncul lagi
            // pada sesi berikutnya bila memang tidak tersimpan.
            const sementara: ProgresTur = { kunci, status, versi: VERSI_TUR, diperbarui_pada: "" };
            queryClient.setQueryData<readonly ProgresTur[]>(KUNCI_TUR, (lama = []) => [...lama.filter((x) => x.kunci !== kunci), sementara]);
            simpanProgresTur(kunci, status, VERSI_TUR).catch(() => undefined);
        },
        [queryClient],
    );

    /** Satu-satunya jalan keluar tur: catat statusnya, lalu tutup tanpa memicu hook lagi. */
    const akhiri = useCallback(
        (status: ProgresTur["status"]) => {
            const a = aktif.current;
            if (a === null) return;
            aktif.current = null;
            simpan(a.kunci, status);
            a.d.destroy();
        },
        [simpan],
    );

    const putar = useCallback(
        (tur: Tur) => {
            if (aktif.current !== null) return;
            const langkah = susunLangkah(tur.langkah);
            if (langkah.length === 0) return;
            const d = driver({
                steps: langkah,
                showProgress: true,
                progressText: "{{current}} dari {{total}}",
                nextBtnText: "Lanjut",
                prevBtnText: "Kembali",
                doneBtnText: "Selesai",
                popoverClass: "tur-sigm4",
                // Tur tidak boleh memicu navigasi di tengah jalan lewat elemen yang disorot.
                disableActiveInteraction: true,
                animate: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches !== true,
                // Dipanggil untuk Selesai, tombol tutup, Esc, dan klik overlay. Menutup pada
                // langkah terakhir berarti seluruh isi tur sudah dilihat.
                onDestroyStarted: () => akhiri(d.isLastStep() ? "SELESAI" : "DILEWATI"),
            });
            aktif.current = { d, kunci: tur.kunci };
            d.drive();
        },
        [akhiri],
    );

    // Tur otomatis: utama lebih dulu; mini-tur halaman hanya setelah tur utama tuntas.
    useEffect(() => {
        if (!progres.isSuccess) return;
        const sasaran = perluDiputar(progres.data, utama.kunci, VERSI_TUR)
            ? utama
            : halaman !== undefined && perluDiputar(progres.data, halaman.kunci, VERSI_TUR)
              ? halaman
              : undefined;
        if (sasaran === undefined) return;
        const t = window.setTimeout(() => putar(sasaran), JEDA_OTOMATIS_MS);
        return () => window.clearTimeout(t);
    }, [progres.isSuccess, progres.data, utama, halaman, putar]);

    // Pindah halaman menutup tur yang masih berjalan (tercatat dilewati).
    useEffect(() => () => akhiri("DILEWATI"), [path, akhiri]);

    const kendali = useMemo<KendaliTur>(
        () => ({
            mulaiUtama: () => putar(utama),
            mulaiHalaman: () => {
                if (halaman !== undefined) putar(halaman);
            },
            adaTurHalaman: halaman !== undefined,
        }),
        [putar, utama, halaman],
    );

    return <KonteksTur.Provider value={kendali}>{children}</KonteksTur.Provider>;
}

export function useTour(): KendaliTur {
    const k = useContext(KonteksTur);
    if (k === null) throw new Error("useTour dipakai di luar TourProvider.");
    return k;
}
