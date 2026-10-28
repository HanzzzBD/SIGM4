// Gerbang cakupan CI (CD-02, NFR-M-03) — PR-00-17.
//
// Uji berkas dan uji integrasi dijalankan dalam SATU run agar cakupannya satu
// laporan gabungan: sebagian kode (koneksi DB, penerbitan nomor, outbox) hanya
// dapat dijalankan terhadap PostgreSQL nyata, sehingga mengukur uji berkas saja
// menarik angka turun atas kode yang sebenarnya teruji.
//
// Diturunkan dari konfigurasi integrasi, bukan dari konfigurasi uji berkas:
// berkas integrasi berbagi satu basis data dan tidak boleh berjalan paralel, dan
// uji berkas tetap benar bila ikut berjalan berurutan.
import { defineConfig, mergeConfig } from "vitest/config";
import integrasi from "./vitest.integration.config.js";

export default mergeConfig(
    integrasi,
    defineConfig({
        test: {
            include: ["tests/**/*.test.ts"],
            coverage: {
                reporter: ["text-summary", "json-summary"],
                reportsDirectory: "./coverage-ci",
                // Keputusan pemilik produk 46: statements DAN lines digerbang;
                // branches dan functions dilaporkan tanpa ambang.
                thresholds: { statements: 70, lines: 70 },
            },
        },
    }),
);
