# Perubahan Lingkup — Domain Bahan (M-22)

> **Status: lapisan PRD selesai (Gate 1).** Requirement Bahan sudah ditulis pada
> [`../02-modules/m22-materials.md`](../02-modules/m22-materials.md) — `FR-22.1`…`FR-22.7`,
> `BR-080`…`BR-092`, `NT-49`…`NT-51`, permission `material.*`, dan 6 entitas.
> Berkas ini bukan sumber requirement; ia mencatat **keputusan pemilik produk**, berkas terdampak,
> dan pekerjaan lapisan turunan yang belum selesai (SDD, UX, IMPLEMENTATION — lihat §5.3 dan §5.5).

## 1. Konflik yang memicu perubahan

| | |
|---|---|
| **Target produk** | SIGM4 mengelola **seluruh** sarana-prasarana sekolah — secara konseptual mencakup Aset dan Bahan |
| **Lingkup PRD v1.1** | Hanya **aset tetap serialized**. Bahan dikecualikan `NO-13` dan `AS-24`, ditunda `FE-09` |
| **Akibat** | Separuh domain sarpras tidak memiliki pengelolaan, sementara PRD tidak pernah menyangkal bahwa Bahan adalah sarpras — yang ada hanyalah batas lingkup |

Ditemukan pada audit terminologi Aset vs Bahan. Diputuskan pemilik produk: **Bahan masuk lingkup rilis yang sedang berjalan.**

## 2. Keputusan yang mengikat

Tercatat sebagai Keputusan Kunci **#17–#26** pada [`decisions.md`](../00-foundation/decisions.md). Ringkasnya:

| Aspek | Keputusan |
|---|---|
| Domain | Aset dan Bahan adalah dua domain terpisah — [Lampiran A.1](../00-foundation/glossary.md) |
| Lingkup | Bahan masuk rilis ini sebagai **M-22 Manajemen Bahan** |
| Model saldo | Agregat per bahan per lokasi penyimpanan; **tanpa** batch/lot dan **tanpa** expiry |
| Stok minimum | Ada, beserta alert dan notifikasi |
| Approval | Permintaan bahan melewati approval **berbasis ambang** lewat M-10 |
| Peminjaman | Tidak ada — bahan hanya diserahkan |
| QR | Per **jenis bahan**, bukan per unit |
| Stock opname | M-13 memiliki dua jenis sesi terpisah: Aset dan Bahan |
| Bahan praktik | Diperlakukan sebagai Bahan |
| Phase | **Phase 05** |
| Pengadaan | Satu alur untuk kedua domain; `procurement_items` memperoleh kolom `jenis` (#27) |
| Milestone | **`M4`**, diperluas menjadi *Kontrol & Siklus Hidup Sarpras* (#28) |

## 3. Keputusan lingkup yang dicabut

| ID | Berkas | Perlakuan |
|---|---|---|
| `NO-13` | [`overview.md`](overview.md) | Dicoret; ditarik ke dalam lingkup sebagai M-22 |
| `AS-24` | [`assumptions-risks.md`](assumptions-risks.md) | Dicoret dan dicabut |
| `FE-09` | [`future-enhancements.md`](future-enhancements.md) | Dicoret; dipindahkan ke dalam lingkup — mengikuti pola `FE-05` → M-21 |
| Halaman "Barang Habis Pakai" | [`UX/DECISIONS.md`](../../UX/DECISIONS.md) | Larangan dicabut; halaman Bahan masuk lingkup |

## 4. Model domain yang harus ditulis

```text
Bahan                          Aset  (tidak berubah)
  ↓                              ↓
Saldo per lokasi               Lifecycle
  ↓                              ├── Penempatan
Transaksi Bahan                  ├── Mutasi
  ├── Penerimaan                 ├── Peminjaman
  ├── Pengeluaran                ├── Maintenance
  ├── Penyesuaian                ├── Audit
  └── Stock Opname               └── Penghapusan
```

**Larangan model.** Bahan **tidak boleh** dimodelkan sebagai `assets.quantity` atau sebagai baris `assets`. Saldo adalah akibat transaksi, bukan kolom yang disunting. `assets` tetap murni serialized per unit (`BR-001`).

## 5. Pekerjaan penulisan yang belum dilakukan

### 5.1 Modul baru

`02-modules/m22-materials.md` — modul self-contained 15 bagian sesuai pola modul lain. Rentang ID yang **tersedia** (belum terpakai):

| Jenis | Rentang usulan | Terpakai tertinggi saat ini |
|---|---|---|
| Functional Requirement | ✅ `FR-22.1`…`FR-22.7` | — |
| Business Rule | ✅ `BR-080`…`BR-092` (M-22) · `BR-093`…`BR-095` (M-13) | — |
| Notifikasi | ✅ `NT-49`…`NT-51` | — |
| Aksi activity log | ✅ `MATERIAL_*` — `AL-xx` adalah prinsip log, bukan ID aksi per modul | — |
| Permission | ✅ `material.*` (7 kode) | — |

Cakupan FR yang diturunkan dari keputusan #17–#26: master bahan & kategori, saldo dan lokasi penyimpanan, penerimaan, permintaan, persetujuan, pengeluaran/penyerahan, penyesuaian, stok minimum & alert, QR per jenis bahan, laporan riwayat transaksi.

### 5.2 Modul terdampak

| Modul | Penyesuaian yang diperlukan |
|---|---|
| **M-03 Lokasi** | Menyatakan ruangan berjenis `Gudang` dapat menjadi lokasi penyimpanan bahan |
| **M-05 QR Code** | Menyatakan dua sasaran QR secara eksplisit — per unit aset dan per jenis bahan |
| **M-10 Approval** | Menambah `jenis_pengajuan` **Permintaan Bahan**; variabel DSL untuk ambang (jumlah/nilai) |
| **M-13 Stock Opname** | Menambah jenis sesi Bahan; `BR-054`…`BR-059` perlu dinyatakan berlaku untuk sesi **Aset**, dengan BR baru untuk sesi Bahan |
| **M-14 Pengadaan** | ✅ **Sudah disesuaikan** (Keputusan #27): `procurement_items.jenis`, `BR-064` dipersempit ke item Aset, `FR-14.3` diberi batas domain. **Sisa:** alur penerimaan bahan (Main Flow + acceptance criteria) ditulis di M-22 |
| **M-15 Dashboard** · **M-16 Analitik** | Kartu stok bahan di bawah minimum; laporan konsumsi bahan |
| **M-17 Notifikasi** | Notifikasi stok minimum dan status permintaan bahan |
| **M-20 Konfigurasi** | Master satuan bahan; ambang approval permintaan bahan |
| **M-02 Role & Permission** | Baris permission `material.*` pada matriks Lampiran C |

### 5.3 Lapisan turunan

| Lapisan | Penyesuaian |
|---|---|
| **SDD** | Skema `materials`, `material_balances`, `material_transactions`; `SDD-05` (tabel & indeks), `SDD-06` (endpoint), `SDD-07` (batas transaksi penyesuaian saldo), `SDD-03` (permission) |
| **UX** | Halaman Bahan pada sitemap dan page inventory (`P-xx` baru), alur permintaan → persetujuan → penyerahan (`F-xx` baru), entri menu pada `INFORMATION-ARCHITECTURE` |
| **DESIGN** | Halaman Bahan memakai pola daftar, formulir, dan detail yang ada. Satu pola baru menyusul dari **UXD-18**: blok subgrup kartu dashboard ([`PATTERNS.md §3.5`](../../DESIGN/PATTERNS.md)), dipicu oleh dua kartu M-22 di Zona 1 |
| **IMPLEMENTATION** | `ROADMAP` peta modul → phase, `DELIVERY-PLAN`, dan `phases/phase-05.md` menampung PR M-22 |

### 5.4 Berkas lain yang wajib ikut diperbarui saat M-22 ditulis

| Berkas | Penyesuaian |
|---|---|
| [`delivery-plan.md`](delivery-plan.md) | ✅ M-22 sudah masuk `M4`; kriteria keluar `M4` sudah memuat butir saldo bahan (`BR-081`, `BR-082`, `BR-083`) — 24 Agustus 2026 |
| [`overview.md`](overview.md) | ✅ §1.1 sudah menyebut kedua domain. **Sisa:** `G-xx`, `PO-xx`, `SC-xx` untuk domain Bahan — menuntut target terukur yang belum ditetapkan |
| [`activity-log.md`](../03-architecture/activity-log.md) | Nilai enum `modul` perlu `BAHAN` di samping `INVENTARIS` |
| [`data-model.md`](../03-architecture/data-model.md) | Entitas `materials`, `material_balances`, `material_transactions`; enum **Jenis Pengajuan** perlu *Permintaan Bahan* |
| [`system-overview.md`](../03-architecture/system-overview.md) | Use case diagram dan peta bab |
| [`test-strategy.md`](../06-quality/test-strategy.md) | Skenario ujung-ke-ujung permintaan → persetujuan → penyerahan bahan |
| [`mobile-requirements.md`](../05-mobile/mobile-requirements.md) | Apakah pemindaian QR bahan dan opname bahan berjalan di mobile |
| [`README.md`](../README.md) · [`CHANGELOG.md`](../CHANGELOG.md) | Tabel daftar modul |

### 5.5 Hitungan "22 modul · 162 PR" — sudah diselaraskan

Angka **21 modul** dan **152 PR** tertanam di sekitar 20 tempat dan seluruhnya sudah diperbarui: `CLAUDE.md`, `README.md` akar, `SDD-SYS-04`, `SDD-REPO-02`, SDD-11, SDD-12, empat berkas UX, dan tujuh berkas IMPLEMENTATION.

> **Perubahan kode.** `scripts/validate_impl.py` mengunci `range(1, 22)` dan `total == 152` sebagai nilai harfiah, sehingga skrip itu ikut disunting menjadi `range(1, 23)` dan `total == 162`. `scripts/allocation_map.py` juga memiliki daftar modul hardcoded yang berakhir di M-21 — tanpa mendaftarkan M-22 di sana, seluruh generator indeks **melewatkan modul ini secara diam-diam** tanpa galat.

**Pelajaran untuk penambahan modul berikutnya:** penulisan modul, penambahan PR di phase, pendaftaran di `allocation_map.py`, dan pembaruan ambang `validate_impl.py` harus terjadi dalam **satu langkah**. Tiga dari empat langkah itu gagal secara senyap, bukan dengan pesan galat.

## 6. Yang sengaja **tidak** dikerjakan

- Tidak ada `FR`, `BR`, `NT`, permission, entitas, atau endpoint Bahan yang ditulis pada berkas mana pun.
- Tidak ada perubahan skema basis data untuk Bahan.
- Domain Aset tidak diubah perilakunya — hanya istilahnya yang diseragamkan.
- Batas MVP modul lain tidak digeser.

## 7. TBD yang terbuka

| Kode | Status | Pertanyaan | Penyelesaian |
|---|---|---|---|
| `TBD-BHN-A` | ✅ Tertutup | Perlakuan penerimaan pengadaan berjenis Bahan | Keputusan #27 — `procurement_items.jenis`; `BR-064` dipersempit ke item Aset |
| `TBD-BHN-B` | ✅ Tertutup | Satuan bahan: master data atau teks bebas | Master `material_units` dikelola Administrator (`FR-20.1`, `BR-084`) |
| `TBD-BHN-C` | ✅ Tertutup | Kategori bahan berdiri sendiri atau memakai ulang kategori aset | Master `material_categories` tersendiri |
| `TBD-BHN-D` | ✅ Tertutup | Opname bahan perlu persetujuan Pimpinan | Ya — `BR-094`, sejajar `BR-057` |
| **`TBD-BHN-E`** | ⏳ **Terbuka** | Katalog tool chatbot seluruhnya berdomain Aset. Apakah chatbot perlu tool bahan (saldo, stok menipis)? Menambah tool adalah **requirement baru** di PRD, bukan keputusan SDD | Menunggu keputusan pemilik produk |

TBD ini adalah **keputusan produk**, bukan keputusan desain — tidak boleh diputuskan sendiri di tingkat SDD.

Register kanoniknya adalah [`SDD/TBD-REGISTER.md`](../../SDD/TBD-REGISTER.md); `TBD-BHN-B`…`D` tercatat di sana pada kelompok A.
