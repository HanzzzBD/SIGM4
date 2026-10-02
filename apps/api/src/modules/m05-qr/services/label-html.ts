// HTML cetak label QR (FR-05.1 langkah 3; PR-03-02, keputusan 2 log phase-03) — dirender ke PDF oleh
// `shared/pdf` (SDD-FS-12). Satuan mm adalah ukuran FISIK kertas label, bukan token antarmuka
// (DS-P-07 mengatur komponen layar). Seluruh teks pengguna di-escape: HTML ini dibuka Chromium.

import { svgQr, urlQrAset } from "../../../shared/qr/index.js";

/**
 * Tiga preset lembar A4 (210×297 mm), dipilih pemilik produk. Label memenuhi lembar tanpa margin;
 * QR terkecil 20 mm = batas minimum AC FR-05.1 (2×2 cm, koreksi galat M).
 */
export const TATA_LETAK = {
    A4_3X8: { kolom: 3, baris: 8, lebarMm: 70, tinggiMm: 37.125, qrMm: 25 },
    A4_4X10: { kolom: 4, baris: 10, lebarMm: 52.5, tinggiMm: 29.7, qrMm: 20 },
    A4_2X5: { kolom: 2, baris: 5, lebarMm: 105, tinggiMm: 59.4, qrMm: 40 },
} as const;

export type KodeTataLetak = keyof typeof TATA_LETAK;

/** Elemen opsional label (FR-05.1 langkah 3). "Nama sekolah" ditunda — belum ada sumbernya (keputusan 2). */
export interface ElemenLabel {
    readonly kodeAset: boolean;
    readonly nama: boolean;
}

export interface IsiLabel {
    readonly uuid: string;
    readonly kodeAset: string;
    readonly nama: string;
}

const ENTITAS: Readonly<Record<string, string>> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const escapeHtml = (teks: string): string => teks.replace(/[&<>"']/g, (c) => ENTITAS[c]!);

export function htmlLabel(dasarQr: string, label: readonly IsiLabel[], kode: KodeTataLetak, elemen: ElemenLabel): string {
    const t = TATA_LETAK[kode];
    const sel = label.map((l) => {
        const teks = [elemen.kodeAset ? `<div class="kode">${escapeHtml(l.kodeAset)}</div>` : "", elemen.nama ? `<div class="nama">${escapeHtml(l.nama)}</div>` : ""].join("");
        return `<div class="label"><div class="qr">${svgQr(urlQrAset(dasarQr, l.uuid))}</div>${teks === "" ? "" : `<div class="teks">${teks}</div>`}</div>`;
    });
    // Satu `.lembar` per halaman A4: baris label tidak pernah terbelah oleh pemisah halaman.
    const perLembar = t.kolom * t.baris;
    const lembar: string[] = [];
    for (let i = 0; i < sel.length; i += perLembar) lembar.push(`<div class="lembar">${sel.slice(i, i + perLembar).join("")}</div>`);
    // Teks berskala dengan tinggi label agar ketiga preset tetap terbaca tanpa tumpang-tindih.
    const hurufMm = (t.tinggiMm / 10).toFixed(2);
    return `<!doctype html><html lang="id"><head><meta charset="utf-8"><style>
@page{size:A4;margin:0}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:sans-serif;color:#000;background:#fff}
.lembar{width:210mm;height:297mm;overflow:hidden;break-after:page;display:grid;grid-template-columns:repeat(${String(t.kolom)},${String(t.lebarMm)}mm);grid-auto-rows:${String(t.tinggiMm)}mm}
.lembar:last-child{break-after:auto}
.label{display:flex;align-items:center;gap:2mm;padding:2mm;overflow:hidden;break-inside:avoid}
.qr{flex:none;width:${String(t.qrMm)}mm;height:${String(t.qrMm)}mm}
.qr svg{display:block;width:100%;height:100%}
.teks{min-width:0;font-size:${hurufMm}mm;line-height:1.2}
.kode{font-weight:bold;word-break:break-all}
.nama{display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
</style></head><body>${lembar.join("")}</body></html>`;
}
