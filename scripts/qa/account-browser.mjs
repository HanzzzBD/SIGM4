// Build web first. Browser HTTP fixtures; no real DB/Redis/object storage/AV claim.
/* global document, innerWidth */
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { resolve, extname } from "node:path";
import assert from "node:assert/strict";
import { chromium } from "playwright-core";
const root = resolve("apps/web/dist/app");
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".woff2": "font/woff2" };
const server = createServer(async (req, res) => { try {
    const path = new URL(req.url, "http://localhost").pathname;
    const file = path.startsWith("/assets/") ? resolve(root, `.${path}`) : resolve(root, "index.html");
    assert(file.startsWith(root)); res.setHeader("Content-Type", types[extname(file)] ?? "application/octet-stream"); res.end(await readFile(file));
} catch { res.writeHead(404).end(); } });
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const base = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
    browser = await chromium.launch({ channel: "chrome", headless: true });
    const results = [];
    for (const width of [320, 768, 1024, 1440]) {
        const context = await browser.newContext({ viewport: { width, height: 900 } });
        const page = await context.newPage(); const errors = []; const log = [];
        let nama = "Petugas Sarana Prasarana Sekolah"; let foto = null; let backup = 2; let issued = false;
        const request = { id: "8", pemohon: { id: "21", nama: "Siti Guru Wali Kelas", email: "siti.wali.kelas@example.test", nip_nis: "123", role_kode: "R-05" }, status: "MENUNGGU", metode_verifikasi: null, diminta_pada: "2026-10-12T01:00:00Z", diproses_pada: null, kedaluwarsa_pada: null, alasan_penolakan: null };
        page.on("pageerror", (error) => errors.push(error.message));
        await page.route("**/profile-upload", async (route) => { assert.equal(route.request().headers().authorization, undefined); assert.equal(route.request().headers().cookie, undefined); log.push("PUT storage"); await route.fulfill({ status: 200 }); });
        await page.route("**/api/v1/**", async (route) => {
            const path = new URL(route.request().url()).pathname.replace("/api/v1", ""); const method = route.request().method(); log.push(`${method} ${path}`);
            let data = []; let meta = null; let status = 200;
            if (path === "/me") { if (method === "PUT") { nama = route.request().postDataJSON().nama; if (route.request().postDataJSON().foto_file_id) foto = "PENDING"; } data = { user: { id: "1", nama, email: "petugas@example.test", telepon: null, role_kode: "R-02", must_change_password: false, foto_status: foto, foto_url: null }, permissions: { "dashboard.view": "all", "user.reset_password": "all" } }; }
            if (path === "/auth/password/forgot") { data = { message: "Permintaan diterima" }; status = 202; }
            if (path === "/auth/2fa/status") data = { aktif: true, diaktifkan_pada: "2026-10-01T00:00:00Z", sisa_kode_cadangan: backup, kode_cadangan_menipis: backup <= 2 };
            if (path === "/auth/2fa/backup-codes/regenerate") { backup = 10; data = { kode_cadangan: Array.from({ length: 10 }, (_, i) => `BACKUP-${i}-SECRET`) }; }
            if (path === "/auth/sessions") data = ["WEB", "ANDROID"].map((platform, i) => ({ id: `00000000-0000-4000-8000-00000000000${i + 1}`, platform, saat_ini: i === 0, ip: "127.0.0.1", user_agent: i ? "Android School Phone" : "Chrome Desktop School", dibuat_pada: "2026-10-01T00:00:00Z", terakhir_diperbarui: "2026-10-12T00:00:00Z", berlaku_sampai: "2026-11-01T00:00:00Z" }));
            if (path === "/auth/password/requests") { data = [{ ...request, status: issued ? "DITERBITKAN" : "MENUNGGU" }]; meta = { total: 1, total_pages: 1 }; }
            if (path.endsWith("/issue")) { issued = true; data = { password_sementara: "TEMP-SECRET-ONCE-123", permintaan: { ...request, status: "DITERBITKAN", kedaluwarsa_pada: "2026-10-15T01:00:00Z" } }; }
            if (path === "/files/presign") data = { file_id: "9", upload_url: `${base}/profile-upload` };
            if (path === "/files/confirm") data = { file_id: "9", scan_status: "PENDING" };
            await route.fulfill({ status, contentType: "application/json", body: JSON.stringify({ success: true, data, meta }) });
        });
        const overflow = async (label) => assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${label} overflow at ${width}`);
        await page.goto(`${base}/lupa-password`); await page.getByLabel("Email", { exact: false }).fill("unknown@example.test"); await page.getByRole("button", { name: "Ajukan reset password" }).click(); await page.getByText(/Permintaan diterima/).waitFor(); await overflow("P04");
        await page.goto(`${base}/profil`); await page.getByLabel("Nama", { exact: false }).fill("Petugas Sekolah Baru");
        await page.getByLabel(/Foto profil/).setInputFiles({ name: "foto.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aLxQAAAAASUVORK5CYII=", "base64") });
        await page.getByRole("button", { name: "Simpan profil" }).click(); await page.getByText("Profil tersimpan.").waitFor(); assert(log.includes("PUT storage")); await overflow("P76");
        await page.goto(`${base}/profil/keamanan#perangkat`); await page.getByText(/Kode cadangan menipis/).waitFor(); await overflow("P77/P79");
        await page.getByRole("button", { name: "Buat ulang kode cadangan" }).click(); const dialog = page.getByRole("dialog"); await dialog.waitFor(); await overflow("2fa modal"); await dialog.getByRole("button", { name: "Buat kode baru" }).click(); await page.getByText("BACKUP-0-SECRET", { exact: true }).waitFor(); await page.getByRole("button", { name: "Saya sudah menyimpan kode" }).click(); assert.equal(await page.getByText("BACKUP-0-SECRET", { exact: true }).count(), 0);
        await page.getByRole("button", { name: "Cabut sesi ANDROID" }).click(); await dialog.getByRole("button", { name: "Batal", exact: true }).click(); assert(!log.some((l) => l.startsWith("DELETE")));
        await page.goto(`${base}/permintaan-reset-password`); await page.getByText("Siti Guru Wali Kelas", { exact: true }).waitFor(); await overflow("P67");
        await page.getByRole("button", { name: "Terbitkan password", exact: true }).click(); await dialog.getByLabel("Metode verifikasi identitas").selectOption("KARTU_IDENTITAS_TATAP_MUKA"); await dialog.getByRole("button", { name: "Terbitkan password", exact: true }).click(); await page.getByLabel("Password sementara", { exact: true }).waitFor(); await overflow("password once"); await page.getByRole("button", { name: "Saya sudah menyerahkan password" }).click(); assert.equal(await page.getByLabel("Password sementara", { exact: true }).count(), 0);
        if (width === 320 && process.argv.includes("--screenshots")) { await mkdir("tmp/pr-02-40-42", { recursive: true }); await page.screenshot({ path: "tmp/pr-02-40-42/reset-320.png", fullPage: true }); }
        assert.deepEqual(errors, []); results.push({ width, forgot: "pass", profilePhoto: "pass", security: "pass", devices: "pass", reset: "pass", overflow: false }); await context.close();
    }
    process.stdout.write(`${JSON.stringify({ scope: "production browser fixtures; no real backend/services", results }, null, 2)}\n`);
} finally { await browser?.close(); await new Promise((done) => server.close(done)); }
