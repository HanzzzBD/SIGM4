# Rencana Pelaksanaan — SIGM4

Dokumen ini berisi **hanya yang tidak ada di [PRD Bab 29](../PRD/01-product/delivery-plan.md)**: urutan pull request, lintasan kritis, pembagian jalur kerja, dan aturan penjadwalan ulang.

Yang **tidak** ada di sini karena sudah dimiliki PRD dan cukup dirujuk: milestone (`M0`–`M6`, 29.2) · kriteria keluar milestone (29.2) · gerbang rilis (`GL-01`–`GL-12`, 29.3) · scope-cut ladder (29.4) · Definition of Done (29.5) · requirement implementasi & cutover (`IMP-01`–`IMP-08`, 29.6) · model dukungan pasca-rilis (29.7).

Urutan phase dan graf dependensinya ada di [`ROADMAP.md`](ROADMAP.md) dan tidak diulang.

---

## 1. Ringkasan volume

| Phase | Modul | PR | Kompleksitas dominan | Catatan |
|:---:|:---:|:---:|---|---|
| 00 | — | 18 | M | Tidak ada modul fungsional; seluruhnya kerangka |
| 01 | 4 | 14 | S–M | Paralelisme tertinggi — empat modul saling bebas |
| 02 | 5 | 30 | M–L | **Phase terbesar.** Menanam tiga tulang punggung sekaligus |
| 03 | 6 | 23 | M | Enam modul bebas satu sama lain |
| 04 | 3 | 14 | M | Sebagian besar memakai ulang abstraksi Phase 02 |
| 05 | 2 | 14 | M | Menutup dua milestone |
| 06 | 1 | 10 | M–L | Satu modul, ketergantungan baca ke seluruh sistem |
| 07 | — | 14 | M | Integrasi & UAT; banyak aktivitas non-PR |
| 08 | — | 15 | S–M | Pengerasan; banyak aktivitas non-PR |
| **Total** | **21** | **152** | | |

Skala kompleksitas PR mengikuti [`templates/PHASE-TEMPLATE.md`](templates/PHASE-TEMPLATE.md): **S** ≤ 200 baris berubah · **M** ≤ 400 · **L** > 400 dan wajib disertai alasan di deskripsi PR.

**Phase 02 memuat 20% seluruh PR proyek.** Bila jadwal meleset, di sinilah paling mungkin terjadi — dan konsekuensinya menjalar ke seluruh phase sesudahnya karena ia berada di lintasan kritis.

## 2. Urutan pull request

Urutan penuh per-PR ada di bagian 7 tiap berkas phase. Di sini hanya **aturan urutan yang melintasi phase** — yang tidak terlihat bila hanya membaca satu berkas phase.

### 2.1 Urutan yang wajib

| Lebih dulu | Kemudian | Alasan |
|---|---|---|
| `PR-00-04` koneksi DB + `AuthContext` | seluruh PR repository | Repository tanpa `AuthContext` akan lolos review dan bocor diam-diam |
| `PR-00-05` migration runner | seluruh PR skema | Skema di luar runner tidak tereplikasi ke lingkungan lain |
| `PR-00-09` route registry + validasi permission saat *startup* | seluruh PR endpoint | Endpoint tanpa permission terdeklarasi harus gagal saat boot, bukan saat pentest |
| `PR-00-13` `AuditLogger` | seluruh PR operasi tulis | `AL-01` mensyaratkan setiap tulis tercatat; menambahkannya belakangan berarti menyisir ulang ratusan handler |
| `PR-01-04` matriks permission | `PR-02-xx` seluruhnya | Approval mengevaluasi role; role harus berversi lebih dulu |
| `PR-02-16` `booking_slots` + exclusion constraint | `PR-03-08`, `PR-04-01` | Bentuk skema ketersediaan tidak boleh disisipkan setelah ada reservasi hidup |
| `PR-02-17` `SlotService` | `PR-03-08`, `PR-04-01`, `PR-05-01` | Satu abstraksi melayani ruangan, barang, dan peminjaman |
| `PR-02-19` evaluator DSL | `PR-03-xx`, `PR-04-xx`, `PR-05-xx` approval | Setiap modul berpersetujuan memanggil evaluator yang sama |
| `PR-02-10` `assets.procurement_id` nullable | `PR-03-19` pengisian pertama | Pemutus siklus M-04 ↔ M-14 |
| `PR-01-13` titik ekstensi `SL-04` | `PR-05-09` penutupan `SL-04` | Definisi "kewajiban aktif" baru dapat ditulis setelah peminjaman & denda ada |
| `PR-08-07` backup terverifikasi | `PR-08-10` migrasi produksi **dan** `PR-08-11` contract | Melanggar urutan ini menghapus satu-satunya jaring pengaman keduanya |

Melanggar salah satu baris di atas bukan sekadar tidak rapi — masing-masing menimbulkan kerja bongkar-pasang yang biayanya jauh melebihi menunggu.

### 2.2 Urutan yang bebas

Di dalam satu phase, PR milik modul berbeda boleh berjalan serentak kecuali kolom **Bergantung** pada tabel PR phase menyatakan sebaliknya. Contoh: pada Phase 01, keempat modul (M-02, M-03, M-18, M-20) boleh dikerjakan empat orang secara bersamaan sejak hari pertama.

### 2.3 Aturan PR yang berlaku menyeluruh

- Satu PR menyelesaikan **satu** hal yang dapat dijelaskan dalam satu kalimat. Bila judulnya memakai "dan", pertimbangkan memecahnya.
- PR berkompleksitas **L** wajib memuat alasan mengapa tidak dipecah.
- PR yang mengubah skema tidak boleh sekaligus mengubah perilaku. Migrasi dulu, pemakaian menyusul.
- PR yang menyentuh `SlotService`, evaluator DSL, atau lapisan permission wajib melalui tinjauan arsitek — ketiganya adalah tulang punggung bersama.
- Setiap PR merujuk minimal satu ID PRD **atau** satu ID SDD. PR tanpa rujukan berarti mengerjakan sesuatu yang tidak diminta.

## 3. Lintasan kritis

Rantai yang panjangnya menentukan tanggal go-live. Menambah orang **tidak** mempersingkatnya.

| # | PR | Phase | Mengapa mengunci rantai |
|:---:|---|:---:|---|
| 1 | `PR-00-04` | 00 | Tidak ada akses data sebelum ini |
| 2 | `PR-00-05` | 00 | Tidak ada skema sebelum ini |
| 3 | `PR-01-04` | 01 | Otorisasi adalah prasyarat setiap endpoint |
| 4 | `PR-02-16` | 02 | Bentuk skema ketersediaan |
| 5 | `PR-02-17` | 02 | Semantik reservasi untuk tiga modul |
| 6 | `PR-02-19` | 02 | Semantik persetujuan untuk enam modul |
| 7 | `PR-03-08` | 03 | Konsumen pertama `SlotService` — membuktikan abstraksinya benar |
| 8 | `PR-04-01` | 04 | Konsumen kedua — membuktikan abstraksinya umum |
| 9 | `PR-05-01` | 05 | Menutup rantai reservasi → serah terima |
| 10 | `PR-07-xx` | 07 | Uji ujung-ke-ujung mensyaratkan seluruhnya hidup |
| 11 | `PR-08-10` | 08 | Migrasi produksi |

**Titik verifikasi.** Langkah 7 dan 8 adalah tempat kesalahan desain Phase 02 muncul. Bila `PR-04-01` menuntut perubahan pada `SlotService`, itu bukan kerja kecil — itu tanda abstraksi Phase 02 kurang umum, dan perubahannya wajib melalui tinjauan arsitek sebelum ditulis.

**Cadangan waktu.** PRD tidak menetapkan tanggal, jadi dokumen ini pun tidak. Yang ditetapkan di sini: cadangan waktu ditempatkan **sebelum** langkah 4–6 dan sebelum langkah 10, bukan disebar rata. Ketiga langkah tulang punggung dan migrasi produksi adalah tempat ketidakpastian sesungguhnya berada.

## 4. Jalur kerja paralel

PRD tidak menetapkan ukuran tim. Tabel ini menyusun **jalur kerja**, bukan jumlah orang — satu orang boleh memegang beberapa jalur, dan jalur yang sama boleh dipegang beberapa orang.

| Jalur | Isi | Aktif sejak | Bergantung pada |
|---|---|:---:|---|
| **Fondasi** | Kerangka, migration, shared kernel, CI/CD | Phase 00 | — |
| **Backend inti** | Modul domain, service, repository | Phase 01 | Fondasi |
| **Frontend web** | Layar, state, komponen kalender | Phase 01 | Kontrak API tiap modul |
| **Mobile** | Scan QR, opname, work order, approval, pelaporan kerusakan | Phase 01 | API yang sudah stabil |
| **QA** | Uji otomatis, uji konkurensi, uji otorisasi | Phase 00 | Berjalan sepanjang proyek |
| **DevOps** | Lingkungan, observability, backup, rilis | Phase 00 | Berjalan sepanjang proyek |
| **Data & migrasi** | Pendataan aset, pelabelan QR, template impor | Phase 02 | `IMP-01`, `IMP-02`, `IMP-03` |

**Mobile paralel sejak M1** sesuai PRD 29.2, mengikuti API yang telah stabil pada tiap milestone. Modul wajib-mobile (scan QR, opname, work order, approval, pelaporan kerusakan) selesai paling lambat pada `M4` — yaitu setelah Phase 05.

**Jalur Data & migrasi berjalan di luar kode.** `IMP-01` mensyaratkan pendataan aset dimulai paling lambat pada `M2` — yaitu selama Phase 03–04, bukan menjelang go-live. Ini jalur terpanjang kedua setelah lintasan kritis, dan satu-satunya yang tidak dapat dipercepat oleh tim pengembang.

### 4.1 Titik sinkronisasi antar-jalur

| Titik | Jalur yang bertemu | Yang disepakati |
|---|---|---|
| Akhir Phase 00 | seluruhnya | Kerangka, konvensi, pipeline hijau |
| Kontrak API tiap modul | Backend ⇄ Frontend ⇄ Mobile | OpenAPI terbit sebelum layar dibangun (`NFR-M-05`) |
| Akhir Phase 02 | Backend ⇄ QA | Uji konkurensi 50 permintaan simultan lolos (kriteria keluar `M2`) |
| Akhir Phase 05 | Mobile ⇄ Backend | Seluruh modul wajib-mobile selesai (`M4`) |
| Awal Phase 07 | seluruhnya | Sistem lengkap di staging; UAT dimulai |
| Sebelum `PR-08-10` | DevOps ⇄ Data | Backup terverifikasi mendahului migrasi produksi |

## 5. Cakupan SDD

Setiap berkas SDD harus punya phase yang menerapkannya. Bila tidak, salah satu dari dua hal terjadi: desainnya tidak dibangun, atau ada pekerjaan yang tidak terencana.

| Berkas SDD | Diterapkan pada phase |
|---|---|
| [`00-system-architecture.md`](../SDD/00-system-architecture.md) | 00 |
| [`01-availability-concurrency.md`](../SDD/01-availability-concurrency.md) | 02, 03, 04, 05 |
| [`02-approval-engine.md`](../SDD/02-approval-engine.md) | 02, 03, 04, 05 |
| [`03-authorization.md`](../SDD/03-authorization.md) | 01, 02, 06, 07 |
| [`04-authentication-session.md`](../SDD/04-authentication-session.md) | 02 |
| [`05-database-design.md`](../SDD/05-database-design.md) | 00, 01, 03, 04, 06, 08 |
| [`06-api-design.md`](../SDD/06-api-design.md) | 00, 01, 06 |
| [`07-event-flow.md`](../SDD/07-event-flow.md) | 00, 02, 04, 07 |
| [`08-notification-design.md`](../SDD/08-notification-design.md) | 02 |
| [`09-file-storage-design.md`](../SDD/09-file-storage-design.md) | 03, 05 |
| [`10-ai-orchestrator-design.md`](../SDD/10-ai-orchestrator-design.md) | 03, 07 |
| [`11-frontend-architecture.md`](../SDD/11-frontend-architecture.md) | 02, 03, 06 |
| [`12-mobile-architecture.md`](../SDD/12-mobile-architecture.md) | 03, 04, 05, 08 |
| [`13-security-design.md`](../SDD/13-security-design.md) | 05, 08 |
| [`14-performance-design.md`](../SDD/14-performance-design.md) | 02, 06, 08 |
| [`15-observability-logging.md`](../SDD/15-observability-logging.md) | 00, 01, 07, 08 |
| [`16-infrastructure-deployment.md`](../SDD/16-infrastructure-deployment.md) | 00, 08 |
| [`17-repo-layout.md`](../SDD/17-repo-layout.md) | 00 (`PR-00-01`) |

**18 dari 18 berkas SDD terpakai.** Tidak ada desain yang menganggur, tidak ada phase yang membangun sesuatu tanpa desain.

## 6. Strategi migrasi skema

Pola `expand → migrate → contract` ditetapkan [`SDD-DB-08`](../SDD/05-database-design.md). Yang ditetapkan di sini hanyalah **kapan tiap langkah dijalankan**.

| Langkah | Kapan | Alasan |
|---|---|---|
| **Expand** — tambah kolom/tabel baru, lama tetap hidup | Phase tempat kebutuhannya muncul | Kode lama dan baru berjalan berdampingan; deploy tidak perlu serentak |
| **Migrate** — isi struktur baru, ganda-tulis | Phase yang sama atau berikutnya | Data lama terisi tanpa jeda layanan |
| **Contract** — buang struktur lama | **Phase 08 saja** | Setelah tidak ada lagi kode yang membacanya, dan setelah backup terverifikasi |

**Seluruh contract ditunda ke Phase 08 dan disatukan pada `PR-08-11`.** Konsekuensinya: kolom usang hidup lebih lama dari yang nyaman — `users.unit_kerja` bertahan dari Phase 01 sampai Phase 08. Itu ditukar dengan sesuatu yang lebih berharga: sepanjang delapan phase, setiap rollback cukup dengan `git revert`, tanpa memulihkan kolom yang sudah dibuang.

Migrasi berjalan yang saat ini terencana:

| Migrasi | Expand | Migrate | Contract |
|---|:---:|:---:|:---:|
| `users.unit_kerja` → `work_unit_id` | `PR-01-12` | `PR-01-12` | `PR-08-11` |

Bila migrasi berjalan lain muncul selama pengerjaan, ia ditambahkan ke tabel ini dan contract-nya masuk `PR-08-11`.

## 7. Urutan pengujian

| Tingkat | Kapan ditulis | Gerbang |
|---|---|---|
| Unit — logika bisnis | Bersama PR yang membuat logikanya | PR tidak digabung tanpa ini (DoD 29.5) |
| Integrasi — endpoint | Bersama PR endpoint | Idem |
| Konkurensi | `PR-02-17`, `PR-02-21`, lalu setiap konsumennya | Kriteria keluar `M2` |
| Otorisasi per role | Setiap PR endpoint; menyeluruh di Phase 07 | `GL-05` (`ST-05`) |
| Ujung-ke-ujung lintas modul | Phase 07 | `GL-01` |
| Red-teaming chatbot | Phase 03 (dasar), Phase 07 (menyeluruh) | `GL-05` (`ST-06`) |
| Uji beban 150 pengguna serentak | Phase 08 | `GL-03` |
| Penetration test | Phase 08 | `GL-04` |
| DR drill | Phase 08 | `GL-06` |
| UAT | Phase 07 | `GL-02` |

Urutannya bukan kebetulan: uji beban dan pentest dijalankan **setelah** UAT, karena mengeraskan sistem yang masih akan berubah karena temuan UAT adalah pekerjaan yang harus diulang.

## 8. Urutan penempatan (*deployment*)

| Lingkungan | Kapan menerima | Sumber | Rujukan |
|---|---|---|---|
| Lokal | Setiap saat | *feature branch* | `CD-03` |
| Integrasi | Setiap penggabungan PR | `develop` | `CD-03` |
| Staging | Otomatis pada setiap penggabungan `develop` → `staging` | `staging` | `CD-03`, `PR-00-18` |
| Produksi | Sekali, pada go-live | tag `vMAJOR.MINOR.PATCH` dari `main` | `CD-03`, `CD-06` |

Strategi rilis **big bang** ditetapkan Keputusan #13 dan tidak diubah di sini: sekolah menerima sistem sekaligus. Yang ada di sini adalah checkpoint internalnya — staging menerima setiap phase, produksi menerima satu kali. Rinciannya di [`RELEASE-PLAN.md`](RELEASE-PLAN.md).

## 9. Bila jadwal tertekan

Urutan pemotongan lingkup ditetapkan [PRD 29.4](../PRD/01-product/delivery-plan.md) dan **tidak boleh diubah oleh dokumen ini**. Yang ditambahkan di sini hanyalah terjemahannya ke PR:

| Urutan 29.4 | Yang dipotong | PR terdampak |
|:---:|---|---|
| 1 | Perbandingan antar-periode analitik (`FR-16.1` A3) | sebagian `PR-06-03` … `PR-06-07` |
| 2 | Preferensi notifikasi per jenis (`FR-17.3`) | `PR-02-28` |
| 3 | Reservasi berulang (`FR-07.2` A4) | bagian berulang pada `PR-03-09` … `PR-03-11` |
| 4 | Delegasi approver (`FR-10.2` A3) | bagian delegasi pada `PR-02-20` |
| 5 | Chatbot AI (M-19) ditunda | `PR-03-20` … `PR-03-23` |
| 6 | Laporan analitik lanjutan (Kebutuhan Pengadaan, Tren Kerusakan) | `PR-06-04`, `PR-06-07` |
| — | **GARIS BATAS** — di bawah ini tidak dapat dipotong | |

Pemotongan di luar daftar ini memerlukan persetujuan pemilik produk, bukan keputusan tim pengembang.

## 10. Penjadwalan ulang

Bila sebuah phase meleset, yang **tidak** boleh dilakukan: memindahkan PR ke phase berikutnya tanpa memeriksa dependensinya, atau memulai phase berikutnya sementara phase sekarang belum memenuhi DoD-nya.

Yang dilakukan:

1. Periksa apakah PR yang meleset ada di lintasan kritis (§3). Bila tidak, phase berikutnya boleh dimulai untuk PR yang tidak bergantung padanya.
2. Bila ada di lintasan kritis, seluruh rantai bergeser. Catat pergeseran di [`IMPLEMENTATION-STATUS.md`](IMPLEMENTATION-STATUS.md) dan di log phase, jangan diserap diam-diam.
3. Bila pergeseran mengancam tanggal go-live, jalankan scope-cut ladder §9 dari urutan 1 — bukan memotong butir yang paling mudah dipotong.

---

*Dokumen ini tidak memuat requirement, keputusan desain, maupun business rule baru. Setiap pernyataan merujuk [PRD](../PRD/) atau [SDD](../SDD/).*
