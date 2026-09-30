// Lima keadaan layar sebagai komponen bersama (SDD-FE-09, UX §7.3, 31.5): memuat, kosong,
// galat, tanpa akses, luring. Setiap keadaan selain memuat WAJIB menawarkan aksi berikutnya
// (UX-05). Galat server menampilkan `request_id` yang dapat disalin, tanpa detail teknis
// (NFR-R-10). Tanpa akses tidak pernah mengonfirmasi keberadaan data (SDD-AUTH-08).

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { ApiError, GalatJaringan } from "../api";
import { Ikon } from "../ui/icon";
import type { NamaIkon } from "../ui/icon";
import { Kerangka, Tombol } from "../ui/primitives";

export { Kerangka as KeadaanMemuat };

function Blok({ ikon, judul, children, aksi }: { readonly ikon: NamaIkon; readonly judul: string; readonly children?: ReactNode; readonly aksi?: ReactNode }) {
    return (
        <div className="flex flex-col items-center gap-3 px-4 py-16 text-center">
            <span className="text-icon-muted">
                <Ikon nama={ikon} ukuran="lg" />
            </span>
            <h2 className="text-lg font-semibold text-text-heading">{judul}</h2>
            {children !== undefined && <div className="max-w-prose text-base text-text-secondary">{children}</div>}
            {aksi}
        </div>
    );
}

/** C-21: ikon + satu kalimat + tombol aksi berikutnya. */
export function KeadaanKosong({ judul, pesan, aksi }: { readonly judul: string; readonly pesan: string; readonly aksi?: ReactNode }) {
    return (
        <Blok ikon="info" judul={judul} aksi={aksi}>
            {pesan}
        </Blok>
    );
}

function SalinRequestId({ id }: { readonly id: string }) {
    const [tersalin, setTersalin] = useState(false);
    return (
        <p className="flex flex-wrap items-center justify-center gap-2 text-sm text-text-secondary">
            Kode rujukan: <code className="font-mono text-text-primary">{id}</code>
            <Tombol
                varian="tertiary"
                ikon="salin"
                onClick={() => {
                    void navigator.clipboard?.writeText(id).then(() => setTersalin(true));
                }}
            >
                {tersalin ? "Tersalin" : "Salin"}
            </Tombol>
        </p>
    );
}

/** Galat: pesan yang dapat dimengerti + `request_id` + "Coba lagi" (31.5). */
export function KeadaanGalat({ galat, onCobaLagi }: { readonly galat: unknown; readonly onCobaLagi: () => void }) {
    const luring = galat instanceof GalatJaringan;
    const pesan = galat instanceof ApiError || luring ? (galat as Error).message : "Terjadi gangguan pada sistem. Coba lagi beberapa saat lagi.";
    return (
        <Blok ikon={luring ? "luring" : "galat"} judul={luring ? "Tidak tersambung" : "Data tidak dapat dimuat"} aksi={<Tombol varian="secondary" ikon="muatUlang" onClick={onCobaLagi}>Coba lagi</Tombol>}>
            <p>{pesan}</p>
            {galat instanceof ApiError && galat.requestId !== null && <SalinRequestId id={galat.requestId} />}
        </Blok>
    );
}

/** Tanpa akses (P-08): menjelaskan pembatasan tanpa menyebut apakah datanya ada. */
export function KeadaanTanpaAkses({ aksi }: { readonly aksi: ReactNode }) {
    return (
        <Blok ikon="tanpaAkses" judul="Akses dibatasi" aksi={aksi}>
            Anda tidak memiliki hak akses untuk halaman ini. Hubungi Administrator bila Anda memerlukannya.
        </Blok>
    );
}

/** Status koneksi peramban (NO-07) — satu sumber bagi banner dan tombol yang menuntut koneksi. */
export function useDaring(): boolean {
    const [daring, setDaring] = useState(() => typeof navigator === "undefined" || navigator.onLine);
    useEffect(() => {
        const naik = () => setDaring(true);
        const turun = () => setDaring(false);
        window.addEventListener("online", naik);
        window.addEventListener("offline", turun);
        return () => {
            window.removeEventListener("online", naik);
            window.removeEventListener("offline", turun);
        };
    }, []);
    return daring;
}

/** Banner koneksi putus di bawah topbar (C-04): `role="alert"`, persisten. */
export function BannerLuring() {
    if (useDaring()) return null;
    return (
        <div role="alert" className="flex min-h-control-md items-center gap-2 bg-warning-subtle px-4 text-sm text-warning-strong">
            <Ikon nama="luring" />
            Koneksi terputus. Aksi yang memerlukan server dinonaktifkan sampai koneksi pulih — coba lagi setelah tersambung.
        </div>
    );
}
