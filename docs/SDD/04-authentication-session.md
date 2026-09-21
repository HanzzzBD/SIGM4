# SDD-04 — Autentikasi & Sesi

**Area:** `SESS` · **Status:** Draft · **Basis:** [`m01-auth.md`](../PRD/02-modules/m01-auth.md), [`security.md`](../PRD/03-architecture/security.md)

---

## 1. Konteks

| Kelompok | ID |
|---|---|
| Alur autentikasi | `FR-01.1` … `FR-01.6` |
| Token & password | `NFR-S-02`, `NFR-S-03`, `NFR-S-03a`, `NFR-S-03b`, `NFR-S-07`, `NFR-S-09` |
| 2FA & pemulihan | `BR-070`, `BR-070a`, `BR-070b`, `BR-070c` |
| Notifikasi terkait | `NT-37`, `NT-38`, `NT-38a`, `NT-39`, `NT-39a` |
| Jejak audit | `AL-02`, aksi `LOGIN_*`, `TWO_FA_*`, `ADMIN_BREAK_GLASS_RECOVERY` |

Otorisasi (siapa boleh apa) berada di [SDD-03](03-authorization.md). Berkas ini hanya membahas **pembuktian identitas** dan **pengelolaan sesi**.

---

## 2. Keputusan Desain

| ID | Keputusan |
|---|---|
| **SDD-SESS-01** | Password di-*hash* dengan **Argon2id**, bukan bcrypt. Parameter awal: `m=19456 KiB, t=2, p=1`. |
| **SDD-SESS-02** | *Access token* JWT ditandatangani **EdDSA (Ed25519)**, bukan HS256, agar verifikasi tidak memerlukan rahasia yang sama dengan penerbitan. |
| **SDD-SESS-03** | *Refresh token* adalah **nilai acak buram** (32 byte), bukan JWT. Yang disimpan server adalah hash SHA-256-nya. |
| **SDD-SESS-04** | Rotasi refresh token memakai **rantai keluarga** (`family_id`). Pemakaian ulang token yang sudah dirotasi mencabut **seluruh keluarga** dan mencatat anomali (`NFR-S-03`). |
| **SDD-SESS-05** | Web menyimpan token di `httpOnly; Secure; SameSite=Strict` cookie; mobile di Keychain/Keystore (`NFR-S-09`). Klien web **tidak pernah** membaca token dari JavaScript. |
| **SDD-SESS-06** | Penghitung kegagalan login disimpan di **PostgreSQL**, bukan Redis. Penguncian akun adalah keputusan keamanan yang tidak boleh hilang saat cache di-*restart*. |
| **SDD-SESS-07** | Rate limit login diterapkan **dua sumbu** — per akun dan per IP — sesuai `NFR-S-07`, dengan penghitung IP di Redis (boleh hilang) dan penghitung akun di PostgreSQL (tidak boleh hilang). Kedua sumbu hanya menghitung **percobaan gagal** (keputusan pemilik produk, 15 September 2026). |
| **SDD-SESS-08** | Secret TOTP dan kode cadangan disimpan **terenkripsi** dengan kunci aplikasi terpisah dari kunci JWT. Kode cadangan disimpan sebagai hash Argon2id (`BR-070c`). |
| **SDD-SESS-09** | Verifikasi 2FA menghasilkan **klaim terpisah** pada sesi (`amr: ["pwd","otp"]`), sehingga gerbang `twoFactorVerified` (SDD-AUTH-09) memeriksa klaim, bukan tabel. |
| **SDD-SESS-10** | *Challenge token* 2FA berumur **5 menit**, sekali pakai, dan tidak dapat dipakai sebagai access token. |
| **SDD-SESS-11** | Pemulihan darurat (`FR-01.6`) diimplementasikan sebagai **perintah CLI pada artefak worker**, tidak pernah terdaftar sebagai route HTTP. |
| **SDD-SESS-12** | Respons `/auth/login` **seragam**: email tak terdaftar, password salah, dan akun terkunci dijawab `401 UNAUTHENTICATED` yang identik (status, kode, pesan, tanpa `details`, tanpa `Retry-After`); `423 ACCOUNT_LOCKED` dan sisa waktu kunci tidak pernah dikirim endpoint ini. Argon2id dijalankan tepat sekali pada ketiga keadaan. Penguncian tetap berjalan dan dicatat secara internal (`LOGIN_FAILED`, `ACCOUNT_LOCKED`, event `AccountLocked`). Keputusan pemilik produk, 19 September 2026. |
| **SDD-SESS-13** | Reset password administratif (`FR-01.3`) tidak memakai token maupun kanal email: password sementara dibangkitkan server, ditampilkan **satu kali** pada respons penerbitan, dan hanya hash-nya yang menetap. Penerbitan mencabut **seluruh** sesi pemilik akun dan menghapus penguncian loginnya; kedaluwarsa 72 jam ditegakkan **saat login** dan saat daftar dibaca, tanpa pekerjaan terjadwal. Keputusan pemilik produk, 19 September 2026. |
| **SDD-SESS-14** | *Challenge token* 2FA adalah nilai **buram** 32 byte acak yang tersimpan di Redis (hanya SHA-256-nya), bukan JWT; kedaluwarsanya ditegakkan menurut `Clock`. Kode yang salah **tidak** menghabiskannya — kegagalan dibatasi penguncian akun yang sama dengan password (`SDD-SESS-06`); hanya kode yang benar yang menghabiskannya. Jawaban kegagalannya tetap `401` seragam (`SDD-AUTH-08`); hanya penguncian yang dijawab `423`. |
| **SDD-SESS-15** | Gerbang `twoFactorVerified` (`SDD-AUTH-09` gerbang 3) menjawab **`403 TWO_FACTOR_REQUIRED`**, bukan `401`: sesinya sah, faktor keduanya belum terbukti. Bawaannya tertutup — ditegakkan di `authenticated()` dan `authorize()` — dan hanya route yang menyatakan `twoFactorExempt` (pendaftaran 2FA dan logout) yang melewatinya. |
| **SDD-SESS-16** | Dua kolom yang tidak ada pada rancangan awal §4.1 ditambahkan (`PR-02-07`, migration `0024`; **`otp_verified` menunggu tinjauan arsitek**, opsi dan rekomendasi di logs/phase-02.md §7): `users.totp_last_step` — langkah TOTP terakhir yang diterima; tanpa itu satu kode berlaku berkali-kali di jendela ±1 langkah (RFC 6238 §5.2) — dan `refresh_tokens.otp_verified` — klaim `amr` harus bertahan ketika access token diterbitkan ulang lewat `/auth/refresh`, sedangkan refresh token tidak memuat klaim; kolom ini membawanya dan diwarisi setiap rotasi seperti `platform`. |
| **SDD-SESS-17** | **Kode aktivasi 2FA** (`BR-070d`, `BR-070e`): nilai acak 10 karakter (alfabet kode cadangan), disimpan sebagai hash Argon2id pada `totp_activation_codes` (`user_id`, `code_hash`, `issued_by`, `expires_at`, `failed_attempts`, `consumed_at`), satu baris aktif per akun (penerbitan baru menggantikan), berlaku 72 jam, hangus setelah 5 kesalahan — **tanpa** mengunci akun, karena penyerang yang tahu password akan memakai penguncian sebagai DoS. Diperiksa pada `enroll` (`422` seragam untuk salah/kedaluwarsa/hangus) dan dihabiskan pada `enroll/confirm` yang berhasil, yang sekaligus mencabut seluruh sesi lain (`revoke_reason = two_fa_enabled`, event `SessionRevoked` per sesi) dan menerbitkan event `TwoFactorEnabled` (`NT-39a`). Penerbit: `POST /users/{id}/2fa-activation-code` (M-02, `user.reset_2fa`) atau CLI pada artefak worker (`SDD-SESS-11`). *Bagian kode aktivasi: rancangan, belum diimplementasikan; pelaksana `PR-02-33` (tabel, `enroll`, endpoint penerbit, reset 2FA) dan `PR-02-08` (CLI). Bagian pencabutan sesi + `TwoFactorEnabled` sudah berjalan sejak `PR-02-07`.* |

---

## 3. Alasan

**SDD-SESS-01 — Argon2id.** `NFR-S-02` mengizinkan bcrypt (cost ≥12) **atau** Argon2id. Argon2id dipilih karena tahan terhadap serangan GPU dan ASIC yang menjadi model ancaman nyata bila basis data bocor, sementara bcrypt hanya *memory-hard* secara terbatas. Biaya CPU pada login tunggal tidak relevan di skala 150 concurrent.

**SDD-SESS-02 — EdDSA, bukan HS256.** Dengan HS256, setiap komponen yang memverifikasi token juga memegang kunci untuk menerbitkannya. Dengan Ed25519, worker dan layanan pendukung cukup memegang kunci publik. Ini juga membuat rotasi kunci (`SEC-CFG-02`) dapat dilakukan dengan menerbitkan kunci baru sambil tetap memverifikasi yang lama.

**SDD-SESS-03 — refresh token buram.** JWT sebagai refresh token berarti server harus tetap menyimpan daftar pencabutan — jadi keuntungan *stateless*-nya hilang, sementara ukurannya jauh lebih besar. Nilai acak buram lebih kecil, lebih cepat dicari, dan tidak membocorkan klaim apa pun bila tercuri.

**SDD-SESS-04 — rantai keluarga.** `NFR-S-03` menuntut *reuse detection*. Tanpa `family_id`, mendeteksi pemakaian ulang hanya bisa menandai satu token; dengan keluarga, seluruh rantai turunan dari token yang dicuri ikut mati. Ini pola standar dan satu-satunya yang benar-benar menutup pencurian token.

**SDD-SESS-06 — penghitung kegagalan di PostgreSQL.** Menyimpannya di Redis membuat penyerang dapat menghapus penguncian dengan memicu *restart* atau *eviction*. `FR-01.1 A2` memperlakukan penguncian sebagai kontrol keamanan, jadi ia harus tahan lama.

**SDD-SESS-11 — CLI di worker.** `FR-01.6` mensyaratkan prosedur ini tidak tersedia lewat web maupun API. Menempatkannya di worker berarti pelaksananya harus punya akses shell ke server — persis kontrol yang dimaksud `BR-070b`.

**SDD-SESS-03/04/06 — mengapa daftar refresh token tidak di Redis.** Media penyimpanannya sudah ditetapkan keputusan-keputusan di atas dan skema §4.1; yang belum tertulis adalah alternatif yang ditolak. Tiga media dipertimbangkan.

**Redis saja** ditolak karena bertabrakan dengan kriteria yang sudah diterima dua keputusan lain di berkas ini. `SDD-SESS-06` menempatkan penghitung kegagalan login di PostgreSQL dengan alasan "tidak boleh hilang saat cache di-*restart*", dan `SDD-SESS-07` mengeraskannya menjadi pembagian eksplisit: penghitung IP di Redis boleh hilang, penghitung akun di PostgreSQL tidak boleh. Daftar pencabutan refresh token berada di sisi yang sama dengan penghitung akun — *restart* atau *eviction* akan menghidupkan kembali keluarga token yang sudah dicabut, sehingga *reuse detection* yang dituntut `NFR-S-03` turun menjadi *best effort*. Karena instance Redis yang sama juga melayani cache, lock, dan rate limit (`INF-03`), kebijakan eviction harus dibedakan per kelas kunci agar itu tidak terjadi — kompleksitas yang lahir hanya dari pilihan medianya. Menerapkan standar ketahanan berbeda pada dua kontrol keamanan yang setara adalah inkonsistensi, bukan optimasi.

**Hibrida** (PostgreSQL sumber kebenaran + Redis sebagai cache pemeriksaan pencabutan) ditolak bukan karena salah, melainkan karena tidak dibayar manfaatnya: dengan access token 60 menit (§4.1), pembacaan yang hendak dipercepat terjadi paling banyak sekali per jam per klien. Yang ditambahkan hanya satu jalur invalidasi yang dapat basi.

**PostgreSQL dipilih** juga karena satu properti yang di sini gratis dan di Redis harus dibangun: `SDD-SESS-04` menuntut pemakaian ulang mencabut **seluruh** keluarga, dan §4.3 mencapainya dengan `SELECT … FOR UPDATE` diikuti `UPDATE … WHERE family_id = …` dalam satu transaksi. Padanan Redis-nya memerlukan skrip Lua, dan pencabutan massal saat akun dinonaktifkan (§4.6) kehilangan relasinya ke `users`. Biaya tulisnya — satu `UPDATE` dan satu `INSERT` per rotasi — tidak terasa pada skala 100–150 concurrent yang ditetapkan Keputusan #14.

**SDD-SESS-12 — respons login seragam.** Alur awal (§4.2 versi sebelumnya) menjawab `423` dengan sisa waktu bagi akun terkunci dan `401` bagi yang lain. Itu membuat `/auth/login` menjadi *oracle*: `423` membuktikan bahwa email tertentu terdaftar, tanpa perlu password yang benar. `FR-01.1 A1` sudah menuntut pesan yang tidak membocorkan keberadaan email, dan `A2` bertabrakan dengannya. Tiga jalan dipertimbangkan: (1) mempertahankan `423` — ditolak, karena membuka enumerasi; (2) penguncian bayangan di Redis bagi email tak terdaftar agar ia pun dijawab `423` — ditolak, karena menambah penghitung per-email di luar PostgreSQL yang bertentangan dengan `SDD-SESS-06` dan hanya memindahkan masalahnya; (3) menyeragamkan seluruhnya ke `401` — dipilih. Harganya diterima dengan sadar: pengguna sah yang terkunci melihat pesan yang sama dengan salah password, dan seseorang yang mengetahui email dapat mengunci akun itu selama 15 menit (§6). Penekannya ada pada penghitung IP (`SDD-SESS-07`), jejak audit, dan `NT-39`. Argon2id tetap dijalankan pada ketiga keadaan supaya waktu respons tidak menjadi *oracle* kedua.

**SDD-SESS-13 — reset administratif, bukan token.** Rencana implementasi awal menyebut "token sekali pakai", yang mengandaikan kanal email; `FR-01.3` justru menyatakan sistem tidak memakainya. Karena itu tidak ada tautan reset yang dapat dicuri dari kotak surat: kepemilikan akun dibuktikan lewat verifikasi identitas luring oleh Administrator, dan metodenya dicatat pada permintaan. Konsekuensi keamanannya dipilih sadar. *Sesi lama dicabut* karena pemegangnya mungkin bukan pemilik sah — alasan yang sama dengan pemulihan darurat (§4.5). *Kunci login dibuka* karena akun yang identitas pemiliknya baru diverifikasi tatap muka tidak boleh tetap terkunci oleh percobaan pihak lain. *Kedaluwarsa tanpa cron* karena pekerjaan terjadwal bergantung pada `SystemAuthContext` (`PR-02-32`) dan password sementara hanya berbahaya saat dipakai — yaitu saat login, tempat penegakannya berada.

---

## 4. Rancangan

### 4.1 Skema

```sql
-- Penambahan pada users (kolom lain sudah didefinisikan PRD)
ALTER TABLE users
  ADD COLUMN failed_login_count int NOT NULL DEFAULT 0,
  ADD COLUMN failed_login_window_start timestamptz,  -- awal jendela tetap 15 menit (§4.2); migration 0022
  ADD COLUMN locked_until       timestamptz,
  ADD COLUMN totp_secret_enc    bytea,        -- terenkripsi (SDD-SESS-08)
  ADD COLUMN totp_enabled_at    timestamptz,  -- NULL dengan secret terisi = pendaftaran belum dikonfirmasi
  ADD COLUMN totp_last_step     integer;      -- langkah TOTP terakhir yang diterima (SDD-SESS-16); migration 0024

CREATE TABLE refresh_tokens (
    id           bigserial PRIMARY KEY,
    user_id      bigint      NOT NULL REFERENCES users(id),
    family_id    uuid        NOT NULL,
    parent_id    bigint      REFERENCES refresh_tokens(id),  -- token yang ditukar menjadi baris ini (§4.3)
    token_hash   bytea       NOT NULL UNIQUE,   -- SHA-256 (SDD-SESS-03)
    platform     device_platform NOT NULL,      -- SDD-DB-02: WEB | ANDROID | IOS; diwarisi setiap rotasi
    ip           inet,                          -- saat terbit; bahan daftar perangkat (§4.6)
    user_agent   text,
    issued_at    timestamptz NOT NULL DEFAULT now(),
    expires_at   timestamptz NOT NULL,
    rotated_at   timestamptz,                   -- terisi saat ditukar
    revoked_at   timestamptz,
    revoke_reason text,
    otp_verified  boolean     NOT NULL DEFAULT false   -- amr memuat otp (SDD-SESS-09/16); diwarisi tiap rotasi
);
CREATE INDEX ON refresh_tokens (user_id) WHERE revoked_at IS NULL;
CREATE INDEX ON refresh_tokens (family_id);
CREATE INDEX ON refresh_tokens (expires_at);

CREATE TABLE totp_backup_codes (
    id         bigserial PRIMARY KEY,
    user_id    bigint NOT NULL REFERENCES users(id),
    code_hash  text   NOT NULL,                 -- Argon2id (BR-070c)
    created_at timestamptz NOT NULL DEFAULT now(),
    used_at    timestamptz
);
CREATE INDEX ON totp_backup_codes (user_id) WHERE used_at IS NULL;
```

Masa berlaku mengikuti `FR-01.1`: access 60 menit; refresh 30 hari (mobile) / 12 jam (web).

### 4.2 Alur login

```
POST /auth/login
  1. cari user by email            -> Argon2id SELALU dijalankan tepat sekali (hash dummy bila
                                      tidak ada) — mencegah pembedaan waktu / enumerasi
  2. email tak terdaftar           -> LOGIN_FAILED (tanpa sasaran, email tidak disimpan); 401
  3. jika locked_until > now       -> LOGIN_FAILED (AKUN_TERKUNCI), TIDAK dihitung; 401
                                      (identik dengan langkah 2 dan 4, SDD-SESS-12)
  4. password salah                -> SATU transaksi, baris users dikunci (FOR UPDATE):
                                      jendela tetap 15 menit dari kegagalan pertama;
                                      failed_login_count++ ; LOGIN_FAILED
                                      bila >= 5 dalam jendela -> locked_until = now+15m,
                                      ACCOUNT_LOCKED, event AccountLocked (NT-39); commit; 401
  5. jika status <> Aktif          -> 403 pesan FR-01.1 A3
  5a. jika must_change_password DAN penerbitan reset terakhir sudah lewat 72 jam
                                   -> LOGIN_FAILED (PASSWORD_SEMENTARA_KEDALUWARSA), permintaan ditutup
                                      KEDALUWARSA; 401 seragam; TIDAK menambah penghitung (§4.8)
  6. jika 2FA aktif (totp_enabled_at) -> 200 {requires_2fa, challenge_token, expires_in}  (5 menit);
                                      sesi BELUM terbit; penghitung kegagalan TIDAK di-reset (baru saat kode
                                      terbukti, §4.4) — kalau di-reset, penyerang yang tahu password menebak
                                      6 digit tanpa pernah terkunci
     role wajib 2FA belum terdaftar   -> lanjut ke langkah 7-8: sesi terbit ber-amr ["pwd"] dan digerbang
                                      403 TWO_FACTOR_REQUIRED sampai pendaftaran (SDD-SESS-15, §4.4)
  7. jika must_change_password     -> terbitkan token dengan klaim pwd_change_required
  8. terbitkan access + refresh (family_id baru), reset penghitung dan locked_until,
     catat LOGIN_SUCCESS + IP + UA
```

Body login memuat `platform` (`WEB` | `ANDROID` | `IOS`): ia menentukan masa berlaku refresh token dan jalur pengirimannya (§4.7), disimpan pada baris `refresh_tokens`, dan diwarisi setiap rotasi — tidak pernah diambil dari permintaan refresh. Akun nonaktif dijawab `403 FORBIDDEN` **setelah** password terbukti benar; sebelum itu kegagalan tetap `401` yang sama dengan email tak dikenal. Langkah 2–4 (penghitung, penguncian, audit kegagalan) dikerjakan `PR-02-03`; langkah 6 `PR-02-07`. Waktu semuanya dari `Clock` yang di-inject (`SDD-SYS-07`). Percobaan selama terkunci tidak dihitung — kalau dihitung, siapa pun dapat memperpanjang penguncian akun orang lain tanpa batas. Login yang berhasil memeriksa ulang penguncian di bawah kunci baris, sehingga login tidak melewati penguncian yang baru terjadi akibat kegagalan serentak.

### 4.3 Rotasi & deteksi pemakaian ulang

```
POST /auth/refresh
  row := SELECT ... WHERE token_hash = sha256(presented) FOR UPDATE

  bila tidak ada                -> 401
  bila revoked_at IS NOT NULL   -> 401
  bila rotated_at IS NOT NULL   -> PEMAKAIAN ULANG TERDETEKSI:
        UPDATE refresh_tokens SET revoked_at = now(),
               revoke_reason = 'reuse_detected'
         WHERE family_id = row.family_id AND revoked_at IS NULL
        catat anomali keamanan (NFR-S-16); notifikasi Administrator
        -> 401
  bila expires_at <= now        -> 401 (kedaluwarsa bukan pencurian: tidak mencabut)
  bila akun tidak Aktif         -> cabut keluarga ('account_deactivated') -> 401
  selain itu:
        UPDATE row SET rotated_at = now()
        INSERT token baru: family_id sama, parent_id = row.id, platform diwarisi
        -> 200 {tokens, expires_in}
```

Klaim `amr` access token baru diturunkan dari `otp_verified` baris yang ditukar dan diwarisi baris baru (`SDD-SESS-16`); refresh tidak pernah dapat menaikkan sesi dari `["pwd"]` ke `["pwd","otp"]`.

Pencabutan karena pemakaian ulang HARUS ter-commit meskipun permintaannya berakhir `401`: hasil transaksi dikembalikan sebagai nilai dan galat baru dilempar setelah commit. Entri `REFRESH_TOKEN_REUSE_DETECTED` ditulis dalam transaksi yang sama (`AL-01`); alarm ke pemantauan berupa log `error` (`OBS-05`). Notifikasi ke Administrator menunggu modul notifikasi (`PR-02-25`).

Konsekuensi yang disengaja: klien yang mengirim dua permintaan refresh bersamaan (mis. dua tab) akan memicu pencabutan keluarga. Klien wajib men-*serialisasi* refresh — pada web dilakukan lewat satu *promise* bersama, pada mobile lewat *mutex* pada interceptor.

### 4.4 2FA

```
Aktivasi (FR-01.5) — pengguna terautentikasi, 2FA belum aktif; sesi ber-amr ["pwd"] cukup:
  POST /auth/2fa/enroll          bangkitkan secret (20 byte) -> simpan TERENKRIPSI (AES-256-GCM, kunci
                                 TOTP_ENCRYPTION_KEY, AAD = "totp:{user_id}") dengan totp_enabled_at NULL
                                 -> 10 kode cadangan (hash Argon2id; kode asli tampil SEKALI)
                                 -> respons {secret, otpauth_uri, kode_cadangan}; TWO_FA_ENROLLMENT_STARTED
                                 diulang selagi belum dikonfirmasi = mengganti secret DAN seluruh kode
  POST /auth/2fa/enroll/confirm  pengguna kirim 6 digit -> verifikasi (window ±1 langkah = ±30 detik)
                                 aktif -> totp_enabled_at = now(), totp_last_step = langkah kode; TWO_FA_ENABLED
                                 sesi ini: refresh_tokens.otp_verified = true; access token BARU ber-amr
                                 ["pwd","otp"] pada sesi (sid) yang sama, pwd dibawa dari keadaan akun
                                 seluruh sesi LAIN dicabut (revoke_reason two_fa_enabled), SessionRevoked per
                                 sesi + TwoFactorEnabled -> NT-39a (BR-070e)
  POST /auth/2fa/backup-codes/regenerate   hanya sesi ber-amr otp; mengganti SELURUH kode;
                                 TWO_FA_BACKUP_CODES_REGENERATED

Verifikasi login (POST /auth/2fa/verify {challenge_token, kode}):
  challenge_token (5 menit, sekali pakai, SDD-SESS-14) ditukar dengan kode
  kode 6 digit -> TOTP: langkahnya harus LEBIH BARU dari users.totp_last_step (satu kode berlaku sekali)
  selain itu   -> kode cadangan (Argon2id) diterima sebagai alternatif -> tandai used_at (sekali pakai)
  sisa kode <= 2 -> respons memuat kode_cadangan_menipis = true (FR-01.5 AC)
  5 kegagalan -> kunci 15 menit (penghitung dan jendela yang SAMA dengan password, §4.2); kegagalan yang
                 menyebabkan penguncian dijawab 423 ACCOUNT_LOCKED beserta sisa menit dan menghabiskan challenge
  sukses      -> SATU transaksi: baris refresh (otp_verified = true), penghitung di-reset, LOGIN_SUCCESS
                 (metode_2fa), [TWO_FA_BACKUP_CODE_USED + sisa]; sesudah commit challenge dihabiskan
```

`BR-070e` (`enroll/confirm` mencabut seluruh sesi lain dan menerbitkan `TwoFactorEnabled`) diimplementasikan `PR-02-07`. `BR-070d` (kode aktivasi, `SDD-SESS-17`) adalah rancangan yang belum diimplementasikan: sampai PR pelaksananya tergabung, `enroll` hanya menuntut sesi terautentikasi.

Gerbang (`SDD-SESS-15`): role wajib 2FA (R-01 dan R-03, `BR-070`) dengan `amr` tanpa `otp` ditolak `403 TWO_FACTOR_REQUIRED` pada setiap route terlindung kecuali `POST /auth/2fa/enroll`, `POST /auth/2fa/enroll/confirm`, dan `POST /auth/logout`. Role lain tidak terpengaruh, dengan atau tanpa 2FA.

Toleransi jam ±30 detik dipilih agar perbedaan jam perangkat yang wajar tidak menggagalkan login, tanpa memperlebar jendela serangan secara berarti.

### 4.5 Break-glass (`FR-01.6`)

```
sigm4 admin:recover --email=<email> [--force]

  1. tolak bila ada Administrator aktif yang login < 24 jam terakhir,
     kecuali --force (yang juga dicatat)
  2. nonaktifkan 2FA target; hapus backup codes
  3. terbitkan password sementara; must_change_password = true
  4. cabut SELURUH refresh token di sistem
  5. catat ADMIN_BREAK_GLASS_RECOVERY, pelaku 'SYSTEM:CLI'
  6. alarm ke pemantauan + notifikasi seluruh Pimpinan Sekolah
```

### 4.6 Logout & pencabutan

| Aksi | Efek |
|---|---|
| `POST /auth/logout` | Cabut seluruh keluarga refresh token sesi ini (`sid` pada access token); `revoke_reason = logout`; cookie web dibuang. Access token sesi itu ikut mati (§4.7). Event `SessionRevoked` — konsumennya (`PR-02-25`) menonaktifkan device token FCM (`MOB-SEC-05`) |
| `POST /auth/logout-all` | Cabut seluruh baris `refresh_tokens` milik pengguna (`logout_all`); `LOGOUT_ALL_DEVICES`; satu event `SessionRevoked` per sesi |
| `GET /auth/sessions` | Sesi aktif milik pengguna: token yang sedang berlaku (belum dirotasi, dicabut, atau kedaluwarsa), satu per keluarga; `saat_ini` menandai sesi pemanggil |
| `DELETE /auth/sessions/{id}` | Cabut satu keluarga milik pengguna sendiri (`device_revoked`; `logout` bila itu sesi ini). Sesi orang lain dan sesi yang tidak ada dijawab sama, `403` (`SDD-AUTH-08`); yang sudah tercabut: `204` idempoten, tanpa entri baru |
| Ganti password (`FR-01.4`) | Cabut seluruh sesi lain milik pengguna |
| Nonaktifkan akun | Cabut seluruh sesi seketika |
| Auto-logout web 30 menit idle | Dilakukan klien; server tetap menghormati masa berlaku token |

### 4.7 Access token, jalur token, dan `authenticate`

| Aspek | Ketetapan |
|---|---|
| Klaim access token | `iss=sigm4`, `aud=sigm4-api`, `sub` (id pengguna), `sid` (= `family_id`), `pwd` (wajib ganti password), `amr` (`SDD-SESS-09`), `iat`, `exp`, `jti`; header `alg=EdDSA`, `kid` = thumbprint RFC 7638 kunci publik |
| Verifikasi | Algoritma dipatok `EdDSA` (bukan yang dinyatakan token); `kid` harus dikenal; tanda tangan diperiksa **sebelum** klaim dipercaya; `crit`/`jku`/`jwk`/`x5u` ditolak. `TOKEN_EXPIRED` hanya bila tanda tangan sah |
| Jalur WEB | Access token di cookie `sigm4_at` (`Path=/api/v1`), refresh di `sigm4_rt` (`Path=/api/v1/auth`); keduanya `HttpOnly; Secure; SameSite=Strict`. Body respons **tanpa** token (`tokens: null`) |
| Jalur ANDROID/IOS | Token di body (`tokens`), dikirim balik sebagai `Authorization: Bearer` dan `refresh_token` di body refresh |
| Sumber token | Header `Authorization` didahulukan; bila tidak ada, cookie `sigm4_at`. Header berbentuk salah tidak jatuh ke cookie |
| `authenticate` | **Lenient**: token yang ada tetapi tak sah hanya ditandai; penolakan (`401`, `TOKEN_EXPIRED` bila kedaluwarsa) milik `authorize` pada route yang menuntutnya. Route publik — `login` dan `refresh` — tetap terjangkau dengan cookie access kedaluwarsa. Permission dan status akun dibaca ulang setiap permintaan (`PM-05`): akun nonaktif kehilangan akses seketika |
| Gerbang ganti password | Klaim `pwd=true` → `403 PASSWORD_CHANGE_REQUIRED` pada semua route di luar `/api/v1/auth/*` (`SDD-AUTH-09` gerbang 2, `FR-01.1 A4`) |
| Gerbang 2FA | Role wajib 2FA dengan `amr` tanpa `otp` → `403 TWO_FACTOR_REQUIRED` pada route terlindung; pengecualian hanya route yang menyatakan `twoFactorExempt` (pendaftaran 2FA, logout). Berlaku di `authenticated()`/`authorize()`, sehingga route publik — login, refresh, verifikasi 2FA — tak pernah tersentuh (`SDD-AUTH-09` gerbang 3, `SDD-SESS-15`) |
| Sesi hidup | `authenticate` memeriksa `sid` terhadap `refresh_tokens` pada **setiap** permintaan: sesi hidup selama keluarga itu milik `sub` dan masih punya baris yang belum dicabut. Karena itu logout, logout semua perangkat, cabut satu perangkat, dan pemakaian ulang refresh token (§4.3) mematikan access token SEKETIKA — acceptance "≤ 60 detik" (`PR-02-04`) dipenuhi tanpa jendela. Dibaca dari PostgreSQL, bukan cache (§5). Alasan `revoke_reason`: `reuse_detected`, `logout`, `logout_all`, `device_revoked`, `account_deactivated`, `password_changed`, `password_reset`, `break_glass` |
| Kunci | `JWT_PRIVATE_KEY` (PKCS#8) dan `JWT_PUBLIC_KEY` (SPKI), PEM Ed25519; `\n` literal diterima untuk berkas env satu baris. Startup gagal bila bukan PEM, bukan Ed25519, atau bukan pasangan (`SDD-INF-08`). Kunci enkripsi secret TOTP `TOTP_ENCRYPTION_KEY` terpisah dari keduanya: base64 dari tepat 32 byte (`openssl rand -base64 32`); startup gagal bila bukan base64 yang sah atau bukan 32 byte, tanpa mencetak nilainya |

### 4.8 Reset password administratif (`FR-01.3`)

```
POST /auth/password/forgot  {email}                       publik; SELALU 202 {"message":"Permintaan diterima"}
  email tak dikenal / akun nonaktif -> PASSWORD_RESET_REQUESTED (GAGAL, tanpa pelaku, tanpa email); tak ada baris
  aktif, < 3 permintaan/24 jam      -> baris MENUNGGU + PASSWORD_RESET_REQUESTED + event PasswordResetRequested (NT-37)
  aktif, >= 3 permintaan/24 jam     -> tidak dibuat; PASSWORD_RESET_REQUESTED (GAGAL, MELEBIHI_BATAS) + alarm log
  (baris pengguna dikunci FOR UPDATE: permintaan serentak tidak dapat melewati batas)

GET  /auth/password/requests             user.reset_password   antrean (status efektif; identitas pemohon)
POST /auth/password/requests/{id}/issue  user.reset_password   {metode_verifikasi}
POST /auth/password/requests/{id}/reject user.reset_password   {alasan}
POST /users/{id}/reset-password          user.reset_password   {metode_verifikasi}  (M-02, reset langsung)

issue / reset langsung (SATU transaksi; kunci: pengguna dulu, lalu permintaan):
  1. permintaan MENUNGGU, akun AKTIF            -> selain itu 422
  2. bangkitkan password sementara (16 karakter, lolos kebijakan NFR-S-03a); simpan HASH-nya
  3. users: password_hash, must_change_password = true, penghitung dan locked_until dihapus
  4. permintaan -> DITERBITKAN (metode, pelaku, kedaluwarsa = sekarang + 72 jam);
     penerbitan lama akun itu -> KEDALUWARSA
  5. cabut SELURUH sesi (revoke_reason = password_reset) + SessionRevoked per sesi
  6. PASSWORD_RESET_ISSUED (metode, sesi dicabut; TANPA password) + event PasswordResetIssued (NT-38)
  7. respons: {permintaan, password_sementara}; Cache-Control: no-store; tak dapat dibaca ulang
```

Siklus status: `MENUNGGU → DITERBITKAN → SELESAI` (pengguna mengganti password sementara — `PR-02-06`) atau `→ KEDALUWARSA` (72 jam, atau digantikan penerbitan baru); `MENUNGGU → DITOLAK`. Status yang dilihat pembaca dihitung dari `kedaluwarsa_pada` sehingga `DITERBITKAN` yang lewat 72 jam tampil `KEDALUWARSA` sebelum barisnya sempat ditutup; kolom `status` menyusul saat login menyentuhnya. Batas 72 jam hanya berlaku bagi password yang ditetapkan penerbitan reset — akun baru buatan Administrator (`FR-02.1`) tidak punya penerbitan dan tidak dibatasi. Migration `0023`.

---

## 5. Konsekuensi

- Klien wajib menyerialisasi permintaan refresh (§4.3). Ini menjadi persyaratan bagi [SDD-11](11-frontend-architecture.md) dan [SDD-12](12-mobile-architecture.md).
- Kunci penandatangan Ed25519 dan kunci enkripsi TOTP adalah dua rahasia berbeda dengan siklus rotasi berbeda — keduanya wajib ada di *secret manager* (`SEC-CFG-01`).
- Password sementara hanya ada pada respons penerbitan: Administrator yang lalai menyalinnya harus menerbitkan ulang (yang menggantikan yang lama). Antarmuka wajib menyatakan "tampil satu kali" sebelum dialog ditutup (`UX F-02`).
- Pemohon yang ditolak tidak diberi tahu oleh sistem (tidak ada `NT-xx` untuknya; `FR-01.3 A2` menyerahkannya ke pemberitahuan luring).
- Pengguna sah yang terkunci **tidak diberi tahu** bahwa akunnya terkunci lewat endpoint login (`SDD-SESS-12`); satu-satunya pemberitahuan adalah `NT-39`, dan belum ada jalur pembuka kunci administratif — kunci berakhir sendiri setelah 15 menit.
- Penguncian akun tersimpan di basis data berarti serangan *credential stuffing* terhadap banyak akun menimbulkan beban tulis. Dimitigasi oleh limit per-IP di Redis yang menyaring lebih dulu (SDD-SESS-07).
- Pemulihan break-glass mencabut seluruh sesi di sistem — seluruh pengguna harus login ulang. Ini disengaja.
- Karena daftar refresh token hidup di PostgreSQL (`SDD-SESS-03`, `SDD-SESS-04`, §4.1), `refresh_tokens` tumbuh monoton dan memerlukan pembersihan berkala atas baris yang `expires_at`-nya telah lewat; indeks penunjangnya sudah ada (§4.1). Angka retensinya tidak ditetapkan di sini — lihat **TBD-SESS-B**.
- `authenticate` menambah **satu kueri berindeks** (`refresh_tokens_family_idx`) pada setiap permintaan terautentikasi, di samping pembacaan status akun dan peran (`PM-05`). Dipilih daripada cache 60 detik karena pencabutan harus berlaku pada permintaan berikutnya dan tidak boleh bergantung pada Redis; bila kelak terbukti mahal pada `NFR-P-09`, cache berumur pendek dengan pembatalan eksplisit saat pencabutan adalah jalan keluarnya.
- Ketersediaan Redis tidak lagi menjadi prasyarat kebenaran pencabutan sesi. Redis tetap prasyarat `/health/ready` ([SDD-15 §4.5](15-observability-logging.md)) karena rate limit dan antrean, tetapi gangguan Redis tidak dapat membatalkan pencabutan yang sudah tercatat.

---

## 6. Risiko Teknis

| Risiko | Dampak | Mitigasi |
|---|---|---|
| Refresh paralel memicu pencabutan keluarga | Pengguna ter-logout tanpa sebab jelas | Serialisasi di klien; pesan galat spesifik; jendela toleransi tidak ditambahkan karena akan melemahkan deteksi |
| Jam perangkat menyimpang jauh | TOTP selalu gagal | Toleransi ±1 langkah; pesan galat menyarankan sinkronisasi jam |
| Kunci enkripsi TOTP hilang | Seluruh 2FA harus didaftarkan ulang | Kunci dicadangkan terpisah dari basis data; prosedur pendaftaran ulang massal terdokumentasi |
| Penguncian dipakai sebagai DoS terhadap akun tertentu (penyerang yang tahu email mengirim 5 password salah) | Pengguna sah tak dapat login 15 menit tanpa tahu sebabnya | Sumbu IP menghambat penyerang tunggal; `LOGIN_FAILED`/`ACCOUNT_LOCKED` beserta IP tercatat; `NT-39`. Bila menjadi masalah nyata, jalur pembuka kunci administratif menjadi PR tersendiri |
| Argon2id membebani CPU saat lonjakan login | Latensi login naik | Parameter dapat diturunkan lewat konfigurasi; diukur pada uji beban `NFR-P-09` |
| Cookie `SameSite=Strict` memutus alur dari tautan eksternal | Deep link email/chat tidak membawa sesi | Tidak ada kanal email (`NO-08`); deep link mobile memakai token dari Keychain, bukan cookie |

---

## 7. Requirement Terkait

`FR-01.1` `FR-01.2` `FR-01.3` `FR-01.4` `FR-01.5` `FR-01.6` · `BR-070` `BR-070a` `BR-070b` `BR-070c` `BR-070d` `BR-070e` ·
`NFR-S-01` `NFR-S-02` `NFR-S-03` `NFR-S-03a` `NFR-S-03b` `NFR-S-07` `NFR-S-09` `NFR-S-10` `NFR-S-16` ·
`FR-01.3` · `NT-37` `NT-38` `NT-38a` `NT-39` `NT-39a` · `AL-02` `AL-05` `AL-07` · `MOB-SEC-05` · `SEC-CFG-01` `SEC-CFG-02` · `MOB-SEC-01` `MOB-SEC-05`

---

## 8. TBD

| ID | Pertanyaan |
|---|---|
| **TBD-AUTH-B** *(dari SDD-03)* | Masa tumpang tindih dua kunci Ed25519 saat rotasi 6 bulanan. Rancangan ini mendukungnya (`kid` pada header JWT), tetapi durasinya belum ditetapkan. |
| **TBD-SESS-A** | Panjang masa berlaku *challenge token* 2FA ditetapkan 5 menit sebagai nilai rancangan. Tidak ada angka di PRD; perlu konfirmasi atau penetapan lain. |
| **TBD-SESS-B** | Retensi dan pembersihan baris `refresh_tokens` yang sudah kedaluwarsa atau dicabut. Tabel tumbuh monoton (§5); indeks `expires_at` sudah tersedia (§4.1), angkanya belum. Berkaitan dengan **TBD-EVT-A** dan **TBD-AVL-A**. |
