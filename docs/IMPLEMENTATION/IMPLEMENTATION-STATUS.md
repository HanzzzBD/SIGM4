# Status Implementasi

**Diperbarui:** 19 September 2026 — Phase 01 berjalan: `PR-01-01` tergabung ([#42](https://github.com/HanzzzBD/SIGM4/pull/42)); `PR-01-16` tergabung ([#43](https://github.com/HanzzzBD/SIGM4/pull/43), *squash*); `PR-01-15` tergabung ([#45](https://github.com/HanzzzBD/SIGM4/pull/45)); `PR-01-02` tergabung ([#46](https://github.com/HanzzzBD/SIGM4/pull/46), keputusan 16–18); `PR-01-03` tergabung ([#47](https://github.com/HanzzzBD/SIGM4/pull/47)) — dipersempit ke impor sinkron ≤ 200 baris, `PR-01-17` baru dibuka untuk sisanya (keputusan 19, rencana kini 166 PR); `PR-01-04` tergabung ([#48](https://github.com/HanzzzBD/SIGM4/pull/48)) — matriks permission + `role_version` + cache 60 detik (keputusan 20); `PR-01-05` tergabung ([#49](https://github.com/HanzzzBD/SIGM4/pull/49)) — skema `buildings`/`areas`/`rooms` + CRUD, modul `m03-locations` lahir pertama kali (keputusan 21); `PR-01-06` tergabung ([#50](https://github.com/HanzzzBD/SIGM4/pull/50)) — pohon lokasi + penonaktifan berjenjang, kerangka BR-015 menunggu `assets` (`PR-02-10`, keputusan 22); `PR-01-07` tergabung ([#51](https://github.com/HanzzzBD/SIGM4/pull/51)) — daftar aset per lokasi (kerangka), modul `m04-assets` lahir pertama kali karena `GET /rooms/{id}/assets` dimiliki `m04-assets.md`, bukan `m03-locations.md` (keputusan 23); `PR-01-08` tergabung ([#52](https://github.com/HanzzzBD/SIGM4/pull/52)) — penelusuran activity log + filter kombinasi + `ACTIVITY_LOG_VIEWED`, modul `m18-activity-log` lahir pertama kali (keputusan 24); `PR-01-09` tergabung ([#53](https://github.com/HanzzzBD/SIGM4/pull/53)) — ekspor XLSX hasil filter (`GET /activity-logs/export`) + `ACTIVITY_LOG_EXPORTED` (AL-10), dibatasi 5.000 baris sinkron karena `stored_files`/worker ekspor (`SDD-07`, `SDD-09`) belum ada — cakupan dikonfirmasi pemilik produk sebelum kode ditulis (keputusan 25); `PR-01-10` tergabung ([#54](https://github.com/HanzzzBD/SIGM4/pull/54)) — `system_settings` + `GET/PUT /settings` + validasi rentang, modul `m20-settings` lahir pertama kali; katalog awal hanya enam parameter ber-bawaan eksplisit di `FR-20.1` dan dua kelompok baru ditambahkan ke PRD Bab 11.3 (keputusan 26); `PR-01-11` tergabung ([#55](https://github.com/HanzzzBD/SIGM4/pull/55)) — skema `academic_years`/`academic_terms` + `holidays.academic_year_id` dengan invariant "tepat satu tahun ajaran aktif" di basis data; TANPA endpoint karena PRD belum mendaftarkannya (keputusan 27, butir terbuka di [log §10](logs/phase-01.md)); `PR-01-12` tergabung ([#56](https://github.com/HanzzzBD/SIGM4/pull/56)) — `work_units` + `users.work_unit_id` (expand) dan fungsi pemetaan `map_users_unit_kerja()` (migrate) tanpa penebakan; kode pengguna dan impor beralih ke `work_unit_id`, `unit_kerja` lama belum dihapus (contract `PR-08-11`); tanpa endpoint `work_units` (keputusan 28); celah endpoint kalender akademik dan `work_units` ditutup dengan `PR-01-18` baru (baris endpoint kini di PRD `m20-settings.md` §7, rencana 166 → **167** PR, keputusan 29) dan runbook pengisian master + pemetaan sebagai jembatan sampai PR itu tergabung ([`runbooks/master-data-awal.md`](runbooks/master-data-awal.md)); `PR-01-13` tergabung ([#57](https://github.com/HanzzzBD/SIGM4/pull/57)) — `student_enrollments` (kelas per tahun ajaran, `SL-01`), `POST /class-promotions` (NAIK/LULUS, `SL-02`), `GraduationService` (`SL-03`) dan titik ekstensi kewajiban siswa (`SL-04`, registri kosong sampai `PR-05-09`); pekerjaan `student-graduation` belum dipasang menunggu `SystemAuthContext` — kini `PR-02-32` (Phase 02, tinjauan arsitek); `SL-05`/`DP-04` menjadi `PR-05-26`; rencana 167 → **169** PR, dan rancangan PRD/SDD keputusan 29–30 disetujui (keputusan 30–31); `PR-01-14` tergabung ([#58](https://github.com/HanzzzBD/SIGM4/pull/58)) — `users.consent_guardian_at` (expand) dan gerbang `DP-02`/`SL-06` pada pembuatan, impor, pengaktifan kembali, dan penggantian role akun Siswa/OSIS; `NT-48` ditunda ke `PR-02-25` (keputusan 32); `PR-01-17` dibuka di `feature/PR-01-17-impor-pengguna-asinkron` — `user_import_jobs` (expand), impor > 200 baris asinkron lewat outbox + BullMQ, idempotensi hash-berkas 24 jam, `GET /users/import/{id}`; event `UserImportCompleted` terbit, konsumen `NT-52` di `PR-02-25` (keputusan 33). `PR-00-01` … `PR-00-18` tergabung ke `develop`, termasuk format ulang Prettier ([#30](https://github.com/HanzzzBD/SIGM4/pull/30)), tindak lanjut `PR-00-14` ([#32](https://github.com/HanzzzBD/SIGM4/pull/32)), tindak lanjut audit `PR-00-15` ([#34](https://github.com/HanzzzBD/SIGM4/pull/34)), `PR-00-16` ([#37](https://github.com/HanzzzBD/SIGM4/pull/37)), `PR-00-17` ([#38](https://github.com/HanzzzBD/SIGM4/pull/38)), dan `PR-00-18` ([#39](https://github.com/HanzzzBD/SIGM4/pull/39), keputusan 50–56; rencana kini 164 PR), beserta tindak lanjut graceful shutdown `PR-00-18` ([#40](https://github.com/HanzzzBD/SIGM4/pull/40), keputusan 57–61). Diverifikasi dari GitHub: #6–#40 seluruhnya tergabung, tidak ada PR terbuka. Audit konsistensi lintas dokumen selesai: 15 temuan, 12 keputusan pemilik produk. Proteksi cabang `main` dan `develop` aktif. Penyegaran dokumen pasca Phase 00 dan keputusan 62–65: [#41](https://github.com/HanzzzBD/SIGM4/pull/41). **Gerbang keluar Phase 00 menunggu infrastruktur staging nyata** — lihat [Penghalang aktif](#penghalang-aktif).

Berkas ini memiliki status **per phase dan per pull request**. Ia **tidak** memiliki status per requirement — itu milik [`../PRD/06-quality/traceability.md`](../PRD/06-quality/traceability.md). Dua tingkat berbeda, tanpa tumpang tindih:

| Pertanyaan | Dijawab oleh |
|---|---|
| "Apakah `FR-08.2` sudah terimplementasi dan terverifikasi?" | [`traceability.md`](../PRD/06-quality/traceability.md) |
| "Apakah `PR-02-17` sudah digabung? Phase 02 sampai mana?" | berkas ini |

Menyalin status requirement ke sini akan menciptakan dua sumber yang pasti berbeda pada suatu hari.

---

## Kamus status

| Status | Arti |
|---|---|
| `Not Started` | Belum ada cabang dibuat |
| `In Progress` | Ada PR terbuka atau cabang aktif |
| `In Review` | Seluruh PR terbuka, menunggu tinjauan |
| `Blocked` | Menunggu keputusan atau phase lain — **wajib disertai alasan** |
| `Done` | Seluruh PR tergabung **dan** DoD phase terpenuhi |

`Done` tanpa DoD terpenuhi bukan `Done`. Sebuah phase yang seluruh PR-nya tergabung tetapi gerbang keluarnya belum lulus berstatus `In Review`.

---

## Ringkasan phase

| Phase | Nama | Modul | PR | Status | Selesai | Catatan |
|:---:|---|:---:|:---:|---|:---:|---|
| [00](phases/phase-00.md) | Foundation | — | 18 | `In Review` | 18/18 | Seluruh 18 PR beserta tindak lanjutnya tergabung (#40 terakhir); gerbang keluar belum lulus — deploy staging nyata dan tiga lingkungan terpisah (`NFR-M-09`) belum terbukti. Kelengkapan `/health` tidak wajib di Phase 00 — diisi bertahap sampai `PR-03-20`. Butir blocking worker sebagai proses ditutup `PR-00-18`; deploy staging nyata menunggu infrastruktur — [log §10](logs/phase-00.md) |
| [01](phases/phase-01.md) | Master Data Independen | 4 | 18 | `In Progress` | 16/18 | Dimulai selagi Phase 00 `In Review` (keputusan 62); middleware otorisasi `PR-01-15` dan hash password `PR-01-16` mendahului PR endpoint (keputusan 63; keputusan 3 log phase-01); `PR-01-17` baru — impor asinkron dipisah dari `PR-01-03` (keputusan 19) |
| [02](phases/phase-02.md) | Inti Sistem | 5 | 30 | `Not Started` | 0/30 | Phase terbesar; di lintasan kritis. Dipensiunkan: `PR-02-01` → `PR-01-16`, `PR-02-09` → `PR-01-15`; `PR-02-31` baru (keputusan 9 log phase-01) |
| [03](phases/phase-03.md) | Layanan Aset & Reservasi | 6 | 23 | `Not Started` | 0/23 | Menutup `M1` |
| [04](phases/phase-04.md) | Siklus Hidup Aset | 3 | 14 | `Not Started` | 0/14 | Menutup `M2` |
| [05](phases/phase-05.md) | Penutupan Siklus | 3 | 26 | `Not Started` | 0/26 | Menutup `M3` & `M4` |
| [06](phases/phase-06.md) | Analitik | 1 | 10 | `Not Started` | 0/10 | Menutup `M5` |
| [07](phases/phase-07.md) | Integrasi & UAT | — | 14 | `Not Started` | 0/14 | |
| [08](phases/phase-08.md) | Pengerasan & Kesiapan Rilis | — | 16 | `Not Started` | 0/16 | Menutup `M6` |
| | **Total** | **22** | **169** | | **34/169** | |

## Ringkasan milestone PRD

Definisi dan kriteria keluar milestone ada di [PRD 29.2](../PRD/01-product/delivery-plan.md). Kolom **Status** di sini hanya mencerminkan kemajuan phase yang mengisinya.

| Milestone | Terisi di phase | Status | Ditutup pada |
|---|---|---|:---:|
| `M0 — Fondasi Teknis` | 00 | `In Progress` | Phase 00 |
| `M1 — Identitas & Data Induk` | 01, 02, 03 | `In Progress` | Phase 03 |
| `M2 — Mesin Persetujuan & Pemesanan` | 02, 03, 04 | `Not Started` | Phase 04 |
| `M3 — Siklus Operasional` | 03, 04, 05 | `Not Started` | Phase 05 |
| `M4 — Kontrol & Siklus Hidup Aset` | 03, 04, 05 | `Not Started` | Phase 05 |
| `M5 — Insight, Notifikasi & AI` | 01, 02, 03, 06 | `In Progress` | Phase 06 |
| `M6 — Pengerasan & Kesiapan Rilis` | 07, 08 | `Not Started` | Phase 08 |

## Status gerbang rilis

Definisi tiap gerbang: [PRD 29.3](../PRD/01-product/delivery-plan.md). Urutan penutupannya: [`RELEASE-PLAN.md` §2](RELEASE-PLAN.md).

| Gerbang | `GL-01` | `GL-02` | `GL-03` | `GL-04` | `GL-05` | `GL-06` | `GL-07` | `GL-08` | `GL-09` | `GL-10` | `GL-11` | `GL-12` |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| Status | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| Phase | 07 | 07 | 08 | 08 | 07 | 08 | 08 | 08 | 07 | 08 | 08 | 08 |

**0 dari 12 gerbang terpenuhi.** Satu gerbang gagal = rilis ditunda.

---

## Status pull request

Kolom **PR** merujuk nomor pull request di repositori setelah dibuka. Judul lengkap, kompleksitas, dependensi, dan acceptance tiap PR ada di berkas phase-nya dan tidak disalin ke sini.

### Phase 00 — Foundation · `In Review`

| ID | Status | PR | Catatan |
|---|---|:---:|---|
| `PR-00-01` | `Done` | [#6](https://github.com/HanzzzBD/SIGM4/pull/6) | Kerangka repo, TypeScript, lint, struktur folder |
| `PR-00-02` | `Done` | [#9](https://github.com/HanzzzBD/SIGM4/pull/9) | Aturan lint impor antar-modul |
| `PR-00-03` | `Done` | [#11](https://github.com/HanzzzBD/SIGM4/pull/11) | Dockerfile multi-stage + compose pengembangan |
| `PR-00-04` | `Done` | [#14](https://github.com/HanzzzBD/SIGM4/pull/14) | Koneksi DB, helper transaksi, base repository ber-`AuthContext` |
| `PR-00-05` | `Done` | [#16](https://github.com/HanzzzBD/SIGM4/pull/16) → [#18](https://github.com/HanzzzBD/SIGM4/pull/18) | Migration runner + `0001` ekstensi + `0002` enum. Tergabung ke `develop` lewat `#18` — lihat pergeseran di bawah |
| `PR-00-06` | `Done` | [#20](https://github.com/HanzzzBD/SIGM4/pull/20) | Shared kernel: `Clock`, `ErrorMapper`, `request_id`, logger terstruktur |
| `PR-00-07` | `Done` | [#21](https://github.com/HanzzzBD/SIGM4/pull/21) | `DocumentNumberService` + tabel `document_counters` |
| `PR-00-08` | `Done` | [#23](https://github.com/HanzzzBD/SIGM4/pull/23) | `BusinessCalendarService` + `work_days`/`holidays` |
| `PR-00-09` | `Done` | [#24](https://github.com/HanzzzBD/SIGM4/pull/24) | Registri route + validasi permission saat startup + OpenAPI |
| `PR-00-10` | `Done` | [#25](https://github.com/HanzzzBD/SIGM4/pull/25) | `idempotency_keys` + penjaga idempotensi |
| `PR-00-11` | `Done` | [#26](https://github.com/HanzzzBD/SIGM4/pull/26) | Worker skeleton: antrean, *distributed lock*, penjadwal |
| `PR-00-12` | `Done` | [#27](https://github.com/HanzzzBD/SIGM4/pull/27) | Tabel `event_outbox` + dispatcher |
| `PR-00-13` | `Done` | [#28](https://github.com/HanzzzBD/SIGM4/pull/28) · [#29](https://github.com/HanzzzBD/SIGM4/pull/29) | `AuditLogger` + `activity_logs` terpartisi + rantai hash |
| `PR-00-14` | `Done` | [#31](https://github.com/HanzzzBD/SIGM4/pull/31) | Health endpoint (live/ready/ringkasan). Tindak lanjut `SERVICE_NOT_READY`: [#32](https://github.com/HanzzzBD/SIGM4/pull/32) |
| `PR-00-15` | `Done` | [#33](https://github.com/HanzzzBD/SIGM4/pull/33) | Header keamanan + rate limit berjenjang, ditambah ujung rantai HTTP (`X-Request-Id`, 404, `errorMapper`) — keputusan 31. Tindak lanjut audit (keputusan 32–38): [#34](https://github.com/HanzzzBD/SIGM4/pull/34) |
| `PR-00-16` | `Done` | [#37](https://github.com/HanzzzBD/SIGM4/pull/37) | Skema RBAC + seed permission, role, matriks ber-scope, `work_days`. Seed parameter sistem pindah ke `PR-01-10`, tabel `roles`/`permissions`/`role_permissions` ditarik dari `PR-01-01` — [log §3](logs/phase-00.md) |
| `PR-00-17` | `Done` | [#38](https://github.com/HanzzzBD/SIGM4/pull/38) | Pipeline CI `ci.yml` (lint → uji → integrasi+cakupan → build → CodeQL → SCA → Trivy); required check `CI lulus` aktif di `develop`; runtime image tanpa npm (keputusan 47); berkas pnpm diabaikan (keputusan 44) — [log §2](logs/phase-00.md) |
| `PR-00-18` | `Done` | [#39](https://github.com/HanzzzBD/SIGM4/pull/39) | Deploy staging (`deploy/staging/`, job `publikasi-image` + `deploy-staging`); dibuktikan pada staging tiruan — infrastruktur nyata belum ada (keputusan 50). Tindak lanjut graceful shutdown worker + API tergabung: [#40](https://github.com/HanzzzBD/SIGM4/pull/40) (keputusan 57–61) — [log §2](logs/phase-00.md) |

### Phase 01 — Master Data Independen · `In Progress`

| ID | Status | PR | Catatan |
|---|---|:---:|---|
| `PR-01-01` | `Done` | [#42](https://github.com/HanzzzBD/SIGM4/pull/42) | Skema `users` + kolom baku `roles`; cabang `feature/PR-01-01-skema-users` (keputusan 1–6 [log phase-01 §2](logs/phase-01.md)) |
| `PR-01-02` | `Done` | [#46](https://github.com/HanzzzBD/SIGM4/pull/46) | CRUD pengguna + soft delete + aturan Administrator terakhir — keputusan 16–18 [log phase-01 §2](logs/phase-01.md) |
| `PR-01-03` | `Done` | [#47](https://github.com/HanzzzBD/SIGM4/pull/47) | Impor massal pengguna (CSV/XLSX), sinkron ≤ 200 baris — keputusan 19 [log phase-01 §2](logs/phase-01.md) |
| `PR-01-04` | `Done` | [#48](https://github.com/HanzzzBD/SIGM4/pull/48) | Matriks permission + `role_version` + cache 60 detik — keputusan 20 [log phase-01 §2](logs/phase-01.md) |
| `PR-01-05` | `Done` | [#49](https://github.com/HanzzzBD/SIGM4/pull/49) | Skema `buildings`/`areas`/`rooms` + CRUD — keputusan 21 [log phase-01 §2](logs/phase-01.md) |
| `PR-01-06` | `Done` | [#50](https://github.com/HanzzzBD/SIGM4/pull/50) | Pohon lokasi + penonaktifan berjenjang — keputusan 22 [log phase-01 §2](logs/phase-01.md) |
| `PR-01-07` | `Done` | [#51](https://github.com/HanzzzBD/SIGM4/pull/51) | Daftar aset per lokasi (kerangka), modul `m04-assets` lahir pertama kali — keputusan 23 [log phase-01 §2](logs/phase-01.md) |
| `PR-01-08` | `Done` | [#52](https://github.com/HanzzzBD/SIGM4/pull/52) | Penelusuran activity log + filter + detail sebelum/sesudah, modul `m18-activity-log` lahir pertama kali — keputusan 24 [log phase-01 §2](logs/phase-01.md) |
| `PR-01-09` | `Done` | [#53](https://github.com/HanzzzBD/SIGM4/pull/53) | Ekspor activity log (XLSX, sinkron ≤ 5.000 baris) + `ACTIVITY_LOG_EXPORTED` — keputusan 25 [log phase-01 §2](logs/phase-01.md) |
| `PR-01-10` | `Done` | [#54](https://github.com/HanzzzBD/SIGM4/pull/54) | `system_settings` + seed parameter bawaan + `GET/PUT /settings` + validasi rentang, keputusan 26 [log phase-01 §2](logs/phase-01.md) |
| `PR-01-11` | `Done` | [#55](https://github.com/HanzzzBD/SIGM4/pull/55) | Kalender akademik: skema `academic_years`/`academic_terms` + `holidays.academic_year_id`, invariant tepat-satu-aktif di DB, tanpa endpoint — keputusan 27 [log phase-01 §2](logs/phase-01.md) |
| `PR-01-12` | `Done` | [#56](https://github.com/HanzzzBD/SIGM4/pull/56) | `work_units` + `users.work_unit_id` + fungsi pemetaan `map_users_unit_kerja()`; kode pengguna/impor beralih ke `work_unit_id`, kolom lama belum dihapus — keputusan 28 [log phase-01 §2](logs/phase-01.md) |
| `PR-01-13` | `Done` | [#57](https://github.com/HanzzzBD/SIGM4/pull/57) | Siklus akun siswa: `student_enrollments`, kenaikan kelas massal, penonaktifan lulusan, titik ekstensi kewajiban (SL-04) — keputusan 30 [log phase-01 §2](logs/phase-01.md) |
| `PR-01-14` | `Done` | [#58](https://github.com/HanzzzBD/SIGM4/pull/58) | Gerbang persetujuan wali: `users.consent_guardian_at`, akun siswa tanpa penanda tidak dapat dibuat/diaktifkan (DP-02, SL-06); `NT-48` ditunda ke M-17 — keputusan 32 [log phase-01 §2](logs/phase-01.md) |
| `PR-01-15` | `Done` | [#45](https://github.com/HanzzzBD/SIGM4/pull/45) | Middleware otorisasi + `healthSummaryRouter` (keputusan 13–15 [log phase-01 §2](logs/phase-01.md)) |
| `PR-01-16` | `Done` | [#43](https://github.com/HanzzzBD/SIGM4/pull/43) | Hash password Argon2id + kebijakan kata sandi (keputusan 7–11); sisa `NFR-S-03a` → `PR-02-31` |
| `PR-01-17` | `In Progress` | — | Impor massal pengguna — asinkron > 200 baris, idempotensi file-hash *(baru, keputusan 19)*; `user_import_jobs`, `GET /users/import/{id}`, event `UserImportCompleted` — keputusan 33 [log phase-01](logs/phase-01.md) |
| `PR-01-18` | `Not Started` | — | Endpoint master data Lampiran E: tahun ajaran & semester, hari libur, hari kerja, unit kerja *(baru, keputusan 29)* — menutup butir terbuka `PR-01-11`/`PR-01-12` |

### Phase 02 — Inti Sistem · `Not Started`

| ID | Status | PR | Catatan |
|---|---|:---:|---|
| `PR-02-01` … `PR-02-32` (tanpa `PR-02-01` dan `PR-02-09`, pensiun) | `Not Started` | — | Rincian: [`phases/phase-02.md` §7](phases/phase-02.md) |

### Phase 03 — Layanan Aset & Reservasi · `Not Started`

| ID | Status | PR | Catatan |
|---|---|:---:|---|
| `PR-03-01` … `PR-03-23` | `Not Started` | — | Rincian: [`phases/phase-03.md` §7](phases/phase-03.md) |

### Phase 04 — Siklus Hidup Aset · `Not Started`

| ID | Status | PR | Catatan |
|---|---|:---:|---|
| `PR-04-01` … `PR-04-14` | `Not Started` | — | Rincian: [`phases/phase-04.md` §7](phases/phase-04.md) |

### Phase 05 — Penutupan Siklus · `Not Started`

| ID | Status | PR | Catatan |
|---|---|:---:|---|
| `PR-05-01` … `PR-05-26` | `Not Started` | — | Rincian: [`phases/phase-05.md` §7](phases/phase-05.md) |

### Phase 06 — Analitik · `Not Started`

| ID | Status | PR | Catatan |
|---|---|:---:|---|
| `PR-06-01` … `PR-06-10` | `Not Started` | — | Rincian: [`phases/phase-06.md` §7](phases/phase-06.md) |

### Phase 07 — Integrasi & UAT · `Not Started`

| ID | Status | PR | Catatan |
|---|---|:---:|---|
| `PR-07-01` … `PR-07-14` | `Not Started` | — | Rincian: [`phases/phase-07.md` §7](phases/phase-07.md) |

### Phase 08 — Pengerasan & Kesiapan Rilis · `Not Started`

| ID | Status | PR | Catatan |
|---|---|:---:|---|
| `PR-08-01` … `PR-08-16` | `Not Started` | — | Rincian: [`phases/phase-08.md` §7](phases/phase-08.md) |

**Cara memakai tabel ini.** Saat sebuah phase dimulai, ganti barisnya menjadi satu baris per PR. Selama phase belum dimulai, satu baris ringkas lebih jujur daripada 163 baris `Not Started` yang tidak ada yang membacanya.

---

## Penghalang aktif

| Yang terhalang | Menunggu | Sejak | Penanggung jawab |
|---|---|---|---|
| Gerbang keluar Phase 00 | Infrastruktur staging nyata — VPS, domain, PostgreSQL terkelola, object storage ber-region Indonesia — lalu cabang `staging`, environment, dan secret deploy (keputusan 50, 55); seleksi vendor observability ber-region Indonesia (keputusan 65) — [log §10](logs/phase-00.md) | 15 September 2026 | Pemilik produk / operator |
| Phase 08 | `TBD-SEC-A` (penyedia pentest) · `TBD-OBS-B` (penerima alarm) | — | Pemilik produk / sekolah |

Daftar TBD lengkap beserta pertanyaannya: [`../SDD/TBD-REGISTER.md`](../SDD/TBD-REGISTER.md) — **13 terbuka, 42 tertutup**. Jadwal penutupan yang diharapkan: [`ROADMAP.md` §8](ROADMAP.md).

**Tidak ada penghalang TBD pada pengerjaan Phase 00–08, dan tidak ada lagi gerbang rilis yang tertahan oleh keputusan yang belum diambil.** Dua belas TBD ditutup 25 Agustus 2026 dalam empat batch. Migrasi penyedia LLM 2 September 2026 sempat membuka `TBD-AI-D` (kelompok A), dan surat pernyataan Kepala Sekolah menutupnya pada hari yang sama (`SDD-AI-16`) — `GL-07` bagian chatbot terbuka. Tiga belas TBD kelompok B masih terbuka tetapi tidak memblokir apa pun: seluruhnya parameter yang dikalibrasi Phase 07–08 setelah data staging tersedia. `GL-07` masih menunggu satu butir administratif — salinan resmi surat persetujuan lintas yurisdiksi, yang nomornya belum tercatat (`SDD-AI-16`); itu dokumen yang belum lengkap, bukan keputusan yang belum diambil.

## Pergeseran jadwal tercatat

| Tanggal | Phase | Pergeseran | Sebab | Dampak pada lintasan kritis |
|---|---|---|---|---|
| 15 September 2026 | 00 → 01 | Phase 01 boleh dimulai sebelum gerbang keluar Phase 00 lulus | Staging nyata belum tersedia (keputusan 50). `DELIVERY-PLAN §10` butir 1 dipakai: butir yang tertunda — deploy staging nyata, tiga lingkungan terpisah, seleksi vendor observability — tidak berada di lintasan kritis §3 dan tidak dituntut PR Phase 01 mana pun (keputusan 62) | Tidak ada, **selama** infrastruktur tersedia sebelum gerbang keluar Phase 01, yang menuntut verifikasi QA di staging (`BRANCHING §5`) |
| 7 September 2026 | 00 | Tidak ada pergeseran jadwal; satu putaran integrasi terbuang | Tiga PR ditumpuk (`#15` ← `#16` ← `#17`) dan seluruhnya di-*squash-merge*. Squash melahirkan commit baru berisi hal yang sama dengan hash berbeda, sehingga tiap tingkat tumpukan melihat perubahan yang sama masuk dua kali; dan karena tiap PR menyasar basenya sendiri, hanya `#15` yang benar-benar mencapai `develop`. Cabang antara kemudian dihapus. Dipulihkan lewat `#18`. | Tidak ada — seluruh isi terpulihkan utuh. **Untuk `PR-00-06` ke atas: satu PR menyasar `develop` langsung; bila terpaksa bertumpuk, pakai merge commit, bukan squash.** |

Pergeseran dicatat di sini **saat terjadi**, bukan saat direkap. Pergeseran yang diserap diam-diam adalah pergeseran yang muncul kembali sebagai kejutan menjelang go-live.

---

## Cara memperbarui berkas ini

1. Ubah status PR saat cabangnya dibuka dan saat PR-nya digabung.
2. Ubah status phase hanya saat seluruh PR-nya tergabung **dan** DoD phase-nya terpenuhi.
3. Isi tanggal pada "Diperbarui" setiap kali menyunting.
4. Setiap `Blocked` wajib menyebut apa yang ditunggu dan sejak kapan. `Blocked` tanpa alasan tidak dapat diselesaikan siapa pun.
5. Jangan menambahkan status per requirement. Bila muncul dorongan melakukannya, yang dicari ada di [`traceability.md`](../PRD/06-quality/traceability.md).

---

*Berkas ini melaporkan kemajuan pengerjaan. Ia tidak memuat requirement, keputusan desain, maupun business rule.*
