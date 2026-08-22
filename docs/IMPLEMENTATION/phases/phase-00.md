# Phase 00 — Foundation

| | |
|---|---|
| **Milestone PRD** | `M0 — Fondasi Teknis` — [delivery-plan.md](../../PRD/01-product/delivery-plan.md) |
| **Status** | `Not Started` |
| **Modul PRD** | — (infrastruktur; belum ada modul fungsional) |
| **Bergantung pada** | — |
| **Memblokir** | Seluruh phase berikutnya |
| **Log** | [`logs/phase-00.md`](../logs/phase-00.md) |

---

## 1. Objective

Setelah phase ini, sebuah perubahan kode dapat berjalan dari *commit* hingga *staging* tanpa campur tangan manual: pipeline hijau, migration terjalankan, `/health` melaporkan seluruh dependensi, dan katalog permission ter-*seed*. Belum ada fitur yang dapat dipakai pengguna — yang selesai adalah **jalur pengirimannya**.

## 2. Scope

**Termasuk**

- Kerangka proyek sesuai struktur [SDD-SYS §4.1](../../SDD/00-system-architecture.md), termasuk aturan lint impor antar-modul
- *Shared kernel*: `Clock`, `ErrorMapper`, `EventBus`, `AuditLogger`, `DocumentNumberService`, `BusinessCalendarService`
- Container multi-stage, Docker Compose untuk pengembangan (PostgreSQL, Redis, MinIO, ClamAV)
- Pipeline CI/CD lengkap dengan gerbang kualitas
- Migration runner, ekstensi, dan seluruh tipe enum
- Registri route + validasi permission saat *startup*
- Worker skeleton: antrean, *distributed lock*, tabel outbox dan dispatcher-nya
- Health endpoint, log terstruktur, korelasi `request_id`
- Seed: 71 permission, 7 role bawaan, `work_days`, parameter sistem

**Tidak termasuk**

- Tabel `booking_slots` dan constraint-nya → **Phase 02** (butuh `rooms` dan `assets`)
- Endpoint fungsional apa pun → mulai **Phase 01**
- Observability lengkap (tracing, seluruh alarm) → **Phase 08**

## 3. Dependencies

Tidak ada. Ini titik masuk proyek.

## 4. Referensi PRD

| Berkas | ID yang dilayani |
|---|---|
| [`roles-permissions.md`](../../PRD/00-foundation/roles-permissions.md) | Lampiran C — 71 kode permission, `PM-01` … `PM-06` |
| [`conventions.md`](../../PRD/00-foundation/conventions.md) | `CAL-01` … `CAL-03`, `work_days` |
| [`nfr.md`](../../PRD/03-architecture/nfr.md) | `NFR-M-01` `NFR-M-02` `NFR-M-04` `NFR-M-06` `NFR-M-09` |
| [`deployment-ops.md`](../../PRD/03-architecture/deployment-ops.md) | `INF-01` … `INF-07`, `CD-01` … `CD-07`, `OBS-01` … `OBS-07` |
| [`api-conventions.md`](../../PRD/03-architecture/api-conventions.md) | Bab 17.1–17.3 |
| [`security.md`](../../PRD/03-architecture/security.md) | `NFR-S-11`, `SEC-CFG-01` … `SEC-CFG-04`, `ST-01` `ST-02` |

## 5. Referensi SDD

| Berkas | Keputusan yang diterapkan |
|---|---|
| [`00-system-architecture.md`](../../SDD/00-system-architecture.md) | `SDD-SYS-01` … `SDD-SYS-09` |
| [`05-database-design.md`](../../SDD/05-database-design.md) | `SDD-DB-01` … `SDD-DB-03`, `SDD-DB-08`, `SDD-DB-10`, `SDD-DB-11` |
| [`06-api-design.md`](../../SDD/06-api-design.md) | `SDD-API-01` … `SDD-API-04` |
| [`07-event-flow.md`](../../SDD/07-event-flow.md) | `SDD-EVT-01`, `SDD-EVT-03`, `SDD-EVT-04` (infrastruktur outbox) |
| [`15-observability-logging.md`](../../SDD/15-observability-logging.md) | `SDD-OBS-02` … `SDD-OBS-04`, `SDD-OBS-06` |
| [`16-infrastructure-deployment.md`](../../SDD/16-infrastructure-deployment.md) | `SDD-INF-01` … `SDD-INF-09` |
| [`17-repo-layout.md`](../../SDD/17-repo-layout.md) | `SDD-REPO-01` … `SDD-REPO-10` |

## 6. Deliverables

- Monorepo npm workspaces (`SDD-REPO-01` … `SDD-REPO-03`): `apps/api` dengan struktur `src/shared`, `src/modules`, `src/api`, `src/worker`; kerangka `apps/web` dan `apps/mobile`; paket bersama `packages/schemas` (`SDD-REPO-05`)
- Aturan lint impor yang menggagalkan CI saat batas modul dilanggar
- `Dockerfile` multi-stage non-root; `docker-compose.yml` pengembangan
- Pipeline CI dengan gerbang cakupan dan pemindaian keamanan
- Migration `0001`–`0003` (ekstensi, enum, tabel inti RBAC)
- Seed permission yang dapat diverifikasi terhadap Lampiran C
- `/health/live`, `/health/ready`, `/health`
- Deploy staging otomatis + *smoke test*

## 7. Pull Request Plan

| PR | Judul | Kompleksitas | Bergantung | FR/SDD | Acceptance |
|---|---|:---:|---|---|---|
| `PR-00-01` | Kerangka repo, TypeScript, lint, struktur folder | M | — | `SDD-SYS-01/02`, `SDD-REPO-01` … `SDD-REPO-03`, `SDD-REPO-07/08` | `npm run lint` & `build` hijau; impor lintas lapisan ditolak; impor lintas pohon `apps/*` ditolak |
| `PR-00-02` | Aturan lint impor antar-modul | S | 01 | `SDD-SYS-02` | Impor `modules/*/repositories/*` dari modul lain gagal CI |
| `PR-00-03` | Dockerfile multi-stage + compose pengembangan | M | 01 | `SDD-INF-01/02` | `docker compose up` menyalakan seluruh dependensi |
| `PR-00-04` | Koneksi DB, helper transaksi, base repository ber-`AuthContext` | M | 01 | `SDD-AUTH-02`, `SDD-SYS-06` | Metode repository tanpa `ctx` gagal kompilasi |
| `PR-00-05` | Migration runner + `0001` ekstensi + `0002` enum | M | 04 | `SDD-DB-02/08` | `btree_gist` aktif; seluruh enum Bab 11.3 terbentuk |
| `PR-00-06` | Shared kernel: `Clock`, `ErrorMapper`, `request_id`, logger terstruktur | M | 04 | `SDD-SYS-06/07`, `SDD-OBS-02/03/04` | `new Date()` di luar `shared/clock` ditolak lint; log ter-*redact* |
| `PR-00-07` | `DocumentNumberService` + tabel `document_counters` | S | 05 | `SEQ-01` … `SEQ-04`, `SDD-AVL-09` | 1.000 permintaan paralel menghasilkan 1.000 nomor unik |
| `PR-00-08` | `BusinessCalendarService` + `work_days`/`holidays` | M | 05 | `CAL-01` … `CAL-03`, `SDD-APR-06` | Hitung jam kerja melewati akhir pekan & hari libur benar |
| `PR-00-09` | Registri route + validasi permission saat startup + OpenAPI | M | 06 | `PM-01`, `SDD-API-02/03`, `SDD-AUTH-01` | Route tanpa deklarasi permission menggagalkan *bootstrap* |
| `PR-00-10` | `idempotency_keys` + middleware idempotensi | M | 05, 09 | `ID-01` … `ID-05`, `SDD-AVL-08` | Kunci sama + body sama → respons tersimpan; body beda → 409 |
| `PR-00-11` | Worker skeleton: antrean, *distributed lock*, penjadwal | M | 06 | `JOB-01` `JOB-02` `JOB-04`, `SDD-AVL-10` | Dua instance worker → job dieksekusi tepat sekali |
| `PR-00-12` | Tabel `event_outbox` + dispatcher | M | 11 | `SDD-EVT-03/04/09` | Event terbit hanya setelah commit; urut per agregat |
| `PR-00-13` | `AuditLogger` + `activity_logs` terpartisi + rantai hash | L | 05, 06 | `AL-01` `AL-03a` `AL-03b`, `NFR-S-03d`, `SDD-DB-07/09` | Partisi bulan berjalan ada; rantai terverifikasi; akun app tanpa UPDATE/DELETE |
| `PR-00-14` | Health endpoint (live/ready/ringkasan) | S | 06 | `NFR-A-07`, `OBS-06`, `SDD-OBS-06` | `llm`/`fcm` mati tidak membuat `ready` gagal |
| `PR-00-15` | Header keamanan + rate limit berjenjang | M | 09 | `NFR-S-07` `NFR-S-11`, `SDD-SEC-03/05` | CSP tanpa `unsafe-inline`; kelas limit terpisah aktif |
| `PR-00-16` | Seed: 71 permission, 7 role, matriks, `work_days`, parameter | M | 05 | Lampiran C, `SDD-DB-10` | Uji membandingkan hasil seed dengan Lampiran C baris per baris |
| `PR-00-17` | Pipeline CI: lint → uji → SAST → SCA → build → image scan | L | 01, 03 | `CD-01` `CD-02`, `ST-01` `ST-02` | Cakupan < 70% atau kerentanan High → pipeline merah |
| `PR-00-18` | Deploy staging + job migration + smoke test | M | 17 | `CD-03` `CD-04` `CD-07`, `SDD-INF-03/04` | Merge ke `staging` men-deploy lingkungan staging otomatis (`CD-03`) |

## 8. Task Breakdown

### `PR-00-04` — Base repository ber-`AuthContext`
- [ ] Definisikan tipe `AuthContext` (`SDD-AUTH-02` §4.2)
- [ ] Base repository dengan `ctx` sebagai parameter **wajib**, tanpa *overload* tanpa `ctx`
- [ ] Helper transaksi yang meneruskan `ctx` ke seluruh operasi di dalamnya
- [ ] Uji arsitektur: metode repository tanpa `ctx` gagal kompilasi

### `PR-00-09` — Registri route
- [ ] `defineRoute()` dengan field wajib `permission`, `params`, `response`, `rateLimitClass`
- [ ] Pemindaian saat *bootstrap*; route tanpa `permission` dan tanpa `public: true` → `throw`
- [ ] Generator OpenAPI dari skema route
- [ ] Uji: menambah route tanpa permission menggagalkan startup

### `PR-00-13` — Activity log
- [ ] Tabel terpartisi RANGE per bulan + indeks (`SDD-DB` §4.4)
- [ ] Job pembuat partisi 3 bulan ke depan
- [ ] `AuditLogger.write()` sinkron di dalam transaksi (`SDD-EVT-08`)
- [ ] Rantai hash `prev_hash`/`row_hash` + job verifikasi harian
- [ ] Cabut `UPDATE`/`DELETE` dari akun aplikasi (`AL-03b`)
- [ ] Kegagalan tulis log → alarm, **tidak** rollback transaksi (`AL-08`)

### `PR-00-16` — Seed permission
- [ ] Migration seed 70 kode dari Lampiran C, idempoten (`ON CONFLICT DO UPDATE`)
- [ ] Seed 7 role + matriks Bab 18
- [ ] Tandai permission inti 🔒 agar tidak dapat dicabut (`FR-02.2 A1`)
- [ ] Uji pembanding: hasil seed = Lampiran C, tanpa selisih

## 9. Acceptance Checklist

- [ ] Pipeline hijau dari commit hingga deploy staging tanpa langkah manual
- [ ] `/health` melaporkan status DB, Redis, object storage, AV, FCM, LLM (`OBS-06`)
- [ ] Route tanpa deklarasi permission menggagalkan *bootstrap* (`PM-01`)
- [ ] Seed permission identik dengan Lampiran C
- [ ] Dua instance worker tidak menjalankan job yang sama dua kali (`JOB-02`)
- [ ] Log produksi tidak memuat satu pun field pada daftar tolak (`SDD-OBS-04`)
- [ ] Rantai hash activity log terverifikasi pada data uji
- [ ] Tiga lingkungan berdiri dan terpisah (`NFR-M-09`)

## 10. Risks

| Risiko | Dampak | Mitigasi | Rujukan |
|---|---|---|---|
| Fondasi dianggap "tidak menghasilkan fitur" lalu dipersingkat | Seluruh phase berikutnya menanggung utang teknis | Gerbang keluar phase ini eksplisit dan tidak dapat dilewati | `DL-02` |
| Ekstensi `btree_gist` tidak tersedia di penyedia terpilih | `CI-01` mustahil ditegakkan | Diverifikasi di `PR-00-05` — bila gagal, penyedia harus diganti | `INF-01`, **TBD-INF-A** |
| Rantai hash memperlambat setiap operasi tulis | Regresi performa sejak awal | Diukur di phase ini; ada jalur mundur ke perhitungan batch | `SDD-DB` §6 |
| Aturan lint impor terlalu longgar | Batas modul luruh sebelum Phase 03 | Uji negatif: impor terlarang harus benar-benar gagal CI | `SDD-SYS-02` |

## 11. Rollback Strategy

| Skenario | Tindakan |
|---|---|
| PR gagal di staging | Revert commit merge; staging kembali ke image sebelumnya |
| Migration bermasalah | Jalankan migration `down`; phase ini belum punya data produksi sehingga *reset* penuh masih aman |
| Phase perlu diulang | Tidak ada data produksi — repositori dapat di-*reset* ke tag `phase-00-start` |

Ini satu-satunya phase yang boleh di-*reset* total. Setelah Phase 01, aturan expand→migrate→contract (`SDD-DB-08`) berlaku penuh.

## 12. Definition of Done

**DoD dasar** — seluruh butir [PRD 29.5](../../PRD/01-product/delivery-plan.md) berlaku.

**Tambahan khusus phase ini:**

- [ ] Kriteria keluar `M0` PRD terpenuhi: pipeline hijau · deploy staging otomatis · `/health` melaporkan seluruh dependensi
- [ ] Seluruh 18 PR ter-*merge* ke `develop`
- [ ] `scripts/audit_docs.py` masih LULUS (dokumentasi tidak rusak oleh perubahan kode)
- [ ] Log phase ([`logs/phase-00.md`](../logs/phase-00.md)) terisi keputusan implementasi dan blocker yang muncul

---

*Phase ini tidak memuat requirement maupun keputusan desain baru. Setiap pernyataan merujuk PRD atau SDD.*
