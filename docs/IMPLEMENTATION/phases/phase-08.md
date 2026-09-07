# Phase 08 — Pengerasan & Kesiapan Rilis

| | |
|---|---|
| **Milestone PRD** | `M6 — Pengerasan & Kesiapan Rilis` — **menutup M6** dan seluruh gerbang 29.3 |
| **Status** | Lihat [`IMPLEMENTATION-STATUS.md`](../IMPLEMENTATION-STATUS.md) |
| **Modul PRD** | — (tidak ada modul baru) |
| **Bergantung pada** | Phase 07 |
| **Memblokir** | — (phase terakhir; keluarannya adalah go-live) |
| **Log** | [`logs/phase-08.md`](../logs/phase-08.md) |

---

## 1. Objective

Sistem yang sudah terbukti benar dibuat **layak dijalankan di dunia nyata**: tahan beban, tahan serangan, dapat dipulihkan, dapat dioperasikan orang lain, dan patuh hukum. Phase ini menutup dua belas gerbang rilis `GL-01` … `GL-12` — sepuluh di antaranya dikerjakan di sini, dua sudah tertutup di Phase 07.

Keluaran phase ini bukan kode, melainkan **keputusan bahwa sistem boleh dipakai**.

## 2. Scope

**Termasuk**

- Uji beban 150 concurrent user terhadap seluruh target Bab 9.1 (`GL-03`)
- Penetration test independen dan penutupan temuan High/Critical (`GL-04`)
- DR drill dan verifikasi runbook (`GL-06`)
- Kepatuhan PDP: pemberitahuan privasi, DPA, persetujuan wali (`GL-07`)
- Migrasi data awal ke produksi: ≥95% aset dan ≥95% berlabel QR (`GL-08`)
- Pelatihan seluruh role; minimal dua Administrator aktif (`GL-10`, `IMP-07`)
- Pengajuan aplikasi mobile ke Google Play dan App Store (`GL-11`)
- Uji rencana rollback (`GL-12`, `CD-05`)
- Dokumen serah terima (`IMP-08`)
- **Contract**: penghapusan kolom lama yang ditunda sejak Phase 01 (`SDD-DB-08`)
- Penutupan sisa TBD kelompok B (parameter operasional) dengan angka hasil pengukuran

**Tidak termasuk**

- Fitur baru dan *change request* dari UAT — dijadwalkan ke rilis berikutnya
- Cutover dan hypercare (`IMP-05`, `IMP-06`) — kegiatan **pasca** go-live, di luar batas dokumentasi implementasi

## 3. Dependencies

| Bergantung pada | Alasan teknis |
|---|---|
| Phase 07 | Uji beban dan pentest atas sistem yang belum benar hanya menghasilkan temuan palsu |
| Phase 01 → `PR-01-12` | Langkah *contract* `users.unit_kerja` menunggu sampai tidak ada pembaca tersisa |
| Phase 00 | Infrastruktur, backup, observability yang kini diuji sungguhan |

### 3.1 Peta gerbang rilis

| Gerbang | Ditutup di | Keterangan |
|---|---|---|
| `GL-01` `GL-02` | **Phase 07** | AC terverifikasi & UAT ditandatangani |
| `GL-05` (otorisasi & chatbot) | **Phase 07** | `ST-05`, `ST-06` |
| `GL-09` | **Phase 07** | Approval rules terverifikasi lewat pratinjau |
| `GL-03` `GL-04` `GL-06` `GL-07` `GL-08` `GL-10` `GL-11` `GL-12` | **Phase 08** | Seluruhnya di phase ini |

## 4. Referensi PRD

| Berkas | ID yang dilayani |
|---|---|
| [`delivery-plan.md`](../../PRD/01-product/delivery-plan.md) | `GL-01` … `GL-12` · `IMP-05` … `IMP-08` · 29.7 |
| [`nfr.md`](../../PRD/03-architecture/nfr.md) | Bab 9.1 (target performa), `NFR-A-xx`, `NFR-SC-xx` |
| [`security.md`](../../PRD/03-architecture/security.md) | `ST-01` … `ST-06` |
| [`privacy-compliance.md`](../../PRD/03-architecture/privacy-compliance.md) | Bab 28 · `DP-01` … `DP-06` · `DP-AI-04` (UU No. 27/2022) |
| [`deployment-ops.md`](../../PRD/03-architecture/deployment-ops.md) | `BR-DR-01` … `BR-DR-05`, `CD-05`, `OBS-07` |
| [`mobile-requirements.md`](../../PRD/05-mobile/mobile-requirements.md) | Persyaratan store |

## 5. Referensi SDD

| Berkas | Keputusan yang diterapkan |
|---|---|
| [`14-performance-design.md`](../../SDD/14-performance-design.md) | `SDD-PERF-05` `SDD-PERF-07` (uji beban k6, tinjauan indeks dari `EXPLAIN ANALYZE`) |
| [`13-security-design.md`](../../SDD/13-security-design.md) | `SDD-SEC-04` … `SDD-SEC-06` (CSP, rate limit, gerbang pemindaian) · `SDD-SEC-09` (akses produksi break-glass) |
| [`16-infrastructure-deployment.md`](../../SDD/16-infrastructure-deployment.md) | `SDD-INF-05` … `SDD-INF-10` (backup, DR, konfigurasi, orkestrasi) |
| [`15-observability-logging.md`](../../SDD/15-observability-logging.md) | `SDD-OBS-07` … `SDD-OBS-09` (alerting, tracing, perkakas & retensi) |
| [`05-database-design.md`](../../SDD/05-database-design.md) | `SDD-DB-08` (langkah *contract*) |
| [`12-mobile-architecture.md`](../../SDD/12-mobile-architecture.md) | `SDD-MOB-08` … `SDD-MOB-10` (versi paksa, rilis store) |

## 6. Deliverables

- Laporan uji beban terhadap target Bab 9.1
- Laporan pentest beserta bukti penutupan temuan High/Critical
- Berita acara DR drill + runbook terverifikasi
- Berkas kepatuhan: pemberitahuan privasi, DPA tertandatangani, rekap persetujuan wali
- Data produksi termigrasi dengan bukti pencapaian `SC-01` dan `SC-02`
- Aplikasi mobile terbit di kedua store
- Rencana rollback yang **sudah dijalankan**, bukan hanya ditulis
- Delapan dokumen serah terima `IMP-08`

## 7. Pull Request Plan

| PR | Judul | Kode | Uji | Bergantung | FR/SDD | Acceptance |
|---|---|:---:|:---:|---|---|---|
| `PR-08-01` | Harness uji beban + skenario 150 concurrent user | L | L | Ph07 | `GL-03`, `SDD-PERF-05` | Skenario mencerminkan pemakaian nyata, bukan satu endpoint |
| `PR-08-02` | Optimasi hasil uji beban — batch temuan | M | M | 01 | Bab 9.1 | Setiap optimasi menunjuk angka sebelum/sesudah |
| `PR-08-03` | Penetapan parameter operasional dari pengukuran (TBD kelompok B) | M | M | 01 | `TBD-AVL-C/D`, `TBD-PERF-A`, `TBD-EVT-A` | Tiap nilai punya dasar pengukuran, bukan tebakan |
| `PR-08-04` | Pengerasan keamanan pra-pentest | M | M | Ph07 | `SDD-SEC-04/05/06`, `NFR-S-07` | Pemindaian otomatis bersih sebelum penguji manusia masuk |
| `PR-08-05` | Penutupan temuan pentest — batch 1 | M | M | pentest | `GL-04`, `ST-04` | Nol temuan High/Critical terbuka |
| `PR-08-06` | Penutupan temuan pentest — batch 2 | M | M | 05 | `GL-04` | Verifikasi ulang oleh penguji |
| `PR-08-07` | Backup terverifikasi + skrip pemulihan | M | M | Ph00 | `BR-DR-01` … `BR-DR-04` | Pemulihan diuji dari backup nyata, bukan asumsi |
| `PR-08-08` | DR runbook + pelaksanaan drill | M | M | 07 | `GL-06`, `BR-DR-05` | RTO/RPO terukur dan memenuhi target |
| `PR-08-09` | Alerting produksi + jalur eskalasi | M | M | Ph00 | `OBS-07`, `SDD-OBS-07`, **TBD-OBS-B** | Setiap alarm punya penerima bernama |
| `PR-08-10` | Perkakas migrasi data produksi + validasi | L | L | Ph07 | `GL-08`, `IMP-01` `IMP-03` | ≥95% aset (`SC-01`), ≥95% ber-QR (`SC-02`) |
| `PR-08-11` | **Contract**: hapus `users.unit_kerja` | S | S | Ph07 | `SDD-DB-08`, `WU-01` | Nol pembaca tersisa, dibuktikan pencarian kode |
| `PR-08-12` | Pemberitahuan privasi + alur persetujuan wali di produksi | M | M | Ph01 | `GL-07`, `DP-01` `DP-02`, `DP-AI-04`, Bab 28 | Seluruh akun siswa aktif punya persetujuan; pemberitahuan privasi menyatakan konsekuensi tier gratis chatbot sebelum chatbot aktif (`DP-AI-04`) |
| `PR-08-13` | Pengerasan mobile + versi paksa + berkas rilis store | M | M | Ph07 | `GL-11`, `SDD-MOB-08/09/10` | Lolos tinjauan kedua store |
| `PR-08-14` | Uji rencana rollback pada staging berdata produksi tiruan | M | M | 07 | `GL-12`, `CD-05` | Rollback dijalankan sungguhan dan terukur waktunya |
| `PR-08-15` | Dokumen serah terima `IMP-08` | L | L | seluruhnya | `IMP-08` | Delapan dokumen lengkap dan terbaca pihak sekolah |

## 8. Task Breakdown

### Kegiatan non-PR

| Kegiatan | Gerbang | Catatan |
|---|---|---|
| Penetration test independen | `GL-04` | Penyedia & anggaran = **TBD-SEC-A**; harus disepakati **sebelum** phase mulai karena berjadwal eksternal |
| Penandatanganan DPA | `GL-07` | Melibatkan pihak ketiga; mulai lebih awal |
| Pelatihan per role | `GL-10`, `IMP-07` | Materi terpisah: Petugas Sarpras, Teknisi, Approver, pengguna umum |
| Tinjauan store | `GL-11` | Di luar kendali tim; jalur kritis terpanjang di phase ini |
| Pengumpulan persetujuan wali | `GL-07` | Bergantung pada sekolah; mulai sejak Phase 07 |
| Salinan resmi surat persetujuan lintas yurisdiksi | `GL-07` | Nomor surat belum tercatat (`SDD-AI-16`); wajib dilengkapi sebelum gerbang diperiksa |

### `PR-08-11` — Langkah *contract*
- [ ] Buktikan nol pembaca `users.unit_kerja` lewat pencarian kode menyeluruh
- [ ] Verifikasi seluruh baris punya `work_unit_id` terisi
- [ ] `DROP COLUMN` dalam migration tersendiri, tanpa perubahan lain
- [ ] Ini satu-satunya PR *contract* di seluruh proyek — bila ada kolom lain menunggu, tambahkan di sini dan catat di log

### `PR-08-14` — Uji rollback
- [ ] Deploy versi N ke staging berdata produksi tiruan
- [ ] Jalankan rollback ke N-1 **sungguhan**, ukur waktunya
- [ ] Verifikasi tidak ada kehilangan data dan migration turun bersih
- [ ] Bila rollback melampaui target `CD-05`, itu cacat — bukan catatan

## 9. Acceptance Checklist

- [ ] `GL-03`: uji beban memenuhi seluruh target Bab 9.1 pada 150 concurrent user
- [ ] `GL-04`: nol temuan pentest High/Critical terbuka
- [ ] `GL-06`: DR drill berhasil, runbook terverifikasi
- [ ] `GL-07`: pemberitahuan privasi terbit, DPA tertandatangani, persetujuan wali lengkap, nomor surat persetujuan lintas yurisdiksi tercatat (`SDD-AI-16`)
- [ ] `GL-08`: ≥95% aset terdaftar (`SC-01`), ≥95% berlabel QR (`SC-02`)
- [ ] `GL-10`: pelatihan selesai; minimal dua Administrator aktif (`BR-070a`)
- [ ] `GL-11`: aplikasi disetujui Google Play dan App Store
- [ ] `GL-12`: rencana rollback teruji (`CD-05`)
- [ ] `IMP-08`: delapan dokumen serah terima lengkap
- [ ] TBD kelompok B tertutup dengan angka pengukuran; sisa TBD terbuka tercatat sebagai risiko yang diterima secara sadar

## 10. Risks

| Risiko | Dampak | Mitigasi | Rujukan |
|---|---|---|---|
| Tinjauan store menolak aplikasi | `GL-11` tertunda tanpa kendali tim — jalur kritis terpanjang | Pengajuan dimulai di awal phase, bukan di akhir; siapkan buffer penolakan pertama | `GL-11` |
| Pentest menemukan cacat arsitektural, bukan sekadar bug | Perbaikan menyentuh desain di titik paling mahal | Pengerasan `PR-08-04` dan uji otorisasi Phase 07 mengurangi kelas temuan ini | `GL-04`, `ST-04` |
| Persetujuan wali tidak lengkap saat go-live | `GL-07` gagal — halangan **hukum**, tidak dapat dikompromikan | Pengumpulan dimulai sejak Phase 07; dipantau mingguan | `DP-02`, UU 27/2022 |
| Uji beban menemukan masalah yang menuntut perubahan skema | Perubahan berisiko tepat sebelum rilis | Anggaran latensi diuji sejak Phase 06 (`PR-06-09`), bukan pertama kali di sini | `SDD-PERF-01` |
| Data awal belum mencapai 95% | `GL-08` gagal; go-live mundur | `IMP-01`/`IMP-03` mensyaratkan pendataan sejak M2 — dipantau sejak Phase 03 | `SC-01`, `SC-02`, `RS-01` |
| Scope-cut ladder dipakai untuk memotong butir di bawah garis | Keutuhan sistem rusak demi jadwal | Ladder 29.4 mengikat; pemotongan di bawah garis memerlukan keputusan pemilik produk tertulis | 29.4 |

## 11. Rollback Strategy

| Skenario | Tindakan |
|---|---|
| Optimasi performa menimbulkan regresi | Revert; suite E2E Phase 07 menangkapnya |
| `PR-08-11` (*contract*) bermasalah | Kolom sudah terhapus — pemulihan lewat *restore* backup. Karena itu PR ini dijalankan **setelah** backup terverifikasi (`PR-08-07`), bukan sebelumnya |
| Migrasi data produksi bermasalah | Migrasi dijalankan bertahap per gedung (`IMP-01`); batch bermasalah diulang tanpa menyentuh yang sudah selesai |
| Go-live dibatalkan | Sistem manual tetap berjalan — cutover paralel `IMP-05` belum dimulai sehingga tidak ada yang perlu dipulihkan |

**Urutan wajib:** `PR-08-07` (backup terverifikasi) mendahului `PR-08-11` (contract) dan `PR-08-10` (migrasi produksi). Melanggar urutan ini menghilangkan satu-satunya jaring pengaman keduanya.

## 12. Definition of Done

**DoD dasar** — [PRD 29.5](../../PRD/01-product/delivery-plan.md).

**Tambahan khusus phase ini:**

- [ ] **Seluruh dua belas gerbang `GL-01` … `GL-12` terpenuhi** — ini definisi kesiapan rilis menurut PRD 29.3
- [ ] Kriteria keluar `M6` terpenuhi
- [ ] Seluruh milestone `M0`–`M6` tertutup
- [ ] [`IMPLEMENTATION-STATUS.md`](../IMPLEMENTATION-STATUS.md) menunjukkan sembilan phase `Done`
- [ ] TBD yang masih terbuka tercatat sebagai risiko yang **diterima secara sadar**, bukan terlupakan
- [ ] Log phase terisi, termasuk catatan untuk tim hypercare (`IMP-06`)

---

*Phase ini tidak memuat requirement maupun keputusan desain baru. Setiap pernyataan merujuk PRD atau SDD.*
