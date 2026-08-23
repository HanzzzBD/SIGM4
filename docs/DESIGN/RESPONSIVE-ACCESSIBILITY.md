# Responsive & Accessibility — SIGM4 Design System

> **Design System SIGM4** — [Overview](DESIGN-SYSTEM.md) · [Foundations](FOUNDATIONS.md) · [Components](COMPONENTS.md) · [Patterns](PATTERNS.md) · **Responsive & Accessibility**

Pemenuhan `DS-05` (spesifikasi responsif empat titik henti) dan `DS-06` (daftar periksa aksesibilitas per komponen). Perilaku responsif ditetapkan [`UX §10`](../UX/PAGE-SPECIFICATION.md#10-responsive-ux) dan ketentuan aksesibilitas [`UX §11`](../UX/PAGE-SPECIFICATION.md#11-accessibility-ux); berkas ini menetapkan nilai konkret dan cara mengujinya.

| § | Bagian |
|---|---|
| [1](#1-breakpoints) | Breakpoints |
| [2](#2-mobile-behavior) | Mobile Behavior |
| [3](#3-tablet-behavior) | Tablet Behavior |
| [4](#4-desktop-behavior) | Desktop Behavior |
| [5](#5-touch-target) | Touch Target |
| [6](#6-keyboard-navigation) | Keyboard Navigation |
| [7](#7-focus-state) | Focus State |
| [8](#8-screen-reader) | Screen Reader |
| [9](#9-contrast) | Contrast |
| [10](#10-color-blindness) | Color Blindness |
| [11](#11-reduced-motion) | Reduced Motion |
| [12](#12-accessibility-checklist) | Accessibility Checklist |

---

# 1. Breakpoints

| Token | Rentang | Perangkat | Kolom kisi | Padding konten |
|---|---|---|---:|---|
| `breakpoint.xs` | 320–599px | Ponsel potret | 1 | `spacing.4` 16px |
| `breakpoint.sm` | 600–767px | Ponsel lanskap, ponsel besar | 1 | `spacing.4` 16px |
| `breakpoint.md` | 768–1365px | Tablet, laptop kecil | 2 | `spacing.10` 40px |
| `breakpoint.lg` | 1366px ke atas | Desktop | 3–4 | `spacing.12` 48px |

Ambang **768px** adalah batas peralihan kalender dari matriks ke daftar per hari (`CAL-UI-07`). Resolusi uji wajib: **320 · 768 · 1366 · 1920px** (Bab 30.6).

## 1.1 Aturan yang berlaku di semua titik henti

| Aturan | Ketentuan |
|---|---|
| Badan halaman **tidak pernah** menggulir horizontal | Konten lebar menggulir di dalam wadahnya sendiri (`NFR-C-02`) |
| Satuan relatif | Tata letak memakai `rem`/`%`, bukan `px` tetap, agar perbesaran 200% tidak mematahkan fungsi (`NFR-AC-08`) |
| Target sentuh minimal 44 dp | Berlaku juga di desktop, bukan hanya mobile (`NFR-AC-07`) |
| Ukuran teks minimum | 16px web · 14sp mobile (31.2) |
| Tidak ada fitur yang hilang karena lebar layar | Alur yang memang tidak tersedia di mobile mengarahkan ke web, bukan menghilang (`UX-05`) |

---

# 2. Mobile Behavior

## 2.1 Kerangka

```
+------------------------------------------+
| [<]  Judul Layar              [aksi]     |  app bar 56px
+------------------------------------------+
|                                          |
|            konten satu kolom             |
|            padding spacing.4             |
|                                          |
+------------------------------------------+
|  Beranda   Tugas   (SCAN)   Notif  Profil|  bottom bar 56px + safe area
+------------------------------------------+
```

## 2.2 Perubahan per komponen

| Komponen | Perilaku pada `xs` · `sm` |
|---|---|
| [Sidebar](COMPONENTS.md#c-03-sidebar) | Tidak ada; digantikan [bottom tab bar](COMPONENTS.md#c-05-navigation-mobile) |
| [Breadcrumb](COMPONENTS.md#c-06-breadcrumb) | Tidak dipakai; digantikan judul layar + tombol kembali |
| [Table](COMPONENTS.md#c-15-table) | **Kartu per baris** berisi 3–4 field terpenting; tinggi ketuk 48px |
| [Panel Filter](COMPONENTS.md#c-22-panel-filter) | *Bottom sheet* dipanggil tombol "Filter (3)" |
| [Drawer](COMPONENTS.md#c-28-drawer) | *Bottom sheet* setinggi konten |
| [Kalender](COMPONENTS.md#c-24-kalender-ketersediaan) | **Daftar per hari**; matriks tidak dipaksakan (`CAL-UI-07`) |
| [Tabs](COMPONENTS.md#c-16-tabs) | Gulir horizontal dengan penanda tepi; menjadi Select bila lebih dari 5 tab |
| Wizard | Satu langkah = satu layar penuh; indikator ringkas di app bar |
| Dashboard | Satu kolom; Zona 3 diciutkan; Aksi Cepat naik ke atas Zona 3 |
| Grafik | Satu grafik per layar; tabel data alternatif selalu tersedia |
| Toast | Muncul di **atas**, agar tidak tertutup bottom tab bar |
| [Linimasa](COMPONENTS.md#c-27-linimasa-approval) | Vertikal ringkas, dapat diciutkan; langkah aktif selalu terbuka |

## 2.3 Ketentuan khusus lapangan

| Aspek | Ketentuan |
|---|---|
| Tombol utama | `size.control.lg` 52px — dioperasikan satu tangan sambil memegang barang |
| Aksi tulis saat luring | Gagal **eksplisit** beserta penjelasan; tidak pernah diantrekan (`MOB-OFF-05`) |
| Foto tertunda | Penanda "Foto belum terunggah" pada daftar maupun detail (`MOB-OFF-04`) |
| Pemindai QR | Penuh layar; tombol kode manual selalu terlihat (`FR-05.2 A1`) |
| Perangkat batas bawah | Android 8, RAM 2GB (`NFR-C-03`) — bayangan tipis tidak dapat diandalkan, karena itu `DS-P-05` |
| Cold start | Maksimum 3 detik (`MOB-PERF-01`) — bundel layar pertama minimal, grafik dimuat malas |
| Orientasi | Potret bawaan; lanskap didukung pada tabel dan kalender (`NFR-C-04`) |

---

# 3. Tablet Behavior

Aplikasi mobile mendapat tata letak dua panel pada tablet (**UXD-11**), melampaui minimum `NFR-C-04`.

| Layar | Tata letak | Alasan |
|---|---|---|
| MS-16 Work Order Saya | Master-detail: daftar WO kiri 320px, detail kanan | Teknisi membaca deskripsi sambil melihat antrean |
| MS-18 Sesi Opname | Master-detail: daftar lokasi kiri, aset target kanan | Satu lokasi dapat memuat ratusan unit (`MOB-PERF-02`) |
| MS-06 Tugas | Seksi bersebelahan dua kolom | Petugas Sarpras memegang beberapa antrean sekaligus |
| Layar lain | Tata letak ponsel dipusatkan, lebar maksimum `container.md` | Menghindari baris teks terlalu panjang |

**Web pada tablet** (`md` 768–1365px) mengikuti aturan responsif biasa: sidebar ciut menjadi ikon-saja, kisi dua kolom, tabel menyembunyikan kolom sekunder.

**Konsekuensi yang diterima:** satu set wireframe tambahan dan satu kelas perangkat uji baru pada Bab 30.6.

---

# 4. Desktop Behavior

| Aspek | Ketentuan |
|---|---|
| Sidebar | Terbuka penuh 240px pada `lg`; ciut ikon-saja pada `md`; preferensi tersimpan (`SDD-FE-03`) |
| Tabel | Baris 44px, sekitar 13 baris tanpa gulir pada 1366×768 (**DSD-08**) |
| Kepala tabel | Melekat saat menggulir |
| Kalender | Matriks penuh; baris divirtualisasi (`CAL-UI-04`) |
| Dashboard | 3–4 kolom |
| Linimasa approval | Kolom kanan tetap terlihat di samping konten |
| Hover | Tersedia, tetapi **tidak pernah** menjadi satu-satunya cara mengakses informasi |
| Pintasan papan ketik | Tidak ada pintasan huruf tunggal tanpa modifier — bentrok dengan pembaca layar |

**Peramban yang didukung** (`NFR-C-01`): Chrome, Edge, Firefox, Safari — dua versi mayor terakhir.

---

# 5. Touch Target

| Token | Nilai | Berlaku untuk |
|---|---:|---|
| `size.touch.min` | **44px** | Seluruh elemen interaktif di seluruh titik henti |
| `size.control.md` | 44px | Tombol, input, select bawaan |
| `size.control.lg` | 52px | Tombol utama wizard & mobile |
| `size.row.desktop` | 44px | Baris tabel desktop |
| `size.row.mobile` | 48px | Kartu baris mobile |

**Satu pengecualian tercatat:** `size.control.sm` 36px, hanya untuk kontrol sekunder pada toolbar desktop yang memiliki padanan berukuran penuh di tempat lain. Tidak pernah pada mobile, tidak pernah untuk aksi utama.

**Elemen kecil dengan area sentuh besar.** Checkbox 20px, radio 20px, dan ikon 20px memiliki area sentuh 44×44 dp lewat padding transparan — ukuran visual dan ukuran sentuh adalah dua hal berbeda.

**Jarak antar-target** minimal `spacing.2` 8px agar tidak salah tekan.

---

# 6. Keyboard Navigation

`NFR-AC-03` mewajibkan seluruh fungsi utama dapat dioperasikan papan ketik dengan indikator fokus jelas.

## 6.1 Aturan umum

| Aturan | Ketentuan |
|---|---|
| Urutan fokus | Mengikuti urutan visual; **tidak ada `tabindex` positif** |
| Lewati navigasi | Tautan "Lewati ke konten utama" sebagai elemen fokus pertama |
| Elemen semantik | `<button>`, `<a href>`, `<input>` asli — bukan `<div>` ber-handler |
| Perangkap fokus | Hanya pada dialog dan drawer, dan selalu dapat keluar dengan Esc |
| Pengembalian fokus | Menutup lapisan mengembalikan fokus ke elemen pemicu |
| Pintasan | Tidak ada pintasan huruf tunggal tanpa modifier |

## 6.2 Pola per komponen

| Komponen | Papan ketik |
|---|---|
| [Button](COMPONENTS.md#c-01-button) | Enter dan Spasi mengaktifkan |
| [Dropdown](COMPONENTS.md#c-17-dropdown) | Panah berpindah · Enter memilih · Esc menutup + fokus kembali ke pemicu |
| [Select](COMPONENTS.md#c-09-select) | Panah berpindah · ketik untuk mencari · Enter memilih · Esc menutup |
| [Tabs](COMPONENTS.md#c-16-tabs) | Panah berpindah tab · Home/End ke ujung |
| [Radio](COMPONENTS.md#c-11-radio) | Panah berpindah dalam grup · Tab keluar dari grup |
| [Table](COMPONENTS.md#c-15-table) | Kepala kolom dapat difokus untuk mengurutkan · Enter membuka baris |
| [Drawer](COMPONENTS.md#c-28-drawer) | Fokus masuk & terkunci · Esc menutup · fokus kembali ke pemicu |
| [Tooltip](COMPONENTS.md#c-18-tooltip) | **Muncul saat fokus**, bukan hanya hover · Esc menutup |
| [Kalender](COMPONENTS.md#c-24-kalender-ketersediaan) | Panah berpindah slot · Enter memilih · Shift+Panah memperluas · Esc membatalkan (`CAL-UI-08`) |
| [Pemindai QR](COMPONENTS.md#c-25-pemindai-qr) | Tombol kode manual **berada dalam urutan fokus** (`FR-05.2 A1`) |
| [Pengunggah Foto](COMPONENTS.md#c-26-pengunggah-foto) | Area unggah dapat difokus; Enter memanggil pemilih berkas |
| [Pagination](COMPONENTS.md#c-19-pagination) | Tab antar-tombol halaman |

## 6.3 Alur kritis yang wajib diuji papan ketik

15 alur kritis Bab 30.2 seluruhnya wajib dapat diselesaikan tanpa tetikus. Empat yang paling berisiko:

| Alur | Titik risiko |
|---|---|
| F-09 Reservasi ruangan | Pemilihan slot pada kalender (`CAL-UI-08`) |
| F-07 Keputusan approval | Fokus pada linimasa panjang lalu ke tombol keputusan |
| F-18 Rekonsiliasi opname | Tabel selisih dengan kolom keterangan wajib |
| F-05 Impor massal | Area unggah berkas dan tabel laporan galat |

---

# 7. Focus State

## 7.1 Spesifikasi ring

| Aspek | Nilai |
|---|---|
| Bentuk | Outline 2px `color.border.focus` `#1F7A8C` + offset 2px |
| Kontras | 4,98:1 terhadap putih — memenuhi SC 1.4.11 (≥3:1) |
| Radius | Mengikuti radius elemen |
| Offset ke dalam | `−2px` pada item sidebar dan tab, agar tidak terpotong wadahnya |

**Ring fokus tidak pernah dihapus.** `outline: none` tanpa pengganti adalah pelanggaran `NFR-AC-03`.

## 7.2 Fokus vs hover

| State | Pemicu | Perlakuan |
|---|---|---|
| `hover` | Pointer | Perubahan latar saja |
| `focus` | Papan ketik | Ring 2px |
| `focus-visible` | Papan ketik saja | Ring hanya muncul untuk navigasi papan ketik, tidak setelah klik tetikus |

Memakai `:focus-visible` mencegah ring muncul saat klik tetikus tanpa mengorbankan pengguna papan ketik.

## 7.3 Fokus pada latar berwarna

Di atas fill teal atau accent gelap, ring memakai `#FFFFFF` dengan offset 2px agar tetap terlihat.

---

# 8. Screen Reader

| Konteks | Ketentuan |
|---|---|
| Bahasa dokumen | `lang="id"` — menentukan pelafalan (`NFR-AC-09`) |
| Judul halaman | Unik dan menyebut objek: "Detail Aset LAB-KOM-0002 — SIGM4" |
| Struktur heading | Satu `h1` per halaman; hierarki tidak melompat |
| Landmark | `banner` · `navigation` · `main` · `contentinfo` |
| Navigasi | `<nav aria-label="Navigasi utama">` · `<nav aria-label="Breadcrumb">` · `<nav aria-label="Paginasi">` |
| Item aktif | `aria-current="page"` |
| Tabel | `<caption>` menyebut isi **dan filter aktif** · `scope` pada `<th>` · `aria-sort` pada kolom terurut |
| Formulir | `<label for>` eksplisit · galat ditautkan `aria-describedby` · `aria-invalid` saat bergalat |
| Pesan galat | Menyebut **nama field** dan cara memperbaikinya |
| Grafik | **Tabel data alternatif wajib** — bukan hanya `alt` pada kanvas |
| Ikon dekoratif | `aria-hidden="true"` |
| Ikon fungsional | `aria-label` bermakna |
| Dialog | `role="dialog"` + `aria-modal="true"` + `aria-labelledby` |

## 8.1 Live region

| Perubahan | Jenis | Alasan |
|---|---|---|
| Penghitung notifikasi | `polite` | Tidak menginterupsi pekerjaan |
| Jumlah hasil filter | `polite` | Konfirmasi bahwa filter bekerja |
| Progres opname & unggah | `polite` | Umpan balik berkala |
| Perubahan halaman paginasi | `polite` | Menyebut rentang baru |
| Selesai memuat | `polite` | Melepas `aria-busy` |
| Galat form saat submit | `assertive` | Menghalangi penyelesaian tugas |
| Banner koneksi putus | `assertive` | Memengaruhi setiap aksi berikutnya |
| Toast sukses | `polite` | — |

## 8.2 Yang tidak boleh hanya visual

| Informasi | Cara menyampaikannya ke pembaca layar |
|---|---|
| Status & kondisi aset | Teks di dalam [Badge](COMPONENTS.md#c-13-badge), bukan hanya warna |
| Keadaan slot kalender | Label tekstual per sel yang menyebut ruangan, waktu, dan keadaan |
| Arah pengurutan kolom | `aria-sort` |
| Langkah wizard aktif | Teks "Langkah 2 dari 3" |
| Field wajib | Kata "wajib" pada label |
| Tombol dinonaktifkan | Teks alasan, bukan hanya `disabled` |
| Foto belum terunggah | Teks "Foto belum terunggah" |
| Pelanggaran SLA | Teks "Melewati batas 2 hari" |

---

# 9. Contrast

Target **WCAG 2.1 level AA** (`NFR-AC-01`): teks normal ≥4,5:1, teks besar ≥3:1, komponen antarmuka & indikator state ≥3:1 (SC 1.4.11).

## 9.1 Kombinasi yang diverifikasi

| Kombinasi | Rasio | Status |
|---|---:|---|
| `text.heading` `#111827` di `#FFFFFF` | 17,74 | ✓ AAA |
| `text.primary` `#4B5563` di `#FFFFFF` | 7,56 | ✓ AAA |
| `text.secondary` `#6B7280` di `#FFFFFF` | 4,83 | ✓ AA |
| `text.link` `#1F7A8C` di `#FFFFFF` | 4,98 | ✓ AA |
| Putih di tombol `teal.600` | 4,98 | ✓ AA |
| Putih di tombol hover `teal.700` | 6,66 | ✓ AA |
| Putih di tombol active `teal.800` | 8,74 | ✓ AAA |
| Teks nav aktif `teal.800` di `teal.50` | 8,10 | ✓ AAA |
| Putih di tombol `danger` `error.base` | 6,57 | ✓ AA |
| `border.strong` `#868E9B` di `#FFFFFF` | 3,30 | ✓ SC 1.4.11 |
| `border.strong` di `surface.subtle` `#F9FAFB` | 3,16 | ✓ SC 1.4.11 |
| Ring fokus `teal.600` di `#FFFFFF` | 4,98 | ✓ SC 1.4.11 |
| Badge `success.strong` di `success.subtle` | 7,25 | ✓ AA |
| Badge `warning.strong` di `warning.subtle` | 7,27 | ✓ AA |
| Badge `error.strong` di `error.subtle` | 8,40 | ✓ AA |
| Badge `info.strong` di `info.subtle` | 7,84 | ✓ AA |
| Badge netral `neutral.700` di `neutral.100` | 9,37 | ✓ AA |

## 9.2 Warna logo yang tidak memenuhi kontras

Tiga warna logo tidak dapat dipakai apa adanya sebagai teks. Ketiganya didokumentasikan beserta cara pemakaiannya — bukan diubah nilainya.

| Warna logo | Rasio vs putih | Konsekuensi | Cara memakainya |
|---|---:|---|---|
| `accent.yellow` `#FEB003` | **1,84** | Gagal AA teks **dan** SC 1.4.11 | Hanya fill; teks di atasnya `#111827` (9,65 ✓). Sebagai penanda 3px bersifat dekoratif |
| `accent.gray` `#7B7B7B` | **4,23** | Gagal AA teks; teks gelap di atasnya juga gagal (4,19) | Hanya penanda 3px dan seri grafik. **Tidak boleh jadi badge** — badge abu memakai `neutral.100` + `neutral.700` |
| `accent.green` `#028744` | 4,61 | Lolos AA teks, tetapi tipis | Diizinkan sebagai fill badge dengan teks putih; tetap dilarang sebagai teks (**DSD-07**) |

**Solusi sistemik.** Alih-alih membuat varian gelap tiap accent, **DSD-07** melarang accent menjadi teks sama sekali. Aturannya satu baris, tidak punya pengecualian, dan dapat ditegakkan lint: `color.accent.*` tidak boleh muncul pada properti `color`, `border-color`, atau `fill` ikon.

## 9.3 Yang dikecualikan

| Elemen | Rasio | Dasar pengecualian |
|---|---:|---|
| `text.tertiary` placeholder | 2,54 | Placeholder bukan konten wajib; label eksplisit selalu ada (`NFR-AC-05`) |
| `border.subtle` divider | 1,24 | Dekoratif, tidak mengidentifikasi kontrol — di luar SC 1.4.11 |
| Teks & border `disabled` | 2,31–2,54 | WCAG mengecualikan komponen nonaktif; **wajib** disertai teks alasan |
| Penanda 3px accent | 1,84–11,17 | Dekoratif; nama grup dibawa teks (`NFR-AC-06`) |

## 9.4 Penegakan

Token warna divalidasi kontras **saat build**; kegagalan menggagalkan CI (`NFR-AC-01`, `NFR-AC-02`, `SDD-FE` §4.6). Pemeriksa aksesibilitas otomatis berjalan di CI atas seluruh halaman utama. Karena hanya ada satu tema (**UXD-12**), validasi punya satu sasaran.

---

# 10. Color Blindness

Palet disimulasikan terhadap protanopia, deuteranopia, dan tritanopia. **Tiga tabrakan nyata ditemukan** dan didokumentasikan di sini — bukan diabaikan.

## 10.1 Tabrakan pada accent

| Pasangan | Jenis | Jarak RGB setelah simulasi | Konteks |
|---|---|---:|---|
| `accent.green` vs `accent.purple` | Protanopia | **20** | Grup Pemanfaatan vs Pengawasan |
| `accent.green` vs `accent.purple` | Deuteranopia | **30** | idem |
| `accent.blue` vs `accent.green` | Tritanopia | **35** | Grup Aset & Bahan vs Pemanfaatan |

**Mengapa ini tidak menjadi kegagalan.** Accent hanya muncul sebagai penanda 3px di sebelah **nama grup yang selalu tertulis**, dan sebagai seri grafik yang **selalu punya legenda tekstual + pola**. Tidak ada satu pun tempat di SIGM4 di mana warna accent menjadi satu-satunya pembawa makna — itulah yang `NFR-AC-06` tuntut, dan itulah sebabnya **DSD-07** melarang accent menjadi teks atau ikon.

**Mitigasi pada grafik.** Urutan seri tetap menempatkan biru (1), hijau (2), kuning (3), merah (4), abu (5), ungu (6) — hijau dan ungu berjarak empat posisi, sehingga jarang bersebelahan. Pada grafik dengan ≥4 seri, **pola atau penanda wajib** ditambahkan di samping warna.

## 10.2 Tabrakan pada semantic

| Pasangan | Jenis | Jarak RGB | Keterangan |
|---|---|---:|---|
| `warning` vs `error` | Tritanopia | **11** | Tabrakan terkuat di seluruh sistem |
| `warning` vs `error` | Deuteranopia | 18 | |
| `warning` vs `error` | Protanopia | 23 | |

**Ini masalah nyata**, karena `warning` dan `error` sering muncul berdampingan — mis. tabel peminjaman yang memuat baris "Akan Jatuh Tempo" (warning) dan "Terlambat" (error).

**Mitigasi wajib, bukan opsional:**

| Aturan | Wujud |
|---|---|
| Ikon **berbeda bentuk** | `warning` = segitiga · `error` = lingkaran bersilang. Bentuknya berbeda, bukan hanya warnanya |
| Teks **selalu** ada | "Akan Jatuh Tempo" vs "Terlambat" — kata yang berbeda, bukan nuansa warna |
| Tidak pernah berdampingan tanpa label | Dilarang membuat legenda berupa titik warna saja |
| Uji cetak hitam-putih | Tabel dan grafik wajib tetap terbaca saat dicetak grayscale — laporan diekspor ke PDF dan dicetak (`NFR-C-07`) |

## 10.3 Aturan penutup

> **Warna tidak pernah menjadi satu-satunya indikator informasi.** Setiap status, kategori, keadaan slot, arah pengurutan, dan langkah wizard membawa maknanya lewat teks dan bentuk. Bila sebuah layar tetap dapat digunakan saat seluruh warnanya dihilangkan, layar itu memenuhi `NFR-AC-06`.

**Cara mengujinya:** buka layar dalam mode grayscale. Bila ada informasi yang hilang, ada token warna yang dipakai salah.

---

# 11. Reduced Motion

`prefers-reduced-motion: reduce` mengubah perilaku berikut:

| Aspek | Normal | Reduced |
|---|---|---|
| Durasi transisi | 120–280ms | **0ms** |
| Transform masuk/keluar | Geser + fade | **Fade saja** |
| Denyut skeleton | Denyut 1,5s | **Balok statis** |
| Bar progres | Bergerak halus | Melompat per pembaruan nilai |
| Penghitung notifikasi | Transisi nilai | Berganti seketika |
| Drawer & modal | Geser masuk | Muncul seketika |
| Kedip berhasil memindai | Kedip warna | Ikon statis + haptik |

**Yang tidak pernah dihilangkan:** perubahan state fokus, hover, dan seluruh umpan balik yang membawa informasi. Reduced motion mengurangi gerakan, bukan menghilangkan umpan balik.

---

# 12. Accessibility Checklist

Pemenuhan `DS-06`. Setiap komponen pada [`COMPONENTS.md`](COMPONENTS.md) wajib lulus **seluruh** baris sebelum dinyatakan selesai.

## 12.1 Daftar periksa per komponen

| # | Pemeriksaan | Cara menguji |
|---|---|---|
| 1 | Seluruh fungsi dapat dioperasikan tanpa tetikus | Cabut tetikus, selesaikan alurnya |
| 2 | Indikator fokus terlihat dan berkontras ≥3:1 | Tab melalui seluruh elemen |
| 3 | Seluruh informasi status tersedia sebagai teks | Buka dalam mode grayscale |
| 4 | Ikon fungsional punya label teks atau `aria-label` bermakna | Telusuri dengan pembaca layar |
| 5 | Kontras teks memenuhi ambang AA | Validator kontras di CI |
| 6 | Perbesaran 200% tidak menyembunyikan fungsi | Zoom peramban 200% pada 1366px |
| 7 | Perubahan dinamis diumumkan pembaca layar | Uji dengan NVDA/VoiceOver |
| 8 | Galat menyebut nama field dan cara memperbaikinya | Kirim form kosong |
| 9 | Target sentuh ≥44×44 dp | Inspeksi kotak sentuh |
| 10 | Seluruh teks Bahasa Indonesia baku tanpa istilah teknis | Tinjauan naskah |
| 11 | Berfungsi dengan `prefers-reduced-motion` | Aktifkan preferensi sistem |
| 12 | Tidak ada `tabindex` positif dan `outline: none` tanpa pengganti | Lint |

## 12.2 Daftar periksa per halaman

| # | Pemeriksaan | Sumber |
|---|---|---|
| 1 | Enam keadaan tertangani: memuat, kosong, galat, tanpa akses, luring, sukses | [`UX §7.3`](../UX/PAGE-SPECIFICATION.md#73-pola-lima-keadaan-global) · [`PATTERNS §8`](PATTERNS.md#8-empty--error-state) |
| 2 | Setiap keadaan kosong dan galat memiliki aksi berikutnya | `UX-05` |
| 3 | Satu `h1`, hierarki heading tidak melompat | §8 |
| 4 | Landmark lengkap | §8 |
| 5 | Judul halaman unik dan menyebut objek | §8 |
| 6 | Breadcrumb terisi meski mendarat dari deep link | [`UX §5.4`](../UX/NAVIGATION.md#54-breadcrumb) |
| 7 | Tautan "Lewati ke konten utama" ada | §6.1 |
| 8 | Filter aktif tercermin di URL dan diumumkan | `FR-04.2` · §8.1 |
| 9 | Tepat satu tombol `primary` | [`PATTERNS §11`](PATTERNS.md#11-cta-hierarchy) |
| 10 | Aksi terhalang keadaan terlihat + beralasan; aksi di luar permission tidak dirender | `UX-05` · `PM-04` |
| 11 | Tidak menggulir horizontal pada 320px | `NFR-C-02` |
| 12 | Terbaca saat dicetak grayscale | §10.2 |

## 12.3 Gerbang rilis

| Gerbang | Ketentuan |
|---|---|
| Per commit | Validasi kontras token + lint aksesibilitas menggagalkan CI (`SDD-FE` §4.6) |
| Per komponen | 12 baris §12.1 lulus sebelum komponen masuk pustaka (`DS-06`) |
| Per halaman | 12 baris §12.2 lulus sebelum halaman masuk staging |
| Per alur kritis | 15 alur Bab 30.2 dapat diselesaikan tanpa tetikus |
| Sebelum go-live | Audit WCAG 2.1 AA menyeluruh (`NFR-AC-01`); matriks perangkat Bab 30.6 diuji |

## 12.4 Matriks perangkat uji

Diambil dari Bab 30.6 — tidak ditetapkan ulang di sini.

| Kategori | Wajib diuji |
|---|---|
| Peramban desktop | Chrome & Edge terbaru · Firefox terbaru · Safari terbaru |
| Peramban mobile | Chrome Android · Safari iOS |
| Android batas bawah | Android 8, RAM 2GB (`NFR-C-03`) |
| Android kelas menengah | Android 12+, RAM 4GB (definisi `NFR-P-10`) |
| Android kelas atas | Android 14+, RAM ≥8GB |
| iOS | iOS 14 batas bawah dan iOS terbaru |
| Tablet | Satu perangkat per platform (**UXD-11**) |
| Resolusi web | 320 · 768 · 1366 · 1920px |
| Pembaca layar | NVDA (Windows) · VoiceOver (iOS/macOS) · TalkBack (Android) |

---

## Berkas terkait

| Berkas | Hubungan |
|---|---|
| [`DESIGN-SYSTEM.md`](DESIGN-SYSTEM.md) | Hierarki warna dan alasan di balik keputusan `DSD-01`…`DSD-08` |
| [`FOUNDATIONS.md`](FOUNDATIONS.md) | Nilai token yang diverifikasi kontrasnya di §9 |
| [`COMPONENTS.md`](COMPONENTS.md) | 29 komponen yang wajib lulus daftar periksa §12.1 |
| [`PATTERNS.md`](PATTERNS.md) | Pola halaman yang wajib lulus daftar periksa §12.2 |
| [`UX/PAGE-SPECIFICATION.md`](../UX/PAGE-SPECIFICATION.md) | §10 Responsive UX dan §11 Accessibility UX — perilaku yang diwujudkan berkas ini |
| [`PRD/03-architecture/nfr.md`](../PRD/03-architecture/nfr.md) | `NFR-AC-01`…`NFR-AC-09` · `NFR-C-01`…`NFR-C-04` |
| [`PRD/06-quality/test-strategy.md`](../PRD/06-quality/test-strategy.md) | Bab 30.2 alur kritis · Bab 30.6 matriks perangkat |
