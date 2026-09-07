# Strategi Percabangan & Alur Review

Model percabangan **bukan keputusan dokumen ini**. Ia ditetapkan [`CD-03`](../PRD/03-architecture/deployment-ops.md):

> `main` (production) ← `staging` ← `develop` ← *feature branch*; rilis melalui tag bersemantik `vMAJOR.MINOR.PATCH`

Yang ada di sini hanyalah **cara kerja sehari-hari di dalam model itu**: penamaan cabang, aturan penggabungan, alur review, dan Definition of Done tingkat PR.

---

## 0. Keadaan saat ini — transisi tersisa

**Model pada §1 belum dapat dijalankan utuh.** `develop` sudah hidup sejak 6 September 2026; `staging` belum ada dan baru dibangun bersama lingkungannya pada [`PR-00-18`](phases/phase-00.md). `apps/` sudah dibuat oleh `PR-00-01`, dan sejak `PR-00-04`/`PR-00-05` uji berkas maupun uji integrasi ikut berdiri — sehingga lint, build, dan test sudah memiliki sasaran nyata. Pipeline `CD-01` tetap belum ada; pembuatannya adalah scope `PR-00-17`.

Selama masa transisi ini berlaku:

| Hal | Ketentuan sementara |
|---|---|
| Cabang hidup | `main` dan `develop`; `staging` menunggu `PR-00-18` |
| Jalur kerja | Cabang bernama sesuai §2 → PR → `develop` |
| Penamaan | §2 berlaku penuh. Pekerjaan yang hanya menyentuh `docs/` memakai `chore/` — jenisnya sudah berarti "tanpa perubahan perilaku" |
| Tinjauan | §3.1 berlaku penuh; ditegakkan [`.github/CODEOWNERS`](../../.github/CODEOWNERS) |
| Template PR | §4 berlaku penuh; terisi otomatis lewat [`.github/pull_request_template.md`](../../.github/pull_request_template.md) |

**Transisi ini berakhir saat `PR-00-18` selesai.** Sejak titik itu `staging` hidup dan seluruh jalur §1 dapat dijalankan. Penggabungan langsung ke `main` tetap tertutup sepenuhnya.

Yang **tidak** dikecualikan sedikit pun: penamaan cabang (§2), syarat penggabungan ke `develop` (§3), tinjauan arsitek (§3.1), pemakaian template dan klasifikasi komentar (§4), serta DoD tingkat PR (§5). Validasi lokal dapat dicatat di deskripsi PR, tetapi tidak menjadikannya pipeline hijau `CD-01`.

Keadaan aktual terhadap seluruh aturan — termasuk penyimpangan yang tercatat dan setelan branch protection yang belum dinyalakan — ada di [`GITHUB-CI-STATE.md`](GITHUB-CI-STATE.md).

---

## 1. Peta cabang

```
feature/*  ──▶  develop  ──▶  staging  ──▶  main  ──▶  tag vX.Y.Z
   │              │             │            │
 lokal        integrasi      lingkungan   produksi
              berkelanjutan   staging     (sekali, go-live)
                                │
                            hotfix/*  ──▶  main  ──▶  di-*cherry-pick* balik ke develop
```

| Cabang | Umur | Menerima dari | Lingkungan |
|---|---|---|---|
| `feature/*` | ≤ 3 hari | — | Lokal |
| `develop` | permanen | `feature/*` lewat PR | Integrasi |
| `staging` | permanen | `develop` lewat PR | Staging (otomatis, `CD-03`) |
| `main` | permanen | `staging` lewat PR · `hotfix/*` | Produksi (lewat tag, `CD-06`) |
| `hotfix/*` | ≤ 1 hari | `main` | Produksi |

**Umur cabang maksimum 3 hari** bukan preferensi gaya. Phase 03 menjalankan enam modul paralel dan Phase 02 tiga puluh PR; cabang berumur seminggu pada phase seperti itu menumpuk konflik penggabungan ke pekan terakhir — persis saat tidak ada waktu tersisa untuk menyelesaikannya.

## 2. Penamaan cabang

```
<jenis>/<id-pr>-<ringkasan-kebab>
```

| Jenis | Kapan | Contoh |
|---|---|---|
| `feature/` | PR yang terdaftar pada rencana phase | `feature/PR-02-17-slot-service` |
| `fix/` | Cacat yang ditemukan sebelum rilis | `fix/PR-07-04-approval-race` |
| `hotfix/` | Cacat produksi pasca go-live | `hotfix/login-lockout` |
| `chore/` | Perkakas, dependensi, CI, **dan perubahan yang hanya menyentuh `docs/`** — tanpa perubahan perilaku | `chore/bump-node-lts` · `chore/dokumentasi-ux-design-system` |

Menyertakan ID PR pada nama cabang membuat rantai *cabang → PR → phase → requirement* dapat ditelusuri tanpa membuka dokumen apa pun.

**Pekerjaan di luar rencana phase.** Bila muncul kebutuhan yang tidak ada dalam daftar PR phase mana pun, cabang tetap boleh dibuat, tetapi PR-nya wajib menjelaskan mengapa ia tidak terencana dan butir itu ditambahkan ke log phase. Pekerjaan tak tercatat adalah cara sebuah rencana kehilangan maknanya tanpa ada yang menyadarinya.

## 3. Aturan penggabungan

| Ke | Syarat |
|---|---|
| `develop` | Pipeline hijau (`CD-01`) · minimal satu *approval* · DoD PR §5 terpenuhi |
| `staging` | Seluruh PR phase berjalan sudah di `develop` · DoD phase terpenuhi |
| `main` | Seluruh gerbang rilis `GL-01`–`GL-12` terpenuhi ([PRD 29.3](../PRD/01-product/delivery-plan.md)) |

**Riwayat linear.** Penggabungan ke `develop` memakai *squash*: satu PR menjadi satu commit. Penggabungan `develop` → `staging` → `main` memakai *merge commit* agar batas antar-phase tetap terbaca pada riwayat.

**Tidak ada dorongan langsung ke `develop`, `staging`, maupun `main`.** Termasuk untuk perbaikan sepele. Cabang yang dilindungi hanya bermanfaat bila tidak pernah ada pengecualian.

### 3.1 Tinjauan arsitek wajib

Sebagian PR menyentuh tulang punggung yang dipakai bersama banyak modul. Perubahannya menjalar, dan akibatnya baru terlihat beberapa phase kemudian.

| Yang tersentuh | Alasan |
|---|---|
| `SlotService` / skema `booking_slots` — `shared/booking/` (`SDD-SYS-10`) | Melayani **enam** modul (M-04, M-07, M-08, M-09, M-12, M-21) dengan satu semantik; berada di *shared kernel*, bukan di dalam modul |
| Evaluator DSL / mesin approval | Melayani enam modul berpersetujuan |
| Lapisan permission / `AuthContext` | Setiap kebocoran di sini adalah kebocoran menyeluruh |
| Migration apa pun | `expand → migrate → contract` (`CD-04`, `SDD-DB-08`) |
| `AuditLogger` / rantai hash activity log | `AL-01`, `NFR-S-03d` |

Pada Phase 04 dan seterusnya, **PR yang menuntut perubahan pada `SlotService` adalah sinyal**, bukan sekadar pekerjaan: ia berarti abstraksi Phase 02 kurang umum. Perubahannya dibahas sebelum ditulis, bukan sesudah.

## 4. Alur review

```
1. Penulis membuka PR memakai templates/PULL-REQUEST.md
2. CI berjalan: lint → uji → SAST → SCA → build → image scan   (CD-01)
3. Peninjau membaca deskripsi PR sebelum membaca diff
4. Komentar diklasifikasi: [blocker] · [saran] · [tanya]
5. Penulis menanggapi setiap [blocker]; [saran] boleh ditolak dengan alasan
6. Approval → squash merge ke develop
7. Cabang dihapus
```

**Peninjau membaca deskripsi lebih dulu.** Deskripsi PR memuat ID requirement yang dilayani. Meninjau diff tanpa mengetahui requirement-nya menghasilkan tinjauan gaya penulisan, bukan tinjauan kebenaran.

**Klasifikasi komentar wajib.** Tanpa penanda, penulis menebak mana yang menghalangi penggabungan. `[blocker]` menghentikan penggabungan; `[saran]` tidak; `[tanya]` hanya meminta penjelasan.

### 4.1 Yang wajib diperiksa peninjau

| # | Pertanyaan |
|:---:|---|
| 1 | Apakah PR merujuk minimal satu ID PRD atau SDD? Bila tidak — mengapa dikerjakan? |
| 2 | Apakah perilaku yang ditulis sesuai ID yang dirujuk, bukan sesuai tafsiran penulis? |
| 3 | Apakah setiap operasi tulis menghasilkan entri activity log (`AL-01`)? |
| 4 | Apakah setiap endpoint mendeklarasikan permission-nya (`PM-01`)? |
| 5 | Apakah setiap repository menerima `AuthContext` (`SDD-AUTH-05`)? |
| 6 | Apakah ada uji yang gagal bila perilaku ini dicabut? |
| 7 | Bila ada migration — apakah ia *expand*, bukan *contract*? |
| 8 | Apakah ada `TODO` atau data uji yang tertinggal (DoD 29.5)? |

Butir 6 adalah yang paling sering terlewat. Uji yang tetap hijau setelah logikanya dihapus tidak menguji apa pun.

## 5. Definition of Done tingkat PR

[PRD 29.5](../PRD/01-product/delivery-plan.md) menetapkan DoD tingkat **requirement**. Sebuah PR biasanya lebih kecil dari satu requirement, sehingga sebagian butir 29.5 baru terpenuhi setelah beberapa PR. Daftar berikut adalah **bagian 29.5 yang dapat diperiksa per PR**, bukan DoD baru:

- [ ] Pipeline hijau (`CD-01`); cakupan logika inti ≥ 70% (`CD-02`, `NFR-M-03`)
- [ ] Unit test untuk logika bisnis; integration test untuk endpoint (29.5)
- [ ] Otorisasi diuji termasuk kasus penolakan (29.5)
- [ ] Activity log tercatat untuk operasi tulis yang dihasilkan (`AL-01`)
- [ ] OpenAPI diperbarui bila kontrak berubah (`NFR-M-05`)
- [ ] Tidak ada `TODO` maupun data uji pada jalur produksi (29.5)
- [ ] Deskripsi PR merujuk ID PRD/SDD dan ID PR pada rencana phase
- [ ] Migration bersifat *expand*; `down` teruji (`CD-04`, `CD-05`)

Butir 29.5 yang **tidak** dapat diperiksa per PR — verifikasi QA di staging, notifikasi sesuai katalog Bab 20, berjalan di web dan mobile, pemeriksaan aksesibilitas — diperiksa pada gerbang keluar phase, tercatat di berkas phase bagian 9 dan 12.

## 6. Hotfix pasca go-live

Berlaku setelah produksi hidup, mengikuti model dukungan [PRD 29.7](../PRD/01-product/delivery-plan.md).

```
1. Cabang dari main, bukan dari develop
2. Perbaikan sekecil mungkin — hotfix bukan tempat perbaikan sekalian
3. Uji di staging lebih dulu, meski mendesak
4. Merge ke main → tag patch vX.Y.Z+1
5. Cherry-pick ke develop pada hari yang sama
```

Langkah 5 paling sering terlewat, dan akibatnya paling merugikan: rilis berikutnya memunculkan kembali cacat yang sudah diperbaiki. Bila sebuah hotfix tidak ada di `develop` pada akhir hari, ia dianggap belum selesai.

Keparahan insiden yang menentukan apakah sesuatu layak menjadi hotfix ditetapkan [PRD 29.7](../PRD/01-product/delivery-plan.md), bukan dokumen ini.

## 7. Penandaan versi

Format `vMAJOR.MINOR.PATCH` ditetapkan `CD-03`.

| Bagian | Naik ketika |
|---|---|
| MAJOR | Perubahan yang memutus kompatibilitas API publik |
| MINOR | Penambahan fungsi tanpa memutus kompatibilitas |
| PATCH | Perbaikan cacat |

Go-live menghasilkan `v1.0.0`. Sebelum go-live tidak ada tag produksi — seluruh phase 00–08 berjalan di `develop` dan `staging`. Ini konsekuensi langsung dari strategi rilis **big bang** (Keputusan #13, `DL-01`): satu rilis produksi, banyak checkpoint internal.

---

*Dokumen ini tidak memuat requirement, keputusan desain, maupun business rule baru. Model percabangan, gerbang pipeline, dan aturan rollback tetap milik [`CD-01` … `CD-07`](../PRD/03-architecture/deployment-ops.md).*
