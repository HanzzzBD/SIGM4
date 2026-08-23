## Lampiran A — Glosarium

| Istilah | Penjelasan |
|---|---|
| **SIGM4** | Nama sistem sekaligus kode proyek — **S**istem **I**nformasi Mana**g**e**m**ent **4**set (Aset); angka *4* adalah gaya penulisan untuk "Aset" |
| **Sarana dan Prasarana** | Seluruh fasilitas dan aset penunjang kegiatan sekolah yang dikelola SIGM4 |
| **Aset** | Barang sarpras berupa **unit fisik yang dapat diidentifikasi secara individual** dan dipakai berulang tanpa habis — laptop, proyektor, printer, meja, kursi, AC, kamera, mesin praktik. Setiap unit memiliki identitas sendiri (kode aset, QR), lokasi, kondisi, penanggung jawab, riwayat, dan siklus hidup. Domain M-04 |
| **Bahan** | Barang sarpras berupa **persediaan yang dikelola per jumlah dan satuan serta habis saat dipakai** — kertas, tinta, spidol, ATK, bahan kebersihan, bahan praktik. Dikelola sebagai saldo dan transaksi, **bukan** sebagai unit individual. Domain M-22 |
| **Barang sarpras** | Istilah payung netral untuk hal yang mencakup **Aset dan Bahan sekaligus** (mis. Pengadaan Barang M-14). Dipakai hanya bila konteksnya benar-benar lintas-domain; bila konteksnya satu domain, dipakai istilah yang spesifik |
| **Aset serialized** | Pencatatan aset per unit fisik; satu unit = satu record = satu QR Code |
| **Kode aset** | Pengenal unik satu unit aset yang dikenali pengguna (`LAB-KOM-0002`), dihasilkan sistem mengikuti format terkonfigurasi (`BR-002`). Disimpan pada kolom basis data `kode_barang` — nama kolom adalah identifier teknis yang tidak ikut berubah |
| **Saldo bahan** | Jumlah suatu bahan yang tersedia pada satu lokasi penyimpanan, dinyatakan dalam satuannya. Bersifat agregat — tidak ditelusuri per batch/lot |
| **Transaksi bahan** | Satu peristiwa yang mengubah saldo bahan: penerimaan, pengeluaran, penyesuaian, atau hasil stock opname. Saldo selalu merupakan akibat transaksi, tidak pernah disunting langsung |
| **Stok minimum** | Ambang saldo suatu bahan yang bila terlampaui ke bawah memunculkan peringatan pengadaan |
| **Stock Opname** | Pemeriksaan fisik untuk dicocokkan dengan data sistem. Satu sesi hanya mencakup **satu** domain: **Stock Opname Aset** (hitung unit, pindai QR) atau **Stock Opname Bahan** (hitung kuantitas, cocokkan saldo). Domain M-13 |
| **Work Order (WO)** | Perintah kerja pemeliharaan atau perbaikan yang ditugaskan kepada teknisi |
| **Approval Engine** | Mesin persetujuan yang menjalankan aturan persetujuan berjenjang yang dapat dikonfigurasi |
| **Approval Instance** | Satu proses persetujuan yang sedang berjalan atas satu pengajuan |
| **SLA** | *Service Level Agreement* — batas waktu yang disepakati untuk menyelesaikan suatu langkah |
| **RBAC** | *Role-Based Access Control* — pengaturan hak akses berdasarkan peran pengguna |
| **Soft delete** | Penonaktifan data tanpa penghapusan permanen agar riwayat tetap dapat ditelusuri |
| **Deep link** | Tautan yang membuka langsung halaman atau objek tertentu di dalam aplikasi |
| **Tool calling** | Kemampuan model AI memanggil fungsi terdefinisi untuk mengambil data terstruktur |
| **Graceful degradation** | Kemampuan sistem tetap berfungsi meskipun sebagian layanan pendukung terganggu |
| **Idempoten** | Sifat operasi yang menghasilkan efek sama meskipun dipanggil berulang kali |
| **Booking slot** | Satu interval waktu pemesanan atas satu ruangan atau satu unit aset; sumber kebenaran ketersediaan (Bab 26.2) |
| **Exclusion constraint** | Aturan basis data yang menolak dua baris dengan rentang waktu beririsan pada sumber daya yang sama — penegak nol *double-booking* |
| **Idempotency Key** | Pengenal unik yang dikirim klien agar permintaan yang sama tidak dieksekusi dua kali |
| **Distributed lock** | Kunci terpusat agar satu pekerjaan terjadwal hanya dijalankan satu instance |
| **PITR** | *Point-in-Time Recovery* — pemulihan basis data ke titik waktu tertentu |
| **DPA** | *Data Processing Agreement* — perjanjian pemrosesan data dengan pihak ketiga (UU PDP) |
| **PII** | *Personally Identifiable Information* — data yang dapat mengidentifikasi seseorang |
| **Pseudonimisasi** | Penggantian identitas dengan penanda tak-terbalikkan, sementara catatan transaksi dipertahankan |
| **Golden set** | Kumpulan pertanyaan berlabel untuk mengukur akurasi chatbot secara berulang (Bab 22.7) |
| **Prompt injection** | Upaya menyisipkan instruksi ke dalam masukan atau data agar model menyimpang dari perannya |
| **Prompt caching** | Penggunaan ulang bagian statis prompt untuk menekan biaya token |
| **Break-glass** | Prosedur akses darurat berotorisasi ketika jalur normal tidak tersedia (FR-01.6) |
| **SSE** | *Server-Sent Events* — aliran satu arah server ke klien untuk notifikasi real-time |
| **Write-off** | Penghapusan aset dari inventaris aktif melalui persetujuan dan berita acara (M-21) |
| **Scope-cut ladder** | Urutan pemotongan lingkup yang disepakati di muka bila jadwal tertekan (Bab 29.4) |

---

## Lampiran A.1 — Batas domain Aset vs Bahan

Dua domain sarpras yang **tidak boleh disamakan**. Tabel ini adalah panduan domain untuk memilih istilah dan menempatkan requirement — **bukan** alasan menambah fitur yang belum diminta.

| Aspek | Aset | Bahan |
|---|---|---|
| Identitas individual | Ya | Tidak |
| Kode aset / nomor inventaris | Ya | Tidak |
| QR Code | Ya — satu QR per **unit** | Ya — satu QR per **jenis bahan**, bukan per unit |
| Lokasi | Ruangan penempatan | Lokasi penyimpanan (mis. ruangan berjenis `Gudang`) |
| Kondisi | Ya — siklus hidup utama | Tidak dipakai sebagai siklus hidup |
| Penanggung jawab | Ya | Pemohon dan penerima pada transaksi |
| Quantity | Jumlah unit (masing-masing satu record) | **Wajib** — saldo per satuan |
| Satuan | Unit | Rim, pcs, botol, liter, dan sejenisnya |
| Mutasi lokasi | Ya | Bukan konsep utama |
| Maintenance | Ya | Tidak |
| Peminjaman / reservasi | Ya | **Tidak** — bahan hanya diserahkan, tidak dikembalikan |
| Penghapusan | Ya (M-21) | Tidak — memakai pengeluaran, penggunaan, atau penyesuaian |
| Stock opname | Ya — sesi Aset | Ya — sesi Bahan (terpisah) |
| Histori | Riwayat siklus hidup per unit | Riwayat transaksi kuantitas |

**Siklus hidup yang berbeda.**

```text
Aset    Pengadaan → Penerimaan → Registrasi → Penempatan → Pemanfaatan →
        Peminjaman/Reservasi → Kerusakan → Maintenance → Stock Opname Aset →
        Mutasi → Penghapusan

Bahan   Perencanaan → Pengadaan → Penerimaan → Penyimpanan → Permintaan →
        Persetujuan → Pengeluaran/Penyerahan → Penggunaan → Penyesuaian →
        Stock Opname Bahan
```

**Aturan pemilihan istilah.** Bila konteksnya hanya unit fisik individual → **aset**. Bila konteksnya persediaan per jumlah → **bahan**. Bila benar-benar mencakup keduanya → **barang sarpras**. Kata **stock** hanya sah untuk kuantitas persediaan atau proses stock opname — tidak pernah sebagai nama generik seluruh objek sarpras.

**Identifier teknis tidak mengikuti perubahan istilah.** `assets`, `asset_id`, `asset_documents`, `asset_condition`, `kode_barang`, `assets_kode_barang_uq`, `nama_barang`, `resource_type='asset'`, dan permission `asset.*` adalah kontrak sistem yang ditetapkan [`SDD-05`](../../SDD/05-database-design.md) dan [`SDD-03`](../../SDD/03-authorization.md) — nama-nama itu tetap, meskipun istilah bahasa Indonesianya berubah.
