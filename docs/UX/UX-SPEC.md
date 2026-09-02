# UX Specification — SIGM4

**SIGM4 — Sistem Informasi Management 4set** · Sarana dan Prasarana Sekolah

> **Dokumentasi UX SIGM4** — **Overview** · [Information Architecture](INFORMATION-ARCHITECTURE.md) · [Navigation](NAVIGATION.md) · [Page Specification](PAGE-SPECIFICATION.md) · [User Flows](USER-FLOWS.md) · [Decisions](DECISIONS.md)

| Item | Keterangan |
|---|---|
| **Berkas** | `docs/UX/UX-SPEC.md` — entry point dokumentasi UX |
| **Versi** | 1.0 |
| **Tanggal** | 22 Agustus 2026 |
| **Status** | Draft untuk review — siap dipakai sebagai blueprint wireframe |
| **Basis** | [`docs/PRD/`](../PRD/) (Source of Truth) · [`docs/SDD/`](../SDD/) (turunan) |
| **Ditujukan untuk** | UI/UX Designer, Frontend Developer, Mobile Developer, QA |

---

## Batas dokumen ini

UX-SPEC menjawab **bagaimana requirement disajikan kepada pengguna**: halaman apa yang ada, bagaimana pengguna berpindah di antaranya, dan keadaan apa yang wajib ditangani tiap layar.

| Lapisan | Menjawab | Otoritas |
|---|---|---|
| [`PRD/`](../PRD/) | **Apa** yang dibangun | **Source of Truth** |
| [`SDD/`](../SDD/) | **Bagaimana** dirancang secara teknis | Turunan PRD |
| **UX-SPEC** (berkas ini) | **Bagaimana** disajikan kepada pengguna | Turunan PRD & SDD |
| [`IMPLEMENTATION/`](../IMPLEMENTATION/) | **Bagaimana** dikerjakan | Turunan PRD & SDD |

**Aturan berikut berlaku bagi seluruh berkas dalam `docs/UX/`:**

1. **Tidak ada requirement baru.** Setiap halaman, aksi, dan keadaan merujuk ID PRD/SDD. Baris tanpa rujukan ID adalah **User Decision** yang tercatat pada [§12 UX Decision Log](DECISIONS.md#12-ux-decision-log) — tidak ada kategori ketiga.
2. **Tidak menyalin teks PRD/SDD.** Rujukan memakai ID (`FR-08.2`, `BR-024b`, `CAL-UI-05`, `SDD-FE-04`), bukan kutipan.
3. **Titik yang belum ditetapkan tidak ditebak.** Ia ditandai `BLOCKED` pada [§12](DECISIONS.md#123-keputusan-yang-masih-terbuka) beserta ID TBD-nya.
4. Bila UX-SPEC bertentangan dengan PRD, **PRD yang berlaku** dan berkas ini wajib disesuaikan.
5. Dokumentasi ini **tidak** memuat design token, palet warna, tipografi, maupun wireframe. Itu milik [`ui-foundation.md`](../PRD/04-frontend/ui-foundation.md) (`DS-01`, `DS-02`) dan deliverable `DS-03`.

**Konvensi notasi**

| Notasi | Arti |
|---|---|
| `FR-xx.y` `BR-xxx` `CAL-UI-xx` `UX-xx` | Rujukan PRD |
| `SDD-FE-xx` `SDD-MOB-xx` `SDD-AUTH-xx` | Rujukan SDD |
| **UXD-xx** | Keputusan UX pada dokumentasi ini ([§12](DECISIONS.md#12-ux-decision-log)) |
| `BLOCKED` | Menunggu keputusan; tercatat di [`TBD-REGISTER.md`](../SDD/TBD-REGISTER.md) |
| 🔒 | Dibatasi permission; dirender lewat `<Can>` dari `GET /me` (`PM-04`, `SDD-FE-04`) |
| `P-xx` · `MS-xx` | Halaman web · layar mobile ([§6](PAGE-SPECIFICATION.md#6-page-inventory)) |
| `F-xx` | User flow ([§9](USER-FLOWS.md#9-user-flows)) |

---

## Peta dokumen

Dokumentasi UX terbagi enam berkas. **Berkas ini adalah entry point.**

| Berkas | Isi | Bagian |
|---|---|---|
| **`UX-SPEC.md`** *(berkas ini)* | Overview, prinsip, role & sasaran, lingkup, dan traceability requirement → UX | §1 · §2 · §3-Lingkup · §13 |
| [`INFORMATION-ARCHITECTURE.md`](INFORMATION-ARCHITECTURE.md) | Information architecture, pemetaan 22 modul, kedalaman hierarki, sitemap web & mobile | §3 · §4 |
| [`NAVIGATION.md`](NAVIGATION.md) | Kerangka layar, topbar, sidebar, breadcrumb, navigasi mobile, navigasi berbasis role, deep link | §5 |
| [`PAGE-SPECIFICATION.md`](PAGE-SPECIFICATION.md) | Page inventory 87 halaman + 23 layar mobile, arketipe layout, pola keadaan, spesifikasi halaman kunci, dashboard, responsif, aksesibilitas | §6 · §7 · §8 · §10 · §11 |
| [`USER-FLOWS.md`](USER-FLOWS.md) | 27 user flow beserta diagram Mermaid | §9 |
| [`DECISIONS.md`](DECISIONS.md) | Keputusan UX, keputusan terbuka/`BLOCKED`, konflik PRD/SDD, dan daftar layar yang sengaja tidak dibuat | §12 |

### Peta bagian → berkas

**Penomoran bagian dipertahankan** dari UX-SPEC v1.0 agar seluruh rujukan silang (`§7.6.1`, `§9.5`, `§12.3`, …) yang tersebar di dokumentasi tetap sahih. Gunakan tabel ini untuk menemukan berkas pemilik sebuah nomor bagian.

| § | Bagian | Berkas |
|---|---|---|
| [1](#1-ux-principles) | UX Principles | `UX-SPEC.md` |
| [2](#2-user-roles--goals) | User Roles & Goals | `UX-SPEC.md` |
| [3](INFORMATION-ARCHITECTURE.md#3-information-architecture) | Information Architecture | [`INFORMATION-ARCHITECTURE.md`](INFORMATION-ARCHITECTURE.md) |
| [4](INFORMATION-ARCHITECTURE.md#4-sitemap) | Sitemap | [`INFORMATION-ARCHITECTURE.md`](INFORMATION-ARCHITECTURE.md) |
| [5](NAVIGATION.md#5-navigation-architecture) | Navigation Architecture | [`NAVIGATION.md`](NAVIGATION.md) |
| [6](PAGE-SPECIFICATION.md#6-page-inventory) | Page Inventory | [`PAGE-SPECIFICATION.md`](PAGE-SPECIFICATION.md) |
| [7](PAGE-SPECIFICATION.md#7-page-specification) | Page Specification | [`PAGE-SPECIFICATION.md`](PAGE-SPECIFICATION.md) |
| [8](PAGE-SPECIFICATION.md#8-dashboard-specification) | Dashboard Specification | [`PAGE-SPECIFICATION.md`](PAGE-SPECIFICATION.md) |
| [9](USER-FLOWS.md#9-user-flows) | User Flows | [`USER-FLOWS.md`](USER-FLOWS.md) |
| [10](PAGE-SPECIFICATION.md#10-responsive-ux) | Responsive UX | [`PAGE-SPECIFICATION.md`](PAGE-SPECIFICATION.md) |
| [11](PAGE-SPECIFICATION.md#11-accessibility-ux) | Accessibility UX | [`PAGE-SPECIFICATION.md`](PAGE-SPECIFICATION.md) |
| [12](DECISIONS.md#12-ux-decision-log) | UX Decision Log | [`DECISIONS.md`](DECISIONS.md) |
| [13](#13-requirement--ux-traceability) | Requirement → UX Traceability | `UX-SPEC.md` |

### Mulai dari mana

| Peran | Mulai dari |
|---|---|
| UI/UX Designer menyusun wireframe (`DS-03`) | [§6 Page Inventory](PAGE-SPECIFICATION.md#6-page-inventory) lalu [§7 Page Specification](PAGE-SPECIFICATION.md#7-page-specification) |
| Frontend Developer | [§5 Navigation](NAVIGATION.md#5-navigation-architecture) · [§7.1 Arketipe layout](PAGE-SPECIFICATION.md#71-empat-arketipe-layout) · [§7.3 Pola lima keadaan](PAGE-SPECIFICATION.md#73-pola-lima-keadaan-global) |
| Mobile Developer | [§4.3 Sitemap mobile](INFORMATION-ARCHITECTURE.md#43-sitemap-mobile) · [§5.5 Navigasi mobile](NAVIGATION.md#55-navigasi-mobile) · [§6.11 Layar mobile](PAGE-SPECIFICATION.md#611-layar-mobile) |
| QA menyusun kasus uji | [§9 User Flows](USER-FLOWS.md#9-user-flows) · [§7.3 Keadaan](PAGE-SPECIFICATION.md#73-pola-lima-keadaan-global) · [§11.6 Daftar periksa aksesibilitas](PAGE-SPECIFICATION.md#116-daftar-periksa-aksesibilitas-per-komponen-ds-06) |
| Product Owner meninjau keputusan | [§12 Decisions](DECISIONS.md#12-ux-decision-log) · [§13.4 Ringkasan cakupan](#134-ringkasan-cakupan) |
| Software Architect | [§12.3 Keputusan terbuka](DECISIONS.md#123-keputusan-yang-masih-terbuka) · [§12.4 Konflik](DECISIONS.md#124-konflik--ambiguitas-yang-ditemukan) |

---

# 1. UX Principles

## 1.1 Prinsip yang mengikat (dari PRD)

Enam prinsip berikut **bukan milik berkas ini** — ia ditetapkan [`ui-foundation.md §31.1`](../PRD/04-frontend/ui-foundation.md) dan dirujuk di sini karena setiap keputusan pada §5–§1| `UX-01` | Mobile-first untuk alur lapangan, desktop-first untuk alur administratif | Pembagian tegas lingkup web ↔ mobile ([§6.3](PAGE-SPECIFICATION.md#63-batas-lingkup-web--mobile)); mobile hanya memuat alur lapangan (`SDD-MOB` §4.1) |
| `UX-02` | Scan QR jalan pintas utama; input kode manual selalu tersedia | Scan mendapat posisi permanen di navigasi mobile (**UXD-03**) dan entri sidebar di web; setiap layar pemindai wajib menampilkan tombol "Masukkan kode aset manual" tanpa disembunyikan (`FR-05.2 A1`, `MOB-MED-06`) |
| `UX-03` | Status selalu disertai teks dan ikon, tidak pernah hanya warna | Satu komponen `LencanaStatus` untuk seluruh enum Bab 11.3 ([§11.4](PAGE-SPECIFICATION.md#114-lencana-status--kalender)); lima keadaan slot kalender dibedakan warna **dan** pola **dan** teks (`CAL-UI-05`) |
| `UX-04` | Aksi destruktif selalu memerlukan konfirmasi dan alasan | Daftar lengkap aksi berkonfirmasi-beralasan pada [§7.2](PAGE-SPECIFICATION.md#72-pola-aksi-destruktif) |
| `UX-05` | Tidak ada jalan buntu | Setiap halaman pada [§6](PAGE-SPECIFICATION.md#6-page-inventory) memiliki kolom **Exit point** yang tidak boleh kosong; lima keadaan global ([§7.3](PAGE-SPECIFICATION.md#73-pola-lima-keadaan-global)) masing-masing menyertakan aksi berikutnya |
| `UX-06` | Bahasa Indonesia baku, bukan istilah teknis | Kode enum tidak pernah dirender mentah (`SDD-FE-08`); label diambil dari peta kode → label pada `packages/schemas` (`SDD-REPO-05`) |

## 1.2 Prinsip turunan untuk penyajian

Empat prinsip berikut adalah **penjabaran UX** atas requirement yang sudah ada — bukan requirement baru. Ia dicantumkan karena menjadi alasan berulang pada §5–§8.

| Kode | Prinsip | Diturunkan dari |
|---|---|---|
| `UXP-01` | **Setiap objek punya satu alamat.** Setiap entitas bisnis memiliki route halaman penuh sendiri, sehingga notifikasi, deep link, hasil scan QR, dan tautan chatbot mendarat di tempat yang sama | `FR-04.2` (filter di URL) · `MOB-DL-02` · `SDD-NTF-09` · **UXD-02** |
| `UXP-02` | **Menu tidak menebak.** Visibilitas menu, kartu, dan tombol bersumber tunggal dari `GET /me`; klien tidak pernah menyimpulkan hak akses dari nama role | `PM-04` · `SDD-AUTH-05` · `SDD-FE-04` |
| `UXP-03` | **Antarmuka bukan penjaga.** Menyembunyikan menu adalah kenyamanan, bukan kontrol; setiap aksi tetap ditolak server bila permission tidak mencukupi | `PM-02` · `NFR-S-05` |
| `UXP-04` | **Ketersediaan tidak pernah ditampilkan basi.** Layar yang menampilkan ketersediaan waktu tidak boleh menyajikan data dari cache panjang, dan wajib memuat ulang saat jendela kembali fokus | `AV-04` · `SDD-FE` §4.3 |

---

# 2. User Roles & Goals

## 2.1 Tujuh role dan sasaran UX-nya

Definisi role bersifat normatif di [`roles-permissions.md`](../PRD/00-foundation/roles-permissions.md); persona di [`personas-journeys.md`](../PRD/01-product/personas-journeys.md). Tabel ini memetakan keduanya ke **konsekuensi antarmuka**.

| Role | Persona | Perangkat utama | Sasaran utama | Tugas berfrekuensi tinggi | Konsekuensi UX |
|---|---|---|---|---|---|
| **R-01 Administrator** | 7 — Pak Yoga | Desktop | Sistem stabil, akun tertata, aturan mengikuti kebijakan sekolah tanpa vendor | Kelola pengguna, konfigurasi approval rules, telusuri activity log | Desktop-first penuh; grup **Sistem** hanya terlihat olehnya; 2FA wajib (`BR-070`) menambah satu langkah pada alur login |
| **R-02 Petugas Sarana Prasarana** | 1 — Bu Sari | Desktop **+** ponsel | Semua aset tercatat, serah terima cepat, opname selesai tanpa lembur | Serah terima, pengembalian, verifikasi kerusakan, opname, cetak QR | Satu-satunya role yang bekerja penuh di **dua** platform; dashboard berorientasi antrean kerja hari ini ([§8.3](PAGE-SPECIFICATION.md#832-petugas-sarana-prasarana-193)) | bekerja penuh di **dua** platform; dashboard berorientasi antrean kerja hari ini ([§8.3](PAGE-SPECIFICATION.md#832-petugas-sarana-prasarana-193)) |
| **R-03 Pimpinan Sekolah** | 3 — Pak Hendra | Ponsel (utama) + laptop | Menyetujui cepat, memantau kondisi aset, keputusan berbasis data | Persetujuan, dashboard, analitik, pembebasan ganti rugi | Approval dari ponsel wajib (`FR-10.2 AC`); literasi digital dasar–menengah → menu ringkas, tanpa istilah teknis (`UX-06`); 2FA wajib |
| **R-04 Teknisi** | 4 — Pak Andi | Ponsel (hampir selalu) | Tahu pekerjaan hari ini, selesai tanpa bolak-balik | Work order, scan QR untuk riwayat servis, unggah foto & biaya | Mobile-first murni; web hanya baca; tab **Tugas** mobile berisi Work Order Saya (**UXD-03**) |
| **R-05 Guru** | 2 — Pak Budi | Ponsel (utama) + laptop | Ruangan & alat siap saat mengajar, proses tidak berbelit | Reservasi, lapor kerusakan, cek status pengajuan | Pengguna jarang-pakai → aksi cepat di dashboard wajib; wizard reservasi (**UXD-04**) mengurangi beban ingatan |
| **R-06 Staf / Tata Usaha** | 5 — Ibu Rina | Desktop + ponsel | Ruangan & perlengkapan kegiatan dinas siap tepat waktu | Reservasi gabungan ruangan + aset, rekap kegiatan | Pengguna terberat wizard reservasi gabungan (`BR-024b`); butuh melihat jadwal seluruh ruangan sekaligus → tampilan Harian kalender (`CAL-UI-01`) |
| **R-07 Siswa / OSIS** | 6 — Dika | Ponsel (satu-satunya) | Izin aula & perlengkapan untuk kegiatan OSIS | Reservasi, cek status, cek denda | Mobile-only secara praktik; katalog & kalender tersaring (`FR-04.2 A1`, `CAL-UI-06`); tidak pernah melihat data finansial, dokumen, maupun identitas pemohon lain (`BR-073`) |

## 2.2 Peran lintas-role: Approver

**Approver bukan role.** Ia ditentukan approval rules (`FR-10.1`), bukan role tambahan — sehingga Petugas Sarpras, Pimpinan Sekolah, Guru, atau pengguna spesifik dapat menjadi approver pada aturan tertentu.

**Konsekuensi UX:** menu **Persetujuan Saya** dan kartu dashboard "Menunggu Persetujuan Saya" dirender berdasarkan permission `approval.decide` dari `GET /me`, **bukan** berdasarkan role — dan dapat muncul pada role mana pun yang ditunjuk sebuah aturan (`UXP-02`).

## 2.3 Aktor non-pengguna

| Aktor | Sentuhan antarmuka | Rujukan |
|---|---|---|
| **Pemindai QR kamera bawaan** (tanpa login) | Halaman publik aset `/a/{uuid}` — atribut non-sensitif saja | `FR-05.2 A3` · 17.5 poin 2 |
| **`SYSTEM`** (pekerjaan terjadwal) | Muncul sebagai pelaku pada linimasa approval, riwayat kondisi, dan activity log — antarmuka wajib menampilkannya sebagai "Sistem", bukan kode | `AL-06` · `UX-06` |
| **Auditor Internal / Pengawas** | Tidak punya akun; menerima berita acara & ekspor PDF/XLSX | `ST-11` |
| **Bendahara** | Tidak punya akun; menerima rekap denda & biaya pemeliharaan | `ST-09` · `FR-09.4 A3` |

---

# Lingkup

Lingkup UX ditetapkan di tiga tempat. Ketiganya mengikat dan tidak boleh ditafsirkan ulang saat wireframing.

| Batas | Ditetapkan di | Isi |
|---|---|---|
| **Batas platform** — alur mana berjalan di web, mana di mobile, mana di keduanya | [§6.3 Batas lingkup web ↔ mobile](PAGE-SPECIFICATION.md#63-batas-lingkup-web--mobile) | Tabel 16 alur × dua platform, beserta penanda platform utama. Aplikasi mobile **tidak** memiliki entri untuk 9 dari 21 modul — itu disengaja (`SDD-MOB` §4.1, `UX-01`) |
| **Batas peran** — siapa melihat apa | [§5.3 Sidebar per role](NAVIGATION.md#sidebar-per-role-yang-benar-benar-terlihat) · [§2 User Roles & Goals](#2-user-roles--goals) | Visibilitas bersumber tunggal dari `GET /me` (`PM-04`), bukan dari nama role |
| **Batas negatif** — layar yang sengaja **tidak** dibuat | [§12.5 Yang sengaja tidak dibuat](DECISIONS.md#125-yang-sengaja-tidak-dibuat) | 13 layar beserta requirement yang melarangnya (`BR-070b`, `BR-072`, `BR-075`, `NO-07`, dan lainnya) |

Daftar Non Objective tingkat produk (`NO-01`…`NO-15`) berada di [`overview.md` Bab 3.3](../PRD/01-product/overview.md) dan berlaku di atas dokumentasi ini.

---

# 13. Requirement → UX Traceability

## 13.1 Functional Requirement ke halaman & alur

Setiap FR pada PRD memiliki representasi UX. Tabel ini adalah buktinya.

| FR | Modul | Halaman / layar | Alur |
|---|---|---|---|
| FR-01.1 Login | M-01 | P-01, P-02, MS-01, MS-02 | F-01 |
| FR-01.2 Logout | M-01 | P-77, P-79, topbar | F-01 |
| FR-01.3 Lupa Password & Reset | M-01 | P-04, P-05, P-67 | F-02 |
| FR-01.4 Ganti Password & Profil | M-01 | P-76, P-77, MS-03 | F-01, F-03 |
| FR-01.5 2FA | M-01 | P-02, P-03, P-77, MS-02 | F-01, F-03 |
| FR-01.6 Break-Glass | M-01 | **Sengaja tanpa halaman** (§12.5) | F-03 |
| FR-02.1 CRUD Pengguna | M-02 | P-60, P-61, P-62, P-63, P-64 | F-05 |
| FR-02.2 Role & Permission | M-02 | P-65, P-66 | — |
| FR-03.1 Hierarki Lokasi | M-03 | P-22, P-23 | — |
| FR-03.2 Aset per Lokasi | M-03 | P-23 | F-22 |
| FR-04.1 Pendaftaran Aset | M-04 | P-16, P-17 | F-04, F-05 |
| FR-04.2 Lihat & Cari Aset | M-04 | P-15, P-18, MS-09 | F-22 |
| FR-04.3 Perubahan Kondisi | M-04 | P-18 (drawer) | F-06 |
| FR-04.4 Mutasi Lokasi | M-04 | P-20 | F-06 |
| FR-04.5 Kategori Aset | M-04 | P-21 | F-04, F-17 |
| FR-05.1 Generate & Cetak QR | M-05 | P-24 | F-04 |
| FR-05.2 Pemindaian QR | M-05 | P-06, P-25, MS-07, MS-08 | F-22 |
| FR-06.1 Dokumen Aset | M-06 | P-18 tab Dokumen, P-26 | — |
| FR-07.1 Ketersediaan Ruangan | M-07 | P-27 | F-09 |
| FR-07.2 Pengajuan Reservasi Ruangan | M-07 | P-29 | F-09 |
| FR-07.3 Pembatalan Reservasi | M-07 | P-30, P-31 (drawer) | F-09 |
| FR-07.4 Penggunaan & Penyelesaian | M-07 | P-31 | F-09 |
| FR-07.5 Blokade Jadwal Tetap | M-07 | P-23 tab Jadwal Tetap | F-11 |
| FR-08.1 Ketersediaan Aset | M-08 | P-28 | F-10 |
| FR-08.2 Pengajuan Reservasi Aset | M-08 | P-29 | F-10 |
| FR-08.3 Pembatalan Reservasi Aset | M-08 | P-30, P-31 (drawer) | F-10 |
| FR-09.1 Serah Terima | M-09 | P-33, MS-10 | F-12 |
| FR-09.2 Pengembalian | M-09 | P-34, MS-11 | F-13 |
| FR-09.3 Pemantauan Peminjaman | M-09 | P-32, MS-12 | F-13 |
| FR-09.4 Pengelolaan Denda | M-09 | P-35, P-36, MS-14 | F-15 |
| FR-09.5 Perpanjangan | M-09 | MS-13, P-34 | F-14 |
| FR-10.1 Konfigurasi Approval Rules | M-10 | P-68, P-69 | F-25 |
| FR-10.2 Eksekusi Persetujuan | M-10 | P-37, P-38, MS-20 | F-07, F-08 |
| FR-10.3 Riwayat Persetujuan | M-10 | Linimasa pada P-31, P-38, P-53, P-57 | F-07 |
| FR-11.1 Melaporkan Kerusakan | M-11 | P-40, MS-15 | F-16 |
| FR-11.2 Verifikasi Laporan | M-11 | P-41 (drawer) | F-16 |
| FR-11.3 Pemantauan Kerusakan | M-11 | P-39 | F-16 |
| FR-12.1 Work Order Korektif | M-12 | P-42, P-43 | F-16 |
| FR-12.2 Jadwal Preventif | M-12 | P-45, P-46 | F-17 |
| FR-12.3 Eksekusi Work Order | M-12 | MS-16, MS-17, P-44 | F-16 |
| FR-12.4 Verifikasi & Penutupan | M-12 | P-44 | F-16 |
| FR-12.5 Riwayat Servis | M-12 | P-18 tab Pemeliharaan | F-16, F-20 |
| FR-13.1 Membuat Sesi Opname | M-13 | P-47, P-48 | F-18 |
| FR-13.2 Pelaksanaan Opname | M-13 | MS-18, MS-19, P-49 | F-18 |
| FR-13.3 Rekonsiliasi Opname | M-13 | P-50 | F-18 |
| FR-13.4 Sesi Opname Bahan | M-13 | MS-22, MS-23, P-50 | F-27 |
| FR-14.1 Usulan Pengadaan | M-14 | P-51, P-52 | F-19 |
| FR-14.2 Persetujuan Pengadaan | M-14 | P-38, P-53 | F-07, F-19 |
| FR-14.3 Penerimaan Barang | M-14 | P-54 | F-19 |
| FR-22.1 Master Bahan & Kategori | M-22 | P-80, P-81, P-83 | — |
| FR-22.2 Saldo & Kartu Stok | M-22 | P-80, P-82 | F-26 |
| FR-22.3 Penerimaan Bahan | M-22 | P-82 (drawer), P-54 | F-19, F-26 |
| FR-22.4 Permintaan Bahan | M-22 | P-84, P-85, P-86, P-87 | F-26 |
| FR-22.5 Pengeluaran & Penyerahan | M-22 | P-87 | F-26 |
| FR-22.6 Penyesuaian Saldo | M-22 | P-82 (drawer) | F-26 |
| FR-22.7 Peringatan Stok Minimum | M-22 | P-12 kartu · P-80 penanda | F-26 |
| FR-15.1 Dashboard Per Role | M-15 | P-12, MS-05 | seluruh alur (drill-down §8.3) |
| FR-16.1 Laporan Analitik | M-16 | P-58, P-59 | F-21 |
| FR-17.1 Notifikasi In-App | M-17 | P-13, MS-06 tab Notifikasi | F-23 |
| FR-17.2 Push Notification | M-17 | MS-04 izin, MS-06 | F-23 |
| FR-17.3 Preferensi Notifikasi | M-17 | P-78 | F-23 |
| FR-18.1 Pencatatan Aktivitas | M-18 | **Tanpa antarmuka** — otomatis oleh sistem | seluruh alur |
| FR-18.2 Penelusuran Activity Log | M-18 | P-73, P-74 + tombol Riwayat Perubahan | — |
| FR-19.1 Percakapan Chatbot | M-19 | Panel global, MS-21 | F-24 |
| FR-19.2 Riwayat & Evaluasi Chatbot | M-19 | P-14, P-75 | F-24 |
| FR-20.1 Parameter Sistem | M-20 | P-70, P-71, P-72 | — |
| FR-21.1 Usulan Penghapusan | M-21 | P-55, P-56 | F-20 |
| FR-21.2 Persetujuan & Eksekusi | M-21 | P-38, P-57 | F-07, F-20 |
| FR-21.3 Arsip Penghapusan | M-21 | P-55 tab Arsip | F-20 |

**Jumlah:** 69 Functional Requirement · 69 terwakili · **0 tanpa representasi UX**. Dua di antaranya (`FR-01.6`, `FR-18.1`) sengaja tidak memiliki halaman — alasannya tercatat §12.5.

## 13.2 Requirement UI/UX & aksesibilitas

| Kode | Requirement | Diwujudkan di |
|---|---|---|
| `UX-01`…`UX-06` | Prinsip desain | §1.1, §6.3, §7.2, §7.3 |
| `CAL-UI-01`…`CAL-UI-09` | Spesifikasi kalender | §7.6.1, §10.2, §11.2 |
| `DS-01` | Design token & panduan gaya | Di luar lingkup berkas ini — milik `ui-foundation.md` 31.2 |
| `DS-02` | Pustaka komponen inti | §7.1 arketipe, §7.5 drawer, §11.6 daftar periksa |
| `DS-03` | Wireframe seluruh layar utama | **Berkas ini adalah masukannya** — §6 menetapkan daftar layar |
| `DS-04` | Prototipe alur kritis | §9 F-09, F-12, F-16, F-18 |
| `DS-05` | Spesifikasi responsif empat titik henti | §10 |
| `DS-06` | Daftar periksa aksesibilitas per komponen | §11.6 |
| `NFR-AC-01`…`NFR-AC-09` | Aksesibilitas | §11 |
| `NFR-C-01`, `NFR-C-02`, `NFR-C-04` | Kompatibilitas peramban & layar | §10.1, §10.3 |
| `NFR-P-03`…`NFR-P-06` | Target performa yang terlihat pengguna | §7.6.1, §8.2, §6.11 MS-08 |
| `NFR-R-10` | Pesan galat tanpa detail teknis | §7.3, §11.5 |
| `PM-02`, `PM-04` | Sumber render menu & kartu | §1.2 `UXP-02`/`UXP-03`, §5.3 |
| `MOB-*` | Seluruh requirement mobile | §5.5, §6.11, §7.6.6, §7.6.7, §10.4 |
| `NTF-01`…`NTF-05` | Mekanisme notifikasi yang terlihat pengguna | §5.2, §9.9 F-23 |
| `DP-01`, `DP-02`, `DP-05` | Privasi yang terlihat pengguna | P-07, P-06, §12.5 |

## 13.3 Business Rule yang mengubah bentuk antarmuka

Tidak seluruh business rule berdampak visual. Tabel ini memuat yang **mengubah apa yang dilihat atau dapat dilakukan pengguna** — dan karena itu wajib diperiksa saat wireframe ditinjau.

| BR | Dampak pada antarmuka | Di mana |
|---|---|---|
| `BR-001`, `BR-002` | Satu formulir menghasilkan N record berkode unik; kode tidak dapat diketik manual | §9.2 F-04 |
| `BR-005`, `BR-005a`, `BR-005b` | Ketersediaan dihitung dari slot, bukan status aset; aset `Dipinjam` hari ini tetap dapat dipesan untuk bulan depan | §9.4 F-10, §7.6.1 |
| `BR-006`, `BR-047` | Aset rusak berat, hilang, atau dalam perbaikan tidak muncul sebagai tersedia | §7.6.1, §9.4 |
| `BR-007` | Setiap perubahan kondisi menuntut alasan | §7.2, §9.2 F-06 |
| `BR-010` | Tombol mutasi dinonaktifkan saat aset `Dipinjam`, **beserta alasannya** | §7.6.3 |
| `BR-016`, `BR-022` | Ruangan & aset tersaring per penanda kelayakan dan per role | §5.3, §7.6.1 |
| `BR-019`, `BR-020`, `BR-021` | Validasi kapasitas, tenggat H-1, dan durasi maksimum pada wizard | §7.6.2 |
| `BR-023a`, `BR-023b`, `BR-023c` | Kuota pengajuan, TTL slot, dan horizon pemesanan sebagai keadaan galat berpenjelasan | §7.3, §9.4 |
| `BR-024a`, `BR-024b` | Langkah Tinjau wajib menampilkan tanggal turunan & peringatan all-or-nothing | **UXD-04**, §7.6.2 |
| `BR-025`, `BR-031`, `BR-042` | Alasan wajib pada pembatalan, pembebasan, dan penolakan | §7.2 |
| `BR-027` | Minimal satu foto pada serah terima & pengembalian | §7.6.6 |
| `BR-028`, `BR-028a`, `BR-028b` | Rincian perhitungan denda ditampilkan sebelum konfirmasi; satu baris per unit | §9.5 F-13, F-15 |
| `BR-028d`, `BR-028e` | Ganti rugi sebagai jenis kewajiban terpisah; tombol pembebasannya hanya dirender bagi Pimpinan (`fine.waive_compensation`), penuh atau sebagian | **UXD-08**, §9.5 F-15 |
| `BR-030` | Pemohon terblokir melihat daftar kewajiban + tautan, bukan penolakan buntu | §7.3, §9.5 F-15 |
| `BR-032` | Pengembalian rusak menghasilkan tiket otomatis yang langsung terlihat | §9.5 F-13 |
| `BR-033` | Nama penerima kuasa dicatat; tanggung jawab tetap pada pemohon | §7.6.6 |
| `BR-034` | Tombol perpanjangan hilang setelah jatuh tempo lewat | §9.5 F-14 |
| `BR-036`, `BR-037`, `BR-040` | Aturan bawaan terkunci; prioritas terlihat; snapshot dijelaskan saat menonaktifkan aturan | §7.6.5 |
| `BR-039`, `BR-039a` | Langkah dilewati tetap ditampilkan; `auto_approve` tidak pernah ditawarkan | §7.6.4, §7.6.5, §9.3 F-08 |
| `BR-041`, `BR-043` | `409` menampilkan siapa & kapan; persetujuan gagal menjelaskan penyebab | §7.3, §7.6.4 |
| `BR-044` | Minimal satu foto pada laporan kerusakan pengguna | §9.6 F-16 |
| `BR-048` | Pembatalan otomatis reservasi saat aset masuk perbaikan + notifikasi | §9.6 F-16 |
| `BR-049`, `BR-050` | Work order tidak dapat ditutup tanpa kondisi & foto; penutupan menutup tiket asal | §9.6 F-16 |
| `BR-053` | Rekomendasi penggantian muncul pada tab Riwayat Pemeliharaan | §7.6.3 |
| `BR-055`, `BR-056`, `BR-058`, `BR-059` | Snapshot beku, aset dipinjam bukan selisih, keterangan wajib, sesi selesai read-only | §9.7 F-18 |
| `BR-061`, `BR-063` | Total dihitung sistem; jumlah diterima tidak melebihi disetujui | §9.7 F-19 |
| `BR-065b`…`BR-065g` | Penghapusan diblokir bila ada slot aktif; aset terhapus tetap dapat ditelusuri; pemulihan beralasan | §7.6.3, §9.7 F-20 |
| `BR-069` | Email & role tidak dapat diubah pengguna sendiri | P-76 |
| `BR-070`, `BR-070a` | 2FA wajib bagi Admin & Pimpinan; tidak dapat dinonaktifkan sendiri | §9.1 F-01, F-03 |
| `BR-070b` | **Tidak ada layar pemulihan darurat** | §12.5 |
| `BR-072` | **Tidak ada layar menyunting log** | §12.5 |
| `BR-073`, `BR-074` | Field & baris di luar scope tidak dirender sama sekali | §5.3, §7.6.3, §8.3.6 |
| `BR-075`, `BR-076`, `BR-077` | Chatbot tanpa tombol aksi tulis; menyatakan ketidaktahuan | §9.9 F-24 |

## 13.4 Ringkasan cakupan

| Dimensi | Jumlah | Terwakili | Catatan |
|---|---|---|---|
| Modul PRD | 22 | 22 | Peta lengkap §3.3 |
| Functional Requirement | 69 | 69 | 2 sengaja tanpa halaman (§12.5) |
| Role | 7 | 7 | Navigasi per role §5.3, dashboard §8.3 |
| Dashboard per role | 6 varian | 6 | 19.2–19.7; Guru & Staf berbagi satu varian |
| Halaman web | 87 | 87 | Seluruhnya memiliki entry & exit point |
| Layar mobile | 23 | 23 | Batas lingkup §6.3 |
| User flow | 27 | 27 | 17 bertanda ⭐ — alur kritis Bab 30.2 |
| Diagram Mermaid | 30 | — | IA (1), sitemap (3), alur navigasi (1), dan 25 diagram alur |
| Keadaan global | 6 | 6 | Lima dari 31.5 + keadaan sukses (**UXD-06**) |
| Keputusan UX diambil | 13 | — | §12.2 — 11 User Decision, 2 turunan PRD/SDD |
| Keputusan masih terbuka | 5 | — | §12.3 — seluruhnya memetakan TBD kelompok A |
| Konflik ditemukan | 4 | — | §12.4 — seluruhnya tertutup: 2 lewat aturan prioritas, 1 oleh pemilik produk, 1 sudah ditutup PRD |

---

## Berkas terkait

| Berkas | Hubungan |
|---|---|
| [`PRD/04-frontend/ui-foundation.md`](../PRD/04-frontend/ui-foundation.md) | Prinsip desain, design token, komponen inti, spesifikasi kalender, lima keadaan global — **berlaku di atas berkas ini** |
| [`PRD/04-frontend/dashboards.md`](../PRD/04-frontend/dashboards.md) | Isi kartu tiap dashboard — §8 hanya menambahkan zonasi, drill-down, dan keadaan kosong |
| [`PRD/05-mobile/mobile-requirements.md`](../PRD/05-mobile/mobile-requirements.md) | Kebijakan luring, media, deep link, izin runtime |
| [`PRD/00-foundation/roles-permissions.md`](../PRD/00-foundation/roles-permissions.md) | Katalog permission kanonik — dasar seluruh tabel visibilitas |
| [`SDD/11-frontend-architecture.md`](../SDD/11-frontend-architecture.md) | Struktur aplikasi, state, gerbang permission, komponen kalender |
| [`SDD/12-mobile-architecture.md`](../SDD/12-mobile-architecture.md) | Navigasi, antrean unggah, deep link, gerbang startup |
| [`SDD/TBD-REGISTER.md`](../SDD/TBD-REGISTER.md) | Titik yang belum ditetapkan — §12.3 memetakan yang berdampak UX |
| [`PRD/06-quality/test-strategy.md`](../PRD/06-quality/test-strategy.md) | 18 alur kritis (30.2), matriks perangkat (30.6), UAT (30.8) |

## Tindak lanjut

| # | Tindakan | Pemilik |
|---|---|---|
| 1 | ~~Perbaiki tabel endpoint `m07` bagian 7: `reservation.cancel` menjadi `reservation.cancel_own` / `reservation.cancel_any` (**K-02**)~~ — **selesai 24 Agustus 2026**: satu endpoint menerima kedua permission, kepemilikan diperiksa di server | Pemilik berkas modul M-07 |
| 2 | ~~Tutup `TBD-FE-B`, `TBD-MOB-B`, `TBD-NTF-A`~~ — **selesai 22 Agustus 2026**; rancangan `SDD-08 §4.5` serta `SDD-12 §4.8` sudah diselaraskan. Register kini **13 terbuka · 27 tertutup** (empat TBD Bahan ditutup 23 Agustus; dua belas TBD ditutup 25 Agustus dalam empat batch — kelompok A dan D kosong) | Software Architect |
| 3 | ~~Selesaikan `TBD-APR-A`, `TBD-NTF-B`, `TBD-EVT-B`, `TBD-FS-A`, `TBD-AVL-B`~~ — **seluruhnya selesai 25 Agustus 2026** (`UXD-09`, `UXD-10`, `UXD-13`, `UXD-14`, `UXD-15`). Tidak ada lagi bagian UX-SPEC yang tertahan | Pemilik produk |
| 4 | Naikkan enam kelompok notifikasi (**UXD-05**) ke PRD `M-17` — kini bermukim di `SDD-08 §4.5`, padahal sifatnya kebijakan produk | Pemilik produk |
| 5 | ~~Pulihkan atau bangun ulang `PRD.v1.1.full.md`; tanpanya `scripts/audit_docs.py` berhenti dengan `FileNotFoundError`~~ — **selesai 24 Agustus 2026**: arsip tidak dipulihkan; `audit_docs.py` dilepaskan dari perbandingan arsip dan kini memeriksa invarian yang berlaku terus-menerus | Pemilik berkas PRD |
| 6 | Mulai `DS-03` (wireframe) memakai §6 sebagai daftar layar, §7 sebagai spesifikasi, dan [`DESIGN/`](../DESIGN/DESIGN-SYSTEM.md) sebagai bahasa visual | UI/UX Designer |
