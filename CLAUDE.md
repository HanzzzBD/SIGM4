# CLAUDE.md

Panduan kerja AI agent di repositori **SIGM4**. Berkas ini **tidak memuat requirement, keputusan desain, maupun business rule** — seluruhnya milik `docs/`. Yang ada di sini hanya cara bekerja.

## Tujuan repository

SIGM4 — Sistem Informasi Management Aset, sarana dan prasarana sekolah. 22 modul, monorepo tiga pohon (`apps/api`, `apps/web`, `apps/mobile`) + `packages/schemas` sesuai [`SDD-17 §4.1`](docs/SDD/17-repo-layout.md).

**Status saat ini: dokumentasi lengkap, kode belum ada.** Repo baru berisi `docs/` dan `scripts/`. Rencana pengerjaan: 9 phase · 163 PR — [`docs/IMPLEMENTATION/README.md`](docs/IMPLEMENTATION/README.md).

## Source of truth

Lima lapisan, prioritas menurun. Baca [`docs/README.md`](docs/README.md) sebelum apa pun.

| Lapisan | Menjawab | Otoritas | Entry point |
|---|---|---|---|
| [`docs/PRD/`](docs/PRD/) | **Apa** yang dibangun | **Source of Truth** | [`README.md`](docs/PRD/README.md) |
| [`docs/SDD/`](docs/SDD/) | **Bagaimana** dirancang | Turunan PRD | [`README.md`](docs/SDD/README.md) |
| [`docs/UX/`](docs/UX/) | **Bagaimana** disajikan — halaman, navigasi, alur, keadaan | Turunan PRD & SDD | [`UX-SPEC.md`](docs/UX/UX-SPEC.md) |
| [`docs/DESIGN/`](docs/DESIGN/) | **Seperti apa** tampilannya — token, komponen, pola visual | Turunan PRD, SDD & UX | [`DESIGN-SYSTEM.md`](docs/DESIGN/DESIGN-SYSTEM.md) |
| [`docs/IMPLEMENTATION/`](docs/IMPLEMENTATION/) | **Bagaimana** dikerjakan | Turunan PRD & SDD | [`README.md`](docs/IMPLEMENTATION/README.md) |

Bila terjadi pertentangan, yang berlaku adalah lapisan di atasnya; yang diperbaiki adalah lapisan di bawahnya. **Jangan putuskan sendiri — naikkan ke pemilik produk.**

**Alamat sebenarnya adalah ID, bukan path.** `FR-08.2`, `BR-028a`, `RE-09`, `SDD-AVL-01`, `P-15`, `F-09`, `UXD-03`, `DSD-02`, `C-01` tidak berubah meski berkas dipindah. Untuk menemukan segalanya yang terkait sebuah aturan, `grep` kodenya. Peta prefiks ID: [`docs/PRD/README.md §1`](docs/PRD/README.md).

## Workflow AI

1. **Temukan ID-nya lebih dulu.** Tugas tanpa rujukan ID PRD/SDD berarti mengerjakan sesuatu yang tidak diminta — hentikan dan tanyakan.
2. **Baca berkas modulnya utuh.** Satu berkas di [`docs/PRD/02-modules/`](docs/PRD/02-modules/) bersifat self-contained (15 bagian) dan cukup untuk implementasi.
3. **Baca SDD terkait** untuk keputusan desain yang mengikat, lalu **berkas phase** ([`phases/`](docs/IMPLEMENTATION/phases/) §7) untuk urutan dan dependensi PR.
3a. **Untuk pekerjaan web/mobile,** baca juga [`docs/UX/`](docs/UX/) — halaman (`P-xx`), alur (`F-xx`), dan keadaan layar — lalu [`docs/DESIGN/`](docs/DESIGN/) untuk token dan komponen (`C-xx`). Jangan merancang layar atau memilih warna sendiri; keduanya sudah ditetapkan.
4. **Kerjakan satu PR sesuai rencana phase.** Bukan modul utuh, bukan gabungan beberapa PR.
5. **Selesaikan checklist PR** di bawah sebelum melapor selesai.

Jangan menebak titik yang belum ditetapkan. TBD terkumpul di [`docs/SDD/TBD-REGISTER.md`](docs/SDD/TBD-REGISTER.md) — 13 terbuka, seluruhnya kelompok B: parameter operasional yang dikalibrasi Phase 07–08 setelah data staging ada. Kelompok A, C, dan D kosong; tidak ada phase maupun gerbang rilis yang terhalang keputusan yang belum diambil.

### Perkakas

```bash
python scripts/audit_docs.py     # audit requirement hilang & tautan rusak
python scripts/gen_indexes.py    # regenerasi docs/PRD/_generated/
python scripts/gen_trace.py      # regenerasi papan skor traceability
python scripts/validate_impl.py  # validasi docs/IMPLEMENTATION
```

Perintah npm workspaces (`npm ci`, `npm run lint`, `npm run lint -w apps/api`) ditetapkan [`SDD-17 §4.4`](docs/SDD/17-repo-layout.md) — belum berlaku sampai `apps/` dibuat di Phase 00.

## Aturan implementasi

Batasan yang tidak boleh dibantah tanpa persetujuan pemilik produk — daftar lengkap di [`docs/SDD/README.md §Batasan`](docs/SDD/README.md):

- **Otorisasi ditegakkan di server pada setiap endpoint** (`NFR-S-05`, `PM-02`); setiap endpoint mendeklarasikan permission-nya (`PM-01`); setiap repository menerima `AuthContext` (`SDD-AUTH-05`).
- **Setiap operasi tulis menghasilkan entri activity log** dalam transaksi yang sama (`BR-071`, `AL-01`).
- **Waktu selalu dari `Clock` yang di-inject**, tidak pernah `new Date()` langsung (`SDD-SYS-07`).
- **Batas transaksi tegas** ([`SDD-07`](docs/SDD/07-event-flow.md)): efek yang wajib atomik dijalankan sinkron di dalam transaksi (`SDD-EVT-02`, `CI-03`); efek yang boleh tertunda — notifikasi, push, ekspor, pemindaian AV — terbit ke **outbox di dalam transaksi**, diproses worker setelah commit (`SDD-EVT-03`, `SDD-EVT-04`). Tidak ada panggilan berantai antar-modul (`SDD-SYS-05`), dan tidak ada efek samping yang dikirim setelah `COMMIT` tanpa outbox.
- **Migration bersifat `expand`.** `contract` seluruhnya ditunda ke `PR-08-11` — di luar itu adalah kesalahan ([`DELIVERY-PLAN.md §6`](docs/IMPLEMENTATION/DELIVERY-PLAN.md)).
- **Batas modul & batas antar-pohon ditegakkan lint, bukan kebiasaan** ([`SDD-00 §4.2`](docs/SDD/00-system-architecture.md), [`SDD-17 §4.2`](docs/SDD/17-repo-layout.md)). Impor lintas `apps/*` dilarang seluruhnya.

**Kerjakan yang diminta PR itu saja.** Perbaikan yang terlihat sambil lalu — rename, reorganisasi berkas, pembersihan gaya, penggantian pustaka, "sekalian rapikan" — tidak masuk PR yang sedang berjalan. Catat sebagai butir tersendiri, jangan kerjakan. Batas `S` ≤ 200 baris ada supaya PR dapat ditinjau sungguh-sungguh sekali duduk; refactor sambil lalu menembusnya dan menyembunyikan perubahan perilaku di antara perubahan kosmetik. Refactor yang memang perlu jadi PR-nya sendiri, dengan alasan tertulis bila di luar rencana phase ([`BRANCHING-STRATEGY §2`](docs/IMPLEMENTATION/BRANCHING-STRATEGY.md)).

Skala PR: **S** ≤ 200 baris berubah · **M** ≤ 400 · **L** > 400 dan wajib menjelaskan mengapa tidak dipecah.

## Aturan coding

- **Struktur kode** mengikuti [`SDD-00 §4.1`](docs/SDD/00-system-architecture.md) (backend), [`SDD-11 §4.1`](docs/SDD/11-frontend-architecture.md) (web), [`SDD-12 §4.1`](docs/SDD/12-mobile-architecture.md) (mobile). Hanya `index.ts` sebuah modul yang boleh diimpor modul lain; `repositories/` privat.
- **Bahasa:** identifier TypeScript/React dalam **Bahasa Inggris** (`SlotService`, `reserveSlot`, `AuthContext`); komentar, pesan galat pengguna, dan label antarmuka dalam **Bahasa Indonesia baku** (`NFR-AC-09`, `UX-06`).
- **Nama tabel & kolom** ikut [`SDD-05`](docs/SDD/05-database-design.md): `snake_case`, istilah PRD Bahasa Indonesia (`tanggal_jatuh_tempo`), kecuali nama teknis lintas domain (`id`, `created_at`).
- **Enum** disimpan sebagai kode teknis huruf besar (`RUSAK_RINGAN`); label Bahasa Indonesia dipetakan di lapisan penyajian ([`data-model.md`](docs/PRD/03-architecture/data-model.md)).
- **Tidak ada nilai visual mentah di komponen.** Warna, ukuran, jarak, radius, dan durasi selalu lewat token [`FOUNDATIONS.md`](docs/DESIGN/FOUNDATIONS.md) — tidak pernah hex, px, atau ms ditulis langsung (`DS-P-07`).
- **Hierarki warna mengikat:** struktur → `color.primary` `#4B5563` · interaksi → `color.secondary` `#1F7A8C` · identitas/kategori → `color.accent.*` · status → token semantic. Accent **tidak pernah** menjadi teks, ikon, border 1px, atau fill tombol (`DSD-07`).
- **Rujuk ID pada komentar** ketika sebuah baris ada karena aturan tertentu — `// TTL slot (CI-01)`. Ini yang membuat kode dapat ditelusuri balik ke requirement.
- **Uji yang gagal bila logikanya dicabut.** Uji yang tetap hijau setelah logikanya dihapus tidak menguji apa pun.
- Tidak ada `TODO` maupun data uji pada jalur produksi.

## Aturan dokumentasi

- **Jangan menyunting [`docs/PRD/_generated/`](docs/PRD/_generated/)** — digenerate dari modul, suntingan akan hilang. Ubah berkas modul pemiliknya lalu jalankan `gen_indexes.py`.
- **Satu baris, satu pemilik.** Setiap business rule, endpoint, notifikasi, permission, dan aksi log dimiliki tepat satu berkas modul. Tidak ada salinan; modul lain merujuk lewat ID.
- **Jangan menyalin teks antar-lapisan.** SDD, UX, DESIGN, dan IMPLEMENTATION merujuk PRD lewat ID, tidak mengulang isinya. UX merujuk perilaku PRD/SDD; DESIGN merujuk perilaku UX dan hanya menetapkan tampilannya.
- **Perubahan PRD mengalir ke bawah.** Setelah menyunting PRD, periksa apakah SDD, UX, dan DESIGN yang merujuk baris itu ikut perlu disesuaikan — terutama tabel permission, enum, dan daftar endpoint.
- **Keputusan UX & visual punya ID sendiri.** `UXD-xx` di [`docs/UX/DECISIONS.md`](docs/UX/DECISIONS.md), `DSD-xx` di [`docs/DESIGN/DESIGN-SYSTEM.md §8`](docs/DESIGN/DESIGN-SYSTEM.md). Keputusan yang belum diambil ditandai `BLOCKED` dan **tidak boleh** diputuskan sendiri.
- **Requirement baru tidak lahir saat implementasi.** Bila muncul kebutuhan requirement/business rule/keputusan desain baru, naikkan ke PRD atau SDD lebih dulu; catat di [`logs/phase-NN.md`](docs/IMPLEMENTATION/logs/) bahwa hal itu terjadi. Proyek ini tidak memakai berkas ADR terpisah — keputusan masuk ke SDD ([`ADR-REFERENCE.md`](docs/IMPLEMENTATION/templates/ADR-REFERENCE.md)).
- **Log phase mencatat apa yang benar-benar terjadi**, bukan salinan rencana.
- Setelah menyunting `docs/`, jalankan `audit_docs.py` (dan `validate_impl.py` bila menyentuh `IMPLEMENTATION/`).

## Kapan menggunakan AskUserQuestion

Gunakan ketika jawabannya mengubah pekerjaan dan **tidak dapat diturunkan dari docs/**:

- Muncul pertentangan antara PRD dan SDD, atau antara docs dan permintaan pengguna.
- Menyentuh TBD yang masih terbuka, terutama kelompok A.
- Menyentuh keputusan UX/visual bertanda `BLOCKED` ([`UX/DECISIONS.md §12.3`](docs/UX/DECISIONS.md)) — saat ini `UXD-09` dan `UXD-10`.
- Diminta menambah komponen, varian komponen, atau warna accent baru di luar [`COMPONENTS.md`](docs/DESIGN/COMPONENTS.md) dan [`FOUNDATIONS.md`](docs/DESIGN/FOUNDATIONS.md).
- Pekerjaan yang diminta tidak ada pada daftar PR phase mana pun.
- Menyentuh tulang punggung yang menuntut tinjauan arsitek ([`BRANCHING-STRATEGY §3.1`](docs/IMPLEMENTATION/BRANCHING-STRATEGY.md)): `SlotService`/`booking_slots`, evaluator DSL approval, lapisan permission/`AuthContext`, migration apa pun, `AuditLogger`.
- Diminta menambah paket bersama baru di `packages/` (`SDD-REPO-05`).

**Jangan** dipakai untuk hal yang sudah terjawab di docs — cari ID-nya. Jangan pula untuk meminta persetujuan atas pekerjaan rutin.

## Kapan menggunakan Mermaid

Ikuti pola yang sudah berlaku di docs — jangan mengubah bentuk berkas yang ada:

| Tempat | Bentuk |
|---|---|
| `docs/PRD/` | Mermaid: `flowchart` (alur bisnis, use case), `stateDiagram-v2` (siklus hidup), `sequenceDiagram` (interaksi aktor), `erDiagram` (relasi entitas) |
| `docs/SDD/` | ASCII tree + tabel (pola `SDD-00 §4.1`, `SDD-17 §4.1`) |
| `docs/UX/` | Mermaid: `flowchart` (IA, sitemap, navigasi, user flow) — pola [`INFORMATION-ARCHITECTURE.md`](docs/UX/INFORMATION-ARCHITECTURE.md) |
| `docs/DESIGN/` | ASCII wireframe + tabel token; **tanpa Mermaid** |
| `docs/IMPLEMENTATION/` | ASCII + tabel (pola `BRANCHING-STRATEGY §1`) |
| Deskripsi PR | Mermaid hanya bila alurnya benar-benar bercabang |

Diagram menggantikan penjelasan, bukan menambahinya. Bila alurnya lurus, tabel lebih terbaca.

## Checklist sebelum membuat PR

Cabang: `<jenis>/<id-pr>-<ringkasan-kebab>` — `feature/PR-02-17-slot-service` ([`BRANCHING-STRATEGY §2`](docs/IMPLEMENTATION/BRANCHING-STRATEGY.md)). Umur cabang ≤ 3 hari.
Commit: `PR-NN-NN: ringkasan` (`chore: …` untuk cabang `chore/`). Judul PR: `PR-NN-NN — judul sesuai rencana phase`.
Deskripsi PR memakai [`templates/PULL-REQUEST.md`](docs/IMPLEMENTATION/templates/PULL-REQUEST.md) — bagian yang tidak berlaku ditandai `—`, jangan dihapus.

- [ ] Bagian **"Requirement yang dilayani" tidak kosong** — minimal satu ID PRD atau SDD
- [ ] Perilaku sesuai ID yang dirujuk, bukan sesuai tafsiran sendiri
- [ ] Pipeline hijau (`CD-01`); cakupan logika inti ≥ 70% (`CD-02`, `NFR-M-03`)
- [ ] Unit test logika bisnis + integration test endpoint; otorisasi diuji **termasuk kasus penolakan**
- [ ] Ada uji yang gagal bila logika ini dicabut — sebutkan namanya di deskripsi PR
- [ ] Setiap operasi tulis mencatat activity log (`AL-01`)
- [ ] Setiap endpoint mendeklarasikan permission-nya (`PM-01`); repository menerima `AuthContext` (`SDD-AUTH-05`)
- [ ] Migration bersifat `expand`; `down` teruji (`CD-04`, `CD-05`)
- [ ] OpenAPI diperbarui bila kontrak berubah (`NFR-M-05`)
- [ ] Tidak ada `TODO` maupun data uji pada jalur produksi
- [ ] Bagian "Perubahan skema", "Rollback", dan "Tinjauan arsitek" terisi
- [ ] Tidak ada refactor, rename, atau pembersihan gaya di luar scope PR ini
- [ ] PR berkompleksitas `L` menjelaskan mengapa tidak dipecah
- [ ] PR di luar rencana phase menjelaskan alasannya, dan dicatat di log phase

DoD tingkat requirement ada di [PRD 29.5](docs/PRD/01-product/delivery-plan.md); butir yang tidak dapat diperiksa per PR (verifikasi QA staging, aksesibilitas, uji lintas platform) diperiksa pada gerbang keluar phase.
