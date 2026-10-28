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
| **Reservasi** | Jam operasional sekolah, hari kerja, jarak minimum pengajuan, durasi maksimum per reservasi (bawaan 12 jam — sepanjang jam operasional bawaan), **horizon pemesanan** (bawaan 90 hari), **TTL slot tentative** (bawaan 48 jam), **kuota pengajuan tertunda per role** (bawaan Guru/Staf 5, Siswa 2), **granularitas slot kalender** (bawaan 30 menit; 15, 30, atau 60 — CAL-UI-02) |
| **Kalender Akademik** | Tahun ajaran aktif, tanggal mulai & selesai semester, daftar hari libur, hari kerja sekolah (Lampiran E) |
| **Maintenance** | Ambang biaya pemeliharaan kumulatif untuk rekomendasi penggantian, SLA tindak lanjut per tingkat urgensi |
| **Satuan Bahan** | Daftar satuan yang boleh dipakai bahan (rim, pcs, botol, liter, dus, dan seterusnya) — dapat ditambah dan dinonaktifkan, **tidak dapat diketik bebas** oleh pengguna (`BR-084`) |
| **Bahan** | Ambang permintaan bahan yang mewajibkan approval — di bawahnya permintaan langsung dilayani Petugas (`BR-086`) |
| **Notifikasi** | Waktu pengingat jatuh tempo (H-n), jam pengiriman ringkasan harian |
| **Keamanan** | Kebijakan password, durasi sesi, ambang penguncian akun, role yang wajib 2FA |
| **Chatbot AI** | Model versi tetap (awal gemini-3.6-flash), batas harian awal 50 pesan/akun dengan reset 00.00 WIB, pengalih aktif/nonaktif, ambang token harian alarm (0 sebelum dikalibrasi TBD-AI-C; tidak memberi kesan alarm aktif) — keputusan pengguna 14 Oktober 2026, M-19 §7 |

3. Administrator menyimpan; sistem memvalidasi rentang nilai yang wajar.
4. Perubahan berlaku pada transaksi berikutnya.

Durasi ruangan memakai `reservasi.durasi_maksimum_jam`, bilangan bulat 1–24,
bawaan 12 (PR-03-38). Batas per kemunculan, termasuk mendesak, berulang dan
gabungan ruangan/aset; perubahan tidak mengubah pengajuan yang sudah tersimpan.
P-70 menampilkan deskripsi, bawaan dan rentang dari metadata parameter.

**Alternative Flow**
- **A1 — Nilai di luar rentang wajar:** Sistem menolak dengan penjelasan batas yang diizinkan.
- **A2 — Perubahan format kode aset:** Hanya berlaku untuk aset baru; kode aset yang sudah ada tidak berubah, dan sistem menampilkan peringatan atas hal ini.
- **A3 — Perubahan tarif denda:** Kebijakan peminjaman mengikuti snapshot BR-029; denda yang sudah terbit tidak dihitung ulang.

**Post Conditions** — Parameter tersimpan dan diterapkan; seluruh perubahan tercatat di activity log.

**Acceptance Criteria**
- [ ] Perubahan parameter berlaku tanpa perlu deployment maupun restart layanan.
- [ ] Setiap parameter menampilkan penjelasan singkat dan nilai bawaan.
- [ ] Perubahan parameter tercatat lengkap dengan nilai lama dan baru.
- [ ] Hanya role Administrator (`setting.manage`) yang dapat mengubah parameter; Pimpinan Sekolah (`setting.view`) hanya membaca.

## 6. Business Rules

### Dimiliki modul ini

_Tidak ada aturan bisnis yang dimiliki modul ini._

## 7. API Endpoints

### Endpoint

| Method | Endpoint | Permission | Deskripsi |
|---|---|---|---|
| GET | `/settings` | `setting.view` | Baca parameter sistem |
| PUT | `/settings` | `setting.manage` | Perbarui parameter sistem |
| GET | `/material-units` | `setting.view` | Daftar satuan Bahan beserta status |
| POST | `/material-units` | `setting.manage` | Administrator menambah satuan Bahan |
| PATCH | `/material-units/{id}/status` | `setting.manage` | Administrator mengaktifkan/nonaktifkan satuan Bahan |
| GET | `/academic-years` | `setting.view` | Daftar tahun ajaran beserta semesternya (Lampiran E.2) |
| POST | `/academic-years` | `setting.manage` | Buat tahun ajaran beserta semesternya; tahun ajaran pertama otomatis aktif (`AC-YR-01`) |
| PUT | `/academic-years/{id}` | `setting.manage` | Sunting nama, rentang tanggal, dan semester tahun ajaran |
| PATCH | `/academic-years/{id}/activate` | `setting.manage` | Jadikan tahun ajaran aktif; tepat satu yang aktif (`AC-YR-02`) |
| GET | `/holidays` | `setting.view` | Daftar hari libur (filter tahun ajaran) |
| POST | `/holidays` | `setting.manage` | Tambah hari libur |
| PUT | `/holidays/{id}` | `setting.manage` | Sunting hari libur |
| DELETE | `/holidays/{id}` | `setting.manage` | Hapus hari libur |
| GET | `/work-days` | `setting.view` | Baca hari kerja sekolah |
| PUT | `/work-days` | `setting.manage` | Perbarui hari kerja sekolah |
| GET | `/work-units` | `setting.view` | Daftar unit kerja (filter jenis, status) — Lampiran E.3 |
| POST | `/work-units` | `setting.manage` | Buat unit kerja |
| PUT | `/work-units/{id}` | `setting.manage` | Sunting unit kerja |
| PATCH | `/work-units/{id}/status` | `setting.manage` | Aktifkan atau nonaktifkan unit kerja; tidak ada hapus (`WU-02`) |
| GET | `/health/live` | publik | Liveness probe — tanpa memeriksa dependensi (`OBS-04`) |
| GET | `/health/ready` | publik | Readiness probe — DB, Redis, storage siap |
| GET | `/health` | `setting.view` | Ringkasan kesehatan dependensi untuk kartu Kesehatan Integrasi (`OBS-06`) |

Konvensi umum, format respons, kode galat, dan ketentuan keamanan API:
[`../03-architecture/api-conventions.md`](../03-architecture/api-conventions.md).

Parameter M-12 (keputusan pengguna 14 Oktober 2026):
`maintenance.ambang_persetujuan_estimasi` dalam rupiah (0–999999999999) dan
`maintenance.ambang_penggantian_persen` (0–1000). Keduanya DESIMAL kelompok MAINTENANCE,
nilai awal null, harus diisi Administrator sebelum fitur terkait dipakai. Tidak ada ambang
operasional buatan; perilaku tanpa konfigurasi dirujuk ke FR-12.3 A3 dan FR-12.5 A1.

Keputusan pengguna PR-05-15/30 (14 Oktober 2026): satuan awal rim, pcs, botol,
liter dan dus tersedia dari migration expand. Administrator mengelolanya pada
tab **Satuan Bahan**, `/pengaturan?tab=satuan-bahan`; Pimpinan dengan
`setting.view` hanya membaca. Nama/simbol tidak diubah dan satuan tidak dihapus;
satuan berbeda ditambahkan sebagai master baru agar riwayat tetap bermakna.
Write memerlukan `Idempotency-Key`. M-22 memperoleh pilihan satuan lewat
`/materials/options`, sehingga pengguna `material.view` tidak membutuhkan
`setting.view`. Satuan nonaktif tetap terbaca pada bahan lama tetapi tidak dapat
dipilih untuk bahan baru.

## 8. Database Entity

### Entitas

| Entitas | Deskripsi | Atribut Utama | Keterangan |
|---|---|---|---|
| **system_settings** | Parameter global sistem | key, value, tipe, kelompok, deskripsi | Administrator |
| **material_units** | Master satuan bahan — daftar tertutup yang dikelola Administrator (`BR-084`) | id, nama, simbol, keterangan, status | Administrator |
| **academic_years** · **academic_terms** · **holidays** · **work_days** | Kalender akademik dan kalender kerja (Lampiran E.2); halaman `P-71` | Lihat [`data-model.md`](../03-architecture/data-model.md) §11.1 | Administrator |
| **work_units** | Master unit kerja / kelas (Lampiran E.3); halaman `P-72` | Lihat [`data-model.md`](../03-architecture/data-model.md) §11.1 | Administrator |

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
| `ACADEMIC_YEAR_CREATED` / `ACADEMIC_YEAR_UPDATED` | Pembuatan atau perubahan tahun ajaran dan semesternya, nilai lama/baru |
| `ACADEMIC_YEAR_ACTIVATED` | Pergantian tahun ajaran aktif (`AC-YR-02`), tahun sebelumnya dan sesudahnya |
| `HOLIDAY_CREATED` / `HOLIDAY_UPDATED` / `HOLIDAY_DELETED` | Perubahan daftar hari libur |
| `WORK_DAYS_UPDATED` | Perubahan hari kerja sekolah, nilai lama/baru |
| `WORK_UNIT_CREATED` / `WORK_UNIT_UPDATED` | Pembuatan atau perubahan unit kerja |
| `WORK_UNIT_DEACTIVATED` / `WORK_UNIT_REACTIVATED` | Perubahan status unit kerja (`WU-02`) |
| `MATERIAL_UNIT_CREATED` / `MATERIAL_UNIT_UPDATED` | Penambahan atau perubahan status satuan Bahan, nilai sebelum/sesudah |

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

### Ambang permintaan Bahan — keputusan 14 Oktober 2026

Key bahan.ambang_permintaan_default: BILANGAN_BULAT kelompok BAHAN, 0–2147483647,
awal/bawaan null sampai Administrator mengisi. Tidak ada nominal atau harga asumsi.
Override material_approval_thresholds milik M-20, jumlah per jenis lintas lokasi;
0 berarti setiap permintaan positif memakai M-10. Nilai bawaan wajib dikonfigurasi
meskipun jenis tertentu memiliki override. Perubahan diberi audit SETTING_UPDATED.

| Method | Endpoint | Permission | Deskripsi |
|---|---|---|---|
| GET | `/materials/{id}/request-threshold` | `setting.view` | Batas bawaan, override dan batas efektif |
| PUT | `/materials/{id}/request-threshold` | `setting.manage` | Override batas bulat nonnegatif dengan body batas |
| DELETE | `/materials/{id}/request-threshold` | `setting.manage` | Kembali ke batas bawaan, body kosong |

Router proses Bahan memanggil API publik M-20; semua write memakai Idempotency-Key.


### Kop laporan — PR-06-08

AskUserQuestion15Oktober2026: sekolah.nama (nama, wajib sebelum PDF), sekolah.npsn
(NPSN, opsional) dan sekolah.alamat (alamat, opsional) ditambahkan pada Identitas
Sekolah dengan nilai awal kosong. Tidak mengarang identitas sekolah. NPSN/alamat
boleh dikosongkan kembali; nama mengikuti validasi TEKS tidak kosong saat diubah.
XLSX tetap dapat diproses jika nama belum dikonfigurasi. Kop membaca hanya tiga
kunci publik ini, bukan seluruh parameter sistem.
