# Design System — SIGM4

**SIGM4 — Sistem Informasi Management 4set** · Sarana dan Prasarana Sekolah · SMKN 4 Bandung

> **Design System SIGM4** — **Overview** · [Foundations](FOUNDATIONS.md) · [Components](COMPONENTS.md) · [Patterns](PATTERNS.md) · [Responsive & Accessibility](RESPONSIVE-ACCESSIBILITY.md)

| Item | Keterangan |
|---|---|
| **Berkas** | `docs/DESIGN/DESIGN-SYSTEM.md` — entry point Design System |
| **Versi** | 1.0 |
| **Tanggal** | 22 Agustus 2026 |
| **Status** | Draft untuk review — siap dipakai designer & frontend |
| **Sumber identitas** | `logosidebar.svg` · `iconwebsite.svg` |
| **Basis perilaku** | [`docs/UX/`](../UX/) · [`docs/PRD/`](../PRD/) · [`docs/SDD/`](../SDD/) |
| **Ditujukan untuk** | UI/UX Designer, Frontend Developer, Mobile Developer, QA |

---

## Batas dokumen ini

| Lapisan | Menjawab | Otoritas |
|---|---|---|
| [`PRD/`](../PRD/) | **Apa** yang dibangun | **Source of Truth** |
| [`SDD/`](../SDD/) | **Bagaimana** dirancang secara teknis | Turunan PRD |
| [`UX/`](../UX/) | **Bagaimana** disajikan: halaman, alur, keadaan | Turunan PRD & SDD |
| **`DESIGN/`** (berkas ini) | **Seperti apa** tampilannya: warna, tipografi, komponen, styling | Turunan PRD, SDD, dan UX |

**Pembagian kerja dengan `docs/UX/`:**

> `docs/UX/` menetapkan **perilaku dan struktur** — halaman apa yang ada, apa yang terjadi ketika ditekan, keadaan apa yang wajib ditangani.
> Design System menetapkan **bahasa visual dan styling** — seperti apa halaman itu terlihat.

Bila keduanya bertentangan, **`docs/UX/` yang berlaku** untuk perilaku, dan Design System wajib menyesuaikan tampilannya. Bila Design System bertentangan dengan PRD, **PRD yang berlaku**.

**Aturan yang berlaku bagi seluruh berkas dalam `docs/DESIGN/`:**

1. **Tidak ada requirement baru.** Setiap ketentuan visual melayani requirement PRD/SDD/UX yang sudah ada, dirujuk lewat ID.
2. **Setiap keputusan visual harus dapat diterjemahkan** menjadi design token, spesifikasi komponen, UI state, atau aturan layout. Tidak ada guideline yang berhenti sebagai teori.
3. **Nilai warna berasal dari pengukuran logo**, bukan dari color picker manual. Metode dan hasilnya pada [§2](#2-visual-identity).
4. Keputusan yang tidak dapat diturunkan dari PRD/SDD/UX ditandai **DSD-xx** dan dicatat pada [§8](#8-design-decision-log).

---

## Peta dokumen

| Berkas | Isi |
|---|---|
| **`DESIGN-SYSTEM.md`** *(berkas ini)* | Design philosophy, visual identity, hubungan logo, hierarchy warna, design principles, ikhtisar token, cara memakai |
| [`FOUNDATIONS.md`](FOUNDATIONS.md) | Color token lengkap, tipografi, spacing, grid, breakpoint, radius, border, elevation, ikonografi, motion |
| [`COMPONENTS.md`](COMPONENTS.md) | 21 komponen: purpose, anatomy, variant, size, state, color usage, typography, spacing, interaction, accessibility, do/don't |
| [`PATTERNS.md`](PATTERNS.md) | Page structure, navigation, dashboard, form, data display, filter, search, feedback, empty, error, confirmation, CTA hierarchy |
| [`RESPONSIVE-ACCESSIBILITY.md`](RESPONSIVE-ACCESSIBILITY.md) | Perilaku mobile/tablet/desktop, breakpoint, touch target, papan ketik, fokus, pembaca layar, kontras, buta warna, reduced motion, checklist |

---

# 1. Design Philosophy

SIGM4 dipakai delapan jam sehari oleh Petugas Sarana Prasarana yang mengelola 5.000 unit aset, dan dipakai lima menit sebulan oleh Siswa OSIS yang meminjam sound system. Design System harus melayani keduanya tanpa berkompromi pada salah satunya.

| Kode | Prinsip | Alasan & konsekuensi |
|---|---|---|
| **DS-P-01** | **Struktur dulu, warna belakangan.** Hierarki dibangun dari ukuran, bobot, jarak, dan garis — bukan dari warna. Warna hanya menegaskan hierarki yang sudah terbaca tanpanya. | Logo SIGM4 memakai enam warna berbobot sama. Bila enam warna itu dibawa mentah ke antarmuka, tidak ada satu pun yang menonjol dan pengguna kehilangan arah. |
| **DS-P-02** | **Satu warna untuk "dapat ditekan".** Teal `#1F7A8C` adalah satu-satunya warna interaksi. Bila sebuah elemen berwarna teal, ia dapat ditekan; bila dapat ditekan, ia teal. | Persona 3 (literasi digital dasar–menengah) dan Persona 6 tidak perlu belajar kosakata warna. Satu aturan, nol pengecualian. |
| **DS-P-03** | **Warna tidak pernah sendirian.** Setiap informasi berwarna disertai teks atau ikon. | `UX-03` dan `NFR-AC-06`; juga syarat kerja lapangan di bawah cahaya matahari (Persona 1, 4). |
| **DS-P-04** | **Padat tanpa sesak.** Densitas dioptimalkan untuk tabel panjang, tetapi tidak pernah di bawah ambang target sentuh. | `NFR-P-05` menuntut 5.000 aset dapat ditelusuri cepat; [`UX §10.3`](../UX/PAGE-SPECIFICATION.md#103-aturan-yang-berlaku-di-semua-titik-henti) menuntut 44 dp di seluruh titik henti. |
| **DS-P-05** | **Border lebih dipercaya daripada bayangan.** Pemisahan permukaan memakai garis 1px; elevation dipakai hanya untuk lapisan yang benar-benar mengambang. | Bayangan tipis hilang pada layar ponsel murah di bawah matahari — kondisi kerja nyata Teknisi dan petugas opname. |
| **DS-P-06** | **Geometris, mengikuti logo.** Radius kecil, sudut tegas, bentuk rasional. | Logo dibangun dari pita berketebalan seragam bersudut 90° dan serong 45°. |
| **DS-P-07** | **Token, bukan nilai.** Tidak ada hex, px, atau ms yang ditulis langsung di komponen. | Membuat `TBD-FE-B` (mode gelap, kini ditutup **UXD-12**) dan penyesuaian merek di masa depan menjadi penggantian nilai token, bukan penulisan ulang komponen. |

---

# 2. Visual Identity

## 2.1 Metode analisis logo

Warna tidak diambil dengan color picker. Kedua berkas logo berisi artwork raster ter-embed; seluruh piksel dianalisis secara kuantitatif.

| Langkah | Cara |
|---|---|
| 1 | Artwork ter-embed diekstraksi dari kedua SVG (9 lapisan pada `logosidebar.svg`, 2 pada `iconwebsite.svg`) |
| 2 | Lapisan warna dikomposit dengan lapisan mask-nya untuk memperoleh bentuk terlihat |
| 3 | Piksel latar dan piksel nyaris putih dibuang; sisanya dikelompokkan per famili hue |
| 4 | Tiap famili diambil **nilai modusnya** (piksel paling sering muncul), bukan rata-rata — agar hasilnya adalah warna cat yang sebenarnya, bukan campuran tepi anti-alias |
| 5 | Setiap kandidat diuji kontras WCAG terhadap `#FFFFFF` dan `#111827` sebelum diterima sebagai token |

## 2.2 Hasil pengukuran

| Famili | `logosidebar.svg` | Bobot | `iconwebsite.svg` | Bobot | **Token final** |
|---|---|---:|---|---:|---|
| Biru | `#015DB0` | 26,8% | `#00529C` | 24,1% | **`#00529C`** |
| Merah | `#B90C06` | 19,5% | `#D4160D` | 15,2% | **`#D4160D`** |
| Ungu | `#5E187B` | 15,1% | `#541F7F` | 11,2% | **`#541F7F`** |
| Kuning | `#FEB405` | 14,7% | `#FEB003` | 19,0% | **`#FEB003`** |
| Abu | `#797979` | 14,4% | `#7B7B7B` | 17,1% | **`#7B7B7B`** |
| Hijau | `#01984B` | 8,1% | `#028744` | 13,4% | **`#028744`** |

Nilai dari **`iconwebsite.svg`** dipakai sebagai sumber kebenaran (**DSD-01**). Alasannya dua: app icon adalah aset yang paling sering tampil pada ukuran kecil sehingga paling menentukan persepsi merek, dan set ini satu-satunya di mana **hijau lolos AA teks** (4,61:1) tanpa penyesuaian — menyisakan hanya dua warna yang butuh perlakuan khusus alih-alih tiga.

## 2.3 Karakter bentuk

Wordmark **SIGM4** dan icon dibangun dari kosakata bentuk yang sama.

| Sifat | Pengamatan | Diterjemahkan menjadi |
|---|---|---|
| **Pita berketebalan seragam** | Setiap huruf dan setiap batang icon punya lebar batang sama | Border 1px konsisten; tidak ada campuran garis tebal-tipis |
| **Sudut 90° dan serong 45°** | Tidak ada lengkung selain ujung pita yang sedikit tumpul | `radius.sm 4px` · `radius.md 6px` · `radius.lg 8px` — kecil dan tegas (**DSD-06**) |
| **Celah putih sebagai pemisah** | Pita tidak pernah bersentuhan; selalu ada kanal putih | Pemisahan komponen memakai jarak dan border, bukan bayangan (`DS-P-05`) |
| **Warna flat** | Nol gradien, nol bayangan, nol tekstur | Tidak ada gradien pada komponen; elevation maksimum dua tingkat terlihat |
| **Enam warna berbobot setara** | Tidak ada satu warna yang mendominasi logo | **Justru sebabnya** antarmuka tidak boleh meniru distribusi ini — lihat §3 |
| **Rasa teknis, bukan dekoratif** | Bentuk rasional seperti diagram teknik | Tipografi UI netral bergeometri jelas: **Inter** (**DSD-04**) |

## 2.4 Pemakaian logo

| Aset | Dipakai di | Ketentuan |
|---|---|---|
| `logosidebar.svg` | Kepala sidebar web ([UX §5.1](../UX/NAVIGATION.md#51-kerangka-layar-web)), halaman login, kop ekspor PDF | Tinggi minimum 24px; ruang bebas minimal setinggi huruf "S" di keempat sisi |
| `iconwebsite.svg` | Favicon, app icon mobile, splash, avatar sistem | Tidak pernah ditempatkan di atas latar berwarna accent |
| — | Halaman publik aset `/a/{uuid}` | Logo tampil; tanpa elemen yang menyiratkan sesi login (`FR-05.2 A3`) |

**Dilarang:** mengubah warna logo, memberi gradien, memiringkan, memberi bayangan, mengubah proporsi antar-pita, atau menempatkan logo penuh warna di atas latar `neutral.700` ke atas tanpa varian monokrom.

---

# 3. Color Hierarchy

## 3.1 Keputusan inti

> **Primary = `#4B5563` (abu).**
> **Secondary = `#1F7A8C` (teal).**
>
> **Biru, ungu, hijau, merah, dan kuning adalah _supporting accent colors_ — bukan primary, bukan secondary, dan tidak pernah menjadi warna interaksi.**

Logo memakai enam warna berbobot setara. Antarmuka **tidak boleh** meniru distribusi itu. Bobot warna di layar diatur ulang menjadi:

```
Neutral    ############################################################   ~78%
Primary    ##########                                                     ~12%
Secondary  ######                                                          ~7%
Accent     ##                                                              ~3%
Semantic   #                                                               ~1%
```

Angka di atas adalah **niat desain**, bukan aturan terukur. Maksudnya sederhana: pada layar mana pun, accent harus terasa sebagai aksen — bukan sebagai isi.

## 3.2 Empat peran warna

| Peran | Token | Nilai | Fungsi | Contoh nyata di SIGM4 |
|---|---|---|---|---|
| **Primary** | `color.primary` | `#4B5563` | Struktur UI, navigasi, heading, label penting, aksi netral, elemen yang butuh bobot visual tetapi bukan CTA | Teks menu sidebar, judul halaman, tombol "Batal", ikon navigasi, label kolom tabel |
| **Secondary** | `color.secondary` | `#1F7A8C` | CTA, tautan, active state, selected state, elemen interaktif, focus indicator, indikator progres | Tombol "Ajukan", item sidebar aktif, tautan nomor pengajuan, ring fokus, tab terpilih |
| **Accent** | `color.accent.*` | 5 nilai | Identitas grup domain, kategori, seri data visualisasi, badge kategori | Penanda 3px grup sidebar, seri grafik M-16, badge kategori aset |
| **Neutral** | `color.neutral.*` | skala 50–900 | Background, surface, divider, border, seluruh teks | Latar halaman, permukaan kartu, garis tabel, teks isi |

**Semantic** (`success` · `warning` · `error` · `info`) berdiri **terpisah** dari keempatnya dan hanya dipakai berdasarkan makna — §3.5.

## 3.3 Primary — abu `#4B5563`

**Gunakan untuk:**

| Konteks | Token turunan |
|---|---|
| Teks menu sidebar & ikon navigasi | `color.text.primary` `#4B5563` |
| Judul halaman & heading | `color.text.heading` `#111827` |
| Label kolom tabel & label form | `color.text.primary` `#4B5563` |
| Tombol netral (Batal, Kembali, Tutup) | Border `#868E9B`, teks `#4B5563` |
| Ikon fungsional non-interaktif | `color.icon.default` `#4B5563` |
| Kepala tabel & kepala kartu | `color.text.primary` di atas `color.surface.subtle` |

**Dilarang:**

- Menjadikan `#4B5563` latar seluruh halaman atau seluruh sidebar (**DSD-05** menetapkan sidebar terang)
- Memakai primary untuk tombol CTA — CTA selalu teal
- Memakai primary sebagai warna tautan — tautan selalu teal
- Memakai primary untuk menyatakan status — status memakai token semantic

## 3.4 Secondary — teal `#1F7A8C`

**Teal harus menjadi warna yang paling mudah dikenali ketika pengguna melihat sesuatu yang dapat ditekan.**

| Konteks | Perlakuan | Kontras |
|---|---|---|
| Tombol primer | Fill `teal.600` `#1F7A8C`, teks putih | 4,98:1 ✓ |
| Hover tombol primer | Fill `teal.700` `#196574` | 6,66:1 ✓ |
| Active / pressed | Fill `teal.800` `#15525F` | 8,74:1 ✓ |
| Tautan pada teks | `teal.600` + garis bawah | 4,98:1 ✓ |
| Item navigasi aktif | Latar `teal.50` `#F2F7F8`, garis kiri 3px `teal.600`, teks `teal.800` | 8,10:1 ✓ |
| Ring fokus | Outline 2px `teal.600` + offset 2px | 4,98:1 ✓ (SC 1.4.11) |
| Checkbox / radio tercentang | Fill `teal.600` + tanda putih | 4,98:1 ✓ |
| Tab terpilih | Garis bawah 2px `teal.600`, teks `teal.800` | 8,74:1 ✓ |
| Progres & langkah wizard | Bar terisi `teal.600`, langkah aktif `teal.600` | — |
| Baris tabel terpilih | Latar `teal.50` | — |

**Dilarang:**

- Memakai teal untuk elemen yang **tidak** dapat ditekan (bar progres satu-satunya pengecualian tercatat)
- Memakai warna lain untuk CTA — tidak ada "tombol biru", "tombol hijau", atau "tombol merah kategori"
- Memakai teal sebagai warna status atau kategori

> **Satu pengecualian yang disengaja:** tombol aksi destruktif memakai `error.base` sebagai *fill*, bukan teal — lihat [Button](COMPONENTS.md#c-01-button). Ini bukan pelanggaran `DS-P-02`: warnanya menyatakan **konsekuensi**, dan tombolnya tetap terbaca sebagai tombol dari bentuk dan posisinya.

## 3.5 Accent — biru, ungu, hijau, merah, kuning

Kelima warna ini adalah identitas SMKN 4 Bandung yang dibawa dari logo. Ia **penting**, tetapi perannya sempit dan tertutup.

### Fungsi tiap accent (DSD-03)

[`docs/UX/`](../UX/NAVIGATION.md#53-sidebar) menetapkan tepat **lima grup domain kerja** pada sidebar (**UXD-01**). Kelima accent dipetakan satu-ke-satu ke grup tersebut.

| Accent | Hex | Grup domain | Kontras vs putih | Fungsi tambahan |
|---|---|---|---:|---|
| `accent.blue` | `#00529C` | **Aset & Bahan** | 7,82 | Seri data viz · badge kategori aset |
| `accent.green` | `#028744` | **Pemanfaatan** | 4,61 | Seri data viz · badge kategori |
| `accent.yellow` | `#FEB003` | **Perawatan** | 1,84 | Seri data viz · badge kategori |
| `accent.purple` | `#541F7F` | **Pengawasan** | 11,17 | Seri data viz · badge kategori |
| `accent.gray` | `#7B7B7B` | **Sistem** | 4,23 | Seri data viz (netral) |
| `accent.red` | `#D4160D` | *(tidak dipetakan ke grup)* | 5,36 | **Hanya** seri data viz & ilustrasi |

> **Mengapa merah tidak menjadi identitas grup.** Sistem memakai semantic terpisah (**DSD-02**), dan merah adalah hue yang paling kuat diasosiasikan dengan galat. Menjadikannya penanda grup navigasi akan membuat pengguna membaca satu grup menu sebagai peringatan permanen. Merah tetap hidup di logo dan di grafik, tidak di kerangka navigasi.

### Cara accent muncul di layar

Accent memiliki **satu nilai** dan **tidak memiliki varian teks** (**DSD-07**).

| Diizinkan | Bentuk konkret |
|---|---|
| Penanda garis 3px | Batang di kiri label grup sidebar; garis di bawah judul halaman |
| Isi batang/segmen grafik | Seri kategori pada laporan M-16 |
| Latar badge kategori | Fill penuh, teks di atasnya dari token neutral (lihat tabel di bawah) |
| Ilustrasi empty state | Bidang datar pada ilustrasi |

| Dilarang keras | Alasan |
|---|---|
| Warna **teks** | Kuning 1,84:1 dan abu 4,23:1 gagal AA; melarang seluruhnya menjaga aturan tetap satu baris |
| Warna **ikon** | Ikon adalah informasi; berlaku alasan yang sama |
| Warna **border tipis** | Border 1px accent gagal SC 1.4.11 pada kuning dan abu |
| Warna **tombol** | Interaksi milik teal (`DS-P-02`) |
| **Latar halaman atau section** penuh | Menghasilkan rainbow UI yang dilarang |
| **Kombinasi dua accent** pada satu komponen | Menghasilkan visual bising tanpa menambah makna |
| **Gradien** antar-accent | Bertentangan dengan warna flat logo |

### Pasangan teks di atas badge accent

Karena accent tidak punya varian, teks di atasnya diambil dari token neutral yang lolos kontras.

| Badge | Fill | Teks | Kontras | Status |
|---|---|---|---:|---|
| Biru | `#00529C` | `#FFFFFF` | 7,82 | ✓ AA |
| Ungu | `#541F7F` | `#FFFFFF` | 11,17 | ✓ AA |
| Merah | `#D4160D` | `#FFFFFF` | 5,36 | ✓ AA |
| Hijau | `#028744` | `#FFFFFF` | 4,61 | ✓ AA |
| Kuning | `#FEB003` | `#111827` | 9,65 | ✓ AA |
| **Abu** | — | — | 4,23 / 4,19 | ✗ **gagal keduanya** |

> **`accent.gray` tidak boleh menjadi badge.** Dengan teks putih 4,23:1 dan teks gelap 4,19:1, keduanya di bawah ambang AA. Untuk badge netral gunakan `neutral.100` `#F3F4F6` + teks `neutral.700` `#374151` (9,37:1 ✓). `accent.gray` tetap sah sebagai penanda 3px grup **Sistem** dan sebagai seri grafik netral, karena keduanya dekoratif dan informasinya sudah dibawa teks di sebelahnya (`NFR-AC-06`).

## 3.6 Semantic — terpisah dari accent

**Brand color menyatakan siapa. Semantic color menyatakan apa yang terjadi.** Keduanya tidak boleh saling menggantikan (**DSD-02**).

| Semantic | Base | Makna | Dipakai di SIGM4 |
|---|---|---|---|
| `success` | `#067647` | Berhasil, selesai, valid, tepat waktu | Aset `Tersedia` · WO `Selesai` · denda `Lunas` · pengembalian tepat waktu · toast simpan berhasil |
| `warning` | `#B54708` | Perhatian, perlu tindakan, mendekati batas | Jatuh tempo ≤3 hari · SLA hampir terlampaui · kondisi `Rusak Ringan` · garansi berakhir ≤30 hari |
| `error` | `#B42318` | Kesalahan, gagal, aksi destruktif, terlambat | Galat validasi · peminjaman `Terlambat` · kondisi `Rusak Berat`/`Hilang` · tombol destruktif · urgensi `Kritis` |
| `info` | `#175CD3` | Informasi kontekstual, netral | Callout penjelasan · banner sesi akan berakhir · catatan pada linimasa approval |

### Mengapa terpisah, bukan memakai accent logo

| Bila memakai accent | Masalah yang timbul |
|---|---|
| `accent.red` sebagai error | Merah kehilangan kemampuannya menjadi identitas apa pun; setiap badge merah terbaca sebagai galat |
| `accent.yellow` sebagai warning | `#FEB003` hanya 1,84:1 — mustahil menjadi teks peringatan tanpa varian gelap, sementara **DSD-07** melarang varian |
| `accent.green` sebagai success | Grup **Pemanfaatan** akan terbaca sebagai "sesuatu yang berhasil" |
| `accent.blue` sebagai info | Grup **Aset & Bahan** akan terbaca sebagai informasi |

Semantic memakai hue yang **berdekatan tetapi tidak identik** dengan accent, dan setiap nilainya disetel agar lolos AA sebagai teks di atas putih (5,43–6,57:1). Perbedaannya cukup untuk tidak bertabrakan secara makna, dan cukup dekat untuk tetap terasa satu keluarga.

### Kasus khusus: kondisi & status aset

`data-model.md` Bab 11.3 mendefinisikan enum kondisi dan status aset. Pemetaannya ke semantic — **bukan** ke accent:

| Enum | Semantic | Alasan |
|---|---|---|
| Kondisi `Baik` · Status `Tersedia` | `success` | Keadaan sehat |
| Kondisi `Rusak Ringan` · Status `Direservasi` | `warning` | Perlu perhatian / sedang tertahan |
| Kondisi `Rusak Berat` · `Hilang` · Status `Tidak Tersedia` | `error` | Keadaan gagal |
| Status `Dipinjam` · `Dalam Perbaikan` | `info` | Netral, sedang berjalan |

Seluruhnya wajib disertai teks label dan ikon (`UX-03`, `NFR-AC-06`) — warna tidak pernah menjadi satu-satunya pembeda.

## 3.7 Neutral

| Kelompok | Fungsi |
|---|---|
| `neutral.50`–`neutral.200` | Background halaman, permukaan kartu, latar kepala tabel, divider |
| `neutral.300`–`neutral.400` | Border dekoratif, keadaan disabled |
| `neutral.500`–`neutral.600` | Teks sekunder, border form control, ikon |
| `neutral.700`–`neutral.900` | Teks isi, heading, badge netral |

Nilai lengkap dan aturan pemakaian tiap token: [`FOUNDATIONS.md §1`](FOUNDATIONS.md#1-color-tokens).

---

# 4. Design Principles

Tujuh prinsip `DS-P-01`…`DS-P-07` pada §1 adalah prinsip visual. Di bawahnya berlaku enam prinsip UX yang **sudah ditetapkan PRD** dan tidak diulang di sini: `UX-01`…`UX-06` pada [`ui-foundation.md §31.1`](../PRD/04-frontend/ui-foundation.md), dijabarkan di [`docs/UX/ §1`](../UX/UX-SPEC.md#1-ux-principles).

Hubungan keduanya:

| Prinsip UX (PRD) | Diwujudkan Design System sebagai |
|---|---|
| `UX-01` Mobile-first lapangan, desktop-first administratif | Dua densitas (**DSD-08**): tabel desktop 44px, ketuk mobile 48px — [`RESPONSIVE-ACCESSIBILITY.md`](RESPONSIVE-ACCESSIBILITY.md) |
| `UX-02` Scan QR jalan pintas utama | Tombol Scan mendapat perlakuan visual tombol primer di bottom bar mobile — [`COMPONENTS.md`](COMPONENTS.md#c-05-navigation-mobile) |
| `UX-03` Status selalu teks + ikon | Satu komponen `Badge` untuk seluruh enum Bab 11.3, selalu tiga lapis: warna + ikon + teks |
| `UX-04` Aksi destruktif berkonfirmasi & beralasan | Varian `danger` pada Button dan Modal, dengan field alasan wajib |
| `UX-05` Tidak ada jalan buntu | Setiap keadaan kosong dan galat memiliki slot aksi yang wajib diisi — [`PATTERNS.md`](PATTERNS.md#8-empty--error-state) |
| `UX-06` Bahasa Indonesia baku | Tipografi dipilih untuk keterbacaan Latin penuh; tidak ada label ikon berbahasa Inggris |

---

# 5. Token Overview

Penamaan token memakai pola `kategori.peran.varian` — konsisten dan langsung dapat dipetakan ke CSS custom property maupun konstanta TypeScript.

```
color.primary                  color.text.heading            spacing.1 … spacing.16
color.secondary                color.text.primary            radius.sm | md | lg | full
color.accent.blue              color.text.secondary          elevation.0 | 1 | 2
color.accent.purple            color.text.tertiary           font.family.sans
color.accent.green             color.text.inverse            font.size.xs … 3xl
color.accent.red               color.text.link               font.weight.regular … bold
color.accent.yellow            color.text.disabled           line.height.tight … relaxed
color.accent.gray
                               color.icon.default            breakpoint.xs | sm | md | lg
color.neutral.50 … 900         color.icon.muted              container.sm … xl
                               color.icon.inverse            grid.columns | gutter
color.background.page          color.icon.disabled
color.background.subtle                                      motion.duration.fast … slow
color.surface.default          color.success.subtle          motion.easing.standard | enter | exit
color.surface.subtle           color.success.base
color.surface.raised           color.success.strong          size.control.sm | md | lg
                               (idem untuk warning/error/info) size.row.desktop | mobile
color.border.subtle                                          size.icon.sm | md | lg
color.border.strong
color.border.focus
```

**Aturan penamaan:**

| Aturan | Contoh benar | Contoh salah |
|---|---|---|
| Token peran, bukan token warna | `color.text.link` | `color.teal` |
| Angka skala hanya pada palet mentah | `color.neutral.600` | `color.text.600` |
| Tidak ada nama komponen di token global | `color.surface.raised` | `color.card.background` |
| Bahasa Inggris pada nama token, Bahasa Indonesia pada label UI | `color.border.strong` | `color.garis.tebal` |

Nilai lengkap: [`FOUNDATIONS.md`](FOUNDATIONS.md).

---

# 6. Cara menggunakan Design System

## 6.1 Untuk UI/UX Designer

| Langkah | Berkas |
|---|---|
| 1. Ambil daftar layar yang harus dibuat | [`UX/PAGE-SPECIFICATION.md §6`](../UX/PAGE-SPECIFICATION.md#6-page-inventory) — 79 halaman + 21 layar |
| 2. Ambil struktur & keadaan tiap layar | [`UX/PAGE-SPECIFICATION.md §7`](../UX/PAGE-SPECIFICATION.md#7-page-specification) |
| 3. Ambil pola layout yang berlaku | [`PATTERNS.md`](PATTERNS.md) |
| 4. Rakit dari komponen yang ada | [`COMPONENTS.md`](COMPONENTS.md) |
| 5. Terapkan token, bukan nilai mentah | [`FOUNDATIONS.md`](FOUNDATIONS.md) |
| 6. Periksa dengan daftar periksa aksesibilitas | [`RESPONSIVE-ACCESSIBILITY.md §12`](RESPONSIVE-ACCESSIBILITY.md#12-accessibility-checklist) |

**Bila sebuah layar membutuhkan komponen yang belum ada:** jangan membuat varian baru dari komponen lain. Ajukan komponen baru dan catat alasannya, agar pustaka tidak bercabang diam-diam.

## 6.2 Untuk Frontend Developer

`SDD-FE-12` menetapkan pustaka komponen **dibangun sendiri** di atas primitif headless + Tailwind + lapisan token milik sendiri, dan komponen **disalin ke dalam repositori**. `SDD-FE-13` menetapkan primitif mana: **Radix UI sebagai bawaan**, **React Aria hanya untuk pemilih tanggal/kalender dan number field**. Design System ini adalah spesifikasi lapisan token dan komponen tersebut.

| Lapisan | Tempat | Isi |
|---|---|---|
| Token | `apps/web/src/shared/ui/tokens/` | Nilai dari `FOUNDATIONS.md` sebagai CSS custom property + konstanta TypeScript |
| Primitif | Radix UI (bawaan) · React Aria (tanggal/kalender, number field) — `SDD-FE-13` | Perilaku papan ketik & ARIA (`NFR-AC-03`, `NFR-AC-05`) |
| Komponen | `apps/web/src/shared/ui/` | Spesifikasi dari `COMPONENTS.md` |
| Pola | `apps/web/src/shared/` + per modul | Spesifikasi dari `PATTERNS.md` |

**Empat aturan yang ditegakkan lint/CI:**

1. Tidak ada nilai hex, px, atau ms yang ditulis langsung di komponen — hanya token (`DS-P-07`).
2. Token warna divalidasi kontras saat *build*; kegagalan menggagalkan CI (`NFR-AC-01`, `NFR-AC-02`, `SDD-FE` §4.6).
3. `color.accent.*` tidak boleh muncul pada properti `color`, `border-color`, atau `fill` ikon (**DSD-07**).
4. Peta kode → label enum berasal dari `packages/schemas` (`SDD-FE-08`, `SDD-REPO-05`); komponen tidak pernah merender kode teknis mentah.

## 6.3 Untuk QA

| Yang diperiksa | Sumber |
|---|---|
| Keadaan tiap layar lengkap | [`UX/PAGE-SPECIFICATION.md §7.3`](../UX/PAGE-SPECIFICATION.md#73-pola-lima-keadaan-global) |
| Kontras & target sentuh | [`RESPONSIVE-ACCESSIBILITY.md`](RESPONSIVE-ACCESSIBILITY.md) |
| Warna tidak menjadi satu-satunya indikator | `NFR-AC-06` · [`COMPONENTS.md` Badge](COMPONENTS.md#c-13-badge) |
| Papan ketik pada alur kritis | Bab 30.2 · [`RESPONSIVE-ACCESSIBILITY.md §6`](RESPONSIVE-ACCESSIBILITY.md#6-keyboard-navigation) |

---

# 7. Ringkasan visual

Satu layar sebagai bukti bahwa hierarki bekerja: **Inventaris Aset (P-15)** pada desktop.

```
+--------------------------------------------------------------------------+
| [logo SIGM4 warna]   Cari aset / kode aset          WIB 14:32  (3)  Yoga |  <- topbar putih, teks #4B5563
+------------------+-------------------------------------------------------+
| BERANDA          |  Beranda / Inventaris Aset                            |  <- breadcrumb #6B7280
|   Dashboard      |                                                       |
|   Notifikasi (3) |  Inventaris Aset               [Impor]  [Tambah Aset] |  <- h1 #111827
|                  |  ====================================================== |  <- garis 3px accent.blue
| |ASET & BAHAN    |                                                       |
| | # Inventaris   |  [ Cari ] [Kategori v] [Lokasi v] [Kondisi v]         |
| |   Kategori     |  Kategori: Komputer x    Kondisi: Baik x   Hapus semua|
| |   Lokasi       |  ------------------------------------------------------ |
| |   Label QR     |  [ ] Kode Aset ^   Nama          Kondisi   Status     |  <- header 48px, #F9FAFB
| |   Dokumen Aset |  ------------------------------------------------------ |
| |   Scan QR      |  [x] LAB-KOM-0001    Komputer      * Baik    Tersedia  |  <- baris 44px
|                  |  ------------------------------------------------------ |
| |PEMANFAATAN     |  [ ] LAB-KOM-0002    Komputer      ! Rusak   Dipinjam  |
| |   Kalender     |  ------------------------------------------------------ |
| |   Katalog      |  1 dipilih:  [Cetak QR]  [Mutasi Lokasi]  [Ekspor]     |
| |   Reservasi    |  Menampilkan 1-25 dari 4.820      [< 1 2 3 ... >] [25v]|
+------------------+-------------------------------------------------------+
                                                          [ Tanya SIGM4 ]     <- FAB teal
```

**Yang perlu diperhatikan dari sketsa di atas:**

| Pengamatan | Prinsip yang bekerja |
|---|---|
| Hanya **tiga** elemen berwarna teal: tombol "Tambah Aset", item sidebar aktif, dan FAB chatbot | `DS-P-02` — teal berarti dapat ditekan |
| Accent biru muncul **dua kali** dan keduanya setipis 3px: batang grup sidebar dan garis di bawah judul | **DSD-03** — accent adalah penanda, bukan isi |
| Kondisi aset memakai **ikon + teks**, warnanya semantic, bukan accent | `UX-03` · **DSD-02** |
| Seluruh sisanya netral: putih, `#F9FAFB`, `#E5E7EB`, `#4B5563`, `#111827` | `DS-P-01` |
| Pemisah antar-area memakai **garis**, bukan bayangan | `DS-P-05` |

---

# 8. Design Decision Log

Keputusan yang tidak dapat diturunkan dari PRD/SDD/UX, dan karena itu ditanyakan kepada pemilik produk pada 22 Agustus 2026.

| ID | Keputusan | Konsekuensi |
|---|---|---|
| **DSD-01** | Nilai accent bersumber dari **`iconwebsite.svg`** | Hijau `#028744` lolos AA tanpa penyesuaian; hanya kuning dan abu yang butuh perlakuan khusus. Token dapat diverifikasi ulang langsung dari berkas sumber |
| **DSD-02** | **Semantic terpisah penuh** dari accent | Sistem memiliki dua merah dan dua hijau, dibedakan oleh nama token dan aturan pemakaian di §3.5–§3.6. Accent dilarang menyatakan status; semantic dilarang menyatakan identitas |
| **DSD-03** | Accent = **identitas 5 grup domain sidebar + data visualisasi** | Pemetaan 1:1 dengan **UXD-01**. Merah tidak memetakan grup mana pun karena bertabrakan dengan makna galat |
| **DSD-04** | Tipografi **Inter** | Angka tabular dan x-height tinggi untuk tabel padat; variable font sehingga satu berkas melayani seluruh bobot |
| **DSD-05** | **Sidebar terang** | Primary tidak pernah menjadi background penuh; teal menjadi satu-satunya penanda aktif. Logo penuh warna dapat dipakai apa adanya tanpa varian monokrom |
| **DSD-06** | Radius & elevation **geometris tegas** | `4/6/8px` dan elevation 0–2; pemisahan mengandalkan border 1px (`DS-P-05`) |
| **DSD-07** | Accent **satu nilai, tanpa varian teks** | Accent hanya boleh menjadi fill, latar badge, dan penanda 3px. Konsekuensi turunan: `accent.gray` tidak dapat menjadi badge (§3.5) |
| **DSD-08** | Densitas **44px desktop / 48px mobile** | Tepat pada batas `NFR-AC-07`; sekitar 13 baris tabel per layar 1366×768 |

**Tidak ada keputusan yang tertunda pada Design System.** Titik terbuka yang berdampak visual seluruhnya berada di [`UX/DECISIONS.md §12.3`](../UX/DECISIONS.md#123-keputusan-yang-masih-terbuka) dan menunggu pemilik produk — Design System tidak mendahuluinya.

---

## Berkas terkait

| Berkas | Hubungan |
|---|---|
| [`PRD/04-frontend/ui-foundation.md`](../PRD/04-frontend/ui-foundation.md) | Prinsip `UX-01`…`UX-06`, ketentuan token `DS-01`/`DS-02`, komponen inti, lima keadaan — **berlaku di atas Design System** |
| [`PRD/03-architecture/nfr.md`](../PRD/03-architecture/nfr.md) | `NFR-AC-01`…`NFR-AC-09` aksesibilitas · `NFR-C-01`…`NFR-C-04` kompatibilitas |
| [`docs/UX/`](../UX/) | Perilaku, halaman, alur, keadaan — Design System menyediakan tampilannya |
| [`SDD/11-frontend-architecture.md`](../SDD/11-frontend-architecture.md) | `SDD-FE-12` pustaka komponen sendiri · `SDD-FE-13` pembagian primitif headless · `SDD-FE-08` peta enum · validasi kontras CI |
| [`SDD/12-mobile-architecture.md`](../SDD/12-mobile-architecture.md) | Batas perangkat, gerbang startup, antrean unggah |
| `logosidebar.svg` · `iconwebsite.svg` | Sumber identitas visual — §2 |

## Deliverable yang dilayani

| Kode | Deliverable | Status setelah Design System |
|---|---|---|
| `DS-01` | Design token & panduan gaya | ✅ [`FOUNDATIONS.md`](FOUNDATIONS.md) |
| `DS-02` | Pustaka komponen inti | ✅ Spesifikasi di [`COMPONENTS.md`](COMPONENTS.md); implementasi kode pada M1 |
| `DS-03` | Wireframe seluruh layar utama | Masukan siap: [`UX §6`](../UX/PAGE-SPECIFICATION.md#6-page-inventory) + Design System ini |
| `DS-04` | Prototipe alur kritis | Masukan siap: [`UX §9`](../UX/USER-FLOWS.md#9-user-flows) |
| `DS-05` | Spesifikasi responsif empat titik henti | ✅ [`RESPONSIVE-ACCESSIBILITY.md`](RESPONSIVE-ACCESSIBILITY.md) |
| `DS-06` | Daftar periksa aksesibilitas per komponen | ✅ [`RESPONSIVE-ACCESSIBILITY.md §12`](RESPONSIVE-ACCESSIBILITY.md#12-accessibility-checklist) |
