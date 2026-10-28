## PR

`PR-02-38` — kontrak dan skema pendahulu impor aset
Phase: [phase-02.md](../phases/phase-02.md) · Kompleksitas: `M`

Cabang: `chore/PR-02-38-skema-impor-aset`, [PR #129](https://github.com/HanzzzBD/SIGM4/pull/129). Basis patch dependency terpisah `chore/PR-02-38-dependency-security`; fitur [PR #130](https://github.com/HanzzzBD/SIGM4/pull/130) digabung sesudah migration ini.

## Yang dikerjakan

Menyiapkan persistensi pekerjaan impor agar worker dapat melanjutkan baris tanpa membuat unit aset ganda. Migration expand menambahkan job, hitungan/progres/laporan dan relasi opsional pada aset; kontrak M-04, enum, SDD-DB-24 serta rujukan F-05 ditetapkan sebelum implementasi fitur sesuai tiga keputusan pemilik produk.

## Requirement yang dilayani

| ID | Berkas | Bagian yang dipenuhi |
|---|---|---|
| FR-04.1 AC 3, IMPT-01…05 | [M-04](../../PRD/02-modules/m04-assets.md) | Kontrak penerimaan, laporan, replay pengunggah 24 jam, notifikasi NT-55 |
| CD-04, CD-05 | [Delivery plan PRD](../../PRD/01-product/delivery-plan.md) | Expand dan rollback skema |

## Keputusan desain yang diterapkan

| ID | Berkas |
|---|---|
| SDD-DB-24, SDD-DB-01 | [SDD-05](../../SDD/05-database-design.md) |
| IMPT-03, IMPT-04 | [Lampiran E](../../PRD/00-foundation/conventions.md) |

## Perubahan skema

- [ ] Tidak ada perubahan skema
- [x] Ada — jenis: `expand`
  - Migration naik: `apps/api/migrations/0041_asset_import_jobs.sql`
  - Migration turun teruji: ya, PostgreSQL 18 nyata, DDL down/up dalam transaksi lalu rollback; record aset dipertahankan.
  - Kompatibel mundur satu versi (`CD-04`): ya; kolom aset baru nullable, tanpa backfill/contract.

## Pengujian

| Jenis | Yang diuji |
|---|---|
| Unit | Pemetaan enum Bab 11.3 dan konsistensi SQL migration melalui invariant suite API |
| Integrasi | `m04-import-schema.test.ts`: 3 uji termasuk penjaga lingkungan, constraint hitungan/terminal, down/up mempertahankan aset |
| Regresi rollback | `urutan-uji.test.ts`: 3 uji; jumlah rollback mengikuti migration yang diterapkan sejak 0039, lalu skema dipulihkan dalam finally. Bersama uji skema: 6/6 lulus pada database PostgreSQL 18 baru dengan 0041 |
| Otorisasi (termasuk kasus penolakan) | —; route berada pada PR fitur |
| Konkurensi | —; penguncian hash/cursor diuji pada PR fitur |

**Uji yang gagal bila logika ini dicabut:** `menolak hitungan dan status terminal yang tidak konsisten`.

## Definition of Done

- [ ] Pipeline hijau (`CD-01`); cakupan logika inti ≥70% (`CD-02`) — CI remote diulang setelah perbaikan rollback; SQL diuji integrasi.
- [x] Unit test logika bisnis + integration test endpoint (29.5) — invariant dan integrasi skema; endpoint pada PR fitur.
- [x] Otorisasi diuji termasuk kasus penolakan (29.5) — tidak ada endpoint pada pendahulu.
- [x] Uji acceptance & keamanan mengeksekusi kondisi; penjaga DATABASE_URL membuat suite gagal bila prasyarat hilang.
- [x] Activity log untuk operasi tulis (`AL-01`) — tidak ada operasi domain baru; implementasi pada fitur.
- [x] Endpoint mendeklarasikan permission (`PM-01`) — tidak ada endpoint baru pada pendahulu.
- [x] Repository menerima AuthContext (`SDD-AUTH-05`) — repository pada fitur.
- [x] OpenAPI diperbarui bila kontrak berubah (`NFR-M-05`) — kontrak PRD ditetapkan; generator pada fitur.
- [x] Tidak ada TODO maupun data uji pada jalur produksi (29.5).

## Tinjauan arsitek

- [ ] Tidak diperlukan
- [x] Diperlukan — menyentuh: `migration`
  Peninjau: PM-Codexpert — approve #131 pada head `f26d8bd` sebelum merge, diterima sebagai tinjauan arsitek (keputusan 64 log phase-02).

## Rollback

Revert fitur konsumen terlebih dahulu, kemudian jalankan down migration 0041. Record aset tetap ada; asosiasi job dan laporan impor dihapus. Pada rollout gagal, utamakan mempertahankan skema expand sambil mengembalikan kode konsumen.

## Catatan untuk peninjau

Pemisahan skema dipilih pemilik produk. Indeks replay diawali pengunggah; tidak ada unique hash permanen karena replay hanya berlaku 24 jam. Constraint mempertahankan jumlah baris terproses sebagai sukses + gagal, terpisah dari jumlah unit. Status terminal membersihkan binary unggahan. Perubahan audit closure yang sudah ada di working tree tidak dimasukkan ke commit pendahulu.

[CI pertama](https://github.com/HanzzzBD/SIGM4/actions/runs/37730094972) gagal pada satu uji rollback yang mengasumsikan dua migration terakhir menghapus asset_documents. Migration 0041 mengubah jumlah itu; perbaikan menghitung migration terpasang hingga 0039 dan tetap memulihkan skema bila pemeriksaan gagal. Patch dependency pendahulu menutup temuan proxy-addr Critical dan source-map-js High yang sudah ada pada basis. Karena basis PR bertumpuk bukan develop, workflow CI lengkap dijalankan melalui workflow_dispatch pada head terbaru.
