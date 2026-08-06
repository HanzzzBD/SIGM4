# Konvensi Proyek

> Memuat Lampiran E PRD: definisi kalender & satuan waktu, master data tambahan, siklus hidup akun siswa, dan template impor.
>
> Konvensi lain yang berlaku dan berada di berkas terpisah:
> - Kode enum vs label tampilan -> [`../03-architecture/data-model.md`](../03-architecture/data-model.md)
> - Format nomor dokumen (SEQ-01..04) -> [`../03-architecture/availability-concurrency.md`](../03-architecture/availability-concurrency.md)
> - Format respons, paginasi, kode galat -> [`../03-architecture/api-conventions.md`](../03-architecture/api-conventions.md)
> - Penamaan ID requirement -> [`../README.md`](../README.md)

---

## Lampiran E — Master Data Tambahan, Kalender & Template Impor

> Menutup tiga kekosongan yang ditemukan pada audit: satuan waktu yang tidak konsisten antar-modul, ketiadaan entitas periode akademik meski dipakai sebagai filter dashboard, dan ketiadaan siklus hidup akun siswa.

### E.1 Definisi Kalender & Satuan Waktu

PRD sebelumnya memakai tiga satuan waktu berbeda tanpa mendefinisikan satupun: "hari kerja" (SC-03, SC-07), "hari kalender" (BR-028), dan "target tanggal" (work order). Definisi berikut mengikat seluruh dokumen.

| Istilah | Definisi | Dipakai oleh |
|---|---|---|
| **Hari kalender** | Setiap hari, termasuk akhir pekan dan hari libur. Batas hari adalah pukul 00:00 WIB. | Perhitungan denda (BR-028), jatuh tempo peminjaman, TTL slot |
| **Hari kerja sekolah** | Hari yang terdaftar pada `work_days` dan **tidak** terdaftar pada `holidays` | SLA persetujuan (SC-03), SLA tindak lanjut kerusakan (SC-07), target work order |
| **Jam operasional** | Rentang jam pada hari kerja sekolah yang dikonfigurasi (bawaan Senin–Sabtu 06.00–18.00 WIB) | Validasi reservasi (BR-018), pengukuran ketersediaan (NFR-A-01) |

**Aturan turunan**

| Kode | Aturan |
|---|---|
| CAL-01 | SLA yang dinyatakan dalam jam pada approval rules dihitung dalam **jam kerja**, bukan jam kalender: waktu di luar jam operasional dan hari libur tidak menambah hitungan SLA |
| CAL-02 | Denda dihitung dalam hari kalender kecuali parameter "kecualikan hari libur" diaktifkan (BR-028c) |
| CAL-03 | Seluruh perhitungan menggunakan WIB (UTC+7) untuk penentuan batas hari, meskipun disimpan sebagai UTC (NFR-C-10) |

### E.2 Entitas `academic_years` dan `academic_terms`

Diperlukan karena Bab 19 menyediakan filter "semester berjalan" dan "tahun ajaran", dan FR-20.1 menyebut "tahun ajaran aktif" — tanpa entitas yang mendefinisikannya.

| Entitas | Atribut | Keterangan |
|---|---|---|
| `academic_years` | id, nama (mis. "2026/2027"), tanggal_mulai, tanggal_selesai, is_active | Tepat satu tahun ajaran berstatus aktif |
| `academic_terms` | id, academic_year_id, nama (Ganjil/Genap), tanggal_mulai, tanggal_selesai | Dipakai filter dashboard & analitik |
| `holidays` | id, tanggal, nama, jenis (Nasional/Sekolah/Cuti Bersama), academic_year_id | Dasar CAL-01 dan FR-07.5 A4 |
| `work_days` | hari (0–6), aktif | Bawaan: Senin–Sabtu aktif |

| Kode | Requirement |
|---|---|
| AC-YR-01 | Tahun ajaran wajib dibuat sebelum sistem dapat dioperasikan; instalasi awal memaksa pembuatannya |
| AC-YR-02 | Pergantian tahun ajaran aktif dilakukan Administrator dan memicu pekerjaan siklus hidup akun siswa (E.4) |
| AC-YR-03 | Seluruh laporan analitik dan dashboard dapat difilter per tahun ajaran dan per semester |
| AC-YR-04 | Nomor dokumen memakai **tahun anggaran** (kalender), bukan tahun ajaran, agar tidak ambigu (SEQ-01) |

### E.3 Entitas `work_units`

`users.unit_kerja` dan `procurements.unit_kerja` sebelumnya berupa teks bebas, sehingga pelaporan per unit kerja tidak dapat diandalkan.

| Atribut | Keterangan |
|---|---|
| id, nama, kode, jenis (Manajemen/Mata Pelajaran/Tata Usaha/Ekstrakurikuler/Kelas), kepala_unit_id, status | Referensi bagi pengguna dan usulan pengadaan |

| Kode | Requirement |
|---|---|
| WU-01 | `users.work_unit_id` menggantikan teks bebas `unit_kerja`; migrasi data awal wajib memetakan nilai lama |
| WU-02 | Unit kerja yang masih memiliki pengguna aktif tidak dapat dihapus, hanya dinonaktifkan |
| WU-03 | Approval rules dapat memakai unit kerja pemohon sebagai kondisi pada pengembangan berikutnya; pada rilis ini cukup sebagai dimensi pelaporan |

### E.4 Siklus Hidup Akun Siswa

Tanpa aturan ini, kolom kelas pada akun siswa menjadi tidak akurat dalam satu tahun dan akun lulusan menumpuk (keluhan Persona 7).

| Kode | Requirement |
|---|---|
| SL-01 | Akun siswa menyimpan `academic_year_id` dan `kelas` sebagai data per tahun ajaran, bukan atribut permanen |
| SL-02 | Pada pergantian tahun ajaran, Administrator menjalankan **kenaikan kelas massal**: memilih siswa, menetapkan kelas baru, atau menandai lulus |
| SL-03 | Siswa yang ditandai lulus otomatis dinonaktifkan pada akhir tahun ajaran; akun tidak dihapus (BR-067) |
| SL-04 | Penonaktifan diblokir bila siswa masih memiliki peminjaman aktif atau kewajiban belum lunas; sistem menampilkan daftarnya kepada Administrator |
| SL-05 | Data akun siswa yang telah dinonaktifkan dipseudonimisasi setelah 2 tahun (DP-10) |
| SL-06 | Akun siswa tidak dapat diaktifkan tanpa penanda persetujuan wali `consent_guardian_at` (DP-02) |

### E.5 Template Impor

Sebelumnya impor massal disebut pada FR-02.1 A4, FR-04.1 A2, dan FR-07.5 A2 tanpa definisi kolom.

**E.5.1 Impor Aset** (`template_aset.xlsx`)

| Kolom | Wajib | Tipe | Validasi |
|---|---|---|---|
| `nama_barang` | ✅ | teks ≤150 | — |
| `kode_kategori` | ✅ | teks | Harus ada pada master kategori |
| `merek` | ❌ | teks ≤100 | — |
| `model` | ❌ | teks ≤100 | — |
| `nomor_seri` | ❌ | teks ≤100 | Unik sistem-wide bila diisi (BR-003) |
| `tahun_perolehan` | ✅ | integer | 1950 – tahun berjalan |
| `sumber_perolehan` | ✅ | enum | Sesuai Bab 11.3 |
| `nilai_perolehan` | ❌ | desimal ≥0 | Kosong diperbolehkan (AS-23) |
| `kode_ruangan` | ✅ | teks | Harus ada pada master lokasi |
| `kondisi` | ✅ | enum | Baik/Rusak Ringan/Rusak Berat |
| `dapat_dipinjam` | ✅ | boolean | — |
| `boleh_dipinjam_siswa` | ✅ | boolean | Harus `false` bila `dapat_dipinjam = false` |
| `jumlah_unit` | ✅ | integer 1–500 | Menghasilkan N record terpisah (BR-001) |

**E.5.2 Impor Pengguna** (`template_pengguna.xlsx`)

| Kolom | Wajib | Validasi |
|---|---|---|
| `nama_lengkap` | ✅ | ≤150 karakter |
| `email` | ✅ | Format valid, unik sistem-wide |
| `nip_nis` | ✅ | Unik sistem-wide |
| `kode_role` | ✅ | Sesuai 7 role bawaan |
| `kode_unit_kerja` | ✅ | Harus ada pada master unit kerja |
| `kelas` | Kondisional | Wajib bila role Siswa/OSIS |
| `telepon` | ❌ | Format nomor Indonesia |
| `consent_wali` | Kondisional | Wajib `true` bila role Siswa/OSIS (DP-02, SL-06) |

**E.5.3 Impor Jadwal Tetap Ruangan** (`template_jadwal_tetap.csv`)

| Kolom | Wajib | Validasi |
|---|---|---|
| `kode_ruangan` | ✅ | Harus ada pada master lokasi |
| `hari` | ✅ | Senin–Minggu |
| `jam_mulai` / `jam_selesai` | ✅ | Format `HH:MM`, mulai < selesai, dalam jam operasional |
| `label_kegiatan` | ✅ | ≤100 karakter |
| `berlaku_mulai` / `berlaku_sampai` | ✅ | Dalam rentang tahun ajaran aktif |

**Ketentuan umum impor**

| Kode | Requirement |
|---|---|
| IMPT-01 | Validasi dilakukan baris per baris; baris gagal tidak menggagalkan seluruh berkas (FR-02.1 AC, FR-04.1 AC) |
| IMPT-02 | Hasil impor menampilkan laporan: jumlah sukses, jumlah gagal, dan alasan galat per nomor baris |
| IMPT-03 | Impor bersifat idempoten terhadap unggahan ulang berkas yang sama dalam 24 jam (memakai *hash* berkas) |
| IMPT-04 | Impor > 200 baris diproses asinkron dengan notifikasi saat selesai (NT-42) |
| IMPT-05 | Berkas templat dapat diunduh langsung dari halaman impor beserta contoh isian |

---
