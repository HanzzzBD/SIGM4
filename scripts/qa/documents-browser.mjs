// Production browser smoke with HTTP fixtures; no PostgreSQL/MinIO/AV claim.
/* global document, innerWidth */
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { resolve, extname } from "node:path";
import assert from "node:assert/strict";
import { chromium } from "playwright-core";

const root = resolve("apps/web/dist/app");
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
const base = `http://127.0.0.1:${server.address().port}`;
const asset = { id: "12", uuid: "3f2b1c9a-1d2e-4f5a-8b6c-7d8e9f0a1b2c", kode_barang: "LAB-PRY-0012", nama: "Proyektor Aula Sekolah", kategori: { id: "3", nama: "Proyektor" }, merek: null, model: null, nomor_seri: null, tahun_perolehan: 2023, lokasi: { room_id: "10", ruang: "Aula", area: "Lantai 1", gedung: "Gedung A" }, kondisi: "BAIK", status: "TERSEDIA", dapat_dipinjam: true, boleh_dipinjam_siswa: false, penanggung_jawab: null, qr_url: "https://qa.example.test/a/3f2b1c9a-1d2e-4f5a-8b6c-7d8e9f0a1b2c", qr_terpasang: false, dihapuskan: false, tanggal_penghapusan: null, created_at: "2026-10-01T03:00:00Z" };
const doc = { id: "3", jenis: "GARANSI", nama_berkas: "Kartu-garansi-proyektor-laboratorium-komputer-tahun-2026.pdf", keterangan: "Garansi seluruh unit laboratorium komputer dan ruang kelas.", garansi_mulai: "2026-01-01", garansi_selesai: "2026-11-01", mime: "application/pdf", ukuran: 1024, scan_status: "CLEAN", diunggah_oleh: "1", diunggah_pada: "2026-10-01T02:00:00Z", jumlah_aset: 2 };
let browser;
try {
    browser = await chromium.launch({ channel: "chrome", headless: true });
    const results = [];
    for (const width of [320, 768, 1024, 1440]) {
        const context = await browser.newContext({ viewport: { width, height: 900 } });
        const page = await context.newPage();
        const errors = [];
        const calls = [];
        page.on("pageerror", (error) => errors.push(error.message));
        await context.route("**/fixture-upload", async (route) => {
            assert.equal(route.request().method(), "PUT");
            assert.equal(route.request().headers().authorization, undefined);
            assert.equal(route.request().headers().cookie, undefined);
            calls.push("PUT storage");
            await route.fulfill({ status: 200 });
        });
        await page.route("**/api/v1/**", async (route) => {
            const path = new URL(route.request().url()).pathname.replace("/api/v1", "");
            const method = route.request().method();
            calls.push(`${method} ${path}`);
            let data = [];
            let meta = null;
            if (path === "/me") data = { user: { id: "1", nama: "Petugas Sarana Prasarana", email: "qa@example.test", role_kode: "R-02", must_change_password: false, telepon: null }, permissions: { "dashboard.view": "all", "asset.view": "all", "asset_document.view": "all", "asset_document.manage": "all" } };
            if (path === "/asset-categories") data = [{ id: "3", parent_id: null, nama: "Proyektor" }];
            if (path === "/asset-documents") { data = [{ ...doc, aset: asset }, { ...doc, id: "4", nama_berkas: "Manual-penggunaan.pdf", scan_status: "PENDING", aset: asset }]; meta = { page: 1, per_page: 25, total: 2, total_pages: 1 }; }
            if (path === "/assets") data = [asset, { ...asset, id: "21", kode_barang: "LAB-PRY-0021", nama: "Proyektor Ruang Kelas" }];
            if (path === "/assets/12") data = asset;
            if (path === "/assets/12/documents") data = method === "GET" ? [doc] : { ...doc, scan_status: "PENDING" };
            if (path === "/files/presign") data = { upload_url: `${base}/fixture-upload`, file_id: "9" };
            if (path === "/files/confirm") { assert.match(route.request().postDataJSON().checksum, /^[0-9a-f]{64}$/); data = { file_id: "9", scan_status: "PENDING" }; }
            if (path === "/assets/12/documents/3") data = { dokumen_dihapus: false };
            await route.fulfill({ contentType: "application/json", body: JSON.stringify({ success: true, data, meta }) });
        });
        const overflow = async () => assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `overflow at ${width}`);
        await page.goto(`${base}/dokumen-aset`);
        await page.getByRole("heading", { name: doc.nama_berkas, exact: true }).waitFor();
        await overflow();
        assert(await page.getByRole("button", { name: /Unduh Manual/ }).isDisabled());
        await page.getByRole("button", { name: "Unggah Dokumen", exact: true }).focus();
        await page.keyboard.press("Enter");
        const form = page.getByRole("form", { name: "Unggah dokumen aset" });
        await form.getByLabel("Cari aset (nama atau kode)").fill("Proyektor");
        await form.getByRole("button", { name: "Cari aset", exact: true }).click();
        await form.getByRole("button", { name: "Pilih LAB-PRY-0012", exact: true }).click();
        await form.getByRole("button", { name: "Pilih LAB-PRY-0021", exact: true }).click();
        await form.getByLabel("Berkas dokumen", { exact: false }).setInputFiles({ name: "faktur.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.7 fixture") });
        await overflow();
        await form.getByRole("button", { name: "Simpan dokumen" }).click();
        await page.getByText("Dokumen tersimpan. Status pemeriksaan akan diperbarui otomatis.").waitFor();
        assert(calls.includes("PUT storage"));
        assert(calls.includes("POST /assets/12/documents"));
        await page.goto(`${base}/aset/12/dokumen`);
        await page.getByRole("heading", { name: doc.nama_berkas, exact: true }).waitFor();
        await overflow();
        await page.getByRole("button", { name: /Lepas Kartu-garansi/ }).click();
        await page.getByRole("dialog").waitFor();
        await overflow();
        const focused = await page.evaluate(() => document.querySelector('[role="dialog"]').contains(document.activeElement));
        assert(focused, "dialog focus must be inside modal");
        // Optional screenshot artifact for review: node ... --screenshots.
        if (process.argv.includes("--screenshots")) { await mkdir("tmp/pr-03-29", { recursive: true }); await page.screenshot({ path: `tmp/pr-03-29/dialog-${width}.png`, fullPage: true }); }
        await page.getByRole("dialog").getByRole("button", { name: "Batal", exact: true }).click();
        await page.waitForFunction(() => document.activeElement?.getAttribute("aria-label")?.startsWith("Lepas Kartu-garansi"));
        assert(!calls.some((c) => c.startsWith("DELETE")));
        assert.deepEqual(errors, []);
        results.push({ width, list: "pass", uploadMultiAsset: "pass", tab: "pass", dialogKeyboard: "pass", overflow: false });
        await context.close();
    }
    process.stdout.write(`${JSON.stringify({ scope: "production browser fixtures; no live DB/storage/AV", results }, null, 2)}\n`);
} finally { await browser?.close(); await new Promise((done) => server.close(done)); }
