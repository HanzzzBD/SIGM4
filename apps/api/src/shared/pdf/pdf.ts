// Pembangkit PDF sistem (SDD-FS-12): HTML+CSS cetak dirender Playwright (Chromium). Dipakai label
// QR (`PR-03-02`, NFR-P-07) dan kelak berita acara (FR-13.3, FR-21.2).
//
// Dirender SINKRON di proses API (keputusan 2 log phase-03): jalur worker + `stored_files` menunggu
// `PR-03-04`. Batasnya SDD-PERF-06 (≤ 5 detik) — diukur, bukan diasumsikan.

import { chromium } from "playwright-core";

export interface PembangkitPdf {
    /** HTML berdiri sendiri (tanpa sumber daya luar) → PDF A4 (NFR-C-07). */
    render(html: string): Promise<Buffer>;
}

const HEADER_CHROMIUM = "%PDF-1.4";
const HEADER_WAJIB = "%PDF-1.7";

/**
 * NFR-C-07: Chromium (Skia) menulis header PDF 1.4. Isi 1.4 adalah subset sah PDF 1.7, dan
 * kedua header sama panjang sehingga offset tabel xref tidak bergeser (keputusan 2 log phase-03).
 */
export function keHeaderPdf17(pdf: Buffer): Buffer {
    if (pdf.subarray(0, HEADER_CHROMIUM.length).toString("latin1") !== HEADER_CHROMIUM) return pdf;
    const salinan = Buffer.from(pdf);
    salinan.write(HEADER_WAJIB, 0, "latin1");
    return salinan;
}

export class PembangkitPdfChromium implements PembangkitPdf {
    /**
     * `executablePath` = `CHROMIUM_EXECUTABLE_PATH` (image Alpine: Chromium dari apk). `null` →
     * Chrome terpasang (`channel: "chrome"`) — mesin dev dan runner CI.
     */
    constructor(private readonly executablePath: string | null) {}

    async render(html: string): Promise<Buffer> {
        // Satu browser per permintaan: tanpa keadaan bersama antar-pengguna, dan memori dilepas
        // begitu PDF selesai (host padat, SDD-16 §4.2).
        const browser = await chromium.launch(this.executablePath === null ? { channel: "chrome" } : { executablePath: this.executablePath });
        try {
            // HTML memuat teks masukan pengguna (nama aset): JavaScript dimatikan dan seluruh
            // permintaan jaringan diputus — halaman hanya boleh merender dirinya sendiri.
            const context = await browser.newContext({ javaScriptEnabled: false });
            await context.route("**/*", (route) => route.abort());
            const page = await context.newPage();
            await page.setContent(html, { waitUntil: "load" });
            return keHeaderPdf17(await page.pdf({ format: "A4", preferCSSPageSize: true, printBackground: true }));
        } finally {
            await browser.close();
        }
    }
}
