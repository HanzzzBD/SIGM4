// Serah-terima rahasia sekali tampil (FR-02.1 langkah 4–5, FR-01.3 A5, FR-01.5 A7; BR-070c). Hanya memori
// modul: tidak pernah masuk URL, `history.state`, cache query, maupun storage. Titipan dihapus begitu
// diambil, kedaluwarsa bila tak pernah diambil (navigasi gagal/ditinggalkan), dan seluruhnya dibuang saat
// sesi berakhir — sehingga muat ulang, Back/Forward, atau sesi berikutnya tidak pernah melihatnya lagi.

import type { QueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

/** Titipan yang tak diambil halaman tujuan dalam selang ini dianggap ditinggalkan. */
const UMUR_TITIPAN_MS = 30_000;

const titipan = new Map<string, { readonly rahasia: string; readonly timer: ReturnType<typeof setTimeout> }>();
/** Naik setiap sesi berakhir: aksi yang selesai sesudahnya tidak boleh menerbitkan rahasianya. */
let generasi = 0;

export function titipRahasia(kunci: string, rahasia: string): void {
    const lama = titipan.get(kunci);
    if (lama !== undefined) clearTimeout(lama.timer);
    titipan.set(kunci, { rahasia, timer: setTimeout(() => titipan.delete(kunci), UMUR_TITIPAN_MS) });
}

/**
 * Mengambil lalu menghapus titipan. Penghapusan ditunda ke tugas berikutnya: inisialisasi state yang
 * dijalankan ganda oleh StrictMode pada render yang sama tetap menerima nilai yang sama.
 */
export function ambilRahasia(kunci: string): string | null {
    const t = titipan.get(kunci);
    if (t === undefined) return null;
    setTimeout(() => {
        if (titipan.get(kunci) === t) {
            clearTimeout(t.timer);
            titipan.delete(kunci);
        }
    }, 0);
    return t.rahasia;
}

/** Membuang seluruh titipan dan membatalkan aksi yang masih berjalan. */
export function bersihkanRahasia(): void {
    generasi += 1;
    for (const t of titipan.values()) clearTimeout(t.timer);
    titipan.clear();
}

/** Keluar/sesi berakhir mengosongkan QueryClient: begitu `/me` terhapus, rahasia sesi itu ikut dibuang. */
export function ikatRahasiaKeSesi(queryClient: QueryClient): void {
    queryClient.getQueryCache().subscribe((e) => {
        if (e.type === "removed" && e.query.queryKey[0] === "me") bersihkanRahasia();
    });
}

/**
 * Pemanggil aksi yang hasilnya memuat rahasia. Bukan `useMutation`: hasil mutasi disimpan MutationCache
 * QueryClient selama `gcTime`, sedangkan rahasia hanya boleh hidup di state komponen yang menampilkannya.
 * Hasil yang tiba sesudah pemiliknya dilepas, atau sesudah sesi berakhir, dibuang (`undefined`).
 */
export function useAksiRahasia<A extends unknown[], T>(fn: (...a: A) => Promise<T>) {
    const [sibuk, setSibuk] = useState(false);
    const [galat, setGalat] = useState<unknown>(null);
    const terpasang = useRef(false);
    useEffect(() => {
        terpasang.current = true;
        return () => {
            terpasang.current = false;
        };
    }, []);
    async function jalankan(...a: A): Promise<T | undefined> {
        const awal = generasi;
        setSibuk(true);
        setGalat(null);
        try {
            const h = await fn(...a);
            return terpasang.current && generasi === awal ? h : undefined;
        } catch (e) {
            if (terpasang.current) setGalat(e);
            return undefined;
        } finally {
            if (terpasang.current) setSibuk(false);
        }
    }
    return { sibuk, galat, jalankan, reset: () => setGalat(null) };
}
