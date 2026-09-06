# Keadaan GitHub & CI/CD — Current vs Target

Berkas ini **tidak menetapkan aturan**. Seluruh aturan sudah ada di tempat lain; di sini hanya dicatat **sejauh mana repositori sudah menaatinya**, dan apa yang menutup selisihnya.

| Aturan berasal dari | Berkas |
|---|---|
| Model percabangan & alur review | [`BRANCHING-STRATEGY.md`](BRANCHING-STRATEGY.md) |
| `CD-01` … `CD-07` | [`deployment-ops.md`](../PRD/03-architecture/deployment-ops.md) |
| Urutan pipeline & lingkungan | [`SDD-16 §4.3`](../SDD/16-infrastructure-deployment.md) |
| Letak `.github/workflows/` | [`SDD-17 §4.1`](../SDD/17-repo-layout.md) |
| Template & klasifikasi komentar | [`templates/PULL-REQUEST.md`](templates/PULL-REQUEST.md) |
| Gerbang rilis `GL-01` … `GL-12` | [`delivery-plan.md`](../PRD/01-product/delivery-plan.md) |
| Penyedia CI & perkakas uji | `SDD-INF-12` (GitHub Actions) · `SDD-REPO-11` (Vitest · Playwright · Maestro) |
| Perkakas tahap keamanan | `SDD-SEC-11` (CodeQL · Dependabot · Trivy · OWASP ZAP) |
| Pembangun pipeline | `PR-00-17` · `PR-00-18` — [`phase-00.md`](phases/phase-00.md) |

Bila berkas ini bertentangan dengan salah satu di atas, **yang di atas yang berlaku**.

---

## 1. Mengapa ada dua keadaan

Phase 00 baru dimulai. `PR-00-01` sudah membuat ketiga pohon `apps/*` beserta `packages/schemas`, lengkap dengan lint dan TypeScript-nya, sehingga `npm run lint` dan `npm run build` kini punya sasaran nyata. Yang belum ada adalah **pipeline yang menjalankannya**: seluruh tahap `CD-01` dibangun `PR-00-17`, dan lingkungan staging beserta job migration dibangun `PR-00-18` — keduanya di Phase 00.

Karena itu sebagian aturan **belum dapat ditaati**, bukan karena diabaikan. Membedakan keduanya penting: aturan yang tidak dapat ditaati dan aturan yang dilanggar menuntut tindakan yang berbeda.

## 2. Percabangan

| Aturan | Sumber | Current State | Target State | Penutup selisih |
|---|---|---|---|---|
| `feature/*` → `develop` → `staging` → `main` | `CD-03` | `main` dan `develop` hidup sejak 6 September 2026; `staging` **belum ada** | Empat cabang hidup sesuai `CD-03` | `staging` — `PR-00-18` |
| Tidak ada dorongan langsung ke `develop`/`staging`/`main` | `BRANCHING §3` | **Ditegakkan** sejak 6 September 2026 pada `main` dan `develop` (§4) | Ketiganya terlindungi; hanya lewat PR | `staging` — `PR-00-18` |
| Penamaan `feature/` `fix/` `hotfix/` `chore/` | `BRANCHING §2` | Dipatuhi; **satu penyimpangan**: `docs/domain-aset-bahan-m22` | Seluruh cabang bernama sesuai daftar | Pekerjaan dokumentasi memakai `chore/` |
| Umur cabang ≤ 3 hari | `BRANCHING §1` | Tidak terukur | Terpantau saat phase berjalan | — |
| Squash ke `develop`; merge commit ke `staging`/`main` | `BRANCHING §3` | Berlaku sejak `develop` hidup — `PR-00-01` digabungkan dengan *squash*; masih kebiasaan, belum ditegakkan setelan | Diatur pada branch protection | Branch protection §4 |

**Penyimpangan tercatat.**

- Cabang `docs/domain-aset-bahan-m22` memakai jenis di luar daftar `BRANCHING §2` dan digabungkan langsung ke `main`. Keduanya terjadi sebelum bagian *Current State* pada `BRANCHING-STRATEGY` ditulis. Cabang sudah tergabung dan tidak diganti nama; pekerjaan dokumentasi berikutnya memakai `chore/`.
- **`develop` dibuat manual pada 6 September 2026**, saat pemulihan cabang setelah `main` lokal sempat menyimpang dari `origin/main` — bukan oleh `PR-00-18` sebagaimana tabel di atas merencanakannya. Ia dibuat dari `main` pada SHA yang identik, lalu menerima isinya lewat PR seperti biasa. `staging` tetap menunggu `PR-00-18`.

## 3. Pipeline CI/CD

Urutan yang ditetapkan `CD-01` dan `SDD-16 §4.3`:

```
lint → unit test → integration test → uji otorisasi tergenerate
→ SAST → SCA → build image → image scan → deploy staging → DAST → smoke test
```

| Tahap | Gerbang | Current State | Dibangun oleh |
|---|---|---|---|
| lint | Impor lintas modul melanggar batas → gagal | Lint menegakkan batas antar-pohon (`SDD-REPO-06/07`), batas lapisan, dan — sejak `PR-00-02` — batas antar-**modul** (`SDD-SYS-02/03`, `SDD-00 §4.2`); seluruhnya dibuktikan uji negatif `scripts/check_import_boundaries.mjs`. Yang belum ada tinggal pemasangannya di CI | `PR-00-17` |
| unit test | Cakupan logika inti < 70% → **stop** (`CD-02`, `NFR-M-03`) | Belum ada — runner-nya **Vitest** (`SDD-REPO-11`) | `PR-00-17` |
| integration test | Termasuk uji konkurensi `CC-01`…`CC-07` | Belum ada | `PR-00-17` |
| uji otorisasi tergenerate | `SEC-T-01` | Belum ada | `PR-00-17` |
| SAST | `ST-01` | Belum ada — perkakasnya **CodeQL** (`SDD-SEC-11`) | `PR-00-17` |
| SCA | Critical/High → **stop** (`ST-02`) | Belum ada — perkakasnya **Dependabot** (`SDD-SEC-11`) | `PR-00-17` |
| build + image scan | `CD-01` | Belum ada — pemindainya **Trivy** (`SDD-SEC-11`) | `PR-00-17` |
| deploy staging → DAST → smoke test | `ST-03`, `CD-07` | Belum ada — DAST memakai **OWASP ZAP** (`SDD-SEC-11`); proxy staging **Nginx + certbot** (`SDD-INF-13`) | `PR-00-18` |

Penyedianya kini tertulis, bukan tersirat: **GitHub Actions** (`SDD-INF-12`, 6 September 2026); perkakas tahap uji adalah **Vitest**, **Playwright**, dan **Maestro** (`SDD-REPO-11`); perkakas tahap keamanan adalah **CodeQL**, **Dependabot**, **Trivy**, dan **OWASP ZAP** (`SDD-SEC-11`). Seluruh tahap pada tabel di atas kini punya nama perkakas — yang tersisa hanyalah menulis workflow-nya di `PR-00-17`.

**`.github/workflows/` sengaja masih kosong.** Sejak `PR-00-01`, alasannya bukan lagi ketiadaan sasaran — `npm run lint` dan `npm run build` sudah hijau dan dapat dipanggil CI hari ini. Yang tersisa adalah urutan pekerjaan: menulis pipeline sekarang mendahului `PR-00-17`, sementara tahap uji, SAST, SCA, dan pemindaian image belum punya apa pun untuk dijalankan. Pipeline ditulis sekali di `PR-00-17`, bukan dirintis sepotong lalu ditulis ulang.

### Migration & deploy produksi

| Aturan | Sumber | Status |
|---|---|---|
| Migration job terpisah sebelum instance baru menerima trafik | `CD-04` | Target — `PR-00-18` |
| `expand → migrate → contract`; `contract` hanya di `PR-08-11` | `CD-04`, [`DELIVERY-PLAN §6`](DELIVERY-PLAN.md) | Berlaku sejak migration pertama |
| Image 5 rilis terakhir dipertahankan; rollback ≤ 15 menit | `CD-05` | Target — Phase 08 |
| Deploy produksi di luar jam operasional, diumumkan H-2 | `CD-06` | Target — go-live |
| Smoke test pasca-deploy | `CD-07` | Target — `PR-00-18` |

Merge ke `main` mensyaratkan seluruh gerbang rilis `GL-01`…`GL-12` (`BRANCHING §3`). Gerbang itu bersifat go-live sekali, bukan per-PR.

## 4. Yang harus disetel manual di GitHub

Branch protection **tidak dapat diatur lewat berkas**. Daftar berikut menerjemahkan `BRANCHING §3` dan `CD-01`/`CD-02` menjadi setelan yang perlu dinyalakan pada Settings → Branches. Belum satupun aktif.

| Cabang | Setelan | Aturan yang ditegakkan | Status |
|---|---|---|---|
| `main`, `develop` | Require a pull request before merging | `BRANCHING §3` — tanpa dorongan langsung | ✅ **aktif** 6 September 2026 |
| `main`, `develop` | Block force push | `BRANCHING §3` | ✅ **aktif** |
| `main`, `develop` | Block branch deletion | `BRANCHING §3` | ✅ **aktif** |
| `main`, `develop` | Do not allow bypassing (termasuk admin) | `BRANCHING §3` — "hanya bermanfaat bila tidak pernah ada pengecualian" | ✅ **aktif** |
| `main`, `develop` | Require conversation resolution | `BRANCHING §4` — komentar terklasifikasi tidak menggantung | ✅ **aktif** |
| `main`, `develop` | Dismiss stale approvals | `BRANCHING §3` | ✅ **aktif** |
| `main`, `staging`, `develop` | Require review from Code Owners | `BRANCHING §3.1` — tinjauan arsitek wajib | ⏸ **ditunda** — lihat catatan di bawah |
| `develop` | Minimal 1 approval | `BRANCHING §3` | ⏸ **ditunda** — lihat catatan di bawah |
| ketiganya | Require status checks to pass | `CD-01`, `CD-02` | ⏳ menunggu `PR-00-17` |
| ketiganya | Require branches to be up to date before merging | Mencegah penggabungan di atas basis usang | ⏳ menunggu `PR-00-17` — GitHub hanya menyediakannya **bersama** required status check |
| `develop` | Allow squash merge **saja** | `BRANCHING §3` — satu PR satu commit | ❌ **tidak dapat diberkaskan maupun disetel** — lihat catatan di bawah |
| `staging`, `main` | Allow merge commit **saja** | `BRANCHING §3` — batas antar-phase tetap terbaca | ❌ idem |

**Dua baris tinjauan sengaja ditunda, bukan terlewat.** `CODEOWNERS` saat ini hanya berisi `@HanzzzBD`, dan GitHub tidak mengizinkan seseorang menyetujui pull request-nya sendiri. Menyalakan *required approvals* atau *Code Owners review* sekarang berarti **tidak ada satu pun PR yang dapat digabungkan** — termasuk `PR-00-03` yang sedang terbuka. Keduanya dinyalakan bersamaan dengan penggantian `CODEOWNERS` begitu tim arsitek terbentuk; sampai saat itu `BRANCHING §3.1` ditegakkan sebagai kebiasaan, dan keadaan itu tercatat jujur di §6 alih-alih disamarkan sebagai setelan yang menunggu.

**Metode merge per-cabang tidak dapat ditegakkan GitHub.** `allow_squash_merge`, `allow_merge_commit`, dan `allow_rebase_merge` adalah setelan **tingkat repositori**, bukan tingkat cabang — sehingga "squash saja untuk `develop`" dan "merge commit saja untuk `main`/`staging`" tidak dapat berdiri bersamaan sebagai setelan. Ketiganya kini aktif di repositori, dan `BRANCHING §3` pada titik ini berlaku sebagai **disiplin peninjau**, bukan sebagai pagar. Menonaktifkan salah satunya justru akan melanggar baris yang lain.

Per 6 September 2026 proteksi **dinyalakan** pada `main` dan `develop` lewat `gh api`, dan hasilnya diverifikasi kembali dari API. `staging` menunggu `PR-00-18`. Enam setelan aktif, dua ditunda karena tim, dua menunggu `PR-00-17`, dan dua tidak dapat disetel sama sekali — rinciannya pada tabel di atas.

## 5. Berkas governance yang sudah ada

| Berkas | Isi | Aturan yang dilayani |
|---|---|---|
| [`.github/pull_request_template.md`](../../.github/pull_request_template.md) | Salinan blok template agar GitHub mengisinya otomatis | `BRANCHING §4` |
| [`.github/CODEOWNERS`](../../.github/CODEOWNERS) | Lima area bertinjauan arsitek → peninjau wajib | `BRANCHING §3.1` |

**Template PR memiliki dua salinan.** Yang kanonik adalah [`templates/PULL-REQUEST.md`](templates/PULL-REQUEST.md); yang di `.github/` ada semata agar GitHub mengisinya otomatis, karena GitHub tidak membaca templat dari `docs/IMPLEMENTATION/templates/`. **Keduanya wajib diperbarui bersama.**

## 6. Yang masih terbuka

| Hal | Mengapa belum ditutup |
|---|---|
| Pemilik pada `CODEOWNERS` | Tim belum terbentuk; `@HanzzzBD` dipakai sementara. Satu orang yang meninjau pekerjaannya sendiri bukan tinjauan — wajib diganti tim arsitek begitu tim ada |
| Pemilik pada `CODEOWNERS` untuk `shared/booking/` | Letaknya kini ditetapkan `SDD-SYS-10` (*shared kernel*, `apps/api/src/shared/booking/`); barisnya ditambahkan ke `CODEOWNERS` pada `PR-02-17` sesuai rencana, bukan lebih awal |
| Vendor observability | `SDD-OBS-09` menetapkan *backend* terkelola dan `SDD-OBS-10` menjadikan region Indonesia **kriteria gugur** yang diverifikasi sebelum kontrak; namanya ditetapkan pada seleksi `PR-00-06`, bukan lebih awal |
