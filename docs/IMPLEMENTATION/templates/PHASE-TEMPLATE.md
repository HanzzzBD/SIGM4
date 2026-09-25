# Phase NN — <Nama Phase>

| | |
|---|---|
| **Milestone PRD** | `M?` — [delivery-plan.md](../../PRD/01-product/delivery-plan.md) |
| **Status** | Lihat [`IMPLEMENTATION-STATUS.md`](../IMPLEMENTATION-STATUS.md) |
| **Modul PRD** | M-xx, M-yy |
| **Bergantung pada** | Phase NN-1 |
| **Memblokir** | Phase NN+1 |
| **Log** | [`logs/phase-NN.md`](../logs/phase-NN.md) |

---

## 1. Objective

Satu paragraf: apa yang berubah di sistem setelah phase ini selesai, dinyatakan sebagai kemampuan yang bisa didemokan — bukan daftar tugas.

## 2. Scope

**Termasuk**

- …

**Tidak termasuk** *(dan di phase mana ia dikerjakan)*

- …

## 3. Dependencies

| Bergantung pada | Alasan teknis |
|---|---|
| Phase NN-1 | … |

Modul dalam phase ini yang saling bergantung, beserta urutannya:

```
M-xx → M-yy
```

## 4. Referensi PRD

| Berkas | ID yang dilayani |
|---|---|
| [`m??-*.md`](../../PRD/02-modules/m??-*.md) | `FR-??.?` … |

## 5. Referensi SDD

| Berkas | Keputusan yang diterapkan |
|---|---|
| [`??-*.md`](../../SDD/??-*.md) | `SDD-???-01` … |

## 6. Deliverables

- …

## 7. Pull Request Plan

| PR | Judul | Kode | Uji | Bergantung | FR/SDD | Acceptance |
|---|---|:---:|---|---|---|
| `PR-NN-01` | … | S/M/L | — | … | … |

Dua estimasi, dua kolom. **`Kode`** memperkirakan baris **kode produksi**; **`Uji`** memperkirakan baris **uji**. Keduanya memakai skala yang sama: **S** ≤ 200 baris berubah · **M** ≤ 400 · **L** > 400.

Yang dijustifikasi di deskripsi PR adalah kolom **`Kode`** — ia yang menentukan apakah sebuah PR dapat ditinjau sungguh-sungguh sekali duduk. Uji yang panjang tidak membuat PR sulit ditinjau dengan cara yang sama: ia dibaca sebagai daftar hal yang dibuktikan, bukan sebagai perilaku yang harus dilacak.

**Mengapa dipisah.** Sampai `PR-00-07` kolomnya hanya satu, dan empat PR berturut "meleset" dari perkiraannya — padahal setiap kali kode produksinya justru berada di dalam batas. `PR-00-07` yang membuktikannya: diperkirakan `S` (≤ 200), terkirim 417 baris, dan kode produksinya **134 baris**. Perkiraannya benar; yang keliru adalah membaca satu angka sebagai dua hal.

**Cara mengisi kolom `Uji`.** Dasarnya `Uji` = `Kode`, digeser oleh bentuk acceptance-nya — sebab acceptance-lah yang menentukan bagaimana sesuatu harus dibuktikan:

| Geser | Kapan | Mengapa |
|---|---|---|
| **+1 kelas** | Acceptance menuntut bukti terhadap PostgreSQL nyata, konkurensi, atau matriks role × endpoint | Uji integrasi selalu lebih panjang daripada uji berkas — ia menyiapkan keadaan, menjalankannya, lalu membersihkannya |
| **−1 kelas** | Acceptance dipenuhi dengan *menjalankan* sesuatu (compose, pipeline, deploy), bukan dengan menguji logika | Tidak ada logika yang dapat diuji unit |
| tetap | Selain itu | Uji berkas cenderung sepanjang kode yang diujinya |

Aturan ini dikalibrasi terhadap empat PR Phase 00 yang sudah terukur dan mereproduksi keempatnya. Angka nyatanya dicatat [`logs/phase-00.md` §8](../logs/phase-00.md); bila PR berikutnya menyimpang, **aturannya** yang disesuaikan, bukan angkanya yang dibulatkan diam-diam.

## 8. Task Breakdown

Setiap task dapat diselesaikan satu developer atau satu AI agent dalam satu sesi.

### `PR-NN-01` — …
- [ ] …

## 9. Acceptance Checklist

- [ ] Seluruh Acceptance Criteria FR yang tercakup terverifikasi (rujuk ID, jangan salin teksnya)
- [ ] …

## 10. Risks

| Risiko | Dampak | Mitigasi | Rujukan |
|---|---|---|---|
| … | … | … | `RS-??` |

## 11. Rollback Strategy

| Skenario | Tindakan |
|---|---|
| PR gagal di staging | … |
| Migration bermasalah | … |
| Phase perlu dibatalkan seluruhnya | … |

## 12. Definition of Done

**DoD dasar** — seluruh butir [PRD 29.5](../../PRD/01-product/delivery-plan.md) berlaku dan tidak diulang di sini.

**Tambahan khusus phase ini:**

- [ ] …

---

*Phase ini tidak memuat requirement maupun keputusan desain baru. Setiap pernyataan merujuk PRD atau SDD.*
