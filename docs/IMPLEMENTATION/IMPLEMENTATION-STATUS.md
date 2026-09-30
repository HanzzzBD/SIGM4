# Status Implementasi

**Diperbarui:** 20 September 2026 — Phase 01 berjalan: `PR-01-01` tergabung ([#42](https://github.com/HanzzzBD/SIGM4/pull/42)); `PR-01-16` tergabung ([#43](https://github.com/HanzzzBD/SIGM4/pull/43), *squash*); `PR-01-15` tergabung ([#45](https://github.com/HanzzzBD/SIGM4/pull/45)); `PR-01-02` tergabung ([#46](https://github.com/HanzzzBD/SIGM4/pull/46), keputusan 16–18); `PR-01-03` tergabung ([#47](https://github.com/HanzzzBD/SIGM4/pull/47)) — dipersempit ke impor sinkron ≤ 200 baris, `PR-01-17` baru dibuka untuk sisanya (keputusan 19, rencana kini 166 PR); `PR-01-04` tergabung ([#48](https://github.com/HanzzzBD/SIGM4/pull/48)) — matriks permission + `role_version` + cache 60 detik (keputusan 20); `PR-01-05` tergabung ([#49](https://github.com/HanzzzBD/SIGM4/pull/49)) — skema `buildings`/`areas`/`rooms` + CRUD, modul `m03-locations` lahir pertama kali (keputusan 21); `PR-01-06` tergabung ([#50](https://github.com/HanzzzBD/SIGM4/pull/50)) — pohon lokasi + penonaktifan berjenjang, kerangka BR-015 menunggu `assets` (`PR-02-10`, keputusan 22); `PR-01-07` tergabung ([#51](https://github.com/HanzzzBD/SIGM4/pull/51)) — daftar aset per lokasi (kerangka), modul `m04-assets` lahir pertama kali karena `GET /rooms/{id}/assets` dimiliki `m04-assets.md`, bukan `m03-locations.md` (keputusan 23); `PR-01-08` tergabung ([#52](https://github.com/HanzzzBD/SIGM4/pull/52)) — penelusuran activity log + filter kombinasi + `ACTIVITY_LOG_VIEWED`, modul `m18-activity-log` lahir pertama kali (keputusan 24); `PR-01-09` tergabung ([#53](https://github.com/HanzzzBD/SIGM4/pull/53)) — ekspor XLSX hasil filter (`GET /activity-logs/export`) + `ACTIVITY_LOG_EXPORTED` (AL-10), dibatasi 5.000 baris sinkron karena `stored_files`/worker ekspor (`SDD-07`, `SDD-09`) belum ada — cakupan dikonfirmasi pemilik produk sebelum kode ditulis (keputusan 25); `PR-01-10` tergabung ([#54](https://github.com/HanzzzBD/SIGM4/pull/54)) — `system_settings` + `GET/PUT /settings` + validasi rentang, modul `m20-settings` lahir pertama kali; katalog awal hanya enam parameter ber-bawaan eksplisit di `FR-20.1` dan dua kelompok baru ditambahkan ke PRD Bab 11.3 (keputusan 26); `PR-01-11` tergabung ([#55](https://github.com/HanzzzBD/SIGM4/pull/55)) — skema `academic_years`/`academic_terms` + `holidays.academic_year_id` dengan invariant "tepat satu tahun ajaran aktif" di basis data; TANPA endpoint karena PRD belum mendaftarkannya (keputusan 27, butir terbuka di [log §10](logs/phase-01.md)); `PR-01-12` tergabung ([#56](https://github.com/HanzzzBD/SIGM4/pull/56)) — `work_units` + `users.work_unit_id` (expand) dan fungsi pemetaan `map_users_unit_kerja()` (migrate) tanpa penebakan; kode pengguna dan impor beralih ke `work_unit_id`, `unit_kerja` lama belum dihapus (contract `PR-08-11`); tanpa endpoint `work_units` (keputusan 28); celah endpoint kalender akademik dan `work_units` ditutup dengan `PR-01-18` baru (baris endpoint kini di PRD `m20-settings.md` §7, rencana 166 → **167** PR, keputusan 29) dan runbook pengisian master + pemetaan sebagai jembatan sampai PR itu tergabung ([`runbooks/master-data-awal.md`](runbooks/master-data-awal.md)); `PR-01-13` tergabung ([#57](https://github.com/HanzzzBD/SIGM4/pull/57)) — `student_enrollments` (kelas per tahun ajaran, `SL-01`), `POST /class-promotions` (NAIK/LULUS, `SL-02`), `GraduationService` (`SL-03`) dan titik ekstensi kewajiban siswa (`SL-04`, registri kosong sampai `PR-05-09`); pekerjaan `student-graduation` belum dipasang menunggu `SystemAuthContext` — kini `PR-02-32` (Phase 02, tinjauan arsitek); `SL-05`/`DP-04` menjadi `PR-05-26`; rencana 167 → **169** PR, dan rancangan PRD/SDD keputusan 29–30 disetujui (keputusan 30–31); `PR-01-14` tergabung ([#58](https://github.com/HanzzzBD/SIGM4/pull/58)) — `users.consent_guardian_at` (expand) dan gerbang `DP-02`/`SL-06` pada pembuatan, impor, pengaktifan kembali, dan penggantian role akun Siswa/OSIS; `NT-48` ditunda ke `PR-02-25` (keputusan 32); `PR-01-17` tergabung ([#59](https://github.com/HanzzzBD/SIGM4/pull/59)) — `user_import_jobs` (expand), impor > 200 baris asinkron lewat outbox + BullMQ, idempotensi hash-berkas 24 jam, `GET /users/import/{id}`; event `UserImportCompleted` terbit, konsumen `NT-52` di `PR-02-25` (keputusan 33); `PR-01-18` tergabung ([#60](https://github.com/HanzzzBD/SIGM4/pull/60)) — 14 endpoint master data Lampiran E (tahun ajaran + semester, hari libur, hari kerja, unit kerja), tanpa migration (keputusan 34); dua butir terbuka `PR-01-18` ditutup di PR yang sama (keputusan 35): amplop galat Bab 17.2 meneruskan `message`/`details` dari galat domain, dan `kode_unit_kerja` impor pengguna wajib (`E.5.2`). **Phase 01 seluruh 18 PR tergabung; gerbang keluar lulus bersyarat backend** (`chore/gerbang-keluar-phase-01`, keputusan 36): `SEC-T-01` pada aplikasi terakit, `PM-05` (6 ms), impor 500 pengguna (12,2 detik), sapuan `AL-01` atas 23 route tulis, `FR-18.2` (22 ms pada 100.000 entri), dan templat impor pengguna terbukti; 17 dari 25 AC terbukti, 3 sebagian, 5 ditunda, dan demo mandiri, tombol unduh templat, serta data kalender riil menunggu `apps/web`/staging/sekolah — status `In Review`. **Phase 02 dimulai** (19 September 2026): `PR-02-02` (login + access token EdDSA + rotasi refresh token, [#62](https://github.com/HanzzzBD/SIGM4/pull/62)) tergabung; `PR-02-03` (penguncian akun + respons login seragam, [#63](https://github.com/HanzzzBD/SIGM4/pull/63)) tergabung; `PR-02-04` (logout + sesi + daftar perangkat, [#64](https://github.com/HanzzzBD/SIGM4/pull/64)) tergabung; `PR-02-05` (reset password administratif, [#65](https://github.com/HanzzzBD/SIGM4/pull/65)) tergabung; tindak lanjut `PR-01-04` (`fix/PR-01-04-kunci-cache-permission`, [#66](https://github.com/HanzzzBD/SIGM4/pull/66), bukan PR bernomor — total tetap 169) tergabung: kunci cache permission tidak memuat `role_id`, ditemukan gerbang final `PR-02-06`; `PR-02-06` (ganti password + kelola profil, [#67](https://github.com/HanzzzBD/SIGM4/pull/67)) tergabung; `PR-02-07` (2FA TOTP, [#68](https://github.com/HanzzzBD/SIGM4/pull/68)) tergabung; `PR-02-33` (kode aktivasi 2FA + reset 2FA, [#69](https://github.com/HanzzzBD/SIGM4/pull/69), PR baru — rencana 170) tergabung — keputusan 1–52 [log phase-02](logs/phase-02.md). `PR-00-01` … `PR-00-18` tergabung ke `develop`, termasuk format ulang Prettier ([#30](https://github.com/HanzzzBD/SIGM4/pull/30)), tindak lanjut `PR-00-14` ([#32](https://github.com/HanzzzBD/SIGM4/pull/32)), tindak lanjut audit `PR-00-15` ([#34](https://github.com/HanzzzBD/SIGM4/pull/34)), `PR-00-16` ([#37](https://github.com/HanzzzBD/SIGM4/pull/37)), `PR-00-17` ([#38](https://github.com/HanzzzBD/SIGM4/pull/38)), dan `PR-00-18` ([#39](https://github.com/HanzzzBD/SIGM4/pull/39), keputusan 50–56; rencana kini 164 PR), beserta tindak lanjut graceful shutdown `PR-00-18` ([#40](https://github.com/HanzzzBD/SIGM4/pull/40), keputusan 57–61). Diverifikasi dari GitHub: #6–#40 seluruhnya tergabung, tidak ada PR terbuka. Audit konsistensi lintas dokumen selesai: 15 temuan, 12 keputusan pemilik produk. Proteksi cabang `main` dan `develop` aktif. Penyegaran dokumen pasca Phase 00 dan keputusan 62–65: [#41](https://github.com/HanzzzBD/SIGM4/pull/41). **Gerbang keluar Phase 00 menunggu infrastruktur staging nyata** — lihat [Penghalang aktif](#penghalang-aktif).

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
| [01](phases/phase-01.md) | Master Data Independen | 4 | 18 | `In Review` | 18/18 | Dimulai selagi Phase 00 `In Review` (keputusan 62); middleware otorisasi `PR-01-15` dan hash password `PR-01-16` mendahului PR endpoint (keputusan 63; keputusan 3 log phase-01); `PR-01-17` baru — impor asinkron dipisah dari `PR-01-03` (keputusan 19) |
| [02](phases/phase-02.md) | Inti Sistem | 5 | 34 | `In Progress` | 19/34 | Phase terbesar; di lintasan kritis. Dipensiunkan: `PR-02-01` → `PR-01-16`, `PR-02-09` → `PR-01-15`; `PR-02-31` baru (keputusan 9 log phase-01); `PR-02-33` baru (keputusan 48 log phase-02) ; `PR-02-36` baru (keputusan 83 log phase-02) |
| [03](phases/phase-03.md) | Layanan Aset & Reservasi | 6 | 23 | `Not Started` | 0/23 | Menutup `M1` |
| [04](phases/phase-04.md) | Siklus Hidup Aset | 3 | 14 | `Not Started` | 0/14 | Menutup `M2` |
| [05](phases/phase-05.md) | Penutupan Siklus | 3 | 26 | `Not Started` | 0/26 | Menutup `M3` & `M4` |
| [06](phases/phase-06.md) | Analitik | 1 | 10 | `Not Started` | 0/10 | Menutup `M5` |
| [07](phases/phase-07.md) | Integrasi & UAT | — | 14 | `Not Started` | 0/14 | |
| [08](phases/phase-08.md) | Pengerasan & Kesiapan Rilis | — | 16 | `Not Started` | 0/16 | Menutup `M6` |
| | **Total** | **22** | **173** | | **43/173** | |

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

### Phase 01 — Master Data Independen · `In Review`

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
| `PR-01-17` | `Done` | [#59](https://github.com/HanzzzBD/SIGM4/pull/59) | Impor massal pengguna — asinkron > 200 baris, idempotensi file-hash *(baru, keputusan 19)*; `user_import_jobs`, `GET /users/import/{id}`, event `UserImportCompleted` — keputusan 33 [log phase-01](logs/phase-01.md) |
| `PR-01-18` | `Done` | [#60](https://github.com/HanzzzBD/SIGM4/pull/60) | Endpoint master data Lampiran E: tahun ajaran & semester, hari libur, hari kerja, unit kerja *(baru, keputusan 29)* — menutup butir terbuka `PR-01-11`/`PR-01-12` ; 14 endpoint M-20 tanpa migration — keputusan 34 [log phase-01](logs/phase-01.md) |

### Phase 02 — Inti Sistem · `In Progress`

| ID | Status | PR | Catatan |
|---|---|:---:|---|
| `PR-02-02` | `Done` | [#62](https://github.com/HanzzzBD/SIGM4/pull/62) | Login + access token EdDSA + rotasi refresh token; `refresh_tokens` (migration `0021`, expand), `JWT_PRIVATE_KEY`/`JWT_PUBLIC_KEY` masuk skema config, `authenticate` + gerbang ganti password; staging butuh kunci JWT di env operator — keputusan 1–8 [log phase-02](logs/phase-02.md) |
| `PR-02-03` | `Done` | [#63](https://github.com/HanzzzBD/SIGM4/pull/63) | Penguncian akun (5 gagal/15 menit, jendela tetap) + audit percobaan gagal (`LOGIN_FAILED`, `ACCOUNT_LOCKED`) + event `AccountLocked` (`NT-39`); migration `0022` (expand); respons login seragam — `401` untuk email tak dikenal, password salah, dan akun terkunci (`SDD-SESS-12`) — keputusan 9–14 [log phase-02](logs/phase-02.md) |
| `PR-02-04` | `Done` | [#64](https://github.com/HanzzzBD/SIGM4/pull/64) | Logout + pencabutan sesi + daftar perangkat: kelas route `authenticated: true` (`SDD-AUTH-12`), sesi hidup diperiksa tiap permintaan (access token mati seketika), `logout`, `logout-all`, `GET /auth/sessions`, `DELETE /auth/sessions/{id}`, event `SessionRevoked` — keputusan 15–20 [log phase-02](logs/phase-02.md) |
| `PR-02-05` | `Done` | [#65](https://github.com/HanzzzBD/SIGM4/pull/65) | Reset password **administratif** (`FR-01.3`; rencana semula "token sekali pakai" keliru): `forgot` publik seragam, antrean Administrator, terbitkan (metode verifikasi wajib, password sekali tampil) / tolak, reset langsung `POST /users/{id}/reset-password`, kedaluwarsa 72 jam saat login; migration `0023` (expand) — keputusan 21–28 [log phase-02](logs/phase-02.md) |
| `PR-02-06` | `Done` | [#67](https://github.com/HanzzzBD/SIGM4/pull/67) | Ganti password sendiri + kelola profil (`FR-01.4`): `POST /auth/password/change` (mencabut sesi lain, menerbitkan access token baru berklaim `pwd=false` bagi sesi ini, menyelesaikan penerbitan reset `DITERBITKAN` + event `PasswordChangedAfterReset`/`NT-38a`), `GET`/`PUT /me`, aksi log `PROFILE_UPDATED`; tanpa migration. **`FR-01.4` belum penuh**: foto profil menunggu `PR-03-04`, larangan 3 password terakhir/daftar bocor menunggu `PR-02-31`. Gerbang final menemukan regresi intermiten `test:ci` yang akarnya **bukan** pada PR ini melainkan kunci cache `PermissionCache` (`PR-01-04`) — dipisah dan tergabung lebih dulu sebagai [#66](https://github.com/HanzzzBD/SIGM4/pull/66) (tinjauan arsitek); temuan CodeQL `js/clear-text-storage-of-sensitive-data` ditutup dengan memutus jalur data, bukan suppression — keputusan 29–32, [log phase-02](logs/phase-02.md) §7 |
| `PR-02-07` | `Done` | [#68](https://github.com/HanzzzBD/SIGM4/pull/68) | 2FA TOTP (`FR-01.5`, `BR-070`, `BR-070c`, `BR-070e`): challenge 5 menit sekali pakai (Redis, buram), `POST /auth/2fa/verify` (TOTP atau kode cadangan; `423` hanya di langkah ini), `enroll`/`enroll/confirm` (mencabut sesi lain, `TwoFactorEnabled`), `backup-codes/regenerate`, gerbang `twoFactorVerified` → `403 TWO_FACTOR_REQUIRED` pada R-01/R-03 (bawaan tertutup, pengecualian eksplisit), `TOTP_ENCRYPTION_KEY` masuk skema config, migration `0024` (expand, `otp_verified` ditinjau pemilik produk). Keputusan 33–49 [log phase-02](logs/phase-02.md); squash `c2f941c`. **Rilis yang memuat PR ini dilarang sebelum `PR-02-33` tergabung** (Penghalang aktif). Menonaktifkan 2FA sendiri belum punya PR. Operator staging wajib mengisi `TOTP_ENCRYPTION_KEY` |
| `PR-02-33` | `Done` | [#69](https://github.com/HanzzzBD/SIGM4/pull/69) | Kode aktivasi 2FA + reset 2FA di M-02 (`BR-070d`, `FR-01.5 A3/A5/A7`): migration `0025` (`totp_activation_codes`, expand); `enroll` role wajib menuntut `kode_aktivasi` (5 salah menghanguskan kode tanpa mengunci akun, jawaban seragam), `enroll/confirm` menuntut kode terverifikasi dan menghabiskannya; `POST /users/{id}/2fa-activation-code` dan `POST /users/{id}/reset-2fa` (`user.reset_2fa`; bukan akun sendiri; reset mencabut seluruh sesi dan menerbitkan kode baru bagi role wajib). Keputusan 50–52 [log phase-02](logs/phase-02.md); squash `bf5dd59`. **Instalasi awal yang belum punya Administrator ber-2FA belum dapat menerbitkan kode — menunggu CLI di `PR-02-08`.** Menonaktifkan 2FA sendiri tetap belum punya PR |
| `PR-02-08` | `Done` | [#78](https://github.com/HanzzzBD/SIGM4/pull/78) | Break-glass CLI (`FR-01.6`, `BR-070b`) + CLI kode aktivasi darurat (`FR-01.5 A6`, `BR-070d`): `sigm4 admin:recover --email=<email> [--force]` (guard admin lain aktif < 24 jam, 2FA dilepas, password sementara + kode aktivasi baru, SELURUH sesi sistem dicabut, `NT-53` ke Pimpinan Sekolah) dan `sigm4 admin:activation-code --email=<email>`. `CliRepository` pengecualian `SDD-AUTH-05`/`SDD-AUTH-02` terdokumentasi (pola `AuthRepository`); `AuditLogger.writeCli` (pelaku `SYSTEM:CLI`) baru; `TOTP_ENCRYPTION_KEY` masuk skema worker. Squash `1485e6a`. **Ter-merge otomatis oleh otomasi repo begitu CI hijau, TANPA tinjauan arsitek manusia** yang ditandai wajib — lihat log phase-02 25 Sep 2026 (insiden `#70`). Keputusan 53–56 [log phase-02](logs/phase-02.md) |
| `PR-02-10` | `Done` | [#81](https://github.com/HanzzzBD/SIGM4/pull/81) | Skema `asset_categories`/`assets`/`asset_condition_history` (`FR-04.1`, `SDD-DB-04`): migration `0026` (expand, tipe enum sudah ada sejak `0002`); `uuid` unik (`FR-05.1`/`FR-05.2 A3`), `status` lahir `TERSEDIA`, `kode_barang`/`nomor_seri` unik (`BR-002`/`BR-003`), CHECK `boleh_dipinjam_siswa` menuntut `dapat_dipinjam` (conventions.md E.5.1), `procurement_id` NULLABLE tanpa FK aktif ke M-14. Murni skema — tanpa service/route/endpoint (keduanya `PR-02-11`/`PR-02-13`). **Tindak lanjut** [#83](https://github.com/HanzzzBD/SIGM4/pull/83) (`fix/PR-02-10-br-015-penonaktifan-ruangan`, `In Review`) — `BR-015` sungguhan tingkat ruangan (`PATCH /rooms/{id}/status` menolak nonaktif bila masih memuat aset), item terbuka log phase-01 §10 (keputusan 22) yang menunggu tabel `assets` — kini ditutup |
| `PR-02-11` | `Done` | [#82](https://github.com/HanzzzBD/SIGM4/pull/82) | Pendaftaran aset + penomoran + validasi kategori (`FR-04.1`, `BR-001`…`BR-004`, `BR-009`): `POST /assets` (N unit sekaligus, `jumlah_unit` 1–500), `AssetService.daftarkan()`. Penomoran (keputusan 57 log phase-02): `asset_code_counters` per kombinasi kategori+lokasi (migration `0027`) + katalog `system_settings` `KODE_ASET` (`pola`/`pemisah`/`panjang_urut`, bawaan diturunkan contoh `LAB-KOM-0002` berulang di docs). Nomor seri unik (BR-003), ruangan wajib AKTIF (BR-009), `boleh_dipinjam_siswa` divalidasi sebelum basis data (bukan `23514` mentah) |
| `PR-02-12` | `Done` | [#84](https://github.com/HanzzzBD/SIGM4/pull/84) | Pencarian & penyaringan aset + paginasi (`FR-04.2`, `SDD-API-05`, `SDD-PERF-01`): `GET /assets` (`q` lintas kode/nama/merek/nomor seri, filter allow-list, `sort`, `COUNT(*) OVER()`); BR-073 & scope `restricted` lewat SELECT dinamis (`SDD-AUTH-06`); migration `0028` (`pg_trgm` + GIN trigram `nama`/`merek`, expand). `GET /rooms/{id}/assets` (`FR-03.2`) disambungkan ke kueri sungguhan, menutup kerangka `PR-01-07`. Keputusan 59 [log phase-02](logs/phase-02.md); squash `41baa6f` |
| `PR-02-13` | `Done` | [#85](https://github.com/HanzzzBD/SIGM4/pull/85) | Perubahan kondisi aset + riwayat (`FR-04.3`, `BR-005`/`BR-005a`/`BR-005b`, `BR-006`, `BR-007`, `BR-012`): `PATCH /assets/{id}/condition` berpermission `asset.update_condition` (BUKAN `asset.update` tertulis di `m04-assets.md` §7 — dikonfirmasi keliru oleh pemilik produk, keputusan 60 log phase-02). Alasan wajib (BR-007), status turunan `TIDAK_TERSEDIA` otomatis saat `RUSAK_BERAT`/`HILANG` (BR-006), referensi wajib struktural saat `HILANG` (BR-012). Scope `ASSIGNED` Teknisi TERBUKA — berlaku seperti `all` sementara (`work_orders`/M-12 belum ada); squash `3f8b001` |
| `PR-02-14` | `Done` | [#86](https://github.com/HanzzzBD/SIGM4/pull/86) | Mutasi lokasi aset + riwayat (`FR-04.4`, `BR-009`, `BR-010`): `POST /assets/move` (`asset.update`, sukses `200`) — 1..50 aset ke satu ruangan tujuan AKTIF, atomik, status wajib `TERSEDIA`/`DALAM_PERBAIKAN`; migration `0029` (`asset_movements`, expand). Kapasitas lokasi tujuan ditunda (keputusan 61); pemeriksaan pinjaman/reservasi pada tanggal mutasi menunggu `booking_slots`; berita acara PDF menunggu `SDD-FS-12`; squash `30a0f6a` |
| `PR-02-15` | `Done` | [#87](https://github.com/HanzzzBD/SIGM4/pull/87) | Manajemen kategori aset (`FR-04.5`): `GET/POST /asset-categories`, `PUT/DELETE /asset-categories/{id}` — tiga endpoint tulis + A3/A4 dinaikkan ke PRD lebih dulu (keputusan 62). A1 kode unik, A2 kategori terpakai tak dapat dihapus, A3 induk bersubkategori tak dapat dihapus, A4 kode kategori terpakai tetap, siklus induk ditolak. Tanpa migration. Kompleksitas `S` → `L` (log §3); squash `f314a6c` |
| `PR-02-16` | `Done` | [#88](https://github.com/HanzzzBD/SIGM4/pull/88) | Skema `booking_slots` + exclusion constraint (`CI-01`, `SDD-AVL-01…04`): migration `0030` (expand) — enum `booking_resource`/`booking_origin`, tabel, DUA exclusion constraint (`booking_slots_room_no_overlap`/`booking_slots_asset_no_overlap`, keputusan 63), indeks AV-01 + TTL, trigger FK polimorfik (23503). `reservation_id`/`loan_id`/`work_order_id` tanpa FK sampai modulnya lahir. Murni skema — `SlotService` milik `PR-02-17`. **Wajib tinjauan arsitek** (BRANCHING §3.1) — PR dibuka sebagai Draft; di-approve PM-Codexpert (keputusan 64); squash `0ab788e` |
| `PR-02-17` | `Done` | [#89](https://github.com/HanzzzBD/SIGM4/pull/89) | `SlotService` di `shared/booking/` (`CI-02`, `CI-03`, `SDD-AVL-04/05`, `SDD-SYS-10`): `reserve` (NOWAIT, 55P03 → `ASSET_NOT_AVAILABLE`), `allocate` (SKIP LOCKED), `confirm`/`activate` (berpenjaga status), `release`; antarmuka dituliskan ke SDD-01 §4.7 (keputusan 64). 100 permintaan serentak → tepat 1 berhasil. Tanpa endpoint/migration. Di-approve dan digabung PM-Codexpert; squash `01e87b2`. Susulan ([#94](https://github.com/HanzzzBD/SIGM4/pull/94), `fix/PR-02-17-kunci-ruangan-reserve`, digabung PM-Codexpert, squash `17a040f`): `reserve` kini mengunci baris `rooms` terurut id (menunggu) sesudah aset — pihak kalah reservasi ruangan serentak selalu `23P01` → 409, tidak lagi sesekali `40P01` → 500 (keputusan 68, SDD-AVL-06) |
| `PR-02-18` | `Done` | [#90](https://github.com/HanzzzBD/SIGM4/pull/90) | Skema approval (`FR-10.1`, Lampiran D.5, `SDD-APR-03/04/12`): migration `0031` — enum `approval_instance_status` (kelompok Bab 11.3 baru), `approval_rules` (+fallback & terminal D.5), `approval_rule_steps` (+`on_sla_breach`), `approval_instances` (`rule_snapshot` BEKU lewat trigger, satu instance berjalan per pengajuan, `rule_id` NULL = `DEFAULT_RULE`), `approval_steps` (target approver terpisah dari `diputuskan_oleh`). PRD §8 + Bab 11.3 disunting lebih dulu (keputusan 65). **Wajib tinjauan arsitek** — di-approve dan digabung PM-Codexpert (keputusan 64); squash `51d5095` |
| `PR-02-19` | `Done` | [#91](https://github.com/HanzzzBD/SIGM4/pull/91) | Evaluator DSL kondisi (`RE-01…RE-04`, `RE-06`, `RE-08`, `SDD-APR-01/02`): `m10-approval/services/` — kamus D.2/D.3 (`dsl.ts`), `evaluate` murni, `validateCondition` (Zod struktur + makna D.2/D.3 → `422 INVALID_RULE_DEFINITION` beserta seluruh pelanggaran), `selectRule` + `ATURAN_BAWAAN`. PRD Lampiran D + `SDD-APR-02` disunting (keputusan 66). Tanpa endpoint/migration — `RE-05` milik `PR-02-20/21`, `RE-07` milik `PR-02-24`. **Wajib tinjauan arsitek** (evaluator DSL, BRANCHING §3.1) — di-approve dan digabung PM-Codexpert (keputusan 64); squash `c3957bf` |
| `PR-02-20` | `Done` | [#93](https://github.com/HanzzzBD/SIGM4/pull/93) | Resolusi approver + delegasi + fallback (`RE-10…RE-13`, `SDD-APR-04/13/14/16`, `FR-10.2 A3/A4`): migration `0032` (expand) — `approval_delegations` (exclusion constraint tanpa tumpang per pemberi), `approval_steps.atas_nama_user_id`, `approval_instances.pemohon_id`; `ApprovalService.createInstance` (snapshot RE-05, seluruh langkah di muka, konflik saat lahir) + `aktifkanBerikutnya` (nonaktif dilewati, fallback Administrator 24 jam kerja + event `ApprovalFallbackRouted`/NT-47); `POST /approvals/delegate`. PRD §8/D.5 + SDD-APR-13/16 + SDD-07 disunting lebih dulu (keputusan 67). Kompleksitas `L` (735 baris produksi). **Wajib tinjauan arsitek** — di-approve dan digabung PM-Codexpert (keputusan 64); squash `9d4f01f` |
| `PR-02-21` | `Done` | [#95](https://github.com/HanzzzBD/SIGM4/pull/95) | Eksekusi persetujuan + first-responder-wins (`FR-10.2`, `BR-035…BR-039a`, `RE-09`, `SDD-APR-05/07/17`): `POST /approvals/{id}/decide` (UPDATE bersyarat `langkah_aktif = urutan AND keputusan IS NULL`, `Idempotency-Key` ID-01 — route pertama pemakai `runIdempotent`, 409 membawa pemutus & waktu), `GET /approvals/pending`, `DecisionService` (tolak/revisi menutup alur, setuju lanjut/fallback/final, penangan hasil per jenis `PenanganHasil`). Tanpa migration. PRD FR-10.2 + Bab 17.3 + SDD-APR-17 + SDD-07 disunting lebih dulu (keputusan 69). **Wajib tinjauan arsitek** (mesin approval) — digabung PM; squash `75af3d5` |
| `PR-02-32` | `Done` | [#96](https://github.com/HanzzzBD/SIGM4/pull/96) | `SystemAuthContext` + pekerjaan `student-graduation` (`SDD-AUTH-05`, `AL-06`, `JOB-01…06`, `SL-03`, `DP-10`), cabang `feature/PR-02-32-system-auth-context`: subtipe bermerek ber-`namaPekerjaan` (scope `all`, `userId = 0`, dikenali registri identitas), `pelakuId` → NULL bagi SYSTEM (`actor_id`, `users.updated_by`), `AuditLogger.write` → pelaku `SYSTEM` + nama pekerjaan; pabrik tertutup lint bagi `src/api`/`src/modules`/`shared/*`; ringkasan `JOB-05` = aksi baru `SCHEDULED_JOB_EXECUTED` (M-18). Dikerjakan **sebelum** `PR-02-22` — keputusan 70–72 [log phase-02](logs/phase-02.md). Tanpa migration. **Wajib tinjauan arsitek** (lapisan `AuthContext`, `AuditLogger`) — digabung PM; squash `ce15a80` |
| `PR-02-22` | `Done` | [#97](https://github.com/HanzzzBD/SIGM4/pull/97) | SLA, pengingat, eskalasi (`FR-10.2 A2/A2a`, `BR-039a`, Lampiran D.5, `SDD-APR-06/07/15`), cabang `feature/PR-02-22-sla-eskalasi`: job `approval-sla-check` tiap 30 menit berpelaku SYSTEM (`SlaTracker`) — `remind` NT-06 maks 1×/hari tanpa terminal; `escalate` dialihkan sekali (tenggat jam kerja CAL-01), berikutnya/target tak sah = eskalasi habis → `hold_and_alert` NT-47 sekali atau `auto_reject`; aktivasi ulang RE-13; event `ApprovalSlaBreached`; migration `0033` (expand); aksi `APPROVAL_SLA_REMINDED`/`APPROVAL_ESCALATION_EXHAUSTED`. Keputusan 70, 73, 74, 75 [log phase-02](logs/phase-02.md): registri `penanganHasil` bersama API+worker (pendaftar `PR-03-10`/`PR-04-02`), kontrak Zod `ApprovalSlaBreached` (konsumen `PR-02-25`). Kompleksitas `L` (±460). **Wajib tinjauan arsitek** (mesin approval, migration) — digabung PM; squash `12df7c5`. **Isi keputusan 75 tertinggal dari `#97`** (digabung sebelum commit terakhir ter-push) → susulan `fix/PR-02-22-registri-kontrak` ([#98](https://github.com/HanzzzBD/SIGM4/pull/98), digabung PM; squash `d74194c`) |
| `PR-02-23` | `Done` | [#99](https://github.com/HanzzzBD/SIGM4/pull/99) | Riwayat & pelacakan persetujuan (`FR-10.3`), cabang `feature/PR-02-23-riwayat-persetujuan`: `GET /approvals/{id}/history` (`approval.view`) — seluruh langkah (keputusan, catatan, pemutus, `atas_nama` RE-12, dilewati + alasan, fallback, penanda eskalasi & eskalasi habis), status turunan, `sisa_menit_kerja`/`terlambat` langkah aktif dan `durasi_menit_kerja` (CAL-01); scope `own` = pemohon/pihak langkah; tak ada → 404 (all) / 403 identik (own). Tanpa migration. Kompleksitas `M` (±369, rencana `S`). Keputusan 76 [log phase-02](logs/phase-02.md) — digabung PM; squash `ac4b782` |
| `PR-02-24` | `Done` | [#100](https://github.com/HanzzzBD/SIGM4/pull/100) | Konfigurasi approval rule + pratinjau — **API** (`FR-10.1`, `RE-07`, keputusan 77), cabang `feature/PR-02-24-konfigurasi-approval-rule`: `GET`/`POST /approval-rules`, `PUT /approval-rules/{id}` (versi naik), `PATCH /approval-rules/{id}/status`, `POST /approval-rules/preview` (draf + simulasi pemohon). Layar P-68/P-69 → `PR-02-34` (baru). Kompleksitas `L` (±762, rencana `M`; tidak dipecah — keputusan 77e) — digabung PM; squash `ac81199` |
| `PR-02-25` | `Done` | [#101](https://github.com/HanzzzBD/SIGM4/pull/101) | Skema notifikasi + penerbitan dari event domain (`FR-17.1`, `SDD-NTF-03/04/07/09`, `SDD-08 §4.2a`), cabang `feature/PR-02-25-skema-notifikasi`: migration `0034` (expand — `notifications`, arsip, `notification_group`), templat per kode NT, `NotificationService.emit` (dedupe per event / harian), konsumen worker M-10 (`NT-02`…`NT-07`, `NT-47`) & M-02 (`NT-40`, `NT-48`, `NT-52`) — penerima dari modul pemilik, rincian dari `penyediaRincian`. Konsumen M-01 → `PR-02-35`; `SessionRevoked` → `PR-02-27`; daftar/baca → `PR-02-26`. Kompleksitas `L` (±676, rencana `M`). Keputusan 78 [log phase-02](logs/phase-02.md). **Wajib tinjauan arsitek** (migration) — digabung PM; squash `1837ff1` |
| `PR-02-26` | `Done` | [#102](https://github.com/HanzzzBD/SIGM4/pull/102) | SSE + Redis Pub/Sub fanout multi-instance + daftar/tandai baca + arsip (`FR-17.1`, `NTF-01…05`, `SDD-NTF-01/02/05/10`, `SDD-08 §4.3a`), cabang `feature/PR-02-26-sse-fanout`: `GET /notifications` (filter jenis/status/arsip, scope pemilik), `GET /notifications/stream`, `PATCH …/{id}/read`, `PATCH …/read-all` (`notification.manage_own`); siaran setelah commit + `unread_count`; batas 2 koneksi global via Redis; job `notification-archive` 01:30 WIB. Tanpa migration. Keputusan 79 [log phase-02](logs/phase-02.md) — digabung PM; squash `1f4df9f` (kepala `a76fe75` terverifikasi) |
| `PR-02-27` | `Done` | [#103](https://github.com/HanzzzBD/SIGM4/pull/103) | Push FCM + token perangkat + token mati (`FR-17.2`, `MOB-SEC-05`, `SDD-NTF-08`, `SDD-08 §4.4a`), cabang `feature/PR-02-27-push-fcm`: migration `0035` (expand — `device_tokens` + `family_id`, `notification_deliveries`, enum `delivery_status`), `POST /device-tokens` & `DELETE /device-tokens/{token}` (`notification.manage_own`), konsumen `SessionRevoked`, job `notification-push` (3×, pasca-commit), `fcm` di `/health` non-kritis, `FCM_CREDENTIALS` opsional. Kompleksitas `L` (±570, rencana `M`). Keputusan 80 [log phase-02](logs/phase-02.md). **Wajib tinjauan arsitek** (migration) — digabung PM; squash `816f99a` (kepala `d635710` terverifikasi) |
| `PR-02-28` | `Done` | [#105](https://github.com/HanzzzBD/SIGM4/pull/105) | Preferensi notifikasi (`FR-17.3`, `SDD-NTF-06`, `SDD-08 §4.5`, UXD-05), cabang `feature/PR-02-28-preferensi-notifikasi`: migration `0036` (expand — `notification_preferences` + `CHECK` push butuh in-app), `GET`/`PUT /notifications/preferences` (`notification.manage_own`), in-app dimatikan → tidak disimpan saat terbit, push dimatikan → `DILEWATI` saat kirim, `PERSETUJUAN` terkunci. Kompleksitas `M` (±250, rencana `S`). Keputusan 81 [log phase-02](logs/phase-02.md). **Wajib tinjauan arsitek** (migration) — digabung PM; squash `c80d51f` (kepala `7b90614` terverifikasi) |
| `PR-02-29` | `Done` | [#106](https://github.com/HanzzzBD/SIGM4/pull/106) | Kerangka dashboard + kartu per role (`FR-15.1`, Bab 19, `BR-073/074`, `PM-03`, `SDD-14 §4.3a`), cabang `feature/PR-02-29-kerangka-dashboard`: modul `m15-dashboard` — `GET /dashboard` (manifes) + `GET /dashboard/cards/{id}` (`dashboard.view` + permission kartu), 17 kartu berdata dari index modul pemilik, templat R-01…R-07, cache Redis 5 menit + `segarkan`, rentang 7/30 hari/semester/tahun ajaran. Tanpa migration. Keputusan 82 [log phase-02](logs/phase-02.md) — digabung PM; squash `3341fea` (kepala `858aea9` terverifikasi) |
| `PR-02-30` | `In Review` | — | Kerangka aplikasi web (`SDD-FE-01…16`, `UXD-12`, keputusan 83), cabang `feature/PR-02-30-kerangka-web`: Vite + React + TanStack Router/Query + axios (mutex refresh `SDD-FE-07`) + `/me`/`<Can>` + token FOUNDATIONS (Tailwind v4, kontras diuji) + lima keadaan + shell (sidebar per permission & route terdaftar, topbar) + P-01 Login, P-08…P-11, P-12 Dashboard; job CI `web`. Kompleksitas `L` (±2.030). Tanpa migration |
| `PR-02-31`, `PR-02-34`, `PR-02-35`, `PR-02-36` | `Not Started` | — | Rincian: [`phases/phase-02.md` §7](phases/phase-02.md) |

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
