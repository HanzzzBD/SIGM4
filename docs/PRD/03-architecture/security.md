# Keamanan

> Gabungan Bab 9.2 (Security NFR) dan Bab 28.5 (Pengujian Keamanan & Manajemen Kerentanan).

---

## 9.2 Security

| Kode | Requirement |
|---|---|
| NFR-S-01 | Seluruh komunikasi memakai HTTPS/TLS 1.2 atau lebih tinggi; HTTP dialihkan ke HTTPS |
| NFR-S-02 | Password disimpan dengan hash bcrypt (cost ≥ 12) atau Argon2id; tidak pernah disimpan dalam bentuk terbaca |
| NFR-S-03 | Autentikasi memakai JWT: *access token* 60 menit, *refresh token* dengan rotasi dan pencabutan. **Deteksi penggunaan ulang** (*reuse detection*) wajib: bila refresh token yang sudah dirotasi dipakai kembali, seluruh sesi pengguna tersebut dicabut dan insiden dicatat sebagai anomali keamanan |
| NFR-S-03a | Password: minimal 12 karakter, diperiksa terhadap daftar password bocor, tidak boleh sama dengan 3 password terakhir, dan tidak memuat identitas pengguna |
| NFR-S-03b | Akun yang tidak pernah login selama 180 hari dinonaktifkan otomatis; Administrator dinotifikasi dan dapat mengaktifkannya kembali |
| NFR-S-03c | Enkripsi *at-rest* wajib pada basis data, cadangan, dan object storage (DP-06) |
| NFR-S-03d | Activity log memakai **rantai hash** (*hash chain*): setiap entri menyimpan hash entri sebelumnya, sehingga penyuntingan langsung di basis data dapat terdeteksi. Verifikasi integritas dijalankan sebagai pekerjaan harian dan menghasilkan alarm bila rantai terputus |
| NFR-S-04 | 2FA berbasis TOTP wajib bagi role Administrator dan Pimpinan Sekolah |
| NFR-S-05 | Otorisasi diperiksa di sisi server pada **setiap** endpoint; UI tidak dijadikan satu-satunya penjaga akses |
| NFR-S-06 | Perlindungan terhadap OWASP Top 10: SQL Injection (query terparameterisasi/ORM), XSS (sanitasi input & escaping output), CSRF (token pada web), SSRF, dan *insecure direct object reference* |
| NFR-S-07 | Rate limiting **berjenjang per kelas endpoint**, bukan satu batas global: umum 100 permintaan/menit per pengguna · login 5 percobaan/15 menit per akun dan per IP · halaman publik aset 20/menit per IP · ekspor & laporan 10/jam per pengguna · cetak QR massal 5/jam per pengguna · chatbot 10 pesan/menit per pengguna (AI-CTL-06) · unggah berkas 60/jam per pengguna. Header `X-RateLimit-*` disertakan pada seluruh respons |
| NFR-S-08 | Berkas unggahan divalidasi jenis MIME dan ekstensi, dipindai anti-malware, disimpan di luar *web root*, dan diakses melalui URL bertanda tangan berbatas waktu |
| NFR-S-09 | Token mobile disimpan pada Keychain (iOS) / Keystore (Android), bukan pada penyimpanan biasa |
| NFR-S-10 | Data sensitif tidak pernah muncul di log aplikasi maupun activity log |
| NFR-S-11 | Header keamanan diaktifkan: HSTS, X-Content-Type-Options, X-Frame-Options, Content-Security-Policy |
| NFR-S-12 | Prinsip *least privilege* diterapkan pada akun basis data dan layanan penyimpanan berkas |
| NFR-S-13 | Kredensial dan API key disimpan sebagai variabel lingkungan/secret manager, tidak di dalam repositori |
| NFR-S-14 | Chatbot AI hanya memiliki akses baca dan tunduk pada filter permission di lapisan data |
| NFR-S-15 | Data pribadi siswa dan pegawai hanya dapat diakses sesuai matriks permission (Bab 18) |
| NFR-S-16 | Aktivitas keamanan (login gagal, penguncian akun, perubahan role, reset 2FA, break-glass) tercatat dan dapat dipantau |
| NFR-S-17 | Pengujian keamanan otomatis (SAST, SCA, DAST) terpasang di pipeline, dan penetration test independen menjadi gerbang rilis (Bab 28.5) |
| NFR-S-18 | Berkas unggahan tidak dapat diunduh sebelum pemindaian anti-malware selesai berstatus `clean` (17.5 poin 6) |


---

## 28.5 Pengujian Keamanan & Manajemen Kerentanan

| Kode | Requirement |
|---|---|
| ST-01 | **SAST** dijalankan pada setiap *pull request* |
| ST-02 | **SCA / dependency scanning** harian; kerentanan *Critical* ditambal ≤ 7 hari, *High* ≤ 30 hari |
| ST-03 | **DAST** dijalankan terhadap staging pada setiap kandidat rilis |
| ST-04 | **Penetration test** oleh pihak independen wajib dilakukan sebelum go-live dan diulang tahunan; temuan *High/Critical* adalah penghambat rilis |
| ST-05 | **Uji otorisasi per role wajib**: untuk setiap endpoint, diuji akses oleh ketujuh role guna membuktikan tidak ada IDOR maupun kebocoran lintas hak akses (menutup RS-10 dan RS-12) |
| ST-06 | **Red-teaming chatbot** per role sebelum rilis: percobaan ekstraksi data di luar hak akses, percobaan memaksa aksi tulis, dan *prompt injection* melalui data (Bab 22.9) |
| ST-07 | Proses penerimaan laporan kerentanan dan SLA penanganannya ditetapkan dan dipublikasikan |

---
