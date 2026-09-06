# Phase 05 — Penutupan Siklus

| | |
|---|---|
| **Milestone PRD** | `M3` (M-09) — **menutup M3** · `M4` (M-21, M-22) — **menutup M4** |
| **Status** | Lihat [`IMPLEMENTATION-STATUS.md`](../IMPLEMENTATION-STATUS.md) |
| **Modul PRD** | M-09 Peminjaman · M-21 Penghapusan Aset · M-22 Manajemen Bahan |
| **Bergantung pada** | Phase 04 |
| **Memblokir** | Phase 06 |
| **Log** | [`logs/phase-05.md`](../logs/phase-05.md) |

---

## 1. Objective

Aset menyelesaikan perjalanannya: keluar lewat serah terima fisik dan kembali, atau keluar permanen lewat penghapusan. Dua modul terakhir yang menyentuh keadaan aset. Setelah phase ini, seluruh transisi status aset pada Bab 15 telah terimplementasi.

Phase ini juga **menutup `SL-04`** — aturan "siswa berkewajiban aktif tidak dapat dinonaktifkan" yang titik ekstensinya disiapkan di Phase 01 baru kini punya definisi kewajiban yang nyata: peminjaman berjalan dan denda belum lunas.

## 2. Scope

**Termasuk**

- M-09: check-out, check-in, pemantauan keterlambatan, denda, perpanjangan
- M-21: pengajuan penghapusan, persetujuan & eksekusi, arsip & pelaporan
- M-22: master bahan & kategori, ledger saldo, penerimaan, permintaan & ambang approval, penyerahan, penyesuaian, stok minimum, QR bahan, opname bahan
- Penutupan `SL-04` dengan definisi kewajiban yang lengkap

**Tidak termasuk**

- Analitik atas data peminjaman/penghapusan/bahan → **Phase 06**
- Kebijakan retensi arsip penghapusan → **Phase 08** bersama pengerasan

## 3. Dependencies

| Bergantung pada | Alasan teknis |
|---|---|
| Phase 04 → M-08 | `BR-026`: peminjaman berangkat dari reservasi aset yang disetujui |
| Phase 04 → M-12 | Kondisi aset pasca-servis menentukan kelayakan pinjam & penghapusan |
| Phase 04 → M-13 | `BR-012`: aset hilang hasil opname menjadi kandidat penghapusan |
| Phase 03 → M-11 | Kerusakan tak terpulihkan → penghapusan (`BR-065a` … `BR-065g`) |
| Phase 02 → M-10 | Penghapusan memakai approval bertingkat |
| Phase 01 → M-02 | Penutupan `SL-04` |
| Phase 01 → M-03 | Ruangan menjadi lokasi penyimpanan bahan (`BR-082`) |
| Phase 01 → M-20 | Master satuan bahan & ambang approval permintaan (`BR-084`, `BR-086`) |
| Phase 02 → M-10 | Permintaan bahan di atas ambang memakai approval engine (`BR-086`) |
| Phase 03 → M-05 | QR bahan memakai mekanisme label & pindai yang sama (`BR-090`) |
| Phase 03 → M-14 | Item pengadaan berjenis Bahan menambah saldo, bukan record aset (`BR-064`) |
| Phase 04 → M-13 | Sesi opname domain `BAHAN` menumpang mesin sesi yang sudah ada (`BR-093`) |

Urutan di dalam phase:

```
M-09 ──(denda & kewajiban)──→ penutupan SL-04
M-21 ── paralel
```

### 3.1 Kontribusi terhadap milestone PRD

| Modul | Milestone PRD ([29.2](../../PRD/01-product/delivery-plan.md)) |
|---|---|
| M-09 | `M3 — Siklus Operasional` — **menutup M3** |
| M-21 | `M4 — Kontrol & Siklus Hidup Aset` — **menutup M4** |

Dua milestone tertutup sekaligus di sini. Kriteria keluar `M3` (alur ujung-ke-ujung reservasi → serah terima → pengembalian → denda → tiket kerusakan → work order → selesai) melintasi Phase 03, 04, dan 05 — baru dapat dijalankan utuh setelah M-09 hidup.

## 4. Referensi PRD

| Berkas | ID yang dilayani |
|---|---|
| [`m09-loans.md`](../../PRD/02-modules/m09-loans.md) | `FR-09.1` … `FR-09.5` · `BR-026` … `BR-035` |
| [`m21-disposal.md`](../../PRD/02-modules/m21-disposal.md) | `FR-21.1` … `FR-21.3` · `BR-065a` … `BR-065g`, `BR-008`, `BR-012` |
| [`conventions.md`](../../PRD/00-foundation/conventions.md) | `SL-04` (penutupan) · `CAL-01` … `CAL-03` (perhitungan keterlambatan) |
| [`privacy-compliance.md`](../../PRD/03-architecture/privacy-compliance.md) | `DP-01` … `DP-06` (foto serah terima) |

## 5. Referensi SDD

| Berkas | Keputusan yang diterapkan |
|---|---|
| [`01-availability-concurrency.md`](../../SDD/01-availability-concurrency.md) | `SDD-AVL-07` (transisi slot → peminjaman aktif) |
| [`02-approval-engine.md`](../../SDD/02-approval-engine.md) | Penerapan approval bertingkat pada M-21 |
| [`09-file-storage-design.md`](../../SDD/09-file-storage-design.md) | `SDD-FS-08` `SDD-FS-09` (foto bukti serah terima) |
| [`12-mobile-architecture.md`](../../SDD/12-mobile-architecture.md) | `SDD-MOB-04` (serah terima di lapangan) |
| [`13-security-design.md`](../../SDD/13-security-design.md) | `SDD-SEC-08` (pseudonimisasi) · `SDD-FS-11` (foto berwajah dipertahankan sebagai bukti, `DP-05a`) |

## 6. Deliverables

- Serah terima aset dengan bukti foto dan tanda tangan digital
- Pengembalian dengan pemeriksaan kondisi dan pencatatan kerusakan baru
- Pemantauan keterlambatan otomatis dengan pengingat berjenjang
- Perhitungan dan pelunasan denda
- Alur penghapusan aset lengkap: pengajuan → approval → eksekusi → arsip
- `SL-04` tertutup dengan definisi kewajiban yang nyata
- Domain Bahan hidup penuh: saldo berbasis ledger, permintaan berambang, penyerahan aman-konkurensi, dan opname bahan di lapangan

## 7. Pull Request Plan

| PR | Judul | Kompleksitas | Bergantung | FR/SDD | Acceptance |
|---|---|:---:|---|---|---|
| `PR-05-01` | Skema peminjaman + check-out dari reservasi | L | Ph04 | `FR-09.1`, `BR-026` `BR-026a` `BR-027` | Check-out tanpa reservasi disetujui ditolak |
| `PR-05-02` | Bukti serah terima: foto + tanda tangan | M | 01, Ph03 | `FR-09.1`, `SDD-FS-08`, `DP-01` `DP-05a`, `SDD-FS-11` | Foto tersimpan ter-*scan* AV; foto berwajah dipertahankan utuh dan dilindungi `DP-05` — tidak dikaburkan, tidak dihapus |
| `PR-05-03` | Check-in + pemeriksaan kondisi + kerusakan baru | L | 01, Ph03 | `FR-09.2`, `BR-028` … `BR-028e` | Kerusakan saat kembali membuat laporan M-11 otomatis |
| `PR-05-04` | Pelepasan slot & pemulihan status aset saat check-in | M | 03, Ph02 | `BR-030`, `SDD-AVL-07` | Aset kembali tersedia seketika |
| `PR-05-05` | Pemantauan keterlambatan + pengingat berjenjang | M | 01 | `FR-09.3`, `BR-029` `BR-031`, `CAL-01` … `CAL-03` | Keterlambatan dihitung dengan hari kerja |
| `PR-05-06` | Perhitungan denda | M | 05 | `FR-09.4`, `BR-032` `BR-033` | Denda berhenti bertambah setelah aset dinyatakan hilang |
| `PR-05-07` | Pelunasan & pembebasan denda | M | 06 | `FR-09.4`, `BR-031` `BR-028e` | Pembebasan `Keterlambatan` memakai `fine.waive`; pembebasan `Ganti Rugi` memakai `fine.waive_compensation` (Pimpinan saja) + alasan, penuh atau sebagian |
| `PR-05-08` | Perpanjangan peminjaman | M | 01, Ph04 | `FR-09.5`, `BR-035` | Perpanjangan ditolak bila ada reservasi menyusul |
| `PR-05-09` | **Penutupan `SL-04`**: definisi kewajiban aktif | M | 06, Ph01 | `SL-04` | Siswa dengan pinjaman/denda aktif tidak dapat dinonaktifkan |
| `PR-05-10` | Skema penghapusan + pengajuan | M | Ph04 | `FR-21.1`, `BR-065a` `BR-065b` | Aset dalam peminjaman aktif tidak dapat diajukan |
| `PR-05-11` | Approval bertingkat penghapusan | M | 10, Ph02 | `FR-21.2`, `BR-065c` `BR-065d` | Jalur approval mengikuti nilai perolehan aset |
| `PR-05-12` | Eksekusi penghapusan + transisi status final | M | 11 | `FR-21.2`, `BR-008`, `BR-065e` | Aset terhapus tidak muncul di pencarian aktif; barisnya tetap ada |
| `PR-05-13` | Arsip & pelaporan penghapusan | M | 12 | `FR-21.3`, `BR-065f` `BR-065g` | Berita acara dapat diunduh kapan saja |
| `PR-05-14` | Jalur `BR-012`: aset hilang hasil opname → kandidat penghapusan | S | 12, Ph04 | `BR-012` | Kandidat muncul otomatis, keputusan tetap manual |
| `PR-05-15` | Skema bahan: `material_categories`, `materials`, `material_units` (M-20) — migration `expand` | M | Ph01 | `FR-22.1`, `BR-084`, `SDD-DB-02` | Satuan tidak dapat diisi di luar master; **tinjauan arsitek: migration** |
| `PR-05-16` | Master bahan & kategori bahan (CRUD) | M | 15 | `FR-22.1`, `BR-080` `BR-091` | Kategori bahan tidak pernah muncul pada pemilihan kategori aset |
| `PR-05-17` | **Ledger saldo**: `material_balances` + `material_transactions`, invarian saldo↔ledger | L | 15 | `BR-081` `BR-082` `BR-083` `BR-092`, `SDD-DB-13`, `SDD-DB-14` | Saldo tidak dapat ditulis tanpa baris ledger berpasangan; `CHECK (saldo >= 0)` aktif. **Tinjauan arsitek wajib** — tulang punggung seluruh modul |
| `PR-05-18` | Penerimaan bahan + jalur pengadaan (`procurement_items.jenis`) | M | 17, Ph03 | `FR-22.3`, `BR-063` `BR-064` | Item berjenis Bahan menambah saldo dan **tidak** membuat record aset |
| `PR-05-19` | Permintaan bahan + evaluasi ambang approval | M | 17, Ph02 | `FR-22.4`, `BR-086`, `SDD-APR-03` | Di bawah ambang tidak membentuk instance approval sama sekali |
| `PR-05-20` | Penyerahan bahan — row lock & batas jumlah | M | 19 | `FR-22.5`, `BR-083` `BR-087` `BR-089`, `SDD-DB-14` | 20 penyerahan simultan atas saldo 10 → tepat 10 unit keluar, sisanya ditolak `422` |
| `PR-05-21` | Penyesuaian saldo dengan alasan wajib | S | 17 | `FR-22.6`, `BR-088` | Penyesuaian tanpa alasan ditolak skema, bukan hanya service |
| `PR-05-22` | Stok minimum + `NT-49` lewat outbox | M | 17, Ph02 | `FR-22.7`, `BR-085`, `SDD-EVT-03` | Notifikasi terbit sekali saat ambang ditembus, tidak berulang tiap transaksi |
| `PR-05-23` | QR bahan per jenis + pemindaian | S | 16, Ph03 | `BR-090`, `FR-05.1` `FR-05.2` | QR bahan membuka halaman bahan, tidak pernah dibaca sebagai unit aset |
| `PR-05-24` | Opname bahan: sesi domain `BAHAN` + layar mobile `MS-22`/`MS-23` | L | 17, Ph04 | `FR-13.4`, `BR-093` `BR-094` `BR-095`, `MOB-PERF-06` | Sesi campur domain ditolak; saldo berubah hanya setelah disetujui Pimpinan |
| `PR-05-25` | Tool chatbot bahan: `get_material_stock` + `get_low_stock_materials` | S | 17, 22, Ph03 | 22.3, `BR-075` `BR-076`, `SDD-AUTH-07`, `SDD-AI-13`, `AI-SEC-03` | Kedua tool memanggil repository M-22 dengan `AuthContext` penanya; role tanpa hak atas M-22 menerima hasil kosong, bukan galat. Awalan statis terbentuk ulang dan `usage.total_cached_tokens > 0` pada permintaan kedua setelah rilis |

## 8. Task Breakdown

### `PR-05-03` — Check-in
- [ ] Bandingkan kondisi saat keluar dan saat kembali (`BR-028`)
- [ ] Kondisi memburuk → terbitkan event yang membuat laporan M-11 (`BR-028c`)
- [ ] Idempoten: check-in ganda tidak menghasilkan dua laporan
- [ ] Uji: check-out kondisi Baik, check-in kondisi Rusak Ringan → satu laporan kerusakan

### `PR-05-09` — Penutupan `SL-04`
- [ ] Isi titik ekstensi `PR-01-13` dengan pemeriksaan nyata
- [ ] Kewajiban aktif = peminjaman belum kembali **atau** denda belum lunas
- [ ] Pesan penolakan menyebut kewajiban spesifik, bukan sekadar "tidak dapat dinonaktifkan"
- [ ] Uji: siswa berdenda lunas dapat dinonaktifkan; berdenda aktif tidak
- [ ] Tandai `SL-04` selesai di log Phase 01 dan Phase 05

### `PR-05-12` — Eksekusi penghapusan
- [ ] Transisi status ke terminal sesuai Bab 15
- [ ] Baris aset **tidak dihapus** — riwayat, activity log, dan analitik bergantung padanya (`BR-008`)
- [ ] Kunci seluruh perubahan lanjutan pada aset terhapus
- [ ] Uji: aset terhapus tetap terbaca di riwayat peminjaman lama

## 9. Acceptance Checklist

- [ ] Seluruh AC pada `FR-09.1`…`FR-09.5`, `FR-21.1`…`FR-21.3` terverifikasi
- [ ] Seluruh transisi status aset Bab 15 kini memiliki jalur kode dan uji
- [ ] `SL-04` tertutup dan diuji dari kedua sisi
- [ ] Denda dihitung dengan hari kerja, bukan hari kalender (`CAL-01`)
- [ ] Aset terhapus tetap terbaca di seluruh riwayat historis
- [ ] Seluruh AC pada `FR-22.1`…`FR-22.7` dan `FR-13.4` terverifikasi
- [ ] `material_balances` tidak pernah menyimpang dari `material_transactions` — diuji dengan penyerahan simultan
- [ ] Saldo bahan tidak pernah negatif, diuji lewat jalur service **dan** jalur SQL langsung (`CHECK`)
- [ ] Sesi opname yang mencampur domain Aset dan Bahan ditolak (`BR-093`)
- [ ] Foto serah terima mengikuti `SDD-FS-11`/`DP-05a`; **Pemberitahuan Privasi diperiksa memuat pernyataannya** — kewajiban itu melekat pada `DP-05a`, bukan opsional

## 10. Risks

| Risiko | Dampak | Mitigasi | Rujukan |
|---|---|---|---|
| Penghapusan diimplementasikan sebagai `DELETE` baris | Riwayat dan activity log pecah — tidak dapat dipulihkan | Uji eksplisit: aset terhapus harus tetap terbaca di riwayat lama | `BR-008` |
| ~~`TBD-FS-A` belum terjawab saat `PR-05-02`~~ | — | ✅ **Tertutup 25 Agustus 2026**: foto dipertahankan sebagai bukti (`DP-05a`, `SDD-FS-11`); yang wajib dipastikan kini adalah Pemberitahuan Privasi menyatakannya | `DP-04` · `DP-05a` |
| `PR-05-25` membatalkan prompt cache bagi seluruh pengguna | Latensi naik sesaat pada rilis sampai prefiks baru terbentuk; pada tier berbayar biaya ikut melonjak | Disengaja dan terjadwal bersama rilis, bukan perubahan runtime (`SDD-10 §5`). `AI-EV-04` dijalankan ulang sebelum rilis | `TBD-BHN-E` · `AI-CTL-01` |
| Denda dihitung dengan hari kalender | Sengketa dengan orang tua siswa | `BusinessCalendarService` Phase 00 dipakai, bukan aritmetika tanggal langsung | `CAL-01` |
| `SL-04` terlupa ditutup | Aturan Phase 01 tinggal setengah selamanya | Termasuk gerbang keluar phase ini, bukan catatan tersendiri | `SL-04` |
| Perpanjangan bertabrakan dengan reservasi menyusul | Dua pihak mengklaim aset yang sama | Pemeriksaan `booking_slots` sebelum perpanjangan disetujui | `BR-035` |
| Bahan dimodelkan di atas `booking_slots` demi keseragaman | Tabel slot menerima baris tanpa dimensi waktu; exclusion constraint lumpuh | `SDD-AVL-14` melarangnya secara eksplisit; `PR-05-17` ditinjau arsitek | `SDD-AVL-14` |
| Saldo dimutakhirkan tanpa menulis ledger | `BR-081` dilanggar diam-diam; riwayat berlubang dan baru ketahuan berbulan-bulan kemudian | Mutasi saldo hanya lewat satu repository; uji integrasi menolak `UPDATE` saldo yang tidak berpasangan dengan baris ledger | `SDD-DB-13` |
| Penyerahan bersamaan membuat saldo minus | Bahan diserahkan melebihi yang ada; stok fisik dan sistem menyimpang | `SELECT … FOR UPDATE` + `CHECK (saldo >= 0)`; diuji dengan 20 permintaan simultan | `SDD-DB-14` |

## 11. Rollback Strategy

| Skenario | Tindakan |
|---|---|
| PR gagal di staging | Revert PR; M-09 dan M-21 independen |
| `PR-05-12` bermasalah | Aset dikembalikan ke status sebelumnya lewat operasi administratif — barisnya tidak pernah dihapus sehingga selalu dapat dipulihkan |
| `PR-05-09` memblokir penonaktifan yang sah | *Feature flag* mematikan pemeriksaan; Phase 01 kembali berlaku sementara |
| `PR-05-17` ledger bermasalah | Seluruh PR `PR-05-18`…`PR-05-24` bergantung padanya dan ikut ditarik. Tabel bahan bersifat baru sehingga `down` migration aman: tidak ada data modul lain yang menunjuk ke sana |
| `PR-05-24` opname bahan bermasalah | Sesi domain `BAHAN` dinonaktifkan lewat *feature flag*; sesi domain `ASET` tidak tersentuh karena difilter kolom `domain` |
| `PR-05-25` tool bahan bermasalah | Kedua tool dicabut dari katalog; prefiks statis kembali ke bentuk Phase 03. Chatbot kehilangan dua kemampuan dan tidak kehilangan apa pun yang lain, karena tool bersifat aditif |
| Data denda salah hitung | Perhitungan bersifat turunan — dihitung ulang dari riwayat peminjaman tanpa migrasi data |

## 12. Definition of Done

**DoD dasar** — [PRD 29.5](../../PRD/01-product/delivery-plan.md).

**Tambahan khusus phase ini:**

- [ ] 21 dari 22 modul PRD terimplementasi — tersisa M-16 Analitik di Phase 06
- [ ] `SL-04` ditutup dan tercatat di [`logs/phase-01.md`](../logs/phase-01.md) maupun [`logs/phase-05.md`](../logs/phase-05.md)
- [ ] Kriteria keluar `M3` terpenuhi: alur ujung-ke-ujung reservasi → serah terima → pengembalian → denda → tiket kerusakan → work order → selesai berjalan di staging
- [ ] Kriteria keluar `M4` terpenuhi: opname 1.000 unit (Phase 04) · usulan pengadaan menghasilkan aset (Phase 03) · penghapusan menghasilkan berita acara (phase ini)
- [ ] Kriteria keluar `M4` untuk domain Bahan terpenuhi: saldo bahan akurat setelah satu siklus penerimaan → permintaan → penyerahan → opname
- [ ] Uji regresi lintas phase: satu aset melewati pengadaan → reservasi → pinjam → rusak → servis → opname → hapus
- [ ] Log phase terisi

---

*Phase ini tidak memuat requirement maupun keputusan desain baru. Setiap pernyataan merujuk PRD atau SDD.*
