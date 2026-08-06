# Dokumentasi SIGM4

**SIGM4 — Sistem Informasi Management 4set** · Sarana dan Prasarana Sekolah

Dokumentasi terbagi dua, dengan batas yang tegas.

| Folder | Menjawab | Isi | Otoritas |
|---|---|---|---|
| **[PRD/](PRD/)** | *Apa* yang dibangun | Requirement, aturan bisnis, kriteria penerimaan | **Source of Truth** |
| **[SDD/](SDD/)** | *Bagaimana* dibangun | Keputusan desain teknis, skema fisik, algoritma | Turunan; merujuk PRD lewat ID |

SDD **tidak pernah** memuat requirement. Bila terjadi perbedaan antara keduanya, **PRD yang berlaku**.

---

## Mulai dari mana

| Peran | Mulai dari |
|---|---|
| Product Manager · Stakeholder | [`PRD/01-product/overview.md`](PRD/01-product/overview.md) |
| Business Analyst · QA | [`PRD/README.md`](PRD/README.md) lalu [`PRD/06-quality/`](PRD/06-quality/) |
| Backend · Frontend · Mobile Developer | Berkas modul di [`PRD/02-modules/`](PRD/02-modules/) — satu berkas cukup untuk implementasi |
| Software Architect · DevOps | [`SDD/README.md`](SDD/README.md) |
| AI Coding Agent | [`PRD/README.md`](PRD/README.md) — memuat peta ID → berkas |

---

## Aturan yang berlaku di seluruh dokumentasi

1. **ID adalah alamat, bukan path.** `FR-08.2`, `BR-028a`, `RE-09`, `NT-19` tidak pernah berubah meski berkas dipindah. Untuk menemukan segalanya yang terkait sebuah aturan, `grep` kodenya.
2. **Satu baris, satu pemilik.** Setiap Business Rule, endpoint, notifikasi, permission, dan aksi log dimiliki tepat satu berkas modul. Tidak ada salinan.
3. **Berkas di [`PRD/_generated/`](PRD/_generated/) jangan disunting** — digenerate dari modul, suntingan akan hilang.

---

## Perkakas

```bash
python scripts/audit_docs.py    # audit kehilangan requirement & tautan rusak
python scripts/gen_indexes.py   # regenerasi indeks di PRD/_generated/
python scripts/gen_trace.py     # regenerasi papan skor traceability
```

Arsip PRD utuh sebelum dipecah: [`../PRD.v1.1.full.md`](../PRD.v1.1.full.md) — 5.912 baris, SHA-256 `ef24c261…4d4d57`.
