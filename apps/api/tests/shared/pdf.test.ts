// shared/pdf (SDD-FS-12, NFR-C-07; PR-03-02): header PDF 1.7 tanpa menggeser offset xref.

import { describe, expect, it } from "vitest";
import { keHeaderPdf17 } from "../../src/shared/pdf/index.js";

describe("keHeaderPdf17 (NFR-C-07)", () => {
    it("%PDF-1.4 keluaran Chromium → %PDF-1.7, panjang & sisa byte identik; masukan tidak dimutasi", () => {
        const asli = Buffer.from("%PDF-1.4\n%\xe2\xe3\n1 0 obj\nxref 0 9\n%%EOF", "latin1");
        const hasil = keHeaderPdf17(asli);
        expect(hasil.subarray(0, 8).toString("latin1")).toBe("%PDF-1.7");
        expect(hasil.length).toBe(asli.length);
        expect(hasil.subarray(8).equals(asli.subarray(8))).toBe(true);
        expect(asli.subarray(0, 8).toString("latin1")).toBe("%PDF-1.4");
    });

    it("header lain dibiarkan apa adanya — bukan PDF Chromium, tidak ditebak", () => {
        const lain = Buffer.from("%PDF-1.5\nisi", "latin1");
        expect(keHeaderPdf17(lain)).toBe(lain);
    });
});
