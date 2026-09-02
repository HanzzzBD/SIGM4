## Lampiran F — Catatan Revisi Hasil Audit

Dokumen ini telah melalui audit oleh tim reviewer lintas peran (Product Manager, Business Analyst, Software Architect, Backend Lead, Frontend Lead, Mobile Lead, QA Lead, Security Engineer, DevOps Engineer, AI Engineer). Ringkasan perubahan versi 1.1:

### Bab & lampiran baru

| Bagian | Alasan penambahan |
|---|---|
| **M-21 Penghapusan Aset** | Approval engine, business rules, dan state diagram sudah merujuknya, namun modulnya tidak pernah ada |
| **FR-01.6 Break-Glass Administrator** | Kewajiban 2FA berpotensi mengunci sistem secara permanen |
| **FR-07.5 Blokade Jadwal Tetap** | Tanpa ini kalender ruangan kelas tampak kosong padahal terpakai KBM; SC-05 tidak akan tercapai |
| **FR-09.5 Perpanjangan Peminjaman** | Merupakan jenis pengajuan approval dan memiliki endpoint, namun tanpa spesifikasi |
| **Bab 26 Model Ketersediaan & Konkurensi** | `assets.status` bertipe enum tunggal tidak dapat merepresentasikan ketersediaan berbasis waktu |
| **Bab 27 Deployment & Infrastruktur** | Sebelumnya tidak ada bab operasional sama sekali |
| **Bab 28 Perlindungan Data Pribadi** | Sistem menyimpan data anak di bawah umur dan mengirim konteks ke LLM pihak ketiga |
| **Bab 29 Delivery Plan & Milestone** | Big bang 21 modul tanpa checkpoint terukur |
| **Bab 30 QA & Test Strategy** | Tidak ada strategi pengujian, termasuk untuk risiko tertinggi (konkurensi, kebocoran hak akses) |
| **Bab 31 UI/UX Foundation** | PRD ditujukan ke UI/UX Designer tanpa satupun fondasi desain |
| **Bab 32 Mobile Application Requirements** | Versi aplikasi, media, deep link, dan distribusi store tidak terspesifikasi |
| **Bab 22.7–22.9** | SC-10 tidak dapat diukur; biaya, batas iterasi, dan privasi AI tidak dikendalikan |
| **Lampiran C Katalog Permission** | Bab 17 dan Bab 18 memakai granularitas berbeda dan tidak dapat direkonsiliasi |
| **Lampiran D DSL Approval Rule** | Komponen terkompleks sistem tanpa spesifikasi apapun |
| **Lampiran E Master Data & Kalender** | Satuan waktu tidak konsisten; tahun ajaran dipakai tanpa entitas; akun siswa tanpa siklus hidup |

### Kontradiksi internal yang diselesaikan

| # | Kontradiksi | Penyelesaian |
|---|---|---|
| 1 | FR-08.2 menetapkan aset `Direservasi` saat pengajuan, 15.2 saat approval | BR-005b: `assets.status` hanya berubah saat slot berlaku; ketersediaan dari `booking_slots` |
| 2 | FR-09.2 A1 (`Tidak Tersedia`) vs Bab 12.2 (`Dalam Perbaikan`) | Tabel klarifikasi transisi pada Bab 12.2 |
| 3 | NO-07 online only vs FR-11.2 A2 antrean foto tertunda | MOB-OFF-01/02: data online only, antrean unggah berkas dikecualikan |
| 4 | NT-38 mengirim notifikasi in-app ke pengguna yang tidak dapat login | Penerima diubah ke Administrator penerbit; ditambah NT-38a |
| 5 | FR-09.1 A4 (`loan.direct`) melanggar BR-035 | BR-026a menjadikannya pengecualian sah yang tercatat sebagai anomali |
| 6 | FE-05 menaruh penghapusan aset di future, sementara BR-035 mewajibkannya | Dipindahkan ke dalam lingkup sebagai M-21 |
| 7 | FR-09.1 tanda tangan layar vs FE-10 e-signature sebagai future | Bab 31.6 memisahkan bukti serah terima digital (in-scope) dari e-signature tersertifikasi (future) |
| 8 | QR "URL bertanda tangan" pada label cetak permanen | FR-05.1: URL permanen berbasis UUIDv4; signed URL hanya untuk unduhan berkas |
| 9 | SLA "hari kerja" vs denda "hari kalender" tanpa definisi | Lampiran E.1 mendefinisikan ketiga satuan waktu dan aturan turunannya |
| 10 | `fines` 1:1 dengan `loan` vs pengembalian sebagian per unit | BR-028a: denda diterbitkan per `loan_item` |

### Butir yang naik dari asumsi menjadi keputusan

AS-14 (hosting), AS-16 (basis data → PostgreSQL 15+), serta penambahan AS-15a (akun store berbayar) dan AS-15b (domain HTTPS milik sekolah).

---

**— Akhir Dokumen —**

*PRD ini disusun berdasarkan `Deskripsi.txt` dan 16 keputusan stakeholder yang terkonfirmasi melalui empat batch klarifikasi, kemudian direvisi berdasarkan audit tim reviewer lintas peran (Lampiran F). Penambahan hasil audit bersifat memperjelas, melengkapi, dan menyelesaikan kontradiksi internal — tanpa mengubah satupun dari 16 keputusan kunci, kecuali dua asumsi teknis terbuka (AS-14, AS-16) yang dinaikkan menjadi keputusan arsitektur, dan satu butir Future Enhancement (FE-05) yang dipindahkan ke dalam lingkup karena sudah dirujuk oleh business rules yang berlaku. Setiap perubahan lingkup setelah dokumen ini disetujui dikelola melalui proses change request tertulis.*

---

## Lampiran B — Ringkasan Traceability Kebutuhan

| Fitur dalam `Deskripsi.txt` | Modul PRD | Bab Terkait |
|---|---|---|
| Inventaris Aset | M-04 | 8, 11, 16 |
| QR Code | M-05 | 8, 15 |
| Manajemen Lokasi | M-03 | 8, 11 |
| Reservasi Ruangan | M-07 | 8, 13, 15 |
| Reservasi Aset | M-08 | 8, 13, 15 |
| Peminjaman dan Pengembalian | M-09 | 8, 13, 15 |
| Approval Workflow | M-10 | 8, 12, 15 |
| Laporan Kerusakan | M-11 | 8, 13, 15 |
| Maintenance Management | M-12 | 8, 13 |
| Audit dan Stock Opname | M-13 | 8, 13, 15 |
| Dashboard Monitoring | M-15 | 8, 19 |
| Chatbot AI | M-19 | 8, 15, 22 |
| Notifikasi | M-17 | 8, 20 |
| Activity Log | M-18 | 8, 21 |
| Manajemen User dan Role | M-01, M-02 | 8, 18 |
| Pengadaan Barang | M-14 | 8, 13 |
| Dokumen Aset | M-06 | 8, 11 |
| Statistik dan Analitik | M-16 | 8, 19 |
| *(turunan audit — bukan dari `Deskripsi.txt`)* Penghapusan Aset | M-21 | 8, 10.8a, 26 |
| *(turunan audit terminologi — perubahan lingkup)* Manajemen Bahan | M-22 | 8, 13.5 |

---

## Revisi — Audit Terminologi Domain Aset & Bahan

Audit terminologi atas seluruh PRD dan SDD. Dua hasil: penyeragaman istilah domain Aset, dan pengakuan Bahan sebagai domain kedua.

### Perubahan lingkup

| # | Perubahan | Penyelesaian |
|---|---|---|
| 1 | Target produk mencakup seluruh sarpras, sementara `NO-13` dan `AS-24` mengecualikan barang habis pakai | **Bahan ditarik ke dalam lingkup** sebagai M-22. `NO-13` dan `AS-24` dicoret; `FE-09` dipindahkan ke dalam lingkup mengikuti pola `FE-05` → M-21. Requirement **belum ditulis** — lihat [`bahan-scope-change.md`](01-product/bahan-scope-change.md) |
| 2 | Tidak ada definisi yang membedakan Aset dari Bahan | [Lampiran A.1](00-foundation/glossary.md) menetapkan batas kedua domain beserta siklus hidupnya |
| 3 | Keputusan produk atas model Bahan belum ada | Keputusan Kunci **#17–#26** pada [`decisions.md`](00-foundation/decisions.md) |

### Penyeragaman istilah

| Sebelum | Sesudah | Alasan |
|---|---|---|
| `kode barang` (prosa) | `kode aset` | Merujuk identitas satu unit aset. Kolom `kode_barang` **tidak** berubah |
| M-05 QR Code Barang | **M-05 QR Code** | Melayani dua sasaran: QR per unit aset dan QR per jenis bahan |
| M-08 Reservasi Barang | **M-08 Reservasi Aset** | Yang direservasi adalah unit aset individual |
| M-14 Pengadaan Barang | *(tetap)* | Pengadaan secara domain mencakup Aset **dan** Bahan |
| `unit barang`, `katalog barang`, `ketersediaan barang`, `serah terima barang` | `unit aset`, `katalog aset`, … | Seluruhnya berkonteks unit aset individual |
| — | `barang sarpras` | Istilah payung baru untuk konteks lintas-domain |

**Tidak diubah:** `assets`, `asset_id`, `asset_documents`, `asset_condition`, `kode_barang`, `assets_kode_barang_uq`, `nama_barang`, `resource_type='asset'`, permission `asset.*`, dan endpoint API — seluruhnya identifier teknis yang ditetapkan SDD.

---

## Revisi — Migrasi Penyedia LLM (2 September 2026)

Chatbot M-19 berpindah dari Claude API ke **Google Gemini Developer API — *paid tier*** dengan model `gemini-3.6-flash` (stabil/GA). Keputusan pemilik produk. Rancangan teknisnya di [`SDD-10`](../SDD/10-ai-orchestrator-design.md); yang dicatat di sini hanya baris PRD yang ikut berubah.

### Requirement yang berubah

| ID | Sebelum | Sesudah | Alasan |
|---|---|---|---|
| Bab 22.1 — Model | Claude API, `claude-sonnet-5` | Gemini Developer API paid tier, `gemini-3.6-flash`; alias `latest`, preview, dan eksperimental dilarang; tier gratis dilarang untuk data SIGM4 | Isi tier gratis dapat dipakai penyedia untuk meningkatkan produk — bertabrakan dengan `DP-AI-04` |
| Bab 22.1 — Pola integrasi | Tool calling terhadap API internal | Idem, ditambah penegasan bahwa model hanya **mengusulkan** panggilan tool; backend SIGM4 yang mengeksekusi | Menutup celah *automatic function calling* SDK yang melewati `AuthContext` (`BR-076`) |
| `AI-CTL-02` | Masukan maksimum ±8.000 token | Masukan maksimum ±16.000 token | Ambang prompt caching Gemini 3.x adalah 4.096 token; dengan anggaran lama, awalan statis memakan lebih dari separuh jendela dan riwayat 10 pesan (22.3) tidak lagi muat |
| `AI-SEC-08` | Penyedia dikonfigurasi agar data tidak dipakai melatih model, dinyatakan dalam DPA | Idem, ditambah: syarat hanya terpenuhi pada paid tier, dan penyedia **tidak menjamin residensi data** | Fakta penyedia yang tidak dapat dimitigasi secara teknis; menjadi keputusan sekolah, bukan keputusan teknis |
| `AS-15` · `RS-08` | Akun & biaya Claude API | Akun & biaya Gemini API paid tier | Konsekuensi langsung |
| **`RS-21` (baru)** | — | Prompt dan hasil tool dapat diproses atau di-*cache* di yurisdiksi mana pun | Persetujuan tertulis sekolah menjadi prasyarat `GL-07`; tercatat sebagai `TBD-AI-D`. Bila tidak diberikan, jalur yang tersedia adalah menonaktifkan chatbot lewat `AI-CTL-09` |

**Tidak berubah:** `BR-075` … `BR-079`, seluruh `AI-SEC-01` … `AI-SEC-07`, `DP-AI-01` … `DP-AI-05`, katalog 12 tool 22.3, batas 5 iterasi (`AI-CTL-03`), permission `chat.*`, endpoint `/chat/*`, dan aksi log `CHAT_MESSAGE_SENT`. Migrasi mengganti penyedia, bukan model ancamannya.

### Kontradiksi internal yang diselesaikan

| # | Kontradiksi | Penyelesaian |
|---|---|---|
| 11 | 22.5 butir 2 menyertakan **nama pengguna** ke dalam system prompt dan butir 4 menyuruh model menyapa dengan nama, sementara `DP-AI-01`, 22.3, dan AC `FR-19.1` melarang nama dikirim ke penyedia LLM | Butir 2 dipersempit menjadi **role dan ringkasan cakupan permission**; butir 4 menyatakan model tidak menyapa dengan nama karena tidak menerimanya, dan sapaan personal disisipkan server pada jawaban yang sudah jadi. `DP-AI-01` yang berlaku; 22.5 adalah satu-satunya baris yang menyimpang |

Kontradiksi ini sudah ada sebelum migrasi dan tidak disebabkan olehnya; ia ditemukan saat penelusuran ulang Bab 22 dan diperbaiki di lapisan yang memilikinya.

---

## Revisi — Persetujuan Sekolah & Tier Layanan LLM (2 September 2026)

Dua keputusan pemilik produk pada hari yang sama, dicatat terpisah karena menjawab pertanyaan yang berbeda.

**Pertama — pemrosesan lintas yurisdiksi disetujui.** Surat pernyataan Kepala Sekolah menutup `TBD-AI-D` (`SDD-AI-16`); `GL-07` bagian chatbot terbuka. Rancangan tidak berubah karenanya. Nomor surat **belum dicatat** (TBD) dan wajib dilengkapi sebelum `GL-07` diperiksa.

**Kedua — tier gratis diizinkan.** Sekolah tidak menganggarkan biaya chatbot, dan memilih tier gratis dengan konsekuensinya diterima secara sadar (`SDD-AI-17`).

### Requirement yang berubah

| ID | Sebelum | Sesudah | Alasan |
|---|---|---|---|
| **`DP-AI-04`** | Penyedia LLM **wajib** dikonfigurasi agar tidak memakai data untuk pelatihan model | Kewajiban berlaku **bila tier yang dipakai menyediakan jaminan itu**; tier gratis diizinkan sebagai pengecualian tertulis, dan konsekuensinya wajib dinyatakan pada Pemberitahuan Privasi (`DP-01`) | Keputusan pemilik produk. Ini baris yang menanggung beban — `AI-SEC-08` hanya menerapkannya |
| `AI-SEC-08` | Syarat hanya terpenuhi pada paid tier; tier gratis **dilarang** untuk data SIGM4 apa pun | Tier gratis **diizinkan**, dengan konsekuensi isi percakapan dapat dipakai penyedia untuk meningkatkan produknya | Konsekuensi langsung `DP-AI-04` |
| Bab 22.1 — Model | Tier gratis dilarang | Tier gratis diizinkan; kuota dan batas laju menjadi batasan operasional | Idem |
| `AS-15` | Mengandaikan akun **berbayar** beserta anggarannya | Anggaran **bukan lagi prasyarat**; kuota dan batas laju tier gratis menjadi batasan yang ditanggung `AI-CTL-06` dan `RS-08` | Sekolah tidak menganggarkan chatbot |
| `RS-21` | Mitigasi memuat "paid tier (tanpa pemakaian untuk pelatihan model)" | Mitigasi itu **dicabut**; persetujuan lintas yurisdiksi sudah diberikan sehingga bagian itu tertutup | Mitigasi yang tidak lagi berlaku tidak boleh tetap tertulis seolah berlaku |
| Bab 27.9 — Biaya | Gemini API paid tier: variabel, perlu pemantauan | Nol biaya, terbatas kuota | Idem |

**Tidak berubah:** `DP-AI-01`, `DP-AI-02`, `DP-AI-03`, `DP-AI-05`, `AI-SEC-01` … `AI-SEC-07`, `BR-075` … `BR-079`, katalog 12 tool 22.3, `store: false`, dan batas 5 iterasi. Perubahan tier tidak menyentuh model ancaman: yang berubah adalah apa yang boleh dilakukan penyedia terhadap data yang sampai padanya, bukan data apa yang sampai.

### Yang belum diselesaikan

| Butir | Keadaan |
|---|---|
| Penyaringan PII pada **teks bebas pengguna** | `AI-SEC-02` menyaring nilai field yang kembali lewat hasil tool, bukan pertanyaan yang diketik pengguna. Pengguna yang menyebut namanya sendiri mengirimkannya ke penyedia. Belum ada requirement yang menanganinya — **perlu keputusan pemilik produk** |
| Risiko "isi percakapan dipakai meningkatkan produk penyedia" | Belum punya ID risiko sendiri; kini tercatat hanya sebagai konsekuensi pada `DP-AI-04`. Kandidat `RS-22` — **belum dibuat**, menunggu keputusan |
| `TBD-AI-C` | Tetap terbuka, tetapi objeknya berubah: tanpa tagihan, alarm `OBS-05` perlu diarahkan ke kuota penyedia alih-alih biaya harian (`SDD-15`) |

