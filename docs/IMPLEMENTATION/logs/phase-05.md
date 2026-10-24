# Log Phase 05 — Penutupan Siklus

| | |
|---|---|
| **Phase** | [`phases/phase-05.md`](../phases/phase-05.md) |
| **Milestone PRD** | `M3 & M4 — **menutup keduanya**` |
| **Status** | Lihat [`IMPLEMENTATION-STATUS.md`](../IMPLEMENTATION-STATUS.md) |
| **Mulai** | 12 Oktober 2026 (PR-05-32 lokal) |
| **Selesai** | — |

Log ini mencatat **apa yang benar-benar terjadi** selama phase berjalan: keputusan yang diambil, hal yang berbeda dari rencana, dan angka hasil pengukuran. Ia bukan salinan rencana — rencananya ada di [`phases/phase-05.md`](../phases/phase-05.md).

Log tidak boleh memuat requirement, keputusan desain, maupun business rule baru. Bila selama phase muncul kebutuhan akan salah satunya, ia dinaikkan ke PRD atau SDD lebih dulu, dan log ini hanya mencatat bahwa hal itu terjadi.

---

## 1. Catatan harian

| Tanggal | Yang terjadi | PR terkait |
|---|---|---|
| — | — | — |
| 13 Oktober 2026 | Pemantauan, pengingat, blokir, pelunasan/pembebasan, nilai penggantian dan perpanjangan; UI P-32/P-35/P-36 serta P-34/P-38 | PR-05-05 sampai PR-05-08 (UI PR-05-27/28) |
| 13 Oktober 2026 | Implementasi lokal check-out, bukti digital, check-in dan pemulihan aset; backend dan web P-33/P-34 sesuai jawaban pengguna | PR-05-01 sampai PR-05-04 |

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

PR yang tidak ada pada daftar [`phase-05.md` §7](../phases/phase-05.md).

| ID | Judul | Mengapa tidak terencana |
|---|---|---|
| — | — | — |

Kolom ketiga adalah yang paling berharga di seluruh log ini. Pola yang berulang di sana menunjukkan di mana perencanaan phase berikutnya perlu diperbaiki.

## 5. Butir yang wajib tercatat pada phase ini

- [x] **Penutupan `SL-04` lokal** (`PR-05-09`) — definisi final 'kewajiban aktif'. Wajib tercatat di sini **dan** di [`phase-01.md`](phase-01.md)
- [ ] Penghapusan aset tidak pernah `DELETE` baris (`BR-008`) — bukti verifikasinya
- [ ] Kriteria keluar `M3` terverifikasi: alur reservasi → serah terima → pengembalian → denda → tiket → work order → selesai berjalan di staging
- [ ] Kriteria keluar `M4` terverifikasi: opname 1.000 unit di perangkat nyata; pengadaan menghasilkan aset; penghapusan menghasilkan berita acara
- [ ] Seluruh modul wajib-mobile selesai (`M4`)

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

Diisi saat phase dinyatakan selesai. Daftar lengkapnya ada di [`phase-05.md` §9 dan §12](../phases/phase-05.md).

- [ ] Seluruh 25 PR tergabung
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


### PR-05-32: pemindai native dan detail aset - 12 Oktober 2026

Keputusan produk melalui fitur pertanyaan: pisah PR dari fondasi; aksi berizin sesuai status
nonaktif dengan alasan bila layar tujuan belum tersedia; API foto aman ikut PR ini. Tabel fisik
asset_photos memakai asset_id/file_id FK, urutan, is_primary dan diunggah_oleh; API baca
GET /assets/{id}/photos mengikuti asset.view/scope, tidak mengirim identitas pengunggah atau
object key tersendiri. Penautan/unggah tetap PR pengelolaan aset. PRD/SDD dan indeks API diperbarui.

MS-07 memakai expo-camera, mode beruntun FlatList maksimal 200 hasil memori, deduplikasi,
input kode manual persis, pengaturan izin, lampu, lifecycle fokus/foreground dan AbortSignal.
MS-08/09 memuat identitas, status/kondisi/lokasi, foto privat CLEAN dan riwayat berpaginasi;
BR-073 disaring server dan UI. QR asing tidak dipanggil atau dinavigasikan. Konfigurasi App Links
mengikuti domain sekolah; association files/binary dan perangkat nyata belum diverifikasi.
Token enrolment dan hasil /me terlambat dibatasi revision agar tidak memulihkan sesi lama.
Konfigurasi EXPO_PUBLIC memakai dot notation; URL API terbukti tertanam pada Hermes Android.

Validasi lokal: 21 uji mobile lulus, 12 integrasi detail/foto dan 17 integrasi QR PostgreSQL
nyata lulus pada DB terisolasi; 13 uji file PostgreSQL/MinIO lulus; 11 uji registry/OpenAPI lulus.
Migration 0052 dibuktikan oleh constraint FK, pasangan unik, satu primary dan urutan nonnegatif.
Penandatangan URL pada uji foto memakai port storage; bukan bukti byte foto di perangkat.
Tinjauan arsitek migration belum dilakukan. SCA HIGH upstream dari fondasi tetap terbuka;
tidak menyatakan CI/deployment siap. Kamera 10-30 cm, target hasil 3 detik, APK/IPA, cold start,
perangkat minimum, association files dan lifecycle native memerlukan development build.


Bundel Hermes Android/iOS dengan expo-image cachePolicy none lulus; bukan APK/IPA.
TypeScript produksi/uji, lint, audit docs dan 13 kasus batas impor (termasuk mobile) lulus.
Percobaan npm ci lokal ditolak Windows saat menghapus DLL rolldown web yang sedang dipakai;
bukan kesalahan kesesuaian lockfile. Dependency dipulihkan melalui npm install tanpa menghentikan
proses pengguna. Dependency peer lama dipertahankan; versi paket lama tidak dinaikkan oleh PR ini.


Pemulihan npm install selesai (exit 0); DLL sementara yang terkunci hanya menghasilkan warning
cleanup Windows. Perbandingan lockfile terhadap fondasi: tidak ada paket lama dihapus atau
versi lama berubah. Binding native argon2/sharp dapat dimuat. 21 uji mobile dan typecheck/lint
lulus lagi setelah pemulihan. Suite unit API lengkap: 1.292 uji/84 berkas lulus memakai
--maxWorkers=2 --testTimeout=30000. Percobaan paralel awal dengan checker batas impor gagal
(timeout dan file probe sementara hilang); diulang tanpa checker berjalan bersamaan.
Introspect konfigurasi native lulus: Android minSdk26, iOS deployment16.4, izin kamera ada,
NSMicrophoneUsageDescription tidak ada, Android RECORD_AUDIO bertanda remove.


### PR-05-35: Persetujuan Saya mobile - 13 Oktober 2026

Cabang lokal feature/PR-05-35-persetujuan-mobile mengikuti PR-04-17 (52ef938c), sesuai pilihan
pemilik produk. Keputusan melalui pertanyaan: hanya API tersedia, tidak menambah backend domain;
keputusan aktif hanya jika konteks lengkap. Gap tambahan role pemohon dan riwayat keterlambatan/
kewajiban (FR-10.2 langkah 3, UX 7.6.4) dipilih tetap memblokir seluruh keputusan, tanpa pengecualian.
Detail reservasi ruangan berhasil dibaca tidak dianggap cukup; tidak ada role atau kewajiban nol
yang diasumsikan. Scope/status/kewenangan tetap ditegakkan backend.

Implementasi: inbox berpaginasi/SLA/delegasi, jalur push ke stack Tugas, detail reservasi dan
ketersediaan termasuk tanggal berulang, linimasa langkah/eskalasi/dilewati/SYSTEM, tombol tetap
di bawah, alasan nonaktif, dialog konfirmasi dan catatan wajib. Gerbang memeriksa izin, instance/
referensi/pemohon dan langkah aktif. Niat keputusan memakai satu key UUID/body di memori, retry
manual untuk hasil hilang/5xx/REQUEST_IN_PROGRESS, lock tap ganda, abort lifecycle dan konflik RE-09
menampilkan pemutus/waktu. Tidak mengantre atau mengirim keputusan di latar belakang/luring.
Kontrak response/input existing dipakai bersama, tanpa perubahan endpoint/mesin/permission/migration.

Skala L karena layar konteks/linimasa, kontrak bersama, gerbang dan uji retry adalah satu alur MS-20;
pemisahan backend domain sengaja tidak dilakukan sesuai scope yang dipilih pengguna.
Validasi lokal: 43 uji mobile (14 kasus konteks/keputusan tambahan), 30 integrasi PostgreSQL
approval-decision/approval-history pada DB terisolasi dan 1.292 unit API/84 berkas lulus.
TypeScript produksi/uji dan lint API/mobile lulus. Fixture konteks lengkap hanya berada pada uji;
reader produksi selalu mengembalikan konteks pemohon belum lengkap. APK/IPA, aksesibilitas native,
push cloud/perangkat nyata tetap memerlukan QA development build. SCA upstream fondasi yang
tercatat di log phase-04 belum hijau. Tidak ada push GitHub, EAS/store atau deployment.

Export Hermes Android (4,3 MB)/iOS (4 MB), 13 kasus batas impor, audit docs dan validate_impl lulus.
Bundel JS bukan bukti instalasi APK/IPA atau interaksi native pada perangkat.


### PR-05-34: Lapor Kerusakan MS-15 - 13 Oktober 2026

Cabang feature/PR-05-34-laporan-kerusakan-mobile dibuat dari PR-05-35 (54afbfe2), sesuai pilihan
pemilik produk melalui fitur pertanyaan. Pengguna memilih: formulir di memori, POST bisnis hanya
online setelah file_id; foto boleh menyusul. Perbaikan fondasi diizinkan: enqueue foto sebelum
POST tiket/catatan lalu perbarui ownerId sesudah respons. Hanya byte dan metadata berkas yang
dipersistensi. Kasus SQLite nyata membuktikan foto dengan ownerId null bertahan setelah restart.
Tidak menambah backend domain, migration, permission atau endpoint. Skala L: satu alur MS-15
memerlukan pemilih objek/foto, tiket eksisting, receipt/detail/status dan pengelola antrean, serta
uji crash/retry/akun; fondasi tambahan terbatas pada checkpoint berkas yang dibutuhkan alur ini.

Laporan dari Beranda, hasil scan dan detail aset; pencarian aset/ruangan mengikuti permission.
Foto JPEG native <=1600px/500KB, kualitas80, kompresi fondasi. expo-image-picker57.0.20 dipilih
sesuai dokumentasi Expo SDK57 (https://docs.expo.dev/versions/latest/sdk/imagepicker/). Runtime0.3.0,
izin kamera/galeri saat dibutuhkan, mikrofon tidak diminta. Tiket terbuka menawarkan notes (A1);
receipt penulis tiket lain tidak membuka detail yang ditolak scope own. Kamera/galeri, urutan foto,
progres/cancel, indikator foto belum terunggah, tiket saya/detail/catatan dan URL CLEAN terpasang.
Antrean mengikuti akun, 72jam/50berkas/backoff; cleanup menghentikan unggahan akun lama.

Gap idempotensi API M-11 ditanyakan: pengguna memilih hasil belum pasti dan pemeriksaan tiket,
bukan retry POST otomatis atau PR backend pendahulu. Lock tap ganda dan memo hasil sukses
mencegah transaksi berulang; timeout/5xx/lost response tidak membuat niat kedua. Retry otomatis
hanya untuk byte/confirm berkas. Draf belum dikirim tidak dijanjikan bertahan setelah aplikasi mati.

Validasi lokal: 57 uji mobile/7 berkas (termasuk 12 kasus laporan, checkpoint SQLite dan sender),
37 integrasi PostgreSQL/MinIO (laporan, notes, monitoring dan files) pada DB terisolasi lulus.
TypeScript produksi/uji dan lint mobile lulus. Export Hermes Android4,4MB/iOS4MB lulus.
Introspect native: minSdk26/iOS16.4, izin kamera+galeri ada, NSMicrophoneUsageDescription tidak ada
dan Android RECORD_AUDIO remove. Bukan bukti APK/IPA, hasil JPEG/EXIF di hardware, dialog izin,
force-stop native atau interaksi aksesibilitas. Development build/perangkat nyata masih diperlukan.

Audit npm semula ditolak auto-review karena ekspor metadata dependency belum diizinkan. Pengguna
kemudian secara eksplisit mengizinkan nama/versi dependency ke registry.npmjs.org; audit selesai:
23 HIGH/12 moderate/0 critical, HIGH berasal dari braces dan node-forge upstream yang sama dengan
fondasi, bukan advisory baru pada image-picker. Tidak melakukan audit fix --force. Paket lama
pada lockfile tidak berubah versi; hanya image-picker ditambahkan. Tidak menyatakan SCA/CI hijau.
Konfigurasi Expo dan .env.example yang diubah pengguna dipertahankan; hanya hunk plugin/izin/
runtime fitur dimasukkan ke commit. Tidak ada publikasi EAS/store/GitHub atau deployment.

Audit docs, validate_impl dan 13 kasus batas impor lulus. Bundel akhir diulang setelah guard UI
dan penanganan izin diperbarui; TypeScript produksi/uji dan 57 uji mobile tetap lulus.


### PR-05-01 sampai PR-05-04: Peminjaman dan Pengembalian - 13 Oktober 2026

Pengguna meminta empat PR sekaligus dan memilih backend serta UI web lengkap P-33/P-34,
termasuk tautan dari P-31. Implementasi diteruskan di cabang lokal PR-04-01 yang sudah memuat
reservasi aset/gabungan. Skala L: kelompok ini membentuk satu alur penyerahan/pengembalian
atomik dengan kontrak bersama, bukti privat, kewajiban per unit dan UI; pengelompokan mengikuti
permintaan eksplisit pengguna. Tidak memisahkan pekerjaan yang sudah dipilih menjadi PR remote.

Keputusan melalui tool pertanyaan yang tersedia (AskUserQuestion tidak tersedia): tanda tangan
kanvas PNG dan nama penerima/kuasa; perhitungan serta pencatatan kewajiban minimum saat check-in;
hari kalender mengikuti BR-028 dan pengecualian libur hanya jika parameter diaktifkan.
Tarif harian dan cap nominal tidak diberi angka bawaan. Administrator wajib mengisi keduanya
sebelum check-out; satu saja null menolak transaksi. Kebijakan disnapshot saat check-out sehingga
perubahan parameter tidak mengubah pinjaman berjalan. Keputusan menggantikan BR-029 lama dan
sudah dinaikkan ke PRD M-09, rujukan M-20, model data, SDD-01 dan spesifikasi halaman UX.
Nilai perolehan unit disnapshot untuk cap/ganti rugi; nilai tak diketahui dicatat sebagai kewajiban
menunggu penetapan dengan jumlah null. Tidak mengasumsikan nominal penggantian.

Migrations expand 0054/0055/0056 membuat loans, loan_items, relasi bukti/foto, fines dan relasi
laporan kerusakan, serta parameter konfigurasi. booking_slots memperoleh FK loan_id, bukan
perubahan algoritme SlotService. Slot reservasi aset diarsipkan RELEASED dan realisasi loan
CONFIRMED/ACTIVE dibentuk pada transaksi checkout yang sama; slot ruangan gabungan tetap
mengikuti alur penggunaan terpisah. Indeks unit belum kembali melindungi aset yang terlambat
meskipun rentang slot sudah habis. Checkout langsung memerlukan loan.direct, reservasi retroaktif
bypass beralasan dan audit. Substitusi sekategori serta perbedaan kondisi fisik awal wajib beralasan.

Check-in memverifikasi identitas dan minimal satu foto setiap unit, melepaskan hanya slot unit
yang diproses, mencatat kondisi/histori, membuat atau menambah tiket kerusakan M-11 dan membatalkan
reservasi mendatang secara sinkron. Kerusakan/Tidak Lengkap/Hilang menjadi Tidak Tersedia;
Baik menjadi Tersedia atau Direservasi bila ada slot terkonfirmasi saat ini. Pengembalian sebagian
mempertahankan transaksi aktif; induk berulang selesai setelah semua tanggal terminal, termasuk
kombinasi pengembalian dan no-show. Audit, kewajiban dan outbox berada dalam transaksi yang sama.

Delapan endpoint M-09 dideklarasikan dengan permission dan skema OpenAPI bersama. Detail/scope own
menolak akses transaksi pihak lain; DTO tidak mengekspos nilai perolehan aset. Foto dan tanda tangan
HANDOVER_PHOTO privat harus milik pengunggah, terkonfirmasi checksum dan belum tertaut sebelum
dipakai. PENDING boleh menjadi bukti transaksi, tetapi URL unduh hanya terbit setelah CLEAN.
Outbox menerbitkan NT-10/14/15 secara idempoten, dengan notifikasi ganti rugi kepada Pimpinan.

P-33 menyediakan antrean, peminjam aktif, verifikasi kode/UUID, substitusi, kondisi/foto awal,
kanvas tanda tangan dan alternatif unggah PNG melalui papan ketik, lalu tinjauan sebelum POST.
P-34 menampilkan receipt, bukti, kondisi dan kewajiban per unit, serta pengembalian parsial/penuh
dengan pratinjau denda sebelum konfirmasi. Foto dikompresi maksimum sisi 1600px, JPEG kualitas80;
tanda tangan tetap PNG 600x300. Unggahan dapat diulang dan dibatalkan saat unmount; UI mengunci
identitas unit saat unggahan dan memindahkan fokus ke tinjauan. Key idempotensi tetap selama retry
niat yang sama. Transaksi luring tidak diantrekan. Mobile hanya mendapat penanganan varian linimasa
PEMINJAMAN yang diperlukan kontrak bersama; layar serah terima native bukan cakupan ini.

Batas berikutnya: job pengingat/status terlambat dan provider blokir nyata BR-030 masih
PR-05-05/06; registry blokir yang ada dipanggil oleh checkout. Pelunasan/pembebasan serta
penetapan nilai penggantian dengan persetujuan Pimpinan mengikuti PR denda berikutnya.
UI web P-32 daftar pantau dan perpanjangan tidak termasuk permintaan ini. Tidak mengklaim
penutupan seluruh FR-09.3/FR-09.4 maupun gerbang keluar Phase 05.

Tinjauan arsitek diperlukan sebelum merge karena migration dan FK booking_slots menurut
CLAUDE.md/BRANCHING-STRATEGY. Belum ada review arsitek, commit, PR remote, merge atau deployment.
Perubahan mobile/EAS/package-lock milik pengguna dipertahankan. Uji migration up/down/up dan
fixture integrasi hanya dijalankan pada PostgreSQL terisolasi; tidak memasukkan fixture ke DB aplikasi.


Validasi lokal: 97 kasus integrasi pada 9 berkas (M-09:16, reservasi/berkas:46,
M-11:35) lulus pada PostgreSQL terisolasi; jalur berkas/AV memakai MinIO dan ClamAV lokal.
Termasuk 50 checkout bersamaan untuk satu unit (tepat satu berhasil), idempotensi/scope,
penolakan konfigurasi salah satu parameter kosong, rollback setelah efek kerusakan gagal,
perubahan setting setelah checkout, pengembalian sebagian dan penutupan induk berulang.
Fixture M-11 lama diperbaiki agar urutan memakai ID numerik, bukan alias id::text yang
mengurutkan 10 sebelum 9; perilaku URL medium/asli produksi tetap benar.
69 uji API murni/registry/OpenAPI/status-writer, 35 uji web (6 kasus peminjaman tambahan),
5 uji scanner mobile dan 13 pemeriksaan batas impor lulus. TypeScript produksi serta sumber
uji API/web dan lint berkas terkait lulus. Migration 0054/0055/0056 up/down/up lulus.
Build web produksi lulus; warning import NotificationCenterPage yang sudah ada tetap muncul.

Pemeriksaan Chromium pada build produksi dengan fixture API/storage browser menyelesaikan
checkout dan checkin pada lebar320/768/1024/1440 tanpa pageerror atau luapan horizontal;
kanvas PNG dan foto JPEG melalui jalur unggah produksi. Ini tidak membuktikan browser pada
perangkat fisik atau deployment cloud. Pemeriksaan axe pada alur tinjauan checkout tidak
menemukan pelanggaran. Tidak menjalankan CI remote atau menyatakan SCA upstream hijau.

Audit docs dan validate_impl lulus; indeks PRD dan traceability diregenerasi. Status tetap In Progress karena pekerjaan masih lokal dan belum ditinjau/digabung ke remote.


### PR-05-05 sampai PR-05-08: Pemantauan, Denda dan Perpanjangan - 13 Oktober 2026

Pengguna meminta empat PR sekaligus serta backend dan UI web lengkap: P-32, P-35/P-36 dan
aksi perpanjangan P-34. P-33/P-34 yang sudah ada dipertahankan. UI PR-05-27/28 diintegrasikan
sesuai jawaban ini; skala L karena satu alur kewajiban dan jadwal melintasi worker, approval,
slot, audit/outbox, kontrak bersama dan web. Tetap di cabang lokal PR-04-01; belum commit/remote PR.

Keputusan melalui tool pertanyaan tersedia, pengganti AskUserQuestion yang tidak tersedia:
job harian memakai estimasi berjalan, kewajiban final tetap saat check-in/penetapan hilang;
ambang BR-030 wajib dikonfigurasi Administrator tanpa nominal bawaan; usulan nilai penggantian
fine.manage diputus langsung di P-36 oleh role Pimpinan dengan approval.decide, tidak menambah
jenis approval; keputusan perpanjangan sesudah jadwal lama menyimpan hari terlambat per unit
sampai waktu keputusan untuk perhitungan final. Keputusan dinaikkan ke kontrak PRD M-09,
SDD-01/05, model data dan UX; kebijakan snapshot tarif/cap checkout yang dipilih sebelumnya tetap.

Migration expand 0057 menambah konfigurasi ambang JSON null, riwayat perpanjangan/hold per item,
hari terlambat terakumulasi, riwayat tindakan denda, usulan nilai penggantian, state transisi blokir,
penanda reminder harian dan rekap. Nol eksplisit sah sebagai ambang; parameter kosong menolak
pengajuan reservasi/peminjaman baru. Blokir membaca keterlambatan aktual tanpa menunggu cron,
serta menjumlahkan sisa kewajiban Belum Dibayar/Dibebaskan Sebagian melebihi ambang. Jumlah ganti
rugi yang belum ditetapkan tetap null dan tampil menunggu penetapan; tidak mengarang nominalnya.
Registri blokir dan handler perpanjangan dipasang di API serta worker. State blokir hanya untuk
jejak transisi/audit NT-18; keputusan akses membaca sumber kewajiban saat transaksi.

Job loan-overdue 00:05 WIB melalui kerangka SYSTEM yang ada mengubah status, menghitung estimasi
kalender WIB dengan kebijakan snapshot, lalu menerbitkan NT-11/12/13 melalui outbox. Penanda harian
bertahan setelah restart; pengingat H-1 memakai versi jatuh tempo. Notifikasi yang jadwalnya sudah
berubah atau peminjaman sudah ditutup dilewati konsumen. Job tidak membuat fine harian baru.

Pembayaran luring mencatat tanggal/bukti wajib. Pembebasan keterlambatan membutuhkan fine.waive;
ganti rugi memerlukan fine.waive_compensation dan role Pimpinan, dapat penuh/parsial secara
kumulatif, tidak melebihi sisa. Kewajiban menunggu nilai tidak dapat dibayar/dibebaskan nominalnya.
Usulan nominal tidak aktif sampai Pimpinan menyetujui; penolakan dapat diusulkan ulang dan pengusul
sendiri tidak dapat memutus. Koreksi status lunas hanya Administrator beralasan. Kunci row dan
idempotensi menjaga pembayaran/pembebasan yang bersaing; audit, riwayat, status blokir dan outbox
NT-16/17/18 satu transaksi. Scope fine.view tersaring pada daftar/detail/ekspor.

Perpanjangan mempunyai satu pengajuan/instance PERPANJANGAN_PEMINJAMAN dengan fakta DSL dari
peminjam nyata. Slot tambahan TENTATIVE ber-TTL dipertahankan sambil slot lama ACTIVE masih ada.
Persetujuan memeriksa ulang keadaan, konflik, durasi/TTL; lalu melepas hold dan memperpanjang ACTIVE
melalui SlotService.extendActive. Penolakan/revisi/expiry/check-in menutup dan melepas hold.
TTL diperiksa walau job belum berjalan. Slot dan perubahan jadwal atomik; tambahan hari terlambat
sebelum keputusan tidak terhapus dan memakai cap yang sama. Unit yang sudah kembali dan ruangan
gabungan tidak diperpanjang. Hook kunciObjek opsional pada PenanganHasil mengunci loan sebelum
langkah keputusan; NOWAIT mencegah auto-reject SLA menunggu check-in yang akan menutup instance.

Web memakai saringan URL dan empat tab P-32, P-35 tersaring jenis/status dan receipt P-36.
Pengelolaan memakai dialog berkonsekuensi/alasan/bukti, nominal berupa string desimal, tidak ada
pembayaran daring. Retry dengan body sama mempertahankan key; perubahan body membentuk niat baru.
P-34 menyajikan riwayat jadwal dan pengajuan; P-38 memperoleh konteks perpanjangan sesudah otorisasi
pembaca instance (tanpa menambah akses ke bukti privat). Ekspor XLSX/PDF membutuhkan report.export
serta hak lihat domain, dengan scope tetap ditegakkan dan audit DATA_EXPORTED. Native, SL-04
(PR-05-09), deployment dan gerbang keluar Phase 05 tidak termasuk perluasan ini.

Pemeriksaan batas impor sempat dijalankan bersamaan dengan compiler; fixture sementara menimbulkan
artefak JS/deklarasi di source dan menutupi perubahan TTL pada tes berikutnya. Artefak compiler yang
baru dibuat, tidak tracked dan berdampingan dengan sumber TS dibersihkan; TypeScript serta uji
source diulang berurutan. Tidak mengubah sumber pengguna untuk mengatasi artefak tersebut.

Tinjauan arsitek masih diperlukan sebelum merge karena migration, SlotService dan hook approval
menurut CLAUDE.md/BRANCHING-STRATEGY. Tidak membuat commit, PR remote, merge atau deployment;
perubahan mobile/EAS/package-lock milik pengguna tetap dipertahankan.

Validasi akhir lokal - 14 Oktober 2026: 149 kasus integrasi pada 10 berkas lulus di PostgreSQL
terisolasi (16 pengelolaan baru, 16 serah terima/pengembalian, 83 reservasi/slot, 34 approval/SLA).
Termasuk konfigurasi kosong, pembayaran/pembebasan yang bersaing, scope, ekspor XLSX/PDF nyata,
perpanjangan dan konflik, akumulasi keterlambatan, TTL sebelum job berjalan, penutupan saat
check-in dan pemeriksaan ulang batas perpanjangan ketika approval diputus. Coverage M-09:
87,29% statements, 78,70% branches, 90,47% functions dan 96,21% lines; bukan coverage seluruh repo.
Run yang terjeda lingkungan sekitar delapan jam sempat timeout pada approval; pengulangan penuh
pada database terisolasi baru lulus tanpa kegagalan.

26 uji web pada tiga berkas lulus, termasuk axe pada daftar peminjaman/dialog pembayaran,
bukti wajib, retry idempotensi, pembebasan parsial, scope pemilik dan tinjauan perpanjangan.
TypeScript produksi serta sumber uji API/web, lint berkas terkait dan 13 pemeriksaan batas impor
lulus. Migration 0057 up/down/up lulus; ambang tetap kosong sampai dikonfigurasi Administrator.
Build web produksi lulus dengan warning import NotificationCenterPage yang sudah ada.
Chromium pada build produksi dengan fixture API browser menyelesaikan daftar, pembayaran dan
perpanjangan pada lebar 320/768/1024/1440 tanpa luapan horizontal. Ini tidak membuktikan QA
perangkat fisik, CI remote atau deployment cloud. Implementasi dan verifikasi lokal selesai;
status PR tetap In Progress karena cabang belum commit, review arsitek atau merge.

Pengulangan akhir 76 uji API murni pada enam berkas (perhitungan denda, ketersediaan, registri
approval/rute, OpenAPI dan invariant penulis status aset) lulus. Audit docs, validate_impl dan
git diff --check lulus sesudah pembaruan log/status. Tidak tersisa artefak JS/deklarasi/map
compiler pada source modul M-09.

### Audit PR-05-27/28/33 — 14 Oktober 2026

Pengguna memilih audit gap terlebih dahulu melalui pertanyaan interaktif. Audit tersimpan di
[audit PR-05-27/28/33](../audits/pr-05-27-28-33-gap-2026-10-14.md). UI web utama sudah tersedia;
mobile MS-10…14 belum tersedia. Gap utama: penautan HANDOVER_PHOTO masih mensyaratkan checksum,
checkpoint antrean sebelum POST belum tersedia, serta retry dialog web setelah hasil belum pasti
dan matriks penolakan/axe perlu dilengkapi. Pengguna memilih tanda tangan saja untuk MS-10 dan
perluasan API untuk foto tertunda. Kedua keputusan belum mengubah kontrak/kode produksi pada audit.

Tambahan kode mobile sempat dibuat sebelum jawaban masuk dan seluruhnya dibatalkan setelah pengguna
memilih audit. Perubahan lokal sebelum turn dipertahankan. Run terarah web: 2 berkas/13 tes lulus.
Tidak membuat commit/PR remote atau mengubah status implementasi PR-05-33 menjadi dimulai.

Sesudah pembatalan tambahan kode: mobile 7 berkas/57 tes lulus. Audit docs, validate_impl dan
git diff --check lulus. Hasil build/lint sebelumnya pada kode percobaan tidak dipakai sebagai
bukti acceptance MS-10…14. QA perangkat dan integrasi database tidak dijalankan pada audit ini.

### Implementasi lokal PR-05-10/11/12/13/14/29 — 14 Oktober 2026

Keputusan pengguna melalui pertanyaan interaktif dicatat pada PRD M-21 §6:
persetujuan per aset, nilai perolehan wajib diketahui, aturan aktif berakhir
Pimpinan, blokir transaksi/claim, bukti fisik CLEAN dengan pengecualian Hilang,
reinstatement khusus R-01/Hilang, serta kandidat opname/WO dan PDF/XLSX terfilter.
Implementasi mencakup migration 0063, API M-21, adapter M-10, penulis terkontrol
M-04, integrasi M-06/M-08/M-12/M-13/M-17, worker laporan, dan web P-55/56/57/P-38.

Hasil/bukti dan batas validasi tersedia pada
[audit PR-05-10..14/29](../audits/pr-05-10-11-12-13-14-29-local-2026-10-14.md).
17 uji integrasi lulus, termasuk isi PDF redaksi serta kegagalan/retry worker;
63 regresi domain, 127 uji API, 27 uji web dan 78 uji mobile lulus. Chrome produksi
lulus 24 kombinasi halaman/status/lebar layar; migration up/down/up terisolasi
lulus. Status tetap In Progress sampai tinjauan arsitek/CI/staging. Tidak membuat
commit, push, atau PR remote; perubahan sesi lain di workspace dipertahankan.

### Implementasi lokal PR-05-15/16/17/23/30 — 14 Oktober 2026

Tiga jawaban pengguna melalui pertanyaan interaktif diterapkan: QR Bahan privat
`/b/{uuid}` dengan login/material.view, satuan terkunci setelah transaksi pertama,
dan rim/pcs/botol/liter/dus dengan pengelolaan Admin pada tab Satuan Bahan.
Keputusan dinaikkan ke PRD M-22/M-05/M-20; mekanisme trigger ledger ke SDD-05 §4.8.
Migration expand 0064/0065, API master/kategori/saldo/kartu stok, QR PDF, pemisahan
scan web/mobile dan UI P-80…P-83 tersedia lokal. M-14 tetap menolak usulan Bahan
sampai penerimaan PR-05-18; transaksi bisnis HTTP/NT-49/opname Bahan belum dibangun.

17 uji integrasi PostgreSQL, 13 uji web Bahan/scan dan 80 uji mobile lulus.
PDF Chromium 200 jenis selesai sekitar 4,4 detik. Build produksi web, ekspor
Android/iOS dan 28 kombinasi browser pada 320/768/1024/1440 lulus. Regresi luas
API/web memiliki temuan enum dan timeout pemuatan di run padat; perbaikan dan
pengulangan terisolasi dicatat pada
[audit lokal](../audits/pr-05-15-16-17-23-30-local-2026-10-14.md).
Status tetap In Progress: tinjauan arsitek migration/ledger, CI, staging dan
perangkat fisik belum dilakukan. Tidak membuat commit/PR remote, merge atau
migrasi database aplikasi; perubahan sesi lain dipertahankan.

### Implementasi lokal PR-05-24 — 14 Oktober 2026

Tiga keputusan AskUserQuestion untuk basis hitung ulang, perluasan luring 72 jam,
dan target saldo nol/nonaktif dicatat pada PRD M-13 §6. Migration expand 0066,
endpoint/domain Bahan terpisah, ledger OPNAME atomik sesudah persetujuan Pimpinan,
PDF/XLSX privat, web P-48/49/50 dan mobile MS-22/23 tersedia lokal. Migration
0067/0068 serta pekerjaan bisnis M-22 sesi lain dipertahankan.

7 uji integrasi Bahan dan 9 regresi Aset, 9 uji web, 84 uji mobile lulus;
coverage inti baru 83% statements. PDF/XLSX nyata, persetujuan serentak dan
perubahan stok dengan jumlah akhir sama teruji. Build web, ekspor Android/iOS
dan 20 kombinasi browser pada 320/768/1024/1440 lulus. HTTP/health dan Clock
lulus; satu pemeriksaan enum bersama masih menunggu katalog M-22 dari sesi lain.
Rincian dan batas validasi ada pada
[audit PR-05-24](../audits/pr-05-24-local-2026-10-14.md).
Status tetap In Progress sampai tinjauan arsitek/CI/staging/perangkat fisik;
tidak membuat commit/PR remote atau migrasi database aplikasi.

### Implementasi lokal PR-05-18/19/20/21/22/31 — 14 Oktober 2026

Kelima jawaban AskUserQuestion diterapkan: ambang jumlah per jenis, tanpa hold,
approval parsial monotonik, master BAHAN sejak pengajuan, bukti wajib, scope/revisi,
penyesuaian langsung dan NT-49 saat crossing. Migration 0067/0068, API bisnis,
M-14 penerimaan tanpa aset untuk BAHAN, M-10 cycles/akses own, M-20 ambang,
M-06 dokumen, dashboard dan web P-84…87/P-38/P-82 tersedia lokal.

55 integrasi unik, 143 unit/kontrak API, 54 web dan 32 viewport Chrome lulus.
Up/down/up 0067/0068, tipe API/web/schema/test, lint dan batas impor serta docs
lulus pada validasi fitur. Enum bersama telah diselaraskan. Galat tipe M-19
saat pemeriksaan bersama diperbaiki oleh sesi pemiliknya; typecheck penuh
workspace terakhir lulus. Berkas chatbot dipertahankan. Fixture rollback
kini dikunci sampai 0068.

Rincian bukti, perubahan, run awal dan batas validasi ada di
[audit](../audits/pr-05-18-19-20-21-22-31-local-2026-10-14.md).
Status In Progress sampai tinjauan arsitek/CI/staging; tidak membuat commit,
PR remote, merge, deployment atau migrasi database aplikasi. Migration 0066
opname dan 0069 chatbot serta pekerjaan sesi lain dipertahankan.


## Implementasi lokal M-19 — 14 Oktober 2026

Batch PR-03-20/21/22/23/34 + PR-05-25/36 diminta langsung pengguna.
Enam keputusan AskUserQuestion dinaikkan ke M-19 §7, M-20,
ai-features, data-model, SDD-05/10/12/16 dan UX sebelum catatan ini.
Migration expand 0069; 0067/0068 sesi M-22 dipertahankan. Tidak ada migration
pada database aplikasi, commit/PR remote, merge atau deployment.

Implementasi mencakup orchestrator/12 tool baca, tools Bahan, SSE web/mobile,
kuota WIB, laporan dengan izin berbagi, agregat tanpa teks/ID dan retensi.
10 integrasi PostgreSQL (termasuk 700 kombinasi SQL/role), 95 unit API terpilih,
18 uji web dan 90 mobile lulus. Coverage M-19 integrasi statements 73,90%,
lines 82,63%; 14 pemeriksaan batas impor dan 24 pemeriksaan browser lulus.
Rincian cakupan/verifikasi dan artefak: [audit](../audits/pr-03-20-21-22-23-34-pr-05-25-36-local-2026-10-14.md).

CONTRACT tidak menjadi skor Gemini. Evaluasi LIVE/cache/4500 token/latensi
belum terbukti karena konfigurasi LIVE tidak tersedia pada proses uji.
Workflow LIVE manual disediakan dengan fixture anonim sekali pakai.
Status tujuh PR tetap In Progress; tinjauan arsitek, CI remote/staging dan
QA perangkat belum selesai. Batch besar mengikuti permintaan eksplisit
pengguna dan menjaga satu kontrak utuh untuk API/dua klien.

SCA runtime lokal: 23 High/12 Moderate/0 Critical pada pohon dependensi
modul lain (Expo/Firebase/ExcelJS). SDK Gemini baru tidak berada pada nodes
rentan laporan; gerbang SCA CD-02 tetap terbuka. Rincian pada audit M-19.


### Implementasi lokal PR-05-09/26 — 15 Oktober 2026

Lima jawaban AskUserQuestion dinaikkan ke PRD M-02/M-04, ketentuan privasi,
SDD keamanan/database/storage dan UX. SL-04 terisi oleh pemeriksa M-09 pada
composition root API dan worker, termasuk pengembalian sebagian, denda/ganti
rugi belum lunas atau menunggu nominal. Pesan menampilkan referensi spesifik;
penonaktifan manual dan kelulusan memakai kunci akun/pemeriksa yang sama.
Penutupan lokal juga dicatat pada log Phase 01.

Migration 0072 menambah tanggal lifecycle, guard permanen, penanda/indeks retensi
serta pencabutan pemulihan SYSTEM. Aksi R-01 pada akun nonaktif, worker retensi
01:10 WIB, pencabutan sesi/kredensial dan UI konfirmasi tersedia. Backfill memakai
bukti status terakhir atau waktu migration secara konservatif. API/UI menutup
laporan impor pengguna/aset pada 30 hari tanpa bergantung cleanup worker.
Transaksi/audit lama dan foto dipertahankan; prosedur respons 3×24 jam ada pada
[runbook](../runbooks/permintaan-privasi.md).

289 uji unik lulus: 181 integrasi PostgreSQL, 58 unit/kontrak backend dan 50 web.
16 kasus browser pada empat viewport lulus kontras/keyboard tanpa overflow
halaman atau galat JS. Termasuk race buka ulang denda, kunci check-out, rollback
identitas saat audit gagal, backfill, batas tanggal dan login akun permanen.
Perbaikan predicate login mencegah pembaruan penghitung pada akun permanen;
63 regresi login/refresh/sesi diulang dan lulus. Typecheck, lint, build dan batas
impor lulus; validasi dokumen menyertai pembaruan log.

[Audit](../audits/pr-05-09-26-local-2026-10-15.md) memuat rincian dan batas validasi.
Status dua PR In Progress menunggu review/CI/staging; milestone/Phase 05 tidak
dinyatakan selesai. PostgreSQL lokal sementara port 55449 dibersihkan. Database
aplikasi belum dimigrasi; tidak membuat commit/push/PR remote/deployment.
