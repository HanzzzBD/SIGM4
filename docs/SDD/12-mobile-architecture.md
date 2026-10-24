# SDD-12 — Arsitektur Mobile

**Area:** `MOB` · **Status:** Draft · **Basis:** [`mobile-requirements.md`](../PRD/05-mobile/mobile-requirements.md)

---

## 1. Konteks

| Kelompok | ID |
|---|---|
| Kebijakan luring | `MOB-OFF-01` … `MOB-OFF-05`, `NO-07` |
| Media & kamera | `MOB-MED-01` … `MOB-MED-07` |
| Versi aplikasi | `MOB-VER-01` … `MOB-VER-05` |
| Deep link | `MOB-DL-01` … `MOB-DL-05` |
| Izin runtime | Bab 32.5 |
| Performa | `MOB-PERF-01` … `MOB-PERF-05`, `NFR-P-10` |
| Keamanan perangkat | `MOB-SEC-01` … `MOB-SEC-06` |
| Distribusi | `MOB-REL-01` … `MOB-REL-06` |
| Alur lapangan | `FR-05.2`, `FR-09.1`, `FR-11.1`, `FR-12.3`, `FR-13.2` |

Basis teknologi ditetapkan Keputusan #3: **React Native** (Android & iOS).

---

## 2. Keputusan Desain

| ID | Keputusan |
|---|---|
| **SDD-MOB-01** | Aplikasi berbagi **paket skema dan peta enum** dengan web ([SDD-FE-05](11-frontend-architecture.md), `SDD-FE-08`); yang tidak dibagi adalah komponen UI. |
| **SDD-MOB-02** | Antrean unggah berkas **dipersistensi ke penyimpanan perangkat**, bukan hanya di memori — satu-satunya state yang bertahan lintas sesi (`MOB-OFF-02`, `MOB-SEC-06`). |
| **SDD-MOB-03** | Kompresi foto dilakukan **sebelum masuk antrean**, bukan saat unggah — antrean menyimpan berkas yang sudah kecil (`MOB-MED-01`). |
| **SDD-MOB-04** | Unggah memakai **presigned URL langsung ke object storage** ([SDD-09 §4.2](09-file-storage-design.md)); antrean menyimpan `file_id` hasil presign, bukan URL-nya. |
| **SDD-MOB-05** | Gerbang versi paksa dipasang sebagai **interceptor global**; `426` memicu layar yang tidak dapat dilewati (`MOB-VER-03`). |
| **SDD-MOB-06** | Pemindaian opname mengirim hasil **per pemindaian**, bukan menumpuk sampai akhir sesi (`MOB-PERF-03`). |
| **SDD-MOB-07** | Aksi yang mengubah data **gagal eksplisit** saat luring — tidak pernah diantrekan (`MOB-OFF-05`). |
| **SDD-MOB-08** | Token disimpan di Keychain/Keystore melalui satu modul `SecureStore`; tidak ada jalur lain yang boleh menulis token. |
| **SDD-MOB-09** | Refresh token diserialisasi dengan *mutex* pada interceptor, sama alasannya dengan web (`SDD-FE-07`). |
| **SDD-MOB-10** | Aplikasi dibangun di atas **Expo SDK** (*dev build*, bukan Expo Go) dan memakai **EAS Update** untuk pembaruan OTA. Versi React Native mengikuti lini Expo yang dipilih dan **wajib diverifikasi memenuhi `NFR-C-03` sebelum dikunci**. Kanal OTA hanya mengirim bundel JavaScript; perubahan yang menyentuh kode native tetap lewat store dan gerbang `426` (`SDD-MOB-05`). |
| **SDD-MOB-11** | Antrean unggah `SDD-MOB-02` dipersistensi ke **expo-sqlite**. Setiap perubahan status antrean adalah transaksi SQLite, sehingga aplikasi yang mati di tengah unggah tidak merusak antrean. Basis data ini menyimpan **hanya** antrean unggah — batas `MOB-SEC-06` dapat diperiksa dengan membaca isinya. |
| **SDD-MOB-12** | Navigasi memakai **expo-router**. `deep_link` `SDD-NTF-09` berupa path relatif aplikasi dipetakan **langsung** ke rute berbasis berkas; tidak ada tabel penerjemah path → nama layar yang harus dijaga sinkron. |

---

## 3. Alasan

**SDD-MOB-11 — antrean adalah data transaksional, bukan sekantong nilai.** `SDD-MOB-02` menuntut antrean bertahan lintas sesi dan `SDD-MOB-04` menyimpan `file_id` yang ditukar URL presign baru pada setiap percobaan — artinya barisnya bertambah, berubah status, dicoba ulang, dan dihapus setelah sukses, sementara `SDD-MOB-06` menambah laju tulis dengan mengirim per pemindaian.

**MMKV** dan **AsyncStorage** ditolak pada sifat itu, bukan pada kinerjanya. Keduanya penyimpanan kunci–nilai, sehingga antrean berurut menjadi satu blob yang diserialisasi ulang setiap perubahan — dan proses yang mati di tengah penulisan blob merusak seluruh antrean, bukan satu barisnya. Itu kegagalan yang persis terjadi di keadaan yang antrean ini ada untuk melayaninya: jaringan lemah, aplikasi lama di latar, baterai habis.

SQLite memberi penulisan atomik per baris dan kueri "ambil yang belum terkirim" apa adanya. Ia juga membuat `MOB-SEC-06` — tidak ada data operasional permanen di perangkat selain antrean dan token — menjadi klaim yang **dapat diperiksa**: satu berkas basis data yang isinya dapat dibuka dan dihitung, bukan sebaran kunci yang harus dipercaya. Karena `SDD-MOB-10` sudah memilih Expo, `expo-sqlite` tidak menambah modul native di luar lini yang dipakai.

**SDD-MOB-12 — path notifikasi adalah path rute.** `SDD-NTF-09` sengaja menyimpan `deep_link` sebagai path relatif aplikasi agar satu nilai berlaku sama di web dan mobile. **React Navigation** memenuhi itu lewat konfigurasi `linking` — sebuah daftar pemetaan tersendiri yang wajib ikut berubah setiap kali rute bertambah. Daftar seperti itu gagal secara diam: bila ia tertinggal, notifikasi berhenti membuka layarnya dan tidak ada satu pun uji yang merah, karena tidak ada yang bertugas membandingkan daftar itu dengan rute yang benar-benar ada.

expo-router menghapus daftarnya: path **adalah** letak berkas rutenya, sehingga `/reservations/1234` bekerja karena rutenya ada, bukan karena ada yang ingat mendaftarkannya. Ia dibangun di atas React Navigation, jadi tidak ada kemampuan navigasi yang ditutup — termasuk gerbang `426` `SDD-MOB-05`, yang tetap berupa layar penghalang di atas seluruh tumpukan.

**SDD-MOB-02/03 — antrean menyimpan berkas terkompresi.** Ini menyelesaikan masalah nyata di lapangan: lima foto tiket kerusakan (`FR-11.1`) dari kamera ponsel modern bisa mencapai 20 MB. Mengompresinya lebih dulu (`MOB-MED-01`: sisi terpanjang 1600 px, ≤ 500 KB) menurunkan itu menjadi ≈ 2,5 MB — perbedaan antara unggahan yang selesai di jaringan sekolah dan yang tidak. Menyimpan berkas mentah di antrean juga akan menghabiskan penyimpanan perangkat teknisi dalam sehari.

**SDD-MOB-04 — antrean menyimpan `file_id`, bukan URL.** URL presign berumur pendek (300 detik). Bila antrean menyimpan URL dan perangkat luring selama sepuluh menit, seluruh antrean kedaluwarsa. Menyimpan `file_id` berarti antrean meminta URL baru saat benar-benar akan mengunggah.

**SDD-MOB-06 — kirim per pemindaian.** Sesi opname bisa mencakup ribuan unit dan berlangsung berjam-jam. Menahan hasil di perangkat sampai akhir sesi berarti aplikasi yang tertutup atau baterai habis menghapus setengah hari kerja. Mengirim per pemindaian juga membuat progres real-time (`FR-13.2 AC`) benar-benar mungkin.

**SDD-MOB-07 — gagal eksplisit, bukan diantrekan.** Ini penegasan `NO-07`. Menyetujui pengajuan atau mencatat serah terima saat luring lalu "menyinkronkan nanti" akan menghasilkan keputusan berdasarkan data basi — persis kelas masalah yang keputusan online-only hindari. Kegagalan yang jelas lebih baik daripada keberhasilan palsu.

**SDD-MOB-10 — Expo + EAS Update.** Dua pertanyaan yang terlihat terpisah — versi React Native dan strategi OTA — sebenarnya satu, karena lini Expo menetapkan keduanya sekaligus.

Batas kerasnya adalah `NFR-C-03` (Android 8.0/API 26 dan iOS 16.4). Rilis React Native maupun Expo menaikkan lantai OS minimumnya dari waktu ke waktu, jadi versi tidak dapat dipilih sekarang lalu dianggap aman: verifikasi terhadap `NFR-C-03` adalah bagian dari keputusan ini, bukan langkah opsional sesudahnya. Bila lantai lini yang diinginkan sudah berada di atas `NFR-C-03`, jalannya bukan menurunkan diam-diam dukungan perangkat, melainkan menaikkan persoalan itu sebagai perubahan requirement.

**Bare React Native tanpa OTA** ditolak, meski ia paling bersih: setiap perbaikan lapangan menunggu peninjauan store (`MOB-REL-05`, `GL-11`), padahal alur yang dilayani aplikasi ini adalah alur lapangan yang gagal secara eksplisit saat bermasalah (`SDD-MOB-07`) — jarak antara bug dan perbaikannya berbiaya nyata. **OTA swa-kelola** ditolak karena mempertahankan kepemilikan (`MOB-REL-02`) dengan cara yang mahal: sekolah harus mengoperasikan server pembaruan, tepat berlawanan dengan risiko kapasitas operasional yang sudah dicatat [SDD-16 §6](16-infrastructure-deployment.md).

Yang perlu ditegaskan agar keputusan ini tidak salah dibaca: OTA **tidak** menggantikan gerbang versi. `MOB-VER-02`/`MOB-VER-03` sudah menyediakan pemaksaan pembaruan lewat `426`, dan ia tetap satu-satunya jalur bagi perubahan yang menyentuh native. `MOB-SEC-02` (*certificate pinning*) dan `MOB-SEC-03` (deteksi root/jailbreak) adalah modul native — keduanya sekaligus alasan mengapa yang dipakai adalah *dev build*, bukan Expo Go, dan alasan mengapa kanal OTA dibatasi pada bundel JavaScript.

---

## 4. Rancangan

### 4.1 Struktur

```
src/
├── app/                 # rute expo-router, provider, gerbang versi & sesi (SDD-MOB-12)
├── shared/
│   ├── api/             # axios, interceptor, refresh mutex (SDD-MOB-09, SDD-FE-16)
│   ├── secure/          # SecureStore — satu-satunya penulis token (SDD-MOB-08)
│   ├── upload/          # antrean unggah persisten, expo-sqlite (SDD-MOB-02, SDD-MOB-11)
│   ├── camera/          # pemindai QR + kompresi foto (SDD-MOB-03)
│   ├── schemas/         # dibagi dengan web (SDD-MOB-01)
│   └── enums/           # dibagi dengan web
└── features/
    ├── scan/            # FR-05.2 — titik masuk aksi kontekstual
    ├── loans/           # FR-09.1, FR-09.2
    ├── damage/          # FR-11.1
    ├── workorders/      # FR-12.3
    ├── stocktake/       # FR-13.2
    ├── approvals/       # FR-10.2 dari ponsel
    └── notifications/   # FCM + deep link
```

Aplikasi mobile **tidak** mencerminkan seluruh 22 modul — hanya alur yang PRD nyatakan harus berjalan di lapangan.

### 4.2 Antrean unggah

```
enqueue(localUri, ownerType, ownerId?):
   1. kompres (1600 px, JPEG 80%, EXIF dibuang kecuali orientasi)  MOB-MED-01/02
   2. simpan berkas terkompresi ke direktori antrean perangkat
   3. tulis baris antrean { id, path, ownerType, ownerId, attempts, createdAt }

drain():                                    # dipicu: online kembali, app foreground, timer
   untuk tiap baris (FIFO):
      POST /files/presign  →  { upload_url, file_id }
      PUT langsung ke object storage
      POST /files/confirm  { file_id, checksum }
      tautkan ke entitas bila ownerId sudah ada
      hapus baris + berkas lokal

kebijakan:
   maksimum 72 jam atau 50 berkas; melewati itu → buang tertua + beri tahu   MOB-OFF-03
   percobaan ulang: exponential backoff, tanpa batas selama dalam masa 72 jam
```

Entitas yang fotonya masih tertunda ditandai jelas di UI ("Foto belum terunggah") dan muncul pada daftar tindak lanjut Petugas Sarpras (`MOB-OFF-04`).

### 4.3 Kamera & pemindaian

| Aspek | Implementasi |
|---|---|
| Pemindai QR | Pustaka kamera native; bukan pemindai berbasis WebView |
| Mode beruntun | Kamera tetap aktif; hasil ditambahkan ke daftar tanpa menutup pemindai (`MOB-MED-07`) |
| Jalur cadangan | Tombol "Masukkan kode aset manual" **selalu terlihat**, bukan tersembunyi di menu (`FR-05.2 A1`) |
| Izin ditolak | Panduan mengaktifkan + input manual, bukan layar buntu (`MOB-MED-06`) |
| Kompresi | Dilakukan di *worker thread*; UI tidak membeku saat memproses 5 foto |

### 4.4 Deep link

```
Android App Links   : assetlinks.json     di https://{domain}/.well-known/
iOS Universal Links : apple-app-site-association  di lokasi yang sama
Pola                : https://{domain}/{path}  →  route aplikasi yang sama dengan web
```

| Kasus | Perilaku |
|---|---|
| Objek tidak dapat diakses | Layar "tanpa hak akses", bukan galat mentah (`MOB-DL-03`) |
| Objek sudah dihapus/dibatalkan | "Data tidak lagi tersedia" (`MOB-DL-04`, `FR-17.1 A1`) |
| QR dipindai kamera bawaan | Membuka halaman publik; bila aplikasi terpasang, App/Universal Link mengalihkan ke aplikasi (`MOB-DL-05`) |
| Belum login | Simpan tujuan, arahkan ke login, lanjutkan setelah berhasil |

### 4.5 Gerbang startup

```
1. cek versi   → GET /health atau header X-App-Version pada permintaan pertama
                 426 UPGRADE_REQUIRED → layar pembaruan paksa (MOB-VER-03)
2. cek sesi    → token di SecureStore valid?
3. must_change_password → arahkan ke ganti password (FR-01.1 A4)
4. 2FA belum terverifikasi → arahkan ke verifikasi (BR-070)
5. daftarkan token FCM
6. masuk ke dashboard sesuai role
```

Urutan ini mencerminkan gerbang middleware server (`SDD-AUTH-09`) sehingga klien tidak pernah menampilkan layar yang akan ditolak server.

### 4.6 Keamanan perangkat

| Requirement | Implementasi |
|---|---|
| `MOB-SEC-01` | Token hanya via `SecureStore` (Keychain/Keystore) |
| `MOB-SEC-02` | *Certificate pinning* terhadap domain API |
| `MOB-SEC-03` | Deteksi root/jailbreak; peringatan dapat dilewati hanya pada build uji |
| `MOB-SEC-04` | Layar berdata pribadi disembunyikan di *app switcher* |
| `MOB-SEC-05` | Token FCM dicabut saat logout |
| `MOB-SEC-06` | Tidak ada data operasional tersimpan permanen selain antrean unggah & token |

### 4.7 Performa

| Target | Cara |
|---|---|
| Cold start ≤ 3 detik (`MOB-PERF-01`) | Bundel minimal di layar pertama; fitur berat dimuat malas |
| Opname (`MOB-PERF-02`) | Daftar target dimuat **per lokasi**, `per_page` hingga 500 |
| Daftar panjang (`MOB-PERF-04`) | *Virtualized list*; gambar memakai `thumb` |
| Ukuran unduh ≤ 40 MB (`MOB-PERF-05`) | Aset gambar dioptimalkan; font dibatasi |

---

### 4.8 Tata letak tablet

Melampaui minimum `NFR-C-04` yang hanya menuntut potret dan lanskap terbatas. Keputusan pemilik produk `UXD-11`; perilaku layar ditetapkan [`UX/PAGE-SPECIFICATION.md §10.4`](../UX/PAGE-SPECIFICATION.md#104-tablet).

| Layar | Tata letak | Alasan |
|---|---|---|
| `MS-16` Work Order Saya | Master-detail: daftar 320px di kiri, detail di kanan | Teknisi membaca deskripsi sambil melihat antrean |
| `MS-18` Sesi Opname | Master-detail: daftar lokasi kiri, aset target kanan | Satu lokasi dapat memuat ratusan unit (`MOB-PERF-02`) |
| `MS-06` Tugas | Seksi bersebelahan dua kolom | Petugas Sarpras memegang beberapa antrean sekaligus |
| Layar lain | Tata letak ponsel dipusatkan, lebar maksimum terbatas | Menghindari baris teks terlalu panjang |

Konsekuensi: satu kelas perangkat uji baru pada Bab 30.6, dan satu set wireframe tambahan pada `DS-03`.

## 5. Konsekuensi

- Sekolah wajib memiliki domain HTTPS sendiri (`AS-15b`) — App/Universal Links tidak dapat diverifikasi tanpa itu.
- Akun Google Play dan Apple Developer berbayar menjadi prasyarat rilis (`MOB-REL-01`, `AS-15a`), dan kepemilikannya pada sekolah, bukan vendor (`MOB-REL-02`).
- Antrean unggah adalah satu-satunya penyimpanan lokal berisi data; ia masuk lingkup perlindungan data (Bab 28) meski berumur pendek.
- Karena aksi tulis gagal eksplisit saat luring, alur lapangan di area tanpa sinyal (gudang) tetap terhambat. Ini konsekuensi `NO-07` yang diterima; `FE-01` menawarkan penyelesaiannya di rilis berikutnya.
- Akun Expo/EAS tunduk pada aturan yang sama dengan akun store: kepemilikannya pada **sekolah, bukan vendor** (`MOB-REL-02`). Tanpa itu, ketergantungan yang `MOB-REL-02` cegah hanya berpindah tempat.
- EAS Update menjadi langganan pihak ketiga dan karena itu baris biaya operasional baru yang belum ada pada PRD 27.9 — perlu dianggarkan bersama `MOB-REL-01`.
- Versi React Native tidak lagi dipilih sendiri; ia mengikuti lini Expo. Konsekuensinya, pemutakhiran lini Expo adalah pekerjaan terjadwal yang setiap kalinya wajib diperiksa ulang terhadap `NFR-C-03` sebelum dirilis.
- Karena OTA hanya membawa JavaScript, dua jenis rilis hidup berdampingan dan perbedaannya harus jelas dalam runbook rilis: perbaikan JS (menit, tanpa store) dan perubahan native (peninjauan store + gerbang `426`).

---

## 6. Risiko Teknis

| Risiko | Dampak | Mitigasi |
|---|---|---|
| Kompresi menghilangkan detail bukti | Foto kerusakan tidak terbaca | 1600 px terbukti memadai untuk bukti visual; diuji pada foto nyata saat UAT lapangan (`UAT-04`) |
| Antrean membengkak di perangkat teknisi | Penyimpanan penuh | Batas 50 berkas / 72 jam; indikator jumlah tertunda di UI |
| Verifikasi App Links gagal | Deep link membuka browser, bukan aplikasi | Berkas verifikasi diuji sebagai bagian *smoke test* pasca-deploy (`CD-07`) |
| Certificate pinning memutus akses saat sertifikat diperbarui | Aplikasi tidak bisa konek | Pin pada CA, bukan sertifikat daun; prosedur pembaruan didokumentasikan |
| Peninjauan App Store menunda rilis | Jadwal go-live meleset | Diperhitungkan dalam `GL-11`; pengajuan dilakukan lebih awal pada M6 |
| Perangkat kelas bawah (Android 8, RAM 2 GB) | Cold start & kamera lambat | Matriks perangkat uji (Bab 30.6) menyertakan batas bawah, bukan hanya perangkat tim |

---

## 7. Requirement Terkait

`FR-01.1` `FR-05.2` `FR-09.1` `FR-09.2` `FR-11.1` `FR-12.3` `FR-13.2` `FR-10.2` `FR-17.2` ·
`MOB-OFF-01` … `MOB-OFF-05` · `MOB-MED-01` … `MOB-MED-07` · `MOB-VER-01` … `MOB-VER-05` ·
`MOB-DL-01` … `MOB-DL-05` · `MOB-PERF-01` … `MOB-PERF-05` · `MOB-SEC-01` … `MOB-SEC-06` · `MOB-REL-01` … `MOB-REL-06` ·
`NFR-P-10` `NFR-C-03` `NFR-C-04` `NFR-C-05` `NFR-AC-07` · `NO-07` · `AS-15a` `AS-15b` · `GL-11`

---

## 8. TBD

_Tidak ada titik terbuka._

| ID | Ditutup | Keputusan |
|---|---|---|
| **TBD-MOB-B** | 22 Agustus 2026 | **Tablet mendapat tata letak dua panel** pada tiga layar (`UXD-11`). Rancangannya di §4.8. |

### Lini SDK dan integrasi antrean (PR-04-16, 12 Oktober 2026)

Keputusan pemilik produk: Expo SDK 57, React Native 0.86.0, React 19.2.3; minimum OS sesuai NFR-C-03 yang diperbarui (Android 8/API 26, iOS 16.4). Versi diteliti dari dokumentasi resmi https://docs.expo.dev/versions/latest/ dan bundledNativeModules.json pada paket expo 57.0.0. Modul native mengikuti lini itu dan lockfile mengunci patch terpilih.

`SDD-MOB-02/04/11`: preparePhoto mengompresi/membuang EXIF sebelum presign dan transaksi server pemilik foto. Enqueue dilakukan setelah transaksi server menautkan file_id. Drain hanya mengirim berkas; confirm idempoten dengan checksum yang sama dicoba lebih dulu untuk menangani respons confirm yang hilang, baru meminta URL ulang PR-04-15 jika objek belum terunggah. Metadata antrean menyertakan pemilik akun agar login akun berbeda tidak mengambil unggahannya. Batas usia/jumlah berlaku per perangkat. Perubahan baris diserialkan lalu memakai transaksi eksklusif SQLite. Proses mati setelah penghapusan baris tidak mempertahankan berkas yatim: adapter membersihkan direktori antrean saat startup.

SecureStore menyimpan pasangan token dalam satu rekaman; revision mencegah respons refresh lama menghidupkan sesi sesudah logout. Refresh 401 diserialkan, login/verifikasi tidak memicu refresh; gangguan jaringan tidak menghapus token. Profil/permission/challenge tetap di memori. Gerbang password/2FA mengikuti kode server. App switcher dilindungi sebelum layar berdata pribadi ditampilkan. EAS tidak dipublikasikan; OTA aktif hanya jika ID proyek sekolah dikonfigurasi. Pengerasan pinning/root serta distribusi tetap PR-08-13.


### Implementasi PR-05-32 (12 Oktober 2026)

MS-07 memakai expo-camera 57.0.6, kamera belakang dan barcode QR saja. Izin diminta melalui tombol
pada pemindai; penolakan menyediakan pengaturan sistem dan input manual. Kamera dilepas saat
layar tidak fokus/aplikasi masuk latar belakang. Mode beruntun menyimpan maksimal 200 hasil ringkas
hanya di memori layar (FlatList); duplikat sukses diabaikan, permintaan tunggal dapat dibatalkan.
Pemindaian ulang QR gagal dibatasi 1,5 detik agar kamera tidak membanjiri API. Kode manual dicocokkan
persis tanpa memilih hasil pencarian serupa, mengikuti seluruh halaman katalog yang diizinkan.

QR harus HTTPS pada origin EXPO_PUBLIC_APP_URL (fallback origin API), path /a/UUIDv4 persis,
tanpa kredensial/query/fragment. Tidak ada navigasi atau permintaan ke URL yang dipindai.
App/Universal Links dikonfigurasi dari domain sekolah; association files dan sertifikat binary
sekolah tetap perlu pemasangan/validasi di deployment PR-08-02. Tujuan /a/[uuid] tetap tersedia
setelah autentikasi melalui SessionGate. Variabel publik runtime memakai dot notation agar Expo
menginjeksi nilai saat bundling; URL API dan origin web dapat berbeda.

MS-08/09 menggunakan API privat sesuai asset.view, menandai aset dihapuskan/tidak tersedia,
memuat foto/linimasa berpaginasi tanpa cache operasional. BR-073 tetap difilter server dan UI.
Keputusan produk: tombol transaksi per permission/status nonaktif dengan alasan karena layar
serah terima, pengembalian, opname, work order, reservasi dan laporan kerusakan belum tersedia.
Tidak ada transaksi atau konteks aktif yang diasumsikan berhasil. Izin aktual adalah loan.manage,
audit.execute, workorder.execute, damage.create dan reservation.create dari katalog RBAC.


### Implementasi PR-04-17 (13 Oktober 2026)

Keputusan pemilik produk: PR berurutan sesudah PR-05-32; API/domain yang belum tersedia tidak
ditambahkan di PR ini, bagian/aksi diberi alasan dan nonaktif. Beranda memakai manifest kartu
server dan rentang yang ada; tren baru dimuat ketika dibuka, data grafik punya bentuk tekstual
aksesibel. Tugas mengikuti gabungan permission UXD-03, tidak nama role. Notifikasi in-app dibaca
berpaginasi, hitungan disegarkan saat foreground/push dan interval 30 detik selama aktif.

Navigasi lima tab memakai route groups expo-router; path pengajuan/aset tidak diterjemahkan
ke nama layar. Stack Tugas/Scan mengikat deep link ke tab induk. Payload push hanya membuka
path relatif kanonik; tujuan sebelum login ditahan di memori dan event terikat akun lama dibuang.
Layar belum tersedia memiliki jalan kembali; data operasional tidak disimpan lokal.

React Native Firebase app/messaging/installations 26.4.0 memakai FID melalui getId sesuai
keputusan 80e backend, setelah registrasi transport FCM native. expo-notifications 57.0.22 hanya
mengelola izin, kanal dan tray; tidak memakai Expo Push Service atau mendaftarkan token APNs.
SDK minimum Firebase iOS15/Android23 tetap di bawah iOS16.4/Android26 aplikasi. Kedua file konfigurasi
Firebase sekolah wajib tersedia untuk mengaktifkan plugin, jika tidak fallback in-app. Framework
CocoaPods static; runtime aplikasi 0.2.0 karena ada dependency native baru. APNs environment lokal
development, profil EAS internal/store production sesuai provisioning yang dipilih.

Auto-init Firebase mati sampai sesi/izin siap. Foreground memicu banner generik dan refresh,
background handler tidak menjalankan transaksi atau menyimpan payload, headless iOS tidak memuat
UI/auth/dashboard. Logout lebih dulu mengganti gerbang ke LOGOUT sehingga layar privat/kamera
lepas; hook mencabut FID backend, token/installation native dan tray, lalu sesi API dan SecureStore.
Generation/AbortSignal mencegah registrasi/respons sesi lama kembali; login diblokir selama logout.
Kontrak response dashboard/notifikasi dipakai bersama API/mobile lewat packages/schemas,
tanpa endpoint baru atau perubahan permission/mesin approval. Push cloud nyata dan association
files/binary tetap menuntut konfigurasi sekolah dan QA perangkat.


### Implementasi PR-05-35 (13 Oktober 2026)

MS-20 dibuka dari Tugas, aksi cepat atau path /persetujuan/{instance_id} pada NT-01/NT-05.
Kotak masuk mengikuti urutan server dan pagination; delegasi/SLA memakai hasil backend.
Kontrak pending/decide dipindah ke packages/schemas tanpa mengubah endpoint atau mesin approval.
Linimasa lengkap memakai kontrak FR-10.3, termasuk langkah dilewati, eskalasi, delegasi, SYSTEM
dan durasi menit kerja. Rincian reservasi ruangan serta ketersediaan dimuat ulang sebelum
keputusan; identitas instance, objek, pemohon dan langkah aktif harus cocok.

Keputusan pemilik produk melalui pertanyaan: FR-10.2 langkah 3 dan UX 7.6.4 tetap mengikat.
API role pemohon serta riwayat keterlambatan/kewajiban belum tersedia; reader tidak menganggap
kosong atau nol. Seluruh keputusan tetap nonaktif dengan alasan sampai semua konteks wajib
tersedia, termasuk reservasi ruangan yang detail dasarnya sudah dapat dibaca. Jenis objek lain
tetap terlihat di inbox/linimasa, tanpa mengaktifkan keputusan dari ringkasan atau payload push.
Tidak menambah backend domain, endpoint, migration, permission atau pengecualian requirement.

Konfirmasi native, catatan wajib Tolak/Perlu Revisi dan tombol keputusan tetap di bagian bawah
layar. Satu niat memakai UUID idempotency di memori; retry manual hasil belum pasti mempertahankan
body/key, termasuk REQUEST_IN_PROGRESS. Tidak ada antrean keputusan luring atau retry latar
belakang. RE-09 menampilkan pelaku/waktu dan menyegarkan linimasa. Abort saat blur/background
atau logout mencegah respons menulis layar akun lain. Pengujian gerbang memakai fixture konteks
lengkap; fixture tidak berada pada jalur produksi.


### Implementasi PR-05-34 (13 Oktober 2026)

MS-15 memakai kontrak M-11 yang tersedia: objek dari hasil scan/detail aset atau pencarian aset/
ruangan, deskripsi, urgensi dan foto. Kamera/galeri memakai expo-image-picker 57.0.20; kompresi
MOB-MED-01/02 tetap melalui fondasi native. Izin diminta saat dibutuhkan; mikrofon dinonaktifkan.
Runtime menjadi 0.3.0 karena dependency native baru. Pilihan kamera ditolak tetap menyediakan
galeri. Identitas objek dari deep link dibaca ulang, bukan mempercayai label pada query.

Keputusan produk: cabang terpisah sesudah PR-05-35; isian hanya di memori. Laporan/catatan dikirim
saat online setelah file_id diperoleh. Foto baru dipersistensi setelah presign dan SEBELUM POST
bisnis, ownerId boleh null untuk DAMAGE_PHOTO; setelah respons ownerId diperbarui. Drain boleh
mengirim DAMAGE_PHOTO yang file_id-nya telah diperoleh meskipun respons penautan belum diketahui,
karena server tetap menegakkan kepemilikan berkas. Jenis foto lain tetap menuntut ownerId.
Checkpoint ini menutup kehilangan antrean saat proses mati antara POST dan respons. Draf yang
belum memperoleh file_id tidak menjadi antrean transaksi. URL/token/isian tidak masuk SQLite.

Pemeriksaan tiket terbuka memakai ringkasan /damage-reports/open sesuai damage.view. Alternatif
A1 menawarkan informasi tambahan, 0-5 foto, tanpa membuka detail tiket pihak lain pada scope own.
Pemegang damage.create tanpa damage.view masih dapat mengirim laporan baru; server tetap mencegah
duplikat dan UI menjelaskan keterbatasan baca. Status/detail tiket mengikuti scope backend dan
foto hanya dibaca setelah CLEAN; URL privat tidak dipersistensi. Daftar dan catatan ditampilkan
dalam halaman kecil, antrean memiliki progres per berkas, retry manual dan pembatalan eksplisit.

API laporan/catatan belum mendukung idempotency key. Pilihan produk: tidak mengulang POST saat
respons hilang/5xx/timeout; niat ditahan sebagai hasil belum pasti sampai pengguna memeriksa tiket.
Tidak menganggap tiket hasil pemeriksaan pasti milik niat itu. Byte foto saja tetap memakai retry
backoff, 72 jam/50 berkas. Respons sukses diingat sebelum memperbarui metadata owner; kegagalan
metadata tidak mengulang transaksi. Abort/guard akun dan lock tap ganda membatasi respons lama.
Tidak ada perubahan backend domain, migration, permission atau kontrak M-11.
