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

---
