<!-- DIGENERATE OTOMATIS oleh scripts/gen_indexes.py — JANGAN SUNTING BERKAS INI.
     Sumber kebenaran setiap baris ada di berkas modul terkait (docs/02-modules/).
     Menyunting di sini akan hilang saat regenerasi berikutnya. -->

# Indeks Business Rules

> Setiap aturan dimiliki satu modul. Sunting di berkas modulnya, bukan di sini.
> Total: **103** baris, dikumpulkan dari 21 berkas modul.

| Kode | Business Rule | Pemilik |
|---|---|---|
| BR-001 | Setiap unit fisik aset dicatat sebagai satu record tersendiri dengan kode barang dan QR Code unik (pencatatan *serialized*). | [M-04](../02-modules/m04-assets.md) |
| BR-002 | Kode barang bersifat unik sistem-wide, dihasilkan otomatis mengikuti format yang dikonfigurasi Administrator, dan tidak dapat diubah manual setelah terbentuk. | [M-04](../02-modules/m04-assets.md) |
| BR-003 | Nomor seri, bila diisi, wajib unik di seluruh sistem. | [M-04](../02-modules/m04-assets.md) |
| BR-004 | Kondisi aset hanya bernilai: `Baik`, `Rusak Ringan`, `Rusak Berat`, `Hilang`. | [M-04](../02-modules/m04-assets.md) |
| BR-005 | Status aset (`assets.status`) menyatakan **kondisi operasional aset pada saat ini (*now*)** dan hanya bernilai: `Tersedia`, `Direservasi`, `Dipinjam`, `Dalam Perbaikan`, `Tidak Tersedia`. Status ini **bukan** sumber kebenaran ketersediaan masa depan. | [M-04](../02-modules/m04-assets.md) |
| BR-005a | Ketersediaan aset dan ruangan pada rentang waktu tertentu **wajib** dihitung dari tabel interval pemesanan (`booking_slots`), bukan dari `assets.status`. Lihat Bab 26. | [M-04](../02-modules/m04-assets.md) |
| BR-005b | `assets.status = Direservasi` hanya ditetapkan bila terdapat slot pemesanan aktif yang **mencakup waktu saat ini**; penetapannya dilakukan oleh proses terjadwal dan oleh transisi transaksional, bukan pada saat pengajuan dibuat. | [M-04](../02-modules/m04-assets.md) |
| BR-006 | Aset berkondisi `Rusak Berat` atau `Hilang` tidak dapat direservasi maupun dipinjam. | [M-04](../02-modules/m04-assets.md) |
| BR-007 | Setiap perubahan kondisi aset wajib menyertakan alasan dan tersimpan pada riwayat kondisi. | [M-04](../02-modules/m04-assets.md) |
| BR-008 | Aset tidak dapat dihapus permanen; hanya dapat dinonaktifkan/dihapuskan dengan pencatatan alasan dan tetap dapat ditelusuri. | [M-04](../02-modules/m04-assets.md) |
| BR-009 | Setiap aset wajib memiliki tepat satu lokasi penempatan aktif. | [M-04](../02-modules/m04-assets.md) |
| BR-010 | Aset yang sedang berstatus `Dipinjam` tidak dapat dimutasi lokasinya. | [M-04](../02-modules/m04-assets.md) |
| BR-011 | Aset yang berasal dari pengadaan wajib menyimpan referensi ke nomor usulan pengadaan asalnya. | [M-04](../02-modules/m04-assets.md) |
| BR-012 | Penetapan kondisi `Hilang` hanya sah bila merujuk pada sesi stock opname yang disetujui atau berita acara kehilangan. | [M-04](../02-modules/m04-assets.md) |
| BR-013 | Struktur lokasi bersifat hierarkis: Gedung → Lantai/Area → Ruangan. | [M-03](../02-modules/m03-locations.md) |
| BR-014 | Kode lokasi bersifat unik pada setiap tingkat hierarki. | [M-03](../02-modules/m03-locations.md) |
| BR-015 | Lokasi yang masih memuat aset tidak dapat dihapus maupun dinonaktifkan sebelum seluruh asetnya dipindahkan. | [M-03](../02-modules/m03-locations.md) |
| BR-016 | Hanya ruangan dengan penanda `dapat_direservasi = true` yang muncul pada modul Reservasi Ruangan. | [M-03](../02-modules/m03-locations.md) |
| BR-017 | Dua slot pemesanan berstatus `Tentative`, `Confirmed`, atau `Active` tidak boleh beririsan waktu pada ruangan atau unit barang yang sama. Aturan ini ditegakkan sebagai *constraint* basis data, bukan hanya validasi aplikasi (Bab 26). | [M-07](../02-modules/m07-reservation-room.md) |
| BR-018 | Reservasi hanya dapat diajukan pada hari dan jam operasional sekolah yang dikonfigurasi. | [M-07](../02-modules/m07-reservation-room.md) |
| BR-019 | Jumlah peserta pada reservasi ruangan tidak boleh melebihi kapasitas ruangan. | [M-07](../02-modules/m07-reservation-room.md) |
| BR-020 | Pengajuan reservasi wajib dilakukan minimal H-1 sebelum waktu penggunaan, kecuali oleh pengguna dengan permission `reservation.urgent`. | [M-07](../02-modules/m07-reservation-room.md) |
| BR-021 | Durasi maksimum peminjaman barang ditetapkan per role melalui konfigurasi sistem; nilai bawaan: Guru & Staf 7 hari, Siswa/OSIS 3 hari. | [M-07](../02-modules/m07-reservation-room.md) |
| BR-022 | Role Siswa/OSIS hanya dapat mereservasi aset dengan penanda `boleh_dipinjam_siswa = true` dan ruangan dengan penanda `boleh_direservasi_siswa = true`. | [M-07](../02-modules/m07-reservation-room.md) |
| BR-023 | Reservasi yang telah disetujui namun tidak diambil dalam 1×24 jam sejak waktu mulai otomatis berstatus `Kedaluwarsa` dan unitnya dibebaskan. | [M-07](../02-modules/m07-reservation-room.md) |
| BR-023a | Setiap pemohon dibatasi jumlah pengajuan berstatus `Menunggu Persetujuan` yang boleh berjalan bersamaan (nilai bawaan: Guru & Staf 5, Siswa/OSIS 2; dikonfigurasi Administrator). Pengajuan melebihi kuota ditolak. | [M-07](../02-modules/m07-reservation-room.md) |
| BR-023b | Slot `Tentative` memiliki masa berlaku (TTL) yang dikonfigurasi Administrator (bawaan 48 jam, atau hingga H-1 waktu mulai — mana yang lebih dulu). Bila pengajuan belum diputuskan sampai TTL habis, slot dibebaskan otomatis dan pengajuan berstatus `Kedaluwarsa`. Aturan ini mencegah penguncian ketersediaan oleh pengajuan menggantung. | [M-07](../02-modules/m07-reservation-room.md) |
| BR-023c | Reservasi berulang (BR-024a) tidak boleh menahan slot lebih dari horizon pemesanan yang dikonfigurasi (bawaan 90 hari ke depan). | [M-07](../02-modules/m07-reservation-room.md) |
| BR-024 | Perubahan jadwal reservasi diperlakukan sebagai pembatalan disertai pengajuan baru. | [M-07](../02-modules/m07-reservation-room.md) |
| BR-024a | Reservasi berulang menghasilkan **satu** pengajuan induk dengan **satu** instance approval, dan N slot turunan per tanggal. Keputusan approval berlaku untuk seluruh tanggal. Pembatalan dapat dilakukan per tanggal turunan tanpa membatalkan induk. | [M-07](../02-modules/m07-reservation-room.md) |
| BR-024b | Reservasi gabungan (ruangan + barang pendukung dalam satu pengajuan) diperlakukan sebagai **satu** pengajuan dengan **satu** instance approval dan bersifat *all-or-nothing*: bila salah satu objek tidak tersedia atau ditolak, seluruh pengajuan ditolak. Pemohon dapat mengajukan ulang secara terpisah. | [M-07](../02-modules/m07-reservation-room.md) |
| BR-025 | Pembatalan reservasi wajib menyertakan alasan. | [M-07](../02-modules/m07-reservation-room.md) |
| BR-026 | Serah terima peminjaman hanya dapat dilakukan atas reservasi berstatus `Disetujui`, kecuali oleh pengguna dengan permission `loan.direct`. | [M-09](../02-modules/m09-loans.md) |
| BR-026a | Peminjaman langsung dengan permission `loan.direct` merupakan **satu-satunya pengecualian sah** terhadap BR-035. Sistem membentuk reservasi retroaktif berstatus `Disetujui` dengan penanda `bypass_approval = true` beserta alasan wajib, dan mencatatnya sebagai anomali pada activity log serta laporan kepatuhan bulanan. | [M-09](../02-modules/m09-loans.md) |
| BR-027 | Serah terima dan pengembalian wajib disertai verifikasi unit (pemindaian QR atau input kode barang) dan minimal satu foto kondisi. | [M-09](../02-modules/m09-loans.md) |
| BR-028 | Denda keterlambatan dihitung `jumlah_hari_terlambat × tarif_denda_per_hari`, dengan pembulatan ke atas pada satuan **hari kalender** (bukan hari kerja). Definisi hari mengikuti Lampiran E. | [M-09](../02-modules/m09-loans.md) |
| BR-028a | Denda diterbitkan **per unit yang dipinjam (`loan_item`)**, bukan per transaksi peminjaman. Pada pengembalian sebagian, setiap unit dihitung keterlambatannya sendiri. | [M-09](../02-modules/m09-loans.md) |
| BR-028b | Denda keterlambatan per unit dibatasi maksimum (*cap*) sebesar persentase nilai perolehan unit tersebut yang dikonfigurasi Administrator (bawaan 30%), atau nominal maksimum bila nilai perolehan tidak diketahui. Cap mencegah denda melampaui nilai barangnya sendiri. | [M-09](../02-modules/m09-loans.md) |
| BR-028c | Hari libur sekolah **tetap dihitung** sebagai hari keterlambatan, kecuali Administrator mengaktifkan parameter "kecualikan hari libur". Kebijakan yang dipilih wajib disosialisasikan kepada pengguna sebelum go-live (RS-16). | [M-09](../02-modules/m09-loans.md) |
| BR-028d | Barang yang dinyatakan `Hilang` atau rusak berat akibat kelalaian peminjam menimbulkan **kewajiban ganti rugi** terpisah dari denda keterlambatan, sebesar nilai perolehan aset atau nilai penggantian yang ditetapkan Petugas Sarpras dengan persetujuan Pimpinan Sekolah. Kewajiban ini dicatat dengan jenis `Ganti Rugi` dan mengikuti alur status yang sama dengan denda. | [M-09](../02-modules/m09-loans.md) |
| BR-028e | Kewajiban ganti rugi dapat dibebaskan sepenuhnya atau sebagian oleh Pimpinan Sekolah dengan alasan wajib; Petugas Sarpras tidak berwenang membebaskannya. | [M-09](../02-modules/m09-loans.md) |
| BR-029 | Tarif denda yang berlaku adalah tarif pada saat tanggal jatuh tempo, bukan tarif saat pengembalian. | [M-09](../02-modules/m09-loans.md) |
| BR-030 | Pengguna yang memiliki peminjaman terlambat yang belum dikembalikan, atau denda `Belum Dibayar` melebihi ambang yang dikonfigurasi, diblokir dari mengajukan reservasi/peminjaman baru sampai kewajibannya diselesaikan. | [M-09](../02-modules/m09-loans.md) |
| BR-031 | Pembebasan denda hanya dapat dilakukan oleh Administrator atau Petugas Sarana Prasarana, wajib menyertakan alasan, dan tercatat pada activity log. | [M-09](../02-modules/m09-loans.md) |
| BR-032 | Barang yang kembali dalam kondisi rusak otomatis menghasilkan tiket Laporan Kerusakan yang tertaut ke transaksi peminjaman dan peminjamnya. | [M-09](../02-modules/m09-loans.md) |
| BR-033 | Tanggung jawab peminjaman tetap melekat pada pemohon meskipun pengambilan barang diwakilkan pihak lain. | [M-09](../02-modules/m09-loans.md) |
| BR-034 | Perpanjangan peminjaman hanya dapat diajukan sebelum jatuh tempo, hanya bila unit tidak dipesan pihak lain, dan wajib melalui persetujuan. | [M-09](../02-modules/m09-loans.md) |
| BR-035 | Setiap pengajuan (reservasi, perpanjangan, pengadaan, penghapusan) wajib melalui approval engine. | [M-10](../02-modules/m10-approval.md) |
| BR-036 | Bila tidak ada aturan yang cocok, berlaku aturan bawaan berupa persetujuan satu level oleh Petugas Sarana Prasarana. | [M-10](../02-modules/m10-approval.md) |
| BR-037 | Bila beberapa aturan cocok, aturan dengan prioritas tertinggi yang digunakan. | [M-10](../02-modules/m10-approval.md) |
| BR-038 | Penolakan pada langkah mana pun langsung mengakhiri alur persetujuan. | [M-10](../02-modules/m10-approval.md) |
| BR-039 | Approver tidak boleh menyetujui pengajuannya sendiri; langkah tersebut dilewati otomatis dan dicatat sebagai konflik kepentingan. | [M-10](../02-modules/m10-approval.md) |
| BR-039a | Pengajuan tidak pernah disetujui otomatis akibat kekosongan approver maupun kelalaian approver. Bila seluruh langkah terlewati, berlaku *fallback approver* (RE-11); bila seluruh eskalasi habis, pengajuan ditahan dan dialarmi (Lampiran D.5). | [M-10](../02-modules/m10-approval.md) |
| BR-040 | Instance approval yang sedang berjalan tetap memakai *snapshot* aturan pada saat pengajuan dibuat, meskipun aturan diubah kemudian. | [M-10](../02-modules/m10-approval.md) |
| BR-041 | Bila approver ditetapkan berdasarkan role dan terdapat beberapa pengguna dengan role tersebut, keputusan pertama yang masuk bersifat mengikat. | [M-10](../02-modules/m10-approval.md) |
| BR-042 | Setiap keputusan persetujuan wajib menyimpan pelaku, waktu, keputusan, dan catatan; penolakan wajib disertai alasan. | [M-10](../02-modules/m10-approval.md) |
| BR-043 | Persetujuan tidak berlaku bila objek yang diminta sudah tidak tersedia pada saat keputusan dibuat. | [M-10](../02-modules/m10-approval.md) |
| BR-044 | Laporan kerusakan yang dibuat pengguna wajib menyertakan minimal satu foto, kecuali laporan yang dihasilkan otomatis oleh sistem. | [M-11](../02-modules/m11-damage-reports.md) |
| BR-045 | Tiket kerusakan wajib diverifikasi Petugas Sarana Prasarana sebelum menjadi work order. | [M-11](../02-modules/m11-damage-reports.md) |
| BR-046 | Work order hanya dapat ditugaskan kepada pengguna berrole Teknisi. | [M-12](../02-modules/m12-maintenance.md) |
| BR-047 | Aset yang sedang berstatus `Dalam Perbaikan` tidak dapat direservasi maupun dipinjam. | [M-12](../02-modules/m12-maintenance.md) |
| BR-048 | Reservasi mendatang atas aset yang masuk perbaikan dibatalkan otomatis dan pemohonnya dinotifikasi. | [M-12](../02-modules/m12-maintenance.md) |
| BR-049 | Work order tidak dapat ditutup tanpa penetapan kondisi aset pasca-perbaikan dan minimal satu foto hasil pekerjaan. | [M-12](../02-modules/m12-maintenance.md) |
| BR-050 | Penutupan work order otomatis menutup tiket kerusakan yang menjadi asalnya. | [M-12](../02-modules/m12-maintenance.md) |
| BR-051 | Work order preventif terbit otomatis H-7 sebelum tanggal jatuh tempo jadwal pemeliharaan. | [M-12](../02-modules/m12-maintenance.md) |
| BR-052 | Sistem menampilkan peringatan bila perbaikan dilakukan atas aset yang masih dalam masa garansi aktif. | [M-12](../02-modules/m12-maintenance.md) |
| BR-053 | Biaya pemeliharaan terakumulasi per aset; bila melewati ambang persentase nilai perolehan yang dikonfigurasi, sistem menampilkan rekomendasi penggantian. | [M-12](../02-modules/m12-maintenance.md) |
| BR-054 | Satu aset hanya boleh tercakup dalam satu sesi stock opname yang berstatus `Berjalan`. | [M-13](../02-modules/m13-audit-stocktake.md) |
| BR-055 | Daftar aset target dibekukan sebagai *snapshot* saat sesi dibuat dan tidak berubah selama sesi berjalan. | [M-13](../02-modules/m13-audit-stocktake.md) |
| BR-056 | Aset berstatus `Dipinjam` pada saat opname tidak dihitung sebagai selisih. | [M-13](../02-modules/m13-audit-stocktake.md) |
| BR-057 | Hasil opname baru diterapkan ke data aset setelah laporan rekonsiliasi disetujui Pimpinan Sekolah. | [M-13](../02-modules/m13-audit-stocktake.md) |
| BR-058 | Setiap aset berstatus `Tidak Ditemukan` wajib diberi keterangan sebelum laporan dapat diajukan. | [M-13](../02-modules/m13-audit-stocktake.md) |
| BR-059 | Sesi opname yang telah `Selesai` bersifat *read-only* dan tidak dapat diubah oleh role mana pun. | [M-13](../02-modules/m13-audit-stocktake.md) |
| BR-060 | Usulan pengadaan wajib memuat minimal satu item beserta justifikasi kebutuhan. | [M-14](../02-modules/m14-procurement.md) |
| BR-061 | Total estimasi biaya dihitung sistem dari jumlah × estimasi harga satuan, tidak diisi manual. | [M-14](../02-modules/m14-procurement.md) |
| BR-062 | Usulan yang telah diajukan tidak dapat disunting kecuali berstatus `Perlu Revisi`. | [M-14](../02-modules/m14-procurement.md) |
| BR-063 | Jumlah barang yang dicatat diterima tidak boleh melebihi jumlah yang disetujui. | [M-14](../02-modules/m14-procurement.md) |
| BR-064 | Penerimaan barang wajib menghasilkan record aset per unit lengkap dengan kode barang dan QR. | [M-14](../02-modules/m14-procurement.md) |
| BR-065 | Dokumen penerimaan otomatis tertaut sebagai dokumen aset pada seluruh unit yang terbentuk. | [M-14](../02-modules/m14-procurement.md) |
| BR-065a | Penghapusan aset hanya sah setelah disetujui Pimpinan Sekolah melalui approval engine jenis "Penghapusan Aset". | [M-21](../02-modules/m21-disposal.md) |
| BR-065b | Aset yang sedang dipinjam, direservasi, atau memiliki slot pemesanan aktif tidak dapat diusulkan untuk dihapus. | [M-21](../02-modules/m21-disposal.md) |
| BR-065c | Aset yang diusulkan penghapusannya diblokir dari pemesanan baru selama usulan berjalan. | [M-21](../02-modules/m21-disposal.md) |
| BR-065d | Penghapusan bersifat penonaktifan permanen, bukan penghapusan fisik record; seluruh riwayat transaksi tetap dapat ditelusuri (BR-008). | [M-21](../02-modules/m21-disposal.md) |
| BR-065e | Kode barang dan UUID aset yang telah dihapuskan tidak pernah digunakan ulang oleh aset lain. | [M-21](../02-modules/m21-disposal.md) |
| BR-065f | Setiap penghapusan yang dieksekusi wajib menghasilkan berita acara PDF yang tersimpan permanen. | [M-21](../02-modules/m21-disposal.md) |
| BR-065g | Aset yang dihapuskan karena `Hilang` dan kemudian ditemukan kembali dapat dipulihkan oleh Administrator dengan alasan wajib, memakai kode barang dan UUID yang sama. | [M-21](../02-modules/m21-disposal.md) |
| BR-066 | Satu pengguna memiliki tepat satu role utama. | [M-02](../02-modules/m02-users.md) |
| BR-067 | Akun pengguna tidak dapat dihapus permanen; hanya dapat dinonaktifkan. | [M-02](../02-modules/m02-users.md) |
| BR-068 | Sistem wajib memiliki minimal satu akun Administrator berstatus aktif. | [M-02](../02-modules/m02-users.md) |
| BR-069 | Pengguna tidak dapat mengubah email dan rolenya sendiri. | [M-02](../02-modules/m02-users.md) |
| BR-070 | Role Administrator dan Pimpinan Sekolah wajib mengaktifkan 2FA. | [M-01](../02-modules/m01-auth.md) |
| BR-070a | Sistem wajib memiliki **minimal dua** akun Administrator aktif; instalasi awal tidak dianggap selesai sebelum syarat ini terpenuhi (RS-19). | [M-01](../02-modules/m01-auth.md) |
| BR-070b | Kehilangan total akses Administrator dipulihkan melalui prosedur *break-glass* berbasis CLI di sisi server dengan otorisasi tertulis Kepala Sekolah (FR-01.6). Prosedur ini tidak pernah tersedia melalui antarmuka web atau API. | [M-01](../02-modules/m01-auth.md) |
| BR-070c | Kode cadangan 2FA disimpan dalam bentuk hash dan hanya ditampilkan satu kali pada saat pembuatan. | [M-01](../02-modules/m01-auth.md) |
| BR-071 | Seluruh operasi tulis wajib tercatat pada activity log. | [M-18](../02-modules/m18-activity-log.md) |
| BR-072 | Activity log bersifat *append-only* dan tidak dapat disunting maupun dihapus oleh role mana pun melalui aplikasi. | [M-18](../02-modules/m18-activity-log.md) |
| BR-073 | Role Siswa/OSIS tidak boleh mengakses data finansial aset, biaya pemeliharaan, data pengadaan, dokumen aset, maupun data pribadi pengguna lain. | [M-02](../02-modules/m02-users.md) |
| BR-074 | Setiap pengguna hanya dapat melihat riwayat transaksi, denda, dan percakapan chatbot miliknya sendiri, kecuali role yang diberi permission lebih luas. | [M-02](../02-modules/m02-users.md) |
| BR-075 | Chatbot AI bersifat *read-only* dan tidak pernah diberi kemampuan mengubah data. | [M-19](../02-modules/m19-chatbot.md) |
| BR-076 | Seluruh data yang diakses chatbot difilter berdasarkan permission pengguna pada lapisan query, bukan pada instruksi prompt. | [M-19](../02-modules/m19-chatbot.md) |
| BR-077 | Chatbot wajib menyatakan ketidaktahuan bila data tidak ditemukan, dan dilarang mengarang jawaban. | [M-19](../02-modules/m19-chatbot.md) |
| BR-078 | Percakapan chatbot disimpan untuk keperluan evaluasi kualitas dan diarsipkan setelah 90 hari. | [M-19](../02-modules/m19-chatbot.md) |
| BR-079 | Gangguan pada layanan LLM tidak boleh memengaruhi ketersediaan modul lain. | [M-19](../02-modules/m19-chatbot.md) |
