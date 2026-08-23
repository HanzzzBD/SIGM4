# SDD-03 — Desain Otorisasi

**Area:** `AUTH` · **Status:** Draft untuk review · **Basis:** [`../00-foundation/roles-permissions.md`](../PRD/00-foundation/roles-permissions.md)

---

## 1. Konteks

| Kelompok | ID |
|---|---|
| Penegakan otorisasi | `NFR-S-05`, `PM-01` … `PM-06` |
| Aturan akses data | `BR-066`, `BR-069`, `BR-073`, `BR-074` |
| Otorisasi chatbot | `BR-075`, `BR-076`, `DP-AI-02`, `DP-AI-03` |
| Autentikasi & sesi | `FR-01.1`, `FR-01.2`, `FR-01.5`, `FR-01.6`, `NFR-S-03`, `NFR-S-03a` |
| Kerahasiaan data | `DP-03`, `DP-05`, `FR-04.2 A1` |
| Pengujian wajib | `ST-05`, `SEC-T-01`, `SEC-T-02` |
| Risiko yang dimitigasi | `RS-10`, `RS-12` |

Otorisasi punya **dua sumbu** yang harus dibedakan sejak awal:

| Sumbu | Pertanyaan | Ditegakkan di |
|---|---|---|
| **Permission** | Boleh melakukan aksi ini? | Middleware route |
| **Scope** | Boleh melihat baris yang mana? | Lapisan repository |

Kegagalan memisahkan keduanya adalah penyebab paling umum kebocoran lintas hak akses — `RS-10` dan `RS-12` keduanya berakar di sini.

---

## 2. Keputusan Desain

| ID | Keputusan |
|---|---|
| **SDD-AUTH-01** | Permission dideklarasikan **per route** sebagai metadata, bukan diperiksa di dalam controller. Route tanpa deklarasi **gagal saat startup**, bukan diam-diam terbuka. |
| **SDD-AUTH-02** | Scope ditegakkan di **repository**, melalui parameter `AuthContext` yang **wajib** ada pada setiap metode kueri. Tidak ada nilai bawaan. |
| **SDD-AUTH-03** | Scope **tidak** memakai PostgreSQL Row-Level Security. Ditegakkan di lapisan aplikasi. Alasan pada §3. |
| **SDD-AUTH-04** | Permission efektif pengguna di-*cache* di Redis dengan TTL **60 detik** (`PM-05`), berkunci `perm:{user_id}:{role_version}`. Perubahan matriks menaikkan `role_version` sehingga cache batal seketika. |
| **SDD-AUTH-05** | `GET /me` adalah **satu-satunya** sumber bagi klien untuk merender menu dan kartu dashboard (`PM-04`). Klien tidak pernah menyimpulkan hak akses dari role. |
| **SDD-AUTH-06** | Penyaringan **field** (mis. `nilai_perolehan`) dilakukan oleh *serializer* ber-*allow-list* per permission, bukan dengan menghapus properti setelah kueri. |
| **SDD-AUTH-07** | Tool chatbot **tidak** punya jalur data sendiri. Ia memanggil repository yang sama dengan `AuthContext` pengguna penanya (`BR-076`). |
| **SDD-AUTH-08** | Ketiadaan hak akses terhadap objek yang ada dan objek yang tidak ada menghasilkan **respons yang sama**: `403` tanpa membocorkan keberadaan data (17.5 poin 3). |
| **SDD-AUTH-09** | Gerbang sesi dijalankan berurutan sebagai middleware: `authenticate` → `mustChangePassword` → `twoFactorVerified` → `permission` → `scope`. Urutan ini tetap dan diuji. |
| **SDD-AUTH-10** | Permission inti bertanda 🔒 (Lampiran C) ditolak pencabutannya oleh **validator domain**, bukan hanya oleh UI (`FR-02.2 A1`). |

---

## 3. Alasan

**SDD-AUTH-01 — deklaratif, gagal saat startup.** `PM-01` mewajibkan tiap endpoint memetakan tepat satu permission. Bila pemeriksaan ditulis manual di controller, endpoint baru yang lupa diberi pemeriksaan akan **terbuka** dan tidak ada yang tahu sampai pentest. Dengan deklarasi wajib pada definisi route, aplikasi menolak berjalan bila ada route tanpa permission — kelalaian menjadi mustahil, bukan sekadar tidak disarankan.

**SDD-AUTH-02 — `AuthContext` wajib, bukan opsional.** Bila parameter scope bersifat opsional, suatu hari akan ada pemanggil yang lupa mengirimnya dan kueri mengembalikan seluruh baris. Menjadikannya parameter wajib memindahkan kesalahan itu ke waktu kompilasi/uji, bukan ke produksi.

**SDD-AUTH-03 — menolak Row-Level Security.** RLS terlihat menggoda karena menegakkan scope di lapisan terdalam. Ditolak dengan tiga alasan:

1. **Connection pooling.** Aplikasi memakai satu akun basis data dengan pool bersama (`INF-04`, `SEC-CFG-03`). RLS memerlukan identitas per-sesi (`SET LOCAL`), yang harus disetel dan dibersihkan pada setiap peminjaman koneksi. Satu kebocoran `SET LOCAL` = satu permintaan berjalan dengan identitas pengguna sebelumnya. Risikonya justru lebih besar daripada yang dihilangkan.
2. **Scope di sini bukan sekadar per-baris.** `BR-073` juga membatasi **field** (nilai perolehan, biaya) dan `FR-04.2 A1` membatasi **subset katalog**. RLS tidak menyelesaikan keduanya, sehingga lapisan aplikasi tetap diperlukan — hasilnya dua tempat penegakan, bukan satu.
3. **Keterujian.** `ST-05` menuntut matriks uji endpoint × 7 role. Menguji scope aplikasi cukup dengan uji integrasi biasa; menguji RLS memerlukan penyiapan peran basis data per kasus uji.

Konsekuensinya diterima secara eksplisit: **akses langsung ke basis data melewati aplikasi tidak terlindungi scope.** Itu dimitigasi oleh `DP-11` (akses produksi bersifat break-glass dan tercatat), bukan oleh RLS.

**SDD-AUTH-06 — allow-list, bukan penghapusan properti.** Menghapus field setelah kueri berarti data sensitif sempat berada di memori proses dan berpotensi masuk log atau pesan galat. Allow-list memastikan field yang tidak diizinkan tidak pernah ikut ter-*select*, sejalan dengan `NFR-S-10` dan `DP-03`.

**SDD-AUTH-07 — chatbot memakai repository yang sama.** Ini penerapan langsung `BR-076`. Bila tool AI punya kueri sendiri, ia menjadi jalur kedua yang harus diaudit terpisah — dan `RS-10` menyatakan kebocoran lewat chatbot berdampak tinggi. Dengan memakai repository yang sama, setiap perbaikan scope otomatis berlaku untuk chatbot.

---

## 4. Rancangan

### 4.1 Deklarasi route

```ts
router.get('/assets/:id',
  authorize('asset.view'),            // wajib; ketiadaannya = gagal startup
  AssetController.show);

router.post('/material-requests/:id/issue',
  authorize('material.issue'),        // bukan material.request — lihat 4.3
  MaterialRequestController.issue);

// Pemeriksaan saat bootstrap
for (const route of router.stack) {
  if (!route.meta?.permission && !route.meta?.public) {
    throw new Error(`Route ${route.method} ${route.path} tanpa deklarasi permission (PM-01)`);
  }
}
```

Endpoint publik (`/auth/login`, `/auth/password/forgot`, `/public/assets/:uuid`) menandai dirinya `public: true` secara eksplisit — sehingga daftar endpoint tanpa autentikasi dapat di-*review* sebagai satu daftar pendek.

### 4.2 `AuthContext`

```ts
type Scope = 'all' | 'own' | 'assigned' | 'restricted';

interface AuthContext {
  userId: number;
  roleCode: string;
  permissions: ReadonlySet<string>;
  scopeOf(permission: string): Scope;
  can(permission: string): boolean;
}
```

Repository:

```ts
// Parameter ctx WAJIB. Tidak ada overload tanpa ctx.
findLoans(ctx: AuthContext, filter: LoanFilter): Promise<Loan[]>
```

Penerapan scope di dalam repository:

```ts
switch (ctx.scopeOf('loan.view')) {
  case 'all':      break;                                  // tanpa tambahan
  case 'own':      qb.where('loans.peminjam_id', ctx.userId); break;   // BR-074
  case 'assigned': qb.where('work_orders.teknisi_id', ctx.userId); break;
  case 'restricted': qb.where('assets.boleh_dipinjam_siswa', true); break; // BR-073
}
```

### 4.3 Penyaringan field

```ts
const ASSET_FIELDS = {
  base: ['id', 'uuid', 'kode_barang', 'nama', 'category_id', 'merek',
         'model', 'room_id', 'kondisi', 'status'],
  financial: ['nilai_perolehan', 'sumber_perolehan'],     // BR-073
};

function assetColumns(ctx: AuthContext): string[] {
  return ctx.can('asset.view_financial')
    ? [...ASSET_FIELDS.base, ...ASSET_FIELDS.financial]
    : ASSET_FIELDS.base;                                   // tidak pernah ter-SELECT
}
```

`SEC-T-02` menguji bahwa respons untuk role Siswa/OSIS tidak pernah memuat field finansial, diperiksa di sisi server — bukan hanya disembunyikan klien.

**Domain Bahan tidak memiliki field finansial.** `materials` tidak menyimpan nilai perolehan — harga hanya ada pada `procurement_items` yang sudah dijaga `procurement.view`. Karena itu `material.view` tidak berpasangan dengan varian `view_financial`, dan tidak ada penyaringan field di domain ini:

```ts
const MATERIAL_FIELDS = {
  base: ['id', 'uuid', 'nama', 'material_category_id', 'satuan_id',
         'stok_minimum', 'status'],                        // seluruhnya non-sensitif
};
```

Yang tetap dijaga adalah **scope baris** pada permintaan bahan: pemohon hanya melihat permintaannya sendiri kecuali memiliki scope `all`.

```ts
switch (ctx.scopeOf('material.view')) {
  case 'all': break;                                              // Admin, Petugas, Pimpinan
  case 'own': qb.where('material_requests.pemohon_id', ctx.userId); break;
}
```

Perlu diperhatikan: `material.view` menjaga **saldo dan kartu stok**, sedangkan pengeluaran dijaga `material.issue` yang terpisah. Seorang Guru dapat melihat saldo dan mengajukan permintaan, tetapi tidak pernah dapat menyerahkan bahan kepada dirinya sendiri — pemisahan ini yang membuat `BR-089` bermakna.

### 4.4 Urutan middleware (`SDD-AUTH-09`)

```
1. authenticate          -> 401 UNAUTHENTICATED / TOKEN_EXPIRED
2. mustChangePassword    -> 403, hanya /auth/password/change & /me yang lolos   (FR-01.3)
3. twoFactorVerified     -> 401, bila role wajib 2FA & sesi belum terverifikasi (BR-070)
4. permission            -> 403 INSUFFICIENT_PERMISSION                          (PM-02)
5. rateLimit(kelas)      -> 429                                                  (NFR-S-07)
6. controller -> service -> repository(ctx)   -> scope                           (PM-03)
```

Gerbang 2 dan 3 mendahului pemeriksaan permission agar pengguna berstatus `must_change_password` tidak dapat menyentuh endpoint apa pun meski permission-nya mencukupi (`FR-01.1 A4`).

### 4.5 Cache permission

```
kunci  : perm:{user_id}:{role_version}
isi    : { permissions: string[], scopes: Record<string, Scope> }
TTL    : 60 detik                                   (PM-05)
batal  : role_version dinaikkan saat PUT /roles/{id}/permissions
         atau saat role/status pengguna berubah
```

Karena kunci memuat `role_version`, perubahan matriks membuat kunci lama tidak pernah terbaca lagi — tidak perlu penghapusan kunci per pengguna.

### 4.6 Otorisasi tool chatbot

```
ChatToolExecutor(userCtx):
   tools = READ_ONLY_TOOLS                       // tidak ada tool tulis sama sekali (BR-075)
   execute(tool, args):
       result = repository[tool.method](userCtx, args)   // AuthContext yang sama (BR-076)
       return serializeWithAllowList(result, userCtx)    // DP-AI-02
```

Model tidak pernah menerima `AuthContext`, tidak pernah menerima kredensial, dan tidak pernah memilih scope. `DP-AI-01` dipenuhi karena nama pengguna tidak ikut dikirim.

### 4.7 Penegakan permission inti

```ts
const CORE_PERMISSIONS = new Set([
  'user.create', 'user.update', 'user.reset_password', 'user.reset_2fa',
  'role.update', 'approval_rule.manage', 'asset.qr_regenerate',
  'disposal.reinstate', 'activity_log.view', 'activity_log.export', 'setting.manage',
]);   // bertanda 🔒 pada Lampiran C

// FR-02.2 A1 — ditolak di domain, bukan di UI
if (role.isAdministrator && removed.some(p => CORE_PERMISSIONS.has(p))) {
  throw new DomainError('CORE_PERMISSION_LOCKED');
}
```

---

## 5. Konsekuensi

- **Modul terdampak:** seluruhnya. Tidak ada modul yang boleh mengakses basis data tanpa `AuthContext`.
- **Batasan yang lahir:** pekerjaan terjadwal dan perintah CLI tidak punya pengguna. Keduanya memakai `SystemAuthContext` khusus berscope `all` yang **hanya** dapat dibentuk dari luar siklus permintaan HTTP, dan setiap pemakaiannya tercatat sebagai pelaku `SYSTEM` (`AL-06`).
- **Beban pengujian:** `SEC-T-01` menuntut matriks endpoint × 7 role. Dengan deklarasi permission per route, matriks ini dapat **digenerate** dari tabel route, bukan ditulis tangan.
- **Konsekuensi yang diterima:** akses langsung ke PostgreSQL melewati aplikasi tidak tunduk scope (§3). Mitigasinya prosedural (`DP-11`), bukan teknis.

---

## 6. Risiko Teknis

| Risiko | Dampak | Mitigasi |
|---|---|---|
| Repository baru dibuat tanpa `AuthContext` | Kebocoran lintas hak akses | Parameter wajib pada tipe; uji arsitektur menolak metode repository tanpa `ctx` |
| Cache permission basi setelah perubahan role | Pengguna memakai hak lama ≤60 detik | `role_version` pada kunci membatalkan seketika, bukan menunggu TTL |
| Serializer lupa menyaring field baru | Data finansial bocor | Allow-list bersifat *opt-in*: field baru tidak muncul sampai sengaja didaftarkan |
| `SystemAuthContext` dipakai di jalur HTTP | Bypass otorisasi | Pembentukannya dibatasi modul worker; uji arsitektur melarang impornya dari lapisan HTTP |
| Tool chatbot ditambah tanpa lewat repository | `BR-076` dilanggar | Registry tool hanya menerima metode repository; ditegakkan oleh tipe |
| Respons 403 vs 404 tidak konsisten | Membocorkan keberadaan data | Error mapper terpusat; diuji `SEC-T-01` |

---

## 7. Requirement Terkait

`PM-01` … `PM-06` · `BR-066` `BR-069` `BR-070` `BR-073` `BR-074` `BR-075` `BR-076` ·
`FR-01.1` `FR-01.2` `FR-01.4` `FR-01.5` `FR-01.6` `FR-02.1` `FR-02.2` `FR-04.2` `FR-19.1` ·
`NFR-S-03` `NFR-S-05` `NFR-S-07` `NFR-S-10` `NFR-S-14` `NFR-S-15` ·
`DP-03` `DP-05` `DP-11` `DP-AI-01` `DP-AI-02` `DP-AI-03` ·
`ST-05` `ST-06` `SEC-T-01` `SEC-T-02` · `RS-10` `RS-12` · `PO-08`

---

## 8. TBD — Menunggu Keputusan

| ID | Pertanyaan |
|---|---|
| **TBD-AUTH-B** | Rotasi kunci penanda tangan JWT setiap 6 bulan (`SEC-CFG-02`) memerlukan masa tumpang tindih dua kunci. Panjang masa tumpang tindih dan mekanisme distribusinya belum ditetapkan. |
| **TBD-AUTH-C** | `role_version` (SDD-AUTH-04) adalah mekanisme baru yang tidak disebut PRD. Perlu konfirmasi bahwa penambahan kolom teknis semacam ini dapat diputuskan pada tingkat SDD tanpa dianggap perubahan requirement. |
