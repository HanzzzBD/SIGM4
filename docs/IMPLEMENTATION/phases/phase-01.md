# Phase 01 — Master Data Independen

| | |
|---|---|
| **Milestone PRD** | `M1` (M-02, M-03, M-20) · `M5` (M-18) — lihat §3.1 |
| **Status** | Lihat [`IMPLEMENTATION-STATUS.md`](../IMPLEMENTATION-STATUS.md) |
| **Modul PRD** | M-02 User & Role · M-03 Lokasi · M-18 Activity Log · M-20 Konfigurasi Sistem |
| **Bergantung pada** | Phase 00 |
| **Memblokir** | Phase 02 |
| **Log** | [`logs/phase-01.md`](../logs/phase-01.md) |

---

## 1. Objective

Administrator dapat masuk ke sistem yang sudah "berisi": membuat pengguna dan role, menyusun hierarki lokasi sekolah, mengatur parameter sistem, dan menelusuri seluruh jejak perubahannya. Empat modul ini **tidak bergantung pada modul mana pun** dan karena itu dapat dikerjakan sepenuhnya paralel.

## 2. Scope

**Termasuk**

- M-02: CRUD pengguna, matriks permission, impor massal
- M-03: hierarki Gedung → Area → Ruangan, pencarian aset per lokasi *(tanpa data aset — kembali di Phase 02)*
- M-18: penelusuran & ekspor activity log *(penulisannya sudah ada sejak Phase 00)*
- M-20: parameter sistem, kalender akademik, unit kerja, siklus akun siswa
- Master data Lampiran E: `academic_years`, `academic_terms`, `holidays`, `work_units`

**Tidak termasuk**

- Autentikasi (login, 2FA) → **Phase 02** — pengguna dibuat, belum bisa login
- Aset di dalam ruangan → **Phase 02**
- `room_fixed_schedules` (FR-07.5) → **Phase 03** bersama M-07

## 3. Dependencies

| Bergantung pada | Alasan teknis |
|---|---|
| Phase 00 | Registri route, `AuthContext`, `AuditLogger`, seed permission, migration runner |

Keempat modul **tidak saling bergantung** — dapat dikerjakan empat jalur paralel:

```
M-02  ┐
M-03  ├─ paralel, tanpa saling menunggu
M-18  │
M-20  ┘
```

### 3.1 Kontribusi terhadap milestone PRD

Phase adalah gelombang dependensi; milestone PRD adalah pengelompokan bisnis. Keduanya **tidak sejajar satu-ke-satu** — sebuah milestone baru tertutup setelah beberapa phase.

| Modul | Milestone PRD ([29.2](../../PRD/01-product/delivery-plan.md)) |
|---|---|
| M-02, M-03, M-20 | `M1 — Identitas & Data Induk` |
| M-18 | `M5 — Insight, Notifikasi & AI` |

Tidak ada milestone yang **tertutup** oleh phase ini. `M1` menunggu M-01, M-04 (Phase 02) dan M-05 (Phase 03).

## 4. Referensi PRD

| Berkas | ID yang dilayani |
|---|---|
| [`m02-users.md`](../../PRD/02-modules/m02-users.md) | `FR-02.1` `FR-02.2` · `BR-066` … `BR-069`, `BR-073` `BR-074` |
| [`m03-locations.md`](../../PRD/02-modules/m03-locations.md) | `FR-03.1` `FR-03.2` · `BR-013` … `BR-016` |
| [`m18-activity-log.md`](../../PRD/02-modules/m18-activity-log.md) | `FR-18.1` `FR-18.2` · `BR-071` `BR-072` |
| [`m20-settings.md`](../../PRD/02-modules/m20-settings.md) | `FR-20.1` |
| [`conventions.md`](../../PRD/00-foundation/conventions.md) | Lampiran E.2–E.5 · `AC-YR-01` … `04`, `WU-01` … `03`, `SL-01` … `SL-06`, `IMPT-01` … `05` |
| [`roles-permissions.md`](../../PRD/00-foundation/roles-permissions.md) | Bab 18, `PM-05` `PM-06` |

## 5. Referensi SDD

| Berkas | Keputusan yang diterapkan |
|---|---|
| [`03-authorization.md`](../../SDD/03-authorization.md) | `SDD-AUTH-04` (cache & `role_version`), `SDD-AUTH-10` (permission inti) |
| [`05-database-design.md`](../../SDD/05-database-design.md) | `SDD-DB-01` … `SDD-DB-06` |
| [`06-api-design.md`](../../SDD/06-api-design.md) | `SDD-API-05` … `SDD-API-07` (paginasi, filter, presenter) |
| [`15-observability-logging.md`](../../SDD/15-observability-logging.md) | `SDD-OBS-01` (pemisahan activity log vs log aplikasi) |

## 6. Deliverables

- Endpoint `/users`, `/roles`, `/locations/tree`, `/buildings`, `/areas`, `/rooms/{id}`, `/activity-logs`, `/settings`
- Impor massal pengguna dengan laporan galat per baris
- Matriks permission dapat disunting; perubahan berlaku ≤ 60 detik tanpa restart
- Pohon lokasi dapat diperluas/diciutkan
- Kalender akademik & hari libur terisi
- Antarmuka penelusuran activity log dengan perbandingan nilai sebelum/sesudah

## 7. Pull Request Plan

| PR | Judul | Kode | Uji | Bergantung | FR/SDD | Acceptance |
|---|---|:---:|:---:|---|---|---|
| `PR-01-01` | Skema `users`, `roles`, `permissions`, `role_permissions` | M | M | Ph00 | `FR-02.1`, `SDD-DB-04` | Migration naik-turun bersih |
| `PR-01-02` | CRUD pengguna + soft delete + aturan Administrator terakhir | M | M | 01 | `FR-02.1`, `BR-067` `BR-068` `BR-070a` | Menonaktifkan Administrator terakhir ditolak |
| `PR-01-03` | Impor massal pengguna (CSV/XLSX) | M | M | 02 | `FR-02.1 A4`, `IMPT-01` … `05` | 500 baris; baris gagal tidak menggagalkan berkas |
| `PR-01-04` | Matriks permission + `role_version` + cache 60 detik | M | M | 01 | `FR-02.2`, `PM-05`, `SDD-AUTH-04/10` | Perubahan berlaku tanpa restart; permission inti tidak dapat dicabut |
| `PR-01-05` | Skema `buildings`/`areas`/`rooms` + CRUD | M | M | Ph00 | `FR-03.1`, `BR-013` `BR-014` | Kode unik per tingkat; hierarki tiga tingkat |
| `PR-01-06` | Pohon lokasi + penonaktifan berjenjang | M | M | 05 | `FR-03.1 A2/A3`, `BR-015` | Lokasi bermuatan aset tidak dapat dinonaktifkan |
| `PR-01-07` | Daftar aset per lokasi *(kerangka; data menyusul Phase 02)* | S | S | 05 | `FR-03.2` | Endpoint mengembalikan struktur benar dengan daftar kosong |
| `PR-01-08` | Penelusuran activity log + filter + detail sebelum/sesudah | M | M | Ph00 | `FR-18.2` | Filter kombinasi ≤ 3 detik; tampilan bukan JSON mentah |
| `PR-01-09` | Ekspor activity log + pencatatan aksi ekspor itu sendiri | S | S | 08 | `FR-18.2`, `AL-10` | Ekspor tercatat sebagai aktivitas tersendiri |
| `PR-01-10` | `system_settings` + endpoint baca/tulis + validasi rentang | M | M | Ph00 | `FR-20.1` | Nilai di luar rentang ditolak dengan penjelasan |
| `PR-01-11` | Kalender akademik: `academic_years`, `terms`, `holidays` | M | M | 10 | Lampiran E.2, `AC-YR-01` … `04` | Tepat satu tahun ajaran aktif |
| `PR-01-12` | `work_units` + migrasi `users.unit_kerja` → `work_unit_id` | M | M | 02, 10 | Lampiran E.3, `WU-01` … `03` | Pola expand→migrate; kolom lama belum dihapus |
| `PR-01-13` | Siklus akun siswa: kenaikan kelas massal, kelulusan | M | M | 02, 11 | Lampiran E.4, `SL-01` … `SL-06` | Siswa berkewajiban aktif tidak dapat dinonaktifkan |
| `PR-01-14` | Gerbang persetujuan wali (`consent_guardian_at`) | S | S | 02 | `DP-02`, `SL-06`, `NT-48` | Akun siswa tanpa penanda tidak dapat diaktifkan |

## 8. Task Breakdown

### `PR-01-04` — Matriks permission
- [ ] Endpoint `PUT /roles/{id}/permissions`
- [ ] Naikkan `role_version` pada setiap perubahan (`SDD-AUTH-04`)
- [ ] Cache permission berkunci `perm:{user_id}:{role_version}`, TTL 60 detik
- [ ] Tolak pencabutan permission inti 🔒 di lapisan domain, bukan UI (`SDD-AUTH-10`)
- [ ] Uji: perubahan matriks berlaku pada permintaan berikutnya tanpa restart

### `PR-01-12` — Migrasi `unit_kerja`
- [ ] **Expand**: tambah `users.work_unit_id` nullable; kolom `unit_kerja` lama tetap ada
- [ ] **Migrate**: skrip pemetaan teks bebas → `work_units`; baris tak terpetakan dilaporkan
- [ ] Kode beralih membaca `work_unit_id`
- [ ] **Contract** (hapus `unit_kerja`) dijadwalkan **Phase 08**, bukan phase ini (`SDD-DB-08`)

### `PR-01-13` — Siklus akun siswa
- [ ] Simpan `academic_year_id` + `kelas` per tahun ajaran (`SL-01`)
- [ ] Operasi kenaikan kelas massal (`SL-02`)
- [ ] Penandaan lulus → penonaktifan otomatis akhir tahun ajaran (`SL-03`)
- [ ] Blokir penonaktifan bila masih ada kewajiban (`SL-04`) — *pemeriksaan peminjaman/denda menjadi tanggung jawab Phase 05; sediakan titik ekstensi, jangan hardcode "tidak ada kewajiban"*

## 9. Acceptance Checklist

- [ ] Seluruh AC pada `FR-02.1`, `FR-02.2`, `FR-03.1`, `FR-03.2`, `FR-18.1`, `FR-18.2`, `FR-20.1` terverifikasi
- [ ] Uji otorisasi tergenerate lulus untuk keempat modul (`SEC-T-01`)
- [ ] Impor 500 pengguna dengan laporan galat per baris (`IMPT-02`)
- [ ] Perubahan matriks permission berlaku ≤ 60 detik tanpa restart (`PM-05`)
- [ ] Setiap operasi tulis menghasilkan entri activity log (`AL-01`)
- [ ] Akun siswa tanpa `consent_guardian_at` tidak dapat diaktifkan (`DP-02`)

## 10. Risks

| Risiko | Dampak | Mitigasi | Rujukan |
|---|---|---|---|
| Data `unit_kerja` lama tidak terpetakan bersih | Pelaporan per unit kerja tidak akurat | Skrip migrasi melaporkan baris tak terpetakan; tidak ada penebakan | `WU-01` |
| `SL-04` diimplementasikan sebelum modul kewajiban ada | Aturan tidak lengkap dan terlupakan | Titik ekstensi eksplisit; ditutup di Phase 05 dan tercatat di log phase | `SL-04` |
| Impor massal dianggap fitur kecil | `RS-01` (pendataan awal) melambat | Impor adalah jalur kritis implementasi (`IMP-01`/`IMP-02`), bukan pelengkap | `RS-01` |
| Cache permission menyimpan hasil basi | Pengguna memakai hak lama | `role_version` pada kunci membatalkan seketika | `SDD-AUTH-04` |

## 11. Rollback Strategy

| Skenario | Tindakan |
|---|---|
| PR gagal di staging | Revert PR; modul lain tidak terdampak karena keempatnya independen |
| `PR-01-12` bermasalah | Kolom `unit_kerja` lama masih ada — kode dikembalikan membacanya tanpa migration `down` |
| Phase perlu dibatalkan | Belum ada data produksi; staging di-*reseed* |

Mulai phase ini, aturan **expand→migrate→contract** berlaku penuh: tidak ada PR yang boleh memuat *expand* dan *contract* untuk kolom yang sama.

## 12. Definition of Done

**DoD dasar** — [PRD 29.5](../../PRD/01-product/delivery-plan.md).

**Tambahan khusus phase ini:**

- [ ] Empat modul dapat didemokan mandiri kepada Administrator sekolah
- [ ] Template impor pengguna (Lampiran E.5.2) tersedia untuk diunduh (`IMPT-05`) — prasyarat `IMP-02`
- [ ] Kalender akademik terisi untuk tahun ajaran berjalan (`AC-YR-01`)
- [ ] Log phase terisi

---

*Phase ini tidak memuat requirement maupun keputusan desain baru. Setiap pernyataan merujuk PRD atau SDD.*
