/* global document, window */
import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import assert from "node:assert/strict";
import { chromium } from "playwright-core";
const root = resolve("apps/web/dist/app"), server = createServer(async (req, res) => {
    const path = new URL(req.url, "http://localhost").pathname, file = path.startsWith("/assets/") ? resolve(root, `.${path}`) : resolve(root, "index.html");
    if (!file.startsWith(root + sep)) { res.statusCode = 403; res.end(); return; }
    try { res.setHeader("Content-Type", ({ ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".woff2": "font/woff2", ".svg": "image/svg+xml" })[extname(file)] ?? "application/octet-stream"); res.end(await readFile(file)); }
    catch { res.statusCode = 404; res.end(); }
});
await new Promise(done => server.listen(0, "127.0.0.1", done));
const time = "2026-10-14T03:00:00Z", period = { tanggal_mulai: "2026-10-01", tanggal_selesai: "2026-10-14", jumlah_hari: 14 };
const column = (key, label, tipe = "TEXT") => ({ key, label, tipe, sensitivitas: "PUBLIC" });
const columns = [column("grup", "ID aset"), column("nama", "Aset"), column("kategori", "Kategori"), column("lokasi", "Lokasi"), column("jumlah", "Jumlah", "NUMBER")];
const response = { success: true, data: [{ grup: "11", nama: "Proyektor ruang pembelajaran", kategori: "Elektronik", lokasi: "Kelas 1", jumlah: 3 }, { grup: "12", nama: "Layar proyektor", kategori: "Elektronik", lokasi: "Kelas 1", jumlah: 1 }], meta: { page: 1, per_page: 25, total: 2, total_pages: 1 }, report: { jenis: "rekapitulasi-aset", judul: "Rekapitulasi Aset", periode: period, filter: { bandingkan: true }, zona_waktu: "Asia/Jakarta", dibuat_pada: time, kolom: columns, kolom_ringkasan: [columns[4]], ringkasan: { jumlah: 4 }, pembanding: { periode: { ...period, tanggal_mulai: "2026-09-17", tanggal_selesai: "2026-09-30" }, ringkasan: { jumlah: 3 } }, metodologi: ["Nilai dan pilihan filter mengikuti cakupan akses pengguna."] } };
const result = [], success = data => ({ success: true, data, meta: null });
let browser;
try {
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE_PATH ?? (process.platform === "win32" ? "C:/Program Files/Google/Chrome/Application/chrome.exe" : undefined), headless: true });
    for (const width of [320, 768, 1024, 1440]) for (const path of ["/analitik", "/analitik/rekapitulasi-aset", "/analitik/konsumsi-bahan", "/reservasi", "/kerusakan"]) {
        const context = await browser.newContext({ viewport: { width, height: 1100 } }), page = await context.newPage(), errors = [], posts = [];
        let jobs = [];
        page.on("pageerror", error => errors.push(error.message));
        await page.route("**/api/v1/**", async route => {
            const request = route.request(), endpoint = new URL(request.url()).pathname.replace("/api/v1", ""); let data;
            if (endpoint === "/me") data = success({ user: { id: "1", nama: "Petugas Uji", email: "uji@sekolah.test", telepon: null, role_kode: "R-01", must_change_password: false }, permissions: Object.fromEntries(["report.view", "report.export", "asset.view", "location.view", "reservation.view", "damage.view"].map(p => [p, "all"])) });
            else if (endpoint === "/analytics") data = success([{ jenis: "rekapitulasi-aset", judul: "Rekapitulasi Aset", status: "SIAP", filter: ["room_id", "category_id"], kolom: columns }, { jenis: "konsumsi-bahan", judul: "Konsumsi Bahan", status: "SIAP", filter: ["room_id", "category_id"], kolom: [column("grup","Grup"),column("bahan","Bahan"),column("satuan","Satuan"),column("jumlah","Jumlah","NUMBER")] }]);
            else if (endpoint.endsWith("/options")) data = success({ rooms: [{ id: "4", nama: "Kelas 1" }], categories: [{ id: "2", nama: "Elektronik" }], units: [], roles: [] });
            else if (endpoint === "/analytics/rekapitulasi-aset") data = response;
            else if (endpoint === "/analytics/konsumsi-bahan") data = { ...response, data: [{grup:"31",bahan:"Kertas A4",satuan:"rim",jumlah:5},{grup:"32",bahan:"Spidol",satuan:"pcs",jumlah:30}], report: {...response.report,jenis:"konsumsi-bahan",judul:"Konsumsi Bahan",kolom:[column("grup","Grup"),column("bahan","Bahan"),column("satuan","Satuan"),column("jumlah","Jumlah","NUMBER")]} };
            else if (endpoint === "/report-exports") data = success(jobs);
            else if (endpoint === "/rooms") data = { success: true, data: [], meta: { page: 1, per_page: 100, total: 0, total_pages: 0 } };
            else if (endpoint === "/reservations" || endpoint === "/damage-reports") data = { success: true, data: [], meta: { page: 1, per_page: 25, total: 0, total_pages: 0, jumlah_per_status: {} } };
            else if (endpoint.endsWith("/export")) { posts.push(request.postDataJSON()); const job = { id: "91", jenis: endpoint.startsWith("/reservations") ? "reservations" : endpoint.startsWith("/damage") ? "damage-reports" : endpoint.split("/")[2], judul: "Ekspor pengujian", format: "XLSX", status: "SIAP", jumlah_baris: 2, pesan_galat: null, dibuat_pada: time, selesai_pada: time, berlaku_sampai: "2026-10-15T03:00:00Z" }; jobs = [job]; data = success(job); }
            else { await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ success: false, error: { code: "NOT_FOUND", message: endpoint }, request_id: "test" }) }); return; }
            await route.fulfill({ status: endpoint.endsWith("/export") ? 202 : 200, contentType: "application/json", body: JSON.stringify(data) });
        });
        await page.goto(`http://127.0.0.1:${server.address().port}${path}`); await page.getByRole("heading", { level: 1 }).waitFor();
        if (path.includes("rekapitulasi")) { await page.getByRole("table").waitFor(); const checkbox = page.getByRole("checkbox", { name: "Bandingkan dengan periode sebelumnya" }); await checkbox.focus(); await page.keyboard.press("Space"); assert.equal(await checkbox.isChecked(), true); await page.getByRole("region", { name: "Tabel analitik, dapat digulir" }).focus(); assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("aria-label")), "Tabel analitik, dapat digulir"); }
        if (path.includes("konsumsi-bahan")) { await page.getByLabel("Satuan grafik").selectOption("pcs"); const chart = page.getByRole("region", {name:"Grafik laporan"}); await chart.getByText("Spidol").waitFor(); assert.equal(await chart.getByText("Kertas A4").count(),0); }
        if (path !== "/analitik") { await page.getByRole("button", { name: "Ekspor seluruh hasil filter" }).click(); await page.getByRole("button", { name: "Unduh XLSX #91" }).waitFor(); assert.equal(posts.length, 1); assert.equal("page" in posts[0].filter, false); }
        await page.addScriptTag({ path: resolve("node_modules/axe-core/axe.min.js") });
        const violations = await page.evaluate(async () => (await window.axe.run(document.querySelector("main"), { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] } })).violations.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.map(n => n.target) })));
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
        const overflowNodes = overflow ? await page.evaluate(() => [...document.querySelectorAll("main *")].filter(e => e.getBoundingClientRect().right > window.innerWidth + 1).slice(0,12).map(e => ({tag:e.tagName,classes:e.className,text:e.textContent?.slice(0,65),rect:{left:e.getBoundingClientRect().left,width:e.getBoundingClientRect().width}}))) : [];
        await page.screenshot({ path: `tmp/pr0608-${path.replaceAll("/", "-").slice(1)}-${width}.png`, fullPage: true });
        const item = { width, path, violations, overflow, errors, overflowNodes }; result.push(item); await writeFile("tmp/pr0608-browser.json", JSON.stringify(result, null, 2));
        assert.deepEqual(violations, [], JSON.stringify(item)); assert.equal(overflow, false, JSON.stringify(item)); assert.deepEqual(errors, []);
        await page.screenshot({ path: `tmp/pr0608-${path.replaceAll("/", "-").slice(1)}-${width}.png`, fullPage: true }); await context.close();
    }
    console.log(`Passed ${result.length} browser cases with axe including color contrast, keyboard and viewport checks.`);
} finally { await browser?.close(); await new Promise(done => server.close(done)); }
