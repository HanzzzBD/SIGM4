<!--
  Sumber kanonik: docs/IMPLEMENTATION/templates/PULL-REQUEST.md
  Berkas ini adalah SALINAN agar GitHub mengisinya otomatis — GitHub tidak membaca
  templat dari docs/IMPLEMENTATION/templates/. Keduanya WAJIB diperbarui bersama.
  Bila berbeda, yang berlaku adalah berkas kanonik di docs/.

  Aturan pemakaian, penjelasan tiap bagian, dan klasifikasi komentar peninjau:
  docs/IMPLEMENTATION/templates/PULL-REQUEST.md

  Bagian yang tidak berlaku ditandai `—`, JANGAN DIHAPUS. Bagian yang hilang tidak
  terlihat oleh peninjau; bagian bertanda `—` terlihat sebagai keputusan sadar.
-->

## PR

`PR-NN-NN` — <judul sesuai rencana phase>
Phase: [`phase-NN.md`](../docs/IMPLEMENTATION/phases/phase-NN.md) · Kompleksitas: `S` / `M` / `L`

## Yang dikerjakan

<Satu paragraf. Apa yang berubah dan mengapa. Bila memerlukan lebih dari satu paragraf,
pertimbangkan apakah PR ini seharusnya dua PR.>

## Requirement yang dilayani

| ID | Berkas | Bagian yang dipenuhi |
|---|---|---|
| `FR-xx.x` | [`mNN-nama.md`](../docs/PRD/02-modules/mNN-nama.md) | AC 1, 2 |
| `BR-xxx` | idem | |

## Keputusan desain yang diterapkan

| ID | Berkas |
|---|---|
| `SDD-XXX-NN` | [`NN-nama.md`](../docs/SDD/NN-nama.md) |

## Perubahan skema

- [ ] Tidak ada perubahan skema
- [ ] Ada — jenis: `expand` / `migrate` / `contract`
  - Migration naik: `<berkas>`
  - Migration turun teruji: ya / tidak — bila tidak, jelaskan
  - Kompatibel mundur satu versi (`CD-04`): ya / tidak

## Pengujian

| Jenis | Yang diuji |
|---|---|
| Unit | |
| Integrasi | |
| Otorisasi (termasuk kasus penolakan) | |
| Konkurensi | |

**Uji yang gagal bila logika ini dicabut:** `<nama uji>`

## Definition of Done

- [ ] Pipeline hijau (`CD-01`); cakupan logika inti ≥ 70% (`CD-02`)
- [ ] Unit test logika bisnis + integration test endpoint (29.5)
- [ ] Otorisasi diuji termasuk kasus penolakan (29.5)
- [ ] Activity log tercatat untuk setiap operasi tulis (`AL-01`)
- [ ] Endpoint mendeklarasikan permission-nya (`PM-01`)
- [ ] Repository menerima `AuthContext` (`SDD-AUTH-05`)
- [ ] OpenAPI diperbarui bila kontrak berubah (`NFR-M-05`)
- [ ] Tidak ada `TODO` maupun data uji pada jalur produksi (29.5)

## Tinjauan arsitek

- [ ] Tidak diperlukan
- [ ] Diperlukan — menyentuh: `SlotService` / evaluator DSL / lapisan permission / migration / `AuditLogger`
  Peninjau: @

## Rollback

Cara mengembalikan bila PR ini bermasalah setelah tergabung:

## Catatan untuk peninjau

<Bagian yang perlu perhatian khusus. Alternatif yang dipertimbangkan dan ditolak.
Untuk PR berkompleksitas `L`: mengapa tidak dipecah.>
