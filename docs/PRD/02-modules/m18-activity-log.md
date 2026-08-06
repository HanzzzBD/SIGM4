# M-18 — Activity Log

> **Modul self-contained.** Seluruh yang diperlukan untuk mengimplementasikan modul ini ada di
> berkas ini: requirement, aturan bisnis, endpoint, entitas, notifikasi, permission, jejak audit,
> dan kriteria penerimaan. Baris yang dimiliki modul lain dirujuk melalui ID, tidak disalin.
>
> Isi requirement bersifat **verbatim dari PRD v1.1**. Sumber kebenaran tunggal.

## 1. Overview

Lihat [`../01-product/overview.md`](../01-product/overview.md) untuk konteks produk menyeluruh.
Modul ini adalah **M-18 — Activity Log** sebagaimana terdaftar pada Daftar Modul PRD.

## 2. Scope

Cakupan modul ditentukan oleh Functional Requirement yang tercantum pada bagian 5.
Hal di luar daftar tersebut berada di luar cakupan modul ini.

## 3. Actors

Aktor per requirement tercantum pada tabel **Actor** di tiap FR (bagian 5).
Definisi role: [`../00-foundation/roles-permissions.md`](../00-foundation/roles-permissions.md).

## 4. Business Flow

_Diagram alur khusus modul ini tidak ada pada PRD. Alur lintas modul: [`../03-architecture/system-overview.md`](../03-architecture/system-overview.md)._

## 5. Functional Requirements

### FR-18.1 Pencatatan Aktivitas

| Aspek | Uraian |
|---|---|
| **Description** | Sistem mencatat seluruh aktivitas pengguna yang mengubah data maupun aktivitas keamanan penting, secara otomatis dan tidak dapat dimatikan. |
| **Actor** | Sistem (otomatis) |
| **Preconditions** | Terdapat aktivitas pengguna |

**Main Flow**
1. Setiap operasi tulis (create/update/delete) dan setiap event keamanan memicu pencatatan log.
2. Sistem menyimpan: waktu, pelaku, role pelaku, alamat IP, agen pengguna/perangkat, modul, jenis aksi, entitas & ID terdampak, nilai sebelum, nilai sesudah, dan hasil (sukses/gagal).
3. Log disimpan dalam tabel khusus yang hanya dapat ditambah (*append-only*).

**Alternative Flow**
- **A1 — Aksi gagal:** Tetap dicatat dengan hasil `gagal` beserta pesan kesalahan.
- **A2 — Aksi dilakukan oleh proses terjadwal sistem:** Pelaku dicatat sebagai `SYSTEM` beserta nama pekerjaannya.
- **A3 — Nilai sensitif** (password, secret 2FA): Tidak pernah disimpan, digantikan penanda `[REDACTED]`.

**Post Conditions** — Log tersimpan permanen dan tidak dapat diubah.

**Acceptance Criteria**
- [ ] 100% operasi tulis pada seluruh modul menghasilkan entri log.
- [ ] Tidak ada role, termasuk Administrator, yang dapat menyunting atau menghapus entri log melalui aplikasi.
- [ ] Log tidak pernah memuat password, token, maupun secret 2FA.
- [ ] Kegagalan pencatatan log tidak menggagalkan transaksi bisnis, namun memicu peringatan ke pemantauan sistem.

### FR-18.2 Penelusuran Activity Log

| Aspek | Uraian |
|---|---|
| **Description** | Administrator dan Pimpinan Sekolah menelusuri log aktivitas untuk keperluan audit dan investigasi. |
| **Actor** | Administrator, Pimpinan Sekolah (read-only) |
| **Preconditions** | Pengguna memiliki permission `activity_log.view` |

**Main Flow**
1. Pengguna membuka menu Activity Log.
2. Sistem menampilkan log terurut dari terbaru, terpaginasi.
3. Pengguna memfilter berdasarkan rentang tanggal, pengguna, role, modul, jenis aksi, dan entitas.
4. Pengguna membuka detail entri untuk melihat perbandingan nilai sebelum dan sesudah.
5. Pengguna dapat mengekspor hasil filter ke XLSX/PDF.

**Alternative Flow**
- **A1 — Hasil filter sangat besar:** Sistem membatasi tampilan dan menyarankan penyempitan rentang; ekspor diproses asinkron.
- **A2 — Melihat riwayat satu entitas:** Pengguna dapat membuka "Riwayat Perubahan" langsung dari halaman detail aset, peminjaman, atau pengajuan.

**Post Conditions** — Tidak ada perubahan data; aksi ekspor log itu sendiri juga tercatat.

**Acceptance Criteria**
- [ ] Filter kombinasi mengembalikan hasil ≤ 3 detik untuk rentang 1 bulan.
- [ ] Perbandingan nilai sebelum/sesudah ditampilkan sebagai tabel dua kolom berlabel Bahasa Indonesia dengan penyorotan pada field yang berubah — bukan JSON mentah.
- [ ] Ekspor log tercatat sebagai aktivitas tersendiri.

## 6. Business Rules

### Dimiliki modul ini

| Kode | Business Rule |
|---|---|
| BR-071 | Seluruh operasi tulis wajib tercatat pada activity log. |
| BR-072 | Activity log bersifat *append-only* dan tidak dapat disunting maupun dihapus oleh role mana pun melalui aplikasi. |

## 7. API Endpoints

### Endpoint

| Method | Endpoint | Permission | Deskripsi |
|---|---|---|---|
| GET | `/activity-logs` | `activity_log.view` | Telusuri activity log |
| GET | `/activity-logs/export` | `activity_log.export` | Ekspor log |

Konvensi umum, format respons, kode galat, dan ketentuan keamanan API:
[`../03-architecture/api-conventions.md`](../03-architecture/api-conventions.md).

## 8. Database Entity

### Entitas

| Entitas | Deskripsi | Atribut Utama | Keterangan |
|---|---|---|---|
| **activity_logs** | Jejak audit seluruh aktivitas | id, user_id, role, ip, user_agent, modul, aksi, entitas, entitas_id, nilai_sebelum (JSON), nilai_sesudah (JSON), hasil, waktu | ± 150.000 |

Model data menyeluruh dan ERD: [`../03-architecture/data-model.md`](../03-architecture/data-model.md).

## 9. Notification

### Notifikasi diterbitkan modul ini

_Modul ini tidak menerbitkan notifikasi._

Ketentuan umum kanal, latensi, dan preferensi: [`m17-notifications.md`](m17-notifications.md).

## 10. Permission

### Kode permission

| Kode | Domain | Deskripsi singkat | Role bawaan pemilik |
|---|---|---|---|
| `activity_log.view` 🔒 | Log | Menelusuri activity log | Admin, Pimpinan(view) |
| `activity_log.export` 🔒 | Log | Mengekspor activity log | Admin |

Katalog kanonik & aturan scope: [`../00-foundation/roles-permissions.md`](../00-foundation/roles-permissions.md).

## 11. Activity Log

### Aksi yang wajib dicatat

| Aksi | Keterangan |
|---|---|
| `ACTIVITY_LOG_VIEWED` / `ACTIVITY_LOG_EXPORTED` | Akses terhadap log itu sendiri |

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

- Daftar aksi yang wajib dicatat tersebar ke modul penerbitnya. Indeks lengkap digenerate di `03-architecture/activity-log-index.md`.
