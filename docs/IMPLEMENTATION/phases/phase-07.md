# Phase 07 — Integrasi Lintas Modul & UAT

| | |
|---|---|
| **Milestone PRD** | Bagian `M6 — Pengerasan & Kesiapan Rilis` — gerbang `GL-01`, `GL-02` |
| **Status** | `Not Started` |
| **Modul PRD** | — (tidak ada modul baru; seluruh 21 modul diuji sebagai satu sistem) |
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
| Phase 06 | Seluruh 21 modul harus hidup — UAT atas sistem separuh jadi tidak dapat ditandatangani |
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

| PR | Judul | Kompleksitas | Bergantung | FR/SDD | Acceptance |
|---|---|:---:|---|---|---|
| `PR-07-01` | Kerangka uji E2E + data uji berskala nyata | L | Ph06 | `test-strategy.md` | 5.000 aset, 500 pengguna, satu tahun ajaran |
| `PR-07-02` | E2E: siklus hidup aset penuh (pengadaan → penghapusan) | L | 01 | Bab 15 | Satu aset melewati seluruh transisi status |
| `PR-07-03` | E2E: reservasi ruangan → penggunaan → penyelesaian | M | 01 | `FR-07.1` … `FR-07.4` | Termasuk jalur pembatalan dan bentrok |
| `PR-07-04` | E2E: reservasi barang → pinjam → kembali → denda | L | 01 | `FR-08.x`, `FR-09.x` | Termasuk keterlambatan dan perpanjangan |
| `PR-07-05` | E2E: kerusakan → work order → servis → verifikasi | M | 01 | `FR-11.x`, `FR-12.x`, `BR-052` | Kriteria keluar `M3` PRD |
| `PR-07-06` | E2E: opname → selisih → tindak lanjut → penghapusan | M | 01 | `FR-13.x`, `FR-21.x`, `BR-012` | Aset hilang sampai ke berita acara |
| `PR-07-07` | E2E: approval bertingkat lintas jenis pengaju | M | 01 | `FR-10.x`, Lampiran D | Satu konfigurasi rule melayani empat pengaju berbeda |
| `PR-07-08` | Uji otorisasi tujuh role menyeluruh | L | 01 | `GL-05`, `ST-05`, `PM-02` `PM-03` | Nol kebocoran lintas role |
| `PR-07-09` | Rekonsiliasi silang: analitik ⇄ operasional ⇄ activity log | M | 01, Ph06 | `FR-16.1`, `AL-01` | Selisih nol; bila ada, terjelaskan |
| `PR-07-10` | Eval chatbot penuh: *golden set* + red-teaming per role | L | 01, Ph03 | `SC-10`, `ST-06`, `SDD-AI-11` | Kriteria `GL-05` bagian chatbot |
| `PR-07-11` | Uji korelasi `request_id` lintas modul | S | 01 | `SDD-OBS-05` | Satu permintaan tertelusur dari API sampai worker |
| `PR-07-12` | Verifikasi matriks keterlacakan otomatis | M | 02 … 08 | `traceability.md` | FR tanpa uji menggagalkan CI |
| `PR-07-13` | Perbaikan cacat integrasi — batch 1 | M | 02 … 09 | — | Setiap perbaikan menunjuk uji E2E yang gagal |
| `PR-07-14` | Perbaikan cacat integrasi — batch 2 (pasca-UAT) | M | UAT | — | Hanya cacat; permintaan fitur ditolak ke CR |

> `PR-07-13` dan `PR-07-14` sengaja tidak dirinci — isinya ditentukan temuan. Kompleksitas **M** adalah pagu; bila satu perbaikan melampauinya, ia dipecah menjadi PR tersendiri.

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
