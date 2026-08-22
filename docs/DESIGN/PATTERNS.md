# Patterns — SIGM4 Design System

> **Design System SIGM4** — [Overview](DESIGN-SYSTEM.md) · [Foundations](FOUNDATIONS.md) · [Components](COMPONENTS.md) · **Patterns** · [Responsive & Accessibility](RESPONSIVE-ACCESSIBILITY.md)

Pola perakitan komponen menjadi layar. **Perilaku dan struktur berasal dari [`docs/UX/`](../UX/)**; berkas ini menetapkan bahasa visual dan stylingnya.

| § | Bagian |
|---|---|
| [1](#1-page-structure) | Page Structure |
| [2](#2-navigation-patterns) | Navigation Patterns |
| [3](#3-dashboard-patterns) | Dashboard Patterns |
| [4](#4-form-patterns) | Form Patterns |
| [5](#5-data-display) | Data Display |
| [6](#6-search--filtering) | Search & Filtering |
| [7](#7-feedback) | Feedback |
| [8](#8-empty--error-state) | Empty & Error State |
| [9](#9-confirmation) | Confirmation |
| [10](#10-user-flow-patterns) | User Flow Patterns |
| [11](#11-cta-hierarchy) | CTA Hierarchy |

---

# 1. Page Structure

## 1.1 Kerangka tetap

Seluruh halaman web memakai kerangka yang sama. Yang berubah hanya isi area konten.

```
+--------------------------------------------------------------+
| TOPBAR                                        C-04 · 64px    |
+------------------+-------------------------------------------+
| SIDEBAR          | [banner opsional]                         |
| C-03 · 240px     |-------------------------------------------|
|                  | BREADCRUMB                    C-06        |
|                  |-------------------------------------------|
|                  | KEPALA HALAMAN                            |
|                  |   judul + lencana + aksi utama            |
|                  |   ==================== garis 3px accent   |
|                  |-------------------------------------------|
|                  | KONTEN                                    |
|                  |                                           |
+------------------+-------------------------------------------+
                                          [ Tanya SIGM4 ]  FAB
```

## 1.2 Kepala halaman

Empat arketipe pada [`UX §7.1`](../UX/PAGE-SPECIFICATION.md#71-empat-arketipe-layout) berbagi kepala yang sama.

| Bagian | Spesifikasi |
|---|---|
| Judul | `font.size.2xl` 30px · 600 · `text.heading` |
| Sub-judul / identitas | `font.size.base` · `text.secondary` — mis. "Kategori Komputer · Lab Komputer 1 · Diperoleh 2024" |
| Lencana status | [Badge](COMPONENTS.md#c-13-badge) di kanan judul, gap `spacing.3` |
| Aksi utama | Maksimum **dua** tombol terlihat; sisanya di [Dropdown](COMPONENTS.md#c-17-dropdown) titik-tiga |
| Garis identitas domain | `border.width.marker` 3px `color.accent.*` sesuai grup, di bawah seluruh blok kepala |
| Padding | `spacing.6` vertikal · mengikuti padding area konten horizontal |

Garis 3px accent adalah **satu-satunya** tempat accent muncul di area konten. Halaman yang tidak termasuk lima grup domain — layar publik, layar galat, profil — tidak memiliki garis ini.

## 1.3 Lebar konten

| Jenis halaman | Container | Contoh |
|---|---|---|
| Daftar & dashboard | `container.xl` 1280px | P-15 · P-12 |
| Detail entitas | `container.lg` 1024px | P-18 · P-31 · P-44 |
| Formulir satu kolom | `container.md` 768px | P-29 wizard · P-40 |
| Formulir terfokus | `container.sm` 640px | P-01 · P-05 |
| Kalender | `container.full` | P-27 |
| Teks panjang | `container.prose` 72ch | Pemberitahuan Privasi · penjelasan parameter |

## 1.4 Halaman publik

P-06 (halaman publik aset) dan P-07 (Pemberitahuan Privasi) **tidak memiliki sidebar**. Kerangkanya: topbar berisi logo saja, konten `container.md` terpusat, tanpa FAB chatbot, tanpa elemen yang menyiratkan sesi login (`FR-05.2 A3`).

---

# 2. Navigation Patterns

## 2.1 Tiga tingkat navigasi

| Tingkat | Komponen | Fungsi |
|---|---|---|
| 1 — Antar-domain | [Sidebar](COMPONENTS.md#c-03-sidebar) desktop · [Bottom tab](COMPONENTS.md#c-05-navigation-mobile) mobile | Berpindah grup domain kerja |
| 2 — Antar-halaman | Item sidebar · tautan pada kartu dashboard | Berpindah halaman dalam grup |
| 3 — Dalam objek | [Tabs](COMPONENTS.md#c-16-tabs) | Berpindah bagian objek yang sama |

Kedalaman maksimum tiga tingkat ([`UX §3.4`](../UX/INFORMATION-ARCHITECTURE.md#34-kedalaman-hierarki)). Tidak ada menu bertingkat di dalam sidebar.

## 2.2 Pola titik masuk

Lima titik masuk mendarat pada halaman yang sama (`UXP-01`) — sehingga hanya satu tampilan yang perlu dirancang per objek.

| Titik masuk | Mendarat di | Penanganan visual |
|---|---|---|
| Sidebar | Halaman daftar | Item sidebar menjadi aktif |
| Kartu dashboard | Halaman daftar **berfilter** | Chip filter aktif terlihat pada Panel Filter |
| Notifikasi | Halaman detail objek | Breadcrumb terisi penuh dari struktur route |
| Scan QR | Halaman detail aset | Aksi kontekstual muncul sesuai role & status |
| Chatbot | Halaman detail atau formulir | Panel chatbot menutup diri |

## 2.3 Pola kembali

| Konteks | Pola |
|---|---|
| Desktop | Breadcrumb — tidak ada tombol "Kembali" tersendiri |
| Mobile | Tombol panah kiri pada app bar |
| Formulir & wizard | Tombol "Batal" pada footer; konfirmasi bila ada perubahan belum tersimpan |
| Drawer | Esc · tombol tutup · klik latar · tombol kembali peramban |
| Layar galat | Tombol menuju Dashboard — **selalu ada** (`UX-05`) |

---

# 3. Dashboard Patterns

## 3.1 Empat zona

Urutan zona ditetapkan **UXD-07** dan tidak berubah oleh lebar layar.

| Zona | Isi | Kartu | Visual |
|---|---|---|---|
| **1 Tindakan** | Yang menunggu pengguna hari ini | `action` · `warning` | Garis kiri 3px semantic pada kartu peringatan |
| **2 Keadaan** | Angka ringkas keadaan sistem | `kpi` | Angka `font.size.3xl` |
| **3 Kecenderungan** | Perubahan sepanjang waktu | `chart` | Seri memakai urutan accent tetap |
| **4 Aksi Cepat** | Pintasan aksi | Tombol | `primary` untuk aksi utama role |

## 3.2 Kepala dashboard

```
Dashboard                [7 hari | 30 hari | Semester | Tahun Ajaran]  [Muat ulang]
```

Pemilih rentang memakai segmented control: latar `neutral.100`, segmen aktif `surface.default` + `elevation.0` + teks `teal.800`. Tombol muat ulang varian `tertiary` dengan ikon; menampilkan waktu pembaruan terakhir sebagai tooltip.

## 3.3 Aturan warna dashboard

| Aturan | Alasan |
|---|---|
| Kartu Zona 1 memakai **semantic**, bukan accent | Peringatan adalah status, bukan identitas (**DSD-02**) |
| Kartu Zona 2 netral, hanya trennya berwarna semantic | Angka bukan status |
| Grafik Zona 3 memakai urutan accent tetap | Grafik yang sama selalu berwarna sama |
| Aksi Cepat memakai `primary` teal | Interaksi milik teal (`DS-P-02`) |
| Kartu di luar hak akses **tidak dirender** | `FR-15.1 AC` |

## 3.4 Dashboard mobile

Satu kolom. Zona 1 dan Zona 4 terlihat tanpa gulir; Zona 3 **diciutkan** secara bawaan karena grafik mahal dirender dan jarang menjadi alasan aplikasi dibuka di lapangan (`UX-01`, `MOB-PERF-01`). Aksi Cepat naik ke atas Zona 3.

---

# 4. Form Patterns

## 4.1 Tata letak

| Aturan | Nilai |
|---|---|
| Kolom | Satu kolom sebagai bawaan; dua kolom hanya untuk pasangan field yang memang berpasangan (tanggal mulai–selesai, jam mulai–selesai) |
| Lebar | `container.md` 768px |
| Gap antar-field | `spacing.5` 20px |
| Gap antar-grup field | `spacing.8` 32px + judul grup `font.size.lg` 600 |
| Label | Di atas field, `font.size.sm` 500 (`NFR-AC-05`) |
| Field wajib | Kata **"wajib"** pada label — bukan tanda bintang berwarna (`NFR-AC-06`) |
| Footer | Melekat di bawah pada formulir panjang; aksi utama di kanan |

## 4.2 Validasi

| Aspek | Ketentuan |
|---|---|
| Kapan | Saat *blur* per field; seluruh form saat submit |
| Sumber aturan | Skema bersama frontend–backend (`SDD-FE-05`, `SDD-REPO-05`) — form tidak pernah menerima nilai yang akan ditolak API |
| Tampilan | Border 2px `border.error` + ikon + pesan `error.base` di bawah field |
| Isi pesan | Menyebut **nama field** dan cara memperbaikinya |
| Fokus | Submit yang gagal memindahkan fokus ke field bergalat pertama |
| Ringkasan | Formulir lebih dari 8 field menampilkan [Alert](COMPONENTS.md#c-14-alert) `error` berisi daftar field bergalat yang dapat diklik |

## 4.3 Wizard

Tiga langkah untuk pengajuan reservasi (**UXD-04**). Pola ini berlaku bagi setiap formulir bertahap.

```
 (1)-----(2)-----(3)        aktif: lingkaran teal.600 + teks teal.800 600
Pilih  Detail  Tinjau       selesai: lingkaran isi teal.600 + centang
 Slot                       belum: lingkaran neutral.300 + teks text.secondary
```

| Aturan | Ketentuan |
|---|---|
| Indikator | Selalu terlihat; menyebut nomor **dan** nama langkah |
| Mundur | Selalu diizinkan tanpa kehilangan isian |
| Maju | Diblokir sampai validasi langkah terpenuhi |
| Langkah terakhir | **Selalu Tinjau** — menampilkan seluruh isian sebelum submit |
| Peringatan konsekuensi | [Alert](COMPONENTS.md#c-14-alert) `warning` pada langkah Tinjau, mis. sifat all-or-nothing `BR-024b` |
| Mobile | Satu langkah = satu layar penuh; indikator ringkas di app bar |

## 4.4 Pencegahan pengiriman ganda

Tombol submit dinonaktifkan selama permintaan berjalan dan menampilkan state `loading` (31.3). Endpoint transaksional mengirim `Idempotency-Key` (`ID-01`) — ketuk ganda tidak pernah menghasilkan dua transaksi.

## 4.5 Draf

Hanya **Usulan Pengadaan** yang memiliki status `Draf` bagi pemohon (`FR-14.1 A1`). Formulir lain tidak menawarkan "Simpan sebagai draf" — menawarkannya akan menyiratkan perilaku yang tidak ada di sistem.

---

# 5. Data Display

## 5.1 Memilih bentuk

| Bentuk | Dipakai ketika | Komponen |
|---|---|---|
| Tabel | Data terstruktur, banyak baris, perlu diurutkan & difilter | [Table](COMPONENTS.md#c-15-table) |
| Kartu | Data visual berorientasi objek, sedikit field | [Card](COMPONENTS.md#c-07-card) `interactive` |
| Daftar deskripsi | Detail satu objek | Pasangan label–nilai |
| Linimasa | Urutan kejadian | [Linimasa Approval](COMPONENTS.md#c-27-linimasa-approval) |
| Pohon | Hierarki | Pohon lokasi P-22 |
| Kalender | Ketersediaan berbasis waktu | [Kalender](COMPONENTS.md#c-24-kalender-ketersediaan) |
| Grafik | Perbandingan & tren | Kartu KPI varian `chart` |

## 5.2 Daftar deskripsi pada halaman detail

```
Kode Barang        LAB-KOM-0002
Kategori           Komputer
Nomor Seri         SN-88213-A
Nilai Perolehan    Rp 8.500.000        <- hanya bila asset.view_financial
```

| Bagian | Spesifikasi |
|---|---|
| Label | `font.size.sm` · `text.secondary` · lebar tetap 180px pada `md` ke atas |
| Nilai | `font.size.base` · `text.primary` |
| Angka & kode | `tabular-nums` |
| Field kosong | Tanda "—" berwarna `text.tertiary`, bukan baris yang hilang |
| Field di luar hak akses | **Tidak dirender sama sekali** — server memang tidak mengirimkannya (`SDD-AUTH-06`) |
| Mobile | Label di atas nilai, bukan bersebelahan |

> Perbedaan antara **field kosong** dan **field di luar hak akses** penting: yang pertama menampilkan "—", yang kedua tidak ada sama sekali. Menampilkan label terkunci akan membocorkan keberadaan data (17.5 poin 3).

## 5.3 Angka & waktu

| Jenis | Format | Contoh |
|---|---|---|
| Nominal | `Rp` + pemisah ribuan titik + `tabular-nums` | `Rp 8.500.000` |
| Tanggal | Format panjang Bahasa Indonesia | `12 Agustus 2026` |
| Tanggal ringkas (tabel) | `dd Mmm yyyy` | `12 Agt 2026` |
| Waktu | `HH.mm` + penanda **WIB** | `08.00 WIB` |
| Rentang | Titik dua di antara | `08.00 – 11.00 WIB` |
| Relatif | Hanya pada notifikasi & meta, dengan judul absolut | `2 jam lalu` |
| Nomor dokumen | `tabular-nums` · bobot 600 · tautan bila dapat dibuka | `RSV-RG-2026-0001` |

## 5.4 Grafik

| Aturan | Ketentuan |
|---|---|
| Warna seri | Urutan accent tetap ([`FOUNDATIONS §1.2`](FOUNDATIONS.md#12-accent)) |
| Lebih dari 6 seri | Sisanya dikelompokkan menjadi "Lainnya" — tidak ada warna ketujuh |
| Pembeda | Warna **dan** pola/penanda; legenda tekstual wajib (`NFR-AC-06`) |
| Sumbu | Selalu berlabel, termasuk satuan |
| Alternatif teks | **Tabel data alternatif wajib** — bukan hanya `alt` pada kanvas (`NFR-AC-04`) |
| Kosong | [Empty State](COMPONENTS.md#c-21-empty-state) di dalam area grafik + saran ubah rentang |

---

# 6. Search & Filtering

## 6.1 Dua jenis pencarian

| Jenis | Tempat | Perilaku |
|---|---|---|
| **Global** | Topbar | Kode barang, nomor seri, nama aset, nomor dokumen. Nilai yang cocok regex `SEQ-04` **melompat langsung** ke detail objeknya |
| **Dalam konteks** | Panel Filter tiap halaman daftar | Menyaring daftar yang sedang dilihat |

## 6.2 Pola filter

Ditetapkan [`UX §7.4`](../UX/PAGE-SPECIFICATION.md#74-pola-pencarian-filter-dan-pengurutan) untuk 15 halaman daftar. Visualnya milik [Panel Filter](COMPONENTS.md#c-22-panel-filter).

| Aturan | Ketentuan |
|---|---|
| Konsistensi | Panel yang sama di seluruh modul (31.3) |
| Chip aktif | Berwarna teal — ia dapat ditekan untuk dihapus |
| Jumlah hasil | Diumumkan lewat *live region* setiap filter berubah |
| URL | Filter, urutan, halaman tercermin di URL (`FR-04.2`) |
| Rentang tanggal | Pintasan 7 hari · 30 hari · Semester Berjalan · Tahun Ajaran (`AC-YR-03`) |
| Mobile | *Bottom sheet* dipanggil tombol "Filter (3)" |

## 6.3 Hasil kosong

Pencarian nihil **tidak sama** dengan data kosong. Keduanya memakai [Empty State](COMPONENTS.md#c-21-empty-state), tetapi aksinya berbeda: hasil filter nihil menawarkan **"Sesuaikan filter"** dan **"Hapus semua filter"**, bukan "Tambah data baru".

---

# 7. Feedback

## 7.1 Memilih bentuk umpan balik

Lima bentuk sukses ditetapkan **UXD-06** ([`UX §7.3`](../UX/PAGE-SPECIFICATION.md#73-pola-lima-keadaan-global)). Design System menetapkan wujudnya.

| Jenis operasi | Bentuk | Visual |
|---|---|---|
| Perubahan in-place | **Toast** 4 detik | `surface.raised` + `elevation.1` + garis kiri 3px `success.base` + ikon |
| Menghasilkan objek bernomor | **Berpindah** ke halaman detail | Nomor sebagai judul; [Alert](COMPONENTS.md#c-14-alert) `success` sekali di atas konten |
| Operasi massal | **Halaman ringkasan hasil** | Tabel: jumlah sukses, jumlah gagal, alasan per nomor baris |
| Menghasilkan berkas | Tautan unduh langsung atau notifikasi `NT-42` | Tombol `primary` "Unduh" |
| Aksi lapangan bermakna hukum | **Layar bukti** | Kartu penuh berisi identitas, waktu, foto, tanda tangan |

## 7.2 Toast

| Bagian | Nilai |
|---|---|
| Posisi | Kanan bawah desktop · atas mobile, agar tidak tertutup bottom tab bar |
| Lebar | Maksimum 400px |
| Durasi | 4 detik; toast bergalat **tidak menghilang sendiri** |
| Tumpukan | Maksimum 3; yang tertua terdorong keluar |
| Aksi | Maksimum satu tombol `tertiary` |

**Toast tidak boleh** menjadi satu-satunya tempat informasi penting muncul — ia hilang dan tidak dapat dipanggil kembali. Galat yang perlu ditindaklanjuti memakai [Alert](COMPONENTS.md#c-14-alert) yang menempel pada konteks.

## 7.3 Progres operasi panjang

| Operasi | Pola |
|---|---|
| Impor massal maksimum 200 baris | Bar progres + halaman ringkasan hasil (`IMPT-02`) |
| Impor massal lebih dari 200 baris | Asinkron; notifikasi `NT-42` saat selesai (`IMPT-04`) |
| Ekspor lebih dari 5 detik | Asinkron; pengguna boleh meninggalkan halaman (`NFR-P-08`) |
| Unggah foto | Bar progres per berkas + pembatalan (`MOB-MED-04`) |
| Pemindaian opname | Progres per lokasi & keseluruhan, real-time (`FR-13.1 AC`) |
| Regenerasi blokade jadwal | Progres asinkron (`FR-07.5 AC`) |

---

# 8. Empty & Error State

## 8.1 Enam keadaan setiap layar

Lima dari 31.5 ditambah keadaan sukses (**UXD-06**).

| Keadaan | Komponen | Aksi wajib |
|---|---|---|
| Memuat | [Loading](COMPONENTS.md#c-20-loading) skeleton | — |
| Kosong | [Empty State](COMPONENTS.md#c-21-empty-state) | ✅ |
| Galat | [Alert](COMPONENTS.md#c-14-alert) `error` + `request_id` | ✅ "Coba lagi" |
| Tanpa hak akses | Halaman P-08 | ✅ ke Dashboard |
| Luring | Banner topbar persisten | ✅ penjelasan + coba lagi |
| Sukses | Lihat §7.1 | — |

## 8.2 Layar galat

```
        [ ikon 48px icon.muted ]
        Terjadi gangguan
        Kami tidak dapat memuat data ini.
        Silakan coba lagi.

        [ Coba lagi ]   [ Kembali ke Dashboard ]

        Kode laporan: req_01J8XK2...        [salin]
```

| Aturan | Ketentuan |
|---|---|
| Pesan | Dapat dimengerti pengguna, **tanpa detail teknis** (`NFR-R-10`) |
| `request_id` | Satu-satunya penanda teknis yang boleh tampil; `font.family.mono` · `text.secondary` · tombol salin (31.5) |
| Aksi | Minimal dua: coba lagi dan jalan keluar |
| Tanpa hak akses | **Tidak mengonfirmasi** apakah datanya ada (17.5 poin 3, `SDD-AUTH-08`) |

## 8.3 Galat yang wajib menawarkan alternatif

Empat galat tidak boleh berhenti sebagai penolakan.

| Galat | Wajib menampilkan |
|---|---|
| `409 RESERVATION_CONFLICT` | **Slot alternatif terdekat** yang dapat langsung dipilih (`FR-07.2 A1`) |
| `409 ASSET_NOT_AVAILABLE` | **Tanggal bebas terdekat** unit tersebut (`FR-08.1 A2`) |
| `422 BORROWER_BLOCKED` | Daftar kewajiban + tautan ke Denda Saya (`BR-030`) |
| `409 APPROVAL_ALREADY_DECIDED` | **Siapa** memutuskan dan **kapan** (`RE-09`) |

---

# 9. Confirmation

## 9.1 Kapan konfirmasi wajib

`UX-04` mewajibkan konfirmasi **dan alasan** untuk 23 aksi yang terdaftar tertutup di [`UX §7.2`](../UX/PAGE-SPECIFICATION.md#72-pola-aksi-destruktif). Tidak ada aksi destruktif lain di sistem.

## 9.2 Anatomi dialog destruktif

```
+------------------------------------------------------+
| Batalkan reservasi RSV-RG-2026-0087?                 |  font.size.lg / 600
|                                                      |
| Slot pada 12 Agustus 08.00-11.00 WIB akan            |  text.primary
| dibebaskan dan pemohon akan dinotifikasi.            |
|                                                      |
| Alasan pembatalan   wajib                            |  label + kata "wajib"
| +--------------------------------------------------+ |
| |                                                  | |  textarea min 3 baris
| +--------------------------------------------------+ |
|                                                      |
|              [ Batal ]  [ Batalkan Reservasi ]       |  varian danger
+------------------------------------------------------+
```

| Aturan | Ketentuan |
|---|---|
| Judul | Menyatakan **konsekuensi konkret** beserta identitas objek — bukan "Apakah Anda yakin?" |
| Badan | Menyebut dampak turunan: slot dibebaskan, notifikasi terkirim, transaksi terkait terpengaruh |
| Alasan | Textarea wajib; tombol utama **nonaktif** sampai terisi |
| Tombol utama | Label berupa kata kerjanya — bukan "OK", "Ya", atau "Konfirmasi" |
| Varian | `danger` untuk destruktif; `primary` untuk konfirmasi netral |
| Urutan | Batal di kiri, aksi di kanan |

## 9.3 Konfirmasi non-destruktif

Perubahan belum tersimpan saat meninggalkan formulir memakai dialog **tanpa** field alasan, tombol `primary`, dan tiga pilihan: "Simpan", "Buang perubahan", "Batal".

---

# 10. User Flow Patterns

25 alur ditetapkan [`UX §9`](../UX/USER-FLOWS.md#9-user-flows). Tujuh pola visual berulang di dalamnya:

| Pola | Wujud visual | Alur |
|---|---|---|
| **Gerbang berurutan** | Layar penuh tanpa sidebar; satu tugas per layar; tidak ada jalan keluar selain menyelesaikannya | F-01 login · P-05 ganti password wajib · MS-04 pembaruan wajib |
| **Wizard bertahap** | Indikator langkah + langkah Tinjau wajib (§4.3) | F-09 · F-10 reservasi |
| **Pindai lalu bertindak** | Pemindai penuh layar, hasil, lalu aksi kontekstual sesuai role & status | F-12 · F-13 · F-16 · F-18 · F-22 |
| **Ajukan lalu tunggu** | Objek bernomor + [Linimasa Approval](COMPONENTS.md#c-27-linimasa-approval) yang selalu terlihat | F-07 · F-09 · F-19 · F-20 |
| **Antrean kerja** | Daftar berprioritas pada Zona 1 dashboard + tab Tugas mobile | F-08 · F-16 · F-18 |
| **Tinjau lalu putuskan** | Konteks lengkap di atas, tombol keputusan melekat di bawah | F-07 P-38 · F-18 rekonsiliasi |
| **Rekonsiliasi** | Tabel selisih berkolom keterangan wajib; submit diblokir sampai lengkap | F-18 P-50 |

**Pola "ajukan lalu tunggu"** paling sering muncul — lima jenis pengajuan memakainya (`BR-035`). Visualnya seragam: nomor dokumen sebagai judul, [Badge](COMPONENTS.md#c-13-badge) status di sebelahnya, linimasa di kolom kanan pada `lg` atau di bawah konten pada `md` ke bawah.

---

# 11. CTA Hierarchy

## 11.1 Tiga tingkat pada setiap layar

| Tingkat | Varian tombol | Jumlah | Contoh pada P-15 |
|---|---|---:|---|
| **Utama** | `primary` teal | **Tepat satu** | "Tambah Aset" |
| **Sekunder** | `secondary` | 0–2 | "Impor" · "Ekspor" |
| **Tersier** | `tertiary` atau [Dropdown](COMPONENTS.md#c-17-dropdown) | bebas | "Mutasi Lokasi" · "Cetak QR" di menu titik-tiga |

## 11.2 Menentukan aksi utama

Aksi utama adalah **alasan pengguna membuka halaman itu** — bukan aksi yang paling berbahaya atau paling jarang.

| Halaman | Aksi utama | Alasan |
|---|---|---|
| P-15 Inventaris Aset | Tambah Aset | Petugas Sarpras datang untuk mendaftarkan aset |
| P-27 Kalender Ruangan | *(tidak ada tombol)* | Aksi utamanya adalah **memilih slot** pada kalender itu sendiri |
| P-38 Detail Keputusan | Setujui | Approver datang untuk memutuskan |
| P-41 Detail Tiket | Buat Work Order | Petugas datang untuk menindaklanjuti |
| P-33 Antrean Serah Terima | Pindai QR | Alur dimulai dari pemindaian (`UX-02`) |
| P-12 Dashboard | *(tidak ada)* | Aksi tersebar di Zona 1 dan Zona 4 |

Halaman yang aksi utamanya adalah objek di layar — kalender, pemindai — **tidak memaksakan** tombol `primary` di kepala halaman.

## 11.3 Aksi destruktif dalam hierarki

Aksi destruktif **tidak pernah** menjadi aksi utama, kecuali pada halaman yang memang dibuat untuk itu (P-57 eksekusi penghapusan). Di halaman lain ia berada di [Dropdown](COMPONENTS.md#c-17-dropdown) titik-tiga, pada grup terakhir setelah pemisah.

## 11.4 Aksi yang terhalang keadaan

Tombol yang terhalang keadaan tetap **terlihat dan dinonaktifkan beserta alasannya** — tidak disembunyikan (`UX-05`).

| Contoh | Alasan yang ditampilkan |
|---|---|
| Mutasi lokasi saat aset `Dipinjam` | "Aset sedang dipinjam hingga 14 Agustus 2026" (`BR-010`) |
| Usulkan penghapusan saat ada slot aktif | "Aset memiliki reservasi mendatang" (`BR-065b`) |
| Ajukan perpanjangan setelah jatuh tempo | "Peminjaman sudah melewati jatuh tempo" (`BR-034`) |
| Aksi tulis saat luring | "Memerlukan koneksi internet" (`MOB-OFF-05`) |

Yang **disembunyikan** hanyalah aksi di luar permission — menampilkannya membocorkan keberadaan kemampuan yang tidak dimiliki pengguna (`PM-04`, 17.5 poin 3).

## 11.5 Ringkasan aturan CTA

| ✅ Do | ❌ Don't |
|---|---|
| Satu `primary` teal per layar | Dua tombol teal bersaing |
| Aksi terhalang tetap terlihat + alasannya | Menyembunyikan tanpa penjelasan |
| Aksi di luar permission tidak dirender | Menampilkannya dalam keadaan terkunci |
| Halaman berbasis objek boleh tanpa tombol utama | Memaksakan tombol utama yang tidak dibutuhkan |
