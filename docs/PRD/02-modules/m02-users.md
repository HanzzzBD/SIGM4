# M-02 — Manajemen User & Role

> **Modul self-contained.** Seluruh yang diperlukan untuk mengimplementasikan modul ini ada di
> berkas ini: requirement, aturan bisnis, endpoint, entitas, notifikasi, permission, jejak audit,
> dan kriteria penerimaan. Baris yang dimiliki modul lain dirujuk melalui ID, tidak disalin.
>
> Isi requirement bersifat **verbatim dari PRD v1.1**. Sumber kebenaran tunggal.

## 1. Overview

Lihat [`../01-product/overview.md`](../01-product/overview.md) untuk konteks produk menyeluruh.
Modul ini adalah **M-02 — Manajemen User & Role** sebagaimana terdaftar pada Daftar Modul PRD.

## 2. Scope

Cakupan modul ditentukan oleh Functional Requirement yang tercantum pada bagian 5.
Hal di luar daftar tersebut berada di luar cakupan modul ini.

## 3. Actors

Aktor per requirement tercantum pada tabel **Actor** di tiap FR (bagian 5).
Definisi role: [`../00-foundation/roles-permissions.md`](../00-foundation/roles-permissions.md).

## 4. Business Flow

_Diagram alur khusus modul ini tidak ada pada PRD. Alur lintas modul: [`../03-architecture/system-overview.md`](../03-architecture/system-overview.md)._

## 5. Functional Requirements

### FR-02.1 CRUD Pengguna

| Aspek | Uraian |
|---|---|
| **Description** | Administrator mengelola akun pengguna: membuat, menyunting, menonaktifkan, dan mengaktifkan kembali. |
| **Actor** | Administrator |
| **Preconditions** | Administrator login; role tujuan tersedia |

**Main Flow**
1. Administrator membuka menu Manajemen User dan menekan "Tambah Pengguna".
2. Administrator mengisi nama lengkap, email, NIP/NIS, role, unit kerja/kelas, nomor telepon.
3. Sistem memvalidasi keunikan email dan NIP/NIS.
4. Sistem membuat akun berstatus `Aktif` dengan password sementara dan `must_change_password = true`.
5. Administrator menyerahkan kredensial awal kepada pengguna.
6. Penyuntingan: Administrator mengubah data lalu menyimpan.
7. Penonaktifan: Administrator menekan "Nonaktifkan" dan mengisi alasan.

**Alternative Flow**
- **A1 — Email sudah digunakan:** Sistem menolak dengan pesan spesifik.
- **A2 — Penonaktifan pengguna yang masih memiliki peminjaman aktif atau denda belum lunas:** Sistem menampilkan peringatan dan meminta konfirmasi; data transaksi tetap tersimpan.
- **A3 — Penonaktifan pengguna yang menjadi approver aktif:** Sistem memblokir aksi hingga Administrator menetapkan approver pengganti pada approval rules terkait.
- **A4 — Impor massal:** Administrator mengunggah CSV/XLSX; sistem memvalidasi baris per baris dan menampilkan laporan sukses/gagal. Berkas > 200 baris diproses asinkron oleh worker dan Administrator diberi tahu saat selesai (`IMPT-04`, `NT-52`); status dan laporan per baris dapat diambil kapan saja lewat pekerjaan impornya. Berkas identik yang diunggah ulang dalam 24 jam tidak diproses ulang — hasil pekerjaan sebelumnya dikembalikan (`IMPT-03`).
- **A5 — Akun siswa tanpa persetujuan wali:** Sistem menolak membuat, mengaktifkan kembali, atau mengganti role menjadi Siswa/OSIS bila penanda `consent_guardian_at` belum terekam (`DP-02`, `SL-06`). Administrator merekam persetujuan yang dikumpulkan sekolah secara luring (`consent_wali`); penanda hanya direkam sekali dan tidak dicabut.

**Post Conditions** — Data pengguna tersimpan; pengguna nonaktif tidak dapat login namun riwayat transaksinya tetap utuh.

**Acceptance Criteria**
- [ ] Akun tidak dapat dihapus permanen, hanya dinonaktifkan (*soft delete*).
- [ ] Sistem menolak penonaktifan akun Administrator aktif terakhir.
- [ ] Impor massal menampilkan laporan galat per baris tanpa menggagalkan seluruh berkas.
- [ ] Seluruh operasi tercatat di activity log dengan nilai sebelum dan sesudah.

### FR-02.2 Manajemen Role & Permission

| Aspek | Uraian |
|---|---|
| **Description** | Administrator menyesuaikan permission yang melekat pada tiap role melalui matriks permission. |
| **Actor** | Administrator |
| **Preconditions** | Administrator login |

**Main Flow**
1. Administrator membuka menu Manajemen Role.
2. Sistem menampilkan daftar role beserta jumlah pengguna dan permission aktif.
3. Administrator memilih role dan membuka matriks permission (modul × aksi: view, create, update, delete, approve, export).
4. Administrator mencentang/mengosongkan permission lalu menyimpan.
5. Sistem menerapkan perubahan pada permintaan berikutnya dari pengguna terdampak.

**Alternative Flow**
- **A1 — Menghapus permission inti role Administrator:** Sistem menolak.
- **A2 — Membuat role kustom:** Administrator menyalin role yang ada sebagai template lalu menyesuaikan.
- **A3 — Menghapus role yang masih memiliki pengguna:** Sistem menolak dan meminta pemindahan pengguna terlebih dahulu.

**Post Conditions** — Matriks permission terbarui dan berlaku pada seluruh titik pemeriksaan otorisasi (API dan UI).

**Acceptance Criteria**
- [ ] Otorisasi diperiksa di sisi server pada setiap endpoint, tidak hanya menyembunyikan menu di UI.
- [ ] Perubahan permission berlaku tanpa restart layanan.
- [ ] Perubahan matriks tercatat di activity log.

## 6. Business Rules

### Dimiliki modul ini

| Kode | Business Rule |
|---|---|
| BR-066 | Satu pengguna memiliki tepat satu role utama. |
| BR-067 | Akun pengguna tidak dapat dihapus permanen; hanya dapat dinonaktifkan. |
| BR-068 | Sistem wajib memiliki minimal satu akun Administrator berstatus aktif. |
| BR-069 | Pengguna tidak dapat mengubah email dan rolenya sendiri. |
| BR-073 | Role Siswa/OSIS tidak boleh mengakses data finansial aset, biaya pemeliharaan, data pengadaan, dokumen aset, maupun data pribadi pengguna lain. |
| BR-074 | Setiap pengguna hanya dapat melihat riwayat transaksi, denda, dan percakapan chatbot miliknya sendiri, kecuali role yang diberi permission lebih luas. |

## 7. API Endpoints

### Endpoint

| Method | Endpoint | Permission | Deskripsi |
|---|---|---|---|
| GET | `/users` | `user.view` | Daftar pengguna (filter role, status, unit kerja) |
| POST | `/users` | `user.create` | Buat pengguna baru |
| GET | `/users/{id}` | `user.view` | Detail pengguna |
| PUT | `/users/{id}` | `user.update` | Perbarui pengguna |
| PATCH | `/users/{id}/status` | `user.update` | Aktifkan/nonaktifkan |
| POST | `/users/import` | `user.create` | Impor massal CSV/XLSX: ≤ 200 baris diproses sinkron, lebih dari itu asinkron (`IMPT-04`); berkas identik dalam 24 jam mengembalikan hasil sebelumnya (`IMPT-03`) |
| GET | `/users/import/{id}` | `user.create` | Status dan laporan per baris sebuah pekerjaan impor (`IMPT-02`) |
| POST | `/class-promotions` | `user.update` | Kenaikan kelas massal: tetapkan kelas atau tandai lulus per siswa pada satu tahun ajaran (`SL-02`) |
| POST | `/users/{id}/reset-password` | `user.reset_password` | Terbitkan password sementara |
| POST | `/users/{id}/reset-2fa` | `user.reset_2fa` | Reset 2FA pengguna |
| GET | `/roles` | `role.view` | Daftar role |
| PUT | `/roles/{id}/permissions` | `role.update` | Perbarui matriks permission |

Konvensi umum, format respons, kode galat, dan ketentuan keamanan API:
[`../03-architecture/api-conventions.md`](../03-architecture/api-conventions.md).

## 8. Database Entity

### Entitas

| Entitas | Deskripsi | Atribut Utama | Keterangan |
|---|---|---|---|
| **users** | Data pengguna sistem | id, nama, email, password_hash, nip_nis, role_id, work_unit_id, telepon, foto, status, totp_enabled_at, must_change_password, login_terakhir_pada, failed_login_count, failed_login_window_start, locked_until, consent_guardian_at | Administrator |
| **student_enrollments** | Kelas siswa per tahun ajaran (Lampiran E.4, `SL-01`) — bukan atribut permanen akun | id, user_id, academic_year_id, kelas_id (unit kerja berjenis Kelas), lulus | Administrator |
| **user_import_jobs** | Pekerjaan impor pengguna — setiap impor, sinkron maupun asinkron (`IMPT-02`, `IMPT-03`, `IMPT-04`) | id, file_hash, nama_berkas, status, total_baris, baris_terproses, sukses, gagal, laporan_gagal (hanya baris gagal: nomor baris, email, alasan), pesan_galat, selesai_pada | Administrator |
| **roles** | Peran pengguna | id, nama, deskripsi, is_system | Administrator |
| **permissions** | Daftar hak akses granular | id, modul, aksi, kode | Sistem |
| **role_permissions** | Relasi role–permission | role_id, permission_id | Administrator |

Model data menyeluruh dan ERD: [`../03-architecture/data-model.md`](../03-architecture/data-model.md).

## 9. Notification

### Notifikasi diterbitkan modul ini

| Kode | Event Pemicu | Penerima | Kanal | Wajib | Contoh Isi |
|---|---|---|---|:---:|---|
| **NT-40** | Role atau status akun diubah | Pengguna terkait | In-app | ✅ | "Role akun Anda diubah menjadi {role}." |
| **NT-48** | Persetujuan wali siswa belum terekam | Administrator | In-app | ✅ | "Akun siswa {nama} tidak dapat diaktifkan: persetujuan wali belum terekam (DP-02)." |
| **NT-52** | Impor massal pengguna selesai diproses (`IMPT-04`) | Administrator pengunggah | In-app | ✅ | "Impor pengguna selesai: {sukses} berhasil, {gagal} gagal dari {total} baris." |

Ketentuan umum kanal, latensi, dan preferensi: [`m17-notifications.md`](m17-notifications.md).

## 10. Permission

### Kode permission

| Kode | Domain | Deskripsi singkat | Role bawaan pemilik |
|---|---|---|---|
| `user.view` | User | Melihat daftar & detail pengguna | Admin, Petugas(view), Pimpinan(view) |
| `user.create` 🔒 | User | Membuat & mengimpor pengguna | Admin |
| `user.update` 🔒 | User | Menyunting & mengaktifkan/menonaktifkan | Admin |
| `user.reset_password` 🔒 | User | Menerbitkan password sementara | Admin |
| `user.reset_2fa` 🔒 | User | Mereset 2FA pengguna lain | Admin |
| `role.view` | Role | Melihat role & matriks permission | Admin, Pimpinan(view) |
| `role.update` 🔒 | Role | Mengubah matriks permission | Admin |

Katalog kanonik & aturan scope: [`../00-foundation/roles-permissions.md`](../00-foundation/roles-permissions.md).

## 11. Activity Log

### Aksi yang wajib dicatat

| Aksi | Keterangan |
|---|---|
| `USER_CREATED` / `USER_UPDATED` / `USER_DEACTIVATED` / `USER_REACTIVATED` | Manajemen akun |
| `USER_IMPORT_REQUESTED` | Berkas impor diterima dan tercatat sebagai pekerjaan impor (sinkron atau dijadwalkan asinkron, `IMPT-04`) |
| `USER_IMPORTED` | Impor massal beserta ringkasan hasil; pelaku = Administrator pengunggah, juga bila dijalankan worker |
| `STUDENT_ENROLLMENT_SET` | Kelas siswa pada suatu tahun ajaran ditetapkan atau diubah (`SL-01`, `SL-02`), nilai lama/baru |
| `STUDENT_MARKED_GRADUATED` | Siswa ditandai lulus pada suatu tahun ajaran (`SL-02`) |
| `STUDENT_GRADUATION_DEACTIVATED` | Akun siswa lulus dinonaktifkan setelah tahun ajarannya berakhir (`SL-03`); pelaku `SYSTEM` bila dijalankan pekerjaan terjadwal |
| `ROLE_PERMISSION_UPDATED` | Perubahan matriks permission |

Prinsip, struktur entri, dan tamper-evidence: [`../03-architecture/activity-log.md`](../03-architecture/activity-log.md).

## 12. Acceptance Criteria

Kriteria penerimaan tercantum **inline** pada tiap Functional Requirement di bagian 5,
sesuai bentuk aslinya di PRD. Tidak diringkas maupun dipindahkan agar tidak terpisah dari
konteks requirement-nya.

Strategi pengujian: [`../06-quality/test-strategy.md`](../06-quality/test-strategy.md).

## 13. Dependencies

_Tidak bergantung pada modul lain._

## 14. Related Modules

_Tidak ada._

## 15. Open Issues

_Tidak ada isu terbuka._
