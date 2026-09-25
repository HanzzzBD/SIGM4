# SDD-04 — Autentikasi & Sesi

**Area:** `SESS` · **Status:** Draft · **Basis:** [`m01-auth.md`](../PRD/02-modules/m01-auth.md), [`security.md`](../PRD/03-architecture/security.md)

---

## 1. Konteks

| Kelompok | ID |
|---|---|
| Alur autentikasi | `FR-01.1` … `FR-01.6` |
| Token & password | `NFR-S-02`, `NFR-S-03`, `NFR-S-03a`, `NFR-S-03b`, `NFR-S-07`, `NFR-S-09` |
| 2FA & pemulihan | `BR-070`, `BR-070a`, `BR-070b`, `BR-070c` |
| Notifikasi terkait | `NT-37`, `NT-38`, `NT-38a`, `NT-39` |
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
| **SDD-SESS-07** | Rate limit login diterapkan **dua sumbu** — per akun dan per IP — sesuai `NFR-S-07`, dengan penghitung IP di Redis (boleh hilang) dan penghitung akun di PostgreSQL (tidak boleh hilang). |
| **SDD-SESS-08** | Secret TOTP dan kode cadangan disimpan **terenkripsi** dengan kunci aplikasi terpisah dari kunci JWT. Kode cadangan disimpan sebagai hash Argon2id (`BR-070c`). |
| **SDD-SESS-09** | Verifikasi 2FA menghasilkan **klaim terpisah** pada sesi (`amr: ["pwd","otp"]`), sehingga gerbang `twoFactorVerified` (SDD-AUTH-09) memeriksa klaim, bukan tabel. |
| **SDD-SESS-10** | *Challenge token* 2FA berumur **5 menit**, sekali pakai, dan tidak dapat dipakai sebagai access token. |
| **SDD-SESS-11** | Pemulihan darurat (`FR-01.6`) diimplementasikan sebagai **perintah CLI pada artefak worker**, tidak pernah terdaftar sebagai route HTTP. |

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

---

## 4. Rancangan

### 4.1 Skema

```sql
-- Penambahan pada users (kolom lain sudah didefinisikan PRD)
ALTER TABLE users
  ADD COLUMN failed_login_count int NOT NULL DEFAULT 0,
  ADD COLUMN locked_until       timestamptz,
  ADD COLUMN totp_secret_enc    bytea,        -- terenkripsi (SDD-SESS-08)
  ADD COLUMN totp_enabled_at    timestamptz;

CREATE TABLE refresh_tokens (
    id           bigserial PRIMARY KEY,
    user_id      bigint      NOT NULL REFERENCES users(id),
    family_id    uuid        NOT NULL,
    token_hash   bytea       NOT NULL UNIQUE,   -- SHA-256 (SDD-SESS-03)
    platform     text        NOT NULL,          -- 'web' | 'android' | 'ios'
    issued_at    timestamptz NOT NULL DEFAULT now(),
    expires_at   timestamptz NOT NULL,
    rotated_at   timestamptz,                   -- terisi saat ditukar
    revoked_at   timestamptz,
    revoke_reason text
);
CREATE INDEX ON refresh_tokens (user_id) WHERE revoked_at IS NULL;
CREATE INDEX ON refresh_tokens (family_id);
CREATE INDEX ON refresh_tokens (expires_at);

CREATE TABLE totp_backup_codes (
    id         bigserial PRIMARY KEY,
    user_id    bigint NOT NULL REFERENCES users(id),
    code_hash  text   NOT NULL,                 -- Argon2id (BR-070c)
    used_at    timestamptz
);
```

Masa berlaku mengikuti `FR-01.1`: access 60 menit; refresh 30 hari (mobile) / 12 jam (web).

### 4.2 Alur login

```
POST /auth/login
  1. cari user by email            -> selalu jalankan hash dummy bila tidak ada
                                      (mencegah pembedaan waktu / enumerasi)
  2. jika locked_until > now       -> 423 ACCOUNT_LOCKED + sisa waktu
  3. verifikasi Argon2id           -> gagal: failed_login_count++, LOGIN_FAILED
                                      bila >= 5 dalam 15 menit -> locked_until = now+15m
                                      terbitkan NT-39
  4. jika status <> Aktif          -> 403 pesan FR-01.1 A3
  5. jika role wajib 2FA / 2FA on  -> 200 {requires_2fa, challenge_token}   (5 menit)
  6. jika must_change_password     -> terbitkan token dengan klaim pwd_change_required
  7. terbitkan access + refresh (family_id baru), catat LOGIN_SUCCESS + IP + UA
```

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
  selain itu:
        UPDATE row SET rotated_at = now()
        INSERT token baru dengan family_id yang sama
        -> 200 {access_token, refresh_token}
```

Konsekuensi yang disengaja: klien yang mengirim dua permintaan refresh bersamaan (mis. dua tab) akan memicu pencabutan keluarga. Klien wajib men-*serialisasi* refresh — pada web dilakukan lewat satu *promise* bersama, pada mobile lewat *mutex* pada interceptor.

### 4.4 2FA

```
Aktivasi (FR-01.5):
  server bangkitkan secret -> simpan terenkripsi -> tampilkan QR + 10 kode cadangan
  pengguna kirim 6 digit   -> verifikasi (window ±1 langkah = ±30 detik)
  aktif -> totp_enabled_at = now(); TWO_FA_ENABLED

Verifikasi login:
  challenge_token (5 menit, sekali pakai) ditukar dengan kode TOTP
  kode cadangan diterima sebagai alternatif -> tandai used_at (sekali pakai)
  sisa kode <= 2 -> sertakan peringatan pada respons (FR-01.5 AC)
  5 kegagalan -> kunci 15 menit (sama dengan alur password)
```

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
| `POST /auth/logout` | Cabut refresh token yang dipakai; hapus device token FCM (`MOB-SEC-05`) |
| Logout semua perangkat | Cabut seluruh baris `refresh_tokens` milik pengguna |
| Ganti password (`FR-01.4`) | Cabut seluruh sesi lain milik pengguna |
| Nonaktifkan akun | Cabut seluruh sesi seketika |
| Auto-logout web 30 menit idle | Dilakukan klien; server tetap menghormati masa berlaku token |

---

## 5. Konsekuensi

- Klien wajib menyerialisasi permintaan refresh (§4.3). Ini menjadi persyaratan bagi [SDD-11](11-frontend-architecture.md) dan [SDD-12](12-mobile-architecture.md).
- Kunci penandatangan Ed25519 dan kunci enkripsi TOTP adalah dua rahasia berbeda dengan siklus rotasi berbeda — keduanya wajib ada di *secret manager* (`SEC-CFG-01`).
- Penguncian akun tersimpan di basis data berarti serangan *credential stuffing* terhadap banyak akun menimbulkan beban tulis. Dimitigasi oleh limit per-IP di Redis yang menyaring lebih dulu (SDD-SESS-07).
- Pemulihan break-glass mencabut seluruh sesi di sistem — seluruh pengguna harus login ulang. Ini disengaja.
- Karena daftar refresh token hidup di PostgreSQL (`SDD-SESS-03`, `SDD-SESS-04`, §4.1), `refresh_tokens` tumbuh monoton dan memerlukan pembersihan berkala atas baris yang `expires_at`-nya telah lewat; indeks penunjangnya sudah ada (§4.1). Angka retensinya tidak ditetapkan di sini — lihat **TBD-SESS-B**.
- Ketersediaan Redis tidak lagi menjadi prasyarat kebenaran pencabutan sesi. Redis tetap prasyarat `/health/ready` ([SDD-15 §4.5](15-observability-logging.md)) karena rate limit dan antrean, tetapi gangguan Redis tidak dapat membatalkan pencabutan yang sudah tercatat.

---

## 6. Risiko Teknis

| Risiko | Dampak | Mitigasi |
|---|---|---|
| Refresh paralel memicu pencabutan keluarga | Pengguna ter-logout tanpa sebab jelas | Serialisasi di klien; pesan galat spesifik; jendela toleransi tidak ditambahkan karena akan melemahkan deteksi |
| Jam perangkat menyimpang jauh | TOTP selalu gagal | Toleransi ±1 langkah; pesan galat menyarankan sinkronisasi jam |
| Kunci enkripsi TOTP hilang | Seluruh 2FA harus didaftarkan ulang | Kunci dicadangkan terpisah dari basis data; prosedur pendaftaran ulang massal terdokumentasi |
| Argon2id membebani CPU saat lonjakan login | Latensi login naik | Parameter dapat diturunkan lewat konfigurasi; diukur pada uji beban `NFR-P-09` |
| Cookie `SameSite=Strict` memutus alur dari tautan eksternal | Deep link email/chat tidak membawa sesi | Tidak ada kanal email (`NO-08`); deep link mobile memakai token dari Keychain, bukan cookie |

---

## 7. Requirement Terkait

`FR-01.1` `FR-01.2` `FR-01.3` `FR-01.4` `FR-01.5` `FR-01.6` · `BR-070` `BR-070a` `BR-070b` `BR-070c` ·
`NFR-S-01` `NFR-S-02` `NFR-S-03` `NFR-S-03a` `NFR-S-03b` `NFR-S-07` `NFR-S-09` `NFR-S-10` `NFR-S-16` ·
`NT-37` `NT-38` `NT-38a` `NT-39` · `AL-02` `AL-05` · `SEC-CFG-01` `SEC-CFG-02` · `MOB-SEC-01` `MOB-SEC-05`

---

## 8. TBD

| ID | Pertanyaan |
|---|---|
| **TBD-AUTH-B** *(dari SDD-03)* | Masa tumpang tindih dua kunci Ed25519 saat rotasi 6 bulanan. Rancangan ini mendukungnya (`kid` pada header JWT), tetapi durasinya belum ditetapkan. |
| **TBD-SESS-A** | Panjang masa berlaku *challenge token* 2FA ditetapkan 5 menit sebagai nilai rancangan. Tidak ada angka di PRD; perlu konfirmasi atau penetapan lain. |
| **TBD-SESS-B** | Retensi dan pembersihan baris `refresh_tokens` yang sudah kedaluwarsa atau dicabut. Tabel tumbuh monoton (§5); indeks `expires_at` sudah tersedia (§4.1), angkanya belum. Berkaitan dengan **TBD-EVT-A** dan **TBD-AVL-A**. |
