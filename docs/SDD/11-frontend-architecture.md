# SDD-11 — Arsitektur Frontend

**Area:** `FE` · **Status:** Draft · **Basis:** [`ui-foundation.md`](../PRD/04-frontend/ui-foundation.md), [`dashboards.md`](../PRD/04-frontend/dashboards.md)

---

## 1. Konteks

| Kelompok | ID |
|---|---|
| Fondasi UI | `UX-01` … `UX-06`, `CAL-UI-01` … `CAL-UI-09`, `DS-01` … `DS-06` |
| Dashboard | `FR-15.1`, Bab 19 |
| Otorisasi klien | `PM-04`, `SDD-AUTH-05` |
| Performa | `NFR-P-03`, `NFR-P-04`, `NFR-P-05` |
| Aksesibilitas | `NFR-AC-01` … `NFR-AC-09` |
| Kompatibilitas | `NFR-C-01`, `NFR-C-02` |
| Notifikasi | `NTF-01`, `NTF-03` |

Basis teknologi ditetapkan Keputusan #3: **React**. Berkas ini menetapkan bentuk aplikasinya.

---

## 2. Keputusan Desain

| ID | Keputusan |
|---|---|
| **SDD-FE-01** | Struktur folder **mengikuti modul PRD**, sama seperti backend (`SDD-SYS-04`) — bukan dikelompokkan per jenis berkas. |
| **SDD-FE-02** | Data server dikelola **pustaka server-state** (TanStack Query atau setara); **tidak ada** state global untuk data server. |
| **SDD-FE-03** | State global klien dibatasi pada tiga hal: sesi & permission, notifikasi, preferensi tampilan. Selebihnya lokal. |
| **SDD-FE-04** | Rendering berbasis permission mengambil sumber **hanya** dari `GET /me` (`PM-04`); klien tidak pernah menyimpulkan hak akses dari role. |
| **SDD-FE-05** | Skema validasi **dibagi dengan backend** sebagai paket bersama, sehingga aturan form dan aturan API tidak menyimpang. |
| **SDD-FE-06** | Kalender ketersediaan adalah **komponen tersendiri dengan virtualisasi baris**, bukan tabel biasa. |
| **SDD-FE-07** | Permintaan *refresh token* diserialisasi oleh **satu promise bersama**; permintaan paralel menunggu hasil yang sama (prasyarat `SDD-SESS-04`). |
| **SDD-FE-08** | Label enum dirender dari **peta kode → label** di klien; kode teknis tidak pernah ditampilkan mentah (`SDD-DB-02`). |
| **SDD-FE-09** | Lima keadaan layar (memuat, kosong, galat, tanpa akses, luring) diimplementasikan sebagai **komponen bersama**, bukan ditulis ulang per halaman. |
| **SDD-FE-10** | Filter tabel disimpan di **URL** sebagai sumber kebenaran, bukan di state komponen (`FR-04.2`). |
| **SDD-FE-11** | Pustaka server-state yang dimaksud `SDD-FE-02` adalah **TanStack Query**. Seluruh strategi §4.3 dinyatakan dalam istilahnya. |
| **SDD-FE-12** | Pustaka komponen dasar **dibangun sendiri** di atas primitif *headless* (`SDD-FE-13`) + Tailwind + lapisan token milik sendiri; komponen disalin ke dalam repositori, bukan dikonsumsi sebagai *design system* pihak ketiga. Form memakai react-hook-form dengan resolver Zod (`SDD-FE-05`, `SDD-API-11`). |
| **SDD-FE-13** | Primitif *headless* yang dimaksud `SDD-FE-12` adalah **Radix UI sebagai bawaan**, dengan **React Aria hanya untuk yang tidak disediakan Radix**. Pembagiannya tertutup dan tidak boleh diperluas kasus per kasus: React Aria dipakai untuk **pemilih tanggal/kalender** dan **number field**; seluruh *overlay*, navigasi, dan kendali daftar — dialog, popover, dropdown menu, tabs, select, combobox, tooltip, checkbox, radio, switch, accordion — memakai Radix. Komponen yang menuntut primitif di luar daftar ini menaikkan persoalannya ke berkas ini lebih dulu, bukan menambah ketergantungan baru. |
| **SDD-FE-14** | *Build tool* `apps/web` adalah **Vite**. Keluarannya aset statis murni, disajikan reverse proxy/CDN sesuai [SDD-16 §4.2](16-infrastructure-deployment.md); tidak ada proses Node yang merender di server. |
| **SDD-FE-15** | Router adalah **TanStack Router**. *Search param* divalidasi skema Zod (`SDD-API-11`) dan ber-tipe, sehingga filter tabel `SDD-FE-10` menjadi kontrak yang diperiksa kompilator, bukan string yang diurai tangan. |
| **SDD-FE-16** | Klien HTTP `shared/api/` (§4.4) adalah **axios**, dan bentuk yang sama berlaku di mobile (`SDD-MOB-09`). Mutex *refresh* (`SDD-FE-07`) dan gerbang versi `426` (`SDD-MOB-05`) dipasang sebagai **interceptor**; keduanya tetap kode milik kita, bukan fitur pustaka. |

---

## 3. Alasan

**SDD-FE-14 — Vite, karena konfigurasinya sudah dibeli.** `SDD-REPO-11` sudah mengunci **Vitest**, dan Vitest memakai konfigurasi, resolver, serta plugin Vite yang sama. Memilih Vite karena itu berarti satu berkas konfigurasi melayani build dan uji; memilih yang lain berarti dua konfigurasi yang wajib dijaga sinkron dengan `tsconfig` tiap pohon (`SDD-REPO-08`) — dan konfigurasi kembar yang menyimpang menghasilkan uji yang lulus atas modul yang tidak sama dengan yang dibangun.

**Next.js** ditolak bukan karena berat melainkan karena [SDD-16 §4.2](16-infrastructure-deployment.md) sudah menutup seluruh nilai utamanya: web disajikan sebagai aset statis, tanpa proses Node di server, sehingga SSR, route handler, dan ISR tidak dapat dipakai. Yang tersisa adalah kerangka besar yang dipakai sebagian, dengan `output: export` yang justru membatasi dan menambah berat terhadap `NFR-P-03`. **Rsbuild** lebih cepat pada build produksi tetapi konfigurasinya terpisah dari Vitest, sehingga keuntungan di atas hilang.

**SDD-FE-15 — router yang menganggap URL sebagai data.** `SDD-FE-10` menjadikan filter tabel di URL sebagai **sumber kebenaran** (`FR-04.2`), jadi router di sini menopang requirement, bukan sekadar memetakan halaman. Perbedaan kedua kandidat jatuh tepat di titik itu: **React Router** menyerahkan *search param* sebagai `URLSearchParams` mentah, sehingga tipe, nilai bawaan, dan validasi setiap filter menjadi perekat yang kita tulis dan uji sendiri di setiap halaman berdaftar. TanStack Router memvalidasinya dengan skema — dan skema itu boleh Zod, yang sudah dikunci `SDD-API-11` dan sudah dibagi lewat `packages/schemas` (`SDD-FE-05`).

Harganya jujur: ekosistem dan jumlah contohnya lebih kecil daripada React Router. Ditukar dengan hilangnya satu kelas bug yang `SDD-FE-10` justru undang — filter yang berubah bentuk tanpa ada yang gagal.

**SDD-FE-16 — axios, dipakai identik di dua pohon.** `SDD-FE-07` dan `SDD-MOB-09` menuntut serialisasi *refresh* lewat satu mutex, dan `SDD-MOB-05` memasang gerbang `426` sebagai interceptor global. Ketiganya adalah pola interceptor, dan axios menyediakan tempatnya secara eksplisit di kedua platform dengan API yang sama — sehingga `shared/api/` web dan `shared/api/` mobile berbentuk sama meski `SDD-MOB-01` melarang keduanya berbagi kode UI.

**`fetch` + pembungkus sendiri** ditolak tipis: ia sah, dan mutex serta gerbang `426` memang tetap kode kita menurut kedua keputusan di atas. Yang menentukan adalah bahwa pembungkus itu harus dibangun **dua kali** dan dijaga tetap berperilaku sama, padahal justru kesamaan perilaku itulah yang membuat kelas bug sesi tidak muncul hanya di satu platform. **ky** lebih ringan tetapi perilakunya di React Native perlu diverifikasi lebih dulu, dan verifikasi itu tidak dibayar oleh apa pun. Biaya ukuran bundel terhadap `NFR-P-03` dan `MOB-PERF-05` diterima sadar dan diukur pada §5.

**SDD-FE-13 — pembagian yang tertutup, bukan campuran yang tumbuh.** `SDD-FE-12` menulis "Radix UI / React Aria" dengan garis miring, yang bukan pilihan melainkan penundaan: garis miring itu bertahan ke [`DESIGN/DESIGN-SYSTEM.md`](../DESIGN/DESIGN-SYSTEM.md) dan ke tiga komponen di [`COMPONENTS.md`](../DESIGN/COMPONENTS.md), sehingga spesifikasi aksesibilitas mereka merujuk perilaku yang belum ditentukan asalnya.

Radix menjadi bawaan karena bentuknya cocok dengan `SDD-FE-12`: komposisi berbasis komponen yang disalin ke repositori dan dirawat sendiri, tanpa palet bawaan, sehingga lapisan token tetap milik kita. Ia juga menutup celah yang [§3](#3-alasan) sudah catat sebagai alasan menolak Headless UI — kombobox dan menu tersedia.

React Aria tidak ditolak, melainkan dibatasi. Ia menyediakan primitif tanggal dan kalender berlokalisasi yang tidak ada padanannya di Radix, dan `SDD-FE-06` beserta seluruh alur reservasi menuntutnya. Yang berbahaya bukan memakai keduanya, melainkan memakai keduanya **tanpa aturan**: dua model API pada komponen yang sama akan berkembang menjadi pilihan selera per komponen, dan `DS-06` (daftar periksa aksesibilitas per komponen) kehilangan dasar yang seragam. Karena itu daftarnya ditulis tertutup, dan perluasannya adalah suntingan berkas ini — bukan keputusan saat menulis komponen.

Perlu ditegaskan: `SDD-FE-06` (kalender ketersediaan bervirtualisasi) tidak berubah karenanya. Yang diambil dari React Aria adalah primitif pemilih tanggal, bukan komponen kalender §4 — tidak ada pustaka yang menyediakan yang terakhir.

**SDD-FE-01 — folder mengikuti modul.** Konsistensi dengan backend berarti sebuah tugas ("kerjakan M-09") menyentuh dua folder dengan nama yang sama, bukan lima folder tersebar. Ini juga membuat batas modul terlihat di frontend, yang biasanya luput.

**SDD-FE-02 — jangan taruh data server di state global.** Menyalin respons API ke store global adalah sumber data basi yang paling umum: dua layar menampilkan angka berbeda karena satu memuat ulang dan satu tidak. Pustaka server-state menangani cache, invalidasi, *refetch*, dan status pemuatan sekaligus — yang juga langsung memenuhi kebutuhan `AV-04` (hasil ketersediaan tidak boleh di-cache lama) lewat konfigurasi TTL per kueri.

**SDD-FE-04 — `/me` sebagai satu-satunya sumber.** Bila klien menebak hak akses dari role (`if (role === 'Admin')`), setiap perubahan matriks permission (`FR-02.2`) mengharuskan perubahan kode klien. Dengan `/me`, klien hanya menanyakan "apakah saya punya `asset.create`?" dan perubahan matriks berlaku tanpa rilis frontend.

**SDD-FE-05 — skema bersama.** Bila aturan validasi ditulis dua kali, form akan menerima nilai yang ditolak API, atau sebaliknya — dan pengguna melihat galat setelah menekan Simpan. Satu skema menghilangkan kelas bug ini.

**SDD-FE-06 — virtualisasi kalender.** `FR-07.1` menuntut 30 ruangan × 1 bulan dimuat ≤ 2 detik. Pada granularitas 30 menit dan jam operasional 12 jam, itu 30 × 30 × 24 ≈ 21.600 sel. Merender semuanya sebagai elemen DOM akan gagal target; hanya baris terlihat yang boleh dirender (`CAL-UI-04`).

**SDD-FE-07 — serialisasi refresh.** [SDD-04 §4.3](04-authentication-session.md) mencabut **seluruh keluarga token** bila token yang sudah dirotasi dipakai ulang. Dua tab yang menyegarkan bersamaan akan memicunya. Ini bukan opsional — tanpa serialisasi, pengguna ter-logout tanpa sebab yang jelas.

**SDD-FE-11 — TanStack Query.** `SDD-FE-02` menulis "TanStack Query atau setara" sebagai izin, bukan keraguan, dan §4.3 sudah menyatakan seluruh strategi datanya dalam kosakata pustaka itu: `staleTime` berjenjang per kelas data, `staleTime` **0** dengan `refetchOnWindowFocus` untuk ketersediaan (`AV-04`), dan invalidasi setelah mutasi. **SWR** lebih ringan tetapi menjadikan dua hal terakhir itu kerja manual, padahal keduanya justru inti §4.3. **RTK Query** ditolak karena menyeret Redux Toolkit masuk — berhadapan langsung dengan `SDD-FE-03` yang membatasi state global pada tiga hal, dan dengan `SDD-FE-02` yang melarang data server berada di store global sama sekali. Serialisasi refresh (`SDD-FE-07`) tidak ikut jadi kriteria: ia hidup di klien HTTP (§4.4), bukan di pustaka kueri.

**SDD-FE-12 — bangun sendiri di atas primitif headless.** Pilihannya sering disalahpahami sebagai "membangun sendiri vs memakai yang sudah ada". Sebenarnya bukan: `DS-02` mewajibkan pustaka komponen inti ada dalam perkakas desain **dan** kode sebagai keluaran M1, jadi pekerjaan itu tidak hilang dengan memilih pustaka pihak ketiga — ia hanya berpindah menjadi pekerjaan menimpa.

**Pustaka komponen lengkap ber-design-system sendiri** (MUI, Ant Design, Mantine) ditolak atas dasar itu. Ia memang tercepat sampai ke layar dan membawa mode gelap bawaan, tetapi `DS-01`/`DS-02` lalu membungkus sistem orang lain: validasi kontras saat build (`NFR-AC-01/02`, §4.6) berjalan di atas palet vendor alih-alih token kita; `NFR-AC-06` (lencana = warna **dan** ikon **dan** teks) dan `NFR-AC-08` (satuan relatif, uji perbesaran 200%) menuntut menimpa perilaku bawaan; dan bundelnya lebih berat terhadap `NFR-P-03`. **Tailwind + Headless UI saja** ditolak karena primitifnya tidak mencakup kombobox, menu, dan pola tanggal selengkap yang dituntut filter tabel dan alur kalender — kekurangannya berakhir ditambal sendiri, tanpa jaminan aksesibilitas yang justru menjadi alasan memakai primitif.

Primitif *headless* (`SDD-FE-13`) memberi perilaku papan ketik dan ARIA yang dituntut `NFR-AC-03` dan `NFR-AC-05` tanpa membawa palet, sehingga lapisan token tetap milik kita — dan lapisan token yang kita kendalikan itulah yang membuat validasi kontras CI punya sasaran jelas dan membuat **TBD-FE-B** (mode gelap) — ditutup 22 Agustus 2026 lewat `UXD-12`, di luar lingkup rilis ini — menjadi persoalan satu set token alih-alih pertarungan tema seandainya ia dibuka kembali. Kalender (`SDD-FE-06`) tidak terpengaruh pilihan ini: tidak ada pustaka yang menyediakannya, yang dibutuhkan hanya primitif virtualisasi.

---

## 4. Rancangan

### 4.1 Struktur

```
src/
├── app/                    # bootstrap, router, provider, error boundary
├── shared/
│   ├── api/                # klien HTTP, interceptor, refresh mutex (SDD-FE-07)
│   ├── auth/               # AuthProvider dari /me, <Can permission="…">
│   ├── ui/                 # design token + komponen inti (DS-02)
│   ├── states/             # Loading / Empty / Error / Forbidden / Offline
│   ├── enums/              # peta kode → label (SDD-FE-08)
│   └── schemas/            # skema bersama dengan backend (SDD-FE-05)
├── modules/
│   ├── m01-auth/ … m22-materials/    # cermin struktur backend
└── pages/                  # perakitan route → modul
```

### 4.2 Gerbang permission

```tsx
// Satu-satunya cara menyembunyikan UI. Bukan pengganti otorisasi server.
<Can permission="asset.create">
  <Button onClick={openCreate}>Tambah Aset</Button>
</Can>

// Kartu dashboard yang datanya di luar hak akses TIDAK dirender sama sekali
{can('asset.view_financial') && <TotalAssetValueCard />}   // FR-15.1 AC
```

`<Can>` membaca dari konteks `/me`. Server tetap memeriksa ulang setiap permintaan (`NFR-S-05`) — UI hanya kenyamanan.

### 4.3 Lapisan data

| Jenis data | Strategi |
|---|---|
| Katalog aset, daftar, laporan | `staleTime` 30 detik; invalidasi setelah mutasi terkait |
| **Ketersediaan** (`FR-07.1`, `FR-08.1`) | `staleTime` **0**, `refetchOnWindowFocus` — tidak boleh basi (`AV-04`) |
| Kartu dashboard | `staleTime` 5 menit (19.1) |
| `/me` | Dimuat sekali saat masuk; di-*refetch* saat token disegarkan |
| Notifikasi | SSE mendorong pembaruan; daftar di-*refetch* saat reconnect (`NTF-01`) |

### 4.4 Interceptor & serialisasi refresh

```ts
let refreshPromise: Promise<void> | null = null;

async function onUnauthorized() {
  // Semua permintaan yang gagal 401 menunggu SATU refresh (SDD-FE-07)
  refreshPromise ??= doRefresh().finally(() => { refreshPromise = null; });
  await refreshPromise;
}
```

`426 UPGRADE_REQUIRED` tidak berlaku di web; `403` memicu layar tanpa-akses, bukan logout.

### 4.5 Kalender

| Aspek | Implementasi |
|---|---|
| Struktur | Grid: baris = ruangan, kolom = slot 30 menit (`CAL-UI-02`) |
| Virtualisasi | Hanya baris dalam viewport dirender (`CAL-UI-04`) |
| Sumber data | `GET /rooms/availability` → slot ternormalisasi per ruangan |
| Lima keadaan slot | Dibedakan warna **dan** pola/ikon **dan** teks (`CAL-UI-05`, `NFR-AC-06`) |
| Interaksi | Klik (desktop), *drag-select* antar-slot berdampingan, ketuk (mobile) (`CAL-UI-03`) |
| Layar < 768 px | Beralih ke daftar per hari, bukan matriks (`CAL-UI-07`) |
| Papan ketik | Panah berpindah slot, Enter memilih (`CAL-UI-08`, `NFR-AC-03`) |
| Zona waktu | Selalu ditampilkan WIB, tidak mengikuti perangkat (`CAL-UI-09`) |

### 4.6 Aksesibilitas

| Requirement | Implementasi |
|---|---|
| `NFR-AC-01/02` | Token warna divalidasi kontras saat *build*; kegagalan menggagalkan CI |
| `NFR-AC-03` | Uji navigasi papan ketik untuk alur kritis (Bab 30.2) |
| `NFR-AC-05` | Galat form ditautkan `aria-describedby`, diumumkan via *live region* |
| `NFR-AC-06` | Lencana status = warna + ikon + teks, satu komponen bersama |
| `NFR-AC-08` | Tata letak memakai satuan relatif; diuji pada perbesaran 200% |
| Audit | Pemeriksa aksesibilitas otomatis berjalan di CI atas halaman utama |

### 4.7 Performa

| Target | Cara |
|---|---|
| LCP ≤ 2,5 detik pada 4G (`NFR-P-03`) | *Code splitting* per route; komponen berat (kalender, grafik) dimuat malas |
| Dashboard ≤ 3 detik (`NFR-P-04`) | Tiap kartu memuat mandiri dengan *skeleton* (19.1 A2) |
| Gambar | Selalu memakai turunan `thumb`/`medium` ([SDD-09 §4.5](09-file-storage-design.md)), bukan berkas asli |
| Tabel besar | Paginasi server; tidak pernah memuat seluruh 5.000 aset ke klien |

---

## 5. Konsekuensi

- Paket skema bersama menjadi dependensi lintas repo/folder; perubahan skema menyentuh frontend dan backend dalam satu perubahan.
- Karena filter hidup di URL, setiap halaman daftar wajib mendefinisikan skema parameter URL-nya — sedikit *boilerplate*, ditukar dengan tautan yang dapat dibagikan (`FR-04.2`).
- Kalender adalah komponen paling mahal untuk dibangun dan diuji; ia menjadi jalur kritis pada milestone M2 ([delivery-plan](../PRD/01-product/delivery-plan.md)).
- Batas 2 koneksi SSE (`NTF-03`) berarti membuka banyak tab akan memutus tab terlama — UI wajib menjelaskannya, bukan diam ([SDD-08 §5](08-notification-design.md)).
- `SDD-FE-12` menjadikan `DS-02` pekerjaan nyata di M1: komponen inti ditulis, bukan dipasang. Yang ditukar adalah kepemilikan lapisan token — tanpanya, validasi kontras di CI (`NFR-AC-01/02`) tidak punya berkas untuk divalidasi, dan mode gelap (**TBD-FE-B**, ditutup `UXD-12`) akan menjadi mahal seandainya ia dibuka kembali. Konsekuensi turunannya: `DS-06` (daftar periksa aksesibilitas per komponen) berlaku atas komponen kita sendiri, sehingga daftar itu benar-benar dapat diselesaikan alih-alih bergantung pada klaim vendor.
- Nilai token yang mengisi lapisan `shared/ui/` ditetapkan [`DESIGN/FOUNDATIONS.md`](../DESIGN/FOUNDATIONS.md); spesifikasi tiap komponen ada di [`DESIGN/COMPONENTS.md`](../DESIGN/COMPONENTS.md). `SDD-FE-12` menetapkan **bahwa** komponen dibangun sendiri; kedua berkas itu menetapkan **seperti apa** wujudnya.
- Karena komponen disalin ke dalam repositori, pembaruan hulu tidak datang otomatis — perbaikan aksesibilitas dari primitif hulu diikuti lewat pemutakhiran Radix/React Aria, sedangkan komponen turunan kita adalah kode yang kita rawat sendiri.

---

## 6. Risiko Teknis

| Risiko | Dampak | Mitigasi |
|---|---|---|
| Kalender tidak mencapai target 2 detik | `FR-07.1` gagal | Virtualisasi sejak awal; diukur pada data 30 ruangan sejak M2, bukan menjelang rilis |
| Data server menyelinap ke state global | Data basi & tidak konsisten antar-layar | Aturan lint melarang penyimpanan respons API di store global |
| Refresh paralel memicu pencabutan sesi | Logout tak terduga | Mutex `refreshPromise`; diuji dengan dua permintaan bersamaan |
| Peta enum tidak sinkron dengan Bab 11.3 | Label salah/kosong | Uji membandingkan peta terhadap daftar enum PRD |
| Kontras token gagal di tema tertentu | `NFR-AC-02` gagal | Validasi kontras di CI, bukan manual |

---

## 7. Requirement Terkait

`FR-04.2` `FR-07.1` `FR-08.1` `FR-15.1` `FR-17.1` · Bab 19 · `UX-01` … `UX-06` · `CAL-UI-01` … `CAL-UI-09` · `DS-01` … `DS-06` ·
`PM-04` · `NFR-P-03` `NFR-P-04` `NFR-P-05` · `NFR-AC-01` … `NFR-AC-09` · `NFR-C-01` `NFR-C-02` · `NTF-01` `NTF-03` `NTF-05` · `AV-04`

---

## 8. TBD

_Tidak ada titik terbuka._

| ID | Ditutup | Keputusan |
|---|---|---|
| **TBD-FE-B** | 22 Agustus 2026 | **Mode gelap di luar lingkup rilis ini** — satu set token warna saja (`UXD-12`, [`DESIGN-SYSTEM.md §8`](../DESIGN/DESIGN-SYSTEM.md)). Konsekuensi: validasi kontras di CI (§4.6) punya satu sasaran, bukan dua. |
