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

## Snapshot audit 7 Oktober 2026

[Audit closure](audits/closure-phase-00-02-2026-10-07.md#1-basis-bukti-dan-batas-verifikasi) memverifikasi GitHub kembali: develop `7ae3ef3`, PR #128 merged, CI 37092178689 success dengan integrasi tanpa skip; publikasi/deploy staging skipped. Cabang hanya main/develop, 0 environment dan 0 deployment. Develop sudah mewajibkan `CI lulus`, satu approval dan Code Owners review; CODEOWNERS sudah dua pemilik. Main masih 0 approval, Code Owners false, required checks null. **Klaim lama satu-pemilik/review develop belum aktif di bagian historis berikut tidak berlaku lagi.** Approval #78 juga terverifikasi sebelum merge pada head yang sama, sehingga klaim lama tanpa review #78 ditutup (audit §1). Staging/proteksi main dan bukti operasi tetap gap; kontrak/test/adapter Phase 02–03 dinilai pada audit, bukan dari rekap September.

## Pembaruan PR-02-39 — 9 Oktober 2026

#137 digabung ke cabang parent `chore/PR-02-39-skema-ke-develop` 40 detik sesudah #136 masuk develop; kode PDF/P-20 diteruskan lewat [#138](https://github.com/HanzzzBD/SIGM4/pull/138) (`8efa83d`). CI push develop sesudah #133 ([37744947971](https://github.com/HanzzzBD/SIGM4/actions/runs/37744947971)) dan #136 ([37752821655](https://github.com/HanzzzBD/SIGM4/actions/runs/37752821655)) gagal di `Uji berkas`: `clock-lint.test.ts` timeout 5 detik; perbaikan `44c87e1` masuk bersama #138.

[CI push develop #138](https://github.com/HanzzzBD/SIGM4/actions/runs/37914396302): lint/typecheck, uji berkas, web, integrasi + cakupan, build image, CodeQL dan dependency-review/npm audit **lulus**; **Trivy gagal** — 2 HIGH (`CVE-2026-78667` net/http, `CVE-2026-97031` crypto/tls) pada Go stdlib v1.26.6 di binary `@dbmate/linux-x64` 2.35.1. Rilis upstream terbaru dbmate v2.36.0 dibangun go1.27.1, sedangkan versi perbaikan 1.26.9/1.27.2; belum ada versi dbmate yang menutupnya. Image tidak diterbitkan, deploy staging skipped. Penanganan (tunggu rilis upstream, bangun dbmate sendiri, atau pengecualian Trivy beralasan) menunggu keputusan pemilik produk/DevOps.

## Pembaruan PR-02-38 — 8 Oktober 2026

Stack publik: [#131 patch dependency](https://github.com/HanzzzBD/SIGM4/pull/131) → [#129 migration 0041](https://github.com/HanzzzBD/SIGM4/pull/129) → [#130 fitur impor](https://github.com/HanzzzBD/SIGM4/pull/130). Semua head terbaru mempunyai CI lengkap yang lulus: 8d0df4f ([run 37731663494](https://github.com/HanzzzBD/SIGM4/actions/runs/37731663494)), ac5a7de ([run 37731679159](https://github.com/HanzzzBD/SIGM4/actions/runs/37731679159)), a80d9eb ([run 37732031840](https://github.com/HanzzzBD/SIGM4/actions/runs/37732031840)). CI fitur memakai workflow_dispatch karena pull_request hanya difilter ke develop/staging/main. Integrasi fitur: 2.033 uji, 0 skip, statements 97,41%; lint/typecheck, unit/web, build, CodeQL, SCA dan Trivy lulus. Ketiganya belum merge; tinjauan migration dan QA staging tetap diperlukan. Snapshot audit sebelumnya tetap historis.

**Perubahan remote saat CI ditunggu:** #129 dan #130 digabung ke cabang pendahulu pada 05:37 UTC, bukan develop. #131 sekarang head f26d8bd (dependency + migration); [CI ulang](https://github.com/HanzzzBD/SIGM4/actions/runs/37733289339) sudah lulus seluruh gerbang, tree identik dengan ac5a7de yang juga lulus. Fitur diteruskan lewat [#132](https://github.com/HanzzzBD/SIGM4/pull/132), basis #131 dan head a80d9eb yang tetap mempunyai CI lengkap hijau. Stack aktif #131 → #132; bukti CI head lama di atas tetap historis.

## Pembaruan PR-02-39 — 8 Oktober 2026

#131 sudah masuk develop (`9e166b8`), tetapi #132 digabung ke cabang pendahulu sesudahnya. [#133](https://github.com/HanzzzBD/SIGM4/pull/133), head `95163df`, meneruskan kode impor ke develop; [CI lengkap](https://github.com/HanzzzBD/SIGM4/actions/runs/37740205272) lulus. Patch dependency tidak diterbitkan ulang.

PR-02-39 terbuka terpisah: [#134 migration 0042](https://github.com/HanzzzBD/SIGM4/pull/134), head `828a77b`, basis #133; [#135 P-20/PDF](https://github.com/HanzzzBD/SIGM4/pull/135), head `c171e07`, basis #134. CI pertama gagal pada asumsi seed rollback pengguna dan timeout pemindaian ESLint Clock. Perbaikan lulus lokal: 21 integrasi pengguna/skema/urutan ID tanpa skip dan lima tes Clock. [CI ulang migration](https://github.com/HanzzzBD/SIGM4/actions/runs/37744127094) dan [fitur](https://github.com/HanzzzBD/SIGM4/actions/runs/37744244606) lulus seluruh gerbang, termasuk build, CodeQL, audit dependency dan Trivy. Fitur: 150 berkas/2.062 uji API, seluruhnya passed; statements 97,44%, lines 98,73%. CI memakai workflow_dispatch karena base bertumpuk; fitur memasang Chromium untuk acceptance PDF. Remote kemudian diverifikasi: #133 masuk develop pada 07:40:59 UTC (7c8878b), #134 digabung ke cabang impor pada 07:41:48 UTC, #135 ke cabang migration pada 07:42:14 UTC. Kode PR-02-39 belum ikut ke develop. Produk memilih [#136 migration langsung ke develop](https://github.com/HanzzzBD/SIGM4/pull/136), 85bfae5, dan [#137 fitur draft](https://github.com/HanzzzBD/SIGM4/pull/137), 1f1b075, menunggu parent. Tree kedua head baru identik dengan 828a77b/c171e07 yang sudah lulus. [CI head migration baru](https://github.com/HanzzzBD/SIGM4/actions/runs/37750626415) dan [fitur baru](https://github.com/HanzzzBD/SIGM4/actions/runs/37750924339) berjalan. Sesuaikan ancestry/base fitur ke develop setelah #136 masuk develop sebelum menandai siap ditinjau. Tinjauan migration, merge dan QA staging tetap pending.

## 1. Mengapa ada dua keadaan

Seluruh 18 PR Phase 00 beserta tindak lanjutnya tergabung ke `develop` (#40 terakhir, 15 September 2026). Ketiga pohon `apps/*` beserta `packages/schemas` berdiri lengkap dengan lint dan TypeScript-nya; **Vitest terpasang sejak `PR-00-04`** dan **jalur migration berdiri sejak `PR-00-05`**, sehingga `npm run lint`, `build`, `test`, dan `test:integration` seluruhnya punya sasaran nyata dan hijau secara lokal. Sejak `PR-00-17` **pipeline yang menjalankannya berdiri** (`.github/workflows/ci.yml`, §3); sejak `PR-00-18` job migration, deploy staging, dan smoke test **ditulis** dan terbukti pada staging tiruan. Yang tersisa adalah infrastruktur staging nyata beserta cabang, environment, dan secret-nya (keputusan 50, 55), serta DAST (`PR-08-16`).

Karena itu sebagian aturan **belum dapat ditaati**, bukan karena diabaikan. Membedakan keduanya penting: aturan yang tidak dapat ditaati dan aturan yang dilanggar menuntut tindakan yang berbeda.

## 2. Percabangan

| Aturan | Sumber | Current State | Target State | Penutup selisih |
|---|---|---|---|---|
| `feature/*` → `develop` → `staging` → `main` | `CD-03` | `main` dan `develop` hidup sejak 6 September 2026; `staging` **belum ada** — artefak deploy-nya siap sejak `PR-00-18` | Empat cabang hidup sesuai `CD-03` | `staging` — dibuat pemilik repositori ([log §10](logs/phase-00.md)) |
| Tidak ada dorongan langsung ke `develop`/`staging`/`main` | `BRANCHING §3` | **Ditegakkan** sejak 6 September 2026 pada `main` dan `develop` (§4) | Ketiganya terlindungi; hanya lewat PR | `staging` — pemilik repositori, saat cabangnya dibuat (keputusan 55) |
| Penamaan `feature/` `fix/` `hotfix/` `chore/` | `BRANCHING §2` | Dipatuhi; **satu penyimpangan**: `docs/domain-aset-bahan-m22` | Seluruh cabang bernama sesuai daftar | Pekerjaan dokumentasi memakai `chore/` |
| Umur cabang ≤ 3 hari | `BRANCHING §1` | Tidak terukur | Terpantau saat phase berjalan | — |
| Squash ke `develop`; merge commit ke `staging`/`main` | `BRANCHING §3` | **Tidak ditaati seluruhnya** — sebagian besar PR ke `develop` di-*squash*, tetapi #34, #36, #37, #38, dan #40 tergabung dengan *merge commit* (`git log --first-parent`, 15 September 2026); tidak dapat ditegakkan setelan (§4). Sejak 15 September 2026 *squash* kembali wajib (keputusan 64) | Diatur pada branch protection | Branch protection §4 |

**Penyimpangan tercatat.**

- Cabang `docs/domain-aset-bahan-m22` memakai jenis di luar daftar `BRANCHING §2` dan digabungkan langsung ke `main`. Keduanya terjadi sebelum bagian *Current State* pada `BRANCHING-STRATEGY` ditulis. Cabang sudah tergabung dan tidak diganti nama; pekerjaan dokumentasi berikutnya memakai `chore/`.
- **`develop` dibuat manual pada 6 September 2026**, saat pemulihan cabang setelah `main` lokal sempat menyimpang dari `origin/main` — bukan oleh `PR-00-18` sebagaimana tabel di atas merencanakannya. Ia dibuat dari `main` pada SHA yang identik, lalu menerima isinya lewat PR seperti biasa. Artefak deploy `staging` dibangun `PR-00-18`; cabangnya dibuat pemilik repositori setelah infrastruktur staging siap (keputusan 55).
- **Lima PR tergabung ke `develop` dengan *merge commit*** — #34, #36, #37, #38, #40 — menyimpang dari *squash* `BRANCHING §3`. Pemilik produk menegakkan *squash* kembali tanpa menulis ulang riwayat (keputusan 64, [log §2](logs/phase-00.md)).

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
| uji otorisasi tergenerate | `SEC-T-01` | Belum ada — belum ada endpoint berpermission; lahir bersama middleware otorisasi `PR-01-15` (keputusan 63) dan diperiksa gerbang keluar `phase-01.md`/`phase-02.md` §9 | `PR-01-15` |
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
| `main`, `staging` | Require review from Code Owners | `BRANCHING §3.1` | ⏸ **ditunda** — `main`: lihat catatan di bawah; `staging` menunggu cabangnya dibuat (keputusan 55) |
| `develop` | Minimal 1 approval | `BRANCHING §3` | ✅ **aktif** — dinyalakan kembali 15 September 2026, terverifikasi API `required_approving_review_count: 1` |
| `develop` | Require status checks to pass — check **`CI lulus`** (GitHub Actions, `app_id` 15368) | `CD-01`, `CD-02`, `SDD-INF-12` | ✅ **aktif** 15 September 2026 — dipasang pemilik repositori setelah `CI lulus` hijau pada PR #38 (keputusan 49); terverifikasi API. PR #38 sendiri langsung berstatus `BLOCKED` · `REVIEW_REQUIRED` |
| `develop` | Require branches to be up to date before merging | Mencegah penggabungan di atas basis usang | ✅ **aktif** 15 September 2026 — `strict: true` |
| `main`, `staging` | Require status checks to pass + up to date | idem | ⏳ `main`: menyusul bersama *Code Owners review*-nya (terverifikasi API: belum ada check) · `staging`: saat cabangnya dibuat (keputusan 55) |
| `develop` | Allow squash merge **saja** | `BRANCHING §3` — satu PR satu commit | ❌ **tidak dapat diberkaskan maupun disetel** — lihat catatan di bawah |
| `staging`, `main` | Allow merge commit **saja** | `BRANCHING §3` — batas antar-phase tetap terbaca | ❌ idem |

**Tinjauan wajib menyala di `develop` sejak 15 September 2026.** Sampai hari itu `CODEOWNERS` hanya berisi `@HanzzzBD`, dan GitHub tidak mengizinkan seseorang menyetujui pull request-nya sendiri — menyalakan *required approvals* atau *Code Owners review* akan menghentikan setiap merge. Pemilik produk kemudian menetapkan `@PM-Codexpert` (PM, akses `write`) sebagai peninjau, dan namanya dicantumkan pada **setiap** baris `CODEOWNERS`, bukan hanya `*`: baris spesifik mengalahkan `*`, sehingga satu baris berpemilik tunggal tetap mengunci PR buatan pemilik itu. Setiap PR ke `develop` kini wajib disetujui satu code owner selain penulisnya.

**`main` sengaja belum.** GitHub membaca `CODEOWNERS` dari **cabang tujuan**, dan `main` masih memuat versi yang hanya berisi `@HanzzzBD` sampai isi `develop` dipromosikan. Menyalakan *Code Owners review* di `main` sekarang mengunci setiap PR `@HanzzzBD` ke `main`; setelan itu dinyalakan setelah `CODEOWNERS` dua-pemilik tiba di sana (§6).

**Metode merge per-cabang tidak dapat ditegakkan GitHub.** `allow_squash_merge`, `allow_merge_commit`, dan `allow_rebase_merge` adalah setelan **tingkat repositori**, bukan tingkat cabang — sehingga "squash saja untuk `develop`" dan "merge commit saja untuk `main`/`staging`" tidak dapat berdiri bersamaan sebagai setelan. Ketiganya kini aktif di repositori, dan `BRANCHING §3` pada titik ini berlaku sebagai **disiplin peninjau**, bukan sebagai pagar. Menonaktifkan salah satunya justru akan melanggar baris yang lain.

Per 6 September 2026 proteksi **dinyalakan** pada `main` dan `develop` lewat `gh api`, dan hasilnya diverifikasi kembali dari API. Per 15 September 2026 `develop` memperoleh dua setelan tinjauan, lalu — bersama `PR-00-17` — required status check `CI lulus` dan *branch up to date*; pembacaan API terakhir hari itu mengonfirmasi keempatnya aktif. Setelah #40 tergabung (15 September 2026) proteksi dibaca ulang dari API: keenam setelan `main` dan kesepuluh setelan `develop` aktif sesuai tabel; cabang, environment, dan secret `staging` belum ada (keputusan 55). `develop` kini **sepuluh** setelan aktif, `main` enam; *Code Owners review* dan status check `main` ditunda, dan dua setelan tidak dapat disetel sama sekali — rinciannya pada tabel di atas.

**Label PR disetel di GitHub, bukan di berkas.** Tiga belas label berlaku sejak 16 September 2026 — `phase-00` … `phase-08`, `feature`, `fix`, `chore`, dan `tinjauan-arsitek` ([`BRANCHING §4.2`](BRANCHING-STRATEGY.md)). Kesembilan label bawaan GitHub (`bug`, `documentation`, `duplicate`, `enhancement`, `good first issue`, `help wanted`, `invalid`, `question`, `wontfix`) dihapus setelah diverifikasi lewat API tidak dipakai satu pun issue maupun PR: repositori tidak memiliki issue, dan #1–#43 seluruhnya tanpa label. Tidak ada workflow yang membaca label.

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
| Vendor observability | `SDD-OBS-09` menetapkan *backend* terkelola dan `SDD-OBS-10` menjadikan region Indonesia **kriteria gugur** yang diverifikasi sebelum kontrak; seleksinya dijadwalkan pada `PR-00-06`, tetapi PR itu tergabung 7 September 2026 tanpa seleksi; seleksi kini dilakukan bersama penyediaan staging nyata, bagian gerbang keluar Phase 00 (keputusan 65, [log §2](logs/phase-00.md)) |
