# M-17 — Notifikasi

> **Modul self-contained.** Seluruh yang diperlukan untuk mengimplementasikan modul ini ada di
> berkas ini: requirement, aturan bisnis, endpoint, entitas, notifikasi, permission, jejak audit,
> dan kriteria penerimaan. Baris yang dimiliki modul lain dirujuk melalui ID, tidak disalin.
>
> Isi requirement bersifat **verbatim dari PRD v1.1**. Sumber kebenaran tunggal.

## 1. Overview

Lihat [`../01-product/overview.md`](../01-product/overview.md) untuk konteks produk menyeluruh.
Modul ini adalah **M-17 — Notifikasi** sebagaimana terdaftar pada Daftar Modul PRD.

## 2. Scope

Cakupan modul ditentukan oleh Functional Requirement yang tercantum pada bagian 5.
Hal di luar daftar tersebut berada di luar cakupan modul ini.

## 3. Actors

Aktor per requirement tercantum pada tabel **Actor** di tiap FR (bagian 5).
Definisi role: [`../00-foundation/roles-permissions.md`](../00-foundation/roles-permissions.md).

## 4. Business Flow

_Diagram alur khusus modul ini tidak ada pada PRD. Alur lintas modul: [`../03-architecture/system-overview.md`](../03-architecture/system-overview.md)._

## 5. Functional Requirements

### FR-17.1 Notifikasi In-App

| Aspek | Uraian |
|---|---|
| **Description** | Pusat notifikasi di dalam aplikasi web dan mobile, memuat seluruh pemberitahuan yang relevan bagi pengguna. |
| **Actor** | Seluruh role |
| **Preconditions** | Pengguna login |

**Main Flow**
1. Sistem menghasilkan notifikasi ketika suatu event terjadi (daftar lengkap pada Bab 20).
2. Ikon lonceng menampilkan jumlah notifikasi belum dibaca.
3. Pengguna membuka pusat notifikasi dan melihat daftar terurut dari terbaru.
4. Pengguna menekan notifikasi; sistem menandainya terbaca dan mengarahkan ke objek terkait (*deep link*).
5. Pengguna dapat menandai seluruh notifikasi sebagai terbaca.

**Alternative Flow**
- **A1 — Objek terkait sudah dihapus/dibatalkan:** Sistem menampilkan pesan "Data tidak lagi tersedia" alih-alih halaman galat.
- **A2 — Notifikasi lebih dari 90 hari:** Diarsipkan otomatis dan hanya tampil melalui filter arsip.
- **A3 — Filter:** Pengguna dapat memfilter berdasarkan jenis notifikasi dan status baca.

**Post Conditions** — Status baca notifikasi terbarui.

**Mekanisme Pengiriman (ditetapkan pada audit — sebelumnya tidak dispesifikasi)**

| Kanal | Transport | Ketentuan |
|---|---|---|
| Web | **Server-Sent Events (SSE)** pada `GET /notifications/stream` | Dipilih karena arahnya satu (server→klien), ringan, dan otomatis melakukan *reconnect*. WebSocket tidak diperlukan karena tidak ada kebutuhan komunikasi dua arah |
| Web (fallback) | *Polling* setiap 60 detik | Aktif otomatis bila SSE gagal tersambung tiga kali berturut-turut atau diblokir proxy sekolah |
| Mobile | FCM push (FR-17.2) + pengambilan saat aplikasi dibuka | In-app dimuat ulang saat aplikasi kembali ke *foreground* |

| Kode | Requirement |
|---|---|
| NTF-01 | Koneksi SSE terikat pada `user_id` hasil autentikasi, bukan parameter yang dikirim klien |
| NTF-02 | Fanout antar-instance API dilakukan melalui Redis Pub/Sub agar notifikasi sampai meskipun pengguna terhubung ke instance berbeda dari yang menghasilkan event |
| NTF-03 | Batas 2 koneksi SSE aktif per pengguna; koneksi terlama diputus bila melebihi |
| NTF-04 | Penulisan notifikasi ke basis data dilakukan **di dalam** transaksi bisnis; pengiriman (SSE/FCM) dilakukan **di luar** transaksi melalui antrean, sehingga kegagalan pengiriman tidak pernah menggagalkan transaksi bisnis (NFR-A-06) |
| NTF-05 | Penghitung belum dibaca dihitung di server dan disiarkan ulang setiap perubahan, bukan dihitung ulang oleh klien |

**Acceptance Criteria**
- [ ] Notifikasi muncul ≤ 60 detik setelah event terjadi pada web maupun mobile.
- [ ] Notifikasi tetap sampai ketika pengguna terhubung ke instance API yang berbeda dari penghasil event (NTF-02).
- [ ] Penghitung belum dibaca akurat dan tersinkron antara web dan mobile.
- [ ] Kegagalan koneksi SSE beralih ke polling tanpa kehilangan notifikasi.
- [ ] Setiap notifikasi memiliki *deep link* yang membuka objek terkait.

### FR-17.2 Push Notification Mobile

| Aspek | Uraian |
|---|---|
| **Description** | Pengiriman notifikasi ke aplikasi mobile melalui Firebase Cloud Messaging agar informasi penting diterima tanpa membuka aplikasi. |
| **Actor** | Seluruh role pengguna aplikasi mobile |
| **Preconditions** | Pengguna login pada aplikasi mobile dan mengizinkan notifikasi |

**Main Flow**
1. Saat login mobile, aplikasi mendaftarkan token perangkat ke server.
2. Ketika event terjadi, sistem mengirim push notification ke seluruh perangkat aktif milik pengguna sasaran.
3. Pengguna menekan notifikasi; aplikasi terbuka langsung pada halaman objek terkait.

**Alternative Flow**
- **A1 — Izin notifikasi ditolak:** Sistem tetap mengirim notifikasi in-app; aplikasi menampilkan ajakan mengaktifkan izin.
- **A2 — Token perangkat tidak valid/kedaluwarsa:** Sistem menghapus token dari basis data.
- **A3 — Pengiriman gagal:** Sistem mencoba ulang maksimal 3 kali dengan jeda bertingkat, lalu mencatat kegagalan.
- **A4 — Pengguna login di beberapa perangkat:** Notifikasi dikirim ke seluruh perangkat aktif.

**Post Conditions** — Push terkirim; status pengiriman tercatat.

**Acceptance Criteria**
- [ ] Push terkirim ≤ 60 detik setelah event.
- [ ] Notifikasi kritis (urgensi `Kritis`, keterlambatan, persetujuan menunggu) selalu dikirim sebagai push.
- [ ] Token dihapus otomatis saat logout.
- [ ] Kegagalan pengiriman tidak menggagalkan transaksi bisnis yang menjadi pemicunya.

### FR-17.3 Preferensi Notifikasi

| Aspek | Uraian |
|---|---|
| **Description** | Pengguna mengatur jenis notifikasi yang ingin diterima per kanal. |
| **Actor** | Seluruh role |
| **Preconditions** | Pengguna login |

**Main Flow**
1. Pengguna membuka Pengaturan → Notifikasi.
2. Sistem menampilkan daftar jenis notifikasi yang relevan dengan rolenya beserta pengalih untuk kanal in-app dan push.
3. Pengguna menyesuaikan dan menyimpan.

**Alternative Flow**
- **A1 — Notifikasi wajib** (persetujuan menunggu, keterlambatan, kerusakan kritis): Tidak dapat dinonaktifkan dan ditandai sebagai wajib.

**Post Conditions** — Preferensi tersimpan dan diterapkan pada pengiriman berikutnya.

**Acceptance Criteria**
- [ ] Preferensi berlaku seketika setelah disimpan.
- [ ] Notifikasi wajib tetap terkirim terlepas dari preferensi pengguna.

## 6. Business Rules

### Dimiliki modul ini

_Tidak ada aturan bisnis yang dimiliki modul ini._

## 7. API Endpoints

### Endpoint

| Method | Endpoint | Permission | Deskripsi |
|---|---|---|---|
| GET | `/notifications` | Bearer | Daftar notifikasi pengguna |
| GET | `/notifications/stream` | Bearer | Aliran notifikasi real-time via SSE (NTF-01) |
| PATCH | `/notifications/{id}/read` | Bearer | Tandai terbaca |
| PATCH | `/notifications/read-all` | Bearer | Tandai semua terbaca |
| PUT | `/notifications/preferences` | Bearer | Atur preferensi notifikasi |
| POST | `/device-tokens` | Bearer | Daftarkan token perangkat FCM |
| DELETE | `/device-tokens/{token}` | Bearer | Cabut token perangkat |

Konvensi umum, format respons, kode galat, dan ketentuan keamanan API:
[`../03-architecture/api-conventions.md`](../03-architecture/api-conventions.md).

## 8. Database Entity

### Entitas

| Entitas | Deskripsi | Atribut Utama | Keterangan |
|---|---|---|---|
| **notifications** | Notifikasi pengguna | id, user_id, jenis, judul, isi, referensi_jenis, referensi_id, dibaca_pada, created_at | ± 40.000 |
| **notification_deliveries** | Hasil pengiriman **per kanal** untuk satu notifikasi — satu notifikasi dapat dikirim in-app dan push dengan nasib berbeda (`FR-17.2 A3`, `A4`) | id, notification_id, kanal, status, attempts, sent_at | ± 70.000 |
| **device_tokens** | Token perangkat untuk push | id, user_id, token, platform, terakhir_aktif | ± 1.500 |

Model data menyeluruh dan ERD: [`../03-architecture/data-model.md`](../03-architecture/data-model.md).

## 9. Notification

### Notifikasi diterbitkan modul ini

_Modul ini tidak menerbitkan notifikasi._

Ketentuan umum kanal, latensi, dan preferensi: [`m17-notifications.md`](m17-notifications.md).

## 10. Permission

### Kode permission

| Kode | Domain | Deskripsi singkat | Role bawaan pemilik |
|---|---|---|---|
| `notification.manage_own` | Notifikasi | Mengelola notifikasi & preferensi sendiri | Semua role |

Katalog kanonik & aturan scope: [`../00-foundation/roles-permissions.md`](../00-foundation/roles-permissions.md).

## 11. Activity Log

### Aksi yang wajib dicatat

_Tidak ada aksi khusus modul ini._

Prinsip, struktur entri, dan tamper-evidence: [`../03-architecture/activity-log.md`](../03-architecture/activity-log.md).

## 12. Acceptance Criteria

Kriteria penerimaan tercantum **inline** pada tiap Functional Requirement di bagian 5,
sesuai bentuk aslinya di PRD. Tidak diringkas maupun dipindahkan agar tidak terpisah dari
konteks requirement-nya.

Strategi pengujian: [`../06-quality/test-strategy.md`](../06-quality/test-strategy.md).

## 13. Dependencies

- [`m02-users.md`](m02-users.md) — M-02 Manajemen User & Role

## 14. Related Modules

- [`m02-users.md`](m02-users.md) — M-02 Manajemen User & Role

## 15. Open Issues

- Katalog notifikasi NT-01…NT-51 tidak berada di modul ini; setiap baris dimiliki modul yang menerbitkan event-nya. Indeks lengkap digenerate di [`_generated/notifications-index.md`](../_generated/notifications-index.md).
