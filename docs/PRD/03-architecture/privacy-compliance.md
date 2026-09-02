# 28. Perlindungan Data Pribadi & Kepatuhan

> Sistem ini menyimpan data pribadi **anak di bawah umur** (siswa) dan mengirim konteks pengguna ke layanan LLM pihak ketiga. Bab ini wajib dipenuhi sebelum go-live. Rujukan: **UU No. 27 Tahun 2022 tentang Pelindungan Data Pribadi (UU PDP)**.

## 28.1 Peran dan Tanggung Jawab

| Peran menurut UU PDP | Pihak |
|---|---|
| Pengendali Data Pribadi | Sekolah (diwakili Kepala Sekolah) |
| Prosesor Data Pribadi | Penyedia hosting, penyedia layanan LLM, penyedia FCM |
| Pejabat/penanggung jawab pelindungan data | Ditunjuk oleh sekolah sebelum go-live; secara bawaan melekat pada Administrator Sistem |

## 28.2 Inventaris Data Pribadi

| Kelompok data | Contoh field | Subjek | Sensitivitas |
|---|---|---|---|
| Identitas pegawai | nama, email, NIP, unit kerja, telepon, foto | Guru, staf, teknisi | Sedang |
| **Identitas anak** | nama, NIS, kelas, foto, akun | **Siswa/OSIS (di bawah umur)** | **Tinggi** |
| Data perilaku | riwayat peminjaman, keterlambatan, denda, blokir | Seluruh pengguna | Sedang |
| Data teknis | alamat IP, user agent, perangkat, waktu login | Seluruh pengguna | Sedang |
| Media | foto kondisi aset & kerusakan yang **dapat memuat wajah** | Seluruh warga sekolah | Tinggi |
| Percakapan | isi pertanyaan pengguna ke chatbot | Seluruh pengguna | Sedang |

## 28.3 Ketentuan Wajib

| Kode | Requirement |
|---|---|
| DP-01 | Sekolah wajib menerbitkan **Pemberitahuan Privasi** yang dapat diakses dari halaman login dan halaman profil, menjelaskan jenis data, tujuan, dasar pemrosesan, pihak ketiga penerima, dan masa retensi |
| DP-02 | Pemrosesan data siswa di bawah umur dilakukan berdasarkan **persetujuan orang tua/wali** yang dikumpulkan sekolah secara luring; sistem menyimpan penanda `consent_guardian_at` pada akun siswa dan **menolak pengaktifan akun siswa tanpa penanda tersebut** |
| DP-03 | Prinsip **minimisasi data**: sistem tidak boleh meminta atau menyimpan data pribadi di luar yang tercantum pada Bab 11 |
| DP-04 | **Hak subjek data** (akses, koreksi, penghapusan, keberatan) wajib dapat dilayani. Karena BR-008/BR-067/AL-03 mewajibkan retensi jejak audit, permintaan penghapusan dilayani melalui **pseudonimisasi**: identitas diganti penanda tak-terbalikkan sementara catatan transaksi dipertahankan untuk kepentingan audit sekolah. Prosedur dan batas waktu respons (maksimum 3×24 jam) wajib terdokumentasi |
| DP-05 | **Foto yang memuat wajah** hanya boleh diakses role dengan permission eksplisit, diakses melalui URL bertanda tangan berbatas waktu (FR-06.1), dan tidak pernah muncul pada halaman publik hasil scan QR (FR-05.2 A3) |
| DP-05a | **Foto berwajah tidak ikut dipseudonimkan maupun dihapus** saat permintaan penghapusan data DP-04 dilayani. Foto bukti serah terima (BR-027) dan bukti kerusakan adalah dokumen pertanggungjawaban atas kewajiban bernilai uang; ia mengikuti penalaran DP-04 yang sama — jejak dipertahankan, identitas dipseudonimkan. Perlindungannya tetap DP-05. Hal ini **wajib dinyatakan pada Pemberitahuan Privasi** sehingga subjek data mengetahuinya sebelum memberikan data, bukan saat mengajukan penghapusan |
| DP-06 | **Enkripsi**: data *at-rest* pada basis data, cadangan, dan object storage wajib terenkripsi; data *in-transit* memakai TLS 1.2+ (NFR-S-01) |
| DP-07 | **Transfer ke pihak ketiga**: pengiriman data ke penyedia LLM dan FCM wajib didasari perjanjian pemrosesan data (*DPA*); bila pemrosesan terjadi di luar wilayah Indonesia, hal itu wajib diungkapkan pada Pemberitahuan Privasi |
| DP-08 | **Anonimisasi lingkungan non-produksi**: data produksi dilarang disalin ke staging/development tanpa anonimisasi nama, email, NIP/NIS, telepon, dan penghapusan berkas media |
| DP-09 | **Notifikasi pelanggaran data**: bila terjadi kebocoran, sekolah wajib memberitahukan subjek data dan otoritas dalam 3×24 jam. Prosedur, penanggung jawab, dan templat komunikasi wajib tersedia sebelum go-live |
| DP-10 | **Retensi**: mengikuti Bab 11.4. Akun siswa yang telah lulus dinonaktifkan otomatis pada akhir tahun ajaran dan datanya dipseudonimisasi setelah 2 tahun, kecuali masih terikat kewajiban yang belum selesai |
| DP-11 | Akses ke data produksi oleh tim pengembang bersifat *break-glass*: memerlukan persetujuan tertulis Kepala Sekolah, berbatas waktu, dan tercatat pada activity log |

## 28.4 Minimisasi Data pada Fitur AI

| Kode | Requirement |
|---|---|
| DP-AI-01 | Identitas yang dikirim ke penyedia LLM dibatasi pada **peran dan cakupan akses**, bukan identitas langsung. Nama pengguna **tidak** dikirim ke model; sapaan personal dirakit di sisi server setelah jawaban diterima |
| DP-AI-02 | Hasil tool yang dikirim ke model wajib melalui *field allow-list*; field finansial dan data pribadi pengguna lain dihapus sebelum meninggalkan server |
| DP-AI-03 | Untuk pengguna role Siswa/OSIS, tidak ada data pribadi pengguna lain yang boleh masuk ke konteks model dalam bentuk apapun |
| DP-AI-04 | Penyedia LLM dikonfigurasi agar **tidak menggunakan data untuk pelatihan model** apabila tier layanan yang dipakai menyediakan jaminan tersebut; jaminan itu dinyatakan dalam DPA (DP-07). **Pengecualian sejak 2 September 2026 (keputusan pemilik produk):** tier gratis Gemini Developer API diizinkan meskipun isinya dapat dipakai penyedia untuk meningkatkan produknya. Konsekuensi ini **wajib dinyatakan pada Pemberitahuan Privasi** (DP-01) sebelum chatbot aktif, dan berlaku pula atas pertanyaan yang diketik pengguna role Siswa/OSIS |
| DP-AI-05 | Riwayat percakapan yang dihapus pengguna (FR-19.2 A1) menyisakan hanya metrik agregat tanpa isi pesan dan tanpa pengenal pengguna |


> Pengujian keamanan & manajemen kerentanan (Bab 28.5) berada di [`security.md`](security.md).
