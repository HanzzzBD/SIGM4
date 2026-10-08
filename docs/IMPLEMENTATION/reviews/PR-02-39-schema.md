## PR

`PR-02-39` — kontrak dan skema pendahulu impor aset
Phase: [phase-02.md](../phases/phase-02.md) · Kompleksitas: `S`

Cabang lokal: `chore/PR-02-39-skema-berita-acara-mutasi`. Digabung lebih dahulu; fitur berada di cabang bertumpuk `feature/PR-02-39-berita-acara-mutasi`. Belum dipublikasikan sebagai PR GitHub.

## Yang dikerjakan

Menetapkan kontrak satu PDF per operasi mutasi dan persistensi snapshot transaksi. Expand menambahkan identitas operasi pada riwayat lama secara nullable, tabel dokumen, status, serta jenis registri berkas khusus sistem. Pemisahan migration dan fitur P-20 berukuran L dipilih pemilik produk pada 8 Oktober 2026.
## Requirement yang dilayani

| ID | Berkas | Bagian yang dipenuhi |
|---|---|---|
| FR-04.4 AC 3 | [M-04](../../PRD/02-modules/m04-assets.md) | Snapshot tetap, akses asset_movement_document.view, URL privat 15 menit, audit unduhan |
| CD-04, CD-05 | [Delivery plan PRD](../../PRD/01-product/delivery-plan.md) | Expand dan rollback skema |

## Keputusan desain yang diterapkan

| ID | Berkas |
|---|---|
| SDD-DB-25, SDD-DB-01 | [SDD-05](../../SDD/05-database-design.md) |
| SDD-FS-12, SDD-FS-02/03/05/06 | [SDD-09](../../SDD/09-file-storage-design.md) |

## Perubahan skema

- [ ] Tidak ada perubahan skema
- [x] Ada — jenis: `expand`
  - Migration naik: `apps/api/migrations/0042_asset_movement_documents.sql`
  - Migration turun teruji: ya, PostgreSQL 18 nyata, DDL down/up dalam transaksi lalu rollback; record aset/riwayat dipertahankan, enum file_owner_type dipulihkan dan PDF menjadi yatim.
  - Kompatibel mundur satu versi (`CD-04`): ya; document_id pada riwayat nullable, tanpa backfill/contract.

## Pengujian

| Jenis | Yang diuji |
|---|---|
| Unit | Pemetaan enum Bab 11.3 dan konsistensi SQL migration melalui invariant suite API |
| Integrasi | `m04-movement-schema.test.ts`: 4 uji termasuk penjaga lingkungan, constraint snapshot/terminal/immutabilitas, down/up mempertahankan aset dan riwayat |
| Otorisasi (termasuk kasus penolakan) | —; route berada pada PR fitur |
| Konkurensi | —; advisory lock operasi diuji pada PR fitur |

**Uji yang gagal bila logika ini dicabut:** `menolak snapshot kosong/lebih dari 50 dan status SIAP tanpa berkas`.

## Definition of Done

- [ ] Pipeline hijau (`CD-01`); cakupan logika inti ≥70% (`CD-02`) — belum CI remote; SQL diuji integrasi.
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
  Peninjau: belum ditetapkan; wajib sebelum merge sesuai BRANCHING §3.1.

## Rollback

Revert fitur konsumen dahulu, kemudian down migration 0042. Aset dan riwayat mutasi tetap ada; snapshot/relasi dokumen hilang dan file keluaran menjadi yatim untuk lifecycle. Pilihan rollout utama adalah mempertahankan expand sambil mengembalikan kode konsumen.
## Catatan untuk peninjau

Pemisahan skema dipilih pemilik produk. Koreksi keputusan akses: permission khusus asset_movement_document.view diberi hanya R-01/R-02/R-03; permission dokumen M-06 tetap. Cache role diinvalidasi lewat role_version. Basis lokal bertumpuk di atas fitur PR-02-38 (3ce5c75); integrasi remote mengikuti urutan merge. Tidak ada backfill berita acara lama. Snapshot tidak mempunyai jalur update pada tipe Kysely. Jenis berkas sistem ditolak layanan presign dan tidak ditambahkan ke allowlist unggah HTTP. Perubahan audit closure yang sudah ada tetap di working tree dan tidak termasuk commit ini.
