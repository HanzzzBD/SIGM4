# SDD-06 — Desain API

**Area:** `API` · **Status:** Draft · **Basis:** [`api-conventions.md`](../PRD/03-architecture/api-conventions.md), [`api-index.md`](../PRD/_generated/api-index.md)

---

## 1. Konteks

| Kelompok | ID |
|---|---|
| Konvensi & kontrak | Bab 17.1 – 17.3, 17.5 |
| Daftar endpoint | 119 endpoint, dimiliki modul masing-masing (bagian 7) |
| Otorisasi | `PM-01` … `PM-04`, `NFR-S-05` |
| Idempotensi | `ID-01` … `ID-05` |
| Performa | `NFR-P-01`, `NFR-P-02` |
| Dokumentasi | `NFR-M-05` |
| Kompatibilitas | `NFR-C-09`, `MOB-VER-01` … `MOB-VER-05` |

---

## 2. Keputusan Desain

| ID | Keputusan |
|---|---|
| **SDD-API-01** | Skema validasi ditulis **sekali** sebagai skema runtime (Zod atau setara) lalu diturunkan menjadi tipe statis **dan** OpenAPI. Tidak ada tiga definisi terpisah. |
| **SDD-API-02** | OpenAPI **digenerate dari kode**, bukan ditulis tangan. Ini satu-satunya cara `NFR-M-05` ("selalu tersinkron") dapat dipenuhi. |
| **SDD-API-03** | Setiap route mendeklarasikan: permission, skema masukan, skema keluaran, kelas rate limit, dan apakah memerlukan `Idempotency-Key`. Kelalaian mendeklarasikan permission = gagal saat startup (`SDD-AUTH-01`). |
| **SDD-API-04** | Controller **tidak** menangani galat. Seluruh galat dilempar sebagai `DomainError` bertipe dan diterjemahkan `ErrorMapper` terpusat ke kode Bab 17.3. |
| **SDD-API-05** | Paginasi memakai **offset** (`page`/`per_page`) sesuai Bab 17.1, bukan cursor. |
| **SDD-API-06** | Parsing `filter[...]` dan `sort` dilakukan *parser* bersama yang hanya menerima field ber-*allow-list* per endpoint. |
| **SDD-API-07** | Serialisasi keluaran melewati *presenter* per entitas yang menerima `AuthContext`, sehingga penyaringan field (`SDD-AUTH-06`) terjadi di satu tempat. |
| **SDD-API-08** | Versi API di path (`/api/v1`). Perubahan tak kompatibel memerlukan `/api/v2`; penambahan field bersifat kompatibel dan tidak menaikkan versi. |
| **SDD-API-09** | Header `X-App-Version` diperiksa *middleware* dan menghasilkan `426 UPGRADE_REQUIRED` bila di bawah versi minimum (`MOB-VER-02`). |
| **SDD-API-10** | Endpoint yang mengembalikan berkas **tidak pernah** menyalurkan byte melalui API; selalu mengembalikan URL bertanda tangan (lihat [SDD-09](09-file-storage-design.md)). |
| **SDD-API-11** | Pustaka skema runtime yang dimaksud `SDD-API-01` adalah **Zod**. Skema Zod adalah satu-satunya definisi; tipe statis dan OpenAPI diturunkan darinya. |
| **SDD-API-12** | `/api/docs` **tetap tidak diaktifkan di produksi** (Bab 17.1); ia tersedia di development dan staging. Sebagai gantinya `openapi.json` diterbitkan pipeline sebagai **artefak rilis bertanda versi**. Pencabutan larangan ini menuntut perubahan Bab 17.1 lebih dulu — bukan wewenang SDD. |
| **SDD-API-13** | Pembangkit OpenAPI yang dimaksud `SDD-API-02` adalah **`zod-openapi`**, dipakai lewat **registri route yang sudah ada** (§4.1, dipindai saat *bootstrap*). Registri itu tetap satu-satunya daftar route: OpenAPI **dan** matriks uji otorisasi `SEC-T-01` sama-sama diturunkan darinya. Tidak ada registri kedua yang mendaftarkan route untuk keperluan dokumentasi. |

---

## 3. Alasan

**SDD-API-13 — satu registri, dua keluaran.** `SDD-API-11 §3` menjadikan "generator OpenAPI paling matang" sebagai alasan memilih Zod tetapi tidak menyebut generatornya, sehingga penopang `NFR-M-05` menggantung pada perkakas yang belum ada namanya.

Yang menentukan pilihan bukan kelengkapan fitur melainkan bentuk integrasinya. §4.1 sudah menetapkan registri route yang dipindai saat *bootstrap*, dan registri itu sudah memikul dua kewajiban: memvalidasi bahwa setiap route mendeklarasikan permission-nya (`PM-01`) dan membangun matriks uji otorisasi (`SEC-T-01`). **`@asteasolutions/zod-to-openapi`** ditolak karena bekerja lewat `OpenAPIRegistry` miliknya sendiri — route lalu terdaftar di dua tempat, dan dua daftar atas objek yang sama adalah persis bentuk yang `SDD-API-02` ada untuk menghapusnya. **`z.toJSONSchema` bawaan Zod** cukup untuk skemanya tetapi menyisakan path, method, parameter, dan respons sebagai perekat OpenAPI 3.1 milik kita sendiri — infrastruktur tanpa kandungan domain, pada bagian yang `NFR-M-05` justru tuntut tidak rapuh.

`zod-openapi` memperkaya skema Zod di tempatnya berada dan merakit dokumen dari daftar yang kita berikan, sehingga registri §4.1 tetap menjadi satu-satunya sumber. Konsekuensinya sengaja: route yang lupa didaftarkan tidak menghasilkan dokumentasi yang salah — ia menggagalkan *bootstrap*, karena daftar yang sama juga yang menegakkan `PM-01`.

**SDD-API-01/02 — satu sumber skema.** Menulis validasi, tipe TypeScript, dan OpenAPI secara terpisah menjamin ketiganya menyimpang dalam hitungan minggu. `NFR-M-05` menuntut dokumentasi API selalu sinkron dengan implementasi — itu hanya realistis bila dokumentasi diturunkan dari kode yang benar-benar dieksekusi saat memvalidasi permintaan.

**SDD-API-04 — galat terpusat.** Bab 17.3 mendefinisikan katalog kode galat yang tetap. Bila tiap controller memetakan galatnya sendiri, akan muncul respons yang tidak sesuai katalog dan pesan yang membocorkan detail internal — persis yang dilarang `NFR-R-10`. Satu mapper juga membuat pemetaan `SQLSTATE 23P01 → 409` (`CI-04`) berlaku otomatis di seluruh endpoint.

**SDD-API-05 — offset, bukan cursor.** Cursor lebih unggul pada dataset besar, tetapi Bab 17.1 sudah menetapkan kontrak `page`/`per_page` dan UI menuntut nomor halaman serta total (`meta.total_pages`). Pada volume target (≤5.000 aset, ≤150.000 log per tahun) offset dengan indeks yang tepat memenuhi `NFR-P-01`. Mengubahnya akan mengubah kontrak PRD tanpa manfaat nyata.

**SDD-API-06 — allow-list filter.** Meneruskan nama field dari klien langsung ke kueri adalah jalur pintas menuju kebocoran data dan injeksi. Allow-list per endpoint juga membuat OpenAPI dapat mendokumentasikan filter yang tersedia.

**SDD-API-07 — presenter menerima `AuthContext`.** Tanpa ini, penyaringan field finansial (`BR-073`) akan tersebar di banyak controller dan suatu saat terlewat pada endpoint baru. `SEC-T-02` menguji tepat kasus ini.

**SDD-API-11 — Zod.** Tiga kandidat memenuhi `SDD-API-01`; yang membedakannya adalah batasan lain yang sudah mengikat.

Kriteria pertama adalah pembangkitan OpenAPI, karena `SDD-API-02` menjadikannya satu-satunya cara `NFR-M-05` ("selalu tersinkron") dapat dipenuhi — ia penopang requirement, bukan kenyamanan. **Valibot** paling ringan dan *tree-shakeable*, nilai nyata bagi `NFR-P-03` dan `MOB-PERF-05`, tetapi jalurnya ke OpenAPI lebih muda dan menuntut perekat yang kita tulis dan pelihara sendiri — tepat pada bagian yang paling tidak boleh rapuh. **TypeBox** justru paling dekat dengan cita-cita `SDD-API-02` karena skemanya *adalah* JSON Schema dan validasi Ajv-nya tercepat; ia tersandung di tempat lain: transform dan aturan lintas-field yang dituntut §4.3 (angka uang sebagai string desimal) lebih canggung, dan sisi form frontend lebih miskin dukungan — yang penting karena `SDD-FE-05` menjadikan skema yang sama dipakai form.

Zod dipilih karena ketiga batasan itu menunjuk ke arah yang sama: generator OpenAPI paling matang, koersi parameter path/query yang §4.1 sudah asumsikan (`z.coerce`), dan dukungan resolver form terluas untuk paket bersama `SDD-FE-05`/`SDD-MOB-01`. Ukuran bundel adalah satu-satunya kerugiannya, dan ia kerugian yang terukur — lihat §5.

**SDD-API-12 — `/api/docs` tetap dilarang di produksi.** Pertanyaannya bukan apakah proteksi autentikasi cukup aman, melainkan siapa yang berwenang menjawabnya. Bab 17.1 adalah teks **PRD**, dan [README SDD](README.md) menetapkan PRD berlaku di atas SDD; mengaktifkan `/api/docs` di produksi karena itu bukan pilihan teknis melainkan perubahan requirement.

Alasan larangannya juga masih berdiri sendiri. `NFR-M-05` menuntut dokumentasi **tersinkron**, bukan **terhosting di produksi** — dan sinkronisasi sudah dijamin `SDD-API-02` (digenerate dari kode yang benar-benar dieksekusi saat memvalidasi permintaan), sehingga menyajikannya di produksi tidak menambah kepatuhan apa pun. Di sisi lain, menerbitkan katalog 119 endpoint beserta skemanya bergerak berlawanan dengan `SDD-AUTH-08` dan 17.5 poin 3, dan gerbang autentikasinya sendiri menjadi route baru yang wajib masuk matriks `SEC-T-01` serta lingkup DAST `ST-03`.

Yang ditambahkan keputusan ini adalah penutup celah praktisnya: `openapi.json` per tag rilis diterbitkan sebagai artefak pipeline. Tanpa itu, kebutuhan nyata membandingkan kontrak antar-versi (`MOB-VER-05`, `NFR-C-09`) tidak punya jalur resmi — dan kebutuhan yang tidak punya jalur resmi pada akhirnya membuat orang mengaktifkan `/api/docs` di produksi.

---

## 4. Rancangan

### 4.1 Bentuk deklarasi route

```ts
export const showAsset = defineRoute({
  method: 'GET',
  path: '/assets/:id',
  permission: 'asset.view',                 // PM-01 — wajib
  rateLimitClass: 'default',                // NFR-S-07
  params: z.object({ id: z.coerce.number().int().positive() }),
  response: AssetDetailSchema,
  handler: async (ctx, { params }) =>
    AssetPresenter.detail(await assetService.findById(ctx.auth, params.id), ctx.auth),
});
```

Registri route dipindai saat *bootstrap* untuk: memvalidasi kelengkapan deklarasi, membangun OpenAPI, dan membangun matriks uji otorisasi (`SEC-T-01`).

### 4.2 Susunan middleware

```
requestId → logger → cors → helmet(header keamanan NFR-S-11)
   → appVersionGate (426)                       MOB-VER-02
   → authenticate (401)
   → mustChangePassword (403)                   FR-01.1 A4
   → twoFactorVerified (401)                    BR-070
   → permission (403)                           PM-02
   → rateLimit(kelas) (429)                     NFR-S-07
   → idempotency (409) — bila route menuntutnya ID-01
   → validate(params, query, body) (400/422)
   → handler
   → presenter(AuthContext)
   → errorMapper
```

Urutan ini tetap dan diuji; menyisipkan sesuatu di tengahnya memerlukan pembaruan berkas ini.

### 4.3 Kontrak respons

Bentuk amplop sudah ditetapkan Bab 17.2 dan tidak diulang di sini. Yang ditetapkan rancangan:

| Aspek | Ketentuan |
|---|---|
| `meta` | Hanya diisi pada daftar terpaginasi; `null` selain itu |
| `X-Request-Id` | Selalu disertakan; sama dengan `request_id` pada galat |
| `X-RateLimit-*` | Selalu disertakan (`NFR-S-07`) |
| Kompresi | gzip/brotli oleh reverse proxy, bukan aplikasi |
| Tanggal | ISO 8601 UTC (`Z`), konversi ke WIB di klien (`NFR-C-10`) |
| Angka uang | String desimal, bukan float, agar presisi tidak hilang di JSON |

### 4.4 Pemetaan galat

```ts
const MAP: Array<[matcher, httpStatus, code]> = [
  [isZodError,                     400, 'INVALID_REQUEST'],
  [isDomainError('BORROWER_BLOCKED'), 422, 'BORROWER_BLOCKED'],
  [isDomainError('DURATION_EXCEEDED'),422, 'DURATION_EXCEEDED'],
  [isPgError('23P01'),             409, 'RESERVATION_CONFLICT'],   // CI-04
  [isPgError('23505'),             409, 'DUPLICATE_CODE'],
  [isDomainError('APPROVAL_ALREADY_DECIDED'), 409, 'APPROVAL_ALREADY_DECIDED'],
  [isDomainError('INVALID_RULE_DEFINITION'),  422, 'INVALID_RULE_DEFINITION'],
  [isDomainError('INSUFFICIENT_BALANCE'),     422, 'INSUFFICIENT_BALANCE'],   // BR-083
  [isDomainError('EXCEEDS_APPROVED_QTY'),     422, 'EXCEEDS_APPROVED_QTY'],   // BR-089
  [isPgError('23514'),                        422, 'INSUFFICIENT_BALANCE'],   // CHECK saldo >= 0
  [isAuthError,                    401, 'UNAUTHENTICATED'],
  [isForbidden,                    403, 'FORBIDDEN'],
  [isNotFound,                     404, 'NOT_FOUND'],
  [isLlmUnavailable,               503, 'LLM_UNAVAILABLE'],
  // fallback
  [always,                         500, 'INTERNAL_ERROR'],
];
```

Galat 500 **tidak pernah** menyertakan pesan asli ke klien (`NFR-R-10`); pesan asli hanya masuk log terstruktur bersama `request_id`.

Pemetaan `23P01 → RESERVATION_CONFLICT` disesuaikan menjadi `ASSET_NOT_AVAILABLE` bila `resource_type = 'asset'`, berdasarkan nama constraint yang dilanggar.

`23514` (pelanggaran CHECK) dipetakan ke `INSUFFICIENT_BALANCE` karena satu-satunya CHECK yang dapat dilanggar dari jalur permintaan pengguna adalah `material_balances_non_negatif`. Constraint itu adalah jaring terakhir `SDD-DB-14` — bila ia yang menolak, artinya ada jalur kode yang lupa mengunci baris, sehingga kejadiannya **wajib memicu alarm**, bukan sekadar dikembalikan sebagai galat biasa.

### 4.5 Paginasi & filter

```
GET /assets?page=2&per_page=50
            &filter[status]=TERSEDIA&filter[category_id]=7
            &sort=-created_at
```

| Aturan | Nilai |
|---|---|
| `per_page` bawaan / maksimum | 25 / 100 (Bab 17.1) |
| Pengecualian | `GET /audit-sessions/{id}/items` maksimum 500 (`MOB-PERF-02`) |
| `sort` | Awalan `-` = menurun; hanya field ber-allow-list |
| Filter tak dikenal | `400 INVALID_REQUEST`, bukan diabaikan diam-diam |
| `total` | Dihitung `COUNT(*) OVER ()` dalam kueri yang sama, bukan kueri kedua |
| Pengecualian | `GET /materials/{id}/transactions` (kartu stok) maksimum 200 — dibaca berurutan waktu, jarang ditelusuri melampaui satu layar |

### 4.6 Struktur berkas per modul

```
mXX-nama/
├── routes.ts            # defineRoute[] — satu-satunya tempat permission dideklarasikan
├── controllers/         # tipis: orkestrasi, tanpa logika bisnis
├── services/            # logika bisnis + batas transaksi
├── repositories/        # kueri; WAJIB menerima AuthContext (PM-03)
├── schemas/             # Zod: request & response (SDD-API-01)
└── presenters/          # serialisasi + penyaringan field (SDD-API-07)
```

---

## 5. Konsekuensi

- Setiap endpoint baru memerlukan skema Zod; tidak ada jalur "cepat" tanpa validasi.
- OpenAPI menjadi artefak *build*, bukan berkas yang disunting. Dokumentasi di `/api/docs` dibatasi lingkungan non-produksi (Bab 17.1).
- Matriks uji otorisasi (`SEC-T-01`) dapat digenerate dari registri route — jumlah uji tumbuh otomatis mengikuti jumlah endpoint.
- Karena presenter menerima `AuthContext`, seluruh respons wajib melewatinya; mengembalikan objek repository mentah menjadi pelanggaran yang terdeteksi review.
- Zod (`SDD-API-11`) adalah yang terbesar di antara tiga kandidat, dan ia ikut ke klien lewat paket skema bersama (`SDD-FE-05`, `SDD-MOB-01`) sehingga menyentuh `NFR-P-03` dan `MOB-PERF-05`. Kerugian ini diterima secara sadar, dimitigasi oleh dua hal yang sudah diputuskan: paket bersama berisi **skema saja**, dan web memecah bundel per route ([SDD-11 §4.7](11-frontend-architecture.md)). Bila pengukuran nyata menunjukkan angkanya terlampaui, yang ditinjau ulang adalah isi paket bersama lebih dulu, bukan pustakanya.
- `openapi.json` per tag rilis menjadi artefak pipeline (`SDD-API-12`) — satu langkah tambahan pada [SDD-16 §4.3](16-infrastructure-deployment.md), dan satu-satunya jalur resmi bagi klien mobile membandingkan kontrak antar-versi (`MOB-VER-05`, `NFR-C-09`).

---

## 6. Risiko Teknis

| Risiko | Dampak | Mitigasi |
|---|---|---|
| Offset paginasi melambat pada halaman jauh | Latensi naik pada log berukuran besar | Indeks penunjang; UI membatasi lompatan halaman; volume target masih aman |
| `COUNT(*) OVER ()` mahal pada tabel besar | Latensi daftar naik | Untuk `activity_logs`, hitungan dibatasi (`FR-18.2 A1` sudah mengizinkan pembatasan tampilan) |
| Skema Zod dan tabel menyimpang | Galat runtime | Uji kontrak membandingkan skema respons dengan hasil kueri nyata |
| Endpoint baru lupa `Idempotency-Key` | Duplikasi transaksi | Daftar endpoint transaksional ditetapkan `ID-01`; uji memverifikasi middleware terpasang pada seluruhnya |
| Versi API v2 diperlukan lebih cepat dari dugaan | Beban pemeliharaan ganda | `NFR-C-09` menjamin dukungan 6 bulan; perubahan aditif tidak menaikkan versi |

---

## 7. Requirement Terkait

Bab 17.1 – 17.3, 17.5 · `PM-01` `PM-02` `PM-03` `PM-04` · `ID-01` … `ID-05` · `CI-04` ·
`NFR-P-01` `NFR-P-02` `NFR-M-05` `NFR-R-10` `NFR-S-05` `NFR-S-06` `NFR-S-07` `NFR-S-11` `NFR-C-09` `NFR-C-10` ·
`BR-073` · `MOB-VER-01` … `MOB-VER-05` · `MOB-PERF-02` · `SEC-T-01` `SEC-T-02`
