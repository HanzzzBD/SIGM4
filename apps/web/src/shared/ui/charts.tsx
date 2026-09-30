// Grafik SVG milik sendiri (DSD-10, keputusan 83): batang horizontal, donat, garis. Seri
// memakai urutan accent tetap (FOUNDATIONS §1.2) sebagai FILL/garis data — bukan teks.
// Setiap grafik membawa legenda teks DAN tabel data alternatif bagi pembaca layar (C-23,
// NFR-AC-04); visual SVG sendiri `aria-hidden`.

import { SERI_GRAFIK } from "./tokens/tokens";

export interface Titik {
    readonly label: string;
    readonly nilai: number;
}

const warna = (i: number): string => `var(--color-${SERI_GRAFIK[i % SERI_GRAFIK.length] ?? "accent-gray"})`;
const angka = new Intl.NumberFormat("id-ID");

function TabelData({ judul, data, kolom }: { readonly judul: string; readonly data: readonly Titik[]; readonly kolom: string }) {
    return (
        <table className="sr-only">
            <caption>{judul}</caption>
            <thead>
                <tr>
                    <th scope="col">{kolom}</th>
                    <th scope="col">Jumlah</th>
                </tr>
            </thead>
            <tbody>
                {data.map((t) => (
                    <tr key={t.label}>
                        <th scope="row">{t.label}</th>
                        <td>{angka.format(t.nilai)}</td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
}

function Legenda({ data }: { readonly data: readonly Titik[] }) {
    return (
        <ul aria-hidden="true" className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-text-primary">
            {data.map((t, i) => (
                <li key={t.label} className="flex items-center gap-2">
                    <svg viewBox="0 0 10 10" className="size-icon-sm">
                        <rect width="10" height="10" fill={warna(i)} />
                    </svg>
                    {t.label}: <span className="font-semibold tabular-nums">{angka.format(t.nilai)}</span>
                </li>
            ))}
        </ul>
    );
}

export function GrafikBatang({ judul, data, kolom }: { readonly judul: string; readonly data: readonly Titik[]; readonly kolom: string }) {
    const maks = Math.max(1, ...data.map((t) => t.nilai));
    return (
        <figure className="flex flex-col gap-3">
            <svg aria-hidden="true" viewBox={`0 0 100 ${String(data.length * 12)}`} preserveAspectRatio="none" className="h-auto w-full">
                {data.map((t, i) => (
                    <rect key={t.label} x="0" y={i * 12 + 2} height="8" width={(t.nilai / maks) * 100} fill={warna(i)} />
                ))}
            </svg>
            <Legenda data={data} />
            <TabelData judul={judul} data={data} kolom={kolom} />
        </figure>
    );
}

export function GrafikDonat({ judul, data, kolom }: { readonly judul: string; readonly data: readonly Titik[]; readonly kolom: string }) {
    const total = data.reduce((n, t) => n + t.nilai, 0);
    const keliling = 2 * Math.PI * 40;
    let sudah = 0;
    return (
        <figure className="flex flex-col gap-3">
            <svg aria-hidden="true" viewBox="0 0 100 100" className="size-full max-w-sm self-center">
                <circle cx="50" cy="50" r="40" fill="none" stroke="var(--color-neutral-100)" strokeWidth="16" />
                {total > 0 &&
                    data.map((t, i) => {
                        const panjang = (t.nilai / total) * keliling;
                        const busur = <circle key={t.label} cx="50" cy="50" r="40" fill="none" stroke={warna(i)} strokeWidth="16" strokeDasharray={`${String(panjang)} ${String(keliling)}`} strokeDashoffset={-sudah} transform="rotate(-90 50 50)" />;
                        sudah += panjang;
                        return busur;
                    })}
            </svg>
            <Legenda data={data} />
            <TabelData judul={judul} data={data} kolom={kolom} />
        </figure>
    );
}

export function GrafikGaris({ judul, data, kolom }: { readonly judul: string; readonly data: readonly Titik[]; readonly kolom: string }) {
    const maks = Math.max(1, ...data.map((t) => t.nilai));
    const langkah = data.length > 1 ? 100 / (data.length - 1) : 0;
    const titik = data.map((t, i) => `${String(i * langkah)},${String(40 - (t.nilai / maks) * 38)}`).join(" ");
    return (
        <figure className="flex flex-col gap-3">
            <svg aria-hidden="true" viewBox="0 0 100 40" preserveAspectRatio="none" className="h-auto w-full">
                <polyline points={titik} fill="none" stroke={warna(0)} strokeWidth="1" vectorEffect="non-scaling-stroke" />
            </svg>
            <p aria-hidden="true" className="text-sm text-text-secondary">
                {data.length > 0 ? `${data[0]?.label ?? ""} – ${data.at(-1)?.label ?? ""} · puncak ${angka.format(maks)}` : ""}
            </p>
            <TabelData judul={judul} data={data} kolom={kolom} />
        </figure>
    );
}
