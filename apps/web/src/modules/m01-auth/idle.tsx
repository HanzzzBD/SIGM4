// Auto-logout web (FR-01.2 A2, F-01; SDD-11 §4.8, keputusan 85b). Aktivitas = input
// pengguna di tab SIGM4 mana pun, disinkronkan antar-tab lewat `localStorage` + event
// `storage`; permintaan latar (polling, refresh token) TIDAK dihitung. Banner menit ke-28,
// logout menit ke-30.

import { useEffect, useRef, useState } from "react";
import { Peringatan, Tombol } from "../../shared/ui/primitives";

export const KUNCI_AKTIVITAS = "sigm4.aktivitas-terakhir";
export const PERINGATAN_IDLE = 28 * 60_000;
export const BATAS_IDLE = 30 * 60_000;
/** Penulisan ke storage dijarangkan; ketelitian 5 detik cukup untuk ambang dalam menit. */
const JEDA_CATAT = 5_000;
const EVENT_AKTIVITAS = ["pointerdown", "keydown", "scroll", "touchstart"] as const;

export type KeadaanIdle = "AKTIF" | "PERINGATAN" | "HABIS";

export function keadaanIdle(terakhir: number, sekarang: number): KeadaanIdle {
    const diam = sekarang - terakhir;
    return diam >= BATAS_IDLE ? "HABIS" : diam >= PERINGATAN_IDLE ? "PERINGATAN" : "AKTIF";
}

function bacaBersama(): number | null {
    try {
        const v = Number(window.localStorage.getItem(KUNCI_AKTIVITAS));
        return Number.isFinite(v) && v > 0 ? v : null;
    } catch {
        return null;
    }
}

function tulisBersama(waktu: number): void {
    try {
        window.localStorage.setItem(KUNCI_AKTIVITAS, String(waktu));
    } catch {
        /* storage dinonaktifkan: berlaku per tab saja */
    }
}

/** `onHabis` dipanggil sekali saat 30 menit tanpa aktivitas di tab mana pun. */
export function useSesiIdle(onHabis: () => void): { readonly peringatan: boolean; readonly lanjutkan: () => void } {
    const terakhir = useRef(Date.now());
    const habis = useRef(onHabis);
    habis.current = onHabis;
    const [keadaan, setKeadaan] = useState<KeadaanIdle>("AKTIF");

    const catat = (paksa: boolean) => {
        const kini = Date.now();
        if (!paksa && kini - terakhir.current < JEDA_CATAT) return;
        terakhir.current = kini;
        tulisBersama(kini);
        setKeadaan("AKTIF");
    };

    useEffect(() => {
        catat(true);
        let selesai = false;
        const onInput = () => catat(false);
        const onStorage = (e: StorageEvent) => {
            if (e.key !== KUNCI_AKTIVITAS || e.newValue === null) return;
            const v = Number(e.newValue);
            if (Number.isFinite(v) && v > terakhir.current) terakhir.current = v;
        };
        const periksa = () => {
            if (selesai) return;
            terakhir.current = Math.max(terakhir.current, bacaBersama() ?? 0);
            const k = keadaanIdle(terakhir.current, Date.now());
            setKeadaan(k);
            if (k === "HABIS") {
                selesai = true;
                habis.current();
            }
        };
        for (const e of EVENT_AKTIVITAS) window.addEventListener(e, onInput, { capture: true, passive: true });
        window.addEventListener("storage", onStorage);
        const t = setInterval(periksa, 1_000);
        return () => {
            clearInterval(t);
            for (const e of EVENT_AKTIVITAS) window.removeEventListener(e, onInput, { capture: true });
            window.removeEventListener("storage", onStorage);
        };
        // Dipasang sekali per shell; `catat` hanya menyentuh ref dan setter yang stabil.
    }, []);

    return { peringatan: keadaan === "PERINGATAN", lanjutkan: () => catat(true) };
}

/** Banner sesi akan berakhir (UX NAVIGATION: banner global, `FR-01.2 A2`). */
export function BannerSesiIdle({ onLanjutkan }: { readonly onLanjutkan: () => void }) {
    return (
        <div className="px-4 pt-4">
            <Peringatan
                varian="info"
                judul="Sesi Anda akan segera berakhir"
                aksi={
                    <div>
                        <Tombol varian="secondary" onClick={onLanjutkan}>
                            Lanjutkan
                        </Tombol>
                    </div>
                }
            >
                Tidak ada aktivitas selama 28 menit. Anda akan keluar otomatis dalam 2 menit.
            </Peringatan>
        </div>
    );
}
