# Smoke pasca-deploy ? PR-03-36

Rujukan: [CD-07](../../PRD/03-architecture/deployment-ops.md#274-cicd--manajemen-rilis), [SDD-16 ?4.3](../../SDD/16-infrastructure-deployment.md). Skrip dijalankan dari runner/mesin di luar VPS terhadap origin HTTPS staging. Memerlukan Bash, curl dan Python 3 standar, tanpa paket tambahan.

```bash
bash deploy/staging/smoke-test.sh https://staging.contoh.sch.id --full
```

Mode default juga penuh. `--health-only` memeriksa kesehatan, header proxy dan amplop 404 saja; hasil ini tidak membuktikan lima alur CD-07. Tidak ada fallback otomatis bila konfigurasi belum lengkap.

| Environment staging | Penyimpanan | Isi |
|---|---|---|
| `SMOKE_EMAIL`, `SMOKE_PASSWORD` | GitHub environment secrets | Login akun Petugas khusus bernama `[SMOKE] ?`; password awal telah diganti |
| `SMOKE_TOTP_SECRET` | GitHub environment secret, bila 2FA aktif | Secret base32 akun fixture; bukan kode OTP sementara |
| `SMOKE_ROOM_ID` | GitHub environment variable | ID ruangan khusus bernama `[SMOKE] ?` |
| `SMOKE_ASSET_UUID` | GitHub environment variable | UUID QR aset khusus bernama `[SMOKE] ?` |
| `SMOKE_START_HOUR_WIB` | GitHub environment variable, opsional | Jam mulai HH:MM, default 09:00 WIB |
| `SMOKE_CA_FILE` | Environment lokal, opsional | CA tepercaya tambahan untuk Python; curl memakai konfigurasi CA sistem |
| `SMOKE_PYTHON` | Environment lokal, opsional | Executable Python 3, default python3 |

Jangan memasukkan password/token/TOTP ke argumen perintah, berkas fixture, log, atau artefak CI. Workflow membaca secrets environment `staging`; tidak menyediakan kredensial bawaan. Hindari shell tracing. Skrip tidak mencetak body respons, token, URL presigned, email, atau password.

1. Administrator menyiapkan akun Petugas aktif khusus staging. Izin yang dibutuhkan: `asset.view`, `location.view`, `reservation.view`, `reservation.create`, `reservation.cancel_own`, `damage.view/create/verify`; scope harus mencakup fixture dan transaksi milik akun. Akun tidak boleh dipakai untuk pekerjaan operasional.
2. Siapkan ruangan `[SMOKE]` aktif, dapat direservasi, kapasitas ?1, di gedung/area aktif. Kalender/jam operasional harus menyediakan slot 30 menit pada hari kerja dalam 7?20 hari mendatang pada jam konfigurasi. Administrator wajib mengisi parameter operasional `denda.ambang_blokir`; konfigurasi kosong ditolak oleh gerbang kewajiban pemohon. Siapkan aturan approval aktif beserta approver lain yang memenuhi syarat; jangan menjadikan akun pemohon satu-satunya approver.
3. Siapkan aset `[SMOKE]` aktif, kategori/lokasi valid, belum dihapuskan, tanpa tiket terbuka. Simpan UUID QR saat ini; regenerasi QR mengharuskan pembaruan variable staging. Unggah memakai foto PNG sintetis 1?1 dengan deskripsi bahwa ini uji otomatis.
4. Isi secrets/variables lalu jalankan mode penuh. Script memeriksa login, pencarian exact fixture, resolusi QR, preview/pengajuan reservasi lewat idempotency key baru dan tiket kerusakan beserta presign/PUT/confirm foto. HTTP redirect ditolak dan upload tidak membawa Bearer API.
5. Script selalu mencoba penutupan tiket lewat Perbaikan Ringan (tanpa `kondisi_aset`), pembatalan reservasi milik run dengan alasan `[SMOKE]`, lalu logout. Balasan POST yang hilang dipulihkan lewat marker UUID unik sebelum pembersihan; tidak ada pengulangan transaksi otomatis. Reservasi, tiket, foto dan audit tetap tersimpan, tidak dihapus.

Jika pembersihan gagal, gerbang gagal. Operator memeriksa ID/marker run pada daftar reservasi dan tiket, membatalkan reservasi `[SMOKE]` yang masih aktif, serta menutup tiket fixture melalui keputusan yang ditetapkan CD-07 sebelum menjalankan ulang. Jangan menutup tiket lain hanya karena berada pada aset yang sama. Run yang dihentikan paksa/mesin mati mungkin tidak sempat menjalankan pembersihan; proses berikutnya menolak fixture dengan tiket terbuka. Deployment staging diserialkan oleh concurrency workflow agar dua run tidak memakai fixture yang sama bersamaan.

Untuk pemeriksaan lokal saja, `SMOKE_ALLOW_HTTP_LOOPBACK=1` mengizinkan HTTP localhost/127.0.0.1/::1. Ini bukan bukti DNS/TLS/Nginx atau storage/AV staging. `SMOKE_CURL_OPTS=-k` tetap hanya untuk diagnostik kesehatan staging tiruan; mode penuh memverifikasi TLS Python secara normal.

Pengujian otomatis lokal: jalankan `python scripts/qa/smoke-critical.test.py` dan suite integrasi `permission-live-session.test.ts` / `smoke-critical.test.ts` lewat konfigurasi API yang ada pada database/cache uji khusus. Di Windows, `SMOKE_BASH` pada proses Vitest dapat menunjuk executable Git Bash; ini hanya konfigurasi harness uji. Jangan arahkan suite integrasi ke database aplikasi.
