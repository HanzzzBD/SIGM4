// Uji gerbang SCA berpengecualian (SDD-SEC-13, ST-02). Dijalankan job `sca` CI:
//     node --test scripts/sca-gerbang.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { nilai } from "./sca-gerbang.mjs";

const GHSA = "GHSA-86w9-cpqp-85rv";
const PATH = "node_modules/node-forge";
const audit = (o = {}) => ({
    vulnerabilities: {
        "node-forge": {
            nodes: [o.path ?? PATH],
            fixAvailable: o.fix ?? { name: "expo", version: "54.0.38", isSemVerMajor: true },
            via: [{ source: 1, title: "uji", severity: o.severity ?? "high", url: `https://github.com/advisories/${o.ghsa ?? GHSA}` }],
        },
        // Paket turunan: `via` berupa string, bukan advisory — tidak dihitung dua kali.
        "expo": { nodes: ["node_modules/expo"], fixAvailable: true, via: ["node-forge"] },
    },
});
const entri = (o = {}) => ({ ghsa: GHSA, paket: "node-forge", path: [PATH], alasan: "tanpa tambalan", disetujui: "uji", dicatat: "2026-10-24", tinjau_ulang: "2026-11-23", ...o });

test("tanpa pengecualian, High menggagalkan", () => {
    assert.equal(nilai(audit(), [], "2026-10-24").pelanggaran.length, 1);
});

test("pengecualian yang cocok meloloskan dan dilaporkan", () => {
    const r = nilai(audit(), [entri()], "2026-10-24");
    assert.deepEqual(r.pelanggaran, []);
    assert.equal(r.dikecualikan.length, 1);
});

test("GHSA sama pada path lain tetap gagal", () => {
    assert.equal(nilai(audit({ path: "node_modules/x/node_modules/node-forge" }), [entri()], "2026-10-24").pelanggaran.length, 1);
});

test("tinjau ulang terlewati gagal", () => {
    assert.match(nilai(audit(), [entri()], "2026-11-24").pelanggaran.join(), /kedaluwarsa/);
});

test("jendela High > 30 hari gagal (ST-02)", () => {
    assert.match(nilai(audit(), [entri({ tinjau_ulang: "2026-11-24" })], "2026-10-24").pelanggaran.join(), /> 30 hari/);
});

test("jendela Critical > 7 hari gagal (ST-02)", () => {
    assert.match(nilai(audit({ severity: "critical" }), [entri({ tinjau_ulang: "2026-11-01" })], "2026-10-24").pelanggaran.join(), /> 7 hari/);
});

test("tambalan tanpa versi mayor tersedia membatalkan pengecualian", () => {
    assert.match(nilai(audit({ fix: true }), [entri()], "2026-10-24").pelanggaran.join(), /tambalan tersedia/);
    assert.match(nilai(audit({ fix: { name: "node-forge", version: "1.4.1", isSemVerMajor: false } }), [entri()], "2026-10-24").pelanggaran.join(), /tambalan tersedia/);
});

test("entri tak cocok hanya peringatan", () => {
    const r = nilai({ vulnerabilities: {} }, [entri()], "2026-10-24");
    assert.deepEqual(r.pelanggaran, []);
    assert.equal(r.peringatan.length, 1);
});

test("entri tidak sah menggagalkan", () => {
    const r = nilai({ vulnerabilities: {} }, [entri({ ghsa: "bukan", path: [], alasan: " ", tinjau_ulang: "23-11-2026" })], "2026-10-24");
    assert.equal(r.pelanggaran.length, 4);
});

test("moderate tidak digerbang", () => {
    assert.deepEqual(nilai(audit({ severity: "moderate" }), [], "2026-10-24").pelanggaran, []);
});
