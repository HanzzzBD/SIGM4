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

Phase 00 berjalan; `PR-00-01` … `PR-00-05` tergabung ke `develop`. Ketiga pohon `apps/*` beserta `packages/schemas` berdiri lengkap dengan lint dan TypeScript-nya; **Vitest terpasang sejak `PR-00-04`** dan **jalur migration berdiri sejak `PR-00-05`**, sehingga `npm run lint`, `build`, `test`, dan `test:integration` seluruhnya punya sasaran nyata dan hijau secara lokal. Sejak `PR-00-17` **pipeline yang menjalankannya berdiri** (`.github/workflows/ci.yml`, §3); yang tersisa adalah lingkungan staging beserta job migration, DAST, dan smoke test — `PR-00-18`.

Karena itu sebagian aturan **belum dapat ditaati**, bukan karena diabaikan. Membedakan keduanya penting: aturan yang tidak dapat ditaati dan aturan yang dilanggar menuntut tindakan yang berbeda.

## 2. Percabangan

| Aturan | Sumber | Current State | Target State | Penutup selisih |
|---|---|---|---|---|
| `feature/*` → `develop` → `staging` → `main` | `CD-03` | `main` dan `develop` hidup sejak 6 September 2026; `staging` **belum ada** — artefak deploy-nya siap sejak `PR-00-18` | Empat cabang hidup sesuai `CD-03` | `staging` — dibuat pemilik repositori ([log §10](logs/phase-00.md)) |
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
lint → unit test → integration test (+ cakupan) → build image
→ SAST → SCA → image scan → deploy staging → DAST → smoke test
```

| Tahap | Gerbang | Current State | Dibangun oleh |
|---|---|---|---|
| lint | Impor lintas modul melanggar batas → gagal | **Berjalan** sejak `PR-00-17` — job `lint`: `npm run lint`, `typecheck`, dan uji negatif `check:boundaries` (`SDD-REPO-06/07`, `SDD-SYS-02/03`) | `PR-00-17` ✅ |
| unit test | — | **Berjalan** — job `uji-berkas`: `npm run test` seluruh workspace | `PR-00-17` ✅ |
| integration test | Cakupan gabungan unit+integrasi < 70% statements/lines → **stop** (`CD-02`, `NFR-M-03`, keputusan 46); uji ter-skip → **stop** | **Berjalan** — job `uji-integrasi` terhadap PostgreSQL 15 + Redis 7 sebagai *service container*, dengan `APP_DATABASE_URL`/`APP_DB_PASSWORD` sehingga `AL-03b` benar-benar berjalan. `CC-01`…`CC-07` baru mungkin setelah `booking_slots` ada (`PR-02-16`) | `PR-00-17` ✅ |
| uji otorisasi tergenerate | `SEC-T-01` | Belum ada — belum ada endpoint berpermission; lahir bersama middleware permission Phase 01–02 dan diperiksa gerbang keluar `phase-01.md`/`phase-02.md` §9 | Phase 01–02 |
| build image | `CD-01` | **Berjalan** — job `build`: `npm run build` + `docker build` konteks bersih; image diteruskan sebagai artefak | `PR-00-17` ✅ |
| SAST | `ST-01`; High/Critical → **stop** | **Berjalan** — job `sast`: **CodeQL** `security-extended`; gagal bila SARIF memuat `security-severity` ≥ 7,0 | `PR-00-17` ✅ |
| SCA | Critical/High → **stop** (`ST-02`) | **Berjalan** — job `sca`: `dependency-review-action` (PR) + `npm audit --audit-level=high`; harian lewat `sca-harian.yml` atas `develop` dan `main`; **Dependabot** alerts & security updates menyala 15 September 2026, pemutakhiran versi lewat `.github/dependabot.yml` ke `develop` (keputusan 45, 48) | `PR-00-17` ✅ |
| image scan | `CD-01`; HIGH/CRITICAL → **stop** | **Berjalan** — job `image-scan`: **Trivy** atas artefak job `build`, tanpa pengecualian. Runtime image tanpa npm/npx/corepack/yarn + `apk upgrade` (keputusan 47); biner dbmate perkakas migration dibangun dari sumber dengan modul Go ditambal (keputusan 56) | `PR-00-17` ✅ |
| deploy staging → smoke test | `CD-03`, `CD-04`, `CD-07` | **Ditulis** — job `publikasi-image` (GHCR, tag SHA) dan `deploy-staging` (SSH → `deploy/staging/deploy.sh`: migration → api ×2 dengan readiness gate → worker; lalu `smoke-test.sh` dari runner) pada push ke `staging`. Terbukti pada **staging tiruan**; belum pernah berjalan pada staging nyata — cabang, environment, secret, dan VPS belum ada | `PR-00-18` ✅ (tiruan) |
| DAST | `ST-03` | Belum ada — **OWASP ZAP** *baseline scan* terhadap staging per kandidat rilis (`SDD-SEC-11`); pemiliknya ditetapkan keputusan 54 | `PR-08-16` |

Seluruh tahap berada di `.github/workflows/ci.yml` dan dirangkum job **`CI lulus`** — satu-satunya *required status check* (`SDD-INF-12`). Job pertama menyaring jalur (`SDD-17 §5`): perubahan yang hanya menyentuh `docs/IMPLEMENTATION`, `docs/UX`, `docs/DESIGN`, atau berkas di luar pohon backend melewati uji, build, dan image scan; **`docs/PRD` dan `docs/SDD` tidak dilewati** karena uji pembanding membacanya. Setiap action dipatok ke SHA commit.

### Migration & deploy produksi

| Aturan | Sumber | Status |
|---|---|---|
| Migration job terpisah sebelum instance baru menerima trafik | `CD-04` | Ditulis `PR-00-18` — container sekali-jalan dari image yang sama; terbukti pada staging tiruan |
| `expand → migrate → contract`; `contract` hanya di `PR-08-11` | `CD-04`, [`DELIVERY-PLAN §6`](DELIVERY-PLAN.md) | Berlaku sejak migration pertama |
| Image 5 rilis terakhir dipertahankan; rollback ≤ 15 menit | `CD-05` | Target — Phase 08 |
| Deploy produksi di luar jam operasional, diumumkan H-2 | `CD-06` | Target — go-live |
| Smoke test pasca-deploy | `CD-07` | Ditulis `PR-00-18` — jalur pengiriman (live, ready, header, 404); alur kritis menyusul PR endpoint-nya |

Merge ke `main` mensyaratkan seluruh gerbang rilis `GL-01`…`GL-12` (`BRANCHING §3`). Gerbang itu bersifat go-live sekali, bukan per-PR.

## 4. Yang harus disetel manual di GitHub

Branch protection **tidak dapat diatur lewat berkas**. Daftar berikut menerjemahkan `BRANCHING §3` dan `CD-01`/`CD-02` menjadi setelan yang perlu dinyalakan pada Settings → Branches. Status tiap baris diverifikasi dari API, bukan dari ingatan.

| Cabang | Setelan | Aturan yang ditegakkan | Status |
|---|---|---|---|
| `main`, `develop` | Require a pull request before merging | `BRANCHING §3` — tanpa dorongan langsung | ✅ **aktif** 6 September 2026 |
| `main`, `develop` | Block force push | `BRANCHING §3` | ✅ **aktif** |
| `main`, `develop` | Block branch deletion | `BRANCHING §3` | ✅ **aktif** |
| `main`, `develop` | Do not allow bypassing (termasuk admin) | `BRANCHING §3` — "hanya bermanfaat bila tidak pernah ada pengecualian" | ✅ **aktif** |
| `main`, `develop` | Require conversation resolution | `BRANCHING §4` — komentar terklasifikasi tidak menggantung | ✅ **aktif** |
| `main`, `develop` | Dismiss stale approvals | `BRANCHING §3` | ✅ **aktif** |
| `develop` | Require review from Code Owners | `BRANCHING §3.1` — tinjauan arsitek wajib | ✅ **aktif** — dinyalakan kembali 15 September 2026 bersama required status check, terverifikasi API `require_code_owner_reviews: true`. Sempat terbaca nonaktif setelah #37 tergabung ([log §7](logs/phase-00.md)) |
| `main`, `staging` | Require review from Code Owners | `BRANCHING §3.1` | ⏸ **ditunda** — `main`: lihat catatan di bawah; `staging` menunggu `PR-00-18` |
| `develop` | Minimal 1 approval | `BRANCHING §3` | ✅ **aktif** — dinyalakan kembali 15 September 2026, terverifikasi API `required_approving_review_count: 1` |
| `develop` | Require status checks to pass — check **`CI lulus`** (GitHub Actions, `app_id` 15368) | `CD-01`, `CD-02`, `SDD-INF-12` | ✅ **aktif** 15 September 2026 — dipasang pemilik repositori setelah `CI lulus` hijau pada PR #38 (keputusan 49); terverifikasi API. PR #38 sendiri langsung berstatus `BLOCKED` · `REVIEW_REQUIRED` |
| `develop` | Require branches to be up to date before merging | Mencegah penggabungan di atas basis usang | ✅ **aktif** 15 September 2026 — `strict: true` |
| `main`, `staging` | Require status checks to pass + up to date | idem | ⏳ `main`: menyusul bersama *Code Owners review*-nya (terverifikasi API: belum ada check) · `staging`: `PR-00-18` |
| `develop` | Allow squash merge **saja** | `BRANCHING §3` — satu PR satu commit | ❌ **tidak dapat diberkaskan maupun disetel** — lihat catatan di bawah |
| `staging`, `main` | Allow merge commit **saja** | `BRANCHING §3` — batas antar-phase tetap terbaca | ❌ idem |

**Tinjauan wajib menyala di `develop` sejak 15 September 2026.** Sampai hari itu `CODEOWNERS` hanya berisi `@HanzzzBD`, dan GitHub tidak mengizinkan seseorang menyetujui pull request-nya sendiri — menyalakan *required approvals* atau *Code Owners review* akan menghentikan setiap merge. Pemilik produk kemudian menetapkan `@PM-Codexpert` (PM, akses `write`) sebagai peninjau, dan namanya dicantumkan pada **setiap** baris `CODEOWNERS`, bukan hanya `*`: baris spesifik mengalahkan `*`, sehingga satu baris berpemilik tunggal tetap mengunci PR buatan pemilik itu. Setiap PR ke `develop` kini wajib disetujui satu code owner selain penulisnya.

**`main` sengaja belum.** GitHub membaca `CODEOWNERS` dari **cabang tujuan**, dan `main` masih memuat versi yang hanya berisi `@HanzzzBD` sampai isi `develop` dipromosikan. Menyalakan *Code Owners review* di `main` sekarang mengunci setiap PR `@HanzzzBD` ke `main`; setelan itu dinyalakan setelah `CODEOWNERS` dua-pemilik tiba di sana (§6).

**Metode merge per-cabang tidak dapat ditegakkan GitHub.** `allow_squash_merge`, `allow_merge_commit`, dan `allow_rebase_merge` adalah setelan **tingkat repositori**, bukan tingkat cabang — sehingga "squash saja untuk `develop`" dan "merge commit saja untuk `main`/`staging`" tidak dapat berdiri bersamaan sebagai setelan. Ketiganya kini aktif di repositori, dan `BRANCHING §3` pada titik ini berlaku sebagai **disiplin peninjau**, bukan sebagai pagar. Menonaktifkan salah satunya justru akan melanggar baris yang lain.

Per 6 September 2026 proteksi **dinyalakan** pada `main` dan `develop` lewat `gh api`, dan hasilnya diverifikasi kembali dari API. Per 15 September 2026 `develop` memperoleh dua setelan tinjauan, lalu — bersama `PR-00-17` — required status check `CI lulus` dan *branch up to date*; pembacaan API terakhir hari itu mengonfirmasi keempatnya aktif. `staging` menunggu `PR-00-18`. `develop` kini **sepuluh** setelan aktif, `main` enam; *Code Owners review* dan status check `main` ditunda, dan dua setelan tidak dapat disetel sama sekali — rinciannya pada tabel di atas.

## 5. Berkas governance yang sudah ada

| Berkas | Isi | Aturan yang dilayani |
|---|---|---|
| [`.github/pull_request_template.md`](../../.github/pull_request_template.md) | Salinan blok template agar GitHub mengisinya otomatis | `BRANCHING §4` |
| [`.github/CODEOWNERS`](../../.github/CODEOWNERS) | Lima area bertinjauan arsitek → peninjau wajib | `BRANCHING §3.1` |

**Template PR memiliki dua salinan.** Yang kanonik adalah [`templates/PULL-REQUEST.md`](templates/PULL-REQUEST.md); yang di `.github/` ada semata agar GitHub mengisinya otomatis, karena GitHub tidak membaca templat dari `docs/IMPLEMENTATION/templates/`. **Keduanya wajib diperbarui bersama.**

## 6. Yang masih terbuka

| Hal | Mengapa belum ditutup |
|---|---|
| *Code Owners review* di `main` | GitHub membaca `CODEOWNERS` dari cabang tujuan, dan `main` masih memuat versi yang hanya berisi `@HanzzzBD`. Dinyalakan setelah `CODEOWNERS` dua-pemilik (`@HanzzzBD`, `@PM-Codexpert`) dipromosikan ke `main`; menyalakannya lebih awal mengunci setiap PR `@HanzzzBD` ke `main` |
| Pemilik pada `CODEOWNERS` untuk `shared/booking/` | Letaknya kini ditetapkan `SDD-SYS-10` (*shared kernel*, `apps/api/src/shared/booking/`); barisnya ditambahkan ke `CODEOWNERS` pada `PR-02-17` sesuai rencana, bukan lebih awal |
| Vendor observability | `SDD-OBS-09` menetapkan *backend* terkelola dan `SDD-OBS-10` menjadikan region Indonesia **kriteria gugur** yang diverifikasi sebelum kontrak; namanya ditetapkan pada seleksi `PR-00-06`, bukan lebih awal |
