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

Batas kerasnya adalah `NFR-C-03` (Android 8.0/API 26 dan iOS 14). Rilis React Native maupun Expo menaikkan lantai OS minimumnya dari waktu ke waktu, jadi versi tidak dapat dipilih sekarang lalu dianggap aman: verifikasi terhadap `NFR-C-03` adalah bagian dari keputusan ini, bukan langkah opsional sesudahnya. Bila lantai lini yang diinginkan sudah berada di atas `NFR-C-03`, jalannya bukan menurunkan diam-diam dukungan perangkat, melainkan menaikkan persoalan itu sebagai perubahan requirement.

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
