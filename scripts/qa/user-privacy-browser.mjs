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
    try { response.setHeader("Content-Type", ({ ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".woff2": "font/woff2", ".svg": "image/svg+xml" })[extname(file)] ?? "application/octet-stream"); response.end(await readFile(file)); }
    catch { response.statusCode = 404; response.end(); }
});
await new Promise(done => server.listen(0, "127.0.0.1", done));
const results = [], success = data => ({ success: true, data, meta: null });
let browser;
try {
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE_PATH ?? (process.platform === "win32" ? "C:/Program Files/Google/Chrome/Application/chrome.exe" : undefined), headless: true });
    for (const width of [320, 768, 1024, 1440]) for (const path of ["/pengguna/5", "/pengguna/impor?job=8", "/aset/impor?job=8", "/pengguna/impor?job=9"]) {
        const context = await browser.newContext({ viewport: { width, height: 1100 } }), page = await context.newPage(), errors = [], writes = [];
        let erased = false;
        page.on("pageerror", error => errors.push(error.message));
        await page.route("**/api/v1/**", async route => {
            const request = route.request(), endpoint = new URL(request.url()).pathname.replace("/api/v1", ""); let data;
            if (endpoint === "/me") data = success({ user: { id: "1", nama: "Administrator Uji", email: "admin@sekolah.test", telepon: null, role_kode: "R-01", must_change_password: false }, permissions: { "user.view": "all", "user.update": "all", "user.create": "all", "asset.create": "all" } });
            else if (endpoint === "/users/5") data = success({ id: "5", nama: erased ? "Pengguna Terhapus #5" : "Bu Sari", email: erased ? "deleted+5@invalid.local" : "sari@sekolah.test", nip_nis: erased ? null : "12345", role_id: "5", work_unit_id: null, telepon: null, status: "NONAKTIF", must_change_password: false, login_terakhir_pada: null, consent_guardian_at: null, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-10-15T03:00:00Z", deactivated_at: "2026-10-15T03:00:00Z", pseudonymized_at: erased ? "2026-10-15T03:00:00Z" : null });
            else if (endpoint === "/users/5/pseudonymize") { writes.push(request.postDataJSON()); erased = true; data = success({ id: "5", pseudonymized_at: "2026-10-15T03:00:00Z" }); }
            else if (endpoint.startsWith("/users/import/") || endpoint.startsWith("/assets/import/")) {
                const active = endpoint.endsWith("/9");
                data = success({ id: active ? "9" : "8", nama_berkas: "identitas-pribadi.csv", status: "SELESAI", total: 3, terproses: 3, sukses: 2, gagal: 1, unit_dibuat: 2,
                    laporan_gagal: endpoint.startsWith("/users") ? [{ baris: 2, email: "alamat-email-panjang-untuk-memeriksa-tabel@sekolah.test", pesan: "Periksa data baris impor." }] : [{ baris: 2, nama_barang: "Data privat", pesan: "Periksa data baris impor.", data: {} }],
                    pesan_galat: null, selesai_pada: "2026-09-01T00:00:00Z", dibuat_pada: "2026-09-01T00:00:00Z", report_expired: !active, report_expires_at: active ? new Date(Date.now() + 86400000).toISOString() : "2026-10-01T00:00:00Z" });
            } else { await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ success: false, error: { code: "NOT_FOUND", message: endpoint }, request_id: "test" }) }); return; }
            await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(data) });
        });
        await page.goto(`http://127.0.0.1:${server.address().port}${path}`); await page.getByRole("heading", { level: 1 }).waitFor();
        await page.addScriptTag({ path: resolve("node_modules/axe-core/axe.min.js") });
        const scan = async selector => page.evaluate(async selector => (await window.axe.run(document.querySelector(selector), { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] } })).violations.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.map(n => n.target) })), selector);
        let violations;
        if (path === "/pengguna/5") {
            await page.getByRole("button", { name: "Pseudonimkan akun", exact: true }).click();
            await page.getByLabel("Referensi permintaan terverifikasi", { exact: false }).fill("DP-2026-001");
            await page.getByLabel("Alasan pseudonimisasi", { exact: false }).fill("Permintaan telah diverifikasi.");
            await page.getByLabel("Metode verifikasi identitas", { exact: false }).selectOption("KARTU_IDENTITAS_TATAP_MUKA");
            const ack = page.getByRole("checkbox", { name: /Saya memahami akun/ }); await ack.focus(); await page.keyboard.press("Space"); assert.equal(await ack.isChecked(), true);
            violations = await scan("main");
            await page.getByRole("button", { name: "Tinjau pseudonimisasi" }).click(); const dialog = page.getByRole("dialog"); await dialog.waitFor();
            violations.push(...await scan('[role="dialog"]')); assert.equal(writes.length, 0);
            await page.screenshot({ path: `tmp/pr0509-confirm-${width}.png`, fullPage: true });
            await dialog.getByRole("button", { name: "Pseudonimkan permanen" }).click(); await page.getByRole("heading", { name: "Pengguna Terhapus #5", level: 1 }).waitFor();
            assert.equal(writes.length, 1); assert.equal(await page.getByRole("button", { name: "Aktifkan", exact: true }).count(), 0);
            violations.push(...await scan("main"));
        } else {
            if (path.endsWith("8")) { await page.getByText(/Retensi laporan 30 hari telah berakhir/).waitFor(); assert.equal(await page.getByRole("button", { name: "Unduh laporan", exact: true }).count(), 0); assert.equal(await page.getByText("identitas-pribadi.csv", { exact: true }).count(), 0); }
            else await page.getByRole("button", { name: "Unduh laporan", exact: true }).waitFor();
            violations = await scan("main");
        }
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
        const item = { width, path, violations, overflow, errors }; results.push(item);
        await writeFile("tmp/pr0509-browser.json", JSON.stringify(results, null, 2));
        await page.screenshot({ path: `tmp/pr0509-${path.replaceAll("/", "-").replaceAll("?", "-").replaceAll("=", "-")}-${width}.png`, fullPage: true });
        assert.deepEqual(violations, [], JSON.stringify(item)); assert.equal(overflow, false, JSON.stringify(item)); assert.deepEqual(errors, []);
        await context.close();
    }
    console.log(`Passed ${results.length} privacy/import browser cases including contrast, keyboard and viewport checks.`);
} finally { await browser?.close(); await new Promise(done => server.close(done)); }
