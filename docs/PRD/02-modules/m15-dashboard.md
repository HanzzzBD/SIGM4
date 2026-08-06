# M-15 — Dashboard Monitoring

> **Modul self-contained.** Seluruh yang diperlukan untuk mengimplementasikan modul ini ada di
> berkas ini: requirement, aturan bisnis, endpoint, entitas, notifikasi, permission, jejak audit,
> dan kriteria penerimaan. Baris yang dimiliki modul lain dirujuk melalui ID, tidak disalin.
>
> Isi requirement bersifat **verbatim dari PRD v1.1**. Sumber kebenaran tunggal.

## 1. Overview

Lihat [`../01-product/overview.md`](../01-product/overview.md) untuk konteks produk menyeluruh.
Modul ini adalah **M-15 — Dashboard Monitoring** sebagaimana terdaftar pada Daftar Modul PRD.

## 2. Scope

Cakupan modul ditentukan oleh Functional Requirement yang tercantum pada bagian 5.
Hal di luar daftar tersebut berada di luar cakupan modul ini.

## 3. Actors

Aktor per requirement tercantum pada tabel **Actor** di tiap FR (bagian 5).
Definisi role: [`../00-foundation/roles-permissions.md`](../00-foundation/roles-permissions.md).

## 4. Business Flow

_Diagram alur khusus modul ini tidak ada pada PRD. Alur lintas modul: [`../03-architecture/system-overview.md`](../03-architecture/system-overview.md)._

## 5. Functional Requirements

### FR-15.1 Dashboard Per Role

| Aspek | Uraian |
|---|---|
| **Description** | Halaman utama setiap pengguna menampilkan ringkasan visual yang relevan dengan perannya. Rincian isi tiap dashboard dijabarkan pada Bab 19. |
| **Actor** | Seluruh role |
| **Preconditions** | Pengguna login |

**Main Flow**
1. Setelah login, pengguna diarahkan ke dashboard sesuai rolenya.
2. Sistem memuat kartu ringkasan (KPI), grafik, dan daftar tindakan yang menunggu.
3. Pengguna dapat menyesuaikan rentang waktu (7 hari / 30 hari / semester / tahun ajaran).
4. Pengguna dapat menelusuri (*drill-down*) dari kartu ringkasan menuju daftar detail terkait.

**Alternative Flow**
- **A1 — Data belum tersedia (sistem baru):** Sistem menampilkan status kosong beserta panduan langkah awal.
- **A2 — Pemuatan data berat:** Sistem menampilkan *skeleton loading* per kartu agar dashboard tetap responsif.

**Post Conditions** — Tidak ada perubahan data.

**Acceptance Criteria**
- [ ] Dashboard termuat sepenuhnya ≤ 3 detik pada volume data target (5.000 aset).
- [ ] Setiap kartu KPI dapat ditelusuri ke daftar detail yang menjadi sumbernya.
- [ ] Dashboard responsif pada layar desktop, tablet, dan ponsel.
- [ ] Kartu yang datanya tidak boleh diakses role tertentu tidak dirender sama sekali.

## 6. Business Rules

### Dimiliki modul ini

_Tidak ada aturan bisnis yang dimiliki modul ini._

**Aturan bersama yang juga berlaku** (dimiliki modul lain, dirujuk melalui ID — tidak disalin ke sini):

`BR-073` (m02) · `BR-074` (m02)

## 7. API Endpoints

### Endpoint

| Method | Endpoint | Permission | Deskripsi |
|---|---|---|---|
| GET | `/dashboard` | Sesuai role | Data dashboard sesuai role pengguna |

Konvensi umum, format respons, kode galat, dan ketentuan keamanan API:
[`../03-architecture/api-conventions.md`](../03-architecture/api-conventions.md).

## 8. Database Entity

### Entitas

_Tidak memiliki entitas sendiri._

Model data menyeluruh dan ERD: [`../03-architecture/data-model.md`](../03-architecture/data-model.md).

## 9. Notification

### Notifikasi diterbitkan modul ini

| Kode | Event Pemicu | Penerima | Kanal | Wajib | Contoh Isi |
|---|---|---|---|:---:|---|
| **NT-41** | Ringkasan harian operasional | Petugas Sarpras + Pimpinan Sekolah | In-app | ❌ | "Ringkasan hari ini: {n} pengajuan baru, {n} pengembalian, {n} kerusakan." |

Ketentuan umum kanal, latensi, dan preferensi: [`m17-notifications.md`](m17-notifications.md).

## 10. Permission

### Kode permission

| Kode | Domain | Deskripsi singkat | Role bawaan pemilik |
|---|---|---|---|
| `dashboard.view` | Dashboard | Mengakses dashboard sesuai role | Semua role |

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

- Rincian isi tiap kartu dashboard berada di `04-frontend/dashboards.md` karena bersifat spesifikasi antarmuka, bukan aturan bisnis.
