# Rencana Rilis & Cutover

Strategi rilis **big bang** ditetapkan Keputusan #13 dan `DL-01`: sekolah menerima seluruh sistem sekaligus. Gerbang rilis `GL-01`–`GL-12`, requirement cutover `IMP-01`–`IMP-08`, dan model dukungan pasca-rilis ditetapkan [PRD Bab 29](../PRD/01-product/delivery-plan.md). Mekanika deploy dan rollback ditetapkan [`CD-01` … `CD-07`](../PRD/03-architecture/deployment-ops.md) serta [`SDD-16`](../SDD/16-infrastructure-deployment.md).

Yang ada di sini: **urutan pelaksanaannya** — siapa mengerjakan apa, dalam urutan apa, dan apa yang menghentikan rilis.

---

## 1. Bentuk rilis

| | |
|---|---|
| Rilis produksi | **Satu kali** — `v1.0.0` |
| Rilis staging | Setiap phase, 9 kali |
| Jendela deploy produksi | Di luar jam operasional, diumumkan H-2 (`CD-06`, `NFR-A-03`) |
| Cutover | Paralel manual + digital maksimum 2 pekan (`IMP-05`) |
| Hypercare | 8 pekan pasca go-live (`IMP-06`) |

**Konsekuensi big bang yang harus disadari:** tidak ada rilis produksi sebelumnya yang dapat dijadikan rujukan. Perilaku produksi pertama kali terlihat pada hari go-live. Itulah sebabnya staging menerima setiap phase — staging adalah satu-satunya tempat asumsi diuji sebelum taruhannya menjadi nyata.

## 2. Status gerbang rilis

Definisi tiap gerbang ada di [PRD 29.3](../PRD/01-product/delivery-plan.md) dan **tidak disalin** ke sini. Tabel berikut hanya memetakan gerbang → phase yang menutupnya.

| Gerbang | Ditutup pada | Bukti penutup |
|---|:---:|---|
| `GL-01` | Phase 07 | Seluruh AC Bab 8 terverifikasi QA |
| `GL-02` | Phase 07 | Berita acara UAT bertanda tangan tiga pihak |
| `GL-03` | Phase 08 | Laporan uji beban 150 pengguna serentak |
| `GL-04` | Phase 08 | Laporan pentest tanpa temuan High/Critical terbuka |
| `GL-05` | Phase 07 | Laporan `ST-05` (otorisasi 7 role) + `ST-06` (red-teaming chatbot) |
| `GL-06` | Phase 08 | Catatan DR drill + runbook terverifikasi |
| `GL-07` | Phase 08 | Pemberitahuan privasi terbit · DPA tertandatangani · persetujuan wali terkumpul · salinan surat persetujuan lintas yurisdiksi (`SDD-AI-16`) |
| `GL-08` | Phase 08 | ≥95% aset terdaftar (`SC-01`) · ≥95% berlabel QR (`SC-02`) |
| `GL-09` | Phase 07 | Approval rules terkonfigurasi & diverifikasi lewat pratinjau (`RE-07`) |
| `GL-10` | Phase 08 | Catatan pelatihan per role · minimal dua Administrator aktif (`BR-070a`) |
| `GL-11` | Phase 08 | Persetujuan Google Play dan App Store |
| `GL-12` | Phase 08 | Catatan uji rollback (`CD-05`) |

**Satu gerbang gagal = rilis ditunda** (PRD 29.3). Tidak ada pengesampingan, tidak ada "ditutup dengan catatan".

### 2.1 Gerbang yang bergantung pada pihak luar

Empat gerbang tidak dapat dipercepat oleh tim pengembang, dan ketiganya punya waktu tunggu yang tidak dapat ditekan:

| Gerbang | Bergantung pada | Mulai diurus paling lambat |
|---|---|---|
| `GL-04` | Penyedia pentest independen (`TBD-SEC-A`) | Awal Phase 07 |
| `GL-11` | Peninjauan Google Play & App Store | Awal Phase 07 |
| `GL-07` | Persetujuan wali seluruh akun siswa · DPA | Phase 05 — pengumpulan berjalan paralel |
| `GL-02` | Jadwal Petugas Sarpras, Wakasek Sarpras, Kepala Sekolah | Awal Phase 07 |

Peninjauan store dan pengumpulan persetujuan wali adalah dua penyebab keterlambatan go-live yang paling mudah diprediksi sekaligus paling sering diabaikan sampai terlambat.

## 3. Urutan rilis produksi

Mengikuti pipeline tag rilis [`SDD-16` §4.3](../SDD/16-infrastructure-deployment.md). Urutan yang dituliskan di sini mengikat.

```
H-14  Seluruh gerbang GL-01 … GL-12 diperiksa; satu gagal → tunda
H-2   Pengumuman jendela deploy                                (CD-06)
H-1   Backup penuh terverifikasi                               (PR-08-07, BR-DR-03)
H-1   Uji rollback terakhir di staging                         (GL-12, CD-05)

H     di luar jam operasional
  1   Aktifkan mode pemeliharaan
  2   Backup terakhir sebelum perubahan                        (BR-DR-01)
  3   Job migration dengan akun ber-DDL                        (CD-04, SDD-INF-03)
  4   Rolling deploy API dengan gerbang readiness              (SDD-INF-04)
  5   Drain + ganti worker                                     (SDD-INF-05)
  6   Smoke test produksi                                      (CD-07)
  7   Verifikasi /health melaporkan seluruh dependensi         (NFR-A-07, OBS-06)
  8   Nonaktifkan mode pemeliharaan
  9   Pemantauan intensif 2 jam

H+1   Hypercare dimulai                                        (IMP-06)
```

**Langkah 3 tidak boleh berisi migration contract.** Contract satu-satunya proyek ini (`PR-08-11`, penghapusan `users.unit_kerja`) dijalankan **sebelum** hari rilis, pada phase 08, setelah backup terverifikasi — bukan pada malam go-live. Alasannya ada di §5.

**Langkah 6 gagal = rollback, bukan perbaikan di tempat.** Memperbaiki produksi di dalam jendela pemeliharaan tanpa pengujian adalah cara insiden kecil menjadi insiden besar.

## 4. Urutan cutover

| Tahap | Kapan | Yang terjadi | Rujukan |
|---|---|---|---|
| Pendataan aset | Sejak Phase 03 (paling lambat `M2`) | Bertahap per gedung; pelabelan QR berbarengan | `IMP-01`, `IMP-03` |
| Template impor diserahkan | Paling lambat `M1` (Phase 03) | Sekolah mengisi data aset & pengguna | `IMP-02` |
| Baseline pra-implementasi | Phase 07, **sebelum** sistem dipakai | Durasi opname manual, waktu persetujuan kertas, tingkat pengembalian tepat waktu | `IMP-04` |
| Pelatihan per role | Phase 08 | Materi terpisah: Petugas Sarpras, Teknisi, Approver, pengguna umum | `IMP-07` |
| Go-live | Akhir Phase 08 | Rilis `v1.0.0` | — |
| Paralel manual + digital | ≤ 2 pekan pasca go-live | Pencatatan ganda; setelahnya manual dihentikan | `IMP-05` |
| Hypercare | 8 pekan pasca go-live | Dukungan responsif; penyesuaian konfigurasi tanpa CR formal | `IMP-06` |
| Serah terima dokumen | Sebelum go-live | Panduan per role, panduan Administrator, arsitektur, ERD, panduan deployment, DR runbook | `IMP-08` |

### 4.1 Butir yang tidak dapat diulang

**`IMP-04` — baseline pra-implementasi.** Angka pembanding hanya ada sebelum sistem dipakai. Setelah go-live, `SC-03`, `SC-06`, `SC-07`, dan `SC-08` tidak dapat dibuktikan **selamanya** — bukan tertunda, tidak dapat. Ini satu-satunya butir pada seluruh rencana yang jendelanya tertutup permanen.

**Pendataan aset.** `IMP-01` menetapkannya dimulai paling lambat pada `M2` justru karena ia tidak dapat dipercepat di akhir: 5.000 aset tidak dapat didata dan dilabeli dalam sepekan terakhir. Menunda mulainya berarti menunda `GL-08`, dan `GL-08` menunda go-live.

## 5. Strategi rollback

Mekanismenya ditetapkan `CD-05` dan [`SDD-16` §4.4](../SDD/16-infrastructure-deployment.md). Yang ditetapkan di sini: **apa yang dapat di-rollback pada tiap keadaan**.

| Keadaan | Dapat rollback? | Cara | Target |
|---|:---:|---|---|
| Aplikasi gagal setelah deploy, skema tidak berubah | Ya | Deploy image sebelumnya (5 rilis terakhir dipertahankan) | ≤ 15 menit |
| Aplikasi gagal, migration bertahap *expand* | Ya | Idem — kolom baru nullable, kode lama mengabaikannya | ≤ 15 menit |
| Aplikasi gagal, migration bertahap *migrate* | Ya | Idem — kedua bentuk data hidup berdampingan | ≤ 15 menit |
| Aplikasi gagal setelah *contract* | **Tidak** | Hanya lewat restore backup + PITR | RTO ≤ 4 jam |
| Kerusakan data | Tidak lewat deploy | PITR ke titik sebelum kerusakan (`BR-DR-01`) | RTO ≤ 4 jam |

**Inilah alasan seluruh contract ditunda ke Phase 08 dan dijalankan setelah backup terverifikasi.** Sepanjang delapan phase pertama, setiap kegagalan dapat dipulihkan dengan mengganti image — operasi 15 menit yang tidak menyentuh data. Begitu contract dijalankan, biaya kegagalan melonjak dari 15 menit menjadi 4 jam disertai kemungkinan kehilangan data. Menyatukan seluruh contract ke satu PR, setelah backup, membuat jendela berisiko itu sesempit mungkin.

**Urutan yang mengikat:** `PR-08-07` (backup terverifikasi) → `PR-08-11` (contract) → `PR-08-10` (migrasi data produksi). Menjalankan contract sebelum backup menghapus satu-satunya jaring pengaman yang dimiliki keduanya.

### 5.1 Rollback per phase

Rollback tingkat phase (bukan produksi) berlaku selama pengembangan. Rinciannya ada di bagian 11 tiap berkas phase. Ringkasannya:

| Phase | Risiko rollback | Alasan |
|:---:|---|---|
| 00 | Tertinggi secara mekanis, terendah secara konsekuensi | Reset repo penuh masih sah — belum ada data |
| 01 | Rendah | Master data; ekspansi kolom belum dipakai |
| 02 | **Tertinggi** | Tiga tulang punggung; skema `booking_slots` menentukan bentuk seluruh reservasi |
| 03–05 | Sedang | Data operasional sudah ada di staging; revert PR memerlukan pemeriksaan data |
| 06 | Terendah | Seluruh isinya baca-saja |
| 07 | Rendah | Perbaikan cacat, bukan struktur baru |
| 08 | Tinggi pada `PR-08-10` & `PR-08-11` | Menyentuh produksi dan skema permanen |

## 6. Yang menghentikan rilis

| Pemicu | Tindakan |
|---|---|
| Satu gerbang `GL-xx` tidak terpenuhi | Rilis ditunda (PRD 29.3) |
| Temuan pentest High/Critical terbuka | `GL-04` gagal → ditunda |
| Smoke test produksi gagal | Rollback ke image sebelumnya; rilis dijadwalkan ulang |
| Uji rollback gagal di staging | `GL-12` gagal → ditunda |
| Backup terakhir tidak terverifikasi | Deploy dibatalkan sebelum langkah 3 |
| Persetujuan wali belum lengkap untuk akun siswa | `GL-07` gagal → ditunda |

Bila jadwal tertekan, jalan yang tersedia adalah **scope-cut ladder** [PRD 29.4](../PRD/01-product/delivery-plan.md) — memotong lingkup dari urutan 1 ke bawah, berhenti di GARIS BATAS. Bukan mengesampingkan gerbang. Gerbang dan lingkup adalah dua tuas berbeda; hanya satu di antaranya boleh ditarik.

## 7. Setelah go-live

| Pekan | Yang berlaku |
|---|---|
| 1–2 | Paralel manual + digital (`IMP-05`) · hypercare aktif |
| 3–8 | Hypercare berlanjut (`IMP-06`) — penyesuaian konfigurasi tanpa CR formal |
| 9+ | Model dukungan normal L1/L2/L3 (PRD 29.7) · perubahan lewat CR tertulis |

Batas antara pekan 8 dan 9 adalah batas antara "menyesuaikan sistem yang baru dipakai" dan "mengubah lingkup". Menggeser batas itu diam-diam adalah cara sebuah proyek kehilangan akhir.

---

*Dokumen ini tidak memuat requirement, keputusan desain, maupun business rule baru. Gerbang rilis, requirement cutover, model dukungan, dan mekanika deploy tetap milik [PRD Bab 29](../PRD/01-product/delivery-plan.md), [`CD-01`…`CD-07`](../PRD/03-architecture/deployment-ops.md), dan [`SDD-16`](../SDD/16-infrastructure-deployment.md).*
