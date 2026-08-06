# SIGM4

**Sistem Informasi Management 4set** · Sarana dan Prasarana Sekolah · PRD v1.1

Dokumentasi berada di [`docs/`](docs/).

## → Mulai dari [`docs/README.md`](docs/README.md)

| | Isi | Otoritas |
|---|---|---|
| [`docs/PRD/`](docs/PRD/) | Requirement, aturan bisnis, kriteria penerimaan | **Source of Truth** |
| [`docs/SDD/`](docs/SDD/) | Keputusan desain teknis | Turunan; merujuk PRD lewat ID |
| [`PRD.v1.1.full.md`](PRD.v1.1.full.md) | Arsip PRD utuh sebelum dipecah, verbatim | Acuan verifikasi |

## Status

| | |
|---|---|
| Requirement | 61 FR · 103 BR · 240 Acceptance Criteria · 49 notifikasi · 93 endpoint · 52 aksi log |
| Modul | 21, seluruhnya self-contained (15 bagian tetap) |
| SDD | 3 dari 17 berkas berstatus Draft · 10 titik TBD terbuka |
| Audit | **LULUS** — nol ID hilang, nol duplikasi, nol tautan rusak (692 tautan diperiksa) |
| Implementasi | Belum dimulai |

```bash
python scripts/audit_docs.py    # verifikasi kapan saja
```
