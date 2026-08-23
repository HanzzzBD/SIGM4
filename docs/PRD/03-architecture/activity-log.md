# 21. Audit Log Requirements

## 21.1 Prinsip Pencatatan

| Kode | Prinsip |
|---|---|
| AL-01 | Seluruh operasi tulis (create, update, delete/deactivate) pada seluruh modul wajib tercatat. |
| AL-02 | Seluruh event keamanan (login, logout, kegagalan login, penguncian akun, perubahan role/permission, reset password, reset 2FA) wajib tercatat. |
| AL-03 | Log bersifat *append-only*; tidak ada antarmuka aplikasi yang dapat menyunting atau menghapusnya, termasuk bagi Administrator. |
| AL-03a | Log memiliki **tamper-evidence** berupa rantai hash antar-entri (NFR-S-03d). Karena akses langsung ke basis data berada di luar kendali aplikasi, integritas dibuktikan secara kriptografis, bukan sekadar dengan pembatasan antarmuka. |
| AL-03b | Akun basis data aplikasi tidak memiliki hak `UPDATE` maupun `DELETE` atas tabel `activity_logs`; hanya `INSERT` dan `SELECT` (SEC-CFG-03). |
| AL-04 | Log menyimpan nilai sebelum dan sesudah perubahan dalam format terstruktur. |
| AL-05 | Nilai sensitif (password, hash, secret 2FA, token) tidak pernah disimpan; digantikan penanda `[REDACTED]`. |
| AL-06 | Aksi yang dilakukan proses terjadwal dicatat dengan pelaku `SYSTEM` beserta nama pekerjaannya. |
| AL-07 | Operasi yang gagal tetap dicatat dengan hasil `gagal` beserta pesan kesalahan. |
| AL-08 | Kegagalan mencatat log tidak boleh menggagalkan transaksi bisnis, namun wajib memicu peringatan ke pemantauan sistem. |
| AL-09 | Log disimpan minimal 2 tahun aktif dan diarsipkan setelahnya; tidak pernah dihapus permanen. |
| AL-10 | Aksi membaca dan mengekspor activity log itu sendiri juga dicatat. |

## 21.2 Struktur Entri Log

| Field | Deskripsi | Contoh |
|---|---|---|
| `id` | Pengenal unik entri | 1048576 |
| `waktu` | Timestamp UTC | 2026-08-05T02:31:44Z |
| `user_id` | Pelaku aksi | 42 |
| `user_nama` | Nama pelaku (disimpan sebagai snapshot) | Sari Wulandari |
| `role` | Role pelaku saat aksi dilakukan | Petugas Sarana Prasarana |
| `ip` | Alamat IP asal | 192.168.1.24 |
| `user_agent` | Peramban/perangkat | SIGM4-Mobile/1.2.0 (Android 13) |
| `modul` | Modul asal aksi — mis. `INVENTARIS`, `BAHAN`, `RESERVASI`, `PEMINJAMAN`, `OPNAME` | INVENTARIS |
| `aksi` | Jenis aksi | ASSET_CONDITION_CHANGED |
| `entitas` | Nama entitas terdampak | assets |
| `entitas_id` | ID entitas terdampak | 3021 |
| `nilai_sebelum` | Snapshot JSON sebelum perubahan | `{"kondisi":"Baik"}` |
| `nilai_sesudah` | Snapshot JSON setelah perubahan | `{"kondisi":"Rusak Ringan"}` |
| `keterangan` | Alasan/catatan bila ada | "Layar retak saat pengembalian" |
| `hasil` | sukses / gagal | sukses |
| `request_id` | Correlation ID permintaan | req_01J8XK2 |

## 21.3 Daftar Aktivitas yang Wajib Dicatat

> **Dipindahkan.** Setiap aksi kini dimiliki modul penerbitnya (bagian 11 pada tiap berkas modul). Daftar menyeluruh digenerate di [`activity-log-index.md`](../_generated/activity-log-index.md).
