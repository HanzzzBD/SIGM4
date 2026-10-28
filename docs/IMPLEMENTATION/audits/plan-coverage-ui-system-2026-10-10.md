# Audit cakupan UI dan gap sistem — 10 Oktober 2026

Audit lokal terhadap inventaris UX, sembilan rencana phase, log pelaksanaan, audit closure Phase 00–02, dan registri route web. Audit ini tidak mengubah requirement, menetapkan nomor PR baru, atau memverifikasi status GitHub. Status pelaksanaan tetap milik [IMPLEMENTATION-STATUS.md](../IMPLEMENTATION-STATUS.md).

## Hasil dan cara menghitung

| Ukuran | Jumlah | Makna |
|---|---:|---|
| Inventaris halaman web | 87 | P-01 sampai P-87 |
| Inventaris layar mobile | 23 | MS-01 sampai MS-23 |
| Halaman web dengan route terdaftar dan PR asal yang dapat ditelusuri | 17 | Ini bukti route dan pemilik pekerjaan, bukan verifikasi seluruh AC UI |
| Halaman web tambahan yang cakupan UI-nya dapat ditautkan ke PR mendatang | 6 | P-07, P-28, P-45, P-46, P-58, P-59; sebagian merupakan pemetaan berdasarkan FR, dijelaskan di bawah |
| Halaman web yang belum mempunyai penetapan cakupan UI yang tegas | **64** | Bisa memerlukan PR baru atau rincian scope PR yang sudah ada |
| Layar mobile yang cakupannya dapat ditautkan ke PR mendatang | 7 | MS-04, MS-16, MS-17, MS-18, MS-19, MS-22, MS-23 |
| Layar mobile yang belum mempunyai penetapan cakupan UI yang tegas | **16** | GAP-05-MOBILE mempunyai owner dan tenggat, tetapi belum memecah seluruh layar menjadi PR |
| Total layar yang perlu pemetaan/perincian PR UI | **80** | 64 web + 16 mobile; bukan 80 PR baru |
| Gap sistem/kontrak/pengujian tanpa PR penutup spesifik | **19 butir teridentifikasi** | Deduplikasi temuan log dan audit closure; bukan klaim bahwa semua requirement sistem telah diaudit baris demi baris |
| Pertanyaan produk yang belum ditetapkan | **6 butir** | Dihitung terpisah karena sebagian bersifat opsional; bukan requirement baru yang sudah disetujui |

Angka UI mengukur **kejelasan pemilik implementasi UI**, bukan sekadar ada/tidaknya teks ID halaman dalam rencana. Referensi FR pada PR backend, judul modul, endpoint, atau tautan menuju layar belum membuktikan bahwa pembuatan layar itu termasuk scope PR. Sebaliknya, PR yang jelas membangun UI diberi cakupan konservatif berdasarkan FR terkait meskipun ID halamannya belum tertulis.

Sumber utama: [inventaris UX](../../UX/PAGE-SPECIFICATION.md), [rencana phase](../phases/), [log Phase 01](../logs/phase-01.md), [log Phase 02](../logs/phase-02.md), [log Phase 03](../logs/phase-03.md), dan [audit closure terdahulu §6](closure-phase-00-02-2026-10-07.md#6-gap-task-owner-dependency-dan-bukti-penutupan).

## UI yang sudah mempunyai pemilik

| Halaman web | PR pemilik | Dasar |
|---|---|---|
| P-01, P-08–P-12 | PR-02-30 | Rencana Phase 02 dan keputusan 83 log Phase 02 |
| P-02, P-03, P-05 | PR-02-36 | Alur masuk web disebut eksplisit |
| P-68, P-69 | PR-02-34 | Layar konfigurasi approval disebut eksplisit |
| P-17 | PR-02-38 | Frontend impor aset tercantum dalam acceptance |
| P-20 | PR-02-39 | Form mutasi dan status/unduh PDF tercantum eksplisit |
| P-27 | PR-03-09; tambahan panel PR-03-13 | Kalender dan panel blokade tercantum eksplisit |
| P-29 | PR-03-10 | Wizard pengajuan disebut dalam acceptance |
| P-30, P-31 | PR-03-27 | Daftar/detail dan drawer disebut eksplisit |

Ketujuh belas ID tersebut juga ada dalam [HALAMAN_TERDAFTAR](../../../apps/web/src/shared/navigasi/index.ts). Audit tidak menjalankan aplikasi atau menguji kualitas layar.

Enam halaman web berikut **tidak dihitung sebagai gap**, dengan pemetaan konservatif berdasarkan cakupan yang tertulis:

| Halaman web | PR | Batas bukti |
|---|---|---|
| P-07 | PR-08-12 | Pemberitahuan privasi dan alur persetujuan; ID halaman perlu ditegaskan |
| P-28 | PR-04-04 | Kalender/pencarian ketersediaan aset dinyatakan sebagai UI; pemetaan P-28 berdasarkan FR-08.1 |
| P-45, P-46 | PR-04-07 | Acceptance menyebut Frontend maintenance dan alur jadwal; cakupan kedua halaman berdasarkan FR-12.2, perlu dirinci |
| P-58, P-59 | PR-06-10 | Visualisasi laporan dinyatakan sebagai UI; pemetaan kedua halaman berdasarkan FR-16.1 |

Tujuh layar mobile berikut **tidak dihitung sebagai gap**, dengan pemetaan berdasarkan fitur yang eksplisit menyebut mobile:

| Layar mobile | PR | Dasar |
|---|---|---|
| MS-04 | PR-08-13 | Versi paksa/pembaruan wajib |
| MS-16, MS-17 | PR-04-08 | Work order teknisi di mobile; pemetaan berdasarkan FR-12.3 |
| MS-18, MS-19 | PR-04-12 | Pelaksanaan opname melalui pemindaian mobile; FR-13.2 |
| MS-22, MS-23 | PR-05-24 | Kedua ID layar disebut eksplisit |

## 64 halaman web yang perlu penetapan scope UI

| Kelompok | Halaman | Jumlah | Temuan |
|---|---|---:|---|
| Auth, profil, keamanan, sesi | P-04, P-67, P-76, P-77, P-79 | 5 | API tersedia/direncanakan; GAP-02-WEB-AUTH belum memiliki PR UI penutup |
| Notifikasi | P-13, P-78 | 2 | GAP-02-WEB-NOTIFICATIONS; termasuk lonceng, SSE/polling dan preferensi |
| Chatbot | P-14, P-75 | 2 | PR-03-20–23 membagi kemampuan inti; scope pembuatan layar belum tegas |
| Aset, QR, dokumen | P-06, P-15, P-16, P-18, P-19, P-21, P-24, P-25, P-26 | 9 | Backend QR/dokumen/detail aset tidak menetapkan pemilik semua layar; termasuk GAP-02-WEB-ASSETS |
| Lokasi | P-22, P-23 | 2 | GAP-01-WEB-LOCATIONS; P-23 secara eksplisit menunggu PR baru, keputusan 19a |
| Peminjaman dan denda | P-32–P-36 | 5 | Fitur Phase 05 ada; layar belum dirinci. P-34 secara eksplisit menunggu PR baru, keputusan 18 |
| Persetujuan | P-37, P-38 | 2 | GAP-02-WEB-APPROVAL; UI rules P-68/P-69 tidak menutup dua layar ini |
| Kerusakan | P-39–P-41 | 3 | Keputusan 20a/21a: PR-03-14/15 API; PR UI baru setelah PR-03-16 belum diberi nomor |
| Work order | P-42–P-44 | 3 | PR backend/mobile tersedia; scope layar web belum tegas |
| Stock opname | P-47–P-50 | 4 | PR operasi opname tersedia; scope halaman web belum tegas |
| Pengadaan | P-51–P-54 | 4 | PR-03-17–19 membagi operasi pengadaan; cakupan layar belum dirinci |
| Penghapusan | P-55–P-57 | 3 | Fitur Phase 05 ada; cakupan layar belum dirinci |
| Pengguna dan role | P-60–P-66 | 7 | GAP-01-WEB-USERS; PR backend pengguna/role bukan pemilik UI yang sudah ditetapkan |
| Pengaturan dan master | P-70–P-72 | 3 | GAP-01-WEB-SETTINGS; PR-01-18 secara eksplisit membangun endpoint |
| Activity log | P-73, P-74 | 2 | GAP-01-WEB-LOG |
| Bahan | P-80–P-87 | 8 | Fitur bahan Phase 05 ada; scope pembuatan delapan halaman belum tegas |
| **Total** | | **64** | |

## 16 layar mobile yang perlu penetapan scope UI

| Kelompok | Layar | Jumlah | Temuan |
|---|---|---:|---|
| Login dan gerbang sesi | MS-01–MS-03 | 3 | GAP-05-MOBILE; belum ada PR fondasi mobile bernomor |
| Beranda dan tugas | MS-05, MS-06 | 2 | GAP-05-MOBILE; belum dirinci per layar |
| QR dan detail aset | MS-07–MS-09 | 3 | API/pola scan ada; pembuatan layar belum dipetakan tegas |
| Serah terima, kembali, peminjaman, denda | MS-10–MS-14 | 5 | PR operasi Phase 05 ada; scope layar mobile belum tegas |
| Lapor kerusakan | MS-15 | 1 | Keputusan 20a: fondasi mobile/antrean upload; belum ada PR pemilik khusus |
| Persetujuan | MS-20 | 1 | GAP-05-MOBILE; API decide tersedia, PR layar belum ditetapkan |
| Chatbot | MS-21 | 1 | FR-19.1 mewajibkan mobile; PR layar belum ditetapkan eksplisit |
| **Total** | | **16** | |

Panel chatbot global dan pencarian global topbar bukan halaman tersendiri. Keduanya perlu scope tambahan pada paket UI pemilik (chatbot dan P-15). Lonceng notifikasi dan drill-down dashboard juga perlu ditutup bersama paket UI terkait. Komponen tersebut **tidak ditambahkan ke angka 80** agar hitungan layar tidak bercampur dengan komponen/alur.

## 19 gap sistem/kontrak/pengujian tanpa PR penutup spesifik

Sebuah GAP dengan owner/tenggat sudah merupakan pencatatan pekerjaan. Tabel berikut berarti **belum ada PR implementasi/penutup yang spesifik**, bukan berarti kebutuhannya sama sekali tidak pernah dicatat. PR asal yang sudah selesai tidak dihitung sebagai penugasan tindak lanjut tanpa scope/acceptance baru yang jelas.

| No. | Butir | Rujukan | Yang belum dipetakan |
|---|---|---|---|
| 1 | Hitungan lokasi bertingkat dan pencarian aset dalam ruangan | GAP-01-LOCATION-DATA, FR-03.2 | PR penutup hitungan/pencarian dan bukti kinerja |
| 2 | Ekspor inventaris lokasi | GAP-01-LOCATION-EXPORT, FR-03.2 | Kontrak endpoint dan PR ekspor XLSX/PDF |
| 3 | Ekspor katalog aset | GAP-02-ASSET-EXPORT, FR-04.2 A3 | PR endpoint ekspor tersaring dan field finansial |
| 4 | Pemeriksaan konflik slot pada tanggal mutasi aset | GAP-02-MOVE-SLOT, FR-04.4 A1 | PR perbaikan aturan waktu mutasi |
| 5 | Identitas/nama sekolah pada label QR | Log Phase 03 §10, FR-05.1 langkah 3 | Sumber setting dan PR pemakai label |
| 6 | Render PDF label QR melalui worker | Log Phase 03 §10, SDD-FS-12 | PR jalur asinkron pasca layanan berkas |
| 7 | Parameter durasi maksimum per reservasi | Log Phase 03 §10, FR-20.1 | Nilai bawaan produk dan PR penerapan |
| 8 | Kedaluwarsa reservasi disetujui yang tidak diambil 1×24 jam | Log Phase 03 §10, BR-023/NT-09 | Semantik ruangan dan PR reservation-expiry; berbeda dari tentative-slot-expiry |
| 9 | Ekspor daftar reservasi P-30 | Log Phase 03 §10 | Isi/format/batas ekspor dan PR endpoint/alur |
| 10 | Impor CSV jadwal tetap ruangan | Log Phase 03 §10, FR-07.5 A2/E.5.3 | PR baru setelah PR-03-13 belum bernomor |
| 11 | Pembaruan URL unggah untuk file_id yang sudah terdaftar | Log Phase 03 §10, SDD-MOB-04 | Kontrak dan PR endpoint pendahulu antrean mobile |
| 12 | Menambah informasi ke tiket kerusakan terbuka | Log Phase 03 §10, FR-11.1 A1 | Kontrak, permission/audit dan PR endpoint; GET /open hanya menyediakan ringkasan |
| 13 | Status 2FA yang dapat dibaca klien | Log Phase 02 §10, UX P-77 | Kontrak pembacaan status/sisa kode dan PR API |
| 14 | Daftar-putih eksplisit gerbang ganti password | Log Phase 02 §10, keputusan 43 | PR tindak lanjut belum ditugaskan; kode masih mengizinkan prefiks /auth/ |
| 15 | Pengujian arsitektur penulis assets.status | GAP-02-STATUS-WRITERS, SDD-AVL-11 | PR pengujian invariant empat pemilik |
| 16 | Smoke test alur kritis | GAP-03-SMOKE, CD-07 | PR melengkapi login/search/QR/reservasi/tiket pada smoke-test.sh |
| 17 | Health worker untuk adapter storage/AV dan kelengkapan dependensi | GAP-03-WORKER-HEALTH, OBS-06 | PR penutup registrasi/probe proses worker; LLM sendiri mempunyai PR-03-20 |
| 18 | Publikasi OpenAPI di dev/staging | GAP-00-OPENAPI, SDD-API-11/12 | PR artefak/URL publikasi; generator registry sudah tersedia |
| 19 | Bukti perubahan permission melalui JWT/sesi nyata | GAP-01-AUTH-E2E, PM-05 | PR pengujian gate dengan sesi hidup, bukan authPalsu |

Rujukan GAP berasal dari [audit closure §6](closure-phase-00-02-2026-10-07.md#6-gap-task-owner-dependency-dan-bukti-penutupan); butir lain dari [log Phase 02 §10](../logs/phase-02.md#10-yang-diserahkan-ke-phase-berikutnya) dan [log Phase 03 §10](../logs/phase-03.md#10-yang-diserahkan-ke-phase-berikutnya). Pemeriksaan kode pendukung: [gerbang password](../../../apps/api/src/shared/auth/authenticate.ts), [skema profil](../../../apps/api/src/modules/m01-auth/schemas/profile.schema.ts), [bootstrap worker](../../../apps/api/src/worker/index.ts), [smoke script](../../../deploy/staging/smoke-test.sh).

## Enam pertanyaan produk terpisah

| No. | Pertanyaan | Sumber | Batas keputusan |
|---|---|---|---|
| 1 | Menonaktifkan 2FA sendiri bagi role opsional | GAP-PRODUCT-02, log Phase 02 §10 | Belum ditetapkan apakah/kapan diperlukan |
| 2 | Membuka kunci akun secara administratif/reset menghapus locked_until | GAP-PRODUCT-02, log Phase 02 §10 | Jangan menambah perilaku tanpa keputusan produk |
| 3 | NT-48 per baris impor siswa tanpa persetujuan wali | GAP-PRODUCT-02, log Phase 02 §10 | Laporan galat impor sudah ada; alarm terpisah belum diputuskan |
| 4 | Pencabutan persetujuan wali dan perlakuan akun siswa lama | Log Phase 01 §10 | Belum didefinisikan DP-02; diperlukan keputusan jika alur ini diinginkan |
| 5 | Retensi laporan galat impor yang memuat email | Log Phase 01 §10 | Kandidat PR-05-26 disebut, scope retensi belum ditetapkan |
| 6 | Dukungan/deteksi CSV berpemisah titik koma | Log Phase 01 §10 | Belum diputuskan; jangan diasumsikan sebagai requirement baru |

## Scope PR yang ada perlu direkonsiliasi

- FR-07.4 A2 (laporan kerusakan tertaut reservasi) masih menunjuk PR-03-14 dalam log, sedangkan scope keputusan 20/API tidak menyebut penyelesaiannya. Perlu bukti penutupan atau PR pemilik pengganti; tidak dicampurkan ke 19 butir tanpa PR karena masih ada penunjukan PR yang belum direkonsiliasi.
- FR-11.2 A1 (membatalkan reservasi aset mendatang saat aset diturunkan ke Tidak Tersedia) menunjuk PR-04-02 pada keputusan 21c, tetapi log menyatakan belum tercantum dalam acceptance baris PR tersebut. Tambahkan cakupan pada PR yang sudah ditunjuk sebelum implementasi.
- BR-030 pemeriksa blokir pemohon mempunyai tujuan Phase 04–05, tetapi log belum memilih ID PR pemasang registry secara spesifik. Perjelas tanggung jawab PR peminjaman/denda.
- GAP-01-SETTINGS-AC adalah pekerjaan konsistensi dokumentasi tersendiri; teks AC FR-20.1 masih perlu diselaraskan dengan keputusan 36d. Tidak dihitung sebagai fitur sistem baru.

Provisioning staging, vendor observability, proteksi cabang, QA staging, data kalender sekolah nyata, dan receipt FCM perangkat mempunyai owner/task operasional di audit closure. Pekerjaan manual tersebut tidak dihitung sebagai PR implementasi yang hilang. PR backend yang belum dikerjakan tetapi sudah jelas pemiliknya, parameter TBD operasional yang sudah dijadwalkan, dan temuan lama yang bertanda SELESAI/Ditutup juga dikeluarkan.

## Tindak lanjut yang diperlukan

Tetapkan pemetaan halaman/layar ke PR, pohon kode, owner, dependensi, dan AC sebelum menyatakan fitur selesai. Sebagian dari 80 layar bisa masuk PR fitur yang sudah direncanakan setelah scope diperjelas; sebagian gap eksplisit (P-23, P-34, P-39–P-41) sudah diputuskan menjadi PR baru. Nomor/jumlah PR tambahan belum dapat dihitung hanya dari jumlah layar dan butir gap.

## Tindak lanjut — 10 Oktober 2026

Audit ini **dijawab** oleh [keputusan 23 log Phase 03](../logs/phase-03.md#2-keputusan-yang-diambil). Isinya: 48 PR baru bernomor di §7 Phase 00–06, anotasi pada PR yang sudah ada, dan total rencana 180 → 228. Seluruh 80 layar dan 19 gap kini punya PR pemilik. Pertanyaan produk Q1–Q6 dan butir 7–8 sudah diputuskan. Angka pada bagian di atas adalah keadaan **sebelum** rekonsiliasi dan sengaja tidak diubah.
