# Phase 06 — Analitik

| | |
|---|---|
| **Milestone PRD** | `M5 — Insight, Notifikasi & AI` (M-16) — **menutup M5** |
| **Status** | `Not Started` |
| **Modul PRD** | M-16 Analitik & Laporan |
| **Bergantung pada** | Phase 05 |
| **Memblokir** | Phase 07 |
| **Log** | [`logs/phase-06.md`](../logs/phase-06.md) |

---

## 1. Objective

Data yang terkumpul dari 20 modul sebelumnya menjadi dapat dibaca sebagai keputusan: tingkat pemanfaatan aset, tren kerusakan, kepatuhan pengembalian, biaya pemeliharaan. Modul terakhir yang dibangun — sengaja, karena analitik atas data yang belum lengkap hanya menghasilkan laporan yang harus dibongkar ulang.

Phase satu-modul. Kecil dalam cakupan, besar dalam ketergantungan: ia membaca **seluruh** modul lain.

## 2. Scope

**Termasuk**

- M-16: laporan analitik, penyaringan, ekspor
- Kueri agregat dan indeks pendukungnya
- Penyaringan berbasis permission pada seluruh laporan (`BR-073` `BR-074`)

**Tidak termasuk**

- Dashboard operasional (`FR-15.1`) → sudah selesai di **Phase 02**; analitik bersifat historis dan analitis, dashboard bersifat "apa yang terjadi sekarang"
- Gudang data terpisah — PRD tidak mensyaratkannya; laporan dibangun di atas basis data operasional
- Optimasi performa lanjutan → **Phase 08** bila uji beban menunjukkan kebutuhan

## 3. Dependencies

| Bergantung pada | Alasan teknis |
|---|---|
| Phase 05 | Data peminjaman dan penghapusan lengkap — tanpanya, laporan siklus hidup timpang |
| Phase 04 | Data pemeliharaan dan opname |
| Phase 03 | Data pengadaan dan kerusakan |
| Phase 02 | Aset, approval, permission |

M-16 tidak memiliki modul hilir. Ia daun terakhir pada graf dependensi.

### 3.1 Kontribusi terhadap milestone PRD

| Modul | Milestone PRD ([29.2](../../PRD/01-product/delivery-plan.md)) |
|---|---|
| M-16 | `M5 — Insight, Notifikasi & AI` — **menutup M5** |

`M5` mencakup M-15 & M-17 (Phase 02), M-18 (Phase 01), M-19 (Phase 03), dan M-16 (phase ini). Kriteria keluarnya — dashboard ≤ 3 detik pada 5.000 aset, chatbot lolos *golden set* dan red-teaming per role (`ST-06`) — diverifikasi di sini karena baru kini seluruh anggotanya hidup.

## 4. Referensi PRD

| Berkas | ID yang dilayani |
|---|---|
| [`m16-analytics.md`](../../PRD/02-modules/m16-analytics.md) | `FR-16.1` · `BR-073` `BR-074` |
| [`nfr.md`](../../PRD/03-architecture/nfr.md) | `NFR-P-xx` untuk endpoint laporan |
| [`roles-permissions.md`](../../PRD/00-foundation/roles-permissions.md) | `PM-03` (penyaringan data per permission) |
| [`activity-log.md`](../../PRD/03-architecture/activity-log.md) | `AL-10` (ekspor tercatat) |

## 5. Referensi SDD

| Berkas | Keputusan yang diterapkan |
|---|---|
| [`14-performance-design.md`](../../SDD/14-performance-design.md) | `SDD-PERF-03` `SDD-PERF-04` `SDD-PERF-07` (cache, paginasi wajib, tinjauan indeks) |
| [`03-authorization.md`](../../SDD/03-authorization.md) | `SDD-AUTH-07` `SDD-AUTH-08` (scope pada kueri agregat) |
| [`05-database-design.md`](../../SDD/05-database-design.md) | `SDD-DB-06` (indeks pendukung pelaporan) |
| [`06-api-design.md`](../../SDD/06-api-design.md) | `SDD-API-08` (endpoint ekspor berjalan lama) |
| [`11-frontend-architecture.md`](../../SDD/11-frontend-architecture.md) | `SDD-FE-10` (visualisasi) |

## 6. Deliverables

- Kumpulan laporan analitik sesuai `FR-16.1`
- Penyaringan periode, unit kerja, kategori, lokasi
- Ekspor ke format yang disyaratkan, tercatat di activity log
- Indeks pendukung terverifikasi lewat `EXPLAIN`, bukan asumsi

## 7. Pull Request Plan

| PR | Judul | Kompleksitas | Bergantung | FR/SDD | Acceptance |
|---|---|:---:|---|---|---|
| `PR-06-01` | Kerangka laporan: kontrak kueri, parameter, paginasi | M | Ph05 | `FR-16.1`, `SDD-API-08` | Satu kerangka melayani seluruh laporan |
| `PR-06-02` | Penerapan scope permission pada kueri agregat | M | 01 | `BR-073` `BR-074`, `PM-03`, `SDD-AUTH-07` | Agregat tidak membocorkan data di luar scope lewat angka total |
| `PR-06-03` | Laporan pemanfaatan aset & ruangan | M | 02, Ph04 | `FR-16.1` | Angka cocok dengan data `booking_slots` |
| `PR-06-04` | Laporan kondisi & tren kerusakan | M | 02, Ph03 | `FR-16.1` | Tren mengikuti riwayat kondisi, bukan status terkini |
| `PR-06-05` | Laporan peminjaman & kepatuhan pengembalian | M | 02, Ph05 | `FR-16.1` | Keterlambatan memakai hari kerja, konsisten dengan `PR-05-05` |
| `PR-06-06` | Laporan pemeliharaan & biaya | M | 02, Ph04 | `FR-16.1` | Biaya tertelusur ke work order |
| `PR-06-07` | Laporan pengadaan & penghapusan | M | 02, Ph05 | `FR-16.1` | Aset terhapus tetap terhitung pada periodenya |
| `PR-06-08` | Ekspor laporan + pencatatan activity log | M | 03 … 07 | `FR-16.1`, `AL-10` | Ekspor besar tidak memblokir permintaan lain |
| `PR-06-09` | Indeks pendukung + verifikasi `EXPLAIN` | M | 03 … 07 | `SDD-PERF-05`, `SDD-DB-06` | Tidak ada *sequential scan* pada tabel besar |
| `PR-06-10` | Visualisasi laporan (UI) | L | 03 … 07 | `FR-16.1`, `SDD-FE-10` | Grafik dapat diakses (kontras & label), bukan hanya kanvas |

## 8. Task Breakdown

### `PR-06-02` — Scope pada agregat
- [ ] Terapkan filter scope **di dalam** kueri agregat, bukan pada hasilnya
- [ ] Uji kebocoran: dua pengguna berbeda scope, laporan yang sama, angka total harus berbeda dan benar
- [ ] Jangan tampilkan "total keseluruhan" yang mengungkap data di luar scope (`PM-03`)

### `PR-06-09` — Indeks
- [ ] Jalankan `EXPLAIN (ANALYZE, BUFFERS)` pada setiap kueri laporan dengan data uji berskala
- [ ] Tambah indeks hanya bila `EXPLAIN` membuktikannya — bukan berdasarkan dugaan
- [ ] Catat rencana kueri sebelum & sesudah di deskripsi PR
- [ ] Kalibrasi ambang **TBD-PERF-A** dengan data nyata phase ini

### `PR-06-08` — Ekspor
- [ ] Ekspor besar dijalankan worker, bukan pada permintaan HTTP (`JOB-01`)
- [ ] Pengguna diberi tahu lewat notifikasi saat berkas siap (`FR-17.1`)
- [ ] Berkas ekspor tunduk siklus hidup penyimpanan (`SDD-FS-07`)

## 9. Acceptance Checklist

- [ ] Seluruh AC pada `FR-16.1` terverifikasi
- [ ] Uji kebocoran agregat lulus untuk minimal tiga role berbeda
- [ ] Setiap kueri laporan memenuhi anggaran latensi `SDD-PERF`
- [ ] Tidak ada *sequential scan* pada tabel > 100.000 baris
- [ ] Setiap ekspor menghasilkan entri activity log (`AL-10`)
- [ ] Angka laporan direkonsiliasi silang dengan data operasional, bukan hanya "tidak galat"

## 10. Risks

| Risiko | Dampak | Mitigasi | Rujukan |
|---|---|---|---|
| Kueri agregat memfilter di lapisan aplikasi | Kebocoran lewat angka total — sulit terdeteksi karena tidak menampilkan baris | Uji kebocoran wajib, memakai akun berbeda scope | `PM-03`, `BR-073` |
| Laporan memberatkan basis data operasional | Endpoint transaksional ikut melambat | Anggaran latensi terpisah; ekspor besar dipindah ke worker | `SDD-PERF-04` |
| Angka laporan tidak cocok dengan operasional | Kepercayaan pada sistem runtuh — sulit dipulihkan | Rekonsiliasi silang masuk gerbang keluar, bukan opsional | `RS-05` |
| Indeks ditambahkan berdasarkan dugaan | Beban tulis naik tanpa manfaat baca | `EXPLAIN` wajib dilampirkan di setiap PR indeks | `SDD-PERF-05` |

## 11. Rollback Strategy

| Skenario | Tindakan |
|---|---|
| PR gagal di staging | Revert PR; laporan bersifat baca-saja sehingga tidak ada data yang rusak |
| Indeks memperlambat penulisan | `DROP INDEX` — operasi aman, tidak mengubah data |
| Laporan memberatkan produksi | Matikan endpoint laporan lewat *feature flag*; seluruh modul lain tetap berjalan |
| Angka salah | Perbaiki kueri; tidak ada data tersimpan yang perlu dimigrasi karena laporan dihitung saat diminta |

Ini phase dengan risiko rollback terendah: seluruh isinya baca-saja.

## 12. Definition of Done

**DoD dasar** — [PRD 29.5](../../PRD/01-product/delivery-plan.md).

**Tambahan khusus phase ini:**

- [ ] **Seluruh 21 modul PRD terimplementasi**
- [ ] Kriteria keluar `M5` PRD terpenuhi: dashboard ≤ 3 detik pada 5.000 aset · chatbot lolos *golden set* dan red-teaming per role (`ST-06`)
- [ ] Seluruh milestone `M0`–`M5` tertutup; tersisa `M6` (Phase 08)
- [ ] `TBD-PERF-A` tertutup dengan angka hasil pengukuran nyata
- [ ] Rekonsiliasi silang laporan terdokumentasi di log phase
- [ ] Log phase terisi

---

*Phase ini tidak memuat requirement maupun keputusan desain baru. Setiap pernyataan merujuk PRD atau SDD.*
