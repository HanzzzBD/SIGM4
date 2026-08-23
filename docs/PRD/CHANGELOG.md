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
