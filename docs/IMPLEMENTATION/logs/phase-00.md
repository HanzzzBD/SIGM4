# Log Phase 00 — Foundation

| | |
|---|---|
| **Phase** | [`phases/phase-00.md`](../phases/phase-00.md) |
| **Milestone PRD** | `M0` |
| **Status** | Lihat [`IMPLEMENTATION-STATUS.md`](../IMPLEMENTATION-STATUS.md) |
| **Mulai** | 6 September 2026 |
| **Selesai** | — |

Log ini mencatat **apa yang benar-benar terjadi** selama phase berjalan: keputusan yang diambil, hal yang berbeda dari rencana, dan angka hasil pengukuran. Ia bukan salinan rencana — rencananya ada di [`phases/phase-00.md`](../phases/phase-00.md).

Log tidak boleh memuat requirement, keputusan desain, maupun business rule baru. Bila selama phase muncul kebutuhan akan salah satunya, ia dinaikkan ke PRD atau SDD lebih dulu, dan log ini hanya mencatat bahwa hal itu terjadi.

---

## 1. Catatan harian

| Tanggal | Yang terjadi | PR terkait |
|---|---|---|
| 6 September 2026 | `PR-00-01` tergabung ke `develop`: monorepo `apps/*` dan `packages/schemas`, TypeScript, lint, serta uji batas antar-pohon dan lapisan tersedia. | [#6](https://github.com/HanzzzBD/SIGM4/pull/6) |
| 6 September 2026 | `PR-00-02` tergabung ke `develop`: batas impor antar-modul ditambahkan; uji negatif `check_import_boundaries.mjs` lulus 10 dari 10 kasus. | [#9](https://github.com/HanzzzBD/SIGM4/pull/9) |

## 2. Keputusan yang diambil

Keputusan teknis yang tidak berasal dari PRD maupun SDD, dan alasannya. Bila sebuah keputusan ternyata menyentuh requirement atau desain, ia **wajib** dinaikkan ke PRD/SDD, bukan diselesaikan di sini.

| # | Keputusan | Alasan | Menaikkan ke PRD/SDD? |
|:---:|---|---|:---:|
| 1 | Cuplikan Dockerfile `SDD-16 §4.1` diadaptasi ke tata letak monorepo saat `PR-00-03`: seluruh manifest workspace disalin sebelum `npm ci`, tahap runtime ikut menyalin manifest dan `dist` tiap workspace yang dipakainya, dan hanya `apps/api` yang dibangun. | Cuplikan itu ditulis untuk satu paket, sebelum `SDD-17` menetapkan monorepo. `npm ci` menolak berjalan tanpa seluruh manifest yang disebut `package-lock.json`; `node_modules` datar menaruh `@sigm4/schemas` sebagai symlink, sehingga tanpa direktori tujuannya impor gagal saat proses dinyalakan. Ketiga perintah inti (`npm ci`, `npm run build`, `npm prune --omit=dev`) tetap dipakai apa adanya sesuai `SDD-REPO-03`. | Tidak — bentuknya sudah ditetapkan `SDD-REPO-03`/`SDD-REPO-09`. Yang tertinggal adalah cuplikan `SDD-16 §4.1`; penyelarasannya diusulkan sebagai suntingan SDD tersendiri, bukan bagian PR implementasi. |

## 3. Penyimpangan dari rencana

| Yang direncanakan | Yang dikerjakan | Sebab | Dampak pada phase berikutnya |
|---|---|---|---|
| `develop` direncanakan berdiri bersama `staging` pada `PR-00-18`. | `develop` dibuat manual dari `main` pada 6 September 2026 saat pemulihan cabang; jalur kerja sejak itu `feature/*` → PR → `develop`. `staging` tetap scope `PR-00-18`. | Cabang `main` lokal sempat menyimpang dari `origin/main`; pemulihan memerlukan cabang integrasi lebih dahulu. | Tidak mengubah scope Phase 00; `BRANCHING-STRATEGY.md` dan `GITHUB-CI-STATE.md` disegarkan agar keadaan aktual tidak disamarkan. |

## 4. PR di luar rencana

PR yang tidak ada pada daftar [`phase-00.md` §7](../phases/phase-00.md).

| ID | Judul | Mengapa tidak terencana |
|---|---|---|
| — | — | — |

Kolom ketiga adalah yang paling berharga di seluruh log ini. Pola yang berulang di sana menunjukkan di mana perencanaan phase berikutnya perlu diperbaiki.

## 5. Butir yang wajib tercatat pada phase ini

- [ ] Runner migration yang dipakai memenuhi kedua syarat `SDD-DB-12` — opt-out transaksi per-migration dan *advisory lock*
- [ ] Pembangkitan OpenAPI dari skema Zod berjalan (`SDD-API-11`, `SDD-API-02`) dan `/api/docs` tidak aktif di produksi (`SDD-API-12`)
- [ ] Perkakas observability terpasang sesuai `SDD-OBS-09`, dan penyedianya **ber-region Indonesia** (`SDD-OBS-10`, `SDD-SEC-10`) — region diverifikasi sebelum kontrak, bukan sesudahnya
- [ ] Koreografi deploy `SDD-INF-10` teruji di staging — penggantian instance API satu per satu dan drain worker
- [ ] Penyediaan mengikuti `SDD-INF-11` — VPS ber-region Indonesia + PostgreSQL terkelola; ketersediaan `btree_gist` diverifikasi sebelum langganan dibuka (§10 `phases/phase-00.md`)

## 6. TBD yang tertutup

| TBD | Keputusan | Diputuskan oleh | Tanggal |
|---|---|---|---|
| — | — | — | — |

Setiap TBD yang tertutup wajib juga diperbarui di [`../../SDD/TBD-REGISTER.md`](../../SDD/TBD-REGISTER.md). Menutupnya hanya di sini membuat register menjadi salah.

## 7. Masalah yang ditemukan

| Masalah | Dampak | Penyelesaian | Terbuka? |
|---|---|---|:---:|
| `npm run typecheck` di akar gagal: `TS5083`, `tsconfig.json` akar tidak ada. | Validasi typecheck akar belum dapat dijalankan; lint dan build per-workspace tetap hijau. | Belum ditangani; kegagalan sudah ada pada basis `PR-00-02` dan berada di luar scope-nya. | ya |

## 8. Hasil pengukuran

Angka nyata, bukan perkiraan. Kosongkan bila belum diukur — jangan diisi tebakan.

| Yang diukur | Target | Hasil | Rujukan |
|---|---|---|---|
| — | — | — | — |

## 9. Gerbang keluar

Diisi saat phase dinyatakan selesai. Daftar lengkapnya ada di [`phase-00.md` §9 dan §12](../phases/phase-00.md).

- [ ] Seluruh 18 PR tergabung
- [ ] Acceptance checklist phase terpenuhi
- [ ] Definition of Done phase terpenuhi
- [ ] Bagian 5 log ini terisi seluruhnya
- [ ] [`IMPLEMENTATION-STATUS.md`](../IMPLEMENTATION-STATUS.md) diperbarui

## 10. Yang diserahkan ke phase berikutnya

Hal yang sengaja ditinggalkan terbuka, beserta di mana ia akan ditutup.

| Yang ditinggalkan | Ditutup di | Alasan penundaan |
|---|---|---|
| — | — | — |

---

*Log ini mencatat pelaksanaan. Requirement tetap milik [PRD](../../PRD/), keputusan desain tetap milik [SDD](../../SDD/).*
