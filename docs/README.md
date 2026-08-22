# Dokumentasi SIGM4

**SIGM4 — Sistem Informasi Management 4set** · Sarana dan Prasarana Sekolah

Dokumentasi terbagi lima lapisan, dengan batas yang tegas.

| Folder | Menjawab | Isi | Otoritas |
|---|---|---|---|
| **[PRD/](PRD/)** | *Apa* yang dibangun | Requirement, aturan bisnis, kriteria penerimaan | **Source of Truth** |
| **[SDD/](SDD/)** | *Bagaimana* dibangun | Keputusan desain teknis, skema fisik, algoritma | Turunan PRD; merujuk lewat ID |
| **[UX/](UX/)** | *Bagaimana* disajikan | Halaman, navigasi, alur, keadaan layar | Turunan PRD & SDD |
| **[DESIGN/](DESIGN/)** | *Seperti apa* tampilannya | Token warna, tipografi, komponen, pola visual | Turunan PRD, SDD & UX |
| **[IMPLEMENTATION/](IMPLEMENTATION/)** | *Bagaimana* dikerjakan | Phase, rencana PR, branching, rilis | Turunan PRD & SDD |

SDD **tidak pernah** memuat requirement. Bila terjadi perbedaan antar-lapisan, **lapisan di atasnya yang berlaku** dan lapisan di bawahnya wajib disesuaikan.

**Entry point tiap lapisan:** [`PRD/README.md`](PRD/README.md) · [`SDD/README.md`](SDD/README.md) · [`UX/UX-SPEC.md`](UX/UX-SPEC.md) · [`DESIGN/DESIGN-SYSTEM.md`](DESIGN/DESIGN-SYSTEM.md) · [`IMPLEMENTATION/README.md`](IMPLEMENTATION/README.md)

---

## Mulai dari mana

| Peran | Mulai dari |
|---|---|
| Product Manager · Stakeholder | [`PRD/01-product/overview.md`](PRD/01-product/overview.md) |
| Business Analyst · QA | [`PRD/README.md`](PRD/README.md) lalu [`PRD/06-quality/`](PRD/06-quality/) |
| Backend Developer | Berkas modul di [`PRD/02-modules/`](PRD/02-modules/) — satu berkas cukup untuk implementasi |
| Frontend · Mobile Developer | Berkas modul, lalu [`UX/UX-SPEC.md`](UX/UX-SPEC.md) dan [`DESIGN/DESIGN-SYSTEM.md`](DESIGN/DESIGN-SYSTEM.md) |
| UI/UX Designer | [`UX/PAGE-SPECIFICATION.md`](UX/PAGE-SPECIFICATION.md) lalu [`DESIGN/DESIGN-SYSTEM.md`](DESIGN/DESIGN-SYSTEM.md) |
| Software Architect · DevOps | [`SDD/README.md`](SDD/README.md) |
| AI Coding Agent | [`PRD/README.md`](PRD/README.md) — memuat peta ID → berkas |

---

## Aturan yang berlaku di seluruh dokumentasi

1. **ID adalah alamat, bukan path.** `FR-08.2`, `BR-028a`, `RE-09`, `NT-19` tidak pernah berubah meski berkas dipindah. Untuk menemukan segalanya yang terkait sebuah aturan, `grep` kodenya.
2. **Satu baris, satu pemilik.** Setiap Business Rule, endpoint, notifikasi, permission, dan aksi log dimiliki tepat satu berkas modul. Tidak ada salinan.
3. **Berkas di [`PRD/_generated/`](PRD/_generated/) jangan disunting** — digenerate dari modul, suntingan akan hilang.
4. **Arah turunan satu jalur.** PRD → SDD → UX → DESIGN. Lapisan bawah merujuk lapisan atas lewat ID dan tidak pernah menyalin teksnya; lapisan atas tidak pernah bergantung pada lapisan bawah.
5. **Perubahan requirement mengalir ke bawah.** Menyunting PRD berarti memeriksa apakah SDD, UX, dan DESIGN yang merujuknya ikut perlu disesuaikan.

---

## Perkakas

```bash
python scripts/audit_docs.py    # audit kehilangan requirement & tautan rusak
python scripts/gen_indexes.py   # regenerasi indeks di PRD/_generated/
python scripts/gen_trace.py     # regenerasi papan skor traceability
```

> **Catatan.** Arsip `PRD.v1.1.full.md` (5.912 baris, SHA-256 `ef24c261…4d4d57`) sudah **tidak ada** di pohon kerja. Selama arsip itu belum dipulihkan, `scripts/audit_docs.py` berhenti dengan `FileNotFoundError` — jalankan `scripts/build_full.py` lebih dulu untuk membangunnya kembali, atau pulihkan dari riwayat git.
