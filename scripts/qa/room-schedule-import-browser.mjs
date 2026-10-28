/* global window, document */
import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import assert from "node:assert/strict";
import { chromium } from "playwright-core";
const root = resolve("apps/web/dist/app");
const server = createServer(async (request, response) => {
    const pathname = new URL(request.url, "http://localhost").pathname;
    const file = pathname.startsWith("/assets/") ? resolve(root, `.${pathname}`) : resolve(root, "index.html");
    if (!file.startsWith(root + sep)) { response.statusCode = 403; response.end(); return; }
    try { response.setHeader("Content-Type", ({ ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml" })[extname(file)] ?? "application/octet-stream"); response.end(await readFile(file)); }
    catch { response.statusCode = 404; response.end(); }
});
await new Promise(done => server.listen(0, "127.0.0.1", done));
const results = [], success = data => ({ success: true, data, meta: null });
let browser;
try {
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE_PATH ?? (process.platform === "win32" ? "C:/Program Files/Google/Chrome/Application/chrome.exe" : undefined), headless: true });
    for (const width of [320, 768, 1024, 1440]) for (const state of ["upload", "expired", "forbidden"]) {
        const context = await browser.newContext({ viewport: { width, height: 1000 } }), page = await context.newPage(), errors = [], writes = [];
        let polls = 0;
        const job = { id: "12", nama_berkas: "jadwal-kelas.csv", status: "SELESAI", total: 201, terproses: 201, sukses: 200, gagal: 1, laporan_gagal: [{ baris: 202, kode_ruangan: "RUANG-KODE-PANJANG", pesan: "Jadwal beririsan dengan reservasi. Sesuaikan jam atau hari pada berkas koreksi.", data: { kode_ruangan: "RUANG-KODE-PANJANG", hari: "Senin" } }], pesan_galat: null, selesai_pada: "2026-10-15T03:00:00Z", dibuat_pada: "2026-10-15T03:00:00Z", report_expires_at: state === "expired" ? "2026-01-01T00:00:00Z" : "2099-01-01T00:00:00Z", report_expired: state === "expired" };
        page.on("pageerror", e => errors.push(e.message));
        await page.route("**/api/v1/**", async route => {
            const request = route.request(), endpoint = new URL(request.url()).pathname.replace("/api/v1", ""); let data, status = 200;
            if (endpoint === "/me") data = success({ user: { id: "1", nama: "Petugas Sarpras", email: "petugas@sekolah.test", telepon: null, role_kode: "R-02", must_change_password: false }, permissions: state === "forbidden" ? { "reservation.view": "all" } : { "reservation.view": "all", "reservation.fixed_schedule": "all" } });
            else if (endpoint === "/rooms/availability") data = success({ dari: "2027-09-05T17:00:00Z", sampai: "2027-09-06T17:00:00Z", zona_waktu: "Asia/Jakarta", granularitas_menit: 30, jam_operasional: { hari: [1, 2, 3, 4, 5], mulai: "06:00", selesai: "18:00" }, hari_libur: [], ruangan: [{ id: "10", kode: "R-10", nama: "Kelas XI-A", jenis: "KELAS", kapasitas: 40, gedung: { id: "1", nama: "Gedung A" } }], slot: [] });
            else if (endpoint === "/room-fixed-schedules/import" && request.method() === "POST") { writes.push(request.postDataJSON()); status = 202; data = success({ ...job, status: "MENUNGGU", terproses: 0, sukses: 0, gagal: 0, laporan_gagal: [], selesai_pada: null, report_expires_at: null }); }
            else if (endpoint === "/room-fixed-schedules/import/12") { polls++; data = success(state === "upload" && polls === 1 ? { ...job, status: "BERJALAN", terproses: 1, sukses: 1, gagal: 0, laporan_gagal: [], selesai_pada: null, report_expires_at: null } : job); }
            else { status = 404; data = { success: false, error: { code: "NOT_FOUND", message: endpoint }, request_id: "qa" }; }
            await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data) });
        });
        const base = `http://127.0.0.1:${server.address().port}/kalender-ruangan?tanggal=2027-09-06&kelola=true`;
        await page.goto(base + (state === "upload" ? "" : "&impor=12")); await page.getByRole("heading", { name: "Kalender Ruangan", exact: true }).waitFor();
        if (state === "upload") {
            const input = page.getByLabel("Berkas jadwal tetap", { exact: true }); await input.setInputFiles({ name: "jadwal.csv", mimeType: "text/csv", buffer: Buffer.from("kode_ruangan,hari\nR-1,Senin") });
            const button = page.getByRole("button", { name: "Mulai impor jadwal", exact: true }); await button.focus(); await page.keyboard.press("Enter");
            await page.getByRole("button", { name: "Unduh berkas koreksi jadwal" }).waitFor(); assert.equal(writes.length, 1); assert.equal(writes[0].content_base64, Buffer.from("kode_ruangan,hari\nR-1,Senin").toString("base64"));
            assert.ok(page.url().includes("impor=")); await page.reload(); await page.getByText("jadwal-kelas.csv", { exact: true }).waitFor();
        } else if (state === "expired") {
            await page.getByText(/Retensi laporan 30 hari telah berakhir/).waitFor(); assert.equal(await page.getByText("jadwal-kelas.csv", { exact: true }).count(), 0); assert.equal(await page.getByRole("button", { name: "Unduh laporan jadwal" }).count(), 0);
        } else { assert.equal(await page.getByLabel("Berkas jadwal tetap", { exact: true }).count(), 0); assert.equal(polls, 0); }
        await page.addScriptTag({ path: resolve("node_modules/axe-core/axe.min.js") });
        const violations = await page.evaluate(async () => (await window.axe.run(document.querySelector("main"), { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] } })).violations.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.map(n => n.target) })));
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
        const item = { width, state, violations, overflow, errors }; results.push(item); await writeFile("tmp/pr0335-browser.json", JSON.stringify(results, null, 2));
        await page.screenshot({ path: `tmp/pr0335-${state}-${width}.png`, fullPage: true });
        assert.deepEqual(violations, [], JSON.stringify(item)); assert.equal(overflow, false, JSON.stringify(item)); assert.deepEqual(errors, []); await context.close();
    }
    console.log(`Passed ${results.length} schedule import browser cases including contrast, keyboard, polling and reload.`);
} finally { await browser?.close(); await new Promise(done => server.close(done)); }
