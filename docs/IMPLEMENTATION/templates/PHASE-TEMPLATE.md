# Phase NN — <Nama Phase>

| | |
|---|---|
| **Milestone PRD** | `M?` — [delivery-plan.md](../../PRD/01-product/delivery-plan.md) |
| **Status** | `Not Started` |
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

| PR | Judul | Kompleksitas | Bergantung | FR/SDD | Acceptance |
|---|---|:---:|---|---|---|
| `PR-NN-01` | … | S/M/L | — | … | … |

Kompleksitas: **S** ≤ 200 baris berubah · **M** ≤ 400 · **L** > 400 (harus dijustifikasi di deskripsi PR).

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
