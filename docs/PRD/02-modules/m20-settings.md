# M-20 — Konfigurasi Sistem

> **Modul self-contained.** Seluruh yang diperlukan untuk mengimplementasikan modul ini ada di
> berkas ini: requirement, aturan bisnis, endpoint, entitas, notifikasi, permission, jejak audit,
> dan kriteria penerimaan. Baris yang dimiliki modul lain dirujuk melalui ID, tidak disalin.
>
> Isi requirement bersifat **verbatim dari PRD v1.1**. Sumber kebenaran tunggal.

## 1. Overview

Lihat [`../01-product/overview.md`](../01-product/overview.md) untuk konteks produk menyeluruh.
Modul ini adalah **M-20 — Konfigurasi Sistem** sebagaimana terdaftar pada Daftar Modul PRD.

## 2. Scope

Cakupan modul ditentukan oleh Functional Requirement yang tercantum pada bagian 5.
Hal di luar daftar tersebut berada di luar cakupan modul ini.

## 3. Actors

Aktor per requirement tercantum pada tabel **Actor** di tiap FR (bagian 5).
Definisi role: [`../00-foundation/roles-permissions.md`](../00-foundation/roles-permissions.md).

## 4. Business Flow

_Diagram alur khusus modul ini tidak ada pada PRD. Alur lintas modul: [`../03-architecture/system-overview.md`](../03-architecture/system-overview.md)._

## 5. Functional Requirements

### FR-20.1 Pengaturan Parameter Sistem

| Aspek | Uraian |
|---|---|
| **Description** | Administrator mengelola parameter global yang memengaruhi perilaku sistem tanpa perlu perubahan kode. |
| **Actor** | Administrator |
| **Preconditions** | Administrator login |

**Main Flow**
1. Administrator membuka menu Pengaturan Sistem.
2. Administrator mengelola kelompok parameter berikut:

| Kelompok | Parameter |
|---|---|
| **Identitas Sekolah** | Nama sekolah, NPSN, alamat, logo, kepala sekolah, tahun ajaran aktif |
| **Kode Aset** | Pola format kode (mis. `{KATEGORI}-{LOKASI}-{URUT}`), panjang nomor urut, penanda pemisah |
| **Peminjaman** | Durasi maksimum per role, batas jumlah unit per pengajuan, tenggat minimum pengajuan (H-n), batas jumlah perpanjangan per peminjaman (bawaan 1) |
| **Denda** | Tarif denda per hari keterlambatan, **batas maksimum (cap) denda sebagai persentase nilai perolehan** (bawaan 30%), ambang nominal pemblokiran pemohon, kebijakan pembulatan hari, pengalih "kecualikan hari libur dari perhitungan denda", kebijakan penetapan nilai ganti rugi |
| **Reservasi** | Jam operasional sekolah, hari kerja, jarak minimum pengajuan, durasi maksimum per reservasi, **horizon pemesanan** (bawaan 90 hari), **TTL slot tentative** (bawaan 48 jam), **kuota pengajuan tertunda per role** (bawaan Guru/Staf 5, Siswa 2) |
| **Kalender Akademik** | Tahun ajaran aktif, tanggal mulai & selesai semester, daftar hari libur, hari kerja sekolah (Lampiran E) |
| **Maintenance** | Ambang biaya pemeliharaan kumulatif untuk rekomendasi penggantian, SLA tindak lanjut per tingkat urgensi |
| **Satuan Bahan** | Daftar satuan yang boleh dipakai bahan (rim, pcs, botol, liter, dus, dan seterusnya) — dapat ditambah dan dinonaktifkan, **tidak dapat diketik bebas** oleh pengguna (`BR-084`) |
| **Bahan** | Ambang permintaan bahan yang mewajibkan approval — di bawahnya permintaan langsung dilayani Petugas (`BR-086`) |
| **Notifikasi** | Waktu pengingat jatuh tempo (H-n), jam pengiriman ringkasan harian |
| **Keamanan** | Kebijakan password, durasi sesi, ambang penguncian akun, role yang wajib 2FA |
| **Chatbot AI** | Model yang dipakai, batas percakapan harian per pengguna, pengalih aktif/nonaktif |

3. Administrator menyimpan; sistem memvalidasi rentang nilai yang wajar.
4. Perubahan berlaku pada transaksi berikutnya.

**Alternative Flow**
- **A1 — Nilai di luar rentang wajar:** Sistem menolak dengan penjelasan batas yang diizinkan.
- **A2 — Perubahan format kode aset:** Hanya berlaku untuk aset baru; kode aset yang sudah ada tidak berubah, dan sistem menampilkan peringatan atas hal ini.
- **A3 — Perubahan tarif denda:** Hanya berlaku untuk denda yang terbit setelah perubahan; denda yang sudah terbit tidak dihitung ulang.

**Post Conditions** — Parameter tersimpan dan diterapkan; seluruh perubahan tercatat di activity log.

**Acceptance Criteria**
- [ ] Perubahan parameter berlaku tanpa perlu deployment maupun restart layanan.
- [ ] Setiap parameter menampilkan penjelasan singkat dan nilai bawaan.
- [ ] Perubahan parameter tercatat lengkap dengan nilai lama dan baru.
- [ ] Hanya role Administrator yang dapat mengakses menu ini.

## 6. Business Rules

### Dimiliki modul ini

_Tidak ada aturan bisnis yang dimiliki modul ini._

## 7. API Endpoints

### Endpoint

| Method | Endpoint | Permission | Deskripsi |
|---|---|---|---|
| GET | `/settings` | `setting.view` | Baca parameter sistem |
| PUT | `/settings` | `setting.manage` | Perbarui parameter sistem |
| GET | `/health/live` | publik | Liveness probe — tanpa memeriksa dependensi (`OBS-04`) |
| GET | `/health/ready` | publik | Readiness probe — DB, Redis, storage siap |
| GET | `/health` | `setting.view` | Ringkasan kesehatan dependensi untuk kartu Kesehatan Integrasi (`OBS-06`) |

Konvensi umum, format respons, kode galat, dan ketentuan keamanan API:
[`../03-architecture/api-conventions.md`](../03-architecture/api-conventions.md).

## 8. Database Entity

### Entitas

| Entitas | Deskripsi | Atribut Utama | Keterangan |
|---|---|---|---|
| **system_settings** | Parameter global sistem | key, value, tipe, kelompok, deskripsi | Administrator |
| **material_units** | Master satuan bahan — daftar tertutup yang dikelola Administrator (`BR-084`) | id, nama, simbol, keterangan, status | Administrator |

Model data menyeluruh dan ERD: [`../03-architecture/data-model.md`](../03-architecture/data-model.md).

## 9. Notification

### Notifikasi diterbitkan modul ini

_Modul ini tidak menerbitkan notifikasi._

Ketentuan umum kanal, latensi, dan preferensi: [`m17-notifications.md`](m17-notifications.md).

## 10. Permission

### Kode permission

| Kode | Domain | Deskripsi singkat | Role bawaan pemilik |
|---|---|---|---|
| `setting.view` | Sistem | Melihat parameter sistem | Admin, Pimpinan(view) |
| `setting.manage` 🔒 | Sistem | Mengubah parameter sistem | Admin |

Katalog kanonik & aturan scope: [`../00-foundation/roles-permissions.md`](../00-foundation/roles-permissions.md).

## 11. Activity Log

### Aksi yang wajib dicatat

| Aksi | Keterangan |
|---|---|
| `SETTING_UPDATED` | Perubahan parameter sistem beserta nilai lama/baru |

Prinsip, struktur entri, dan tamper-evidence: [`../03-architecture/activity-log.md`](../03-architecture/activity-log.md).

## 12. Acceptance Criteria

Kriteria penerimaan tercantum **inline** pada tiap Functional Requirement di bagian 5,
sesuai bentuk aslinya di PRD. Tidak diringkas maupun dipindahkan agar tidak terpisah dari
konteks requirement-nya.

Strategi pengujian: [`../06-quality/test-strategy.md`](../06-quality/test-strategy.md).

## 13. Dependencies

_Tidak bergantung pada modul lain._

## 14. Related Modules

- [`m22-materials.md`](m22-materials.md) — M-22 Manajemen Bahan (konsumen master satuan)

## 15. Open Issues

_Tidak ada isu terbuka._
