// Zona 4 Aksi Cepat P-12 sebagai Tile Modul C-31 (DSD-13, UX §8.3). Sama dengan Beranda mobile (UXD-23):
// hanya aksi bergrup domain yang halamannya terdaftar di build ini dan permission-nya dipegang (PM-04);
// chatbot bukan tile — sudah ada panelnya dan tidak punya accent grup (keputusan 9 & 42 log phase-07).

import { HALAMAN_TERDAFTAR } from "../../shared/navigasi";
import type { NamaIkon } from "../../shared/ui/icon";
import type { AccentGrup } from "../../shared/ui/visual";

export interface AksiCepat {
    readonly label: string;
    readonly href: string;
    readonly ikon: NamaIkon;
    readonly accent: AccentGrup;
}

export function aksiCepat(can: (permission: string) => boolean, terdaftar: Readonly<Record<string, string>> = HALAMAN_TERDAFTAR): readonly AksiCepat[] {
    const daftar: readonly (AksiCepat & { readonly halaman: string; readonly boleh: boolean })[] = [
        { halaman: "P-25", boleh: can("asset.view") || can("material.view"), label: can("material.view") ? "Scan aset atau bahan" : "Scan aset", href: "", ikon: "pindai", accent: "accent-blue" },
        { halaman: "P-37", boleh: can("approval.decide"), label: "Persetujuan saya", href: "", ikon: "persetujuan", accent: "accent-green" },
        { halaman: "P-29", boleh: can("reservation.create"), label: "Ajukan reservasi", href: "", ikon: "reservasi", accent: "accent-green" },
        { halaman: "P-40", boleh: can("damage.create"), label: "Lapor kerusakan", href: "", ikon: "kerusakan", accent: "accent-yellow" },
    ];
    return daftar.flatMap((a) => {
        const path = terdaftar[a.halaman];
        return path === undefined || !a.boleh ? [] : [{ label: a.label, href: path, ikon: a.ikon, accent: a.accent }];
    });
}
