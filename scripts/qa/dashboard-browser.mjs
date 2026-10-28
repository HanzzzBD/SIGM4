// Browser-only acceptance fixture; does not measure database/server aggregation.
// Run after npm run build --workspace @sigm4/web.
/* global document, requestAnimationFrame, innerWidth, getComputedStyle */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
import assert from "node:assert/strict";
import { chromium } from "playwright-core";

const root = resolve("apps/web/dist/app");
const source = Array.from({ length: 5000 }, (_, i) => ({ kondisi: ["BAIK", "RUSAK_RINGAN", "RUSAK_BERAT", "HILANG"][i % 4], status: ["TERSEDIA", "DIRESERVASI", "DIPINJAM", "DALAM_PERBAIKAN", "TIDAK_TERSEDIA"][i % 5] }));
const count = (key) => Object.fromEntries([...new Set(source.map((a) => a[key]))].map((v) => [v, source.filter((a) => a[key] === v).length]));
const cards = [
    { id: "total-aset", judul: "Total Aset", zona: 2, jenis: "KPI", berperiode: false, drilldown: "P-15" },
    { id: "ringkasan-aset", judul: "Ringkasan Aset", zona: 2, jenis: "KPI", berperiode: false, drilldown: "P-15" },
    { id: "aset-belum-berlabel-qr", judul: "Aset Belum Berlabel QR", zona: 2, jenis: "PERINGATAN", berperiode: false, drilldown: "P-24" },
    { id: "kondisi-aset", judul: "Kondisi Aset", zona: 3, jenis: "GRAFIK_DONAT", berperiode: false, drilldown: "P-15" },
    { id: "status-aset", judul: "Status Aset", zona: 3, jenis: "GRAFIK_BATANG", berperiode: false, drilldown: "P-15" },
];
const isi = { "total-aset": { total: source.length }, "ringkasan-aset": { total: source.length, total_nilai: 12500000000 }, "aset-belum-berlabel-qr": { jumlah: 1250 }, "kondisi-aset": { kondisi: count("kondisi") }, "status-aset": { status: count("status") } };
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".woff2": "font/woff2" };
const server = createServer(async (req, res) => {
    try {
        const path = new URL(req.url, "http://localhost").pathname;
        const file = path.startsWith("/assets/") ? resolve(root, `.${path}`) : resolve(root, "index.html");
        assert(file.startsWith(root));
        res.setHeader("Content-Type", types[extname(file)] ?? "application/octet-stream");
        res.end(await readFile(file));
    } catch { res.writeHead(404).end(); }
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
let browser;
try {
    browser = await chromium.launch({ channel: "chrome", headless: true });
    const measurements = [];
    for (const width of [320, 768, 1024, 1440]) {
        const context = await browser.newContext({ viewport: { width, height: 900 } });
        const page = await context.newPage();
        const errors = [];
        page.on("pageerror", (error) => errors.push(error.message));
        await page.route("**/api/v1/**", async (route) => {
            const path = new URL(route.request().url()).pathname.replace("/api/v1", "");
            const id = path.split("/cards/")[1];
            const data = path === "/me" ? { user: { id: "1", nama: "Petugas Sarpras", email: "qa@example.test", role_kode: "R-02", must_change_password: false, telepon: null }, permissions: { "dashboard.view": "all", "asset.view": "all", "asset.qr_print": "all" } } : path === "/dashboard" ? { templat: "R-02", kartu: cards } : id ? { id, rentang: null, diperbarui_pada: "2026-10-11T00:00:00Z", isi: isi[id] } : [];
            await new Promise((done) => setTimeout(done, 80));
            await route.fulfill({ contentType: "application/json", body: JSON.stringify({ success: true, data, meta: null }) });
        });
        await page.goto(`http://127.0.0.1:${server.address().port}/`);
        await page.waitForFunction(() => [...document.querySelectorAll("p")].filter((p) => p.textContent.startsWith("Diperbarui ")).length === 5);
        await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
        const result = await page.evaluate(() => ({ ms: Math.round(performance.now()), overflow: document.documentElement.scrollWidth > innerWidth, columns: getComputedStyle(document.querySelector("[data-dashboard-grid]")).gridTemplateColumns.split(" ").length, expanded: document.querySelector("details").open }));
        assert.equal(result.overflow, false, `overflow at ${width}`);
        // Repository desktop token starts at 1366px (85.375rem).
        assert.equal(result.columns, width >= 1366 ? 3 : width >= 768 ? 2 : 1);
        assert.equal(result.expanded, width >= 768);
        assert(result.ms <= 3000, `render ${result.ms}ms exceeds 3000ms`);
        if (width < 768) {
            await page.locator("summary").focus();
            await page.keyboard.press("Enter");
            assert(await page.locator("details").evaluate((el) => el.open));
        }
        assert.deepEqual(errors, []);
        measurements.push({ width, ...result });
        await context.close();
    }
    process.stdout.write(`${JSON.stringify({ scope: "production browser fixture; API latency 80ms/request; aggregation from 5000 synthetic assets; no real DB", measurements }, null, 2)}\n`);
} finally {
    await browser?.close();
    await new Promise((done) => server.close(done));
}
