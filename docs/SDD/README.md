# Software Design Document (SDD) — SIGM4

**Status:** 18 dari 18 berkas berstatus Draft — seluruh rencana SDD terisi. Titik yang belum ditetapkan terkumpul di [`TBD-REGISTER.md`](TBD-REGISTER.md).

---

## Batas dokumen ini

SDD menjawab **bagaimana** sistem dibangun. [`../PRD/`](../PRD/) menjawab **apa** yang dibangun dan merupakan **Source of Truth**.

Dua lapisan turunan berdiri **di bawah** SDD dan merujuknya lewat ID:

| Lapisan | Menjawab | Entry point |
|---|---|---|
| [`../UX/`](../UX/) | **Bagaimana** requirement disajikan — halaman, navigasi, alur, keadaan layar | [`UX-SPEC.md`](../UX/UX-SPEC.md) |
| [`../DESIGN/`](../DESIGN/) | **Seperti apa** tampilannya — token, tipografi, komponen, pola visual | [`DESIGN-SYSTEM.md`](../DESIGN/DESIGN-SYSTEM.md) |

Keputusan SDD yang paling banyak dirujuk keduanya: `SDD-FE-04` (render berbasis permission), `SDD-FE-08` (peta enum), `SDD-FE-10` (filter di URL), `SDD-FE-12` (pustaka komponen sendiri), `SDD-MOB-*` (alur lapangan), `SDD-NTF-09` (deep link). Bila keputusan itu berubah, **periksa `UX/` dan `DESIGN/`**.

**SDD dilarang menduplikasi requirement.** Setiap kali SDD menyebut sebuah aturan, ia merujuk lewat ID (`BR-017`, `FR-08.2`, `CI-01`, `RE-09`) — tidak menyalin teksnya. Bila teks aturan berubah, SDD tidak perlu ikut diubah.

| Boleh ada di SDD | Tidak boleh ada di SDD |
|---|---|
| Keputusan desain teknis beserta alasannya | Requirement baru |
| Skema fisik basis data (DDL, indeks, constraint) | Salinan Business Rule |
| Struktur folder & pemisahan lapisan | Salinan Acceptance Criteria |
| Algoritma & pseudocode | Keputusan bisnis |
| Kontrak antar-komponen | Perubahan ID |
| Trade-off yang dipertimbangkan dan ditolak | Asumsi bisnis buatan sendiri |

Bila terjadi perbedaan antara SDD dan PRD, **PRD yang berlaku** dan SDD wajib disesuaikan.

---

## Daftar dokumen

Nomor mencerminkan urutan ketergantungan implementasi, bukan urutan prioritas. Tiga berkas pertama setelah `00` adalah fondasi yang menentukan bentuk skema basis data, otorisasi, dan mesin persetujuan.

| # | Berkas | Cakupan | Basis di PRD | Status |
|---|---|---|---|:---:|
| 00 | [`00-system-architecture.md`](00-system-architecture.md) | Topologi komponen, batas layanan, pemisahan lapisan, alur permintaan | [`system-overview.md`](../PRD/03-architecture/system-overview.md) · [`deployment-ops.md`](../PRD/03-architecture/deployment-ops.md) | **Draft** |
| 01 | [`01-availability-concurrency.md`](01-availability-concurrency.md) | `booking_slots`, exclusion constraint, row-lock, idempotensi, penomoran, scheduler | [`availability-concurrency.md`](../PRD/03-architecture/availability-concurrency.md) | **Draft** |
| 02 | [`02-approval-engine.md`](02-approval-engine.md) | Evaluator DSL, snapshot aturan, resolusi konkurensi, SLA & eskalasi | [`approval-rule-dsl.md`](../PRD/03-architecture/approval-rule-dsl.md) | **Draft** |
| 03 | [`03-authorization.md`](03-authorization.md) | Penegakan permission per route, scope di repository, penyaringan field | [`roles-permissions.md`](../PRD/00-foundation/roles-permissions.md) | **Draft** |
| 04 | [`04-authentication-session.md`](04-authentication-session.md) | Alur login, 2FA TOTP, rotasi & *reuse detection* refresh token, break-glass | [`m01-auth.md`](../PRD/02-modules/m01-auth.md) | **Draft** |
| 05 | [`05-database-design.md`](05-database-design.md) | DDL menyeluruh, indeks, partisi, strategi migration, seeding | [`data-model.md`](../PRD/03-architecture/data-model.md) | **Draft** |
| 06 | [`06-api-design.md`](06-api-design.md) | Struktur route→controller→service→repository, validasi, error mapper, versioning | [`api-conventions.md`](../PRD/03-architecture/api-conventions.md) | **Draft** |
| 07 | [`07-event-flow.md`](07-event-flow.md) | Event domain, urutan efek samping, batas transaksi, antrean & retry | lintas modul | **Draft** |
| 08 | [`08-notification-design.md`](08-notification-design.md) | SSE, Redis Pub/Sub, antrean FCM, fanout multi-instance | [`m17-notifications.md`](../PRD/02-modules/m17-notifications.md) | **Draft** |
| 09 | [`09-file-storage-design.md`](09-file-storage-design.md) | Presigned URL, pemindaian AV, siklus hidup berkas, turunan gambar | [`m06-documents.md`](../PRD/02-modules/m06-documents.md) | **Draft** |
| 10 | [`10-ai-orchestrator-design.md`](10-ai-orchestrator-design.md) | Tool calling, guardrail permission, caching, eval harness, kendali kuota | [`ai-features.md`](../PRD/03-architecture/ai-features.md) | **Draft** |
| 11 | [`11-frontend-architecture.md`](11-frontend-architecture.md) | Struktur aplikasi, state, routing, komponen kalender, permission-driven render | [`ui-foundation.md`](../PRD/04-frontend/ui-foundation.md) | **Draft** |
| 12 | [`12-mobile-architecture.md`](12-mobile-architecture.md) | Navigasi, antrean unggah, deep link, keamanan perangkat, versi paksa | [`mobile-requirements.md`](../PRD/05-mobile/mobile-requirements.md) | **Draft** |
| 13 | [`13-security-design.md`](13-security-design.md) | Ancaman & mitigasi, enkripsi, rahasia, pengerasan, penanganan kerentanan | [`security.md`](../PRD/03-architecture/security.md) · [`privacy-compliance.md`](../PRD/03-architecture/privacy-compliance.md) | **Draft** |
| 14 | [`14-performance-design.md`](14-performance-design.md) | Anggaran latensi per endpoint, strategi indeks & cache, rencana uji beban | [`nfr.md`](../PRD/03-architecture/nfr.md) | **Draft** |
| 15 | [`15-observability-logging.md`](15-observability-logging.md) | Metrik, tracing, log terstruktur, korelasi, alerting, retensi | [`deployment-ops.md`](../PRD/03-architecture/deployment-ops.md) · [`activity-log.md`](../PRD/03-architecture/activity-log.md) | **Draft** |
| 16 | [`16-infrastructure-deployment.md`](16-infrastructure-deployment.md) | Container, CI/CD, lingkungan, backup & DR, sizing, biaya | [`deployment-ops.md`](../PRD/03-architecture/deployment-ops.md) | **Draft** |
| 17 | [`17-repo-layout.md`](17-repo-layout.md) | Bentuk repositori, letak ketiga pohon `src/`, paket bersama, batas impor antar-pohon | [`system-overview.md`](../PRD/03-architecture/system-overview.md) · [`deployment-ops.md`](../PRD/03-architecture/deployment-ops.md) | **Draft** |

Seluruh berkas telah ditulis. Titik yang belum ditetapkan tidak ditebak — masing-masing tercatat pada bagian 8 berkasnya dan diringkas di [`TBD-REGISTER.md`](TBD-REGISTER.md).

---

## Bentuk baku tiap berkas

```
1. Konteks             — requirement mana yang dilayani (rujuk ID, jangan salin)
2. Keputusan Desain    — bernomor, satu baris satu keputusan
3. Alasan              — mengapa, termasuk alternatif yang ditolak
4. Rancangan           — skema, algoritma, kontrak, diagram
5. Konsekuensi         — dampak pada modul lain, batasan yang lahir
6. Risiko Teknis       — beserta mitigasinya
7. Requirement Terkait — daftar ID yang dipenuhi rancangan ini
8. TBD                 — titik yang belum ditetapkan (bila ada)
```

Setiap keputusan diberi ID `SDD-<area>-<nomor>` (contoh `SDD-AVL-01`, `SDD-APR-05`, `SDD-AUTH-03`) agar dapat dirujuk dari kode, *pull request*, dan review.

| Area | Kode | Berkas |
|---|---|---|
| System Architecture | `SYS` | 00 |
| Availability & Concurrency | `AVL` | 01 |
| Approval Engine | `APR` | 02 |
| Authorization | `AUTH` | 03 |
| Authentication & Session | `SESS` | 04 |
| Database | `DB` | 05 |
| API | `API` | 06 |
| Event Flow | `EVT` | 07 |
| Notification | `NTF` | 08 |
| File Storage | `FS` | 09 |
| AI Orchestrator | `AI` | 10 |
| Frontend | `FE` | 11 |
| Mobile | `MOB` | 12 |
| Security | `SEC` | 13 |
| Performance | `PERF` | 14 |
| Observability | `OBS` | 15 |
| Infrastructure | `INF` | 16 |
| Repo Layout | `REPO` | 17 |

---

## Batasan yang sudah ditetapkan

Berlaku bagi seluruh berkas SDD dan tidak boleh dibantah tanpa persetujuan pemilik produk:

- **PostgreSQL 15+** (`INF-01`) — bukan pilihan bebas; `tstzrange` + *exclusion constraint* diwajibkan `CI-01`
- Object storage S3-compatible (`INF-02`), Redis 7+ (`INF-03`), Node.js LTS dalam container (`INF-04`)
- API *stateless* multi-instance dengan worker terpisah (`NFR-SC-01`, `JOB-01`)
- Otorisasi ditegakkan di server pada **setiap** endpoint (`NFR-S-05`, `PM-02`)
- Chatbot bersifat *read-only* dengan filter permission di lapisan query (`BR-075`, `BR-076`)
- Seluruh operasi tulis tercatat pada activity log (`BR-071`, `AL-01`)

## Titik yang belum ditetapkan

Terkumpul di [`TBD-REGISTER.md`](TBD-REGISTER.md) — **13 terbuka · 42 tertutup**, diklasifikasi menjadi empat kelompok menurut siapa yang memutuskan dan kapan. Tidak boleh ditebak oleh penyusun SDD.

| Kelompok | Jumlah | Kapan |
|---|---|---|
| A — Kebijakan produk | 0 | Seluruhnya tertutup — `TBD-AI-D` ditutup 2 September 2026 (`SDD-AI-16`) |
| B — Parameter operasional | 13 | Setelah staging & uji beban |
| C — Pilihan teknis | 0 | Seluruhnya tertutup |
| D — Konten prompt | 0 | Seluruhnya tertutup 25 Agustus 2026 |

Open Issues tingkat requirement terkumpul di [`../PRD/06-quality/traceability.md`](../PRD/06-quality/traceability.md) bagian D.
