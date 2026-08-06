# Role & Permission

> Gabungan Bab 5 (User Roles), Bab 18 (Permission Matrix), dan Lampiran C (Katalog Permission Kanonik).
>
> Bila terjadi perbedaan antara matriks Bab 18 dan Lampiran C, **Lampiran C yang mengikat** (lihat PM-06).

### Batas normatif ↔ rancangan

Berkas ini memuat bagian **normatif**: daftar role, matriks akses, katalog kode permission, dan aturan penegakan yang wajib dipenuhi. **Cara** sistem menegakkannya berada di SDD dan tidak diulang di sini.

| Bagian | Sifat | Berada di |
|---|---|---|
| Bab 5 — daftar role & aturan role | Normatif | Berkas ini (PRD) |
| Bab 18 — matriks permission per role | Normatif (ringkasan bagi non-teknis) | Berkas ini (PRD) |
| Lampiran C.1 — konvensi penamaan & scope | Normatif | Berkas ini (PRD) |
| Lampiran C.2 — katalog 70 kode permission | Normatif — sumber kebenaran tunggal RBAC | Berkas ini (PRD) |
| Lampiran C.3 — aturan penegakan (`PM-01`…`PM-06`) | Normatif | Berkas ini (PRD) |
| Middleware, `AuthContext`, scope di repository, serializer | **Rancangan** | [`../../SDD/03-authorization.md`](../../SDD/03-authorization.md) |
| Cache permission, urutan gerbang sesi, otorisasi tool AI | **Rancangan** | [`../../SDD/03-authorization.md`](../../SDD/03-authorization.md) |

Bila SDD dan lampiran ini berbeda, **lampiran ini yang berlaku** dan SDD wajib disesuaikan.

---

# 5. User Roles

Sistem menggunakan **Role-Based Access Control (RBAC)**. Terdapat 7 role bawaan. Administrator dapat menyesuaikan permission tiap role melalui halaman Manajemen Role.

| Kode | Role | Deskripsi Singkat | Hak Akses Utama |
|---|---|---|---|
| R-01 | **Administrator** | Pemilik sistem, akses penuh ke seluruh modul dan konfigurasi | CRUD user & role, konfigurasi approval rules, parameter sistem, format kode barang, tarif denda, akses penuh seluruh data, baca activity log |
| R-02 | **Petugas Sarana Prasarana** | Pengelola operasional aset sehari-hari | CRUD aset, lokasi, kategori, dokumen aset, cetak QR, verifikasi serah terima & pengembalian, kelola denda, buat & jalankan stock opname, kelola work order, proses pengajuan sesuai approval rules, akses seluruh laporan |
| R-03 | **Pimpinan Sekolah** | Kepala Sekolah & Wakasek Sarpras | Melihat seluruh data (read-only), menyetujui/menolak pengajuan sesuai approval rules, akses penuh dashboard & analitik, menyetujui hasil stock opname dan usulan pengadaan |
| R-04 | **Teknisi** | Pelaksana perbaikan & pemeliharaan internal | Melihat work order yang ditugaskan, memperbarui status & progres, mencatat biaya dan catatan pekerjaan, memperbarui kondisi aset pasca-perbaikan, melihat detail aset & riwayat servis |
| R-05 | **Guru** | Tenaga pendidik | Mengajukan reservasi ruangan/barang, peminjaman, melihat katalog aset & jadwal, melaporkan kerusakan, mengajukan usulan pengadaan, melihat riwayat & denda pribadi, menggunakan chatbot |
| R-06 | **Staf / Tata Usaha** | Tenaga kependidikan | Sama dengan Guru, ditambah kemampuan mengajukan reservasi atas nama unit kerja |
| R-07 | **Siswa / OSIS** | Peserta didik dengan akun terbatas | Mengajukan reservasi ruangan/barang untuk kegiatan kesiswaan, melihat katalog aset publik & jadwal ruangan, melaporkan kerusakan, melihat riwayat & denda pribadi, menggunakan chatbot dengan cakupan data terbatas |

**Aturan role tambahan:**
- Satu pengguna memiliki **tepat satu role utama**. Pengguna yang berperan sebagai approver ditentukan melalui **approval rules**, bukan melalui role tambahan.
- Role **Administrator** tidak dapat dihapus dan minimal harus ada 1 akun aktif.
- Role **Siswa/OSIS** tidak dapat melihat data pengguna lain, nilai aset, biaya pemeliharaan, maupun data pengadaan.
- Role **Teknisi** tidak dapat menghapus aset, mengubah data inventaris, ataupun menyetujui pengajuan.

---


---

# 18. Permission Matrix

**Keterangan simbol:** ✅ Penuh · 🔍 Hanya lihat · 🟡 Terbatas (hanya data miliknya sendiri atau yang ditugaskan) · ❌ Tidak ada akses

| Modul / Fungsi | Administrator | Petugas Sarpras | Pimpinan Sekolah | Teknisi | Guru | Staf / TU | Siswa / OSIS |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **Manajemen User** | ✅ | 🔍 | 🔍 | ❌ | ❌ | ❌ | ❌ |
| **Manajemen Role & Permission** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Reset Password / 2FA Pengguna** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Manajemen Lokasi** | ✅ | ✅ | 🔍 | 🔍 | 🔍 | 🔍 | ❌ |
| **Inventaris Aset — lihat** | ✅ | ✅ | 🔍 | 🔍 | 🔍 | 🔍 | 🟡 |
| **Inventaris Aset — tambah/ubah** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Inventaris Aset — ubah kondisi** | ✅ | ✅ | ❌ | 🟡 | ❌ | ❌ | ❌ |
| **Inventaris Aset — mutasi lokasi** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Data finansial aset (nilai perolehan)** | ✅ | ✅ | 🔍 | ❌ | 🔍 | 🔍 | ❌ |
| **Kategori Aset** | ✅ | ✅ | 🔍 | ❌ | ❌ | ❌ | ❌ |
| **QR — cetak label** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **QR — scan & lihat detail** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 🟡 |
| **Dokumen Aset — lihat** | ✅ | ✅ | 🔍 | 🔍 | 🔍 | 🔍 | ❌ |
| **Dokumen Aset — unggah/hapus** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Reservasi Ruangan — lihat kalender** | ✅ | ✅ | ✅ | 🔍 | ✅ | ✅ | 🟡 |
| **Reservasi Ruangan — ajukan** | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ |
| **Reservasi Barang — ajukan** | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ |
| **Reservasi — batalkan milik sendiri** | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ |
| **Reservasi — batalkan milik orang lain** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Peminjaman — serah terima & pengembalian** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Peminjaman — lihat seluruh transaksi** | ✅ | ✅ | 🔍 | ❌ | 🟡 | 🟡 | 🟡 |
| **Peminjaman — ajukan perpanjangan** | ✅ | ✅ | ✅ | ❌ | 🟡 | 🟡 | 🟡 |
| **Denda — lihat seluruh** | ✅ | ✅ | 🔍 | ❌ | 🟡 | 🟡 | 🟡 |
| **Denda — tandai lunas** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Denda — bebaskan** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Approval Rules — konfigurasi** | ✅ | ❌ | 🔍 | ❌ | ❌ | ❌ | ❌ |
| **Approval — memutuskan** | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Approval — lihat riwayat** | ✅ | ✅ | ✅ | ❌ | 🟡 | 🟡 | 🟡 |
| **Laporan Kerusakan — buat** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Laporan Kerusakan — lihat semua** | ✅ | ✅ | 🔍 | 🟡 | 🟡 | 🟡 | 🟡 |
| **Laporan Kerusakan — verifikasi** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Work Order — buat & tugaskan** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Work Order — eksekusi** | ❌ | ❌ | ❌ | 🟡 | ❌ | ❌ | ❌ |
| **Work Order — verifikasi & tutup** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Jadwal Pemeliharaan Preventif** | ✅ | ✅ | 🔍 | 🔍 | ❌ | ❌ | ❌ |
| **Riwayat Servis Aset** | ✅ | ✅ | 🔍 | 🔍 | ❌ | ❌ | ❌ |
| **Biaya Pemeliharaan** | ✅ | ✅ | 🔍 | 🟡 | ❌ | ❌ | ❌ |
| **Stock Opname — buat sesi** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Stock Opname — laksanakan (scan)** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Stock Opname — setujui hasil** | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Stock Opname — lihat berita acara** | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Pengadaan — ajukan usulan** | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ |
| **Pengadaan — lihat semua usulan** | ✅ | ✅ | ✅ | ❌ | 🟡 | 🟡 | ❌ |
| **Pengadaan — setujui** | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Pengadaan — catat penerimaan** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Penghapusan Aset — ajukan usulan** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Penghapusan Aset — setujui** | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Penghapusan Aset — eksekusi & berita acara** | ✅ | ✅ | 👁 | ❌ | ❌ | ❌ | ❌ |
| **Penghapusan Aset — pulihkan aset** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Dashboard** | ✅ | ✅ | ✅ | 🟡 | 🟡 | 🟡 | 🟡 |
| **Statistik & Analitik** | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Ekspor Laporan** | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Notifikasi pribadi** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Activity Log — telusuri** | ✅ | ❌ | 🔍 | ❌ | ❌ | ❌ | ❌ |
| **Activity Log — ekspor** | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Chatbot AI** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 🟡 |
| **Monitoring Chatbot (agregat)** | ✅ | ❌ | 🔍 | ❌ | ❌ | ❌ | ❌ |
| **Konfigurasi Parameter Sistem** | ✅ | ❌ | 🔍 | ❌ | ❌ | ❌ | ❌ |

**Catatan cakupan 🟡 (Terbatas):**

| Konteks | Batasan |
|---|---|
| Siswa/OSIS — Inventaris & QR | Hanya aset dengan `boleh_dipinjam_siswa = true`; tanpa nilai perolehan, sumber perolehan, biaya, dan dokumen aset |
| Siswa/OSIS — Kalender ruangan | Hanya ruangan `boleh_direservasi_siswa`; slot terisi tampil sebagai "Terpakai" tanpa identitas pemohon |
| Siswa/OSIS — Chatbot | Cakupan data mengikuti seluruh batasan di atas |
| Guru/Staf/Siswa — Peminjaman, denda, kerusakan, pengadaan, approval | Hanya data yang dibuat atau melibatkan dirinya sendiri |
| Teknisi — Work Order | Hanya work order yang ditugaskan kepadanya |
| Teknisi — Kondisi aset | Hanya untuk aset pada work order yang sedang dikerjakannya |
| Teknisi — Biaya | Hanya biaya pada work order miliknya |
| Seluruh role — Dashboard | Kartu yang datanya di luar hak akses tidak dirender sama sekali |

---


---

## Lampiran C — Katalog Permission Kanonik

> **Sumber kebenaran tunggal RBAC.** Bab 17 sebelumnya menyebut kode permission granular secara tersebar, sementara Bab 18 memakai matriks level modul. Lampiran ini merekonsiliasi keduanya dan menjadi dasar *seed data* sistem. Setiap endpoint API wajib memetakan tepat ke satu kode di bawah.

### C.1 Konvensi

- Format kode: `{domain}.{aksi}` — huruf kecil, titik sebagai pemisah.
- Aksi baku: `view` · `create` · `update` · `delete` · `approve` · `execute` · `export` · `manage` (`manage` = create + update + delete pada domain tersebut).
- Cakupan data (*scope*) bersifat ortogonal terhadap permission dan bernilai: `all` (seluruh data), `own` (hanya milik sendiri), `assigned` (hanya yang ditugaskan), `restricted` (subset terbatas, mis. katalog siswa). Simbol 🟡 pada Bab 18 setara dengan scope selain `all`.
- Permission bertanda 🔒 adalah **permission inti** yang tidak dapat dicabut dari role Administrator (FR-02.2 A1).

### C.2 Katalog

| Kode | Domain | Deskripsi singkat | Role bawaan pemilik |
|---|---|---|---|
| `user.view` | User | Melihat daftar & detail pengguna | Admin, Petugas(view), Pimpinan(view) |
| `user.create` 🔒 | User | Membuat & mengimpor pengguna | Admin |
| `user.update` 🔒 | User | Menyunting & mengaktifkan/menonaktifkan | Admin |
| `user.reset_password` 🔒 | User | Menerbitkan password sementara | Admin |
| `user.reset_2fa` 🔒 | User | Mereset 2FA pengguna lain | Admin |
| `role.view` | Role | Melihat role & matriks permission | Admin, Pimpinan(view) |
| `role.update` 🔒 | Role | Mengubah matriks permission | Admin |
| `location.view` | Lokasi | Melihat pohon lokasi | Semua kecuali Siswa |
| `location.manage` | Lokasi | CRUD gedung/area/ruangan | Admin, Petugas |
| `category.manage` | Kategori | CRUD kategori aset | Admin, Petugas |
| `asset.view` | Aset | Melihat katalog & detail aset | Semua (scope berbeda) |
| `asset.view_financial` | Aset | Melihat nilai & sumber perolehan | Admin, Petugas, Pimpinan |
| `asset.create` | Aset | Membuat & mengimpor aset | Admin, Petugas |
| `asset.update` | Aset | Menyunting aset & mutasi lokasi | Admin, Petugas |
| `asset.update_condition` | Aset | Mengubah kondisi aset | Admin, Petugas, Teknisi(`assigned`) |
| `asset.deactivate` | Aset | Menonaktifkan aset (bukan penghapusan formal) | Admin, Petugas |
| `asset.export` | Aset | Mengekspor daftar aset | Admin, Petugas, Pimpinan |
| `asset.qr_print` | Aset | Mencetak label QR | Admin, Petugas |
| `asset.qr_regenerate` 🔒 | Aset | Meregenerasi UUID QR | Admin |
| `asset_document.view` | Dokumen | Melihat & mengunduh dokumen aset | Admin, Petugas, Pimpinan, Teknisi, Guru, Staf |
| `asset_document.manage` | Dokumen | Unggah & hapus dokumen aset | Admin, Petugas |
| `reservation.view` | Reservasi | Melihat kalender & daftar reservasi | Semua (scope berbeda) |
| `reservation.create` | Reservasi | Mengajukan reservasi | Admin, Petugas, Guru, Staf, Siswa |
| `reservation.cancel_own` | Reservasi | Membatalkan reservasi sendiri | Semua pemohon |
| `reservation.cancel_any` | Reservasi | Membatalkan reservasi pihak lain | Admin, Petugas |
| `reservation.urgent` | Reservasi | Mengajukan di luar tenggat H-1 (BR-020) | Admin, Petugas |
| `reservation.fixed_schedule` | Reservasi | Mengelola blokade jadwal tetap ruangan (FR-07.5) | Admin, Petugas |
| `loan.view` | Peminjaman | Melihat transaksi peminjaman | Semua (scope berbeda) |
| `loan.manage` | Peminjaman | Serah terima & pengembalian | Admin, Petugas |
| `loan.direct` | Peminjaman | Peminjaman langsung tanpa reservasi | Admin, Petugas |
| `loan.extend` | Peminjaman | Mengajukan perpanjangan | Guru, Staf, Siswa, Petugas |
| `fine.view` | Denda | Melihat denda | Semua (scope berbeda) |
| `fine.manage` | Denda | Menandai lunas | Admin, Petugas |
| `fine.waive` | Denda | Membebaskan denda | Admin, Petugas |
| `approval_rule.view` | Approval | Melihat aturan persetujuan | Admin, Pimpinan(view) |
| `approval_rule.manage` 🔒 | Approval | Membuat & mengubah aturan | Admin |
| `approval.view` | Approval | Melihat riwayat persetujuan | Semua (scope berbeda) |
| `approval.decide` | Approval | Menyetujui/menolak pengajuan | Sesuai approval rules |
| `approval.delegate` | Approval | Menetapkan approver pengganti | Approver aktif |
| `damage.create` | Kerusakan | Membuat tiket kerusakan | Semua role |
| `damage.view` | Kerusakan | Melihat tiket | Semua (scope berbeda) |
| `damage.verify` | Kerusakan | Verifikasi/menolak tiket | Admin, Petugas |
| `workorder.view` | Maintenance | Melihat work order | Admin, Petugas, Pimpinan, Teknisi(`assigned`) |
| `workorder.create` | Maintenance | Membuat & menugaskan work order | Admin, Petugas |
| `workorder.execute` | Maintenance | Mengeksekusi work order | Teknisi(`assigned`) |
| `workorder.verify` | Maintenance | Verifikasi & menutup work order | Admin, Petugas |
| `maintenance.manage` | Maintenance | Mengelola jadwal preventif | Admin, Petugas |
| `maintenance.view_cost` | Maintenance | Melihat biaya pemeliharaan | Admin, Petugas, Pimpinan, Teknisi(`assigned`) |
| `audit.view` | Opname | Melihat sesi & berita acara | Admin, Petugas, Pimpinan |
| `audit.manage` | Opname | Membuat & memfinalkan sesi | Admin, Petugas |
| `audit.execute` | Opname | Melaksanakan pemindaian opname | Admin, Petugas |
| `audit.approve` | Opname | Menyetujui hasil rekonsiliasi | Pimpinan |
| `procurement.view` | Pengadaan | Melihat usulan | Admin, Petugas, Pimpinan, Guru(`own`), Staf(`own`) |
| `procurement.create` | Pengadaan | Membuat usulan | Admin, Petugas, Guru, Staf |
| `procurement.approve` | Pengadaan | Menyetujui usulan | Sesuai approval rules |
| `procurement.receive` | Pengadaan | Mencatat penerimaan barang | Admin, Petugas |
| `disposal.view` | Penghapusan | Melihat usulan & arsip penghapusan | Admin, Petugas, Pimpinan |
| `disposal.create` | Penghapusan | Mengajukan penghapusan | Admin, Petugas |
| `disposal.approve` | Penghapusan | Menyetujui penghapusan | Pimpinan |
| `disposal.execute` | Penghapusan | Mencatat pelaksanaan & menghapuskan | Admin, Petugas |
| `disposal.reinstate` 🔒 | Penghapusan | Memulihkan aset terhapus | Admin |
| `report.view` | Analitik | Melihat laporan analitik | Admin, Petugas, Pimpinan |
| `report.export` | Analitik | Mengekspor laporan | Admin, Petugas, Pimpinan |
| `dashboard.view` | Dashboard | Mengakses dashboard sesuai role | Semua role |
| `notification.manage_own` | Notifikasi | Mengelola notifikasi & preferensi sendiri | Semua role |
| `activity_log.view` 🔒 | Log | Menelusuri activity log | Admin, Pimpinan(view) |
| `activity_log.export` 🔒 | Log | Mengekspor activity log | Admin |
| `chat.use` | Chatbot | Menggunakan chatbot | Semua role (Siswa `restricted`) |
| `chat.monitor` | Chatbot | Melihat metrik agregat chatbot | Admin, Pimpinan(view) |
| `setting.view` | Sistem | Melihat parameter sistem | Admin, Pimpinan(view) |
| `setting.manage` 🔒 | Sistem | Mengubah parameter sistem | Admin |

### C.3 Aturan Penegakan

| Kode | Requirement |
|---|---|
| PM-01 | Setiap endpoint pada Bab 17 wajib mendeklarasikan **tepat satu** permission dari katalog ini; endpoint tanpa deklarasi ditolak pada tahap *code review* |
| PM-02 | Penegakan dilakukan sebagai *middleware* server; UI hanya menyembunyikan menu sebagai kenyamanan, bukan sebagai kontrol (NFR-S-05) |
| PM-03 | *Scope* data (`all`/`own`/`assigned`/`restricted`) diterapkan pada lapisan repository sebagai filter wajib, bukan sebagai parameter opsional yang bisa dilupakan pemanggil |
| PM-04 | Endpoint `GET /me` mengembalikan daftar kode permission efektif beserta scope-nya, dan menjadi satu-satunya sumber bagi klien untuk merender menu dan kartu dashboard (19.1) |
| PM-05 | Perubahan matriks berlaku pada permintaan berikutnya tanpa restart; cache permission per pengguna maksimum 60 detik |
| PM-06 | Bab 18 (matriks level modul) bersifat **ringkasan bagi pemangku kepentingan non-teknis**; bila terjadi perbedaan, **Lampiran C yang mengikat** |
