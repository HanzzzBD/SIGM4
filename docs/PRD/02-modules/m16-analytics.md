# M-16 — Statistik & Analitik

> **Modul self-contained.** Seluruh yang diperlukan untuk mengimplementasikan modul ini ada di
> berkas ini: requirement, aturan bisnis, endpoint, entitas, notifikasi, permission, jejak audit,
> dan kriteria penerimaan. Baris yang dimiliki modul lain dirujuk melalui ID, tidak disalin.
>
> Isi requirement bersifat **verbatim dari PRD v1.1**. Sumber kebenaran tunggal.

## 1. Overview

Lihat [`../01-product/overview.md`](../01-product/overview.md) untuk konteks produk menyeluruh.
Modul ini adalah **M-16 — Statistik & Analitik** sebagaimana terdaftar pada Daftar Modul PRD.

## 2. Scope

Cakupan modul ditentukan oleh Functional Requirement yang tercantum pada bagian 5.
Hal di luar daftar tersebut berada di luar cakupan modul ini.

## 3. Actors

Aktor per requirement tercantum pada tabel **Actor** di tiap FR (bagian 5).
Definisi role: [`../00-foundation/roles-permissions.md`](../00-foundation/roles-permissions.md).

## 4. Business Flow

_Diagram alur khusus modul ini tidak ada pada PRD. Alur lintas modul: [`../03-architecture/system-overview.md`](../03-architecture/system-overview.md)._

## 5. Functional Requirements

### FR-16.1 Laporan Analitik

| Aspek | Uraian |
|---|---|
| **Description** | Sekumpulan laporan analitik untuk mendukung perencanaan dan evaluasi pengelolaan sarana prasarana. |
| **Actor** | Pimpinan Sekolah, Petugas Sarpras, Administrator |
| **Preconditions** | Terdapat data transaksional yang memadai |

**Main Flow**
1. Pengguna membuka menu Statistik & Analitik dan memilih jenis laporan:
   - **Kondisi Aset** — komposisi kondisi per kategori dan lokasi, tren kondisi antar-periode
   - **Pemanfaatan Fasilitas** — tingkat utilisasi ruangan dan aset, jam pemakaian, ruangan paling/paling jarang dipakai
   - **Biaya Pemeliharaan** — biaya per periode, per kategori, per aset; aset dengan biaya tertinggi
   - **Tren Kerusakan** — jumlah laporan per periode, kategori paling sering rusak, waktu rata-rata penyelesaian
   - **Aktivitas Peminjaman** — jumlah transaksi, tingkat keterlambatan, peminjam teraktif, aset terpopuler
   - **Konsumsi Bahan** — pemakaian bahan per periode, bahan paling banyak terpakai, unit kerja peminta terbanyak, dan bahan yang sering menyentuh stok minimum
   - **Kebutuhan Pengadaan** — rekomendasi berbasis aset rusak berat, aset melewati umur teknis, dan aset yang permintaannya sering tidak terpenuhi
   - **Rekapitulasi Aset** — daftar aset per kategori, lokasi, tahun perolehan, dan nilai perolehan
2. Pengguna menetapkan filter: rentang tanggal, lokasi, kategori, dan role pemohon.
3. Sistem menampilkan grafik dan tabel hasil.
4. Pengguna dapat mengekspor ke XLSX atau PDF.

**Alternative Flow**
- **A1 — Data pada rentang terpilih kosong:** Sistem menampilkan status kosong dan menyarankan rentang lain.
- **A2 — Laporan berat (rentang panjang):** Sistem memproses secara asinkron dan menotifikasi pengguna saat berkas siap diunduh.
- **A3 — Perbandingan antar-periode:** Pengguna mengaktifkan mode perbandingan untuk melihat selisih terhadap periode sebelumnya.

**Post Conditions** — Tidak ada perubahan data; berkas ekspor tercatat di activity log.

**Acceptance Criteria**
- [ ] Seluruh laporan dapat difilter minimal berdasarkan rentang tanggal, lokasi, dan kategori.
- [ ] Ekspor XLSX mempertahankan struktur tabel dan dapat diolah lebih lanjut.
- [ ] Ekspor PDF memuat kop laporan, filter yang dipakai, tanggal cetak, dan nama pencetak.
- [ ] Laporan pada volume data target dihasilkan ≤ 5 detik untuk rentang 1 tahun.
- [ ] Role Siswa/OSIS tidak memiliki akses ke modul ini.

## 6. Business Rules

### Dimiliki modul ini

_Tidak ada aturan bisnis yang dimiliki modul ini._

**Aturan bersama yang juga berlaku** (dimiliki modul lain, dirujuk melalui ID — tidak disalin ke sini):

`BR-073` (m02) · `BR-074` (m02)

## 7. API Endpoints

### Endpoint

| Method | Endpoint | Permission | Deskripsi |
|---|---|---|---|
| GET | `/analytics` | `report.view` | Katalog jenis laporan sesuai izin dan kesiapan penyedia |
| GET | `/analytics/{jenis}` | `report.view` | Data laporan analitik |
| POST | `/analytics/{jenis}/export` | `report.export` | Ekspor worker, HTTP202 |
| GET | `/analytics/{jenis}/options` | `report.view` | Pilihan filter tersaring scope |
| GET | `/report-exports` | `report.export` | 25 job terbaru milik pemohon; izin pemanggil dibaca ulang dari data pengguna saat ini (bukan dari sesi), Siswa (R-07) tidak, scope `report.export` own/all |
| GET | `/report-exports/{id}` | `report.export` | Status dengan revalidasi akses |
| GET | `/report-exports/{id}/download` | `report.export` | URL privat maksimal5menit |

Konvensi umum, format respons, kode galat, dan ketentuan keamanan API:
[`../03-architecture/api-conventions.md`](../03-architecture/api-conventions.md).

## 8. Database Entity

### Entitas

Data agregat tidak mempunyai tabel sendiri. Infrastruktur ekspor memakai report_exports (job, pemohon/filter/hash akses, status, object key/file_id, waktu dan tombstone cleanup).

Model data menyeluruh dan ERD: [`../03-architecture/data-model.md`](../03-architecture/data-model.md).

## 9. Notification

### Notifikasi diterbitkan modul ini

| Kode | Event Pemicu | Penerima | Kanal | Wajib | Contoh Isi |
|---|---|---|---|:---:|---|
| **NT-42** | Berkas ekspor asinkron siap diunduh | Pemohon ekspor | In-app + Push | ❌ | "Laporan {jenis} siap diunduh." |

Ketentuan umum kanal, latensi, dan preferensi: [`m17-notifications.md`](m17-notifications.md).

## 10. Permission

### Kode permission

| Kode | Domain | Deskripsi singkat | Role bawaan pemilik |
|---|---|---|---|
| `report.view` | Analitik | Melihat laporan analitik | Admin, Petugas, Pimpinan |
| `report.export` | Analitik | Mengekspor laporan | Admin, Petugas, Pimpinan |

Katalog kanonik & aturan scope: [`../00-foundation/roles-permissions.md`](../00-foundation/roles-permissions.md).

## 11. Activity Log

### Aksi yang wajib dicatat

| Aksi | Keterangan |
|---|---|
| `REPORT_EXPORTED` | Ekspor laporan beserta jenis dan filter |
| `REPORT_EXPORT_REQUESTED` | Pengajuan job ekspor milik pemohon |

Prinsip, struktur entri, dan tamper-evidence: [`../03-architecture/activity-log.md`](../03-architecture/activity-log.md).

## 12. Acceptance Criteria

Kriteria penerimaan tercantum **inline** pada tiap Functional Requirement di bagian 5,
sesuai bentuk aslinya di PRD. Tidak diringkas maupun dipindahkan agar tidak terpisah dari
konteks requirement-nya.

Strategi pengujian: [`../06-quality/test-strategy.md`](../06-quality/test-strategy.md).

## 13. Dependencies

- [`m04-assets.md`](m04-assets.md) — M-04 Inventaris Aset
- [`m09-loans.md`](m09-loans.md) — M-09 Peminjaman & Pengembalian
- [`m12-maintenance.md`](m12-maintenance.md) — M-12 Maintenance Management

## 14. Related Modules

- [`m04-assets.md`](m04-assets.md) — M-04 Inventaris Aset
- [`m09-loans.md`](m09-loans.md) — M-09 Peminjaman & Pengembalian
- [`m12-maintenance.md`](m12-maintenance.md) — M-12 Maintenance Management

## 15. Open Issues

Delapan perhitungan produksi tersedia lokal melalui PR-06-03…07 di atas
fondasi PR-06-01/02. Ekspor mengikuti PR-06-08; UI P-58/P-59 mengikuti PR-06-10.
Review/CI/staging dan pengukuran beban PR-06-09 tetap diperlukan.

### Keputusan pengguna PR-06-01/02 — 14 Oktober 2026

Empat jawaban AskUserQuestion menetapkan fondasi berikut:

- Periode tanggal mulai/selesai inklusif WIB, bawaan 30 hari terakhir dari Clock,
  maksimum 366 hari untuk permintaan laporan. Pembanding adalah periode tepat
  sebelumnya dengan jumlah hari sama. Rentang lebih panjang disiapkan melalui
  kontrak ekspor PR-06-08; belum diproses oleh fondasi ini.
- report.view wajib bersama permission baca setiap domain yang digunakan.
  Scope diterapkan di SQL sebelum GROUP BY/count/window/pagination. report.export
  nanti menjadi irisan tambahan; tidak dapat memperluas report.view/domain.
  Siswa/OSIS R-07 tetap ditolak meskipun diberi report.view. SYSTEM tidak dipakai
  untuk membaca laporan pengguna; worker ekspor harus memuat ulang hak pemohon.
- Own subjek: aset berdasarkan penanggung_jawab_id; reservasi pemohon_id;
  peminjaman peminjam_id; kerusakan pelapor_id; maintenance teknisi_id;
  pengadaan/penghapusan pengusul_id; konsumsi bahan pemohon permintaan asal.
  Scope report own mengikuti subjek laporan. Scope domain pada dimensi join
  tetap diberlakukan: pinjaman sendiri boleh atas aset milik orang lain jika
  asset.view all; jika asset.view own, irisan tetap mempersempit hasil.
- Tanpa asset.view_financial, nilai perolehan/sumber perolehan tidak di-SELECT.
  Scope finansial own hanya membuka kolom jika seluruh baris aset yang dipilih
  sudah dibatasi kepada pemanggil; selainnya kolom dihilangkan seluruhnya.
  Laporan biaya membutuhkan maintenance.view_cost. Scope assigned/restricted
  tanpa definisi ditolak, tidak jatuh ke all.
- Katalog memuat delapan jenis FR-16.1, sesuai izin. Penyedia yang belum tersedia
  ditandai BELUM_TERSEDIA dan GET laporannya menghasilkan 503 SERVICE_NOT_READY.
  Fondasi tidak mengembalikan angka nol untuk perhitungan yang belum dibuat.

Jenis teknis: kondisi-aset, pemanfaatan-fasilitas, biaya-pemeliharaan,
tren-kerusakan, aktivitas-peminjaman, konsumsi-bahan, kebutuhan-pengadaan,
rekapitulasi-aset. Jenis tidak dikenal/parameter tidak sah menghasilkan 400.

Parameter: tanggal_mulai/tanggal_selesai (keduanya atau tidak keduanya), page
(bawaan 1, maksimum 1000000), per_page (25, maksimum 100), sort (key kolom dengan
awalan minus untuk menurun), bandingkan=true/false, room_id/category_id dan
work_unit_id/requester_role untuk jenis yang mendukungnya. Filter yang belum
relevan pada suatu jenis ditolak 422. Urutan tanggal terbalik atau >366 hari
juga 422. Rentang eksplisit tidak diasumsikan hanya masa lalu oleh kerangka;
makna peristiwa/tanggal setiap laporan dipastikan pada PR perhitungan domain.

Respons daftar tetap success/data/meta. Tambahan report berisi jenis/judul,
periode/filter yang diterapkan, zona waktu, waktu Clock, metadata kolom tabel
serta ringkasan, ringkasan utama dan pembanding nullable. DECIMAL dikirim sebagai
string tanpa notasi eksponen, bukan float mata uang. Total adalah jumlah grup
terlihat sebelum pagination, bukan jumlah seluruh data sekolah. Halaman di
luar batas tetap mempertahankan total terlihat dengan data kosong.

Seluruh respons private/no-store. Tidak ada cache bersama lintas scope.
Kontrak body ekspor XLSX/PDF tersedia tanpa page/per_page; route/worker/NT-42
serta pencatatan REPORT_EXPORTED tetap PR-06-08.


### Keputusan pengguna PR-06-03/04/05/06/07 — 14 Oktober 2026

Enam jawaban AskUserQuestion melengkapi FR-16.1:

- Utilisasi memakai pemakaian terealisasi (reservasi Berlangsung/Selesai dan
  peminjaman nyata). Slot tentatif/batal tidak dihitung. Jam operasional pada
  hari kerja, selain libur, menjadi pembagi. Interval dipotong pada periode,
  jam operasional dan Clock; interval tumpang tindih satu objek digabung.
  Pembagi nol menghasilkan persentase null, bukan 0%. Kalender operasional
  yang berlaku sekarang digunakan karena belum ada versi kalender historis.
- Tren kondisi adalah snapshot akhir tiap bulan/akhir periode berdasarkan
  asset_condition_history, untuk aset yang sudah tercatat pada batas itu.
  Penghapusan/pemulihan diperhitungkan pada waktunya. Kategori, lokasi dan
  penanggung jawab/scope menggunakan data sekarang; keterbatasan ini dijelaskan.
  Aset yang dihapus setelah suatu periode tetap terhitung pada periode tersebut.
- Keterlambatan mengikuti BR-028/029 dan implementasi operasional: kebijakan
  tiap pinjaman, bukan selalu hari kerja. Libur/nonoperasional dikecualikan hanya
  bila snapshot mengaturnya. Unit yang kembali sebagian dihitung masing-masing;
  perpanjangan disetujui diperhitungkan, termasuk hari terakumulasi sebelumnya.
- Biaya aktual hanya WO Selesai dan terverifikasi, pada tanggal verifikasi;
  estimasi dan WO menunggu verifikasi tidak menjadi realisasi. Setiap baris
  tetap menunjuk nomor WO agar dapat direkonsiliasi.
- Kebutuhan pengadaan memakai rusak berat dan umur teknis yang dapat dihitung.
  Permintaan tidak terpenuhi ditandai BELUM_TERUKUR/null, bukan angka nol;
  penolakan atau pembatalan tidak diasumsikan sebagai kekurangan aset.
- Batch melengkapi delapan jenis yang sudah ada, termasuk Konsumsi Bahan.
  Pengadaan/penghapusan menjadi ringkasan tambahan pada laporan terkait, hanya
  bila izin domain dan irisan scope memungkinkan. Tanpa izin, kolom/ringkasan
  tersebut tidak dipilih SQL. Ekspor, indeks baru dan UI tetap PR-06-08/09/10.

Periode peminjaman berdasarkan tanggal pinjam; kepatuhan memakai unit kembali
normal sampai batas periode/Clock. Hilang dipisahkan dari unit kembali normal.
Tren kerusakan memakai kohor tiket yang dibuat pada periode, termasuk objek
ruangan; rata-rata penyelesaian hanya tiket kohor yang selesai pada batas itu.
Konsumsi memakai PENGELUARAN dari penyerahan nyata (tanggal_serah WIB), bukan
jumlah diminta/disetujui, penerimaan, penyesuaian atau opname. Satuan berbeda
tidak dijumlahkan menjadi satu total jumlah. Nama/role/unit kerja dimensi
pemohon adalah data saat ini. Metode frekuensi stok minimum dikukuhkan pada
jawaban tambahan AskUserQuestion di bawah; ambang historis yang tidak tersedia
tidak boleh diklaim telah direkonstruksi.

Rekap aset adalah populasi tercatat selama periode atau masih aktif pada awal
periode, beserta kondisi akhir dan tanggal penghapusan/pemulihan. Nilai finansial
hanya dipilih bila asset.view_financial mengizinkan seluruh baris terlihat.
Laporan baca tidak menulis data operasional maupun menerbitkan audit ekspor.

Filter work_unit_id/requester_role pada Kebutuhan Pengadaan belum tersedia karena
keduanya hanya bermakna pada indikator permintaan tak terpenuhi yang belum terukur.
Katalog jenis ini mengiklankan filter lokasi/kategori saja dan menolak filter
pemohon; report.view/reservation.view/asset.view tetap menjadi gerbang fondasinya.


Jawaban tambahan AskUserQuestion (14–15 Oktober 2026) mengonfirmasi:
rekonstruksi seluruh ledger per jenis menurut ID transaksi dan bandingkan saldo
total sebelum/sesudah terhadap minimum sekarang. Label AMBANG_SAAT_INI membedakannya
dari kejadian notifikasi/ambang historis. Jika scope atau filter pemohon
membatasi data, frekuensi global null/TIDAK_TERSEDIA_PADA_SCOPE dan SQL tidak membaca
ledger global. Frekuensi per jenis/periode tidak dijumlahkan ulang per baris lokasi.

Ringkasan pengadaan memakai kohor usulan menurut tanggal dibuat; status selesai
adalah status sekarang. Aset dari pengadaan memakai tanggal registrasi. Filter
kategori berlaku pada aset/usulan aset; kategori aset pada Pemanfaatan Fasilitas
mengeluarkan baris ruangan yang tidak memiliki kategori aset.


### Ekspor PR-06-08/11 — keputusan AskUserQuestion 14–15 Oktober 2026

Semua ekspor analitik dan daftar reservasi/kerusakan memakai HTTP 202, job
report_exports dan outbox ExportRequested. Penghitungan/render/PUT hanya worker;
API tidak merender file. XLSX maksimal 100.000 baris, PDF 5.000 baris, termasuk
seluruh hasil filter tanpa page/per_page. Worker membaca limit+1 sebagai sentinel:
kelebihan menjadi GAGAL dengan instruksi mempersempit filter, tanpa pemotongan.
Rentang analitik paling lama lima tahun kalender inklusif (akhir sebelum ulang
tahun kelima tanggal mulai); tampilan langsung tetap maksimal 366 hari. Tanggal
bawaan dibekukan saat pengajuan; pemrosesan memakai Clock dan WIB.

POST /analytics/{jenis}/export, /reservations/export dan /damage-reports/export
memerlukan report.export dan Idempotency-Key UUIDv4. Body {format:XLSX|PDF,
filter:{...}} strict. Izin baca domain wajib; analitik juga report.view. Scope
report.export beririsan dengan scope baca, tidak memperluasnya. Operasional
memakai filter/urutan kanonik P-30/P-39: reservasi own = pemohon; kerusakan own =
pelapor, cakupan teknisi mengikuti penugasan M-11; report.export own menambah
syarat pelapor milik sendiri. Scope domain tanpa aturan ditolak. R-07 dan SYSTEM
bukan pemohon ekspor. Status/file hanya bagi pemohon, juga untuk Administrator.

GET /report-exports menampilkan maksimal 25 job terbaru milik pemohon. GET
/report-exports/{id} memeriksa akses sekarang. GET /report-exports/{id}/download
mengembalikan URL privat, nama file dan expires_at. Ketiga GET memerlukan
report.export, no-store. Identitas/izin dibaca ulang langsung dari SQL saat
pengajuan, sebelum/sesudah pemrosesan, serta saat status/unduh. Hash role/version/
permission×scope dan himpunan baris dalam cakupan own/assigned/restricted membuat
file lama tidak dapat diunduh ketika akses berubah; pengguna membuat ekspor ulang.
Riwayat daftar tidak menampilkan jumlah baris yang belum diperiksa ulang.

Status: MENUNGGU ? BERJALAN ? SIAP/GAGAL/DIBATALKAN. File SIAP tersedia 24 jam
sejak selesai. URL berlaku paling lama lima menit, dibatasi sisa umur file;
URL yang sudah terbit dapat berlaku hingga batas tersebut. Cleanup worker tiap
15 menit menghapus objek kedaluwarsa/terminal, melepas registri file ke lifecycle
M-06 dan menyimpan tombstone pembersihan agar kegagalan storage dapat dicoba ulang.
Metadata job/audit tetap dipertahankan, byte dan URL tidak dimasukkan notifikasi.
REPORT_EXPORT adalah owner_type khusus keluaran renderer terpercaya, bukan
jenis presign unggahan pengguna. XLSX tidak membuat formula dari teks input;
DECIMAL tetap teks presisi, NUMBER/BOOLEAN tetap bertipe. PDF meng-escape HTML,
menonaktifkan JavaScript/jaringan lewat renderer bersama, memuat kop, filter,
periode, waktu cetak WIB, pencetak dan ringkasan/pembanding. Parameter sekolah.nama
wajib diisi sebelum PDF; sekolah.npsn/alamat opsional. XLSX tetap tersedia tanpa
kop terisi. Konfigurasi identitas melalui Pengaturan, tanpa nama sekolah buatan.

Satu job yang berhasil menghasilkan satu REPORT_EXPORTED (jenis, filter, format,
baris, file_id) dan satu ExportReady ? NT-42 in-app/push sesuai preferensi.
REPORT_EXPORT_REQUESTED mencatat pengajuan. Replay idempoten tidak menggandakan
job/file/audit/notifikasi; kunci juga diikat pada actor/endpoint. Kegagalan PUT
atau transaksi akhir dikompensasi; retry memakai object key/job yang sama.
