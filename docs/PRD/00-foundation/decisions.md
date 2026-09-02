# Product Requirements Document (PRD)
## SIGM4 — Sistem Informasi Management 4set · Sarana dan Prasarana Sekolah

| Item | Keterangan |
|---|---|
| **Nama Produk** | SIGM4 — **S**istem **I**nformasi Mana**g**e**m**ent **4**set (Aset) |
| **Kode Proyek** | SIGM4 |
| **Ruang Lingkup** | Sarana dan prasarana sekolah |
| **Versi Dokumen** | 1.1 — direvisi berdasarkan audit tim reviewer lintas peran (lihat Lampiran F) |
| **Tanggal** | 5 Agustus 2026 |
| **Status** | Approved for Development |
| **Penyusun** | Product Manager / Business Analyst |
| **Sumber Kebutuhan** | `Deskripsi.txt` + hasil klarifikasi stakeholder (4 batch) |
| **Ditujukan Untuk** | UI/UX Designer, Software Architect, Backend/Frontend/Mobile Developer, QA |

### Ringkasan Keputusan Kunci (Hasil Klarifikasi)

Seluruh keputusan berikut telah dikonfirmasi oleh stakeholder dan menjadi dasar mengikat bagi PRD ini.

| # | Aspek | Keputusan |
|---|---|---|
| 1 | Tenancy | **Single sekolah** — satu instansi sistem melayani satu sekolah. Tidak ada konsep multi-tenant. |
| 2 | Platform | **Web responsive + Mobile App native** (Android & iOS) |
| 3 | Tech Stack | **Web:** Express (Node.js) + React. **Mobile:** React Native |
| 4 | Approval Workflow | **Configurable** per jenis pengajuan dan nilai/kondisi (rule engine) |
| 5 | Chatbot AI | **LLM + akses data via tools/RAG** (read-only terhadap data, tidak melakukan aksi tulis) |
| 6 | Kanal Notifikasi | **In-app notification** + **Push notification mobile (FCM)**. Tidak ada email/WhatsApp. |
| 7 | Autentikasi | **Email + password lokal**, dikelola Administrator, dengan reset password, password policy, dan 2FA untuk role sensitif |
| 8 | Pemohon Reservasi/Peminjaman | **Guru, Staf/Tata Usaha, dan Siswa/OSIS** (siswa memiliki akun terbatas) |
| 9 | Granularitas Aset | **Per unit (serialized)** — 1 unit fisik = 1 record = 1 QR Code unik |
| 10 | Kodefikasi & Penyusutan | **Kode internal sekolah** yang dapat dikonfigurasi. **Tanpa** perhitungan penyusutan otomatis. |
| 11 | Pengadaan | Alur sederhana **Usulan → Approval → Penerimaan**. Tanpa modul vendor/Purchase Order. |
| 12 | Keterlambatan Pengembalian | **Denda nominal per hari** dengan pencatatan status pembayaran |
| 13 | Strategi Rilis | **Big bang** — seluruh modul dirilis sekaligus. PRD tidak memuat prioritas rilis/fase. |
| 14 | Skala Target | **± 5.000 unit aset**, hingga **1.000 pengguna**, **100–150 concurrent user** pada jam sibuk |
| 15 | Mode Offline Mobile | **Online only** — seluruh fitur mobile membutuhkan koneksi internet |
| 16 | Pelaksana Maintenance | **Teknisi internal sekolah saja**. Tidak ada master data vendor/pihak ketiga. |
| 17 | Domain Sarpras | **Dua domain terpisah dan tidak boleh disamakan: Aset dan Bahan.** Aset = unit fisik ber-identitas individual; Bahan = persediaan yang dikelola per jumlah dan satuan. Batas lengkap: [Lampiran A.1](glossary.md) |
| 18 | Lingkup Bahan | **Bahan masuk lingkup rilis ini** sebagai **M-22 Manajemen Bahan**. `NO-13` dan `AS-24` dicabut; `FE-09` ditarik dari future ke dalam lingkup |
| 19 | Model Bahan | **Saldo agregat** per bahan per lokasi penyimpanan. **Tanpa** batch/lot dan **tanpa** tanggal kedaluwarsa. Saldo selalu akibat transaksi, tidak pernah disunting langsung |
| 20 | Stok Minimum Bahan | **Ada**, beserta peringatan: saldo di bawah ambang memunculkan alert dan notifikasi kepada Petugas Sarpras |
| 21 | Pengeluaran Bahan | Permintaan bahan melewati **approval berbasis ambang** yang dikonfigurasi Administrator lewat M-10 — bukan approval wajib untuk setiap pengeluaran |
| 22 | Peminjaman Bahan | **Tidak ada.** Bahan hanya **diserahkan** dan tidak dikembalikan; M-08 dan M-09 tetap murni domain Aset, termasuk denda keterlambatan (`BR-028`) |
| 23 | QR Bahan | QR melekat pada **jenis bahan**, bukan unit individual. M-05 melayani dua sasaran (QR Aset per unit, QR Bahan per jenis) dan karena itu bernama **M-05 QR Code** tanpa kualifikasi domain |
| 24 | Stock Opname | M-13 memiliki **dua jenis sesi terpisah**: Stock Opname Aset (hitung unit, pindai QR) dan Stock Opname Bahan (hitung kuantitas, cocokkan saldo). Satu sesi hanya mencakup satu domain |
| 25 | Bahan Praktik | Bahan praktik/praktikum (komponen, bahan kimia lab) diperlakukan sebagai **Bahan**. Alat praktik yang tahan lama tetap **Aset** |
| 26 | Penempatan M-22 | Modul Bahan dikerjakan pada **Phase 05**, setelah lokasi, approval, QR, pengadaan, dan opname tersedia |
| 27 | Pengadaan Bahan | Satu alur pengadaan untuk kedua domain. Setiap baris item usulan menyatakan **jenisnya (Aset atau Bahan)**. Item berjenis Aset menghasilkan record aset per unit (`BR-064`); item berjenis Bahan **menambah saldo** lewat transaksi penerimaan bahan, bukan record aset. Menutup `TBD-BHN-A` |
| 28 | Milestone M-22 | Masuk **`M4`**, yang diperluas dari *Kontrol & Siklus Hidup Aset* menjadi **Kontrol & Siklus Hidup Sarpras** — sejalan dengan penempatan Phase 05 yang menutup `M4` |
| 29 | Residensi Data & Kepatuhan | **Kepatuhan formal terbatas pada UU PDP No. 27/2022** — tidak ada standar dinas pendidikan atau yayasan tambahan. Menyertainya satu batasan mengikat: **seluruh data sistem, termasuk log aplikasi dan cadangan, wajib berada pada wilayah Indonesia**. Batasan ini berlaku bagi setiap layanan pihak ketiga yang menerima data dan menjadi kriteria seleksi, bukan pemeriksaan sesudahnya. Menutup `TBD-SEC-B` · `SDD-SEC-10` |

---
