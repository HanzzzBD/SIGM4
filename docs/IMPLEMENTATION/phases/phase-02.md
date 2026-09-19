# Phase 02 — Inti Sistem

| | |
|---|---|
| **Milestone PRD** | `M1` (M-01, M-04) · `M2` (M-10, Bab 26) · `M5` (M-15, M-17) — lihat §3.1 |
| **Status** | Lihat [`IMPLEMENTATION-STATUS.md`](../IMPLEMENTATION-STATUS.md) |
| **Modul PRD** | M-01 Autentikasi · M-04 Aset · M-10 Approval · M-15 Dashboard · M-17 Notifikasi |
| **Bergantung pada** | Phase 01 |
| **Memblokir** | Phase 03 |
| **Log** | [`logs/phase-02.md`](../logs/phase-02.md) |

---

## 1. Objective

Sistem menjadi dapat dipakai: pengguna login (dengan 2FA untuk role sensitif), melihat dashboard sesuai perannya, mengelola inventaris aset, dan menerima notifikasi. Mesin persetujuan berdiri **tanpa satu pun modul pengaju** — divalidasi lewat uji, bukan lewat fitur. Phase ini menanam tiga tulang punggung yang dipakai seluruh phase berikutnya: **autentikasi**, **mesin approval**, dan **ketersediaan berbasis rentang waktu**.

## 2. Scope

**Termasuk**

- M-01: login, logout, reset password, profil, 2FA TOTP, break-glass CLI
- M-04: pendaftaran aset, pencarian, perubahan kondisi, mutasi lokasi, kategori
- M-10: konfigurasi approval rule (DSL), eksekusi persetujuan, riwayat
- M-15: dashboard per role
- M-17: notifikasi in-app (SSE), push FCM, preferensi
- `booking_slots` + *exclusion constraint* — infrastruktur ketersediaan (`CI-01`)
- `assets.procurement_id` **nullable dan belum terisi** — pemutus siklus M-04 ↔ M-14
- Kebijakan kata sandi selengkapnya (`NFR-S-03a`): daftar password bocor dan riwayat 3 password terakhir (`PR-02-31`, keputusan 9 [log phase-01 §2](../logs/phase-01.md))

**Tidak termasuk**

- Pengaju approval mana pun (reservasi, peminjaman, pengadaan, penghapusan) → **Phase 03–05**
- Pengisian `procurement_id` → **Phase 03** bersama M-14
- QR code aset → **Phase 03** bersama M-05
- Dokumen/lampiran aset → **Phase 03** bersama M-06

## 3. Dependencies

| Bergantung pada | Alasan teknis |
|---|---|
| Phase 01 → M-02 | `users`, role, matriks permission — prasyarat login dan approver |
| Phase 01 → `PR-01-15` | Middleware otorisasi — prasyarat setiap endpoint phase ini (semula `PR-02-09`, keputusan 63) |
| Phase 01 → `PR-01-16` | Hash password Argon2id — prasyarat login (semula `PR-02-01`, keputusan 3 log phase-01) |
| Phase 01 → M-03 | `rooms`, `areas` — lokasi aset dan sumber daya `booking_slots` |
| Phase 01 → M-20 | Parameter sistem (masa token, ambang, kalender) |
| Phase 00 | Outbox, worker, registri route, `AuditLogger` |

Urutan di dalam phase:

```
M-01 Auth ──┬─→ M-15 Dashboard
            ├─→ M-04 Aset
            └─→ M-10 Approval
M-17 Notifikasi ──(dikonsumsi)──→ M-10
```

`M-17` dikerjakan paralel sejak awal karena `M-10` menerbitkan notifikasi (`NT-13` … `NT-16`) begitu ia hidup.

### 3.1 Kontribusi terhadap milestone PRD

| Modul / bagian | Milestone PRD ([29.2](../../PRD/01-product/delivery-plan.md)) |
|---|---|
| M-01, M-04 | `M1 — Identitas & Data Induk` |
| M-10 (termasuk Lampiran D) · `booking_slots` (Bab 26) | `M2 — Mesin Persetujuan & Pemesanan` |
| M-15, M-17 | `M5 — Insight, Notifikasi & AI` |

Tidak ada milestone yang tertutup di sini. `M1` masih menunggu M-05 (Phase 03); `M2` masih menunggu M-07 (Phase 03) dan M-08 (Phase 04).

## 4. Referensi PRD

| Berkas | ID yang dilayani |
|---|---|
| [`m01-auth.md`](../../PRD/02-modules/m01-auth.md) | `FR-01.1` … `FR-01.6` · `BR-070` `BR-070a` `BR-070b` `BR-070c` |
| [`m04-assets.md`](../../PRD/02-modules/m04-assets.md) | `FR-04.1` … `FR-04.5` · `BR-001` … `BR-012` |
| [`m10-approval.md`](../../PRD/02-modules/m10-approval.md) | `FR-10.1` … `FR-10.3` · `BR-035` … `BR-043` |
| [`m15-dashboard.md`](../../PRD/02-modules/m15-dashboard.md) | `FR-15.1` · `BR-073` `BR-074` |
| [`m17-notifications.md`](../../PRD/02-modules/m17-notifications.md) | `FR-17.1` … `FR-17.3` |
| [`approval-rule-dsl.md`](../../PRD/03-architecture/approval-rule-dsl.md) | Lampiran D · `RE-01` … `RE-12` |
| [`availability-concurrency.md`](../../PRD/03-architecture/availability-concurrency.md) | `CI-01` … `CI-05`, `AV-01` … `AV-05` |
| [`security.md`](../../PRD/03-architecture/security.md) | `NFR-S-01` … `NFR-S-06`, `SEC-CFG-01` … `04` |

## 5. Referensi SDD

| Berkas | Keputusan yang diterapkan |
|---|---|
| [`04-authentication-session.md`](../../SDD/04-authentication-session.md) | `SDD-SESS-01` … `SDD-SESS-11` |
| [`03-authorization.md`](../../SDD/03-authorization.md) | `SDD-AUTH-01` … `SDD-AUTH-10` |
| [`02-approval-engine.md`](../../SDD/02-approval-engine.md) | `SDD-APR-01` … `SDD-APR-12` |
| [`01-availability-concurrency.md`](../../SDD/01-availability-concurrency.md) | `SDD-AVL-01` … `SDD-AVL-05` (skema & constraint saja) |
| [`08-notification-design.md`](../../SDD/08-notification-design.md) | `SDD-NTF-01` … `SDD-NTF-09` |
| [`07-event-flow.md`](../../SDD/07-event-flow.md) | `SDD-EVT-05` … `SDD-EVT-09` |
| [`11-frontend-architecture.md`](../../SDD/11-frontend-architecture.md) | `SDD-FE-01` … `SDD-FE-06` |
| [`14-performance-design.md`](../../SDD/14-performance-design.md) | `SDD-PERF-03` (dashboard) |

## 6. Deliverables

- Login berfungsi di web dan mobile, termasuk 2FA untuk role sensitif
- Prosedur break-glass terdokumentasi dan **terlatih** (`FR-01.6`)
- Inventaris aset lengkap dengan riwayat kondisi dan mutasi
- Mesin approval yang dapat dikonfigurasi lewat DSL dan lulus uji konkurensi
- Dashboard per role dengan penyaringan permission
- Notifikasi in-app real-time + push mobile
- `booking_slots` berdiri dengan *exclusion constraint* aktif dan teruji

## 7. Pull Request Plan

| PR | Judul | Kode | Uji | Bergantung | FR/SDD | Acceptance |
|---|---|:---:|:---:|---|---|---|
| `PR-02-01` | **Pensiun** — dipindah ke `PR-01-16` (keputusan 3, [log phase-01 §2](../logs/phase-01.md)); nomornya tidak dipakai ulang | — | — | — | — | — |
| `PR-02-02` | Login + akses token EdDSA + rotasi refresh token | L | L | Ph01 | `FR-01.1`, `SDD-SESS-02/03/04`, `NFR-S-07` | Refresh dipakai ulang → seluruh rantai dicabut; `POST /auth/login` berkelas limit `login`, yang hanya menghitung percobaan gagal (`SDD-13 §4.3`); `JWT_PRIVATE_KEY`/`JWT_PUBLIC_KEY` masuk skema `shared/config` (`SDD-SYS-14`) |
| `PR-02-03` | Penguncian akun + `NT-39` + audit percobaan gagal | M | M | 02 | `FR-01.1 A2`, `SDD-SESS-06/07`, `NFR-S-07`, `SEC-T-06` | 5 gagal → kunci; pesan galat tidak membocorkan keberadaan akun; sumbu akun (PostgreSQL) dan sumbu IP (Redis) login aktif bersamaan, keduanya hanya menghitung percobaan gagal |
| `PR-02-04` | Logout + pencabutan sesi + daftar perangkat | M | M | 02 | `FR-01.2`, `SDD-SESS-06` | Token tercabut ditolak ≤ 60 detik |
| `PR-02-05` | Lupa & reset password (token sekali pakai) | M | M | 02 | `FR-01.3`, `NT-41` | Respons seragam untuk email ada/tidak ada |
| `PR-02-06` | Ganti password + kelola profil + pencabutan sesi lain | S | S | 04 | `FR-01.4` | Ganti password mencabut sesi lain; foto profil menunggu `users.foto_file_id` dari `PR-03-04` (keputusan 4 log phase-01) |
| `PR-02-07` | 2FA TOTP: pendaftaran, verifikasi, kode pemulihan | L | L | 02 | `FR-01.5`, `BR-070` `BR-070c`, `SDD-SESS-08/09` | Role sensitif tidak dapat melewati 2FA; `TOTP_ENCRYPTION_KEY` masuk skema `shared/config` (`SDD-SYS-14`) |
| `PR-02-08` | Break-glass CLI + jejak audit wajib | M | M | 07 | `FR-01.6`, `BR-070b` | Setiap pemakaian menghasilkan alarm & entri log |
| `PR-02-09` | **Pensiun** — dipindah ke `PR-01-15` (keputusan 63, [log phase-00 §2](../logs/phase-00.md)); nomornya tidak dipakai ulang | — | — | — | — | — |
| `PR-02-10` | Skema `assets`, `asset_categories`, `asset_condition_history` | M | M | Ph01 | `FR-04.1`, `SDD-DB-04` | `procurement_id` ada, nullable, tanpa FK aktif ke M-14 |
| `PR-02-11` | Pendaftaran aset + penomoran + validasi kategori | M | L | 10 | `FR-04.1`, `BR-001` … `BR-004` | Nomor aset unik di bawah beban paralel |
| `PR-02-12` | Pencarian & penyaringan aset + paginasi | M | M | 10 | `FR-04.2`, `SDD-API-05`, `SDD-PERF-01` | 10.000 aset, p95 sesuai anggaran `SDD-PERF` |
| `PR-02-13` | Perubahan kondisi aset + riwayat | M | M | 11 | `FR-04.3`, `BR-005` `BR-005a` `BR-005b` | Transisi kondisi terlarang ditolak |
| `PR-02-14` | Mutasi lokasi aset + riwayat | M | M | 11, Ph01 | `FR-04.4`, `BR-006` … `BR-008` | Mutasi ke lokasi nonaktif ditolak |
| `PR-02-15` | Manajemen kategori aset | S | S | 10 | `FR-04.5`, `BR-009` … `BR-012` | Kategori terpakai tidak dapat dihapus |
| `PR-02-16` | Skema `booking_slots` + exclusion constraint + `btree_gist` | M | L | 10, Ph01 | `CI-01`, `SDD-AVL-01/02/03` | Dua slot bertumpang tindih → `23P01` |
| `PR-02-17` | `SlotService`: reservasi, pelepasan, aktivasi + pemetaan 409 | L | L | 16 | `CI-02` `CI-03`, `SDD-AVL-04/05`, `SDD-SYS-10` | 100 permintaan serentak → tepat satu berhasil |
| `PR-02-18` | Skema approval: `approval_rules`, `instances`, `steps` + `rule_snapshot` | M | M | Ph01 | `FR-10.1`, Lampiran D.5, `SDD-APR-03` | Snapshot beku; perubahan aturan tidak menyentuh instance berjalan |
| `PR-02-19` | Evaluator DSL kondisi (`RE-01` … `RE-08`) | L | L | 18 | Lampiran D.2, `SDD-APR-01/02` | Seluruh operator D.2 teruji, termasuk kasus batas |
| `PR-02-20` | Resolusi approver + delegasi + fallback | M | M | 19 | `RE-09` … `RE-13`, `SDD-APR-04/05/13/14` | Approver nonaktif → langkah dilewati beralasan `approver nonaktif`, lalu jalur fallback `RE-11`; `fallback_approver` kosong berarti Administrator |
| `PR-02-21` | Eksekusi persetujuan + *first-responder-wins* | L | L | 20 | `FR-10.2`, `BR-035` … `BR-039a`, `SDD-APR-07` | Dua approver serentak → satu 200, satu 409 |
| `PR-02-22` | SLA, pengingat, eskalasi (job terjadwal) | M | M | 21, Ph00 | `BR-040` … `BR-043`, `SDD-APR-06`, `SDD-APR-15` | Perhitungan memakai jam operasional terkonfigurasi (`CAL-01`); tenggat di luar jam itu tidak bertambah |
| `PR-02-23` | Riwayat & pelacakan persetujuan | S | S | 21 | `FR-10.3` | Linimasa menampilkan seluruh langkah + alasan |
| `PR-02-24` | Antarmuka konfigurasi approval rule + pratinjau | M | M | 19 | `FR-10.1`, `RE-01` | Pratinjau menunjukkan jalur yang akan terpilih |
| `PR-02-25` | Skema notifikasi + penerbitan dari event domain | M | M | Ph00 | `FR-17.1`, `SDD-NTF-01/02` | Notifikasi terbit hanya setelah transaksi commit |
| `PR-02-26` | SSE + Redis Pub/Sub fanout multi-instance | L | L | 25 | `FR-17.1`, `SDD-NTF-03/04/05` | Dua instance API → satu notifikasi, satu kali tampil |
| `PR-02-27` | Push FCM + registrasi token + penanganan token mati | M | M | 25 | `FR-17.2`, `SDD-NTF-06/07` | Token tidak valid dibersihkan otomatis; pemeriksaan `fcm` terdaftar di `/health` tanpa memengaruhi `ready` (`OBS-06`); `FCM_CREDENTIALS` masuk skema `shared/config` (`SDD-SYS-14`) |
| `PR-02-28` | Preferensi notifikasi | S | S | 25 | `FR-17.3`, **UXD-05** | Enam kelompok `jenis` sesuai `SDD-08 §4.5`, bukan per modul |
| `PR-02-29` | Kerangka dashboard + kartu per role | L | L | Ph01 | `FR-15.1`, `BR-073` `BR-074`, `SDD-PERF-03` | Kartu di luar permission tidak dirender **dan** tidak dikirim server |
| `PR-02-30` | Kerangka aplikasi web: routing, state, render berbasis permission | L | L | Ph01 | `SDD-FE-01` … `SDD-FE-06`, `SDD-FE-11/12`, **UXD-12** | TanStack Query + primitif headless & token sendiri; satu set token warna — tanpa mode gelap |
| `PR-02-31` | Daftar password bocor + riwayat 3 password terakhir | M | M | 06 | `NFR-S-03a`, `FR-01.4` | Password yang cocok daftar bocor ditolak; tiga password terakhir tidak dapat dipakai ulang; sumber daftar bocor ditetapkan di PR ini |
| `PR-02-32` | `SystemAuthContext` + memasang pekerjaan `student-graduation` *(baru, keputusan 31 log phase-01)* | M | M | 02, Ph01 | `SDD-AUTH-05`, `AL-06`, `JOB-01` … `JOB-06`, `SL-03`, `DP-10` | Pelaku `SYSTEM` hanya dapat dibentuk dari luar siklus HTTP; lulusan dinonaktifkan otomatis setelah tahun ajaran berakhir dan tercatat sebagai `SYSTEM`; menyentuh lapisan `AuthContext` — tinjauan arsitek |

## 8. Task Breakdown

### `PR-02-32` — `SystemAuthContext` dan `student-graduation`
- [ ] Bentuk `SystemAuthContext` berscope `all`, pelaku `SYSTEM` (`updated_by` NULL) — **tinjauan arsitek** (`AuthContext` adalah tulang punggung, `BRANCHING-STRATEGY §3.1`); rancang bersama `AuthContext` hasil `PR-02-02`, bukan sebelumnya
- [ ] Uji arsitektur: `SystemAuthContext` tidak dapat diimpor dari lapisan HTTP (`SDD-03 §4`, risiko "dipakai di jalur HTTP")
- [ ] Sesuaikan repository yang menulis `updated_by` agar menerima pelaku SYSTEM tanpa mengubah perilaku pemanggil pengguna
- [ ] Pasang pekerjaan `student-graduation` (00:10 WIB, `wibCronToUtc`) yang memanggil `GraduationService.deactivateDueGraduates` dari `PR-01-13`; entri log pelaku `SYSTEM` + ringkasan `JOB-05`
- [ ] Uji: lulusan yang tahun ajarannya berakhir dinonaktifkan tanpa permintaan HTTP; menjalankan ulang tidak menghasilkan apa pun (`JOB-03`)

### `PR-02-02` — Login & sesi
- [ ] Ed25519 keypair + `kid` pada header JWT (`SDD-SESS-03`)
- [ ] Refresh token opaque tersimpan ter-hash di PostgreSQL (`SDD-SESS-03`, `SDD-SESS-04`)
- [ ] Rotasi setiap pemakaian; simpan `family_id` dan `parent_id`
- [ ] Deteksi pemakaian ulang → cabut seluruh rantai + alarm (`SDD-SESS-05`)
- [ ] Uji: token lama pasca-rotasi ditolak dan mencabut rantai

### `PR-02-16` / `PR-02-17` — Ketersediaan
- [ ] `CREATE EXTENSION btree_gist` (sudah di Phase 00; verifikasi ulang)
- [ ] `booking_slots` dengan `slot_range tstzrange` setengah terbuka `[mulai, selesai)` (`SDD-AVL-01`)
- [ ] Exclusion constraint parsial pada status `Tentative`/`Confirmed`/`Active`
- [ ] Petakan `SQLSTATE 23P01` → HTTP 409 `SLOT_CONFLICT` (`SDD-AVL-05`)
- [ ] Urutkan penguncian menurut `asset_id` menaik untuk menghindari deadlock (`SDD-AVL-06`)
- [ ] Uji beban: 100 permintaan serentak pada slot yang sama

> Phase ini hanya membangun **mesin** ketersediaan. Konsumen pertamanya adalah M-07 di Phase 03. Membangunnya di sini disengaja: ia menentukan bentuk skema dan tidak boleh disisipkan setelah reservasi berjalan.

### `PR-02-21` — First-responder-wins
- [ ] UPDATE bersyarat `WHERE keputusan IS NULL` (`SDD-APR-07`)
- [ ] 1 baris terpengaruh → menang (200); 0 baris → kalah (409 `APPROVAL_ALREADY_DECIDED`)
- [ ] Terbitkan event hanya di jalur yang menang
- [ ] Uji konkurensi dua approver pada langkah yang sama

### `PR-02-25` — Skema notifikasi + penerbitan
- [ ] Pasang notifikasi milik M-02 yang **tertunda dari Phase 01** (keputusan 32 log phase-01): `NT-48` (penolakan mengaktifkan/membuat akun siswa tanpa `consent_guardian_at`, `DP-02`) dan `NT-40` (role/status akun berubah) — keduanya belum terbit sejak `PR-01-02`/`PR-01-14` karena modul notifikasi belum ada
- [ ] `NT-48` **tidak dapat** terbit dari transaksi yang ditolak (rollback membuang outbox, `SDD-EVT-04`): terbitkan pada transaksi terpisah setelah penolakan, dan tambahkan event-nya ke katalog `SDD-07 §4.3`

### `PR-02-29` — Dashboard
- [ ] Kartu dideklarasikan bersama permission yang diwajibkannya
- [ ] Penyaringan di server: data kartu terlarang **tidak dikirim**, bukan disembunyikan CSS (`PM-03`)
- [ ] Agregat berat memakai kueri ringkasan, bukan N+1 (`SDD-PERF-03`)

## 9. Acceptance Checklist

- [ ] Seluruh AC pada `FR-01.1`…`FR-01.6`, `FR-04.1`…`FR-04.5`, `FR-10.1`…`FR-10.3`, `FR-15.1`, `FR-17.1`…`FR-17.3` terverifikasi
- [ ] Uji konkurensi `CI-02` lulus: 100 permintaan serentak → tepat satu slot terbentuk
- [ ] Uji konkurensi approval lulus: dua approver → satu menang, satu 409
- [ ] Uji otorisasi tergenerate mencakup **100%** route terdaftar (`SEC-T-01`)
- [ ] 2FA tidak dapat dilewati untuk role sensitif (`FR-01.5`)
- [ ] Break-glass menghasilkan alarm dan entri activity log setiap kali dipakai (`BR-070c`)
- [ ] Notifikasi tidak terkirim ganda pada dua instance API (`SDD-NTF-05`)
- [ ] `procurement_id` ada di `assets`, nullable, tanpa nilai — sesuai keputusan pemutusan siklus

## 10. Risks

| Risiko | Dampak | Mitigasi | Rujukan |
|---|---|---|---|
| Mesin approval dibangun tanpa pengaju nyata sehingga celahnya baru terlihat di Phase 03 | Kerja ulang pada modul pengaju | Uji integrasi memakai *pengaju tiruan* yang menjalankan seluruh cabang DSL | `RS-04` |
| ~~`TBD-APR-A/B/C` belum terjawab~~ | — | ✅ **Tertutup 25 Agustus 2026** — `SDD-APR-13` · `SDD-APR-14` · `SDD-APR-15` · `RE-13` | TBD-REGISTER |
| `booking_slots` dianggap "belum perlu" lalu ditunda ke Phase 03 | Skema ketersediaan disisipkan setelah reservasi jalan — persis kegagalan yang `CI-01` cegah | Tidak dapat ditunda; termasuk gerbang keluar phase | `CI-01`, `RS-03` |
| Deteksi pemakaian ulang refresh token memutus sesi sah karena balapan jaringan | Pengguna terlempar keluar | Tenggang idempotensi rotasi; diuji pada jaringan mobile | `SDD-SESS-05` |
| ~~`TBD-NTF-B` belum terjawab~~ | — | ✅ **Tertutup 25 Agustus 2026** — `SDD-NTF-10` · `UXD-10`: arsip dibaca pemiliknya lewat filter; tabel arsip memperoleh indeks `(user_id, created_at DESC)` | TBD-REGISTER |

## 11. Rollback Strategy

| Skenario | Tindakan |
|---|---|
| PR gagal di staging | Revert PR. Bila menyentuh sesi (`PR-02-02`/`04`/`07`), seluruh refresh token di-*invalidate* — pengguna login ulang, tanpa kehilangan data |
| Migration `booking_slots` bermasalah | Tabel belum punya konsumen di phase ini; `DROP` aman selama Phase 02 dan **tidak lagi aman** setelah Phase 03 |
| Mesin approval perlu dirancang ulang | `rule_snapshot` membuat instance lama tetap terbaca oleh evaluator versi lama; evaluator baru diberi versi terpisah |
| Phase dibatalkan | Kembali ke tag `phase-01-end`; belum ada data produksi |

## 12. Definition of Done

**DoD dasar** — [PRD 29.5](../../PRD/01-product/delivery-plan.md).

**Tambahan khusus phase ini:**

- [ ] Uji konkurensi ketersediaan **dan** approval keduanya berjalan di CI, bukan sekali manual
- [ ] Prosedur break-glass sudah **dilatih**, bukan hanya ditulis (`FR-01.6`)
- [ ] `TBD-APR-A`, `TBD-APR-B`, `TBD-APR-C`, `TBD-NTF-B` tertutup di [TBD-REGISTER](../../SDD/TBD-REGISTER.md)
- [ ] Log phase terisi

---

*Phase ini tidak memuat requirement maupun keputusan desain baru. Setiap pernyataan merujuk PRD atau SDD.*
