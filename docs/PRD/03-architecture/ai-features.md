# 22. AI Features

## 22.1 Ringkasan Fitur AI

Sistem memiliki **satu fitur AI**, yaitu **Chatbot Asisten SIGM4** — asisten percakapan berbasis LLM yang membantu pengguna memperoleh informasi sarana prasarana melalui bahasa alami. Fitur ini bersifat **read-only** dan tidak diberi kemampuan mengubah data apa pun.

| Aspek | Ketentuan |
|---|---|
| **Model** | **Google Gemini Developer API — *tier gratis* sejak 2 September 2026** (keputusan pemilik produk, `DP-AI-04`) dengan model `gemini-3.6-flash` (versi stabil/GA) sebagai model utama; dapat dikonfigurasi Administrator **di antara model stabil/GA saja**. Alias `latest`, versi *preview*, dan versi eksperimental dilarang karena siklus hidupnya tidak menjamin perilaku tetap. Konsekuensi tier gratis: isi percakapan dapat dipakai penyedia untuk meningkatkan produknya, dan kuota serta batas laju penyedia menjadi batasan operasional — bukan biaya. Paid tier tidak dilarang; tier adalah keputusan sekolah, bukan syarat rancangan (`SDD-AI-17`) |
| **Pola integrasi** | Tool calling (function calling) terhadap API internal, bukan pengiriman seluruh basis data ke model. Model hanya **mengusulkan** panggilan tool; yang menjalankannya adalah backend SIGM4, bukan SDK penyedia (BR-076) |
| **Sifat akses** | Read-only, difilter permission pengguna pada lapisan query |
| **Bahasa** | Bahasa Indonesia |
| **Ketersediaan** | Web dan mobile; gangguan layanan LLM tidak memengaruhi modul lain |

## 22.2 Use Case

| Kode | Use Case | Contoh Pertanyaan Pengguna |
|---|---|---|
| AI-UC-01 | Mencari lokasi aset | "Di mana proyektor Epson yang masih bagus?" |
| AI-UC-02 | Memeriksa ketersediaan aset | "Ada berapa laptop yang bisa dipinjam minggu depan?" |
| AI-UC-03 | Memeriksa jadwal ruangan | "Apakah aula kosong hari Jumat siang?" |
| AI-UC-04 | Memeriksa status peminjaman pribadi | "Kapan saya harus mengembalikan kamera?" |
| AI-UC-05 | Memeriksa status pengajuan | "Bagaimana status pengajuan reservasi lab saya?" |
| AI-UC-06 | Memeriksa denda pribadi | "Apakah saya punya denda yang belum dibayar?" |
| AI-UC-07 | Memeriksa kondisi & riwayat aset | "Berapa kali proyektor lab 2 pernah diperbaiki?" |
| AI-UC-08 | Memeriksa status laporan kerusakan | "Bagaimana tindak lanjut laporan AC ruang guru?" |
| AI-UC-09 | Panduan penggunaan sistem | "Bagaimana cara mengajukan peminjaman aset?" |
| AI-UC-10 | Ringkasan operasional (role berwenang) | "Berapa aset yang terlambat dikembalikan bulan ini?" |

## 22.3 Input

| Jenis Input | Sumber | Keterangan |
|---|---|---|
| **Pertanyaan pengguna** | Pengguna | Teks bahasa alami, maksimum 500 karakter per pesan |
| **Konteks identitas** | Sistem | **Role dan cakupan permission saja** — disuntikkan server, **tidak pernah** dari klien. Nama dan pengenal pribadi pengguna **tidak dikirim** ke penyedia LLM; sapaan personal dirakit di sisi server setelah jawaban diterima (DP-AI-01) |
| **Riwayat percakapan** | Sistem | Maksimum 10 pesan terakhir dalam sesi, untuk menjaga konteks |
| **Hasil tool** | Sistem | Data terstruktur hasil query yang sudah difilter permission |
| **Waktu & tanggal sistem** | Sistem | Agar pertanyaan relatif ("besok", "minggu depan") dapat dijawab tepat |

### Definisi Tool yang Tersedia bagi Model

| Tool | Fungsi | Parameter Utama | Batasan |
|---|---|---|---|
| `search_assets` | Mencari aset berdasarkan nama, kategori, kondisi, lokasi | kata_kunci, kategori, kondisi, lokasi, hanya_dapat_dipinjam | Hasil difilter cakupan role; field finansial dihapus untuk role tanpa hak |
| `get_asset_detail` | Detail satu aset beserta riwayat singkat | kode_barang atau uuid | Field sensitif dihapus sesuai permission |
| `check_asset_availability` | Ketersediaan unit pada rentang tanggal | kategori/nama, tanggal_mulai, tanggal_selesai | Memperhitungkan reservasi & peminjaman aktif |
| `get_room_schedule` | Jadwal penggunaan ruangan | ruangan, tanggal_mulai, tanggal_selesai | Siswa hanya menerima status terpakai/kosong tanpa identitas pemohon |
| `get_my_loans` | Peminjaman aktif & riwayat milik pengguna | status | Hanya data milik pengguna yang bertanya |
| `get_my_requests` | Status pengajuan milik pengguna | jenis, status | Hanya data milik pengguna yang bertanya |
| `get_my_fines` | Denda milik pengguna | status | Hanya data milik pengguna yang bertanya |
| `get_damage_report_status` | Status tiket kerusakan | nomor_tiket atau kode_barang | Pelapor hanya melihat tiketnya sendiri |
| `get_operational_summary` | Ringkasan agregat operasional | jenis_ringkasan, periode | **Hanya** untuk role Administrator, Petugas Sarpras, dan Pimpinan Sekolah |
| `get_material_stock` | Saldo bahan per lokasi penyimpanan | nama_bahan atau kategori, lokasi | Saldo agregat saja; tidak menampilkan riwayat transaksi maupun identitas peminta. Tersedia sejak M-22 aktif |
| `get_low_stock_materials` | Bahan yang saldonya di bawah stok minimum | kategori, lokasi | Difilter cakupan role; role tanpa hak atas M-22 menerima hasil kosong. Tersedia sejak M-22 aktif |
| `get_help_article` | Panduan penggunaan fitur | topik | Konten statis, tidak menyentuh data operasional |

**Dua tool berdomain Bahan ditambahkan 25 Agustus 2026** (menutup `TBD-BHN-E`). Keduanya menjaga kesejajaran Bahan dengan Aset yang Keputusan #17 dan `UXD-16` tetapkan: pengguna yang dapat menanyakan ketersediaan aset dapat menanyakan saldo bahan dengan cara yang sama, tanpa mempelajari pola kedua. Keduanya **read-only** seperti seluruh tool lain (`BR-075`), dan **diimplementasikan pada Phase 05** bersama M-22 — katalog Phase 03 dibangun tanpa keduanya. Penambahannya membatalkan prompt cache satu kali pada rilis itu dan memicu evaluasi ulang `AI-EV-04`.

## 22.4 Output

| Aspek | Ketentuan |
|---|---|
| **Format** | Teks Bahasa Indonesia yang ringkas, disertai daftar bila menyebut lebih dari tiga item |
| **Rujukan data** | Setiap fakta yang berasal dari basis data wajib menyertakan pengenal konkret (kode aset, nama ruangan, nomor transaksi) |
| **Tautan aksi** | Jawaban menyertakan *deep link* ke halaman detail atau form yang relevan |
| **Penanganan data kosong** | Menyatakan data tidak ditemukan secara eksplisit; dilarang mengarang |
| **Penolakan aksi tulis** | Menyatakan keterbatasannya dan mengarahkan ke menu yang tepat |
| **Panjang jawaban** | Maksimum ± 200 kata, kecuali pengguna meminta rincian |
| **Umpan balik** | Setiap jawaban dapat dinilai 👍/👎 oleh pengguna untuk evaluasi kualitas |

**Contoh keluaran:**

> Ada **3 unit proyektor** yang tersedia untuk dipinjam pada 6–7 Agustus 2026:
> 1. `AV-PRJ-0002` — Epson EB-X51, kondisi Baik, Gudang AV
> 2. `AV-PRJ-0005` — Epson EB-X51, kondisi Baik, Lab Komputer 1
> 3. `AV-PRJ-0007` — BenQ MS550, kondisi Rusak Ringan, Gudang AV
>
> Untuk memesan, silakan buka [Reservasi Aset](/reservations/new?category=proyektor).

## 22.5 Prompt Strategy

**Struktur system prompt (disusun server pada setiap permintaan):**

1. **Peran & cakupan** — "Anda adalah asisten Sistem SIGM4 di {nama sekolah}. Anda membantu pengguna memperoleh informasi mengenai aset, ruangan, peminjaman, dan pengajuan."
2. **Konteks pengguna** — **role dan ringkasan cakupan permission** pengguna yang sedang bertanya. Nama dan pengenal pribadi **tidak** disertakan (DP-AI-01, 22.3).
3. **Batasan mutlak** —
   - Hanya boleh menjawab berdasarkan hasil tool; dilarang menebak atau mengarang data.
   - Dilarang melakukan atau menjanjikan aksi tulis apa pun.
   - Dilarang menyebutkan data yang tidak dikembalikan oleh tool.
   - Bila hasil tool kosong, nyatakan bahwa data tidak ditemukan.
4. **Gaya bahasa** — Bahasa Indonesia yang sopan, ringkas, dan tidak berbelit. Model **tidak** menyapa dengan nama, karena ia tidak menerimanya; sapaan personal disisipkan server pada jawaban yang sudah jadi (DP-AI-01).
5. **Aturan format** — gunakan daftar bernomor untuk lebih dari tiga item; selalu sertakan kode aset atau nomor transaksi sebagai rujukan; sertakan tautan aksi bila tersedia.
6. **Penanganan di luar cakupan** — bila pertanyaan berada di luar domain sarana prasarana, nyatakan dengan sopan dan arahkan ke Petugas Sarana Prasarana.
7. **Konteks waktu** — tanggal dan waktu sistem saat ini agar pertanyaan relatif dapat dihitung.

**Prinsip rekayasa prompt:**

| Prinsip | Penerapan |
|---|---|
| **Keamanan tidak bergantung pada prompt** | Pembatasan hak akses ditegakkan pada lapisan tool dan query SQL. Prompt hanyalah lapisan tambahan, bukan pengaman utama. |
| **Tool-first** | Model tidak menerima *dump* data; ia meminta data melalui tool sesuai kebutuhan pertanyaan. |
| **Konteks minimum** | Hanya 10 pesan terakhir yang dikirim, untuk menekan konsumsi token dan menjaga fokus. |
| **Jawaban berbasis bukti** | Model diinstruksikan selalu merujuk pengenal data konkret sehingga jawaban dapat diverifikasi pengguna. |
| **Ketahanan terhadap prompt injection** | Masukan pengguna diperlakukan sebagai data, bukan instruksi; instruksi sistem tidak dapat ditimpa oleh isi pesan pengguna. |
| **Evaluasi berkelanjutan** | Umpan balik 👍/👎 dan daftar pertanyaan yang gagal dijawab dipakai untuk menyempurnakan prompt dan cakupan tool. |

## 22.6 Limitation

| Kode | Keterbatasan | Mitigasi |
|---|---|---|
| AI-L-01 | Chatbot tidak dapat melakukan aksi tulis (membuat reservasi, menyetujui, mengubah data) | Menolak dengan sopan dan menyediakan tautan ke form yang tepat |
| AI-L-02 | Kualitas jawaban bergantung pada kelengkapan dan kemutakhiran data inventaris | Sosialisasi disiplin pencatatan; chatbot menyatakan bila data tidak ditemukan |
| AI-L-03 | Risiko halusinasi tetap ada meskipun kecil | Instruksi tool-first, kewajiban merujuk pengenal data, dan evaluasi berkala melalui umpan balik pengguna |
| AI-L-04 | Bergantung pada ketersediaan layanan LLM pihak ketiga | *Graceful degradation*: chatbot dinonaktifkan sementara, modul lain tetap berjalan normal |
| AI-L-05 | Setiap pemakaian mengonsumsi kuota token penyedia; pada tier berbayar juga menimbulkan biaya | Batas percakapan harian per pengguna yang dapat dikonfigurasi; konteks dibatasi 10 pesan |
| AI-L-06 | Tidak memahami pertanyaan di luar domain sarana prasarana | Menyatakan keterbatasannya dan mengarahkan ke pihak yang tepat |
| AI-L-07 | Tidak dapat mengakses dokumen berformat gambar atau PDF hasil pindaian | Chatbot mengarahkan pengguna membuka dokumen aset secara langsung |
| AI-L-08 | Latensi jawaban lebih tinggi dibanding pencarian biasa (hingga 8 detik) | Indikator pemrosesan; pencarian manual tetap tersedia sebagai alternatif |
| AI-L-09 | Tidak boleh dijadikan dasar tunggal keputusan resmi (audit, penghapusan aset) | Keputusan resmi wajib merujuk laporan sistem dan berita acara, bukan jawaban chatbot |
| AI-L-10 | Riwayat percakapan menyimpan pertanyaan pengguna | Retensi 90 hari, akses terbatas, dan tidak memuat data di luar hak akses penanya |
| AI-L-11 | Model dapat memanggil tool berulang tanpa batas alami | Batas iterasi tool per pesan (AI-CTL-03) |
| AI-L-12 | Data yang diisi pengguna (nama aset, keterangan) dapat memuat instruksi tersembunyi | Mitigasi *data-borne prompt injection* (22.9) |

## 22.7 Evaluasi & Penjaminan Kualitas AI

SC-10 menargetkan akurasi ≥ 85%, namun sebelumnya tidak ada cara mengukurnya. Sub-bab ini menjadikan target tersebut dapat dibuktikan.

| Kode | Requirement |
|---|---|
| AI-EV-01 | Disusun **golden set** minimal **100 pertanyaan** berlabel, mencakup seluruh use case AI-UC-01…10, dengan distribusi merata antar-role dan menyertakan pertanyaan di luar cakupan serta pertanyaan yang seharusnya ditolak |
| AI-EV-02 | Setiap butir golden set memiliki jawaban acuan dan **daftar pengenal data yang wajib muncul** (kode aset, nomor transaksi, nama ruangan) |
| AI-EV-03 | Rubrik penilaian empat dimensi: **kebenaran fakta**, **kelengkapan**, **kepatuhan hak akses**, dan **kepatuhan format** (menyertakan rujukan & tautan). Jawaban dinilai benar hanya bila keempatnya terpenuhi |
| AI-EV-04 | Evaluasi dijalankan otomatis pada setiap perubahan *system prompt*, definisi tool, atau model. Penurunan akurasi > 5% dibanding basis sebelumnya adalah penghambat rilis |
| AI-EV-05 | **Uji kebocoran hak akses**: setiap pertanyaan golden set dijalankan untuk ketujuh role; jawaban yang memuat data di luar hak akses role tersebut dihitung sebagai **kegagalan kritis**, bukan sekadar penurunan akurasi. Target: **nol** kebocoran (PO-08) |
| AI-EV-06 | Pertanyaan yang memperoleh umpan balik 👎 dan pertanyaan yang gagal dijawab ditinjau berkala dan menjadi kandidat penambahan golden set |
| AI-EV-07 | Hasil evaluasi terakhir ditampilkan pada menu Monitoring Chatbot (FR-19.2) sebagai bukti pemenuhan SC-10 |

## 22.8 Kendali Kuota, Performa & Keandalan

| Kode | Requirement |
|---|---|
| AI-CTL-01 | **Prompt caching** diaktifkan atas bagian statis dari system prompt (peran, batasan, aturan format, definisi tool). Hanya konteks pengguna dan riwayat yang berubah per permintaan. Ini menekan pemrosesan ulang awalan pada setiap permintaan — langsung menekan latensi (AI-CTL-07), dan pada tier berbayar menekan tarif token; memitigasi RS-08 |
| AI-CTL-02 | **Anggaran token per pesan** ditetapkan: masukan maksimum ±16.000 token, keluaran maksimum ±1.000 token. Melebihi batas, konteks riwayat dipangkas dari yang terlama. Batas masukan dinaikkan dari ±8.000 pada 2 September 2026 karena ambang caching model (SDD-10) menuntut prefiks statis yang lebih panjang; tanpa kenaikan itu jendela 10 pesan tidak lagi muat |
| AI-CTL-03 | **Batas iterasi tool: maksimum 5 panggilan per pesan pengguna.** Setelah batas tercapai, model wajib menjawab dengan data yang telah diperoleh atau menyatakan tidak dapat menjawab |
| AI-CTL-04 | **Timeout**: 20 detik per panggilan ke penyedia LLM; 5 detik per eksekusi tool. Melewati batas → jalur *fallback* (FR-19.1 A4) |
| AI-CTL-05 | **Retry**: maksimum 2 percobaan ulang untuk galat sementara (429, 5xx) dengan *exponential backoff*; galat permanen tidak diulang |
| AI-CTL-06 | **Rate limit per pengguna: 10 pesan per menit**, melengkapi batas harian yang sudah ada, agar kuota harian tidak habis dalam satu menit dan sistem tidak terbebani |
| AI-CTL-07 | **Streaming respons** diaktifkan agar jawaban tampil bertahap; ini membuat latensi hingga 8 detik (AI-L-08) terasa responsif, bukan menggantung |
| AI-CTL-08 | Penggunaan token per pengguna dan konsumsi kuota penyedia dicatat dan ditampilkan pada Dashboard Administrator, dengan alarm bila melewati ambang (OBS-05). Sejak tier gratis diizinkan (DP-AI-04) tidak ada biaya harian yang diambang-batasi; yang dipantau adalah kuota dan batas laju penyedia |
| AI-CTL-09 | Administrator dapat menonaktifkan chatbot sepenuhnya melalui parameter sistem tanpa memengaruhi modul lain (NFR-A-05) |
| AI-CTL-10 | Kegagalan layanan LLM tidak pernah menghasilkan galat pada modul lain; kartu chatbot menampilkan status gangguan (OBS-06) |

## 22.9 Privasi & Ketahanan terhadap Injeksi

| Kode | Requirement |
|---|---|
| AI-SEC-01 | **Pemisahan kanal instruksi dan data.** Hasil tool disisipkan ke konteks sebagai blok data bertanda jelas, disertai instruksi eksplisit bahwa isi blok tersebut adalah **data yang harus dilaporkan, bukan perintah yang harus dijalankan** |
| AI-SEC-02 | **Mitigasi *data-borne prompt injection***: nilai field yang diisi pengguna (nama aset, deskripsi kerusakan, keperluan reservasi, keterangan opname) dapat memuat instruksi tersembunyi. Nilai tersebut disanitasi dari pola instruksi dan dibatasi panjangnya sebelum masuk konteks. Uji ketahanan atas hal ini wajib termasuk dalam red-teaming (ST-06) |
| AI-SEC-03 | **Allow-list field**: hasil tool disaring field-nya sebelum meninggalkan server; field finansial, data pribadi pengguna lain, dan path berkas tidak pernah dikirim ke penyedia LLM (DP-AI-02) |
| AI-SEC-04 | Model tidak pernah diberi kredensial, token, maupun kemampuan memanggil endpoint tulis. Ketiadaan tool tulis adalah pengaman utamanya, bukan instruksi prompt (BR-075) |
| AI-SEC-05 | Instruksi sistem tidak dapat ditimpa oleh isi pesan pengguna; percobaan menimpa dicatat sebagai anomali dan ditinjau |
| AI-SEC-06 | Untuk pengguna role Siswa/OSIS, berlaku pembatasan tambahan: tidak ada data pribadi pengguna lain dalam bentuk apapun yang masuk ke konteks model (DP-AI-03) |
| AI-SEC-07 | **Moderasi**: percakapan yang memuat konten tidak pantas atau percobaan penyalahgunaan berulang ditandai, dan pengguna yang bersangkutan dapat dibatasi aksesnya ke chatbot oleh Administrator |
| AI-SEC-08 | Penyedia LLM dikonfigurasi agar data tidak digunakan untuk pelatihan model **bila tier yang dipakai menyediakan jaminan itu**, dinyatakan dalam DPA (DP-AI-04). Pada Gemini Developer API jaminan tersebut hanya ada di paid tier; **tier gratis diizinkan sejak 2 September 2026** dengan konsekuensi isi percakapan dapat dipakai penyedia untuk meningkatkan produknya. Penyedia **tidak menjamin residensi data** — pemrosesan lintas yurisdiksi disetujui sekolah 2 September 2026 (`TBD-AI-D` tertutup, `RS-21`) |

---
