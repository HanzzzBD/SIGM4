# Components — SIGM4 Design System

> **Design System SIGM4** — [Overview](DESIGN-SYSTEM.md) · [Foundations](FOUNDATIONS.md) · **Components** · [Patterns](PATTERNS.md) · [Responsive & Accessibility](RESPONSIVE-ACCESSIBILITY.md)

Spesifikasi 29 komponen. **Perilaku** berasal dari [`docs/UX/`](../UX/); berkas ini menetapkan **wujud visual** dan **state**-nya. Seluruh nilai merujuk token pada [`FOUNDATIONS.md`](FOUNDATIONS.md) — tidak ada hex atau px mentah.

## Daftar komponen

| Kode | Komponen | Kode | Komponen |
|---|---|---|---|
| [C-01](#c-01-button) | Button | [C-16](#c-16-tabs) | Tabs |
| [C-02](#c-02-link) | Link | [C-17](#c-17-dropdown) | Dropdown |
| [C-03](#c-03-sidebar) | Sidebar | [C-18](#c-18-tooltip) | Tooltip |
| [C-04](#c-04-topbar) | Topbar | [C-19](#c-19-pagination) | Pagination |
| [C-05](#c-05-navigation-mobile) | Navigation (mobile) | [C-20](#c-20-loading) | Loading |
| [C-06](#c-06-breadcrumb) | Breadcrumb | [C-21](#c-21-empty-state) | Empty State |
| [C-07](#c-07-card) | Card | [C-22](#c-22-panel-filter) | Panel Filter |
| [C-08](#c-08-input) | Input | [C-23](#c-23-kartu-kpi) | Kartu KPI |
| [C-09](#c-09-select) | Select | [C-24](#c-24-kalender-ketersediaan) | Kalender Ketersediaan |
| [C-10](#c-10-checkbox) | Checkbox | [C-25](#c-25-pemindai-qr) | Pemindai QR |
| [C-11](#c-11-radio) | Radio | [C-26](#c-26-pengunggah-foto) | Pengunggah Foto |
| [C-12](#c-12-toggle) | Toggle | [C-27](#c-27-linimasa-approval) | Linimasa Approval |
| [C-13](#c-13-badge) | Badge | [C-28](#c-28-drawer) | Drawer |
| [C-14](#c-14-alert) | Alert | [C-29](#c-29-pusat-notifikasi) | Pusat Notifikasi |
| [C-15](#c-15-table) | Table | | |

C-22…C-29 memenuhi daftar komponen inti wajib pada [`ui-foundation.md §31.3`](../PRD/04-frontend/ui-foundation.md).

## Aturan yang berlaku bagi seluruh komponen

| Aturan | Sumber |
|---|---|
| Warna interaksi **selalu** teal; tidak ada komponen dengan CTA berwarna lain | `DS-P-02` |
| Accent **tidak pernah** menjadi teks, ikon, border 1px, atau fill tombol | **DSD-07** |
| Status **selalu** warna + ikon + teks | `UX-03` · `NFR-AC-06` |
| Target sentuh minimal 44 dp di seluruh titik henti | `NFR-AC-07` · [`UX §10.3`](../UX/PAGE-SPECIFICATION.md#103-aturan-yang-berlaku-di-semua-titik-henti) |
| Ring fokus seragam: 2px `color.border.focus` + offset 2px | `NFR-AC-03` |
| Label & pesan Bahasa Indonesia baku | `NFR-AC-09` · `UX-06` |
| Perilaku papan ketik & ARIA berasal dari primitif headless | `SDD-FE-12` |
| Pemisahan permukaan memakai border 1px, bukan bayangan | `DS-P-05` |

**Enam state baku** yang berlaku bila komponen mendukungnya: `default` · `hover` · `focus` · `active` · `disabled` · `error`.

---

# C-01 Button

**Purpose.** Memicu aksi. Tombol adalah tempat `DS-P-02` paling terlihat: varian `primary` berwarna teal, dan tidak ada varian lain yang memakai warna cerah kecuali `danger`.

**Anatomy.** `[ikon opsional 20px] [label] [penghitung opsional]` — padding `spacing.2` vertikal, `spacing.4` horizontal, `radius.md`, gap ikon-teks `spacing.2`.

**Variant.**

| Varian | Fill | Teks | Border | Dipakai untuk | Contoh di SIGM4 |
|---|---|---|---|---|---|
| `primary` | `teal.600` | `text.inverse` | — | Aksi utama halaman, satu per layar | "Tambah Aset" · "Ajukan" · "Serahkan" |
| `secondary` | transparan | `text.primary` | 1px `border.strong` | Aksi netral pendamping | "Batal" · "Kembali" · "Ekspor" |
| `tertiary` | transparan | `text.link` | — | Aksi ringan dalam baris/kartu | "Lihat semua" · "Ubah" |
| `danger` | `error.base` | `text.inverse` | — | Aksi destruktif (`UX-04`) | "Hapuskan Aset" · "Batalkan Reservasi" · "Bebaskan Ganti Rugi" |
| `danger-ghost` | transparan | `error.base` | 1px `error.base` | Aksi destruktif sekunder | "Tolak" pada drawer verifikasi |

> Tidak ada varian `success`, `warning`, atau berwarna accent. Tombol "Setujui" pada P-38 adalah `primary` — keputusan positif adalah aksi utama, bukan pernyataan status.

**Size.**

| Size | Tinggi | Font | Dipakai untuk |
|---|---:|---|---|
| `sm` | `size.control.sm` 36px | `font.size.sm` | Toolbar desktop padat saja |
| `md` | `size.control.md` 44px | `font.size.base` | **Bawaan** |
| `lg` | `size.control.lg` 52px | `font.size.base` | Tombol utama wizard · tombol utama mobile |

**State.**

| State | primary | secondary | danger |
|---|---|---|---|
| `default` | fill `teal.600` (putih 4,98 ✓) | border `border.strong` | fill `error.base` (putih 6,57 ✓) |
| `hover` | fill `teal.700` (6,66 ✓) | latar `neutral.50` | fill `error.strong` (9,27 ✓) |
| `focus` | + ring 2px `border.focus` offset 2px | idem | idem |
| `active` | fill `teal.800` (8,74 ✓) | latar `neutral.100` | fill `error.strong` |
| `disabled` | fill `neutral.200`, teks `text.disabled`, kursor `not-allowed` | idem | idem |
| `loading` | spinner 16px menggantikan ikon, label tetap, tombol non-aktif | idem | idem |

**Interaction.** Tombol yang memicu operasi transaksional **dinonaktifkan selama permintaan berjalan** dan menampilkan state `loading` — mencegah pengiriman ganda (31.3) dan melengkapi `Idempotency-Key` (`ID-01`). Tombol destruktif **tidak pernah** langsung mengeksekusi: ia membuka [Modal](#c-28-drawer) atau [Drawer](#c-28-drawer) berisi field alasan wajib (`UX-04`).

**Accessibility.** Elemen `<button>`, bukan `<div>`. Label ikon-saja wajib `aria-label`. State `loading` mengumumkan lewat `aria-busy`. State `disabled` dikecualikan dari syarat kontras WCAG, tetapi wajib disertai penjelasan mengapa dinonaktifkan — bukan hanya diredupkan (`UX-05`).

**Do / Don't.**

| ✅ Do | ❌ Don't |
|---|---|
| Satu tombol `primary` per layar | Dua atau lebih `primary` bersaing dalam satu layar |
| Label berupa kata kerja: "Ajukan", "Serahkan", "Hapuskan" | Label generik "OK", "Submit", "Yes" |
| `danger` hanya untuk aksi yang tercantum di [`UX §7.2`](../UX/PAGE-SPECIFICATION.md#72-pola-aksi-destruktif) | Memberi warna berbeda per kategori tombol |
| Tombol terhalang keadaan tetap terlihat + dinonaktifkan + alasannya ditampilkan | Menyembunyikan tombol tanpa penjelasan |
| Ikon selalu berpasangan label | Tombol ikon-saja tanpa `aria-label` |

---

# C-02 Link

**Purpose.** Berpindah ke alamat lain. Bersama Button, ia satu-satunya elemen berwarna teal di dalam teks.

**Anatomy.** Teks + garis bawah. Tautan yang menuju objek memakai identitas yang dikenali pengguna — nomor dokumen atau kode barang, bukan ID basis data (`UXP-01`).

**Variant.**

| Varian | Perlakuan | Dipakai untuk |
|---|---|---|
| `inline` | `text.link` + garis bawah selalu terlihat | Tautan di dalam kalimat |
| `standalone` | `text.link`, garis bawah muncul saat hover/fokus | Tautan pada sel tabel, kartu, breadcrumb |
| `quiet` | `text.primary`, garis bawah saat hover | Baris tabel yang seluruhnya dapat diklik — warna teal disimpan untuk kolom identitas saja |

**State.** `default` `text.link` 4,98 ✓ · `hover` `text.link.hover` 6,66 ✓ + garis bawah · `focus` ring 2px offset 2px · `visited` **tidak dibedakan** (data berubah; status kunjungan menyesatkan).

**Accessibility.** Elemen `<a href>`. Teks tautan bermakna sendiri — "RSV-RG-2026-0001", bukan "klik di sini". Tautan yang membuka berkas menyebut jenis dan ukurannya. Garis bawah wajib pada varian `inline` karena warna tidak boleh menjadi satu-satunya pembeda (`NFR-AC-06`).

**Do / Don't.**

| ✅ Do | ❌ Don't |
|---|---|
| Nomor dokumen sebagai teks tautan | "Klik di sini untuk melihat detail" |
| Garis bawah pada tautan di dalam paragraf | Membedakan tautan hanya dengan warna |
| `quiet` untuk baris tabel yang dapat diklik seluruhnya | Membuat seluruh sel tabel berwarna teal |

---

# C-03 Sidebar

**Purpose.** Navigasi utama web. Struktur lima grup domain kerja ditetapkan **UXD-01**; visibilitas entri bersumber tunggal dari `GET /me` (`PM-04`, `UXP-02`).

**Anatomy.**

```
+--------------------------------+  surface.default, border kanan 1px border.subtle
| [logo SIGM4]                   |  tinggi 64px = size.topbar
+--------------------------------+
| BERANDA                        |  label grup: font.size.xs / 500 / text.secondary
|   [ikon] Dashboard             |            + letter.spacing.wide, HURUF BESAR
|   [ikon] Notifikasi       (3)  |  item: 44px, font.size.base / 500 / text.primary
|                                |
||  ASET & LOKASI                |  <- penanda 3px accent.blue di kiri label grup
|| [ikon] Inventaris Aset        |  <- item AKTIF
|   [ikon] Kategori Aset         |
+--------------------------------+
```

**Spesifikasi.**

| Bagian | Nilai |
|---|---|
| Lebar | `size.sidebar.expanded` 240px · ciut `size.sidebar.collapsed` 64px |
| Permukaan | `surface.default` `#FFFFFF` + border kanan 1px `border.subtle` (**DSD-05**) |
| Label grup | `font.size.xs` · 500 · `text.secondary` · `letter.spacing.wide` · huruf besar · padding `spacing.4` |
| Penanda grup | Batang `border.width.marker` 3px berwarna `color.accent.*` sesuai pemetaan grup |
| Item | Tinggi 44px · padding `spacing.3`/`spacing.4` · gap ikon-teks `spacing.3` · `radius.md` |
| Ikon item | `size.icon.md` 20px · `color.icon.default` — **tidak pernah** accent |
| Penghitung | Pill `radius.full`, `neutral.100` + `neutral.700`; **kecuali** notifikasi belum dibaca yang memakai `error.base` + putih |

**State item.**

| State | Perlakuan | Kontras |
|---|---|---|
| `default` | Teks `text.primary`, ikon `icon.default` | 7,56 ✓ |
| `hover` | Latar `neutral.50` | — |
| `focus` | Ring 2px `border.focus` offset −2px (di dalam, agar tidak terpotong) | 4,98 ✓ |
| `active` | Latar `surface.selected` `teal.50` · garis kiri 3px `teal.600` · teks `teal.800` bobot 600 · ikon `icon.interactive` | 8,10 ✓ |

**Interaction.** Grup yang seluruh entrinya tersembunyi **tidak dirender** beserta judulnya (**UXD-01**). Preferensi ciut/lebar disimpan sebagai preferensi tampilan (`SDD-FE-03`). Pada `<768px` sidebar menjadi overlay drawer.

**Accessibility.** `<nav aria-label="Navigasi utama">`; grup memakai `<ul>` bersarang dengan `<h2>` tersembunyi visual; item aktif `aria-current="page"`. Penanda accent 3px bersifat **dekoratif** — nama grup sudah dibawa teks, sehingga kontras rendah `accent.yellow` (1,84) dan `accent.gray` (4,23) tidak melanggar `NFR-AC-06`.

**Do / Don't.**

| ✅ Do | ❌ Don't |
|---|---|
| Sidebar terang, teal sebagai satu-satunya penanda aktif | Menjadikan `#4B5563` latar penuh sidebar |
| Accent hanya sebagai batang 3px | Mewarnai ikon atau teks item dengan accent |
| Menyembunyikan entri di luar permission | Menampilkannya dalam keadaan dinonaktifkan |

---

# C-04 Topbar

**Purpose.** Identitas, pencarian global, kesadaran waktu, notifikasi, dan menu akun. Isi ditetapkan [`UX §5.2`](../UX/NAVIGATION.md#52-topbar).

**Anatomy.** `[ciutkan] [logo + nama sekolah] ......... [pencarian] [WIB hh:mm] [lonceng] [menu pengguna]` — tinggi `size.topbar` 64px, `surface.default`, border bawah 1px `border.subtle`.

**Spesifikasi.**

| Elemen | Perlakuan |
|---|---|
| Pencarian global | Input `size.control.md` 44px, `radius.sm`, ikon kaca pembesar `icon.muted`, lebar maksimum 480px |
| Penanda WIB | `font.size.sm` · `text.secondary` — permanen, tidak mengikuti zona waktu perangkat (`CAL-UI-09`) |
| Lonceng | Ikon 20px + penghitung pill `radius.full` `error.base` + `text.inverse`, minimum 20×20px |
| Menu pengguna | Avatar `radius.full` 32px + nama + ikon chevron |

**Banner.** Empat banner muncul tepat di bawah topbar, penuh lebar, `radius.0`, tinggi minimum 44px:

| Banner | Warna | Pemicu |
|---|---|---|
| Koneksi putus | `warning.subtle` + `warning.strong` + ikon | Luring (31.5, `NO-07`) |
| Sesi akan berakhir | `info.subtle` + `info.strong` + tombol "Lanjutkan" | Menit ke-28 idle (`FR-01.2 A2`) |
| Koneksi realtime turun ke polling | `info.subtle` + `info.strong` | SSE gagal 3x (`NTF-01`) |
| Koneksi diputus karena batas 2 koneksi | `info.subtle` + `info.strong` | `NTF-03` |

**Accessibility.** `<header role="banner">`. Penghitung notifikasi diumumkan lewat *live region* sopan. Banner memakai `role="status"`, kecuali koneksi putus yang memakai `role="alert"`.

---

# C-05 Navigation (mobile)

**Purpose.** Bottom tab bar lima slot dengan Scan di tengah (**UXD-03**).

**Anatomy.**

```
+------------------------------------------+
|  Beranda   Tugas   (SCAN)   Notif  Profil|   size.bottombar 56px + safe area
|    [ ]      [ ]     ( O )    [ ]     [ ] |   surface.default, border atas 1px
+------------------------------------------+
```

**Spesifikasi.**

| Elemen | Perlakuan |
|---|---|
| Tinggi | `size.bottombar` 56px + *safe area inset* perangkat |
| Tab | Ikon 24px + label `font.size.xs`; **label wajib**, bukan ikon telanjang (`NFR-AC-04`) |
| Tab tidak aktif | `icon.default` + `text.secondary` |
| Tab aktif | `icon.interactive` + `text.link` bobot 600 + garis atas 2px `teal.600` |
| Tombol Scan | Lingkaran `radius.full` 56px, fill `teal.600`, ikon putih 24px, terangkat 8px di atas bar, label "Scan" di bawahnya |
| Target sentuh | Setiap tab minimal 44×44 dp (`NFR-AC-07`) |

Tombol Scan memakai perlakuan visual tombol primer karena `UX-02` menjadikan scan QR jalan pintas utama — ini penerapan `DS-P-02`, bukan pengecualian.

**Do / Don't.**

| ✅ Do | ❌ Don't |
|---|---|
| Label teks di bawah setiap ikon tab | Tab ikon-saja |
| Isi tab "Tugas" dirender dari permission | Menentukan isi tab dari nama role |
| Deep link mengaktifkan tab induknya | Membuka layar tanpa tab aktif |

---

# C-06 Breadcrumb

**Purpose.** Menyatakan posisi dalam hierarki, maksimum tiga segmen ([`UX §5.4`](../UX/NAVIGATION.md#54-breadcrumb)).

**Anatomy.** `Beranda / Inventaris Aset / LAB-KOM-0002` — pemisah `/` berwarna `text.tertiary`, `font.size.sm`.

**Spesifikasi.** Segmen dapat diklik memakai Link varian `standalone`. Segmen terakhir `text.secondary`, tidak dapat diklik, `aria-current="page"`. Identitas objek memakai nomor dokumen atau kode barang. Breadcrumb terisi penuh dari struktur route meski pengguna mendarat dari deep link.

**Accessibility.** `<nav aria-label="Breadcrumb">` berisi `<ol>`. Pemisah `/` dirender lewat CSS `::before` agar tidak terbaca pembaca layar. Tidak dipakai di mobile — penggantinya judul layar + tombol kembali.

---

# C-07 Card

**Purpose.** Mengelompokkan konten terkait. Dipakai untuk kartu dashboard, blok informasi pada halaman detail, dan baris tabel versi mobile.

**Anatomy.** `[header: judul + aksi] [body] [footer opsional]` — `surface.default`, `elevation.0` (border 1px `border.subtle`), `radius.md`, padding `spacing.6`.

**Variant.**

| Varian | Perlakuan | Dipakai untuk |
|---|---|---|
| `default` | Border 1px, tanpa bayangan | Kartu dashboard, blok detail |
| `interactive` | + hover latar `neutral.50`, kursor pointer, seluruh kartu dapat ditekan | Kartu baris pada mobile, kartu aset di katalog |
| `accent` | + garis atas 3px `color.accent.*` | Kartu identitas domain — maksimum satu per layar |
| `status` | + garis kiri 3px `color.*.base` semantic | Kartu peringatan pada Zona 1 dashboard |

**Spesifikasi.** Judul `font.size.lg` 600 `text.heading`. Footer `surface.subtle` dengan border atas 1px. Gap antar-kartu `spacing.6`.

**Do / Don't.**

| ✅ Do | ❌ Don't |
|---|---|
| Border 1px sebagai pemisah bawaan | Bayangan pada kartu statis |
| Varian `accent` maksimum satu per layar | Setiap kartu berwarna accent berbeda |
| Kartu peringatan memakai semantic | Kartu peringatan memakai `accent.red` |

---

# C-08 Input

**Purpose.** Memasukkan teks bebas, angka, tanggal, dan waktu.

**Anatomy.** `[label] [input] [teks bantuan | pesan galat]` — label **selalu di atas**, tidak pernah hanya placeholder (`NFR-AC-05`).

**Spesifikasi.**

| Bagian | Nilai |
|---|---|
| Tinggi | `size.control.md` 44px (`lg` 52px pada mobile & wizard) |
| Padding | `spacing.3` vertikal · `spacing.4` horizontal |
| Border | 1px `color.border.strong` `#868E9B` (3,30 ✓ SC 1.4.11) |
| Radius | `radius.sm` 4px |
| Font | `font.size.base` · `text.primary` |
| Label | `font.size.sm` · 500 · `text.primary` · margin bawah `spacing.2` |
| Placeholder | `text.tertiary` — hanya contoh format, tidak pernah pengganti label |
| Teks bantuan | `font.size.sm` · `text.secondary` |
| Field wajib | Ditandai kata **"wajib"** pada label, bukan tanda bintang berwarna (`NFR-AC-06`) |

**State.**

| State | Perlakuan |
|---|---|
| `default` | Border `border.strong` |
| `hover` | Border `neutral.500` |
| `focus` | Border `border.focus` 2px + ring offset 2px |
| `filled` | Sama dengan `default` |
| `error` | Border 2px `border.error` + ikon galat + pesan `error.base` di bawah field |
| `disabled` | Latar `neutral.100` · border `border.disabled` · teks `text.disabled` |
| `readonly` | Latar `surface.subtle` · border `border.subtle` · teks `text.primary` |

**Tipe khusus SIGM4.**

| Tipe | Ketentuan |
|---|---|
| Nominal rupiah | Prefiks "Rp" di dalam field · `tabular-nums` · rata kanan · dikirim sebagai string desimal (`SDD-API` §4.3) |
| Kode barang | `tabular-nums` · huruf besar otomatis · tersedia sebagai jalur cadangan di **setiap** alur pemindaian (`FR-05.2 A1`) |
| Tanggal & waktu | Selalu menyertakan penanda **WIB** (`CAL-UI-09`) |
| Alasan (aksi destruktif) | Textarea minimum 3 baris · wajib · tombol utama nonaktif sampai terisi (`UX-04`) |

**Accessibility.** `<label for>` eksplisit. Galat ditautkan `aria-describedby` dan diumumkan lewat *live region* (`SDD-FE` §4.6). `aria-invalid` saat `error`. Pesan galat menyebut **nama field** dan cara memperbaikinya.

**Do / Don't.**

| ✅ Do | ❌ Don't |
|---|---|
| Label eksplisit di atas field | Placeholder sebagai satu-satunya label |
| Kata "wajib" pada label | Tanda bintang merah tanpa teks |
| Validasi saat blur, galat di bawah field | Validasi hanya saat submit |
| Border `#868E9B` pada seluruh kontrol | Border `#E5E7EB` pada input |

---

# C-09 Select

**Purpose.** Memilih satu nilai dari daftar tertutup. Untuk daftar panjang berpencarian (lokasi, kategori, pengguna) memakai varian `combobox`.

**Variant.** `select` daftar pendek ≤10 opsi · `combobox` daftar panjang berpencarian · `multi` pilihan jamak dengan chip di dalam field.

**Spesifikasi.** Ukuran, border, radius, dan state identik dengan [Input](#c-08-input), ditambah ikon chevron `icon.muted` di kanan. Panel opsi memakai `surface.raised` + `elevation.1` + border 1px, `radius.md`, maksimum tinggi 320px dengan gulir internal. Opsi terpilih memakai `surface.selected` + centang `icon.interactive`.

**Ketentuan enum.** Opsi enum dirender dari peta kode → label (`SDD-FE-08`); kode teknis seperti `RUSAK_RINGAN` **tidak pernah** tampil. Opsi berstatus memakai [Badge](#c-13-badge), bukan teks polos.

**Accessibility.** Perilaku dari primitif headless (`SDD-FE-12`): panah untuk berpindah, Enter memilih, Esc menutup, ketik untuk mencari. `aria-expanded`, `aria-activedescendant`, dan pengumuman jumlah hasil pada `combobox`.

---

# C-10 Checkbox

**Purpose.** Pilihan biner independen dan pemilihan massal baris tabel.

**Spesifikasi.** Kotak 20×20px, `radius.sm` 4px, border 1px `border.strong`. Tercentang: fill `teal.600` + tanda centang putih (4,98 ✓). Indeterminate: fill `teal.600` + garis horizontal putih. Area sentuh **44×44 dp** meski kotaknya 20px. Label di kanan, `font.size.base`, seluruh label dapat diklik.

**State.** `default` · `hover` border `neutral.500` · `focus` ring 2px offset 2px · `checked` fill teal · `indeterminate` · `disabled` fill `neutral.200` + border `border.disabled` · `error` border `border.error`.

**Accessibility.** `<input type="checkbox">` asli. Grup memakai `<fieldset>` + `<legend>`. Checkbox "pilih semua" pada tabel memakai `aria-label` yang menyebut jumlah terpilih.

---

# C-11 Radio

**Purpose.** Memilih tepat satu dari beberapa opsi yang seluruhnya perlu terlihat — kondisi kembali barang, keputusan approval, alasan penghapusan.

**Spesifikasi.** Lingkaran 20×20px, `radius.full`, border 1px `border.strong`. Terpilih: border 2px `teal.600` + titik tengah 8px `teal.600`. Area sentuh 44×44 dp. Jarak antar-opsi `spacing.3`.

**Varian `card`.** Untuk pilihan yang butuh penjelasan — mis. kondisi kembali pada MS-11: setiap opsi berbentuk kartu dengan judul, keterangan, dan ikon status. Terpilih: border 2px `teal.600` + latar `surface.selected`.

**Accessibility.** `<input type="radio">` asli dalam `<fieldset>` + `<legend>`. Panah berpindah antar-opsi dalam grup, Tab keluar dari grup.

---

# C-12 Toggle

**Purpose.** Mengaktifkan/menonaktifkan pengaturan yang **berlaku seketika** — preferensi notifikasi (P-78), parameter sistem (P-70), penanda `dapat_dipinjam` pada aset.

**Spesifikasi.** Track 44×24px `radius.full`; knob 20px putih. Mati: track `neutral.300`. Menyala: track `teal.600` (4,98 ✓). Label di kiri, state di kanan. Area sentuh 44×44 dp.

**Ketentuan wajib.** Toggle **selalu** disertai teks state ("Aktif" / "Nonaktif") — warna dan posisi knob tidak cukup (`NFR-AC-06`). Toggle terkunci (notifikasi wajib, `FR-17.3 A1`) memakai state `disabled` **beserta teks penjelasan** mengapa tidak dapat dimatikan, bukan sekadar diredupkan (`UX-05`).

**Do / Don't.**

| ✅ Do | ❌ Don't |
|---|---|
| Toggle untuk pengaturan yang berlaku seketika | Toggle di dalam form yang butuh tombol Simpan — pakai Checkbox |
| Teks state di sebelah toggle | Mengandalkan posisi knob saja |
| Menjelaskan mengapa toggle terkunci | Menonaktifkan tanpa alasan |

---

# C-13 Badge

**Purpose.** Menyatakan status, kondisi, atau kategori dalam satu label ringkas. **Satu komponen untuk seluruh enum Bab 11.3** (31.3) — komponen tempat `UX-03` dan `NFR-AC-06` paling sering diuji.

**Anatomy.** `[ikon 16px] [teks]` — padding `spacing.1`/`spacing.2`, `radius.sm`, `font.size.sm`, bobot 500. **Ikon dan teks keduanya wajib.**

**Variant.**

| Varian | Latar | Teks & ikon | Kontras | Dipakai untuk |
|---|---|---|---:|---|
| `success` | `success.subtle` | `success.strong` | 7,25 ✓ | `Baik` · `Tersedia` · `Selesai` · `Lunas` · `Dibebaskan` |
| `warning` | `warning.subtle` | `warning.strong` | 7,27 ✓ | `Rusak Ringan` · `Direservasi` · jatuh tempo dekat · `Dibebaskan Sebagian` |
| `error` | `error.subtle` | `error.strong` | 8,40 ✓ | `Rusak Berat` · `Hilang` · `Terlambat` · `Ditolak` · `Kritis` |
| `info` | `info.subtle` | `info.strong` | 7,84 ✓ | `Dipinjam` · `Dalam Perbaikan` · `Berlangsung` |
| `neutral` | `neutral.100` | `neutral.700` | 9,37 ✓ | `Draf` · `Dibatalkan` · `Kedaluwarsa` · `Tidak Digunakan` |
| `category` | `color.accent.*` fill penuh | putih atau `#111827` | lihat bawah | Kategori aset · seri data viz |

**Aturan varian `category`.**

| Accent | Fill | Teks | Kontras |
|---|---|---|---:|
| Biru | `#00529C` | `text.inverse` | 7,82 ✓ |
| Ungu | `#541F7F` | `text.inverse` | 11,17 ✓ |
| Merah | `#D4160D` | `text.inverse` | 5,36 ✓ |
| Hijau | `#028744` | `text.inverse` | 4,61 ✓ |
| Kuning | `#FEB003` | `text.heading` | 9,65 ✓ |
| **Abu** | dilarang | dilarang | 4,23 / 4,19 gagal |

> Badge abu memakai varian `neutral`, **bukan** `accent.gray`.

**Size.** `sm` tinggi 20px `font.size.xs` untuk dalam sel tabel · `md` tinggi 24px `font.size.sm` bawaan.

**Accessibility.** Badge bukan tombol — kecuali chip filter, yang milik [Panel Filter](#c-22-panel-filter). Ikon `aria-hidden`; makna dibawa teks. Badge dalam sel tabel tidak boleh menjadi satu-satunya isi sel bila kolomnya dapat diurutkan.

**Do / Don't.**

| ✅ Do | ❌ Don't |
|---|---|
| Warna + ikon + teks pada setiap badge | Badge titik warna tanpa teks |
| Status memakai semantic | Status memakai accent |
| Kategori memakai accent | Kategori memakai semantic |
| Label dari peta enum | Menampilkan `RUSAK_RINGAN` mentah |

---

# C-14 Alert

**Purpose.** Menyampaikan pesan sistem yang menempel pada konteks — bukan yang mengambang.

**Anatomy.** `[ikon 20px] [judul opsional] [pesan] [aksi opsional] [tutup opsional]` — `radius.md`, padding `spacing.4`, border kiri 3px `*.base`, latar `*.subtle`.

**Variant.** `success` · `warning` · `error` · `info` memakai token semantic. **Tidak ada varian accent.**

**Ketentuan isi.** Setiap alert bergalat wajib menyertakan pesan yang dapat dimengerti tanpa detail teknis (`NFR-R-10`), aksi berikutnya (`UX-05`), dan `request_id` yang dapat disalin bila berasal dari galat server (31.5).

| Konteks | Varian | Isi |
|---|---|---|
| `409 RESERVATION_CONFLICT` | `error` | Objek yang bentrok + **saran slot alternatif terdekat** (`FR-07.2 A1`) |
| `409 APPROVAL_ALREADY_DECIDED` | `info` | Siapa memutuskan dan kapan (`RE-09`) |
| `422 BORROWER_BLOCKED` | `warning` | Daftar kewajiban + tautan ke P-35 (`BR-030`) |
| Peringatan garansi aktif | `warning` | Tanggal berakhir + tautan dokumen garansi (`BR-052`) |
| Peringatan all-or-nothing wizard langkah 3 | `warning` | Konsekuensi `BR-024b` |
| Berkas belum lolos pemindaian AV | `info` | "Sedang diperiksa" + tombol unduh nonaktif (`NFR-S-18`) |

**Accessibility.** `role="alert"` untuk galat & peringatan, `role="status"` untuk sukses & info. Tombol tutup 44x44 dp ber-`aria-label`.

---

# C-15 Table

**Purpose.** Menampilkan data terpaginasi. Komponen paling banyak dipakai — 15 halaman daftar ([`UX §7.4`](../UX/PAGE-SPECIFICATION.md#74-pola-pencarian-filter-dan-pengurutan)).

**Anatomy.**

```
[ Panel Filter                                            ]
+---------------------------------------------------------+
| [ ] | Kode Barang ^ | Nama | Kondisi | Status |          |  header 48px, surface.subtle
+---------------------------------------------------------+
| [x] | LAB-KOM-0001  | ...  | [badge] | [badge]|  [...]   |  baris 44px
+---------------------------------------------------------+
| 1 dipilih:  [Cetak QR] [Mutasi Lokasi] [Ekspor]          |  bar aksi massal
| Menampilkan 1-25 dari 4.820      [< 1 2 3 ... >]  [25 v] |
+---------------------------------------------------------+
```

**Spesifikasi.**

| Bagian | Nilai |
|---|---|
| Tinggi baris | `size.row.desktop` 44px (**DSD-08**) |
| Tinggi kepala | `size.header.table` 48px · `surface.subtle` · `font.size.sm` 500 |
| Padding sel | `spacing.3` vertikal · `spacing.4` horizontal |
| Garis antar-baris | 1px `border.subtle` |
| Radius | 0 — sudut tegas menegaskan struktur data |
| Hover baris | Latar `neutral.50` |
| Baris terpilih | Latar `surface.selected` |
| Angka | `tabular-nums`, rata kanan |
| Kepala | `position: sticky` saat menggulir |

**Interaction.** Klik baris membuka detail (Link `quiet`); kolom identitas memakai Link `standalone` teal. Pengurutan lewat kepala kolom, arah ditandai **ikon + `aria-sort`**, bukan warna. Filter, urutan, dan halaman tercermin di URL (`FR-04.2`, `SDD-FE-10`).

**State.** `loading` skeleton berbentuk baris, bukan spinner (19.1 A2) · `empty` [Empty State](#c-21-empty-state) di dalam badan tabel · `error` [Alert](#c-14-alert) + tombol "Coba lagi".

**Responsif.** Pada di bawah 768px tabel menjadi **kartu per baris** berisi 3–4 field terpenting, tinggi ketuk `size.row.mobile` 48px. Tabel lebar menggulir horizontal **di dalam wadahnya sendiri** (`NFR-C-02`).

**Accessibility.** `<table>` semantik dengan `<caption>` yang menyebut isi dan filter aktif, `scope` pada `<th>`, `aria-sort` pada kolom terurut. Checkbox baris ber-`aria-label` menyebut identitas baris.

**Do / Don't.**

| ✅ Do | ❌ Don't |
|---|---|
| Baris 44px, padat tetapi memenuhi target sentuh | Baris di bawah 44px demi memuat lebih banyak |
| Skeleton berbentuk baris saat memuat | Spinner layar penuh |
| Status sebagai Badge | Mewarnai seluruh baris menurut status |
| Kolom identitas berwarna teal | Seluruh sel berwarna teal |

---

# C-16 Tabs

**Purpose.** Berpindah antar-bagian objek yang sama — tab pada detail aset, detail work order, tab status peminjaman.

**Anatomy.** `[label] [penghitung opsional]` berjajar horizontal di atas garis 1px `border.subtle`.

**Spesifikasi.**

| Bagian | Nilai |
|---|---|
| Tinggi | 44px · padding `spacing.3`/`spacing.4` |
| Font | `font.size.base` |
| Tidak aktif | `text.primary` bobot 500 |
| Aktif | `teal.800` bobot 600 + garis bawah 2px `teal.600` (8,74 ✓) |
| Hover | Latar `neutral.50` |
| Fokus | Ring 2px `border.focus` offset −2px |
| Penghitung | Pill `neutral.100` + `neutral.700` |

**Interaction.** Tab tercermin di URL sebagai segmen route (`UXP-01`) — `/aset/3021/servis` dapat ditautkan dan dibagikan. Pada di bawah 768px tab menggulir horizontal dengan penanda tepi; menjadi [Select](#c-09-select) bila lebih dari 5 tab.

**Accessibility.** `role="tablist"` / `tab` / `tabpanel` dari primitif headless (`SDD-FE-12`). Panah berpindah tab, Home/End ke ujung, panel ber-`aria-labelledby`.

**Do / Don't.**

| ✅ Do | ❌ Don't |
|---|---|
| Tab berpindah di dalam objek yang sama | Tab untuk berpindah antar-objek berbeda |
| Garis bawah 2px + bobot 600 sebagai penanda aktif | Penanda aktif hanya berupa warna |
| Tab tercermin di URL | Tab yang hanya hidup di state komponen |

---

# C-17 Dropdown

**Purpose.** Menu aksi sekunder yang tidak muat sebagai tombol — menu titik-tiga pada halaman detail dan baris tabel.

**Spesifikasi.**

| Bagian | Nilai |
|---|---|
| Pemicu | Tombol ikon 44x44 dp |
| Panel | `surface.raised` + `elevation.1` + border 1px `border.subtle` · `radius.md` · lebar minimum 200px |
| Padding panel | `spacing.2` vertikal |
| Item | Tinggi 44px · padding `spacing.3`/`spacing.4` · `font.size.base` · hover `neutral.50` |
| Pemisah | 1px `border.subtle` · margin `spacing.2` vertikal |
| Item destruktif | Teks & ikon `error.base` · **diletakkan di grup terakhir** setelah pemisah |

**Accessibility.** `role="menu"` / `menuitem`. Panah berpindah, Enter memilih, Esc menutup dan **mengembalikan fokus ke pemicu**. `aria-expanded` pada pemicu.

**Do / Don't.**

| ✅ Do | ❌ Don't |
|---|---|
| Aksi destruktif dipisahkan di grup terakhir | Aksi destruktif bersebelahan dengan aksi rutin |
| Aksi utama tetap sebagai tombol terlihat | Menyembunyikan aksi utama di dalam menu titik-tiga |

---

# C-18 Tooltip

**Purpose.** Menjelaskan ikon atau memberi konteks singkat. **Tidak pernah** memuat informasi yang wajib dibaca — itu milik teks bantuan [Input](#c-08-input) atau [Alert](#c-14-alert).

**Spesifikasi.** Latar `neutral.800`, teks `text.inverse` (14,68 ✓), `font.size.sm`, padding `spacing.2`/`spacing.3`, `radius.sm`, lebar maksimum 280px, `elevation.1`, jarak 8px dari pemicu.

**Interaction.** Muncul setelah 400ms hover atau **seketika saat fokus papan ketik**; hilang saat Esc, blur, atau pointer keluar.

**Accessibility.** Wajib dapat dipanggil papan ketik — tooltip yang hanya muncul saat hover melanggar `NFR-AC-03`. Ditautkan lewat `aria-describedby`. Pada perangkat sentuh tooltip tidak dapat diandalkan, sehingga informasinya wajib tersedia di tempat lain.

**Do / Don't.**

| ✅ Do | ❌ Don't |
|---|---|
| Menjelaskan ikon yang sudah punya `aria-label` | Menyembunyikan label wajib di dalam tooltip |
| Muncul saat fokus papan ketik | Hanya muncul saat hover |
| Isi singkat satu kalimat | Memuat tautan atau tombol di dalamnya |

---

# C-19 Pagination

**Purpose.** Berpindah halaman pada daftar terpaginasi. `SDD-API-05` menetapkan paginasi **offset** dengan nomor halaman dan total — bukan cursor.

**Anatomy.**

```
Menampilkan 1-25 dari 4.820      [<]  1  2  3  ...  193  [>]     [25 v]
```

**Spesifikasi.**

| Bagian | Nilai |
|---|---|
| Teks rentang | `font.size.sm` · `text.secondary` · `tabular-nums` |
| Tombol halaman | 44x44 dp · `radius.sm` · `font.size.base` · `tabular-nums` |
| Halaman aktif | Fill `teal.600` + `text.inverse` (4,98 ✓) |
| Halaman lain | `text.primary` · hover `neutral.50` |
| Panah | Ikon 20px · nonaktif di ujung dengan `aria-disabled` |
| Pemilih jumlah | [Select](#c-09-select) — 25 bawaan · 50 · 100 maksimum (17.1) |

**Ketentuan.** Nomor halaman dan jumlah per halaman tercermin di URL (`FR-04.2`). Pengecualian `MOB-PERF-02` — daftar target opname memuat hingga 500 per halaman — tidak memakai komponen ini melainkan gulir menerus per lokasi.

**Accessibility.** `<nav aria-label="Paginasi">`. Halaman aktif ber-`aria-current="page"`. Perubahan halaman diumumkan lewat *live region* sopan yang menyebut rentang baru.

---

# C-20 Loading

**Purpose.** Menyatakan data sedang dimuat. 31.5 dan 19.1 A2 mewajibkan **skeleton menyerupai bentuk konten**, bukan spinner layar penuh.

**Variant.**

| Varian | Bentuk | Dipakai untuk |
|---|---|---|
| `skeleton.row` | Balok setinggi baris, lebar bervariasi per kolom | Tabel — jumlah balok mengikuti `per_page` |
| `skeleton.card` | Balok judul + 2–3 balok isi + balok angka | Kartu dashboard — **tiap kartu memuat mandiri** |
| `skeleton.detail` | Balok kepala + balok tab + blok isi | Halaman detail entitas |
| `skeleton.calendar` | Kisi sel abu | Kalender ketersediaan |
| `spinner` | Lingkaran berputar 16px/20px | **Hanya** di dalam tombol `loading` dan progres unggah |
| `progress.bar` | Bar `teal.600` di atas track `teal.300` | Impor massal · ekspor asinkron · unggah berkas |

**Spesifikasi skeleton.** Latar `neutral.100`, `radius.sm`, denyut halus 1,5s. Muncul **seketika** tanpa transisi masuk. Tidak ada animasi pada baris tabel setelah data termuat (`NFR-P-05`).

**Ketentuan.** Kegagalan satu kartu dashboard **tidak menggagalkan kartu lain** (19.1 A2) — tiap kartu punya skeleton, empty, dan error sendiri.

**Accessibility.** Wadah skeleton ber-`aria-busy="true"`. Selesai memuat diumumkan lewat *live region* sopan. `prefers-reduced-motion` menghentikan denyut, menyisakan balok statis.

**Do / Don't.**

| ✅ Do | ❌ Don't |
|---|---|
| Skeleton berbentuk konten akhir | Spinner menutupi seluruh layar |
| Tiap kartu dashboard memuat mandiri | Menahan seluruh dashboard sampai kartu terlambat selesai |
| Bar progres untuk operasi berdurasi diketahui | Bar progres palsu untuk operasi tak terukur |

---

# C-21 Empty State

**Purpose.** Menyatakan tidak ada data **dan menawarkan langkah berikutnya**. `UX-05` menjadikan komponen ini wajib punya aksi — keadaan kosong tanpa aksi adalah jalan buntu.

**Anatomy.**

```
        [ ilustrasi / ikon 48px ]
             Judul singkat
        Satu kalimat penjelas
        [ Tombol aksi berikutnya ]
```

**Spesifikasi.**

| Bagian | Nilai |
|---|---|
| Ikon/ilustrasi | 48px · `icon.muted`; ilustrasi boleh memakai bidang datar `color.accent.*` |
| Judul | `font.size.lg` · 600 · `text.heading` |
| Penjelasan | `font.size.base` · `text.secondary` · maksimum dua baris |
| Aksi | [Button](#c-01-button) varian `primary` — **wajib ada** |
| Padding | `spacing.16` vertikal · rata tengah |

**Empat jenis kosong dan aksinya** (dari [`UX §7.3`](../UX/PAGE-SPECIFICATION.md#73-pola-lima-keadaan-global)):

| Jenis | Aksi wajib | Contoh |
|---|---|---|
| Belum ada data sama sekali | Buat data pertama | Ruangan kosong: "Tambah Aset ke Lokasi Ini" (`FR-03.2 A1`) |
| Filter tidak menghasilkan apa pun | Sesuaikan atau hapus filter | Pencarian aset nihil (`FR-04.2 A2`) |
| Rentang waktu kosong | Ubah rentang | Laporan analitik kosong (`FR-16.1 A1`) |
| Antrean kerja kosong | Tautan ke daftar penuh | "Tidak ada yang menunggu tindakan Anda hari ini" ([`UX §8.4`](../UX/PAGE-SPECIFICATION.md#84-keadaan-kosong-per-zona)) |

**Sistem baru.** Bila seluruh dashboard kosong, empty state menampilkan **panduan langkah awal berurutan** sesuai role, bukan satu tombol (`FR-15.1 A1`).

**Accessibility.** Ilustrasi `aria-hidden`; makna dibawa judul dan penjelasan.

**Do / Don't.**

| ✅ Do | ❌ Don't |
|---|---|
| Selalu menyertakan aksi berikutnya | "Tidak ada data" tanpa jalan keluar |
| Menjelaskan mengapa kosong | Ilustrasi besar tanpa teks |
| Ilustrasi boleh memakai accent sebagai bidang datar | Accent sebagai warna teks judul |

---

# C-22 Panel Filter

**Purpose.** Menyaring daftar. 31.3 mewajibkan panel filter **konsisten di seluruh modul** dengan filter aktif tampil sebagai chip yang dapat dihapus.

**Anatomy.**

```
[ Cari ................. ]  [Kategori v] [Lokasi v] [Kondisi v] [Status v]
Filter aktif:  (Kategori: Komputer x)  (Kondisi: Baik x)      Hapus semua
```

**Spesifikasi.**

| Bagian | Nilai |
|---|---|
| Kotak cari | [Input](#c-08-input) 44px + ikon kaca pembesar `icon.muted` · lebar 280–360px |
| Kontrol filter | [Select](#c-09-select) 44px · label menyebut dimensi, bukan "Filter" |
| Chip aktif | Latar `teal.50` · teks `teal.800` (8,10 ✓) · border 1px `teal.200` · `radius.sm` · tombol hapus 24px ber-`aria-label` |
| "Hapus semua" | [Button](#c-01-button) varian `tertiary` |
| Pemisah | Panel berlatar `surface.default`, border bawah 1px `border.subtle` |

**Ketentuan.** Seluruh filter, pengurutan, dan halaman **tercermin di URL** (`FR-04.2`, `SDD-FE-10`) sehingga tautan hasil filter dapat dibagikan — termasuk sasaran drill-down dashboard ([`UX §8.3`](../UX/PAGE-SPECIFICATION.md#83-sasaran-drill-down-per-kartu)). Filter tak dikenal ditolak `400`, tidak diabaikan diam-diam (`SDD-API` §4.5). Rentang tanggal selalu menyediakan pintasan **7 hari · 30 hari · Semester Berjalan · Tahun Ajaran** (`AC-YR-03`).

**Responsif.** Pada `<768px` panel menjadi *bottom sheet* yang dipanggil tombol **"Filter (3)"** — angka menyebut jumlah filter aktif.

**Accessibility.** Perubahan jumlah hasil diumumkan lewat *live region* sopan. Chip memakai `<button>` dengan `aria-label` lengkap: "Hapus filter Kategori: Komputer".

**Do / Don't.**

| ✅ Do | ❌ Don't |
|---|---|
| Chip aktif berwarna teal — ia dapat ditekan | Chip berwarna accent per dimensi filter |
| Jumlah filter aktif terlihat pada mobile | Menyembunyikan bahwa filter sedang aktif |
| Filter tercermin di URL | Filter yang hilang saat halaman dimuat ulang |

---

# C-23 Kartu KPI

**Purpose.** Menampilkan satu angka ringkas dengan drill-down. 19.1 mewajibkan setiap kartu KPI dapat diklik menuju daftar sumbernya; sasarannya ditetapkan [`UX §8.3`](../UX/PAGE-SPECIFICATION.md#83-sasaran-drill-down-per-kartu).

**Anatomy.**

```
+----------------------------------+
| Total Aset                  [->] |   label: font.size.sm / text.secondary
|                                  |
| 4.820                            |   nilai: font.size.3xl / 600 / text.heading
| +12 dari bulan lalu              |   tren: font.size.sm / semantic
+----------------------------------+
```

**Variant.**

| Varian | Zona | Perlakuan |
|---|---|---|
| `kpi` | Zona 2 Keadaan | Angka besar + tren opsional |
| `action` | Zona 1 Tindakan | Angka + daftar 5 teratas + tautan "Lihat semua" |
| `warning` | Zona 1 Tindakan | Garis kiri 3px `warning.base` atau `error.base` + ikon |
| `status` | Zona 1/2 | Ringkasan berlencana, mis. Kesehatan Integrasi |
| `chart` | Zona 3 Kecenderungan | Grafik + legenda tekstual + tabel data alternatif |

**Ketentuan tren.** Naik-baik memakai `success.base`, turun-buruk `error.base`, keduanya **disertai ikon panah dan teks** — bukan warna saja (`NFR-AC-06`). Untuk metrik yang naiknya buruk (mis. Peminjaman Terlambat), warna mengikuti **makna**, bukan arah panah.

**Ketentuan hak akses.** Kartu yang datanya di luar hak akses **tidak dirender sama sekali** — bukan kosong, bukan dinonaktifkan (`FR-15.1 AC`, Bab 18).

**Accessibility.** Seluruh kartu adalah satu target tekan tunggal ber-`aria-label` lengkap: "Total Aset, 4.820, buka daftar aset". Grafik wajib disertai **tabel data alternatif** yang dapat dibaca pembaca layar — bukan hanya `alt` pada kanvas (`NFR-AC-04`).

**Do / Don't.**

| ✅ Do | ❌ Don't |
|---|---|
| Setiap KPI punya sasaran drill-down | Angka yang tidak dapat ditelusuri |
| Kartu di luar hak akses tidak dirender | Menampilkannya dalam keadaan terkunci |
| Seri grafik memakai urutan accent yang tetap | Warna seri berubah antar-pemuatan |

---

# C-24 Kalender Ketersediaan

**Purpose.** Komponen paling kompleks di sistem (`SDD-FE-06`). Perilaku penuh ditetapkan [`UX §7.6.1`](../UX/PAGE-SPECIFICATION.md#761-p-27-kalender-ruangan); berkas ini menetapkan wujud visualnya.

**Anatomy.** Grid: baris = ruangan, kolom = slot 30 menit (`CAL-UI-02`). Kepala kolom melekat, kepala baris melekat.

**Lima keadaan slot** (`CAL-UI-05`) — dibedakan **warna + pola + teks**, tidak pernah warna saja:

| Keadaan | Latar | Pola | Teks dalam sel |
|---|---|---|---|
| Kosong | `surface.default` | — | *(kosong, dapat ditekan)* |
| Menunggu Persetujuan | `warning.subtle` | Garis diagonal 45° | Nama kegiatan |
| Disetujui | `teal.50` | Solid | Nama kegiatan |
| Jadwal Tetap | `neutral.100` | Titik-titik | Label kegiatan (mis. "KBM XI-A") |
| Dalam Pemeliharaan / Libur | `neutral.200` | Garis silang | "Pemeliharaan" / nama hari libur |

> Pola 45° dan titik-titik mengambil bahasa serong logo (`DS-P-06`) sekaligus memenuhi `NFR-AC-06` — keadaan tetap terbaca pada mode buta warna maupun cetak hitam-putih.

**Spesifikasi.**

| Bagian | Nilai |
|---|---|
| Lebar sel | Minimum 48px per slot 30 menit |
| Tinggi baris ruangan | 44px |
| Border sel | 1px `border.subtle`; batas jam penuh 1px `neutral.300` |
| Slot dapat ditekan | Hover latar `teal.50`, fokus ring 2px inset |
| Seleksi rentang | Latar `teal.100` + border 2px `teal.600` |
| Penanda WIB | Permanen pada kepala kolom (`CAL-UI-09`) |
| Zona hari libur | Kolom/baris diberi latar `neutral.100` + label |

**Interaction.** Klik slot kosong (desktop) · *drag-select* antar-slot berdampingan · ketuk-dan-geser (mobile). Papan ketik: panah berpindah slot, Enter memilih, Shift+Panah memperluas, Esc membatalkan (`CAL-UI-08`).

**Performa.** Baris divirtualisasi — hanya baris dalam viewport dirender (`CAL-UI-04`). Ketersediaan **tidak boleh di-cache**; dimuat ulang saat jendela kembali fokus (`AV-04`, `UXP-04`).

**Responsif.** Pada `<768px` beralih ke **daftar per hari**; matriks tidak dipaksakan (`CAL-UI-07`).

**Role Siswa/OSIS.** Slot terisi hanya menampilkan "Terpakai" tanpa identitas pemohon (`CAL-UI-06`, `FR-07.1 A1`).

**Accessibility.** Tiap sel memiliki label tekstual yang menyebut ruangan, waktu, dan keadaannya. Grid memakai `role="grid"` dengan `aria-rowindex`/`aria-colindex`.

---

# C-25 Pemindai QR

**Purpose.** Titik masuk utama alur lapangan (`UX-02`). 31.3 mewajibkan tampilan kamera, panduan bidik, dan tombol "Masukkan kode manual" yang **selalu terlihat**.

**Anatomy.**

```
+----------------------------------+
|                                  |
|      +------------------+        |   bingkai bidik 240x240
|      |                  |        |   sudut siku 3px teal.600
|      |                  |        |
|      +------------------+        |
|   Arahkan kamera ke label QR     |   font.size.base / text.inverse
|                                  |
| [ Masukkan kode barang manual ]  |   SELALU TERLIHAT
+----------------------------------+
```

**Spesifikasi.**

| Bagian | Nilai |
|---|---|
| Latar | Umpan kamera + overlay `rgba(17, 24, 39, 0.60)` di luar bingkai |
| Bingkai bidik | 240x240px · sudut siku 3px `teal.600` · tanpa isi |
| Panduan | `font.size.base` · `text.inverse` · di bawah bingkai |
| Tombol manual | [Button](#c-01-button) `secondary` pada latar gelap — border & teks `text.inverse`, tinggi `size.control.lg` 52px |
| Berhasil memindai | Bingkai berkedip `success.base` sekali + getar haptik |
| Gagal membaca | Bingkai `error.base` + pesan "Kode tidak terbaca" |

**Mode beruntun** (`MOB-MED-07`). Untuk opname dan mutasi massal: kamera tetap aktif, hasil ditambahkan ke daftar di bawah layar tanpa menutup pemindai. Penghitung "12 unit terpindai" tampil permanen.

**Izin kamera ditolak** (`MOB-MED-06`, `FR-05.2 A4`). Layar berganti menjadi [Empty State](#c-21-empty-state) berisi panduan mengaktifkan izin **dan** input kode manual — bukan layar buntu.

**Accessibility.** Tombol manual berada dalam urutan fokus, bukan hanya dapat dijangkau sentuhan (`NFR-AC-03`). Hasil pemindaian diumumkan lewat *live region* menyebut kode barang yang terbaca.

**Do / Don't.**

| ✅ Do | ❌ Don't |
|---|---|
| Tombol kode manual selalu terlihat | Menyembunyikannya di balik menu |
| Umpan balik berhasil berupa visual + haptik | Berpindah layar tanpa konfirmasi |
| Izin ditolak tetap menawarkan jalur manual | Layar kosong bertuliskan "izin ditolak" |

---

# C-26 Pengunggah Foto

**Purpose.** Mengunggah foto kondisi, bukti serah terima, dan lampiran kerusakan. 31.3 mewajibkan pratinjau, kompresi otomatis, indikator progres, dan penanganan gagal + coba lagi.

**Spesifikasi.**

| Bagian | Nilai |
|---|---|
| Area unggah | Border putus-putus 1px `border.strong` · `radius.md` · padding `spacing.6` · hover latar `neutral.50` |
| Pratinjau | Kotak 96x96px · `radius.sm` · tombol hapus 24px di pojok |
| Progres | Bar `teal.600` di dalam pratinjau |
| Berhasil | Ikon centang `success.base` di pojok |
| Gagal | Overlay `error.subtle` + ikon + tombol "Coba lagi" |
| Tertunda | Ikon jam `warning.base` + label **"Foto belum terunggah"** (`MOB-OFF-04`) |
| Sedang dipindai AV | Ikon perisai `info.base` + label "Sedang diperiksa" — unduh nonaktif (`NFR-S-18`) |

**Ketentuan mobile.** Foto dikompresi **sebelum masuk antrean** (`SDD-MOB-03`): sisi terpanjang 1600px, JPEG 80%, target maksimum 500KB, EXIF dibuang kecuali orientasi (`MOB-MED-01`, `MOB-MED-02`). Antrean bertahan maksimum 72 jam atau 50 berkas (`MOB-OFF-03`).

**Ketentuan jumlah.** Serah terima & pengembalian minimum 1 foto wajib (`BR-027`) · laporan kerusakan 1–5 foto, minimum 1 (`BR-044`) · penyelesaian work order minimum 1 foto hasil (`BR-049`).

**Accessibility.** Area unggah dapat dioperasikan papan ketik dan memanggil pemilih berkas dengan Enter. Progres diumumkan lewat *live region*. Setiap pratinjau punya `alt` yang menyebut objeknya, bukan "gambar".

---

# C-27 Linimasa Approval

**Purpose.** Menampilkan jejak persetujuan lengkap (`FR-10.3`). Muncul pada P-31, P-38, P-53, P-57.

**Anatomy.**

```
 (*)  Pengajuan dibuat                    12 Agt 2026, 08.14 WIB
  |   Pak Budi (Guru)
  |
 (*)  Langkah 1 - Disetujui               12 Agt 2026, 09.02 WIB
  |   Bu Sari (Petugas Sarpras)
  |   "Ruangan tersedia, silakan."
  |
 ( )  Langkah 2 - Dilewati                -
  |   Konflik kepentingan
  |
 (O)  Langkah 3 - Menunggu                Sisa SLA 6 jam kerja
  |   Pimpinan Sekolah
```

**Penanda langkah:**

| Penanda | Bentuk | Warna |
|---|---|---|
| Selesai disetujui | Lingkaran isi + centang | `success.base` |
| Ditolak | Lingkaran isi + silang | `error.base` |
| Sedang berjalan | Lingkaran cincin tebal | `teal.600` |
| Belum aktif | Lingkaran garis tipis | `neutral.300` |
| Dilewati | Lingkaran garis putus | `neutral.400` |
| Dieskalasi / didelegasikan | Penanda + ikon panah bercabang | `warning.base` |

| Bagian | Nilai |
|---|---|
| Garis penghubung | 2px `border.subtle`; `neutral.300` pada langkah belum aktif |
| Nama pelaku | `font.size.base` · 500 · `text.primary` |
| Role & waktu | `font.size.sm` · `text.secondary` · selalu berpenanda WIB |
| Catatan | `font.size.base` · latar `surface.subtle` · `radius.sm` |
| Sisa SLA | [Badge](#c-13-badge) `warning` bila tersisa kurang dari 25% waktu |

**Ketentuan.** Langkah yang dilewati **tetap ditampilkan** beserta alasannya (`BR-039`, `SDD-APR-12`). Pelaku `SYSTEM` dirender **"Sistem"** beserta nama pekerjaannya, bukan kode (`AL-06`, `UX-06`). Delegasi menampilkan approver asli **dan** penerima delegasi (`RE-12`).

**Accessibility.** `<ol>` semantik. Ikon `aria-hidden`; status dibawa teks pada setiap langkah.

---

# C-28 Drawer

**Purpose.** Aksi singkat berformulir pendek di atas halaman detail (**UXD-02**). **Tidak pernah** dipakai untuk menampilkan entitas.

**Anatomy.** `[judul + tombol tutup] [isi] [footer: aksi utama + batal]`

**Spesifikasi.**

| Bagian | Nilai |
|---|---|
| Lebar | `size.drawer` 480px pada `md`/`lg`; *bottom sheet* setinggi konten pada layar di bawah 768px |
| Permukaan | `surface.default` + `elevation.2` |
| Radius | `radius.lg` pada sisi yang menghadap konten |
| Overlay | `rgba(17, 24, 39, 0.48)` |
| Padding | `spacing.6` |
| Footer | Border atas 1px `border.subtle` · aksi utama di kanan |
| Animasi | `motion.duration.slow` 280ms · `motion.easing.enter` |

**Ketentuan ukuran.** Isi drawer maksimum satu layar tanpa gulir vertikal pada 1366px. Bila isian melebihi itu, **ia bukan drawer melainkan halaman formulir** ([`UX §7.5`](../UX/PAGE-SPECIFICATION.md#75-pola-drawer-aksi)).

**Varian `confirm`** (modal konfirmasi). Lebar `size.modal.sm` 480px, wajib memuat:

| Bagian | Ketentuan |
|---|---|
| Judul | Konsekuensi konkret: "Batalkan reservasi RSV-RG-2026-0087?" |
| Badan | Dampak turunan: slot dibebaskan, pemohon dinotifikasi |
| Alasan | Textarea **wajib** untuk seluruh aksi pada [`UX §7.2`](../UX/PAGE-SPECIFICATION.md#72-pola-aksi-destruktif) |
| Tombol utama | Label berupa kata kerjanya — **bukan "OK"** |
| Varian tombol | `danger` untuk destruktif, `primary` untuk lainnya |

**Interaction.** Route halaman tetap; drawer ditandai `?aksi=<nama>` agar dapat ditautkan dan ditutup dengan tombol kembali peramban. Esc, tombol tutup, dan klik latar menutup — kecuali bila ada perubahan belum tersimpan, yang meminta konfirmasi.

**Accessibility.** Fokus berpindah ke drawer saat terbuka, **terkunci di dalamnya**, dan kembali ke tombol pemicu saat tertutup. `role="dialog"` + `aria-modal="true"` + `aria-labelledby` menunjuk judul. Tombol utama dinonaktifkan sampai field alasan terisi.

**Do / Don't.**

| ✅ Do | ❌ Don't |
|---|---|
| Drawer untuk aksi singkat | Drawer untuk menampilkan detail entitas |
| Judul menyatakan konsekuensi | Judul "Apakah Anda yakin?" |
| Tombol berlabel kata kerja | Tombol "OK" / "Ya" |

---

# C-29 Pusat Notifikasi

**Purpose.** Daftar notifikasi, penghitung belum dibaca, filter, dan tandai terbaca (31.3, `FR-17.1`).

**Anatomy.** Dua bentuk: **panel pratinjau** dari lonceng topbar (5 terbaru + tautan "Lihat semua") dan **halaman penuh** P-13.

**Spesifikasi.**

| Bagian | Nilai |
|---|---|
| Item | Padding `spacing.4` · border bawah 1px `border.subtle` · tinggi minimum 44px |
| Belum dibaca | Latar `teal.50` + titik 8px `teal.600` di kiri |
| Sudah dibaca | Latar `surface.default` |
| Judul | `font.size.base` · 500 · `text.primary` |
| Isi | `font.size.sm` · `text.secondary` · maksimum dua baris |
| Waktu | `font.size.sm` · `text.tertiary` · relatif, dengan judul absolut berpenanda WIB |
| Ikon jenis | 20px · warna semantic sesuai kelompok notifikasi |
| Notifikasi wajib | [Badge](#c-13-badge) `neutral` bertuliskan "Wajib" |

**Ketentuan.** Penghitung belum dibaca dihitung **di server** dan disiarkan ulang setiap perubahan — tidak dihitung klien (`NTF-05`). Setiap item memiliki *deep link* ke objek terkait (`SDD-NTF-09`); objek yang hilang mengarah ke P-09 "Data tidak lagi tersedia" (`FR-17.1 A1`).

**Enam kelompok** untuk filter dan preferensi (**UXD-05**): Persetujuan · Reservasi & Peminjaman · Denda & Kewajiban · Kerusakan & Perawatan · Opname & Pengadaan · Akun & Sistem.

**Accessibility.** Penghitung diumumkan lewat *live region* sopan. "Tandai semua terbaca" mengumumkan jumlah yang terpengaruh. Item adalah satu target tekan tunggal ber-`aria-label` lengkap.

---

## Ketentuan penambahan komponen

Komponen baru hanya ditambahkan bila **tidak dapat dirakit** dari 29 komponen di atas. Varian baru pada komponen yang ada memerlukan pembaruan berkas ini beserta alasannya — pustaka yang bercabang diam-diam adalah cara sebuah design system berhenti dipakai.

**Sebelum menambah, periksa empat hal:**

1. Apakah ini sebenarnya varian dari komponen yang sudah ada?
2. Apakah perilakunya sudah ditetapkan [`docs/UX/`](../UX/)? Bila belum, itu masalah UX, bukan masalah komponen.
3. Apakah ia memenuhi seluruh [aturan bersama](#aturan-yang-berlaku-bagi-seluruh-komponen)?
4. Apakah warnanya mengikuti hierarki §3 — bukan menambah accent baru?
