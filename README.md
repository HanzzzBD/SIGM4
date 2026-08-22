# SIGM4

**Sistem Informasi Management 4set** — pengelolaan aset, sarana, dan prasarana sekolah.
SMKN 4 Bandung · 21 modul · monorepo tiga pohon.

| Item | Keterangan |
|---|---|
| **Status** | Dokumentasi lengkap · **kode belum ada** |
| **Rencana** | 9 phase · 152 PR — [`docs/IMPLEMENTATION/README.md`](docs/IMPLEMENTATION/README.md) |
| **Platform** | Web responsif (Express + React) · Mobile native (React Native) |
| **Skala target** | ± 5.000 unit aset · 1.000 pengguna · 100–150 concurrent |

---

## Dokumentasi

Lima lapisan, arah turunan satu jalur: **PRD → SDD → UX → DESIGN**, dengan IMPLEMENTATION sebagai rencana kerja.

| Lapisan | Menjawab | Entry point |
|---|---|---|
| **PRD** | *Apa* yang dibangun — requirement, aturan bisnis, kriteria penerimaan | [`docs/PRD/README.md`](docs/PRD/README.md) |
| **SDD** | *Bagaimana* dirancang — keputusan teknis, skema fisik, algoritma | [`docs/SDD/README.md`](docs/SDD/README.md) |
| **UX** | *Bagaimana* disajikan — halaman, navigasi, alur, keadaan layar | [`docs/UX/UX-SPEC.md`](docs/UX/UX-SPEC.md) |
| **DESIGN** | *Seperti apa* tampilannya — token, tipografi, komponen, pola visual | [`docs/DESIGN/DESIGN-SYSTEM.md`](docs/DESIGN/DESIGN-SYSTEM.md) |
| **IMPLEMENTATION** | *Bagaimana* dikerjakan — phase, rencana PR, branching, rilis | [`docs/IMPLEMENTATION/README.md`](docs/IMPLEMENTATION/README.md) |

**PRD adalah Source of Truth.** Bila terjadi perbedaan antar-lapisan, lapisan di atasnya yang berlaku dan lapisan di bawahnya wajib disesuaikan.

Peta menyeluruh: [`docs/README.md`](docs/README.md).

---

## Mulai dari mana

| Peran | Mulai dari |
|---|---|
| Product Manager · Stakeholder | [`docs/PRD/01-product/overview.md`](docs/PRD/01-product/overview.md) |
| Business Analyst · QA | [`docs/PRD/README.md`](docs/PRD/README.md) lalu [`docs/PRD/06-quality/`](docs/PRD/06-quality/) |
| Backend Developer | Berkas modul di [`docs/PRD/02-modules/`](docs/PRD/02-modules/) — satu berkas cukup untuk implementasi |
| Frontend · Mobile Developer | Berkas modul, lalu [`docs/UX/`](docs/UX/) dan [`docs/DESIGN/`](docs/DESIGN/) |
| UI/UX Designer | [`docs/UX/PAGE-SPECIFICATION.md`](docs/UX/PAGE-SPECIFICATION.md) lalu [`docs/DESIGN/DESIGN-SYSTEM.md`](docs/DESIGN/DESIGN-SYSTEM.md) |
| Software Architect · DevOps | [`docs/SDD/README.md`](docs/SDD/README.md) |
| AI Coding Agent | [`CLAUDE.md`](CLAUDE.md) lalu [`docs/PRD/README.md`](docs/PRD/README.md) |

---

## Identitas visual

| Aset | Dipakai untuk |
|---|---|
| `logosidebar.svg` | Wordmark SIGM4 — sidebar web, halaman login, kop ekspor PDF |
| `iconwebsite.svg` | Icon — favicon, app icon mobile, splash |

Warna, tipografi, dan komponen diturunkan dari kedua berkas ini: [`docs/DESIGN/DESIGN-SYSTEM.md §2`](docs/DESIGN/DESIGN-SYSTEM.md#2-visual-identity).

---

## Perkakas

```bash
python scripts/audit_docs.py     # audit requirement hilang & tautan rusak
python scripts/gen_indexes.py    # regenerasi docs/PRD/_generated/
python scripts/gen_trace.py      # regenerasi papan skor traceability
python scripts/validate_impl.py  # validasi docs/IMPLEMENTATION
```

Perintah npm workspaces (`npm ci`, `npm run lint`) ditetapkan [`SDD-17 §4.4`](docs/SDD/17-repo-layout.md) — belum berlaku sampai `apps/` dibuat di Phase 00.
