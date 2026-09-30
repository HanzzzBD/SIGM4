// QR TOTP (SDD-11 §4.8, keputusan 85a): `uqr` hanya mengodekan; matriksnya dirender SVG
// milik sendiri dengan warna token — tanpa `innerHTML`, tanpa gambar dari pihak ketiga.
// URI memuat secret TOTP, jadi tidak pernah dikirim ke layanan pembuat QR di luar.

import { encode } from "uqr";

/** Satu `path` untuk seluruh modul gelap — ringan meski versi QR besar. */
export function jalurQr(data: readonly (readonly boolean[])[]): string {
    const bagian: string[] = [];
    data.forEach((baris, y) =>
        baris.forEach((gelap, x) => {
            if (gelap) bagian.push(`M${String(x)} ${String(y)}h1v1h-1z`);
        }),
    );
    return bagian.join("");
}

export function KodeQr({ isi, label }: { readonly isi: string; readonly label: string }) {
    // ECC M + zona tenang 4 modul: pembacaan andal dari layar (ISO/IEC 18004).
    const { size, data } = encode(isi, { ecc: "M", border: 4 });
    return (
        <svg role="img" aria-label={label} viewBox={`0 0 ${String(size)} ${String(size)}`} shapeRendering="crispEdges" className="w-sidebar max-w-full">
            <rect width={size} height={size} className="fill-surface-default" />
            <path d={jalurQr(data)} className="fill-neutral-900" />
        </svg>
    );
}
