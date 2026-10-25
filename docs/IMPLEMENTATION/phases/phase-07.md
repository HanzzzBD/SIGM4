# Phase 07 — Integrasi Lintas Modul & UAT

| | |
|---|---|
| **Milestone PRD** | Bagian `M6 — Pengerasan & Kesiapan Rilis` — gerbang `GL-01`, `GL-02` |
| **Status** | Lihat [`IMPLEMENTATION-STATUS.md`](../IMPLEMENTATION-STATUS.md) |
| **Modul PRD** | — (tidak ada modul baru; seluruh 22 modul diuji sebagai satu sistem) |
| **Bergantung pada** | Phase 06 |
| **Memblokir** | Phase 08 |
| **Log** | [`logs/phase-07.md`](../logs/phase-07.md) |

---

## 1. Objective

Sistem berhenti diuji sebagai kumpulan modul dan mulai diuji sebagai **satu sistem yang dipakai orang**. Phase ini tidak menambah kemampuan; ia membuktikan bahwa kemampuan yang sudah ada bertahan ketika dirangkai menjadi pekerjaan nyata sehari penuh — dan bahwa penggunanya menandatanganinya.

Bila sebuah cacat integrasi baru ditemukan di Phase 08, artinya phase ini gagal.

## 2. Scope

**Termasuk**

- Uji ujung-ke-ujung lintas modul atas seluruh alur bisnis Bab 15
- Rekonsiliasi silang: angka analitik ⇄ data operasional ⇄ activity log
- Perbaikan cacat integrasi (**bukan** fitur baru)
- Pelaksanaan UAT bersama Petugas Sarpras, Wakasek Sarpras, dan Kepala Sekolah (`GL-02`)
- Verifikasi QA atas seluruh Acceptance Criteria Bab 8 (`GL-01`)
- Pengukuran **baseline pra-implementasi** (`IMP-04`) — prasyarat pembuktian `SC-03`, `SC-06`, `SC-07`, `SC-08`
- Verifikasi konfigurasi approval rule lewat pratinjau (`GL-09`)

**Tidak termasuk**

- Requirement baru. Temuan UAT yang berupa permintaan fitur menjadi *change request*, **bukan** pekerjaan phase ini
- Uji beban, pentest, DR drill → **Phase 08**
- Migrasi data produksi → **Phase 08** (`GL-08`)

## 3. Dependencies

| Bergantung pada | Alasan teknis |
|---|---|
| Phase 06 | Seluruh 22 modul harus hidup — UAT atas sistem separuh jadi tidak dapat ditandatangani |
| Phase 01 → `IMPT-05` | Template impor sudah diserahkan sejak `M1` (`IMP-02`); pendataan berjalan sejak `M2` (`IMP-01`) |

> Catatan jadwal, bukan dependensi kode: `IMP-01` mensyaratkan pendataan aset awal **dimulai paling lambat pada M2** — yakni selama Phase 03/04, jauh sebelum phase ini. Phase 07 memverifikasi hasilnya, tidak memulainya.

## 4. Referensi PRD

| Berkas | ID yang dilayani |
|---|---|
| [`delivery-plan.md`](../../PRD/01-product/delivery-plan.md) | `GL-01` `GL-02` `GL-09` · `IMP-01` … `IMP-04` · 29.5 |
| [`test-strategy.md`](../../PRD/06-quality/test-strategy.md) | Strategi uji integrasi & UAT |
| [`traceability.md`](../../PRD/06-quality/traceability.md) | Verifikasi cakupan FR → uji |
| [`overview.md`](../../PRD/01-product/overview.md) | `SC-01` … `SC-10` (kriteria sukses) |
| [`personas-journeys.md`](../../PRD/01-product/personas-journeys.md) | Skenario UAT berbasis perjalanan pengguna |
| [`assumptions-risks.md`](../../PRD/01-product/assumptions-risks.md) | `RS-01` … `RS-xx` (verifikasi mitigasi) |

## 5. Referensi SDD

| Berkas | Keputusan yang diterapkan |
|---|---|
| [`07-event-flow.md`](../../SDD/07-event-flow.md) | Verifikasi rantai event lintas modul ujung-ke-ujung |
| [`15-observability-logging.md`](../../SDD/15-observability-logging.md) | `SDD-OBS-05` (korelasi `request_id` lintas modul) |
| [`03-authorization.md`](../../SDD/03-authorization.md) | Verifikasi tujuh role tanpa kebocoran |
| [`10-ai-orchestrator-design.md`](../../SDD/10-ai-orchestrator-design.md) | `SDD-AI-11` (eval harness dijalankan penuh) |

## 6. Deliverables

- Suite uji ujung-ke-ujung yang berjalan di CI, bukan skrip sekali pakai
- Laporan rekonsiliasi silang antar-modul
- Berita acara UAT bertanda tangan tiga pihak (`GL-02`)
- Dokumen baseline pra-implementasi (`IMP-04`)
- Matriks keterlacakan terverifikasi: setiap FR memiliki uji yang lulus
- Daftar *change request* dari temuan UAT — terpisah dari daftar cacat

## 7. Pull Request Plan

| PR | Judul | Kode | Uji | Bergantung | FR/SDD | Acceptance |
|---|---|:---:|:---:|---|---|---|
| `PR-07-01` | Kerangka uji E2E + data uji berskala nyata | L | L | Ph06 | `test-strategy.md` | 5.000 aset, 500 pengguna, satu tahun ajaran |
| `PR-07-02` | E2E: siklus hidup aset penuh (pengadaan → penghapusan) | L | L | 01 | Bab 15 | Satu aset melewati seluruh transisi status |
| `PR-07-03` | E2E: reservasi ruangan → penggunaan → penyelesaian | M | M | 01 | `FR-07.1` … `FR-07.4` | Termasuk jalur pembatalan dan bentrok |
| `PR-07-04` | E2E: reservasi aset → pinjam → kembali → denda | L | L | 01 | `FR-08.x`, `FR-09.x` | Termasuk keterlambatan dan perpanjangan |
| `PR-07-05` | E2E: kerusakan → work order → servis → verifikasi | M | M | 01 | `FR-11.x`, `FR-12.x`, `BR-052` | Kriteria keluar `M3` PRD |
| `PR-07-06` | E2E: opname → selisih → tindak lanjut → penghapusan | M | M | 01 | `FR-13.x`, `FR-21.x`, `BR-012` | Aset hilang sampai ke berita acara |
| `PR-07-07` | E2E: approval bertingkat lintas jenis pengaju | M | M | 01 | `FR-10.x`, Lampiran D | Satu konfigurasi rule melayani empat pengaju berbeda |
| `PR-07-08` | Uji otorisasi tujuh role menyeluruh | L | L | 01 | `GL-05`, `ST-05`, `PM-02` `PM-03` | Nol kebocoran lintas role |
| `PR-07-09` | Rekonsiliasi silang: analitik ⇄ operasional ⇄ activity log | M | M | 01, Ph06 | `FR-16.1`, `AL-01` | Selisih nol; bila ada, terjelaskan |
| `PR-07-10` | Eval chatbot penuh: *golden set* + red-teaming per role | L | L | 01, Ph03 | `SC-10`, `ST-06`, `SDD-AI-11` | Kriteria `GL-05` bagian chatbot |
| `PR-07-11` | Uji korelasi `request_id` lintas modul | S | S | 01 | `SDD-OBS-05` | Satu permintaan tertelusur dari API sampai worker |
| `PR-07-12` | Verifikasi matriks keterlacakan otomatis | M | M | 02 … 08 | `traceability.md` | FR tanpa uji menggagalkan CI |
| `PR-07-13` | Perbaikan cacat integrasi — batch 1 | M | M | 02 … 09 | — | Setiap perbaikan menunjuk uji E2E yang gagal |
| `PR-07-14` | Perbaikan cacat integrasi — batch 2 (pasca-UAT) | M | M | UAT | — | Hanya cacat; permintaan fitur ditolak ke CR |
| `PR-07-15` | Keputusan & spesifikasi paritas mobile — `MOB-SCP-01`…`04`, `SDD-MOB-13`, **UXD-19**…**22**, `MS-24`…`MS-90`, **DSD-11**/**12**, C-30…C-38 *(di luar rencana, 25 Okt — log §4)* | S | S | — | `MOB-SCP-01`, **UXD-19** | Docs saja; seluruh PR paritas di bawah merujuk ID di sini |
| `PR-07-16` | Mobile tahap A — fondasi navigasi & visual: tab Beranda · Tugas · Scan · Chatbot · Menu, Header C-30 + lonceng `MS-29`, Menu `MS-31`, chatbot mengambang C-38/C-36, komponen C-31…C-37, ikon modul | L | M | 07-15 | **UXD-20**…**22**, **DSD-11**/**12** | Menu hanya menampilkan entri berizin; entri `MOB-SCP-02` mengarah ke web |
| `PR-07-17` | Mobile tahap A — tata ulang visual 25 layar yang ada + Profil `MS-30`, Riwayat Chatbot `MS-32`, Detail Keputusan `MS-54` | L | M | 07-16 | **DSD-11**, `MOB-SCP-04` | Tidak ada paragraf > 2 kalimat per layar; perilaku layar lama tidak berubah |
| `PR-07-18` | Mobile tahap A — akun: Aktivasi 2FA `MS-24`, Lupa Password `MS-25`, Privasi `MS-26`, Keamanan & 2FA `MS-27`, Preferensi Notifikasi `MS-28` | M | M | 07-16 | `FR-01.x`, `FR-17.3` | Kode cadangan & perangkat terhubung dapat dikelola dari ponsel |
| `PR-07-19` | Mobile tahap A — reservasi: Kalender Ruangan `MS-44`, Katalog Aset `MS-45`, Wizard `MS-46`, Daftar/Detail Reservasi `MS-47`/`MS-48` | L | L | 07-16 | `FR-07.x`, `FR-08.x`, **UXD-04** | Pengajuan sampai persetujuan dapat diselesaikan dari ponsel |
| `PR-07-20` | Mobile tahap A — peminjaman & denda pemohon: Peminjaman Saya `MS-12`, Perpanjangan `MS-13`, Denda Saya `MS-14`, Detail Peminjaman `MS-51`, Detail Kewajiban `MS-53` | M | M | 07-16 | `FR-09.5 AC`, `FR-09.x` | `FR-09.5 AC` (wajib mobile) tertutup |
| `PR-07-21` | Mobile tahap A — permintaan bahan: Katalog Bahan `MS-55`, Ajukan `MS-56`, Daftar/Detail Permintaan `MS-57`/`MS-58` | M | M | 07-16 | `FR-22.x` | Mencabut **UXD-17** di kode |
| `PR-07-22` | Mobile tahap A — usulan pengadaan: Pengadaan `MS-67`, Buat Usulan `MS-68`, Detail Usulan `MS-69` | M | M | 07-16 | `FR-14.1`, `FR-14.2` | Lampiran spesifikasi dari kamera/galeri |
| `PR-07-23` | Mobile tahap B — inventaris: Inventaris `MS-33`, Tambah/Ubah Aset `MS-34`, Mutasi Lokasi `MS-35`, Kategori Aset `MS-36`, Dokumen Aset `MS-39` | L | L | 07-17 | `FR-04.x`, `FR-06.1` | Impor aset tampil sebagai entri ke web (`MOB-SCP-03`) |
| `PR-07-24` | Mobile tahap B — lokasi: Lokasi `MS-37`, Detail Ruangan `MS-38` | S | S | 07-17 | `FR-03.x` | Pohon gedung → area → ruangan dapat dijelajahi satu tangan |
| `PR-07-25` | Mobile tahap B — serah terima & pengembalian: `MS-10`, `MS-11`, Daftar Peminjaman `MS-49`, Antrean Serah Terima `MS-50`, Denda & Kewajiban `MS-52` | L | L | 07-20 | `FR-09.1`, `FR-09.2`, `FR-09.3` | Tanda tangan & foto bukti dari ponsel |
| `PR-07-26` | Mobile tahap B — bahan: Bahan `MS-40`, Tambah/Ubah `MS-41`, Detail & kartu stok `MS-42`, Kategori `MS-43`, penyerahan di `MS-58` | M | M | 07-21 | `FR-22.x` | Penerimaan, penyesuaian, dan penyerahan tercatat di ledger |
| `PR-07-27` | Mobile tahap B — kerusakan & work order petugas: Laporan Kerusakan `MS-59`, Detail Tiket `MS-60`, Daftar WO `MS-61`, Buat WO `MS-62` | M | M | 07-17 | `FR-11.2`, `FR-12.1`, `FR-12.4` | Verifikasi tiket → WO → tutup dari ponsel |
| `PR-07-28` | Mobile tahap B — jadwal pemeliharaan `MS-63`, `MS-64` | S | S | 07-17 | `FR-12.2` | Lewati/nonaktifkan beralasan |
| `PR-07-29` | Mobile tahap B — opname: Buat Sesi `MS-65`, Rekonsiliasi `MS-66` | M | M | 07-17 | `FR-13.1`, `FR-13.3` | Siklus opname penuh tanpa web |
| `PR-07-30` | Mobile tahap B — Catat Penerimaan `MS-70` + penghapusan `MS-71`…`MS-73` | M | M | 07-22 | `FR-14.3`, `FR-21.x` | Eksekusi penghapusan dengan foto & saksi dari ponsel |
| `PR-07-31` | Mobile tahap C — analitik: `MS-74`, Laporan `MS-75` (Grafik Mini C-33, ekspor unduh) | M | M | 07-17 | `FR-16.x` | Ekspor berkas tersimpan di perangkat |
| `PR-07-32` | Mobile tahap C — pengguna: `MS-76`…`MS-79`, Permintaan Reset Password `MS-82` | M | M | 07-17 | `FR-02.1`, `FR-01.3`, `FR-01.5` | Impor pengguna tampil sebagai entri ke web (`MOB-SCP-03`) |
| `PR-07-33` | Mobile tahap C — role & approval rules: `MS-80`, `MS-81`, `MS-83`, `MS-84` | L | M | 07-17 | `FR-02.2`, `FR-10.1` | Penguncian izin inti Administrator tetap ditegakkan server |
| `PR-07-34` | Mobile tahap C — pengaturan: Parameter Sistem `MS-85`, Kalender Akademik `MS-86`, Unit Kerja `MS-87` | M | M | 07-17 | `FR-20.x` | Satuan Bahan ikut tab Parameter |
| `PR-07-35` | Mobile tahap C — Activity Log `MS-88`, Detail Entri `MS-89`, Monitoring Chatbot `MS-90` | S | S | 07-17 | `FR-18.x`, `FR-19.2` | Pembacaan log mobile tercatat `ACTIVITY_LOG_VIEWED` |

> `PR-07-13` dan `PR-07-14` sengaja tidak dirinci — isinya ditentukan temuan. Kompleksitas **M** adalah pagu; bila satu perbaikan melampauinya, ia dipecah menjadi PR tersendiri.

### Paket pelaksanaan paritas mobile

`PR-07-16`…`35` dikerjakan sebagai **enam paket per domain** (log phase-07 keputusan 6), bukan satu PR GitHub per baris. Setiap paket adalah satu PR GitHub berisi satu commit per ID PR di dalamnya (`PR-NN-NN: …`); paket berikutnya baru dimulai setelah paket sebelumnya tergabung. ID, kompleksitas, dan kriteria per baris di atas tetap berlaku.

| Paket | ID PR | Alasan digabung |
|---|---|---|
| 1. Fondasi & Akun | `PR-07-16`, `PR-07-17`, `PR-07-18` | Seluruh paket lain bergantung pada tab, header C-30, dan komponen C-31…C-38 |
| 2. Pemanfaatan | `PR-07-19`, `PR-07-20`, `PR-07-25`, `PR-07-21` | Reservasi → serah terima → peminjaman → denda satu alur; `MS-51`/`MS-53` dipakai pemohon dan petugas |
| 3. Aset & Bahan | `PR-07-23`, `PR-07-24`, `PR-07-26` | Inventaris ↔ lokasi ↔ ruangan saling menaut; penyerahan bahan melanjutkan `MS-58` dari paket 2 |
| 4. Perawatan & Opname | `PR-07-27`, `PR-07-28`, `PR-07-29` | Kerusakan → work order → jadwal preventif; opname memakai pemindai yang sama |
| 5. Pengadaan & Penghapusan | `PR-07-22`, `PR-07-30` | Usulan → persetujuan → penerimaan; penghapusan memakai snapshot aset & approval yang sama |
| 6. Pimpinan & Admin | `PR-07-31`…`PR-07-35` | Grup Pengawasan/Sistem dengan pola layar administratif serupa |

Setiap paket berukuran **L**; deskripsi PR paket menjelaskan alasan tidak dipecah dan merinci baris uji per ID PR.

## 8. Task Breakdown

### Pelaksanaan UAT (bukan PR — kegiatan)
- [ ] Susun skenario UAT dari [`personas-journeys.md`](../../PRD/01-product/personas-journeys.md), bukan dari daftar FR
- [ ] Sediakan lingkungan UAT dengan data realistis, bukan data uji sintetis bernama `test1`
- [ ] Dampingi Petugas Sarpras, Wakasek Sarpras, Kepala Sekolah menjalankan pekerjaan sehari penuh
- [ ] Catat setiap temuan dan klasifikasikan: **cacat** (diperbaiki phase ini) vs **permintaan fitur** (menjadi CR)
- [ ] Kumpulkan tanda tangan ketiganya (`GL-02`)

### Baseline pra-implementasi (`IMP-04`)
- [ ] Ukur durasi opname manual → pembanding `SC-03`
- [ ] Ukur rata-rata waktu persetujuan disposisi kertas → pembanding `SC-06`
- [ ] Ukur tingkat pengembalian tepat waktu versi manual → pembanding `SC-07`, `SC-08`
- [ ] Dokumentasikan metode pengukuran, bukan hanya angkanya

> Tanpa baseline ini, empat kriteria sukses PRD tidak dapat dibuktikan **selamanya** — angka pembanding hanya ada sebelum sistem dipakai.

### `PR-07-08` — Uji otorisasi menyeluruh
- [ ] Untuk setiap route × setiap role: harapan izin/tolak dinyatakan eksplisit
- [ ] Uji jalur penolakan, bukan hanya jalur izin
- [ ] Uji kebocoran data: role dengan akses terbatas tidak melihat baris di luar scope
- [ ] Route baru tanpa entri matriks uji → CI merah

## 9. Acceptance Checklist

- [ ] `GL-01`: seluruh Acceptance Criteria Bab 8 terverifikasi QA di staging
- [ ] `GL-02`: berita acara UAT ditandatangani tiga pihak
- [ ] `GL-05` bagian otorisasi & chatbot terpenuhi (`ST-05`, `ST-06`)
- [ ] `GL-09`: approval rules terkonfigurasi dan diverifikasi lewat pratinjau (`RE-07`)
- [ ] `IMP-04`: baseline terukur dan terdokumentasi
- [ ] Setiap FR pada matriks keterlacakan memiliki uji yang lulus
- [ ] Nol cacat integrasi terbuka berkategori Kritis atau Tinggi
- [ ] Angka analitik terekonsiliasi dengan data operasional

## 10. Risks

| Risiko | Dampak | Mitigasi | Rujukan |
|---|---|---|---|
| UAT menghasilkan permintaan fitur yang dianggap cacat | Lingkup melebar tepat sebelum rilis | Klasifikasi eksplisit di setiap temuan; CR tidak dikerjakan di phase ini | 29.6 |
| Baseline `IMP-04` terlewat | `SC-03`, `SC-06`, `SC-07`, `SC-08` tidak dapat dibuktikan — permanen | Termasuk gerbang keluar phase; tidak dapat dikejar setelah go-live | `IMP-04` |
| Data pendataan awal belum mencapai target saat UAT | UAT berjalan di atas data tipis dan tidak meyakinkan | `IMP-01` mensyaratkan pendataan dimulai sejak M2 — dipantau sejak Phase 03, bukan ditemukan di sini | `RS-01`, `SC-01` |
| Cacat integrasi menumpuk karena baru diuji di akhir | Phase 07 membengkak tak terkendali | Uji E2E per alur ditambahkan sejak phase asalnya bila memungkinkan; phase ini merangkai, bukan memulai | `RS-04` |
| Ketersediaan pemangku UAT terbatas | `GL-02` tertunda dan memblokir rilis | Jadwal UAT disepakati sejak Phase 05, bukan diminta mendadak | `GL-02` |

## 11. Rollback Strategy

| Skenario | Tindakan |
|---|---|
| PR perbaikan menimbulkan regresi | Revert; suite E2E menangkapnya sebelum merge |
| UAT ditolak | Phase tidak lulus. Temuan dikelompokkan; cacat diperbaiki, CR dijadwal ulang. **Phase 08 tidak boleh dimulai** |
| Data UAT tercampur data produksi | Lingkungan UAT terpisah penuh (`NFR-M-09`); tidak ada jalur penulisan silang |

Phase ini tidak menyentuh skema maupun data produksi, sehingga tidak memerlukan strategi rollback basis data.

## 12. Definition of Done

**DoD dasar** — [PRD 29.5](../../PRD/01-product/delivery-plan.md).

**Tambahan khusus phase ini:**

- [ ] `GL-01`, `GL-02`, `GL-09` terpenuhi dan terdokumentasi
- [ ] Suite E2E berjalan di CI pada setiap PR, bukan hanya sekali
- [ ] Dokumen baseline `IMP-04` diserahkan ke sekolah
- [ ] Daftar CR pasca-UAT tercatat terpisah dan disepakati penjadwalannya
- [ ] Log phase terisi

---

*Phase ini tidak memuat requirement maupun keputusan desain baru. Setiap pernyataan merujuk PRD atau SDD.*
