# Template Pull Request

Salin isi blok di bawah ke deskripsi PR. Bagian yang tidak berlaku ditandai `—`, **jangan dihapus** — bagian yang hilang tidak terlihat oleh peninjau, bagian yang bertanda `—` terlihat sebagai keputusan sadar.

---

```markdown
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
```

---

## Aturan pemakaian

**Judul PR memakai ID.** Format `PR-NN-NN — judul`. Ini yang menyambungkan commit ke rencana phase ke requirement tanpa perlu membuka dokumen apa pun.

**Bagian "Requirement yang dilayani" tidak boleh kosong.** PR tanpa rujukan PRD maupun SDD berarti mengerjakan sesuatu yang tidak diminta. Bila memang tidak ada — misalnya perbaikan perkakas — tulis `chore` dan jelaskan; jangan biarkan kosong.

**"Uji yang gagal bila logika ini dicabut" adalah baris terpenting.** Uji yang tetap hijau setelah logikanya dihapus tidak menguji apa pun. Baris ini memaksa penulis memeriksanya sendiri sebelum peninjau harus menemukannya.

**PR berkompleksitas `L` wajib menjelaskan mengapa tidak dipecah.** Skalanya: `S` ≤ 200 baris berubah · `M` ≤ 400 · `L` > 400. Batas ini soal berapa banyak yang dapat ditinjau dengan sungguh-sungguh dalam sekali duduk, bukan soal kerapian.

**Bagian "Perubahan skema" tidak boleh dilewati.** Migration `contract` di luar `PR-08-11` adalah kesalahan menurut [`DELIVERY-PLAN.md` §6](../DELIVERY-PLAN.md) — mencantumkannya di sini membuat kesalahan itu terlihat sebelum tergabung, bukan sesudah.

## Klasifikasi komentar peninjau

| Penanda | Arti |
|---|---|
| `[blocker]` | Menghalangi penggabungan; wajib ditanggapi |
| `[saran]` | Tidak menghalangi; boleh ditolak dengan alasan |
| `[tanya]` | Hanya meminta penjelasan |

Tanpa penanda, penulis menebak mana yang menghalangi penggabungan — dan biasanya menebak salah ke salah satu arah.
