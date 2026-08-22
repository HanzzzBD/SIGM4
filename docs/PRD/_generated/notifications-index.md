<!-- DIGENERATE OTOMATIS oleh scripts/gen_indexes.py — JANGAN SUNTING BERKAS INI.
     Sumber kebenaran setiap baris ada di berkas modul terkait (docs/02-modules/).
     Menyunting di sini akan hilang saat regenerasi berikutnya. -->

# Indeks Notifikasi

> Setiap notifikasi dimiliki modul yang menerbitkan event-nya.
> Total: **49** baris, dikumpulkan dari 21 berkas modul.

| Kode | Event | Penerima | Kanal | Wajib | Contoh | Pemilik |
|---|---|---|---|:---:|---|---|
| **NT-01** | Pengajuan reservasi baru dibuat | Approver level aktif | In-app + Push | ✅ | "Pengajuan reservasi {nomor} dari {pemohon} menunggu persetujuan Anda." | [M-10](../02-modules/m10-approval.md) |
| **NT-02** | Pengajuan disetujui (level akhir) | Pemohon | In-app + Push | ✅ | "Reservasi {nomor} untuk {objek} pada {tanggal} telah disetujui." | [M-10](../02-modules/m10-approval.md) |
| **NT-03** | Pengajuan ditolak | Pemohon | In-app + Push | ✅ | "Reservasi {nomor} ditolak. Alasan: {alasan}." | [M-10](../02-modules/m10-approval.md) |
| **NT-04** | Pengajuan perlu revisi | Pemohon | In-app + Push | ✅ | "Reservasi {nomor} perlu direvisi. Catatan: {catatan}." | [M-10](../02-modules/m10-approval.md) |
| **NT-05** | Pengajuan naik ke level berikutnya | Approver level berikutnya | In-app + Push | ✅ | "Pengajuan {nomor} menunggu persetujuan Anda." | [M-10](../02-modules/m10-approval.md) |
| **NT-06** | SLA persetujuan terlampaui | Approver + Petugas Sarpras | In-app + Push | ✅ | "Pengajuan {nomor} melewati batas waktu persetujuan." | [M-10](../02-modules/m10-approval.md) |
| **NT-07** | Pengajuan dieskalasi | Approver eskalasi | In-app + Push | ✅ | "Pengajuan {nomor} dieskalasikan kepada Anda." | [M-10](../02-modules/m10-approval.md) |
| **NT-08** | Reservasi dibatalkan sepihak | Pemohon | In-app + Push | ✅ | "Reservasi {nomor} dibatalkan oleh {pelaku}. Alasan: {alasan}." | [M-07](../02-modules/m07-reservation-room.md) |
| **NT-09** | Reservasi kedaluwarsa (tidak diambil) | Pemohon | In-app | ❌ | "Reservasi {nomor} kedaluwarsa karena tidak diambil dalam 1×24 jam." | [M-07](../02-modules/m07-reservation-room.md) |
| **NT-10** | Serah terima barang selesai | Peminjam | In-app + Push | ❌ | "{jumlah} unit {barang} telah diserahkan. Kembalikan sebelum {tanggal}." | [M-09](../02-modules/m09-loans.md) |
| **NT-11** | Pengingat H-1 jatuh tempo | Peminjam | In-app + Push | ✅ | "Pengembalian {barang} jatuh tempo besok, {tanggal}." | [M-09](../02-modules/m09-loans.md) |
| **NT-12** | Peminjaman terlambat (harian) | Peminjam | In-app + Push | ✅ | "{barang} terlambat {n} hari. Denda berjalan Rp{jumlah}." | [M-09](../02-modules/m09-loans.md) |
| **NT-13** | Rekap keterlambatan harian | Petugas Sarpras | In-app | ❌ | "{n} peminjaman terlambat perlu ditindaklanjuti." | [M-09](../02-modules/m09-loans.md) |
| **NT-14** | Pengembalian tercatat | Peminjam | In-app + Push | ❌ | "Pengembalian {barang} tercatat pada {tanggal}." | [M-09](../02-modules/m09-loans.md) |
| **NT-15** | Denda terbit | Peminjam | In-app + Push | ✅ | "Denda keterlambatan Rp{jumlah} terbit atas peminjaman {nomor}." | [M-09](../02-modules/m09-loans.md) |
| **NT-16** | Denda dilunasi | Peminjam | In-app | ❌ | "Denda Rp{jumlah} telah dinyatakan lunas." | [M-09](../02-modules/m09-loans.md) |
| **NT-17** | Denda atau ganti rugi dibebaskan, penuh maupun sebagian | Peminjam | In-app | ❌ | "Kewajiban Rp{jumlah_dibebaskan} dibebaskan. Sisa tagihan Rp{sisa}. Alasan: {alasan}." | [M-09](../02-modules/m09-loans.md) |
| **NT-18** | Pemohon diblokir karena kewajiban tertunggak | Pemohon | In-app + Push | ✅ | "Anda tidak dapat mengajukan peminjaman baru hingga kewajiban diselesaikan." | [M-09](../02-modules/m09-loans.md) |
| **NT-19** | Laporan kerusakan baru | Petugas Sarpras | In-app + Push | ✅ | "Laporan kerusakan {nomor} atas {aset} dari {pelapor}." | [M-11](../02-modules/m11-damage-reports.md) |
| **NT-20** | Laporan kerusakan urgensi Kritis | Petugas Sarpras + Pimpinan Sekolah | In-app + Push | ✅ | "KRITIS: {aset} di {lokasi} dilaporkan rusak berat." | [M-11](../02-modules/m11-damage-reports.md) |
| **NT-21** | Laporan diverifikasi / ditolak | Pelapor | In-app + Push | ❌ | "Laporan {nomor} telah {diverifikasi/ditolak}. {catatan}" | [M-11](../02-modules/m11-damage-reports.md) |
| **NT-22** | Work order ditugaskan | Teknisi | In-app + Push | ✅ | "Work order {nomor} ditugaskan kepada Anda. Prioritas: {prioritas}." | [M-12](../02-modules/m12-maintenance.md) |
| **NT-23** | Work order melewati target selesai | Teknisi + Petugas Sarpras | In-app + Push | ✅ | "Work order {nomor} melewati target selesai {tanggal}." | [M-12](../02-modules/m12-maintenance.md) |
| **NT-24** | Work order menunggu verifikasi | Petugas Sarpras | In-app + Push | ❌ | "Work order {nomor} selesai dikerjakan dan menunggu verifikasi." | [M-12](../02-modules/m12-maintenance.md) |
| **NT-25** | Work order dikembalikan ke teknisi | Teknisi | In-app + Push | ✅ | "Work order {nomor} dikembalikan. Catatan: {catatan}." | [M-12](../02-modules/m12-maintenance.md) |
| **NT-26** | Work order selesai & diverifikasi | Pelapor + Teknisi | In-app + Push | ❌ | "Perbaikan {aset} telah selesai dan diverifikasi." | [M-12](../02-modules/m12-maintenance.md) |
| **NT-27** | Reservasi dibatalkan karena aset masuk perbaikan | Pemohon terdampak | In-app + Push | ✅ | "Reservasi {nomor} dibatalkan karena {aset} sedang diperbaiki." | [M-12](../02-modules/m12-maintenance.md) |
| **NT-28** | Work order preventif terbit | Teknisi + Petugas Sarpras | In-app + Push | ❌ | "Pemeliharaan preventif {aset} dijadwalkan {tanggal}." | [M-12](../02-modules/m12-maintenance.md) |
| **NT-29** | Garansi aset akan berakhir (H-30) | Petugas Sarpras | In-app | ❌ | "Garansi {aset} berakhir pada {tanggal}." | [M-12](../02-modules/m12-maintenance.md) |
| **NT-30** | Sesi stock opname dimulai | Petugas pelaksana | In-app + Push | ❌ | "Sesi opname {nama} dimulai. Target {n} unit aset." | [M-13](../02-modules/m13-audit-stocktake.md) |
| **NT-31** | Laporan opname menunggu persetujuan | Pimpinan Sekolah | In-app + Push | ✅ | "Laporan rekonsiliasi opname {nama} menunggu persetujuan Anda." | [M-13](../02-modules/m13-audit-stocktake.md) |
| **NT-32** | Hasil opname disetujui / ditolak | Petugas pelaksana | In-app + Push | ❌ | "Laporan opname {nama} telah {disetujui/ditolak}." | [M-13](../02-modules/m13-audit-stocktake.md) |
| **NT-33** | Aset dinyatakan hilang | Pimpinan Sekolah + Petugas Sarpras | In-app + Push | ✅ | "{aset} dinyatakan hilang berdasarkan {referensi}." | [M-13](../02-modules/m13-audit-stocktake.md) |
| **NT-34** | Usulan pengadaan diajukan | Approver | In-app + Push | ✅ | "Usulan pengadaan {nomor} senilai Rp{total} menunggu persetujuan." | [M-14](../02-modules/m14-procurement.md) |
| **NT-35** | Keputusan usulan pengadaan | Pengusul | In-app + Push | ✅ | "Usulan {nomor} {disetujui/disetujui sebagian/ditolak}." | [M-14](../02-modules/m14-procurement.md) |
| **NT-36** | Barang pengadaan diterima & didaftarkan | Pengusul + Petugas Sarpras | In-app | ❌ | "{n} unit dari usulan {nomor} telah diterima dan terdaftar sebagai aset." | [M-14](../02-modules/m14-procurement.md) |
| **NT-37** | Permintaan reset password masuk | Administrator | In-app + Push | ✅ | "{pengguna} mengajukan reset password." | [M-01](../02-modules/m01-auth.md) |
| **NT-38** | Password sementara diterbitkan | **Administrator penerbit** | In-app | ✅ | "Password sementara untuk {pengguna} diterbitkan {waktu}. Serahkan langsung kepada yang bersangkutan." — *Direvisi pada audit: sebelumnya ditujukan kepada pengguna terkait, padahal yang bersangkutan sedang tidak dapat login sehingga notifikasi in-app tidak akan pernah terbaca.* | [M-01](../02-modules/m01-auth.md) |
| **NT-38a** | Password berhasil diganti setelah reset | Pengguna terkait | In-app + Push | ✅ | "Password Anda berhasil diperbarui pada {waktu}. Bila ini bukan Anda, segera hubungi Administrator." | [M-01](../02-modules/m01-auth.md) |
| **NT-39** | Akun terkunci karena percobaan login gagal | Pengguna + Administrator | In-app | ✅ | "Akun terkunci sementara akibat 5 percobaan login gagal." | [M-01](../02-modules/m01-auth.md) |
| **NT-40** | Role atau status akun diubah | Pengguna terkait | In-app | ✅ | "Role akun Anda diubah menjadi {role}." | [M-02](../02-modules/m02-users.md) |
| **NT-41** | Ringkasan harian operasional | Petugas Sarpras + Pimpinan Sekolah | In-app | ❌ | "Ringkasan hari ini: {n} pengajuan baru, {n} pengembalian, {n} kerusakan." | [M-15](../02-modules/m15-dashboard.md) |
| **NT-42** | Berkas ekspor asinkron siap diunduh | Pemohon ekspor | In-app + Push | ❌ | "Laporan {jenis} siap diunduh." | [M-16](../02-modules/m16-analytics.md) |
| **NT-43** | Usulan penghapusan aset diajukan | Approver (Pimpinan Sekolah) | In-app + Push | ✅ | "Usulan penghapusan {nomor} atas {n} unit aset menunggu persetujuan Anda." | [M-21](../02-modules/m21-disposal.md) |
| **NT-44** | Keputusan usulan penghapusan | Pengusul | In-app + Push | ✅ | "Usulan penghapusan {nomor} {disetujui/disetujui sebagian/ditolak}." | [M-21](../02-modules/m21-disposal.md) |
| **NT-45** | Penghapusan aset dieksekusi | Pengusul + Pimpinan Sekolah | In-app | ❌ | "{n} unit aset telah dihapuskan. Berita acara {nomor} tersedia." | [M-21](../02-modules/m21-disposal.md) |
| **NT-46** | Slot pengajuan tertunda kedaluwarsa (TTL) | Pemohon + Approver aktif | In-app + Push | ✅ | "Pengajuan {nomor} kedaluwarsa karena belum diputuskan hingga batas waktu." | [M-07](../02-modules/m07-reservation-room.md) |
| **NT-47** | Approval mencapai batas eskalasi terakhir | Petugas Sarpras + Administrator | In-app + Push | ✅ | "Pengajuan {nomor} tidak diputuskan hingga eskalasi terakhir dan memerlukan tindakan manual." | [M-10](../02-modules/m10-approval.md) |
| **NT-48** | Persetujuan wali siswa belum terekam | Administrator | In-app | ✅ | "Akun siswa {nama} tidak dapat diaktifkan: persetujuan wali belum terekam (DP-02)." | [M-02](../02-modules/m02-users.md) |
