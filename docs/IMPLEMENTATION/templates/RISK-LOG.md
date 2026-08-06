# Template Risiko Pelaksanaan

Risiko **produk dan proyek** sudah terdaftar di [`../../PRD/01-product/assumptions-risks.md`](../../PRD/01-product/assumptions-risks.md) dengan ID `RS-xx`. Risiko **teknis** terdaftar pada bagian 6 tiap berkas [SDD](../../SDD/). Keduanya tidak diulang di sini.

Berkas ini untuk **risiko pelaksanaan**: hal yang mengancam jalannya pengerjaan, bukan mengancam produknya. Contoh: cabang berumur panjang, ketergantungan pada pihak luar yang lambat, keputusan yang tak kunjung diambil.

Risiko pelaksanaan yang sudah diketahui saat perencanaan tercatat di bagian 10 tiap berkas phase. Template ini untuk yang **muncul saat pengerjaan berlangsung**.

---

## Bentuk baku

```markdown
| # | Risiko | Kemungkinan | Dampak | Mitigasi | Pemicu | Pemilik | Status |
|:-:|---|:---:|:---:|---|---|---|---|
| R-01 | | T/S/R | T/S/R | | | | Terbuka |
```

| Kolom | Isi |
|---|---|
| **Risiko** | Apa yang mungkin terjadi — bukan apa yang buruk. "Cabang berumur > 1 pekan menumpuk konflik", bukan "kualitas kode menurun" |
| **Kemungkinan** | Tinggi / Sedang / Rendah |
| **Dampak** | Tinggi / Sedang / Rendah |
| **Mitigasi** | Tindakan konkret dengan penanggung jawab, bukan niat |
| **Pemicu** | Tanda yang dapat diamati bahwa risiko mulai terwujud |
| **Pemilik** | Satu orang. Risiko milik bersama adalah risiko tanpa pemilik |
| **Status** | Terbuka / Termitigasi / Terwujud / Tertutup |

**Kolom Pemicu adalah yang membuat daftar ini berguna.** Risiko tanpa pemicu hanya dibaca saat rapat dan tidak pernah mengubah apa pun. Risiko dengan pemicu yang dapat diamati — "ada cabang berumur > 3 hari di papan" — memberi tahu kapan mitigasinya harus dijalankan.

## Aturan

1. **Risiko yang terwujud tidak dihapus.** Statusnya menjadi `Terwujud` dan dicatat apa yang terjadi. Menghapusnya membuang satu-satunya bukti bahwa perkiraan tim meleset ke arah mana.
2. **Mitigasi tanpa penanggung jawab bukan mitigasi.** "Perlu dipantau" bukan mitigasi.
3. **Risiko yang tidak dapat dimitigasi tetap dicatat**, dengan mitigasi bertuliskan "diterima" dan alasannya. Risiko yang diterima secara sadar berbeda dari risiko yang tidak terlihat.
4. **Risiko yang menyentuh produk atau desain dinaikkan**, bukan diselesaikan di sini — ke `RS-xx` pada PRD atau ke bagian 6 berkas SDD terkait.

## Contoh pengisian

| # | Risiko | Kem. | Dmp. | Mitigasi | Pemicu | Pemilik | Status |
|:-:|---|:---:|:---:|---|---|---|---|
| R-01 | TBD kelompok A tak kunjung diputuskan sehingga Phase 02 tidak dapat dimulai | T | T | Ajukan seluruh 12 pertanyaan dalam satu sesi, bukan bertahap; sertakan konsekuensi tiap pilihan | Phase 01 selesai sementara ada TBD kelompok A masih terbuka | Lead Architect | Terbuka |
| R-02 | Cabang berumur panjang pada Phase 03 (enam modul paralel) menumpuk konflik merge | S | S | Batas umur cabang 3 hari; merge harian ke `develop` | Ada cabang berumur > 3 hari di papan | Engineering Manager | Terbuka |
| R-03 | Peninjauan Google Play / App Store lebih lama dari perkiraan sehingga `GL-11` menahan go-live | S | T | Ajukan versi pertama sejak awal Phase 07, bukan menjelang rilis | Phase 07 dimulai tanpa pengajuan store terkirim | Mobile Lead | Terbuka |
| R-04 | Pendataan aset tertinggal sehingga `GL-08` (≥95%) tidak tercapai | S | T | `IMP-01` — mulai bertahap per gedung sejak Phase 03; laporkan persentase mingguan | Akhir Phase 04 dengan cakupan < 50% | Petugas Sarpras | Terbuka |
| R-05 | Baseline `IMP-04` terlewat sebelum sistem dipakai | R | T | Masukkan ke gerbang keluar Phase 07 sebagai butir yang menghalangi, bukan sebagai catatan | Phase 07 mendekati selesai tanpa angka baseline tercatat di log | Business Analyst | Terbuka |

Contoh di atas bukan daftar risiko proyek — ia menunjukkan bentuk pengisian. Daftar sesungguhnya tumbuh selama pengerjaan.

## Di mana daftar risiko yang berjalan disimpan

Pada bagian 7 log phase ([`../logs/phase-NN.md`](../logs/)), bersama masalah yang ditemukan. Risiko yang melintasi beberapa phase dicatat di log phase tempat ia pertama muncul, dan dirujuk dari log berikutnya — bukan disalin.

---

*Berkas ini adalah template. Risiko produk tetap milik [`assumptions-risks.md`](../../PRD/01-product/assumptions-risks.md); risiko teknis tetap milik bagian 6 tiap berkas [SDD](../../SDD/).*
