# Log Phase 06 — Analitik

| | |
|---|---|
| **Phase** | [`phases/phase-06.md`](../phases/phase-06.md) |
| **Milestone PRD** | `M5 — **menutup M5**` |
| **Status** | Lihat [`IMPLEMENTATION-STATUS.md`](../IMPLEMENTATION-STATUS.md) |
| **Mulai** | — |
| **Selesai** | — |

Log ini mencatat **apa yang benar-benar terjadi** selama phase berjalan: keputusan yang diambil, hal yang berbeda dari rencana, dan angka hasil pengukuran. Ia bukan salinan rencana — rencananya ada di [`phases/phase-06.md`](../phases/phase-06.md).

Log tidak boleh memuat requirement, keputusan desain, maupun business rule baru. Bila selama phase muncul kebutuhan akan salah satunya, ia dinaikkan ke PRD atau SDD lebih dulu, dan log ini hanya mencatat bahwa hal itu terjadi.

---

## 1. Catatan harian

| Tanggal | Yang terjadi | PR terkait |
|---|---|---|
| 24 Oktober 2026 | PR Phase 06 dari pekerjaan lokal dibuka bersama Phase 03–06 sebagai satu PR [#182](https://github.com/HanzzzBD/SIGM4/pull/182) — penyimpangan, keputusan, masalah, dan hasil ukur dicatat sekali di [log phase-03](phase-03.md) §1–§3, §7, §8 (keputusan 26–29). | #182 |

## 2. Keputusan yang diambil

Keputusan teknis yang tidak berasal dari PRD maupun SDD, dan alasannya. Bila sebuah keputusan ternyata menyentuh requirement atau desain, ia **wajib** dinaikkan ke PRD/SDD, bukan diselesaikan di sini.

| # | Keputusan | Alasan | Menaikkan ke PRD/SDD? |
|:---:|---|---|:---:|
| — | — | — | — |

## 3. Penyimpangan dari rencana

| Yang direncanakan | Yang dikerjakan | Sebab | Dampak pada phase berikutnya |
|---|---|---|---|
| — | — | — | — |

## 4. PR di luar rencana

PR yang tidak ada pada daftar [`phase-06.md` §7](../phases/phase-06.md).

| ID | Judul | Mengapa tidak terencana |
|---|---|---|
| — | — | — |

Kolom ketiga adalah yang paling berharga di seluruh log ini. Pola yang berulang di sana menunjukkan di mana perencanaan phase berikutnya perlu diperbaiki.

## 5. Butir yang wajib tercatat pada phase ini

- [ ] Hasil rekonsiliasi silang angka laporan terhadap data operasional — bukan sekadar 'tidak galat'
- [x] Rencana kueri sebelum & sesudah penambahan indeks (`PR-06-09`) — bukti lokal pada audit PR-06-08…11
- [x] Nilai `TBD-PERF-A` hasil kalibrasi M-16: katalog 0, opsi 1, laporan 1 SQL data; domain lain tetap terbuka
- [ ] Kriteria keluar `M5` terverifikasi: dashboard ≤ 3 detik pada 5.000 aset; chatbot lolos golden set & red-teaming (`ST-06`)

## 6. TBD yang tertutup

| TBD | Keputusan | Diputuskan oleh | Tanggal |
|---|---|---|---|
| — | — | — | — |

Setiap TBD yang tertutup wajib juga diperbarui di [`../../SDD/TBD-REGISTER.md`](../../SDD/TBD-REGISTER.md). Menutupnya hanya di sini membuat register menjadi salah.

## 7. Masalah yang ditemukan

| Masalah | Dampak | Penyelesaian | Terbuka? |
|---|---|---|:---:|
| — | — | — | — |

## 8. Hasil pengukuran

Angka nyata, bukan perkiraan. Kosongkan bila belum diukur — jangan diisi tebakan.

| Yang diukur | Target | Hasil | Rujukan |
|---|---|---|---|
| — | — | — | — |

## 9. Gerbang keluar

Diisi saat phase dinyatakan selesai. Daftar lengkapnya ada di [`phase-06.md` §9 dan §12](../phases/phase-06.md).

- [ ] Seluruh 11 PR tergabung
- [ ] Acceptance checklist phase terpenuhi
- [ ] Definition of Done phase terpenuhi
- [ ] Bagian 5 log ini terisi seluruhnya
- [ ] [`IMPLEMENTATION-STATUS.md`](../IMPLEMENTATION-STATUS.md) diperbarui

## 10. Yang diserahkan ke phase berikutnya

Hal yang sengaja ditinggalkan terbuka, beserta di mana ia akan ditutup.

| Yang ditinggalkan | Ditutup di | Alasan penundaan |
|---|---|---|
| — | — | — |

---

*Log ini mencatat pelaksanaan. Requirement tetap milik [PRD](../../PRD/), keputusan desain tetap milik [SDD](../../SDD/).*

### Implementasi lokal PR-06-01/02 — 14 Oktober 2026

Empat jawaban AskUserQuestion dicatat pada PRD M-16: periode WIB/366 hari,
izin domain + irisan scope, fondasi delapan jenis tanpa angka semu, dan pemetaan
own berdasarkan subjek. Kontrak query/response/ekspor, katalog, registry provider,
router/OpenAPI, scope SQL/finansial, pagination dari rowset sama, satu snapshot
CTE dan transaksi read-only tersedia lokal. Report own tidak memaksa pemilik
semua dimensi join; scope domain pada dimensi tetap mengikat.

7 integrasi PostgreSQL dan 42 unit/kontrak/regresi unik lulus (49 total).
Typecheck workspace/tests API, lint, batas impor dan validasi dokumen lulus.
DB uji port 55443 terpisah dan dibersihkan; tidak ada migration aplikasi atau
provider produksi yang mengisi angka sebelum PR-06-03…07. Ekspor PR-06-08,
EXPLAIN/performa PR-06-09 dan UI PR-06-10 tetap terjadwal.

[audit](../audits/pr-06-01-02-local-2026-10-14.md) memuat bukti, perbaikan run awal,
kontrak handoff dan batas validasi. Status In Progress sampai review/CI/staging;
tidak membuat commit/PR remote, merge atau deployment. Pekerjaan sesi lain
pada entrypoint, skema, status/log dan indeks dokumen dipertahankan.

### Implementasi lokal PR-06-03/04/05/06/07 — 14–15 Oktober 2026

Tujuh jawaban AskUserQuestion dinaikkan ke PRD M-16: utilisasi nyata/kalender,
snapshot kondisi, kebijakan hari pinjaman, pengakuan biaya verifikasi WO,
kekurangan permintaan belum terukur, delapan jenis termasuk Bahan/ringkasan
tambahan berizin, serta penembusan minimum memakai ambang sekarang. SDD auth
dan performa menjelaskan predicate tambahan, pembatasan indikator global,
provider murni, multirange/snapshot dan DECIMAL numeric-sort/string-response.

Delapan provider produksi terdaftar. Rekonsiliasi memeriksa histori kondisi,
penghapusan/pemulihan, slot terealisasi tanpa hold/batal, jam kerja/libur,
pengembalian sebagian/perpanjangan, WO terverifikasi/rincian, penyerahan bahan
nyata dan dua penembusan minimum lintas lokasi. Minimum global tidak dibaca pada
scope pemohon terbatas; finansial dan companion tanpa izin tidak di-SELECT.

18 integration + 37 unit/kontrak + 5 Clock backend dan 10 UI analitik sesi lain
lulus (70 unik). Coverage integration M-16 77,63% statements / 85,16% lines /
74,35% functions / 81,72% branches. Typecheck workspace/tests API, lint perubahan
dan 14 pembuktian batas impor lulus. Database sementara port 55445 dibersihkan;
tidak menjalankan migration database aplikasi atau menambah migration batch ini.

Kegagalan snapshot route/OpenAPI awal diperbaiki dengan tujuh route/permission
ekspor/options eksplisit dari sesi lain; kontrak diulang dan lulus. Perbaikan
tipe schema body kerusakan dan query router dijelaskan pada
[audit](../audits/pr-06-03-04-05-06-07-local-2026-10-15.md). Perubahan sesi lain
dipertahankan, termasuk optimasi facility-aggregation PR-06-09 yang ikut teruji.

Batch lima PR dan Konsumsi Bahan merupakan cakupan eksplisit pengguna; skala L
tetap dibagi dalam berkas provider per domain. Status PR-06-03…07 In Progress
sampai review/CI/staging. Pengukuran target/performa/k6, ekspor dan UI lanjut
adalah PR-06-09/08/10/11 sesi lain; angka dari fixture kecil bukan klaim p95.
Tidak membuat commit, push, PR remote, merge atau deployment.

### Implementasi lokal PR-06-08/09/10/11 — 15 Oktober 2026

Empat keputusan AskUserQuestion dinaikkan ke PRD/UX/SDD: ekspor worker dengan
batas baris/umur file/pemeriksaan izin, kolom operasional, pengecualian sequential
scan agregasi penuh dan konfigurasi kop sekolah. Migration 0070 menambah job
privat/owner/identitas; 0071 menambah indeks pemilik aset yang dibuktikan EXPLAIN.
Database aplikasi belum dimigrasi. Seluruh perubahan provider sesi PR-06-03…07
dipertahankan, termasuk rekonsiliasi angka terhadap optimasi fasilitas.

HTTP 202, rendering XLSX/PDF, audit/NT-42, unduh privat, pembatalan saat scope
berubah, retry/kompensasi dan cleanup tersedia. P-58/P-59 serta panel P-30/P-39
memakai filter/urut kanonik, nilai desimal presisi, tabel/grafik aksesibel,
pemisahan satuan bahan dan cache per akun/grant. PDF meminta nama sekolah;
XLSX tetap dapat dibuat sebelum identitas diisi.

94 uji unik backend/web lulus: 29 integrasi PostgreSQL, 40 unit/kontrak backend
dan 25 web. Tambahan 20 kasus Chromium pada lima halaman × empat viewport
lulus axe termasuk kontras/keyboard, tanpa overflow halaman atau galat JS.
Typecheck workspace/tests API/web, lint, build web dan batas impor lulus.
Pengujian ekspor memakai PostgreSQL lokal sementara port 55448 dan dibersihkan.
Perbaikan race pembatalan saat rendering, SLA transform, tipe URL dan layout
320 px diuji ulang; file/log/event tidak dipublikasikan dari job yang dibatalkan.

EXPLAIN memakai 105.001 aset/riwayat, 5.000 aset target dan 5.000 transaksi per
domain. Lima sampel layanan per jenis mencatat 1 SQL data; p95 empiris lokal
tertinggi fasilitas 970,6 ms setelah materialisasi kalender/kapasitas, dibanding
baseline statement gabungan 37,65 detik. Kueri own 1.050 aset turun 623,398 ms
menjadi 25,592 ms dengan Bitmap/Index Scan. Kalibrasi TBD-PERF-A hanya M-16;
ini bukan pengukuran HTTP ujung ke ujung atau beban staging/150 pengguna.

[Audit](../audits/pr-06-08-09-10-11-local-2026-10-15.md) memuat keputusan,
implementasi, bukti SQL sebelum/sesudah, hasil semua jenis, batas adapter storage
uji dan serah terima. Status empat PR In Progress menunggu review/CI/staging;
tidak menyatakan M5 selesai, tidak membuat commit/push/PR remote/deployment.

## 15 Oktober 2026 - Dataset dan panduan demonstrasi lokal

Atas permintaan pengguna, ditambahkan seed lintas modul dan panduan presentasi di [Panduan Demonstrasi](../../DEMO/ALUR-DEMONSTRASI.md). Database lokal sigm4 berisi 7 akun demo, 3 gedung, 10 ruangan, 48 aset, 11 reservasi, 3 peminjaman, 3 kerusakan, 2 work order, 2 sesi opname, 3 pengadaan, 1 penghapusan, 8 bahan, 3 permintaan bahan, dan 6 aturan persetujuan yang dibatasi pemohon demo. Parameter yang sudah terisi dan progres transaksi lama dipertahankan.

Lampiran nyata: dua dokumen aset, ilustrasi bukti, spesifikasi pengadaan, label QR PDF, serta CSV impor pengguna/aset/jadwal. Enam objek privat disimpan ke MinIO lokal setelah lolos ClamAV; seed ulang menambah nol duplikat. Pemeriksaan 23 endpoint operasional lulus. Verifikasi saldo ledger, snapshot penghapusan, aturan DSL, checksum storage, dan audit sejak seed pertama lulus. Log fixture lama sebelum seed tidak lolos pemeriksaan global; tidak diubah atau ditulis ulang. Akun/password/kode aktivasi 2FA tersimpan di tmp/demo yang diabaikan Git; 2FA R-01/R-03 tetap wajib. Panduan mencakup alur 25-30 menit, versi 10 menit, narasi, dan cakupan 22 modul. Tidak mengklaim Gemini langsung, push, atau native offline sudah diuji. Tidak mengubah status PR/phase atau memublikasikan perubahan remote.

## 15 Oktober 2026 - UI mobile dan Gemini 3.5 Flash Lite

Ikon tab/menu/tombol dan tata letak native diperbarui; persetujuan pemrosesan chat terlihat langsung di web/mobile dan informasi kuota tetap tersedia. Model lokal berubah ke `gemini-3.5-flash-lite` sesuai permintaan pengguna dengan audit pengaturan dan penanganan HTTP 429 yang jelas. Tes demo Gemini melalui API platform Android dan browser berhasil setelah izin eksplisit pengguna. Build/typecheck, sembilan tes provider, lima tes web, 90 tes mobile (timeout diperlonggar untuk opname SQLite), lint mobile/API terkait, dan bundle Metro Android lulus. Uji visual native belum tersedia: tidak ada perangkat tersambung dan emulator kekurangan ruang disk. Rincian/batas verifikasi di [audit UI dan chat](../audits/mobile-ui-chat-flash-lite-2026-10-15.md). Tidak mengubah status PR atau memublikasikan perubahan remote.
