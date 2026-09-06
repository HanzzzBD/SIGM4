# SDD-13 — Desain Keamanan

**Area:** `SEC` · **Status:** Draft · **Basis:** [`security.md`](../PRD/03-architecture/security.md), [`privacy-compliance.md`](../PRD/03-architecture/privacy-compliance.md)

---

## 1. Konteks

| Kelompok | ID |
|---|---|
| NFR keamanan | `NFR-S-01` … `NFR-S-18` |
| Pengujian & kerentanan | `ST-01` … `ST-07`, `SEC-T-01` … `SEC-T-06` |
| Perlindungan data | `DP-01` … `DP-11`, `DP-AI-01` … `DP-AI-05` |
| Jejak audit | `AL-01` … `AL-10` |
| Rahasia & konfigurasi | `SEC-CFG-01` … `SEC-CFG-04` |
| Risiko | `RS-10`, `RS-12`, `RS-13` |

Otorisasi berada di [SDD-03](03-authorization.md); autentikasi di [SDD-04](04-authentication-session.md). Berkas ini menangani sisanya: model ancaman, enkripsi, pengerasan, dan pipeline keamanan.

---

## 2. Keputusan Desain

| ID | Keputusan |
|---|---|
| **SDD-SEC-01** | Enkripsi *at-rest* memakai **enkripsi tingkat volume/penyimpanan**, bukan enkripsi kolom aplikasi — kecuali dua field yang dikecualikan di bawah. |
| **SDD-SEC-02** | Dua field dienkripsi di **tingkat aplikasi** dengan kunci terpisah: `users.totp_secret_enc` dan `vault` kredensial pihak ketiga. Alasan pada §3. |
| **SDD-SEC-03** | Header keamanan disetel oleh **middleware aplikasi**, bukan hanya reverse proxy — agar berlaku sama di semua lingkungan. |
| **SDD-SEC-04** | CSP disusun **tanpa `unsafe-inline`**; skrip dan gaya memakai *nonce* per permintaan. |
| **SDD-SEC-05** | Rate limit diimplementasikan sebagai **sliding window di Redis**, dengan kelas berbeda per kelompok endpoint (`NFR-S-07`). |
| **SDD-SEC-06** | Pemindaian dependensi, SAST, dan pemindaian image adalah **gerbang pipeline**, bukan laporan pasca-rilis (`CD-02`). |
| **SDD-SEC-07** | Matriks uji otorisasi (`SEC-T-01`) **digenerate** dari registri route, bukan ditulis tangan. |
| **SDD-SEC-08** | Pseudonimisasi (`DP-04`) diimplementasikan sebagai operasi **satu arah** pada kolom identitas, mempertahankan baris transaksi dan jejak audit. |
| **SDD-SEC-09** | Akses produksi oleh pengembang berjalan lewat prosedur *break-glass* tercatat (`DP-11`), bukan kredensial tetap. |
| **SDD-SEC-10** | **Lingkup kepatuhan formal adalah UU PDP No. 27/2022 saja** — tidak ada standar dinas pendidikan atau yayasan tambahan. Menyertainya satu batasan mengikat: **seluruh data sistem, termasuk log aplikasi, wajib berada pada wilayah Indonesia**. Batasan ini berlaku bagi setiap layanan pihak ketiga yang menerima data, dan menjadi kriteria seleksi — bukan pemeriksaan pasca-pemilihan. Menutup `TBD-SEC-B` (keputusan pemilik produk, 25 Agustus 2026; Keputusan #29). |
| **SDD-SEC-11** | Perkakas tahap keamanan pipeline ([SDD-16 §4.3](16-infrastructure-deployment.md)): **CodeQL** untuk SAST (`ST-01`), **Dependabot** untuk SCA (`ST-02`), **Trivy** untuk pemindaian image (`CD-01`), dan **OWASP ZAP** *baseline scan* terhadap staging untuk DAST (`ST-03`). Ambang penghenti pipeline tetap milik `ST-02` — Critical/High menggagalkan, bukan memperingatkan. |

---

## 3. Alasan

**SDD-SEC-01/02 — dua tingkat enkripsi yang berbeda tujuannya.** Enkripsi volume melindungi terhadap pencurian media penyimpanan atau cadangan — itu yang `DP-06` maksud, dan ia gratis secara operasional. Ia **tidak** melindungi terhadap penyerang yang sudah bisa membaca basis data.

Dua field memerlukan perlindungan yang lebih kuat karena kompromi keduanya langsung membuka akses:

- **Secret TOTP** — bocornya berarti 2FA seluruh Administrator dan Pimpinan Sekolah tidak berarti apa-apa (`BR-070`).
- **Kredensial pihak ketiga** — kunci Gemini API (`GEMINI_API_KEY`) dan FCM.

Keduanya dienkripsi aplikasi dengan kunci di *secret manager*, terpisah dari kunci penandatangan JWT (`SEC-CFG-01`). Konsekuensi yang diterima: kehilangan kunci berarti seluruh 2FA harus didaftarkan ulang — prosedurnya didokumentasikan ([SDD-04 §6](04-authentication-session.md)).

Password **tidak** masuk daftar ini karena sudah di-hash Argon2id (`SDD-SESS-01`) — mengenkripsi hash tidak menambah apa pun.

**SDD-SEC-03 — header di aplikasi.** Menyetel header keamanan hanya di Nginx berarti lingkungan pengembangan dan staging berjalan tanpanya, dan celah baru ditemukan saat pentest menjelang rilis. Middleware aplikasi membuat perilaku sama di mana pun, dan proxy tetap boleh menambah HSTS di lapisannya.

**SDD-SEC-04 — CSP tanpa `unsafe-inline`.** `NFR-S-11` mewajibkan CSP. CSP dengan `unsafe-inline` praktis tidak menahan XSS — ia hanya memberi rasa aman. Nonce per permintaan menuntut sedikit kerja pada *build* frontend, dan itu harga yang wajar.

**SDD-SEC-07 — matriks uji digenerate.** `SEC-T-01` menuntut pengujian setiap endpoint × 7 role × (data sendiri / data orang lain). Ditulis tangan, itu ratusan kasus yang akan tertinggal saat endpoint baru ditambah. Karena setiap route sudah mendeklarasikan permission-nya (`SDD-AUTH-01`), matriksnya dapat dihasilkan — dan endpoint baru otomatis ikut teruji.

**SDD-SEC-08 — pseudonimisasi, bukan penghapusan.** `DP-04` (hak penghapusan) bertabrakan dengan `AL-03` (log tidak dapat dihapus) dan `BR-008` (aset selalu dapat ditelusuri). Mengganti identitas dengan penanda tak-terbalikkan memenuhi hak subjek data tanpa merusak jejak pertanggungjawaban — riwayat peminjaman tetap ada, orangnya tidak lagi teridentifikasi.

---

## 4. Rancangan

### 4.1 Model ancaman ringkas

| Ancaman | Vektor utama | Kontrol utama |
|---|---|---|
| Kebocoran lintas hak akses | Endpoint tanpa scope; chatbot | `SDD-AUTH-02/07`, `SEC-T-01`, `ST-06` (`RS-10`, `RS-12`) |
| Pengambilalihan akun | Password lemah, pencurian token | Argon2id, 2FA, *reuse detection* ([SDD-04](04-authentication-session.md)) |
| Eskalasi hak akses | Manipulasi permission | Katalog kanonik + permission inti terkunci (`FR-02.2 A1`) |
| Injeksi | Input pengguna ke SQL / prompt | Query terparameterisasi; pemisahan kanal data/instruksi (`AI-SEC-01/02`) |
| Berkas berbahaya | Unggahan | Presign + validasi MIME ganda + AV ([SDD-09](09-file-storage-design.md)) |
| Kebocoran data anak | Foto, chatbot, lingkungan non-produksi | `DP-02`, `DP-05`, `DP-08`, `DP-AI-03` |
| Manipulasi jejak audit | Akses DB langsung | Rantai hash + hak DB terbatas (`AL-03a`, `AL-03b`) |
| Penyalahgunaan kuota AI | Kuota & batas laju penyedia | `AI-CTL-06`, `AI-CTL-08` |

### 4.2 Header keamanan

```
Strict-Transport-Security : max-age=31536000; includeSubDomains; preload
Content-Security-Policy   : default-src 'self';
                            script-src 'self' 'nonce-{random}';
                            style-src  'self' 'nonce-{random}';
                            img-src    'self' data: {object-storage-host};
                            connect-src 'self' {api-host};
                            frame-ancestors 'none'; base-uri 'self'
X-Content-Type-Options    : nosniff
X-Frame-Options           : DENY
Referrer-Policy           : strict-origin-when-cross-origin
Permissions-Policy        : camera=(self), geolocation=(), microphone=()
X-Robots-Tag              : noindex, nofollow      # halaman publik QR saja
```

`camera=(self)` diperlukan untuk pemindaian QR via peramban (`NFR-C-05`); `geolocation=()` ditutup karena tidak dipakai dan konsisten dengan minimisasi data (`MOB-MED-02`).

### 4.3 Rate limiting

| Kelas | Batas | Kunci | Penyimpanan |
|---|---|---|---|
| `default` | 100/menit | user | Redis |
| `login` | 5/15 menit | akun **dan** IP | akun → PostgreSQL, IP → Redis ([SDD-SESS-07](04-authentication-session.md)) |
| `public-asset` | 20/menit | IP | Redis |
| `export` | 10/jam | user | Redis |
| `qr-print` | 5/jam | user | Redis |
| `chat` | 10/menit | user | Redis |
| `upload` | 60/jam | user | Redis |

Header `X-RateLimit-*` selalu disertakan. Redis tidak tersedia → *fail open* untuk kelas non-keamanan, *fail closed* untuk `login` (yang penghitung akunnya di PostgreSQL dan tetap berjalan).

### 4.4 Pengelolaan rahasia

| Rahasia | Rotasi | Catatan |
|---|---|---|
| Kunci penandatangan JWT (Ed25519) | 6 bulan, tumpang tindih | `kid` pada header token (TBD-AUTH-B) |
| Kunci enkripsi TOTP | Tidak dirotasi rutin | Rotasi memerlukan re-enkripsi seluruh secret |
| Kredensial basis data | 6 bulan | Akun aplikasi tanpa DDL (`SEC-CFG-03`) |
| Kunci Gemini API | 12 bulan | Alarm konsumsi kuota & batas laju (`OBS-05`) |
| Kredensial FCM | 12 bulan | |
| Kunci object storage | 12 bulan | |

*Pre-commit hook* dan pemindaian repositori mencegah kebocoran (`SEC-CFG-04`).

### 4.5 Pipeline keamanan

```
pull request  → lint → unit → integration → SAST → SCA → build → image scan → deploy staging
kandidat rilis → DAST terhadap staging
sebelum go-live → penetration test independen (ST-04)  → gerbang GL-04
berkala        → SCA harian; pentest tahunan
```

| Temuan | SLA |
|---|---|
| Critical | Tambal ≤ 7 hari; memblokir rilis |
| High | ≤ 30 hari; memblokir rilis bila ditemukan pentest |
| Medium/Low | Backlog terjadwal |

### 4.6 Uji otorisasi tergenerate

```ts
// Dibangun dari registri route (SDD-AUTH-01)
for (const route of routeRegistry) {
  for (const role of ALL_ROLES) {
    test(`${route.method} ${route.path} sebagai ${role}`, async () => {
      const res = await callAs(role, route);
      expect(res.status).toBe(expectedFor(role, route.permission));
    });
    if (route.hasScope) {
      test(`${route.path} sebagai ${role} atas data orang lain`, async () => {
        expect(await callAsForOthersData(role, route)).toBeDeniedOrEmpty();
      });
    }
  }
}
```

Ditambah `SEC-T-02`: respons untuk role Siswa/OSIS diperiksa **tidak pernah** memuat field finansial, di sisi server.

### 4.7 Pseudonimisasi

```sql
-- DP-04 / DP-10: hak penghapusan tanpa merusak jejak audit
UPDATE users SET
  nama          = 'Pengguna Terhapus #' || id,
  email         = 'deleted+' || id || '@invalid.local',
  nip_nis       = NULL,
  telepon       = NULL,
  work_unit_id  = NULL,
  status        = 'NONAKTIF',
  pseudonymized_at = now()
WHERE id = :id;
-- Baris transaksi, denda, dan activity_logs TIDAK disentuh (AL-03, BR-008)
-- Foto berwajah TIDAK disentuh: tetap bukti (DP-05a, SDD-FS-11)
```

Operasi ini tercatat di activity log dan hanya dapat dijalankan Administrator dengan alasan wajib.

**SDD-SEC-11 — perkakas yang tinggal di tempat pull request dinilai.** `ST-01`…`ST-03` menetapkan tahapnya sejak awal tanpa satu nama pun, sehingga `PR-00-17` tidak dapat menulis pipeline-nya. Kriteria pemilihannya bukan kedalaman analisis melainkan tempat temuannya muncul: temuan keamanan yang berada di sistem lain dari tempat merge diputuskan adalah temuan yang dibaca belakangan, dan `ST-02` justru menuntutnya menghentikan pipeline.

Karena `SDD-INF-12` sudah mengunci GitHub Actions, CodeQL dan Dependabot berada persis di sana — tanpa langganan, tanpa token pihak ketiga, dan tanpa data dependensi meninggalkan penyedia yang sudah dipakai. Itu sekaligus menjawab `SDD-SEC-10`: perkakas yang mengirim kode atau daftar dependensi ke vendor ketiga akan menambah pihak yang tunduk pada batasan residensi, dan **Snyk ditolak** justru pada titik itu, bukan pada kemampuannya. **Semgrep** ditolak lebih tipis — aturan kustomnya menarik, tetapi penegakan aturan repo ini sendiri sudah menjadi milik lint (`SDD-SYS-02`, `SDD-REPO-08`) dan dibuktikan uji negatif; memindahkannya menjadi temuan keamanan hanya memindahkan tempat gagalnya.

Trivy dan OWASP ZAP dipilih karena keduanya berjalan sebagai langkah biasa di dalam workflow: Trivy memindai image yang baru dibangun sebelum ia dipromosikan, ZAP memindai staging setelah ia berdiri (`CD-07` menyusul). Keduanya sumber terbuka dan tidak menambah pihak penerima data.

**SDD-SEC-10 — cakupan kepatuhan sempit, residensi ketat.** Dua bagian keputusan ini menarik ke arah berlawanan dan sebaiknya dibaca bersama.

Cakupan **tidak** diperluas: tidak ada standar formal di luar UU PDP, sehingga lingkup audit Phase 08 tetap `DP-01` … `DP-11` dan tidak bertambah satu kontrol pun. Yang dipersempit justru tempat data boleh berada. Alasannya adalah sifat subjek datanya — sistem ini menyimpan PII anak di bawah umur lewat role Siswa/OSIS (`FR-01.1`), dan `SDD-OBS-09` mengirim log aplikasi berisi PII itu ke layanan terkelola sejak logger dipasang (`PR-00-06`).

Residensi karena itu bukan pembatasan tambahan atas arsitektur yang sudah jadi, melainkan syarat yang memilihkan vendornya. Ia murah bila ditetapkan sekarang — beberapa penyedia besar memiliki region Indonesia — dan mahal bila ditetapkan setelah data mengalir, karena migrasi backend observability berarti kehilangan riwayat, bukan sekadar mengganti endpoint.

`SDD-OBS-04` (*redaction* di formatter) tetap menjadi kontrol yang menyertainya, bukan penggantinya: residensi menetapkan **di mana** data boleh berada, redaction menetapkan **apa** yang boleh ikut. Keduanya diperlukan.

---

## 5. Konsekuensi

- CSP tanpa `unsafe-inline` mengharuskan *build* frontend menyuntikkan nonce; pustaka pihak ketiga yang menulis gaya inline harus dihindari atau dibungkus.
- Enkripsi aplikasi pada secret TOTP menjadikan kunci itu artefak paling kritis di sistem: kehilangannya memaksa pendaftaran ulang 2FA seluruh role sensitif.
- Matriks uji tergenerate berarti jumlah kasus uji tumbuh otomatis; waktu CI perlu dipantau seiring bertambahnya endpoint.
- Pentest sebagai gerbang rilis (`GL-04`) memerlukan penjadwalan pihak ketiga pada M6 — ini dependensi eksternal pada jadwal, bukan tugas tim.
- Residensi Indonesia (`SDD-SEC-10`) menjadi kriteria seleksi pada setiap pemilihan layanan pihak ketiga yang menerima data — backend observability (`PR-00-06`), penyedia infrastruktur (`SDD-INF-11`), dan object storage. Kriteria ini diperiksa **sebelum** kontrak, dan hasil pemeriksaannya dicatat.

---

## 6. Risiko Teknis

| Risiko | Dampak | Mitigasi |
|---|---|---|
| Kunci enkripsi TOTP hilang | 2FA seluruh role sensitif harus didaftarkan ulang | Kunci dicadangkan terpisah dari basis data; prosedur pendaftaran ulang massal terdokumentasi |
| Redis mati → rate limit lumpuh | Endpoint terbuka terhadap penyalahgunaan | `login` tetap terlindungi (penghitung di PostgreSQL); kelas lain *fail open* dengan alarm |
| CSP terlalu ketat memutus fitur | Peramban memblokir skrip sah | CSP diuji pada seluruh halaman utama di staging sebelum produksi |
| Temuan pentest terlambat | Rilis tertunda | Pentest dijadwalkan awal M6, bukan akhir |
| Rantai hash log menjadi leher botol | Latensi tulis naik | Volume log rendah; bila terbukti bermasalah, perhitungan dipindah ke batch asinkron |
| Pseudonimisasi dijalankan keliru | Data hilang tak terpulihkan | Operasi satu arah — memerlukan konfirmasi ganda dan alasan; tercatat permanen |
| Layanan pihak ketiga memindahkan data ke region lain | Residensi `SDD-SEC-10` terlanggar tanpa disadari | Region dinyatakan dalam kontrak dan diverifikasi ulang saat kunci/kredensial dirotasi (§4.4) |

---

## 7. Requirement Terkait

`NFR-S-01` … `NFR-S-18` · `ST-01` … `ST-07` · `SEC-T-01` … `SEC-T-06` ·
`DP-01` … `DP-11` · `DP-AI-01` … `DP-AI-05` · `AL-01` … `AL-10` · `SEC-CFG-01` … `SEC-CFG-04` ·
`BR-070` `BR-071` `BR-072` `BR-073` `BR-008` · `NFR-C-05` · `GL-04` `GL-05` `GL-07` · `RS-10` `RS-12` `RS-13`

---

## 8. TBD

| ID | Pertanyaan |
|---|---|
| **TBD-SEC-A** | Penyedia pentest independen dan anggarannya belum ditetapkan — ini dependensi jadwal pada `GL-04`. |

**Tertutup 25 Agustus 2026:** `TBD-SEC-B` → `SDD-SEC-10` · `TBD-FS-A` → `SDD-FS-11` (`DP-05a`). Seluruh TBD berkas ini tertutup.
