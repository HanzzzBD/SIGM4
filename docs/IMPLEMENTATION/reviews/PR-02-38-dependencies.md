## PR

`PR-02-38` — patch dependency pendahulu untuk gerbang SCA
Phase: [phase-02.md](../phases/phase-02.md) · Kompleksitas: `S`

Cabang: `chore/PR-02-38-dependency-security`, basis `develop`. Patch terpisah yang sudah dipilih produk dimajukan sebelum migration PR-02-38 agar kedua PR impor dapat melewati SCA tanpa menunggu fitur PDF.

## Yang dikerjakan

Memperbarui tepat dua paket transitive pada lockfile: proxy-addr 2.0.7 → 2.0.8 dan source-map-js 1.2.1 → 1.2.2. Versi lama sudah menghasilkan temuan Critical/High pada basis; manifest dan dependency lain tetap. Tidak ada perubahan API atau perilaku impor.

## Requirement yang dilayani

| ID | Berkas | Bagian yang dipenuhi |
|---|---|---|
| CD-02 | [Deployment](../../PRD/03-architecture/deployment-ops.md) | Gerbang SCA tanpa High/Critical |

## Keputusan desain yang diterapkan

| ID | Berkas |
|---|---|
| SDD-SEC-11 | [CI](../../../.github/workflows/ci.yml) |

## Perubahan skema

- [x] Tidak ada perubahan skema.
- [ ] Ada — jenis: `—`
  - Migration naik/turun: —
  - Kompatibel mundur satu versi: ya, patch release dua dependency yang sudah ada.

## Pengujian

| Jenis | Yang diuji |
|---|---|
| Unit | Tidak ada kode bisnis baru; regresi stack impor melalui CI |
| Integrasi | Regresi stack impor dan pendahulu melalui CI |
| Otorisasi (termasuk kasus penolakan) | Kontrak tidak berubah; regresi HTTP pada CI |
| Konkurensi | Tidak berubah |
| SCA | `npm audit --audit-level=high` lulus: 0 High/Critical; tiga Moderate pada dependency yang sudah ada |

**Uji yang gagal bila patch dicabut:** gerbang SCA kembali menolak dua advisory High/Critical.

## Definition of Done

- [ ] Pipeline hijau (CD-01); CI remote menjadi bukti sebelum merge.
- [x] Unit/integration test — tidak ada kode baru; suite regresi yang sudah ada.
- [x] Otorisasi — tidak mengubah permission atau middleware.
- [x] Activity log/endpoint/repository/OpenAPI — tidak ada perubahan domain.
- [x] Tidak ada TODO atau fixture pada jalur produksi.

## Tinjauan arsitek

- [x] Tidak diperlukan untuk patch lockfile.
- [ ] Diperlukan — `—`; migration tetap ditinjau pada PR pendahulu impor.

## Rollback

Revert commit patch mengembalikan dua versi rentan dan temuan SCA; utamakan forward fix.

## Catatan untuk peninjau

User memilih patch dependency terpisah saat implementasi PR-02-39. CI impor dipublikasikan dahulu, sehingga patch yang sama kini menjadi pendahulu PR-02-38. Urutan merge: patch dependency → migration 0041 → fitur impor. Advisory: [proxy-addr](https://github.com/advisories/GHSA-jqcg-44mw-7w3h), [source-map-js](https://github.com/advisories/GHSA-68fv-2mgg-jv7q).
