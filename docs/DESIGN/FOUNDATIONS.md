# Foundations — SIGM4 Design System

> **Design System SIGM4** — [Overview](DESIGN-SYSTEM.md) · **Foundations** · [Components](COMPONENTS.md) · [Patterns](PATTERNS.md) · [Responsive & Accessibility](RESPONSIVE-ACCESSIBILITY.md)

**Berkas ini memuat nilai token yang mengikat.** Hierarki dan alasannya ada di [`DESIGN-SYSTEM.md`](DESIGN-SYSTEM.md); berkas ini hanya menyebut nilainya, fungsinya, dan larangannya.

| § | Bagian |
|---|---|
| [1](#1-color-tokens) | Color Tokens |
| [2](#2-typography) | Typography |
| [3](#3-spacing) | Spacing |
| [4](#4-grid--container) | Grid & Container |
| [5](#5-breakpoints) | Breakpoints |
| [6](#6-border--radius) | Border & Radius |
| [7](#7-elevation) | Elevation |
| [8](#8-iconography) | Iconography |
| [9](#9-motion) | Motion |
| [10](#10-sizing) | Sizing |

---

# 1. Color Tokens

## 1.0 Cara membaca

Setiap token memiliki nama, nilai, fungsi, contoh pemakaian, dan **contoh pemakaian yang dilarang**. Kolom kontras diukur terhadap latar yang disebut, memakai rumus WCAG 2.1.

Token berperan (`color.text.*`, `color.border.*`) **menunjuk** ke palet mentah (`color.neutral.*`, `teal.*`). Komponen memakai token berperan; palet mentah hanya dipakai di berkas token.

## 1.1 Brand — Primary & Secondary

| Token | Hex | RGB | HSL | Fungsi | Contoh pemakaian | Dilarang |
|---|---|---|---|---|---|---|
| `color.primary` | `#4B5563` | `75, 85, 99` | `215 14% 34%` | Warna struktur: navigasi, heading, label penting, aksi netral | Teks menu sidebar · label kolom tabel · teks tombol sekunder · ikon navigasi | Latar penuh halaman/sidebar · warna CTA · warna tautan · penanda status |
| `color.secondary` | `#1F7A8C` | `31, 122, 140` | `190 64% 34%` | Warna interaksi tunggal: CTA, tautan, active, selected, focus | Tombol "Ajukan" · item sidebar aktif · tautan `RSV-RG-2026-0001` · ring fokus · checkbox tercentang | Elemen non-interaktif · penanda status · latar section · badge kategori |

**Skala teal** (`color.secondary` = `teal.600`):

| Token | Hex | Kontras vs putih | Dipakai untuk |
|---|---|---:|---|
| `teal.50` | `#F2F7F8` | 1,08 | Latar item nav aktif · latar baris tabel terpilih · latar toast info interaktif |
| `teal.100` | `#E0ECEF` | 1,21 | Hover latar item nav · latar chip filter aktif |
| `teal.200` | `#C5DCE1` | 1,43 | Border tombol tersier saat hover |
| `teal.300` | `#9CC4CC` | 1,88 | Track slider · bar progres bagian kosong |
| `teal.400` | `#67A5B1` | 2,77 | Ikon dekoratif pada ilustrasi |
| `teal.500` | `#3E8D9C` | 3,82 | **Hanya** elemen non-teks berukuran ≥3px |
| **`teal.600`** | **`#1F7A8C`** | **4,98** | **Fill tombol primer · tautan · ring fokus · garis aktif** |
| `teal.700` | `#196574` | 6,66 | Hover tombol primer · teks tautan saat hover |
| `teal.800` | `#15525F` | 8,74 | Active/pressed · teks pada latar `teal.50` |
| `teal.900` | `#10404A` | 11,33 | Teks penekanan tinggi di atas `teal.100` |

> `teal.300`–`teal.500` **tidak boleh** menjadi warna teks di atas putih. Ambang aman teks dimulai di `teal.600`.

## 1.2 Accent

Satu nilai per accent, **tanpa varian** (**DSD-07**). Pemetaan grup domain mengikuti **UXD-01**.

| Token | Hex | RGB | HSL | Grup domain | Kontras vs putih | Teks di atasnya |
|---|---|---|---|---|---:|---|
| `color.accent.blue` | `#00529C` | `0, 82, 156` | `208 100% 31%` | Aset & Lokasi | 7,82 | `#FFFFFF` (7,82 ✓) |
| `color.accent.green` | `#028744` | `2, 135, 68` | `150 97% 27%` | Pemanfaatan | 4,61 | `#FFFFFF` (4,61 ✓) |
| `color.accent.yellow` | `#FEB003` | `254, 176, 3` | `41 99% 50%` | Perawatan | 1,84 | `#111827` (9,65 ✓) |
| `color.accent.purple` | `#541F7F` | `84, 31, 127` | `273 61% 31%` | Pengawasan | 11,17 | `#FFFFFF` (11,17 ✓) |
| `color.accent.gray` | `#7B7B7B` | `123, 123, 123` | `0 0% 48%` | Sistem | 4,23 | ⚠ **tidak boleh jadi badge** |
| `color.accent.red` | `#D4160D` | `212, 22, 13` | `3 88% 44%` | *(tidak dipetakan)* | 5,36 | `#FFFFFF` (5,36 ✓) |

**Fungsi:** penanda garis 3px pada label grup sidebar dan di bawah judul halaman · isi batang/segmen grafik M-16 · latar badge kategori · bidang datar pada ilustrasi empty state.

**Dilarang untuk seluruh accent:** warna teks · warna ikon · border tipis 1px · fill tombol · latar halaman atau section penuh · kombinasi dua accent pada satu komponen · gradien antar-accent.

**Catatan `accent.gray`:** dengan teks putih 4,23:1 dan teks gelap 4,19:1, keduanya di bawah AA — badge abu wajib memakai `neutral.100` + `neutral.700` (9,37 ✓). `accent.gray` tetap sah sebagai penanda 3px dan seri grafik netral.

**Urutan seri data visualisasi** (M-16). Urutan ini tetap agar grafik yang sama selalu berwarna sama:

```
1. accent.blue    #00529C     4. accent.red     #D4160D
2. accent.green   #028744     5. accent.gray    #7B7B7B
3. accent.yellow  #FEB003     6. accent.purple  #541F7F
```

Grafik dengan lebih dari 6 seri wajib mengelompokkan sisanya menjadi "Lainnya" — sistem tidak menyediakan warna ketujuh.

## 1.3 Neutral

Skala tunggal yang melayani seluruh background, surface, border, dan teks. `color.primary` adalah `neutral.600`.

| Token | Hex | Kontras vs putih | Fungsi utama |
|---|---|---:|---|
| `color.neutral.50` | `#F9FAFB` | 1,05 | Latar halaman · latar kepala tabel · baris zebra |
| `color.neutral.100` | `#F3F4F6` | 1,10 | Latar hover baris · latar badge netral · latar disabled |
| `color.neutral.200` | `#E5E7EB` | 1,24 | Divider · garis tabel · border kartu |
| `color.neutral.300` | `#D1D5DB` | 1,47 | Border dekoratif · track komponen |
| `color.neutral.400` | `#9CA3AF` | 2,54 | Teks placeholder · ikon disabled |
| `color.neutral.500` | `#6B7280` | 4,83 | Teks tersier · breadcrumb · label grup sidebar |
| **`color.neutral.600`** | **`#4B5563`** | **7,56** | **Teks isi · label · ikon · = `color.primary`** |
| `color.neutral.700` | `#374151` | 10,31 | Teks penekanan · badge netral · fill ikon aktif |
| `color.neutral.800` | `#1F2937` | 14,68 | Heading level 2–3 |
| `color.neutral.900` | `#111827` | 17,74 | Heading level 1 · teks di atas accent terang |

## 1.4 Background & Surface

| Token | Nilai | Fungsi | Contoh | Dilarang |
|---|---|---|---|---|
| `color.background.page` | `neutral.50` `#F9FAFB` | Latar terluar area konten | Latar di belakang kartu dashboard | Menjadi latar kartu itu sendiri |
| `color.background.subtle` | `neutral.100` `#F3F4F6` | Latar area yang perlu dibedakan tanpa kartu | Latar panel filter yang diciutkan | Latar seluruh halaman |
| `color.surface.default` | `#FFFFFF` | Permukaan konten utama | Kartu · tabel · sidebar · topbar · modal · drawer | — |
| `color.surface.subtle` | `neutral.50` `#F9FAFB` | Permukaan sekunder di dalam surface | Kepala tabel · footer kartu · baris zebra | Permukaan modal |
| `color.surface.raised` | `#FFFFFF` + `elevation.1` | Permukaan mengambang | Dropdown · popover · tooltip · toast | Kartu statis di dalam halaman |
| `color.surface.selected` | `teal.50` `#F2F7F8` | Permukaan terpilih | Baris tabel terpilih · item nav aktif · opsi terpilih | Permukaan hover biasa |

## 1.5 Border

| Token | Nilai | Kontras vs putih | Fungsi | Dilarang |
|---|---|---:|---|---|
| `color.border.subtle` | `neutral.200` `#E5E7EB` | 1,24 | Border **dekoratif**: divider, garis antar-baris tabel, border kartu | Border input, checkbox, radio, atau kontrol lain |
| `color.border.strong` | `#868E9B` | **3,30** | Border **fungsional**: seluruh form control | Divider dekoratif — terlalu berat secara visual |
| `color.border.focus` | `teal.600` `#1F7A8C` | 4,98 | Ring fokus 2px + offset 2px | Border keadaan istirahat |
| `color.border.error` | `error.base` `#B42318` | 6,57 | Border input bergalat | Border dekoratif |
| `color.border.disabled` | `neutral.300` `#D1D5DB` | 1,47 | Border kontrol nonaktif | Kontrol aktif |

> **Mengapa ada dua border.** WCAG SC 1.4.11 menuntut minimal 3:1 bagi elemen yang **mengidentifikasi kontrol antarmuka**. `#E5E7EB` (1,24) memadai sebagai divider tetapi gagal syarat itu, sehingga input, checkbox, radio, select, dan textarea wajib memakai `color.border.strong` `#868E9B` — 3,30 terhadap putih dan 3,16 terhadap `#F9FAFB`. Divider dekoratif dikecualikan dari SC 1.4.11 dan tetap memakai `border.subtle`.

## 1.6 Text

| Token | Nilai | Kontras vs putih | Fungsi | Dilarang |
|---|---|---:|---|---|
| `color.text.heading` | `neutral.900` `#111827` | 17,74 | `h1`–`h3` · nilai KPI · teks di atas `accent.yellow` | Paragraf panjang |
| `color.text.primary` | `neutral.600` `#4B5563` | 7,56 | Teks isi · label form · label kolom · teks menu | Teks di atas latar gelap |
| `color.text.secondary` | `neutral.500` `#6B7280` | 4,83 | Teks pendukung · breadcrumb · label grup sidebar · keterangan | Informasi penting |
| `color.text.tertiary` | `neutral.400` `#9CA3AF` | 2,54 | **Hanya placeholder** | Teks apa pun yang membawa informasi |
| `color.text.link` | `teal.600` `#1F7A8C` | 4,98 | Tautan dalam teks | Teks yang tidak dapat ditekan |
| `color.text.link.hover` | `teal.700` `#196574` | 6,66 | Tautan saat hover/fokus | — |
| `color.text.inverse` | `#FFFFFF` | — | Teks di atas fill teal, accent gelap, semantic base | Latar terang |
| `color.text.disabled` | `neutral.400` `#9CA3AF` | 2,54 | Teks kontrol nonaktif | Teks aktif |

> `color.text.tertiary` sengaja gagal AA (2,54:1). Ia hanya untuk placeholder, dan placeholder **tidak pernah** menjadi satu-satunya label — `NFR-AC-05` mewajibkan label eksplisit. Bila teks tertiary membawa informasi, ia salah token.

## 1.7 Icon

| Token | Nilai | Fungsi | Dilarang |
|---|---|---|---|
| `color.icon.default` | `neutral.600` `#4B5563` | Ikon navigasi, ikon aksi, ikon dalam tabel | — |
| `color.icon.muted` | `neutral.500` `#6B7280` | Ikon dekoratif, ikon dalam teks pendukung | Ikon yang menyampaikan status |
| `color.icon.interactive` | `teal.600` `#1F7A8C` | Ikon yang **sendirinya** dapat ditekan; ikon pada item aktif | Ikon non-interaktif |
| `color.icon.inverse` | `#FFFFFF` | Ikon di atas fill teal atau accent gelap | — |
| `color.icon.disabled` | `neutral.400` `#9CA3AF` | Ikon kontrol nonaktif | — |
| `color.icon.success` `.warning` `.error` `.info` | `*.base` semantic | Ikon status pada badge, alert, lencana | Ikon dekoratif |

**Accent tidak pernah menjadi warna ikon** (**DSD-07**) — termasuk ikon grup sidebar, yang tetap `color.icon.default`.

## 1.8 Semantic

Tiga nilai per semantic. Berbeda dari accent, semantic **boleh** menjadi warna teks dan ikon karena seluruh `base`-nya lolos AA.

| Token | Hex | RGB | Kontras vs putih | Fungsi |
|---|---|---|---:|---|
| `color.success.subtle` | `#E6F1ED` | `230, 241, 237` | 1,13 | Latar alert & badge sukses |
| `color.success.base` | `#067647` | `6, 118, 71` | 5,69 | Ikon, border, teks, fill tombol sukses |
| `color.success.strong` | `#075B38` | `7, 91, 56` | 8,19 | Teks di atas `success.subtle` |
| `color.warning.subtle` | `#F8EDE6` | `248, 237, 230` | 1,09 | Latar alert & badge peringatan |
| `color.warning.base` | `#B54708` | `181, 71, 8` | 5,43 | Ikon, border, teks peringatan |
| `color.warning.strong` | `#8A3808` | `138, 56, 8` | 7,93 | Teks di atas `warning.subtle` |
| `color.error.subtle` | `#F8E9E8` | `248, 233, 232` | 1,10 | Latar alert & badge galat |
| `color.error.base` | `#B42318` | `180, 35, 24` | 6,57 | Ikon, border, teks, **fill tombol destruktif** |
| `color.error.strong` | `#8A1D14` | `138, 29, 20` | 9,27 | Hover tombol destruktif · teks di atas `error.subtle` |
| `color.info.subtle` | `#E8EFFB` | `232, 239, 251` | 1,08 | Latar alert & badge informasi |
| `color.info.base` | `#175CD3` | `23, 92, 211` | 5,99 | Ikon, border, teks informasi |
| `color.info.strong` | `#1448A1` | `20, 72, 161` | 8,50 | Teks di atas `info.subtle` |

**Makna yang mengikat:**

| Semantic | Makna | Contoh di SIGM4 | Dilarang |
|---|---|---|---|
| `success` | Berhasil · selesai · valid · tepat waktu | Aset `Tersedia` · WO `Selesai` · denda `Lunas` · toast simpan berhasil | Menyatakan grup **Pemanfaatan** — itu `accent.green` |
| `warning` | Perhatian · perlu tindakan · mendekati batas | Jatuh tempo ≤3 hari · SLA hampir terlampaui · `Rusak Ringan` · garansi ≤30 hari · sisa tagihan `Dibebaskan Sebagian` | Menyatakan grup **Perawatan** — itu `accent.yellow` |
| `error` | Kesalahan · gagal · destruktif · terlambat | Galat validasi · `Terlambat` · `Rusak Berat` · `Hilang` · urgensi `Kritis` · tombol destruktif | Menyatakan kategori atau identitas apa pun |
| `info` | Informasi kontekstual · netral · sedang berjalan | Banner sesi akan berakhir · catatan linimasa · `Dipinjam` · `Dalam Perbaikan` | Menyatakan grup **Aset & Lokasi** — itu `accent.blue` |

## 1.9 Pemetaan enum ke warna

Enum Bab 11.3 → semantic. Seluruhnya **wajib** disertai teks label dan ikon (`UX-03`, `NFR-AC-06`).

| Enum | Semantic | Ikon |
|---|---|---|
| Kondisi `Baik` · Status `Tersedia` | `success` | centang dalam lingkaran |
| Kondisi `Rusak Ringan` · Status `Direservasi` | `warning` | segitiga seru |
| Kondisi `Rusak Berat` · `Hilang` · Status `Tidak Tersedia` | `error` | silang dalam lingkaran |
| Status `Dipinjam` · `Dalam Perbaikan` | `info` | lingkaran huruf i |
| Status `Draf` · `Dibatalkan` · `Kedaluwarsa` · slot `Released` | netral `neutral.100` + `neutral.700` | lingkaran kosong |
| Denda `Lunas` · `Dibebaskan` | `success` | centang dalam lingkaran |
| Denda `Dibebaskan Sebagian` | `warning` | segitiga seru |
| Denda `Belum Dibayar` | `error` bila melewati ambang `BR-030`, `warning` bila belum | segitiga seru |

---

# 2. Typography

## 2.1 Font family

| Token | Nilai | Alasan |
|---|---|---|
| `font.family.sans` | `Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif` | **DSD-04**. Angka tabular bawaan dan x-height tinggi untuk tabel padat; variable font sehingga satu berkas melayani seluruh bobot; dukungan Latin penuh sesuai 31.2 |
| `font.family.mono` | `"JetBrains Mono", "SFMono-Regular", Consolas, monospace` | **Hanya** untuk `request_id` pada layar galat (31.5). Kode barang dan nomor dokumen memakai `font.family.sans` dengan `font-variant-numeric: tabular-nums` |

**Pemuatan:** self-host sebagai variable font WOFF2, `font-display: swap`, subset Latin + Latin Extended. Fallback stack di atas wajib ada — pada perangkat kelas bawah (`NFR-C-03`, Android 8) kegagalan memuat font tidak boleh membuat teks hilang.

**`font-variant-numeric: tabular-nums` wajib** pada: seluruh sel tabel berangka, nilai KPI dashboard, nominal rupiah, nomor dokumen, dan kolom tanggal. Tanpa itu angka bergoyang antar-baris dan tabel 4.820 aset menjadi sulit dipindai.

## 2.2 Skala ukuran

Enam tingkat sesuai 31.2. Ukuran badan teks minimum **16px web** dan **14sp mobile**.

| Token | px (web) | rem | sp (mobile) | Line height | Dipakai untuk |
|---|---:|---:|---:|---|---|
| `font.size.xs` | 12 | 0,75 | 11 | `line.height.tight` 1,33 | Label chip filter · keterangan tabel · penghitung badge |
| `font.size.sm` | 14 | 0,875 | 13 | `line.height.normal` 1,43 | Teks pendukung · breadcrumb · label kolom · teks tombol kecil |
| `font.size.base` | 16 | 1,0 | 14 | `line.height.normal` 1,5 | **Badan teks · isi tabel · label form · teks tombol** |
| `font.size.lg` | 18 | 1,125 | 16 | `line.height.normal` 1,44 | `h3` · judul kartu · judul drawer |
| `font.size.xl` | 24 | 1,5 | 20 | `line.height.tight` 1,33 | `h2` · judul modal · nilai KPI kecil |
| `font.size.2xl` | 30 | 1,875 | 24 | `line.height.tight` 1,27 | `h1` judul halaman |
| `font.size.3xl` | 36 | 2,25 | 28 | `line.height.tight` 1,22 | Nilai KPI besar · angka utama dashboard |

> `font.size.xs` **tidak boleh** dipakai untuk teks yang membawa informasi wajib. Pada mobile, 11sp berada di bawah kenyamanan baca dan tidak lolos uji perbesaran 200% dengan nyaman (`NFR-AC-08`).

## 2.3 Bobot

| Token | Nilai | Dipakai untuk | Dilarang |
|---|---:|---|---|
| `font.weight.regular` | 400 | Badan teks · isi tabel · keterangan | Heading |
| `font.weight.medium` | 500 | Label form · label kolom tabel · teks tombol · item nav | Paragraf panjang |
| `font.weight.semibold` | 600 | `h1`–`h3` · judul kartu · nilai KPI · nomor dokumen | Badan teks |
| `font.weight.bold` | 700 | **Hanya** penekanan dalam kalimat dan angka peringatan | Heading — 600 sudah cukup pada Inter |

Empat bobot ini adalah batas. Menambah 300 atau 800 memerlukan pembaruan berkas ini.

## 2.4 Line height & letter spacing

| Token | Nilai | Dipakai untuk |
|---|---:|---|
| `line.height.tight` | 1,25 | Heading · nilai KPI · teks satu baris |
| `line.height.normal` | 1,5 | Badan teks · isi tabel · label |
| `line.height.relaxed` | 1,7 | Paragraf panjang: penjelasan parameter sistem, justifikasi usulan, isi Pemberitahuan Privasi |

| Token | Nilai | Dipakai untuk |
|---|---:|---|
| `letter.spacing.tight` | −0,02em | `font.size.2xl` dan `3xl` |
| `letter.spacing.normal` | 0 | Seluruh ukuran lain |
| `letter.spacing.wide` | 0,04em | Label grup sidebar (huruf besar semua) · label chip |

## 2.5 Hierarki tipografi

| Peran | Ukuran | Bobot | Warna | Contoh di SIGM4 |
|---|---|---|---|---|
| Judul halaman (`h1`) | `2xl` 30px | 600 | `text.heading` | "Inventaris Aset" |
| Judul section (`h2`) | `xl` 24px | 600 | `text.heading` | "Rekonsiliasi Opname" |
| Judul kartu (`h3`) | `lg` 18px | 600 | `text.heading` | "Peminjaman Terlambat" |
| Label grup sidebar | `xs` 12px | 500 | `text.secondary` | "ASET & LOKASI" — huruf besar + `letter.spacing.wide` |
| Item navigasi | `base` 16px | 500 | `text.primary` | "Inventaris Aset" |
| Item navigasi aktif | `base` 16px | 600 | `teal.800` | — |
| Label kolom tabel | `sm` 14px | 500 | `text.primary` | "Kode Barang" |
| Isi tabel | `base` 16px | 400 | `text.primary` | "LAB-KOM-0002" |
| Nomor dokumen | `base` 16px | 600 | `text.link` bila dapat ditekan | "RSV-RG-2026-0001" |
| Label form | `sm` 14px | 500 | `text.primary` | "Nama kegiatan" |
| Pesan galat form | `sm` 14px | 400 | `error.base` | "Jumlah peserta melebihi kapasitas ruangan" |
| Nilai KPI | `3xl` 36px | 600 | `text.heading` | "4.820" |
| Label KPI | `sm` 14px | 400 | `text.secondary` | "Total Aset" |
| Keterangan / meta | `sm` 14px | 400 | `text.secondary` | "Diperbarui 2 menit lalu" |

## 2.6 Aturan bahasa pada tipografi

| Aturan | Alasan |
|---|---|
| Seluruh label memakai **Bahasa Indonesia baku** | `NFR-AC-09` · `UX-06` |
| `lang="id"` pada elemen akar | Menentukan pelafalan pembaca layar |
| Enum dirender dari peta kode → label; kode teknis tidak pernah tampil mentah | `SDD-FE-08` · `SDD-REPO-05` |
| Angka rupiah memakai pemisah ribuan titik | Konvensi Indonesia |
| Waktu selalu disertai penanda **WIB** | `CAL-UI-09` · `NFR-C-10` |
| Tidak ada teks huruf besar semua selain label grup sidebar dan label chip | Huruf besar semua menurunkan kecepatan baca dan memperburuk pembaca layar |

---

# 3. Spacing

Skala kelipatan **4px** sesuai 31.2. Tidak ada nilai di luar skala ini.

| Token | px | rem | Dipakai untuk |
|---|---:|---:|---|
| `spacing.0` | 0 | 0 | Reset |
| `spacing.1` | 4 | 0,25 | Jarak ikon ke teks dalam badge · padding chip |
| `spacing.2` | 8 | 0,5 | Jarak ikon ke teks tombol · gap antar-chip filter |
| `spacing.3` | 12 | 0,75 | Padding vertikal sel tabel · gap antar-field sebaris |
| `spacing.4` | 16 | 1 | **Padding standar** kartu, sel tabel horizontal, input |
| `spacing.5` | 20 | 1,25 | Gap antar-field form |
| `spacing.6` | 24 | 1,5 | Padding kartu besar · gap antar-kartu dashboard · padding modal |
| `spacing.8` | 32 | 2 | Jarak antar-section dalam halaman |
| `spacing.10` | 40 | 2,5 | Padding area konten pada `md` |
| `spacing.12` | 48 | 3 | Jarak antar-blok besar · padding area konten pada `lg` |
| `spacing.16` | 64 | 4 | Jarak sebelum footer · padding keadaan kosong |

**Aturan pemakaian:**

| Konteks | Nilai |
|---|---|
| Padding dalam tombol | `spacing.2` vertikal · `spacing.4` horizontal |
| Padding dalam input | `spacing.3` vertikal · `spacing.4` horizontal |
| Padding sel tabel desktop | `spacing.3` vertikal · `spacing.4` horizontal |
| Padding kartu | `spacing.6` seluruh sisi |
| Gap antar-field form | `spacing.5` |
| Gap antar-kartu dashboard | `spacing.6` |
| Padding area konten `xs`/`sm` | `spacing.4` |
| Padding area konten `md` | `spacing.10` |
| Padding area konten `lg` | `spacing.12` |
| Jarak antar-section | `spacing.8` |

---

# 4. Grid & Container

## 4.1 Kerangka aplikasi

| Elemen | Ukuran | Token |
|---|---|---|
| Sidebar terbuka | 240px | `size.sidebar.expanded` |
| Sidebar ciut (ikon-saja) | 64px | `size.sidebar.collapsed` |
| Topbar | tinggi 64px | `size.topbar` |
| Area konten | sisa lebar | — |
| Lebar baca maksimum teks panjang | 72ch | `container.prose` |

Sidebar terang dengan border kanan 1px `color.border.subtle` (**DSD-05**) — bukan bayangan.

## 4.2 Container konten

| Token | Max-width | Dipakai untuk |
|---|---:|---|
| `container.sm` | 640px | Formulir terfokus: login, ganti password, lupa password |
| `container.md` | 768px | Formulir satu kolom: wizard reservasi, lapor kerusakan |
| `container.lg` | 1024px | Halaman detail entitas |
| `container.xl` | 1280px | Halaman daftar & dashboard |
| `container.full` | 100% | Kalender ketersediaan (P-27) — butuh seluruh lebar |

## 4.3 Grid

| Token | Nilai | Catatan |
|---|---|---|
| `grid.columns` | 12 | Berlaku pada `md` ke atas |
| `grid.gutter` | `spacing.6` 24px | `lg` |
| `grid.gutter.md` | `spacing.4` 16px | `md` |
| `grid.gutter.sm` | `spacing.4` 16px | `xs` · `sm` — satu kolom |

**Kisi dashboard** mengikuti 19.1: `lg` 3–4 kolom · `md` 2 kolom · `xs`/`sm` 1 kolom. Struktur zona ditetapkan [`UX §8.2`](../UX/PAGE-SPECIFICATION.md#82-kerangka-bersama-seluruh-dashboard) dan tidak diubah oleh lebar layar.

---

# 5. Breakpoints

Empat titik henti, identik dengan [`UX §10.1`](../UX/PAGE-SPECIFICATION.md#101-titik-henti). Design System tidak mendefinisikan ulang, hanya menyebut nilai token.

| Token | Rentang | Perangkat | Kolom kisi |
|---|---|---|---:|
| `breakpoint.xs` | 320–599px | Ponsel potret | 1 |
| `breakpoint.sm` | 600–767px | Ponsel lanskap, ponsel besar | 1 |
| `breakpoint.md` | 768–1365px | Tablet, laptop kecil | 2 |
| `breakpoint.lg` | 1366px ke atas | Desktop | 3–4 |

Ambang **768px** bersifat khusus: batas peralihan kalender dari matriks ke daftar per hari (`CAL-UI-07`).

Perilaku per komponen: [`RESPONSIVE-ACCESSIBILITY.md`](RESPONSIVE-ACCESSIBILITY.md).

---

# 6. Border & Radius

## 6.1 Radius

Karakter **geometris tegas** (**DSD-06**) mengikuti sudut pita logo. Tiga tingkat sesuai batas 31.2, ditambah `full`.

| Token | Nilai | Dipakai untuk | Dilarang |
|---|---:|---|---|
| `radius.sm` | 4px | Input · select · textarea · checkbox · badge · chip · tooltip | Modal |
| `radius.md` | 6px | Tombol · kartu · drawer · dropdown · alert · toast | Avatar |
| `radius.lg` | 8px | Modal · popover · panel besar · kontainer ilustrasi | Elemen kecil — terlihat tidak proporsional |
| `radius.full` | 9999px | Avatar · penghitung badge lonceng · pill status linimasa | Tombol persegi panjang |

Tabel dan kepala tabel memakai radius 0 — sudut tegas menegaskan struktur data (`DS-P-06`).

## 6.2 Border width

| Token | Nilai | Dipakai untuk |
|---|---:|---|
| `border.width.thin` | 1px | Seluruh border standar: kartu, tabel, input, divider |
| `border.width.thick` | 2px | Ring fokus · border input bergalat · garis bawah tab terpilih |
| `border.width.marker` | 3px | **Penanda accent**: batang grup sidebar, garis di bawah judul halaman, garis kiri item nav aktif |

`border.width.marker` adalah satu-satunya tempat accent boleh muncul sebagai garis (**DSD-07**).

---

# 7. Elevation

Tiga tingkat sesuai batas 31.2. `DS-P-05` menetapkan border lebih dipercaya daripada bayangan.

| Token | Nilai | Dipakai untuk | Catatan |
|---|---|---|---|
| `elevation.0` | `none` + `1px solid color.border.subtle` | **Bawaan** untuk kartu, tabel, panel, sidebar, topbar | Pilihan pertama untuk memisahkan permukaan |
| `elevation.1` | `0 1px 2px rgba(17, 24, 39, 0.06)` | Dropdown · popover · tooltip · toast | Selalu **disertai** border 1px agar tetap terlihat di bawah cahaya matahari |
| `elevation.2` | `0 4px 8px rgba(17, 24, 39, 0.08)` | Drawer aksi · modal · bottom sheet | Lapisan yang benar-benar mengambang di atas konten |

**Dilarang:** bayangan berwarna · lebih dari dua tingkat bayangan terlihat sekaligus · bayangan sebagai satu-satunya pemisah permukaan · bayangan pada elemen statis di dalam halaman.

Overlay modal: `rgba(17, 24, 39, 0.48)`.

---

# 8. Iconography

| Aspek | Ketentuan |
|---|---|
| Set | **Satu set tunggal** bergaya *outline*, stroke seragam 1,5px — sejalan dengan pita berketebalan seragam pada logo (31.2) |
| Ukuran | `size.icon.sm` 16px dalam teks & chip · `size.icon.md` 20px **bawaan** untuk tombol, tabel, nav · `size.icon.lg` 24px untuk kepala kartu & keadaan kosong |
| Warna | Token `color.icon.*` saja — **accent tidak pernah menjadi warna ikon** |
| Label | Ikon fungsional **selalu** berpasangan label teks (31.2, `NFR-AC-04`); ikon tanpa label wajib memiliki `aria-label` bermakna |
| Ikon dekoratif | `aria-hidden="true"` |
| Target sentuh | Ikon yang dapat ditekan memiliki area sentuh minimal 44x44 dp meski ikonnya 20px (`NFR-AC-07`) |

**Ikon status wajib** — pasangan tetap agar `NFR-AC-06` terpenuhi tanpa bergantung warna:

| Makna | Ikon | Token warna |
|---|---|---|
| Sukses · Baik · Tersedia | centang dalam lingkaran | `color.icon.success` |
| Peringatan · Rusak Ringan | segitiga tanda seru | `color.icon.warning` |
| Galat · Rusak Berat · Hilang · Terlambat | silang dalam lingkaran | `color.icon.error` |
| Informasi · Dipinjam · Dalam Perbaikan | lingkaran huruf i | `color.icon.info` |
| Menunggu · Draf | lingkaran garis putus | `color.icon.muted` |

---

# 9. Motion

Animasi bersifat fungsional: menjelaskan asal dan tujuan sebuah lapisan. Tidak ada animasi dekoratif.

| Token | Nilai | Dipakai untuk |
|---|---:|---|
| `motion.duration.fast` | 120ms | Hover · fokus · perubahan warna |
| `motion.duration.base` | 200ms | Dropdown · tooltip · toast masuk |
| `motion.duration.slow` | 280ms | Drawer · modal · bottom sheet |

| Token | Nilai | Dipakai untuk |
|---|---|---|
| `motion.easing.standard` | `cubic-bezier(0.2, 0, 0.2, 1)` | Perubahan di dalam layar |
| `motion.easing.enter` | `cubic-bezier(0, 0, 0.2, 1)` | Elemen masuk |
| `motion.easing.exit` | `cubic-bezier(0.4, 0, 1, 1)` | Elemen keluar |

**Aturan:**

- Animasi **tidak pernah** menunda ketersediaan aksi. *Skeleton* muncul seketika, tanpa transisi masuk.
- Tidak ada animasi pada baris tabel — daftar 4.820 baris harus terasa seketika (`NFR-P-05`).
- Progres opname dan penghitung notifikasi bertransisi nilai, bukan berkedip.
- `prefers-reduced-motion: reduce` membuat seluruh durasi menjadi 0ms dan mengganti transform dengan *fade* sederhana — [`RESPONSIVE-ACCESSIBILITY.md §11`](RESPONSIVE-ACCESSIBILITY.md#11-reduced-motion).

---

# 10. Sizing

| Token | Nilai | Dipakai untuk |
|---|---:|---|
| `size.control.sm` | 36px | Kontrol toolbar padat — **hanya desktop, hanya bila bukan target sentuh utama** |
| `size.control.md` | 44px | **Bawaan**: tombol, input, select — batas minimum `NFR-AC-07` |
| `size.control.lg` | 52px | Tombol utama pada wizard dan mobile |
| `size.row.desktop` | 44px | Tinggi baris tabel desktop (**DSD-08**) |
| `size.row.mobile` | 48px | Tinggi area ketuk kartu baris pada mobile |
| `size.header.table` | 48px | Tinggi kepala tabel |
| `size.touch.min` | 44px | Target sentuh minimum di **seluruh** titik henti |
| `size.sidebar.expanded` | 240px | Sidebar terbuka |
| `size.sidebar.collapsed` | 64px | Sidebar ciut |
| `size.topbar` | 64px | Tinggi topbar |
| `size.bottombar` | 56px | Tinggi bottom tab bar mobile |
| `size.drawer` | 480px | Lebar drawer aksi pada `md`/`lg` |
| `size.modal.sm` | 480px | Modal konfirmasi |
| `size.modal.md` | 640px | Modal berformulir |
| `size.icon.sm` · `md` · `lg` | 16 · 20 · 24px | Ikon |

> `size.control.sm` 36px adalah satu-satunya nilai di bawah 44px. Ia **hanya** boleh dipakai pada kontrol sekunder di toolbar desktop yang memiliki padanan berukuran penuh di tempat lain. Tidak pernah pada mobile, tidak pernah untuk aksi utama.
