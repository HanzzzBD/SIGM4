# Pelayanan permintaan privasi akun

Pemilik prosedur: Administrator sekolah. Acuan: PRD DP-04/05a/10, SL-04/05 dan
SDD-SEC-08. Keputusan produk dikonfirmasi melalui AskUserQuestion 15 Oktober 2026.

1. Terima permintaan melalui kanal resmi sekolah. Catat waktu penerimaan,
   nomor referensi dan tenggat respons paling lambat 3×24 jam. Register sekolah
   tetap menjadi pencatat permintaan; sistem menyediakan aksi pelaksanaan dan
   bukti audit, tanpa alur approval atau kanal pesan baru.
2. Verifikasi subjek data secara luring dengan Kartu Identitas Tatap Muka atau
   Konfirmasi Atasan/Wali Kelas. Jelaskan bahwa transaksi, audit historis dan
   foto bukti dipertahankan; foto tidak dikaburkan. Hindari menyalin identitas
   ke alasan atau referensi yang disimpan dalam audit.
3. Buka detail pengguna sebagai Administrator R-01 dengan user.update/all.
   Nonaktifkan akun melalui alur status. Siswa dengan pinjaman/denda terbuka
   akan ditolak dengan daftar kewajiban spesifik. Jangan mengubah role atau
   status kewajiban untuk melewati pemeriksaan.
4. Untuk akun NONAKTIF, pilih Pseudonimkan akun. Isi alasan, referensi permintaan
   terverifikasi dan metode verifikasi. Tinjau penjelasan permanen dan konfirmasi.
   Sistem memeriksa ulang izin dan kewajiban seluruh role dalam transaksi.
5. Catat hasil USER_PSEUDONYMIZED dan waktu pelaksanaan pada register. Bila
   koneksi terputus, muat ulang detail terlebih dahulu. Permintaan ulang ke akun
   yang sudah diproses mengembalikan waktu yang sama tanpa audit ganda.
6. Jika tertahan kewajiban, sampaikan status dan langkah penyelesaian melalui
   prosedur sekolah dalam tenggat respons. Akun tidak dipseudonimkan sampai
   kewajibannya selesai; pengecualian foto/audit tetap dijelaskan. Tidak ada
   tombol paksa atau pemulihan identitas yang telah diproses.

Worker personal-data-retention berjalan setiap 01:10 WIB dengan pelaku SYSTEM.
Periksa SCHEDULED_JOB_EXECUTED, jumlah dipseudonimkan/terblokir dan laporan impor
yang dibersihkan. Kegagalan dicatat dan dicoba ulang oleh antrean. Akun berstatus
nonaktif dua tahun tetap diperiksa kewajibannya; pengguna berkewajiban yang
dilewati tidak menghalangi pemrosesan pengguna berikutnya.

Laporan galat impor berakhir setelah 30×24 jam sejak selesai/gagal. API/UI menutup
rincian dan unduhan pada tenggat; worker membersihkan isi di database tanpa
menghapus ID/status/hitungan job atau audit. Berkas yang sudah diunduh pengguna
berada di luar pengendalian lifecycle server.

Jangan menjalankan operasi ini pada produksi sebagai smoke test. Gunakan data
uji terisolasi. Migration 0072 tidak dapat di-rollback sesudah ada akun yang
dipseudonimkan; perbaikan dilakukan maju karena identitas tidak disimpan ulang.
Foto dan snapshot transaksi/audit historis tetap dapat mengandung identitas:
aksesnya mengikuti permission dan kebijakan retensi pemilik domain.
