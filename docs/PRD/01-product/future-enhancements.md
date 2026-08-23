# 25. Future Enhancements

Fitur-fitur berikut berada di luar lingkup rilis ini, namun layak dipertimbangkan pada pengembangan berikutnya. Urutan mencerminkan perkiraan nilai manfaat dibanding upaya pengembangannya.

## 25.1 Prioritas Tinggi

| Kode | Enhancement | Nilai Manfaat |
|---|---|---|
| FE-01 | **Mode offline pada aplikasi mobile untuk stock opname** | Memungkinkan opname di gudang atau area tanpa sinyal; menghilangkan ketergantungan pada kualitas jaringan saat pekerjaan lapangan |
| FE-02 | **Notifikasi WhatsApp** | Tingkat keterbacaan tertinggi di lingkungan sekolah Indonesia; mempercepat respons approver dan pengingat pengembalian |
| FE-03 | **Single Sign-On (Google Workspace / belajar.id)** | Menghapus beban pengelolaan password dan mempercepat *onboarding* pengguna baru |
| FE-04 | **Penyusutan aset & nilai buku** | Mendukung pelaporan keuangan sekolah dan keputusan penggantian aset berbasis nilai |
| FE-05 | ~~Modul penghapusan aset (write-off)~~ → **dipindahkan ke dalam lingkup rilis ini sebagai M-21** | Ditemukan pada audit: approval engine, business rules, dan state diagram sudah merujuk penghapusan aset, sehingga tidak dapat ditunda tanpa meninggalkan siklus hidup aset yang terputus |

## 25.2 Prioritas Menengah

| Kode | Enhancement | Nilai Manfaat |
|---|---|---|
| FE-06 | **Manajemen vendor & Purchase Order** | Melengkapi alur pengadaan hingga pemilihan penyedia dan penerbitan PO |
| FE-07 | **Integrasi anggaran RKAS/BOS** | Validasi pagu anggaran otomatis saat usulan pengadaan diajukan |
| FE-08 | **Portal vendor untuk pekerjaan maintenance** | Memungkinkan pihak ketiga memperbarui progres pekerjaan secara mandiri |
| FE-09 | ~~**Manajemen barang habis pakai (consumable)**~~ → **dipindahkan ke dalam lingkup rilis ini sebagai M-22 Manajemen Bahan** | Ditemukan pada audit terminologi: target produk mencakup seluruh sarpras, sehingga Bahan tidak dapat ditunda tanpa meninggalkan separuh domain sarpras tanpa pengelolaan |
| FE-10 | **Tanda tangan digital pada berita acara** | Meningkatkan keabsahan dokumen serah terima, opname, dan mutasi |
| FE-11 | **Laporan terjadwal otomatis** | Laporan berkala dikirim otomatis kepada pimpinan tanpa perlu diminta |
| FE-12 | **Multi-sekolah (multi-tenant)** | Memungkinkan penggunaan pada tingkat yayasan atau dinas pendidikan |
| FE-13 | **Kalender terintegrasi dengan jadwal akademik** | Mencegah benturan reservasi dengan jadwal KBM secara otomatis |

## 25.3 Prioritas Rendah / Eksploratif

| Kode | Enhancement | Nilai Manfaat |
|---|---|---|
| FE-14 | **Prediksi kerusakan berbasis machine learning** | Memperkirakan aset yang berisiko rusak berdasarkan pola riwayat servis |
| FE-15 | **Rekomendasi pengadaan otomatis berbasis AI** | Menyusun usulan pengadaan tahunan dari data kondisi, umur, dan pemanfaatan aset |
| FE-16 | **Pelacakan aset berbasis RFID/IoT** | Inventarisasi tanpa pemindaian manual satu per satu |
| FE-17 | **Chatbot dengan kemampuan aksi terbatas** | Membuat draf reservasi melalui percakapan dengan konfirmasi eksplisit pengguna |
| FE-18 | **Chatbot suara (voice input)** | Memudahkan petugas lapangan yang sedang menggunakan kedua tangan |
| FE-19 | **Peta denah sekolah interaktif** | Visualisasi lokasi aset di atas denah gedung |
| FE-20 | **Pembayaran denda daring** | Integrasi payment gateway untuk pelunasan denda tanpa tatap muka |
| FE-21 | **Gamifikasi kepatuhan pengguna** | Apresiasi bagi pengguna dengan rekam jejak pengembalian tepat waktu |
| FE-22 | **Ekspor data terbuka untuk BI eksternal** | Memungkinkan analisis lanjutan pada perangkat *business intelligence* sekolah |

---
