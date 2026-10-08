## PR

`PR-02-39` — patch pendahulu dependency untuk gerbang SCA
Phase: [phase-02.md](../phases/phase-02.md) · Kompleksitas: `S`

Cabang lokal: `chore/PR-02-39-dependency-security`, setelah [pendahulu skema](PR-02-39-schema.md). Perubahan terpisah dipilih pemilik produk pada 8 Oktober 2026; belum PR GitHub.

## Yang dikerjakan

Lockfile awal mematok proxy-addr 2.0.7 (Critical: pemalsuan IP lewat IPv4-mapped IPv6 trust subnet) dan source-map-js 1.2.1 (High: denial of service melalui offset section source map). Memperbarui tepat dua paket transitive ke proxy-addr 2.0.8 dan source-map-js 1.2.2; tidak mengubah manifest atau dependency parser PDF fitur.

## Requirement yang dilayani

| ID | Berkas | Bagian yang dipenuhi |
|---|---|---|
| CD-02 | [Deployment](../../PRD/03-architecture/deployment-ops.md) | Gerbang SCA tanpa High/Critical |

## Keputusan desain yang diterapkan

| ID | Berkas |
|---|---|
| SDD-SEC-11 | [CI](../../../.github/workflows/ci.yml) | Audit dependency sebelum merge |

## Perubahan skema

- [x] Tidak ada perubahan skema
- [ ] Ada — jenis: `—`
  - Migration naik: —
  - Migration turun teruji: —
  - Kompatibel mundur satu versi: ya; hanya lockfile patch release.

## Pengujian

| Jenis | Yang diuji |
|---|---|
| Unit | Regresi API dan Web pada stack fitur setelah patch; hasil di draf fitur |
| Integrasi | HTTP, worker/storage dan PDF pada stack fitur |
| Otorisasi (termasuk kasus penolakan) | Rantai keamanan HTTP yang sama diuji pada stack fitur |
| Konkurensi | Tidak ada perubahan logika konkurensi |
| SCA | `npm audit --audit-level=high` exit 0: 0 High/Critical; 3 Moderate existing (uuid/ExcelJS/gaxios) |

**Uji yang gagal bila patch dicabut:** `npm audit --audit-level=high` kembali gagal karena dua advisory berikut.

## Definition of Done

- [ ] Pipeline hijau (CD-01); CI remote belum dijalankan.
- [x] Unit test logika bisnis + integration test endpoint — tidak ada kode bisnis; regresi stack fitur.
- [x] Otorisasi diuji termasuk penolakan — tidak mengubah kontrak; regresi stack fitur.
- [x] Activity log — tidak ada operasi domain.
- [x] Endpoint mendeklarasikan permission — tidak ada endpoint.
- [x] Repository menerima AuthContext — tidak ada repository.
- [x] OpenAPI diperbarui — tidak berubah.
- [x] Tidak ada TODO maupun data uji pada jalur produksi.

## Tinjauan arsitek

- [x] Tidak diperlukan untuk patch lockfile; skema tetap ditinjau pada pendahulu migration.
- [ ] Diperlukan — menyentuh: `—`

## Rollback

Revert commit lockfile mengembalikan dua versi lama dan temuan SCA; utamakan forward fix.

## Catatan untuk peninjau

Kedua temuan terbukti sudah ada di commit dasar, tidak berasal dari PDF.js. Patch kecil dan kompatibel rentang dependency yang ada. Advisory: [proxy-addr](https://github.com/advisories/GHSA-jqcg-44mw-7w3h), [source-map-js](https://github.com/advisories/GHSA-68fv-2mgg-jv7q). Temuan Moderate yang membutuhkan perubahan lain tidak termasuk keputusan patch ini.
