# 29. Delivery Plan, Milestone & Manajemen Implementasi

> Keputusan #13 menetapkan strategi rilis **big bang** — seluruh modul dirilis sekaligus ke produksi. Keputusan itu **tetap berlaku**. Namun big bang ke produksi bukan berarti pengembangan tanpa checkpoint. Bab ini menambahkan struktur internal agar risiko RS-17 dapat dikendalikan, tanpa mengubah strategi rilis yang telah disepakati.

## 29.1 Prinsip

| Kode | Prinsip |
|---|---|
| DL-01 | **Satu rilis produksi, banyak milestone internal.** Sekolah tetap menerima sistem sekaligus; tim tetap memiliki titik verifikasi berkala. |
| DL-02 | Setiap milestone diakhiri demo yang dapat dijalankan dan diterima oleh Business Owner (Wakasek Sarpras), bukan sekadar laporan progres. |
| DL-03 | Modul fondasi harus stabil sebelum modul yang bergantung padanya dibangun. |
| DL-04 | Bila jadwal tertekan, pemotongan lingkup mengikuti *scope-cut ladder* (29.4), bukan keputusan ad hoc. |

## 29.2 Milestone Internal

| Milestone | Isi | Kriteria keluar |
|---|---|---|
| **M0 — Fondasi Teknis** | Kerangka proyek, skema basis data inti, migration, CI/CD, tiga lingkungan, observability dasar, katalog permission (Lampiran C) ter-*seed* | Pipeline hijau; deploy ke staging otomatis; `/health` melaporkan seluruh dependensi |
| **M1 — Identitas & Data Induk** | M-01, M-02, M-03, M-04, M-05, M-20 + Lampiran C ditegakkan di seluruh endpoint | 500 aset dapat diimpor, QR dicetak & dipindai, RBAC lolos uji otorisasi per role (ST-05) |
| **M2 — Mesin Persetujuan & Pemesanan** | M-10 (termasuk Lampiran D), M-07, M-08, Bab 26 (`booking_slots`, exclusion constraint) | Uji konkurensi lolos: 50 permintaan simultan atas slot sama → tepat 1 sukses |
| **M3 — Siklus Operasional** | M-09, M-11, M-12, M-06 | Alur ujung-ke-ujung reservasi → serah terima → pengembalian → denda → tiket kerusakan → work order → selesai, berjalan di staging |
| **M4 — Kontrol & Siklus Hidup Aset** | M-13, M-14, M-21 | Sesi opname 1.000 unit selesai di perangkat nyata; usulan pengadaan menghasilkan aset; penghapusan menghasilkan berita acara |
| **M5 — Insight, Notifikasi & AI** | M-15, M-16, M-17, M-18, M-19 (termasuk Bab 22.7–22.9) | Dashboard ≤3 detik pada 5.000 aset; chatbot lolos *golden set* dan red-teaming per role (ST-06) |
| **M6 — Pengerasan & Kesiapan Rilis** | Uji beban, penetration test, DR drill, dokumentasi, pelatihan | Seluruh gerbang rilis pada 29.3 terpenuhi |

Aplikasi mobile dikembangkan **paralel** mulai M1, mengikuti API yang telah stabil pada tiap milestone; modul yang wajib ada di mobile (scan QR, opname, work order, approval, pelaporan kerusakan) diselesaikan paling lambat pada M4.

## 29.3 Gerbang Rilis Produksi (*Go-Live Gate*)

Seluruh butir berikut wajib terpenuhi. Satu butir gagal = rilis ditunda.

| Kode | Gerbang |
|---|---|
| GL-01 | Seluruh Acceptance Criteria pada Bab 8 terverifikasi QA |
| GL-02 | UAT ditandatangani oleh Petugas Sarpras, Wakasek Sarpras, dan Kepala Sekolah |
| GL-03 | Uji beban memenuhi seluruh target Bab 9.1 pada 150 concurrent user |
| GL-04 | Penetration test tanpa temuan *High/Critical* terbuka (ST-04) |
| GL-05 | Uji otorisasi tujuh role tanpa kebocoran (ST-05) dan red-teaming chatbot lolos (ST-06) |
| GL-06 | DR drill berhasil dan runbook terverifikasi (BR-DR-05) |
| GL-07 | Kepatuhan PDP terpenuhi: pemberitahuan privasi terbit, DPA tertandatangani, persetujuan wali terkumpul untuk seluruh akun siswa (Bab 28) |
| GL-08 | Data awal termigrasi: ≥95% aset terdaftar (SC-01) dan ≥95% berlabel QR (SC-02) |
| GL-09 | Approval rules terkonfigurasi dan diverifikasi melalui pratinjau (RE-07) |
| GL-10 | Pelatihan selesai untuk seluruh role; minimal dua Administrator aktif (BR-070a) |
| GL-11 | Aplikasi mobile disetujui pada Google Play dan App Store |
| GL-12 | Rencana rollback teruji (CD-05) |

## 29.4 Scope-Cut Ladder

Bila jadwal tertekan, lingkup dipotong berurutan dari atas. Butir di bawah garis tidak boleh dipotong karena merusak keutuhan sistem.

| Urutan | Yang dipotong / disederhanakan | Konsekuensi yang diterima |
|---|---|---|
| 1 | Mode perbandingan antar-periode pada analitik (FR-16.1 A3) | Analitik tetap berfungsi tanpa pembanding |
| 2 | Preferensi notifikasi per jenis (FR-17.3) — sementara memakai preset per role | Notifikasi wajib tetap terkirim |
| 3 | Reservasi berulang (FR-07.2 A4) | Pengguna mengajukan per tanggal |
| 4 | Delegasi approver (FR-10.2 A3) | Ketidakhadiran ditangani lewat eskalasi |
| 5 | Chatbot AI (M-19) ditunda ke rilis berikutnya | Pencarian manual tetap tersedia; menghemat biaya API sekaligus |
| 6 | Laporan analitik lanjutan (Kebutuhan Pengadaan, Tren Kerusakan) | Dashboard dasar tetap ada |
| — | **GARIS BATAS** | |
| ✗ | Inventaris, QR, lokasi, reservasi, peminjaman, approval, kerusakan, work order, opname, activity log, RBAC, keamanan, kepatuhan PDP | Tidak dapat dipotong |

## 29.5 Definition of Done

Sebuah requirement dinyatakan selesai bila **seluruh** butir berikut terpenuhi:

- [ ] Seluruh Acceptance Criteria terpenuhi dan diverifikasi QA pada staging
- [ ] Otorisasi diuji untuk seluruh role yang relevan, termasuk kasus penolakan
- [ ] Unit test untuk logika bisnis dan integration test untuk endpoint tersedia dan lulus
- [ ] Activity log tercatat untuk setiap operasi tulis yang dihasilkan (AL-01)
- [ ] Notifikasi terkait terkirim sesuai katalog Bab 20
- [ ] Dokumentasi OpenAPI diperbarui dan sinkron (NFR-M-05)
- [ ] Berjalan pada web dan mobile bila requirement menyatakan demikian
- [ ] Aksesibilitas diperiksa untuk layar baru (Bab 9.6)
- [ ] Tidak meninggalkan *TODO* atau data uji pada jalur produksi

## 29.6 Implementasi, Migrasi Data & Cutover

| Kode | Requirement |
|---|---|
| IMP-01 | **Pendataan aset awal** dilakukan bertahap per gedung, dimulai paling lambat pada M2 agar tidak menumpuk di akhir (mitigasi RS-01) |
| IMP-02 | Template impor aset dan pengguna (Lampiran E) diserahkan ke sekolah paling lambat pada M1 |
| IMP-03 | Pelabelan QR dilakukan bersamaan dengan pendataan, bukan setelahnya; target ≥95% (SC-02) |
| IMP-04 | **Baseline pra-implementasi wajib diukur** sebelum go-live untuk memvalidasi SC-03, SC-06, SC-07, dan SC-08: durasi opname manual, rata-rata waktu persetujuan disposisi kertas, dan tingkat pengembalian tepat waktu versi manual. Tanpa baseline, keempat kriteria sukses tersebut tidak dapat dibuktikan |
| IMP-05 | **Cutover**: sistem manual dan digital berjalan paralel maksimum 2 minggu; setelahnya pencatatan manual dihentikan |
| IMP-06 | **Hypercare** 8 minggu pasca go-live dengan dukungan responsif dan penyesuaian konfigurasi tanpa perlu *change request* formal |
| IMP-07 | Pelatihan per role dilaksanakan pada M6, dengan materi terpisah untuk Petugas Sarpras, Teknisi, Approver, dan pengguna umum |
| IMP-08 | Dokumen serah terima wajib: panduan pengguna per role, panduan Administrator, dokumen arsitektur, ERD, panduan deployment, dan DR runbook |

## 29.7 Model Dukungan Pasca-Rilis

| Tingkat | Cakupan | Target respons |
|---|---|---|
| L1 | Administrator sekolah — pertanyaan penggunaan, reset akun, konfigurasi | Dalam jam kerja |
| L2 | Tim pengembang — cacat fungsional, gangguan integrasi | Kritis ≤ 4 jam; Tinggi ≤ 1 hari kerja |
| L3 | Perbaikan mendasar & perubahan lingkup | Melalui *change request* tertulis |

**Definisi keparahan insiden produksi**

| Keparahan | Definisi | Contoh |
|---|---|---|
| Kritis | Sistem tidak dapat digunakan atau data terancam | Login gagal total, kehilangan data, kebocoran lintas hak akses |
| Tinggi | Modul inti tidak berfungsi tanpa jalan pintas | Serah terima tidak dapat diproses |
| Sedang | Fungsi terganggu namun ada jalan pintas | Ekspor gagal, chatbot mati |
| Rendah | Kosmetik atau ketidaknyamanan kecil | Salah label, penyelarasan tampilan |

---
