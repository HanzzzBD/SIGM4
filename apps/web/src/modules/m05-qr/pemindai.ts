// Pemindai kamera peramban (FR-05.2 langkah 1–2, NFR-C-05; C-25; keputusan 24f log phase-03: jsQR). Kamera
// belakang lewat `getUserMedia`; bingkai video dibaca ke canvas tiap ±250 md dan didekode jsQR yang dimuat
// MALAS (bundel halaman lain tak menanggungnya, NFR-P-03). Izin ditolak / tak didukung → keadaan yang
// menyerahkan ke input kode manual (FR-05.2 A4, MOB-MED-06) — bukan layar buntu.

import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";

export type KeadaanKamera = "meminta" | "aktif" | "ditolak" | "tidak-didukung";

/** Selang dekode: cukup cepat untuk terasa seketika, cukup jarang untuk perangkat lemah. */
const SELANG_DEKODE = 250;

export function usePemindai(video: RefObject<HTMLVideoElement | null>, jeda: boolean, onIsi: (isi: string) => void): KeadaanKamera {
    const [keadaan, setKeadaan] = useState<KeadaanKamera>("meminta");
    // Penangan terbaru tanpa menyalakan ulang kamera tiap render.
    const penangan = useRef(onIsi);
    penangan.current = onIsi;
    useEffect(() => {
        if (jeda) return;
        if (navigator.mediaDevices?.getUserMedia === undefined) {
            setKeadaan("tidak-didukung");
            return;
        }
        let berhenti = false;
        let aliran: MediaStream | null = null;
        let pewaktu: ReturnType<typeof setInterval> | undefined;
        const kanvas = document.createElement("canvas");
        void (async () => {
            try {
                aliran = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
            } catch {
                if (!berhenti) setKeadaan("ditolak");
                return;
            }
            if (berhenti) return aliran.getTracks().forEach((t) => t.stop());
            const v = video.current;
            if (v !== null) {
                v.srcObject = aliran;
                await v.play().catch(() => undefined);
            }
            setKeadaan("aktif");
            const { default: jsQR } = await import("jsqr");
            pewaktu = setInterval(() => {
                const el = video.current;
                const ctx = kanvas.getContext("2d", { willReadFrequently: true });
                if (el === null || ctx === null || el.videoWidth === 0) return;
                kanvas.width = el.videoWidth;
                kanvas.height = el.videoHeight;
                ctx.drawImage(el, 0, 0, kanvas.width, kanvas.height);
                const citra = ctx.getImageData(0, 0, kanvas.width, kanvas.height);
                const kode = jsQR(citra.data, citra.width, citra.height, { inversionAttempts: "dontInvert" });
                if (kode !== null && kode.data !== "") penangan.current(kode.data);
            }, SELANG_DEKODE);
        })();
        return () => {
            berhenti = true;
            clearInterval(pewaktu);
            aliran?.getTracks().forEach((t) => t.stop());
        };
    }, [jeda, video]);
    return keadaan;
}
