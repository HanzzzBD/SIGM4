// Gerbang SCA seluruh pohon dependensi (ST-02, CD-02) — pengganti `npm audit --audit-level=high`.
//
// Setiap advisory High/Critical menggagalkan pipeline, KECUALI tercatat pada
// .github/sca-pengecualian.json (SDD-SEC-13). Pengecualian dikunci ke pasangan GHSA +
// path paket persis, sehingga advisory yang sama pada salinan paket lain tetap
// menggagalkan. Pengecualian ikut gagal bila:
//   - tanggal tinjau ulang terlewati, atau jendelanya melebihi batas tambal ST-02
//     (High ≤ 30 hari, Critical ≤ 7 hari sejak dicatat);
//   - tambalan tanpa naik versi mayor sudah tersedia (`fixAvailable`).
// Entri yang tidak lagi cocok dengan temuan apa pun hanya diperingatkan.
//
//     node scripts/sca-gerbang.mjs                 # menjalankan npm audit --json
//     node scripts/sca-gerbang.mjs audit.json      # membaca laporan yang sudah ada
//
// SCA_HARI_INI=YYYY-MM-DD menggantikan tanggal hari ini (uji).

import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const TINGKAT = new Set(["high", "critical"]);
// ST-02: Critical ditambal ≤ 7 hari, High ≤ 30 hari.
const BATAS_HARI = { critical: 7, high: 30 };
const TANGGAL = /^\d{4}-\d{2}-\d{2}$/;

const ghsaDari = (url) => url?.match(/GHSA-[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{4}/i)?.[0] ?? null;
const selisihHari = (dari, ke) => Math.round((Date.parse(`${ke}T00:00:00Z`) - Date.parse(`${dari}T00:00:00Z`)) / 86_400_000);

/** Tambalan dapat dipasang tanpa naik versi mayor sebuah dependensi langsung. */
function tambalanTersedia(fixAvailable) {
    if (fixAvailable === true) return true;
    return typeof fixAvailable === "object" && fixAvailable !== null && fixAvailable.isSemVerMajor === false;
}

/**
 * @param {object} audit laporan `npm audit --json` (format npm ≥ 7)
 * @param {Array<object>} daftar entri pengecualian
 * @param {string} hariIni YYYY-MM-DD (UTC)
 */
export function nilai(audit, daftar, hariIni) {
    const pelanggaran = [];
    const peringatan = [];
    const dikecualikan = [];

    for (const [i, e] of daftar.entries()) {
        const nama = `pengecualian #${i + 1} (${e.ghsa ?? "tanpa GHSA"})`;
        if (!ghsaDari(e.ghsa) || e.ghsa !== ghsaDari(e.ghsa)) pelanggaran.push(`${nama}: ghsa tidak sah`);
        if (!Array.isArray(e.path) || e.path.length === 0) pelanggaran.push(`${nama}: path kosong`);
        if (!TANGGAL.test(e.dicatat ?? "") || !TANGGAL.test(e.tinjau_ulang ?? "")) pelanggaran.push(`${nama}: dicatat/tinjau_ulang bukan YYYY-MM-DD`);
        if (!e.alasan?.trim() || !e.disetujui?.trim()) pelanggaran.push(`${nama}: alasan dan disetujui wajib diisi`);
    }

    const terpakai = new Set();
    for (const v of Object.values(audit.vulnerabilities ?? {})) {
        const advisories = (v.via ?? []).filter((x) => typeof x === "object" && TINGKAT.has(x.severity));
        for (const adv of advisories) {
            const ghsa = ghsaDari(adv.url) ?? adv.url ?? String(adv.source);
            for (const path of v.nodes ?? []) {
                const label = `${ghsa} ${adv.severity.toUpperCase()} ${path} — ${adv.title}`;
                const i = daftar.findIndex((e) => e.ghsa === ghsa && e.path?.includes(path));
                if (i < 0) { pelanggaran.push(`tidak dikecualikan: ${label}`); continue; }
                terpakai.add(i);
                const e = daftar[i];
                const batas = BATAS_HARI[adv.severity];
                if (hariIni > e.tinjau_ulang) pelanggaran.push(`pengecualian kedaluwarsa ${e.tinjau_ulang}: ${label}`);
                else if (selisihHari(e.dicatat, e.tinjau_ulang) > batas) pelanggaran.push(`jendela pengecualian > ${batas} hari (ST-02): ${label}`);
                else if (tambalanTersedia(v.fixAvailable)) pelanggaran.push(`tambalan tersedia, pengecualian tidak berlaku lagi: ${label}`);
                else dikecualikan.push(`${label} (tinjau ulang ${e.tinjau_ulang})`);
            }
        }
    }
    daftar.forEach((e, i) => { if (!terpakai.has(i)) peringatan.push(`pengecualian tidak cocok dengan temuan apa pun, hapus: ${e.ghsa} ${(e.path ?? []).join(", ")}`); });
    return { pelanggaran, peringatan, dikecualikan };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const berkas = process.argv[2];
    let audit;
    if (berkas) audit = JSON.parse(readFileSync(berkas, "utf8"));
    else {
        // npm audit keluar ≠ 0 bila ada temuan; laporannya tetap di stdout.
        const r = spawnSync("npm", ["audit", "--json"], { encoding: "utf8", shell: process.platform === "win32", maxBuffer: 256 * 1024 * 1024 });
        if (!r.stdout?.trim()) { console.error("npm audit tidak menghasilkan laporan:", r.stderr); process.exit(2); }
        audit = JSON.parse(r.stdout);
    }
    if (audit.error) { console.error("npm audit gagal:", JSON.stringify(audit.error)); process.exit(2); }
    const daftar = JSON.parse(readFileSync(new URL("../.github/sca-pengecualian.json", import.meta.url), "utf8")).pengecualian;
    const hariIni = process.env.SCA_HARI_INI ?? new Date().toISOString().slice(0, 10);
    const { pelanggaran, peringatan, dikecualikan } = nilai(audit, daftar, hariIni);
    for (const d of dikecualikan) console.log(`  dikecualikan  ${d}`);
    for (const p of peringatan) console.log(`::warning::${p}`);
    for (const p of pelanggaran) console.error(`  GAGAL  ${p}`);
    if (pelanggaran.length) { console.error(`${pelanggaran.length} pelanggaran SCA High/Critical (CD-02).`); process.exit(1); }
    console.log(`Tidak ada High/Critical di luar pengecualian (${dikecualikan.length} dikecualikan, ${hariIni}).`);
}
