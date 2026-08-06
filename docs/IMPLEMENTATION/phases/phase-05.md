# Phase 05 — Penutupan Siklus

| | |
|---|---|
| **Milestone PRD** | `M3` (M-09) — **menutup M3** · `M4` (M-21) — **menutup M4** |
| **Status** | `Not Started` |
| **Modul PRD** | M-09 Peminjaman · M-21 Penghapusan Aset |
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
- Penutupan `SL-04` dengan definisi kewajiban yang lengkap

**Tidak termasuk**

- Analitik atas data peminjaman/penghapusan → **Phase 06**
- Kebijakan retensi arsip penghapusan → **Phase 08** bersama pengerasan

## 3. Dependencies

| Bergantung pada | Alasan teknis |
|---|---|
| Phase 04 → M-08 | `BR-026`: peminjaman berangkat dari reservasi barang yang disetujui |
| Phase 04 → M-12 | Kondisi aset pasca-servis menentukan kelayakan pinjam & penghapusan |
| Phase 04 → M-13 | `BR-012`: aset hilang hasil opname menjadi kandidat penghapusan |
| Phase 03 → M-11 | Kerusakan tak terpulihkan → penghapusan (`BR-065a` … `BR-065g`) |
| Phase 02 → M-10 | Penghapusan memakai approval bertingkat |
| Phase 01 → M-02 | Penutupan `SL-04` |

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
| [`13-security-design.md`](../../SDD/13-security-design.md) | `SDD-SEC-08` (pseudonimisasi — foto berwajah, **TBD-FS-A**) |

## 6. Deliverables

- Serah terima barang dengan bukti foto dan tanda tangan digital
- Pengembalian dengan pemeriksaan kondisi dan pencatatan kerusakan baru
- Pemantauan keterlambatan otomatis dengan pengingat berjenjang
- Perhitungan dan pelunasan denda
- Alur penghapusan aset lengkap: pengajuan → approval → eksekusi → arsip
- `SL-04` tertutup dengan definisi kewajiban yang nyata

## 7. Pull Request Plan

| PR | Judul | Kompleksitas | Bergantung | FR/SDD | Acceptance |
|---|---|:---:|---|---|---|
| `PR-05-01` | Skema peminjaman + check-out dari reservasi | L | Ph04 | `FR-09.1`, `BR-026` `BR-026a` `BR-027` | Check-out tanpa reservasi disetujui ditolak |
| `PR-05-02` | Bukti serah terima: foto + tanda tangan | M | 01, Ph03 | `FR-09.1`, `SDD-FS-08`, `DP-01` | Foto tersimpan ter-*scan* AV; wajah tunduk **TBD-FS-A** |
| `PR-05-03` | Check-in + pemeriksaan kondisi + kerusakan baru | L | 01, Ph03 | `FR-09.2`, `BR-028` … `BR-028e` | Kerusakan saat kembali membuat laporan M-11 otomatis |
| `PR-05-04` | Pelepasan slot & pemulihan status aset saat check-in | M | 03, Ph02 | `BR-030`, `SDD-AVL-07` | Aset kembali tersedia seketika |
| `PR-05-05` | Pemantauan keterlambatan + pengingat berjenjang | M | 01 | `FR-09.3`, `BR-029` `BR-031`, `CAL-01` … `CAL-03` | Keterlambatan dihitung dengan hari kerja |
| `PR-05-06` | Perhitungan denda | M | 05 | `FR-09.4`, `BR-032` `BR-033` | Denda berhenti bertambah setelah aset dinyatakan hilang |
| `PR-05-07` | Pelunasan & pembebasan denda | M | 06 | `FR-09.4`, `BR-034` | Pembebasan memerlukan permission tersendiri + alasan |
| `PR-05-08` | Perpanjangan peminjaman | M | 01, Ph04 | `FR-09.5`, `BR-035` | Perpanjangan ditolak bila ada reservasi menyusul |
| `PR-05-09` | **Penutupan `SL-04`**: definisi kewajiban aktif | M | 06, Ph01 | `SL-04` | Siswa dengan pinjaman/denda aktif tidak dapat dinonaktifkan |
| `PR-05-10` | Skema penghapusan + pengajuan | M | Ph04 | `FR-21.1`, `BR-065a` `BR-065b` | Aset dalam peminjaman aktif tidak dapat diajukan |
| `PR-05-11` | Approval bertingkat penghapusan | M | 10, Ph02 | `FR-21.2`, `BR-065c` `BR-065d` | Jalur approval mengikuti nilai perolehan aset |
| `PR-05-12` | Eksekusi penghapusan + transisi status final | M | 11 | `FR-21.2`, `BR-008`, `BR-065e` | Aset terhapus tidak muncul di pencarian aktif; barisnya tetap ada |
| `PR-05-13` | Arsip & pelaporan penghapusan | M | 12 | `FR-21.3`, `BR-065f` `BR-065g` | Berita acara dapat diunduh kapan saja |
| `PR-05-14` | Jalur `BR-012`: aset hilang hasil opname → kandidat penghapusan | S | 12, Ph04 | `BR-012` | Kandidat muncul otomatis, keputusan tetap manual |

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
- [ ] Foto serah terima tunduk pada keputusan **TBD-FS-A**; bila masih terbuka, tercatat sebagai risiko terbawa ke Phase 08

## 10. Risks

| Risiko | Dampak | Mitigasi | Rujukan |
|---|---|---|---|
| Penghapusan diimplementasikan sebagai `DELETE` baris | Riwayat dan activity log pecah — tidak dapat dipulihkan | Uji eksplisit: aset terhapus harus tetap terbaca di riwayat lama | `BR-008` |
| **TBD-FS-A** belum terjawab saat `PR-05-02` | Foto berwajah tersimpan tanpa kebijakan penghapusan — risiko kepatuhan PDP | Kelompok A; wajib dijawab sebelum phase mulai | `DP-04` |
| Denda dihitung dengan hari kalender | Sengketa dengan orang tua siswa | `BusinessCalendarService` Phase 00 dipakai, bukan aritmetika tanggal langsung | `CAL-01` |
| `SL-04` terlupa ditutup | Aturan Phase 01 tinggal setengah selamanya | Termasuk gerbang keluar phase ini, bukan catatan tersendiri | `SL-04` |
| Perpanjangan bertabrakan dengan reservasi menyusul | Dua pihak mengklaim aset yang sama | Pemeriksaan `booking_slots` sebelum perpanjangan disetujui | `BR-035` |

## 11. Rollback Strategy

| Skenario | Tindakan |
|---|---|
| PR gagal di staging | Revert PR; M-09 dan M-21 independen |
| `PR-05-12` bermasalah | Aset dikembalikan ke status sebelumnya lewat operasi administratif — barisnya tidak pernah dihapus sehingga selalu dapat dipulihkan |
| `PR-05-09` memblokir penonaktifan yang sah | *Feature flag* mematikan pemeriksaan; Phase 01 kembali berlaku sementara |
| Data denda salah hitung | Perhitungan bersifat turunan — dihitung ulang dari riwayat peminjaman tanpa migrasi data |

## 12. Definition of Done

**DoD dasar** — [PRD 29.5](../../PRD/01-product/delivery-plan.md).

**Tambahan khusus phase ini:**

- [ ] 20 dari 21 modul PRD terimplementasi — tersisa M-16 Analitik di Phase 06
- [ ] `SL-04` ditutup dan tercatat di [`logs/phase-01.md`](../logs/phase-01.md) maupun [`logs/phase-05.md`](../logs/phase-05.md)
- [ ] Kriteria keluar `M3` terpenuhi: alur ujung-ke-ujung reservasi → serah terima → pengembalian → denda → tiket kerusakan → work order → selesai berjalan di staging
- [ ] Kriteria keluar `M4` terpenuhi: opname 1.000 unit (Phase 04) · usulan pengadaan menghasilkan aset (Phase 03) · penghapusan menghasilkan berita acara (phase ini)
- [ ] Uji regresi lintas phase: satu aset melewati pengadaan → reservasi → pinjam → rusak → servis → opname → hapus
- [ ] Log phase terisi

---

*Phase ini tidak memuat requirement maupun keputusan desain baru. Setiap pernyataan merujuk PRD atau SDD.*
