# Phase 04 — Siklus Hidup Aset

| | |
|---|---|
| **Milestone PRD** | `M2` (M-08) · `M3` (M-12) · `M4` (M-13) — lihat §3.1 |
| **Status** | `Not Started` |
| **Modul PRD** | M-08 Reservasi Aset · M-12 Pemeliharaan · M-13 Stock Opname |
| **Bergantung pada** | Phase 03 |
| **Memblokir** | Phase 05 |
| **Log** | [`logs/phase-04.md`](../logs/phase-04.md) |

---

## 1. Objective

Aset memiliki siklus hidup penuh selain peminjaman: dapat dipesan di muka, dirawat, dan diverifikasi keberadaannya. Reservasi aset menutup separuh kedua `booking_slots` — sumber daya kini mencakup ruangan **dan** unit aset dalam satu tabel dan satu constraint.

## 2. Scope

**Termasuk**

- M-08: ketersediaan aset, pengajuan reservasi aset, pembatalan
- M-12: work order korektif, jadwal preventif, eksekusi teknisi, verifikasi & penutupan, riwayat servis
- M-13: sesi opname, pelaksanaan lewat pemindaian QR, rekonsiliasi
- Penutupan `BR-052` — jembatan laporan kerusakan (Phase 03) → work order

**Tidak termasuk**

- Serah terima fisik aset (check-out/check-in) → **Phase 05** bersama M-09; reservasi hanya *memesan*, tidak menyerahkan
- Penghapusan aset yang tidak dapat diperbaiki → **Phase 05** bersama M-21

## 3. Dependencies

| Bergantung pada | Alasan teknis |
|---|---|
| Phase 03 → M-11 | `BR-052`: laporan kerusakan menjadi hulu work order korektif |
| Phase 03 → M-05 | M-13 melaksanakan opname lewat pemindaian QR |
| Phase 02 → `booking_slots` | M-08 memakai tabel dan constraint yang sama dengan M-07 |
| Phase 02 → M-04, M-10, M-17 | Entitas aset, approval, notifikasi |

Urutan di dalam phase:

```
M-12 ──(kondisi aset berubah)──→ dibaca M-13 saat rekonsiliasi
M-08 ──(paralel, tanpa ketergantungan internal)
```

### 3.1 Kontribusi terhadap milestone PRD

| Modul | Milestone PRD ([29.2](../../PRD/01-product/delivery-plan.md)) |
|---|---|
| M-08 | `M2 — Mesin Persetujuan & Pemesanan` — **menutup M2** |
| M-12 | `M3 — Siklus Operasional` |
| M-13 | `M4 — Kontrol & Siklus Hidup Aset` |

**`M2` tertutup di phase ini** — kriteria keluarnya (50 permintaan simultan atas slot sama → tepat 1 sukses) berlaku bagi ruangan *dan* aset, sehingga baru dapat dinyatakan lulus setelah M-08 hidup.

## 4. Referensi PRD

| Berkas | ID yang dilayani |
|---|---|
| [`m08-reservation-item.md`](../../PRD/02-modules/m08-reservation-item.md) | `FR-08.1` … `FR-08.3` · `BR-017` … `BR-025`, `BR-030` |
| [`m12-maintenance.md`](../../PRD/02-modules/m12-maintenance.md) | `FR-12.1` … `FR-12.5` · `BR-046` … `BR-053` |
| [`m13-audit-stocktake.md`](../../PRD/02-modules/m13-audit-stocktake.md) | `FR-13.1` … `FR-13.3` · `BR-054` … `BR-059`, `BR-012` |
| [`availability-concurrency.md`](../../PRD/03-architecture/availability-concurrency.md) | `CI-01` … `CI-05` pada sumber daya bertipe aset |
| [`conventions.md`](../../PRD/00-foundation/conventions.md) | `CAL-01` … `CAL-03` (jadwal preventif) |

## 5. Referensi SDD

| Berkas | Keputusan yang diterapkan |
|---|---|
| [`01-availability-concurrency.md`](../../SDD/01-availability-concurrency.md) | `SDD-AVL-06` … `SDD-AVL-11` pada `resource_type='asset'` |
| [`02-approval-engine.md`](../../SDD/02-approval-engine.md) | Penerapan pada M-08 |
| [`07-event-flow.md`](../../SDD/07-event-flow.md) | `SDD-EVT-05` … `SDD-EVT-09` (rantai kerusakan → work order) |
| [`12-mobile-architecture.md`](../../SDD/12-mobile-architecture.md) | `SDD-MOB-03` … `SDD-MOB-07` (opname & eksekusi teknisi luring) |
| [`05-database-design.md`](../../SDD/05-database-design.md) | `SDD-DB-04` `SDD-DB-05` |

## 6. Deliverables

- Kalender ketersediaan aset dengan sumber data yang sama seperti ruangan
- Reservasi aset yang melewati approval dan mengunci slot
- Work order korektif yang lahir otomatis dari laporan kerusakan terverifikasi
- Jadwal pemeliharaan preventif berbasis kalender kerja
- Aplikasi teknisi: daftar tugas, eksekusi, unggah bukti — berfungsi luring
- Sesi opname dengan pemindaian QR massal dan laporan selisih

## 7. Pull Request Plan

| PR | Judul | Kompleksitas | Bergantung | FR/SDD | Acceptance |
|---|---|:---:|---|---|---|
| `PR-04-01` | Ketersediaan aset di atas `booking_slots` (`resource_type='asset'`) | M | Ph03 | `FR-08.1`, `SDD-AVL-06` | Satu constraint melayani ruangan & aset |
| `PR-04-02` | Pengajuan reservasi aset + approval | L | 01, Ph02 | `FR-08.2`, `BR-017` … `BR-023c` | Status aset ditetapkan saat aktivasi slot, bukan saat approval |
| `PR-04-03` | Pembatalan reservasi aset + pelepasan slot | M | 02 | `FR-08.3`, `BR-024` `BR-024a` `BR-024b` | Slot `Released`, tidak dihapus |
| `PR-04-04` | Kalender & pencarian ketersediaan aset (UI) | M | 01 | `FR-08.1`, `AV-01` … `AV-05` | Menampilkan alternatif saat penuh |
| `PR-04-05` | Skema work order + pembuatan korektif | M | Ph03 | `FR-12.1`, `BR-046` `BR-047` | Prioritas & tenggat sesuai tingkat kerusakan |
| `PR-04-06` | Jembatan `BR-052`: kerusakan terverifikasi → work order | M | 05, Ph03 | `BR-052`, `SDD-EVT-05` | Satu laporan tidak menghasilkan work order ganda |
| `PR-04-07` | Jadwal pemeliharaan preventif + job pembangkit | L | 05 | `FR-12.2`, `BR-048` `BR-049`, `CAL-01` … `CAL-03` | Jadwal melompati hari libur |
| `PR-04-08` | Eksekusi work order oleh teknisi (mobile, luring) | L | 05 | `FR-12.3`, `BR-050` `BR-051`, `SDD-MOB-05` | Antrean unggah bertahan saat aplikasi ditutup |
| `PR-04-09` | Verifikasi & penutupan work order | M | 08 | `FR-12.4`, `BR-053` | Penutupan memutakhirkan kondisi aset (`BR-005b`) |
| `PR-04-10` | Riwayat servis aset | S | 09 | `FR-12.5` | Riwayat menyatu dengan linimasa aset |
| `PR-04-11` | Skema sesi opname + pembuatan sesi | M | Ph03 | `FR-13.1`, `BR-054` `BR-055` | Satu sesi aktif per cakupan |
| `PR-04-12` | Pelaksanaan opname via pemindaian (mobile, luring, massal) | L | 11, Ph03 | `FR-13.2`, `BR-056` `BR-057`, `SDD-MOB-03` | 200 pemindaian luring tersinkron tanpa duplikat |
| `PR-04-13` | Rekonsiliasi & penyelesaian sesi opname | L | 12 | `FR-13.3`, `BR-058` `BR-059`, `BR-012` | Selisih menghasilkan tindak lanjut, bukan sekadar laporan |
| `PR-04-14` | Laporan hasil opname + ekspor | S | 13 | `FR-13.3` | Ekspor tercatat di activity log |

## 8. Task Breakdown

### `PR-04-02` — Reservasi aset
- [ ] Pakai `SlotService` Phase 02 tanpa modifikasi — bila perlu diubah, itu tanda batas modul salah
- [ ] Kunci beberapa aset menurut `asset_id` menaik (`SDD-AVL-06`)
- [ ] Status aset **tidak** diubah saat approval; hanya saat slot naik ke `Active` — mengikuti sekuens 15.2, sesuai resolusi kontradiksi `FR-08.2`
- [ ] Uji: reservasi 5 unit serentak dari 3 penyedia → tidak ada over-booking

### `PR-04-06` — Jembatan `BR-052`
- [ ] Konsumsi event `damage_report.verified` dari outbox
- [ ] Idempoten berdasarkan `damage_report_id` — event terkirim ulang tidak menggandakan work order
- [ ] Isi titik ekstensi yang disiapkan `PR-03-15`
- [ ] Uji: pengiriman ulang event menghasilkan tepat satu work order

### `PR-04-12` — Opname luring
- [ ] Simpan pemindaian lokal beserta `client_scan_id`
- [ ] Sinkronisasi bertumpuk dengan kunci idempotensi (`ID-01`…`ID-05`)
- [ ] Konflik (aset dipindai dua petugas) diselesaikan deterministik, tercatat
- [ ] Uji: 200 pemindaian luring, aplikasi ditutup paksa, lalu daring kembali

## 9. Acceptance Checklist

- [ ] Seluruh AC pada `FR-08.1`…`FR-08.3`, `FR-12.1`…`FR-12.5`, `FR-13.1`…`FR-13.3` terverifikasi
- [ ] Reservasi aset dan ruangan berbagi satu constraint tanpa jalur kode terpisah
- [ ] `BR-052` tertutup: laporan kerusakan terverifikasi menghasilkan tepat satu work order
- [ ] Pemeliharaan preventif tidak menjadwalkan pekerjaan pada hari libur (`CAL-02`)
- [ ] Opname luring 200 pemindaian tersinkron tanpa duplikat atau kehilangan
- [ ] Kondisi aset yang berubah karena work order terlihat pada rekonsiliasi opname

## 10. Risks

| Risiko | Dampak | Mitigasi | Rujukan |
|---|---|---|---|
| `SlotService` perlu diubah untuk melayani aset | Abstraksi Phase 02 ternyata salah; kerja ulang menyebar | Perubahan `SlotService` di phase ini wajib melalui tinjauan arsitek dan tercatat di log | `SDD-AVL-06` |
| Sinkronisasi luring menggandakan data opname | Angka inventaris salah — merusak kepercayaan pada `RS-02` | Idempotensi berbasis `client_scan_id`, bukan waktu | `ID-01`, `RS-02` |
| `FR-08.2` vs sekuens 15.2 ditafsirkan ulang oleh pengembang | Status aset tidak konsisten dengan M-07 | Resolusi sudah ditetapkan di PRD; PR yang menyimpang ditolak review | `FR-08.2` |
| Jadwal preventif membanjiri notifikasi teknisi | Notifikasi diabaikan seluruhnya | Pengelompokan notifikasi (bergantung **TBD-NTF-A**) | `FR-17.3` |

## 11. Rollback Strategy

| Skenario | Tindakan |
|---|---|
| PR gagal di staging | Revert PR; M-08/M-12/M-13 saling independen kecuali `PR-04-06` |
| `PR-04-06` bermasalah | Matikan konsumen event; work order dibuat manual — laporan kerusakan tetap tercatat, tidak ada data hilang |
| Reservasi aset perlu ditarik | Slot bertipe `asset` di-`Released`; slot ruangan tidak tersentuh karena difilter `resource_type` |
| Sesi opname bermasalah | Sesi ditandai `Dibatalkan`; hasil pemindaian dipertahankan sebagai arsip |

## 12. Definition of Done

**DoD dasar** — [PRD 29.5](../../PRD/01-product/delivery-plan.md).

**Tambahan khusus phase ini:**

- [ ] Kriteria keluar `M2` PRD terpenuhi: 50 permintaan simultan atas slot yang sama → tepat 1 sukses, diuji pada ruangan **dan** aset
- [ ] Sesi opname 1.000 unit selesai di perangkat nyata (bagian kriteria `M4`)
- [ ] Uji luring mobile dijalankan pada perangkat nyata, bukan hanya emulator
- [ ] Tidak ada perubahan pada `SlotService` — atau bila ada, terdokumentasi beserta alasannya
- [ ] Log phase terisi

---

*Phase ini tidak memuat requirement maupun keputusan desain baru. Setiap pernyataan merujuk PRD atau SDD.*
