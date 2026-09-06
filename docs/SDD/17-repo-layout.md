# SDD-17 — Tata Letak Repositori

**Area:** `REPO` · **Status:** Draft · **Basis:** [`system-overview.md`](../PRD/03-architecture/system-overview.md), [`deployment-ops.md`](../PRD/03-architecture/deployment-ops.md)

---

## 1. Konteks

| Kelompok | ID |
|---|---|
| Batas modul & lapisan | `SDD-SYS-02`, `SDD-SYS-03`, `SDD-SYS-04`, `NFR-M-02`, `NFR-M-07` |
| Artefak deploy | `SDD-SYS-08`, `SDD-INF-01`, `SDD-INF-02` |
| Skema bersama lintas klien | `SDD-FE-05`, `SDD-FE-08`, `SDD-MOB-01`, `SDD-API-11` |
| Distribusi mobile | `SDD-MOB-10`, `MOB-REL-01` … `MOB-REL-06` |
| CI/CD | `CD-01` … `CD-07`, `ST-01`, `ST-02` |
| Rahasia dalam repositori | `SEC-CFG-01`, `SEC-CFG-04` |

Tiga berkas SDD merancang tiga pohon `src/` yang terpisah: backend ([SDD-00 §4.1](00-system-architecture.md)), web ([SDD-11 §4.1](11-frontend-architecture.md)), dan mobile ([SDD-12 §4.1](12-mobile-architecture.md)). Masing-masing lengkap di dalam dirinya sendiri, dan tidak satu pun menyatakan **di mana ia duduk relatif terhadap dua lainnya**. [SDD-11 §5](11-frontend-architecture.md) menuliskan celah itu apa adanya: paket skema bersama disebut "dependensi lintas **repo/folder**" — dua kemungkinan yang berbeda secara mendasar, dibiarkan sebagai satu frasa.

Berkas ini menutup celah tersebut dan tidak lebih dari itu. **Isi masing-masing pohon tetap milik berkas perancangnya.** Yang ditetapkan di sini hanya letak ketiganya, apa yang mereka bagi, dan batas apa yang berlaku di antara mereka.

---

## 2. Keputusan Desain

| ID | Keputusan |
|---|---|
| **SDD-REPO-01** | **Ketiga pohon berada dalam satu repositori tunggal (monorepo).** Bukan tiga repositori terpisah, bukan pula pemisahan mobile dari backend+web. |
| **SDD-REPO-02** | Akar repositori **bukan milik pohon mana pun**. Tiap pohon menempati satu direktori `apps/`: `apps/api`, `apps/web`, `apps/mobile`. `src/` yang dirancang [SDD-00 §4.1](00-system-architecture.md) berakar di `apps/api/src`, [SDD-11 §4.1](11-frontend-architecture.md) di `apps/web/src`, [SDD-12 §4.1](12-mobile-architecture.md) di `apps/mobile/src`. |
| **SDD-REPO-03** | Perkakas workspace adalah **npm workspaces polos** — satu `package-lock.json` di akar, `node_modules` datar, tanpa Turborepo, pnpm, Nx, maupun Lerna. |
| **SDD-REPO-04** | `apps/api` adalah **satu** paket workspace. `sigm4-api` dan `sigm4-worker` (`SDD-SYS-08`, [SDD-00 §4.5](00-system-architecture.md)) **tidak** dipecah menjadi dua paket; keduanya tetap dua *entrypoint* dari satu basis kode dan satu image (`SDD-INF-01`). |
| **SDD-REPO-05** | Terdapat **tepat satu** paket bersama: `packages/schemas`, berisi skema Zod (`SDD-FE-05`, `SDD-API-11`) dan peta kode → label enum (`SDD-FE-08`, `SDD-MOB-01`). Penambahan paket bersama baru memerlukan pembaruan berkas ini. |
| **SDD-REPO-06** | `packages/*` dilarang mengimpor `apps/*` — apa pun. Ketergantungan mengalir satu arah: `apps/*` → `packages/*`. |
| **SDD-REPO-07** | Impor **lintas `apps/*` dilarang seluruhnya**. `apps/web` tidak mengimpor `apps/api`, dan seterusnya untuk setiap pasangan. Yang dibagi hanya lewat `packages/*`. |
| **SDD-REPO-08** | Aturan lint impor [SDD-00 §4.2](00-system-architecture.md) **ber-akar pada `apps/api`**, bukan pada repositori. Tiap pohon memiliki konfigurasi lint sendiri di atas satu basis bersama di akar. |
| **SDD-REPO-09** | Berkas infrastruktur [SDD-16 §4.1](16-infrastructure-deployment.md) dan [§4.8](16-infrastructure-deployment.md) — `Dockerfile` dan `docker-compose.yml` — berada di **akar repositori** dengan konteks build akar, dibatasi `.dockerignore`. |
| **SDD-REPO-10** | Paket internal **tidak diversi dan tidak dipublikasikan**; ia dikonsumsi lewat protokol workspace. Konsekuensi yang disengaja: perubahan skema dan seluruh konsumennya selalu berada dalam **satu** commit. |
| **SDD-REPO-11** | **Perkakas uji ditetapkan seragam bagi seluruh pohon.** Unit dan integration memakai **Vitest** di `apps/api`, `apps/web`, dan `packages/schemas`; cakupan `CD-02`/`NFR-M-03` diukur dengannya. E2E berjalan pada dua level terpisah sesuai [PRD 30.1](../PRD/06-quality/test-strategy.md): **Playwright** untuk E2E Web, **Maestro** untuk E2E Mobile di atas *dev build* Expo (`SDD-MOB-10`). Uji konkurensi `CC-01`…`CC-07` dan uji otorisasi tergenerate `SEC-T-01` adalah integration test — dijalankan Vitest terhadap PostgreSQL nyata, bukan *mock*. |

---

## 3. Alasan

**SDD-REPO-11 — satu runner untuk tiga pohon, dua runner untuk dua level E2E.** [PRD 30.1](../PRD/06-quality/test-strategy.md) sudah menetapkan piramida, ambang cakupan, dan pemisahan E2E Web (15 alur) dari E2E Mobile (9 alur); yang tidak pernah ditetapkan adalah dengan apa semuanya dijalankan. Selama itu kosong, gerbang `CD-02` tidak dapat ditulis sebagai perintah — sebuah ambang cakupan tanpa alat pengukur bukan gerbang.

**Vitest** dipilih untuk lapis unit dan integration karena `SDD-REPO-03` (npm workspaces polos, tanpa Turborepo/Nx) membuat keseragaman perkakas menjadi satu-satunya hal yang membuat `npm run test` di akar bermakna. Ia menjalankan TypeScript ESM tanpa lapisan transpilasi tambahan, sehingga tidak ada konfigurasi paralel yang harus dijaga tetap sinkron dengan `tsconfig` tiap pohon (`SDD-REPO-08`). Jest ditolak bukan karena kemampuannya melainkan karena biaya itu; `node:test` ditolak karena pelaporan cakupannya masih perlu dirakit sendiri, padahal justru laporan itulah yang menjadi gerbang.

**Playwright** dan **Maestro** memisahkan dua hal yang PRD 30.1 memang pisahkan. Playwright menjawab matriks peramban [PRD 30.6](../PRD/06-quality/test-strategy.md) dalam satu runner. Maestro menjalankan alur di atas *dev build* Expo (`SDD-MOB-10`) tanpa menyuntik kode ke dalam aplikasi, sehingga yang diuji adalah artefak yang dikirim ke store, bukan varian uji darinya — dan alurnya berupa YAML deklaratif, yang penting karena [PRD 30.8](../PRD/06-quality/test-strategy.md) menempatkan UAT pada pihak sekolah, bukan pada tim yang menulis kodenya. Detox ditolak karena menuntut konfigurasi native dan waktu build CI yang jauh lebih panjang untuk keuntungan stabilitas yang belum terbukti dibutuhkan pada sembilan alur.

Yang **tidak** ditetapkan di sini: cakupan, alur mana yang diuji, dan ambang lulus — seluruhnya milik [PRD 30](../PRD/06-quality/test-strategy.md). Berkas ini hanya menetapkan perkakasnya.

**SDD-REPO-01 — monorepo.** Yang memutuskan bukan preferensi soal jumlah repositori, melainkan satu kewajiban yang sudah tertulis di dua berkas: `SDD-FE-05` menuntut skema validasi **dibagi dengan backend** "sehingga aturan form dan aturan API tidak menyimpang", dan `SDD-MOB-01` memperluasnya ke mobile. [SDD-11 §5](11-frontend-architecture.md) menyatakan tuntutan sebenarnya dengan tepat: perubahan skema menyentuh frontend dan backend **dalam satu perubahan**.

Tiga repositori tidak dapat memenuhi kalimat itu. Perubahan skema di sana menjadi terbit-paket lalu tiga pull request di tiga repositori, dengan jendela di antaranya ketika satu klien memvalidasi menurut aturan lama sementara API sudah menolak menurut aturan baru. Itu persis kelas bug yang `SDD-FE-05` ada untuk menghapusnya — dipindahkan dari "ditulis dua kali" menjadi "diterbitkan pada waktu yang berbeda", yang lebih sulit dilihat.

**Monorepo backend+web dengan mobile terpisah** ditolak atas alasan yang sama, hanya berlaku sebagian: `SDD-MOB-01` menyatakan mobile berbagi skema **dan** peta enum dengan web, jadi memisahkannya memberi mobile jaminan yang lebih lemah daripada web tanpa alasan yang membenarkan perbedaan itu. Yang dibeli pemisahan itu — bebasnya EAS dari monorepo — nyata tetapi kecil, dan §5 menyatakan harganya secara terbuka.

Argumen tandingan yang jujur untuk repositori terpisah adalah kepemilikan: `MOB-REL-02` menetapkan akun store dan Expo/EAS milik **sekolah, bukan vendor**. Itu tidak terjawab oleh bentuk repositori — ia soal kepemilikan akun dan repositori itu sendiri, yang tetap berlaku sama entah repositorinya satu atau tiga.

**SDD-REPO-02 — akar bukan milik siapa pun.** Ini bukan estetika, melainkan syarat agar monorepo mungkin sama sekali. `SDD-SYS-04` memetakan 22 modul PRD ke `src/modules/`, dan `SDD-FE-01` mencerminkannya di web dengan sengaja. Akibatnya `src/modules/m09-loans/` adalah jalur yang **sah pada dua pohon sekaligus**. Membiarkan salah satunya menempati akar repositori membuat jalur itu ambigu di setiap alat yang membaca jalur: lint, tsconfig, pemetaan cakupan, penelusuran tumpukan, dan review. Tiap pohon karena itu wajib punya akarnya sendiri, dan akar repositori tinggal untuk hal yang memang lintas pohon.

**SDD-REPO-03 — npm workspaces polos.** Dua kandidat lain dipertimbangkan dan keduanya menuntut perubahan pada dokumen yang sudah stabil.

**pnpm** ditolak karena berbenturan langsung dengan [SDD-16 §4.1](16-infrastructure-deployment.md), yang sudah menuliskan Dockerfile-nya secara harfiah: `npm ci`, `npm prune --omit=dev`, lalu menyalin `node_modules` sebagai satu direktori. Ketiganya mengandaikan pohon dependensi datar; di atas *store* ber-symlink pnpm tidak satu pun bertahan tanpa `--node-linker=hoisted` atau `pnpm deploy`. Menukar kecepatan instalasi dengan menulis ulang tahap runtime image — beserta konsekuensinya pada `SDD-INF-02` — bukan pertukaran yang menguntungkan pada repositori berisi tiga pohon.

**Turborepo** ditolak karena nilainya belum ada. Cache build lintas paket dan graf task terbayar pada puluhan paket; di sini paketnya empat. Yang pasti ia bawa adalah lapisan orkestrasi di antara `npm run` dan perintah sebenarnya — dan `PR-00-01` sudah menuliskan `npm run lint` pada kolom Acceptance-nya. Menambah perkakas yang mengubah perintah itu sebelum ada yang mengeluh soal kecepatan adalah biaya tanpa keluhan yang membenarkannya. Bila suatu saat waktu CI benar-benar menjadi masalah, Turborepo dapat ditambahkan di atas npm workspaces tanpa memindahkan satu berkas pun.

Yang dibayar oleh pilihan ini: `node_modules` datar berarti *phantom dependency* mungkin — sebuah paket dapat mengimpor dependensi yang tidak dideklarasikannya. §6 mencatatnya beserta mitigasinya.

**SDD-REPO-04 — `apps/api` tidak dipecah.** Godaan monorepo adalah memecah `apps/api` menjadi `apps/api` dan `apps/worker` karena keduanya artefak deploy terpisah ([SDD-00 §4.5](00-system-architecture.md)). Itu tepat berlawanan dengan `SDD-INF-01`, yang menolak dua image justru untuk menghapus kemungkinan API versi X berjalan bersama worker versi Y. Keduanya bukan dua paket yang kebetulan mirip; keduanya adalah **satu** paket dengan dua `CMD`.

**SDD-REPO-05 — satu paket bersama, dan daftarnya tertutup.** Alasannya sama dengan `SDD-SYS-06` yang mengunci isi *shared kernel* pada daftar tetap: tanpa batas, `packages/` menjadi tempat penampungan, dan dalam beberapa bulan setiap pohon bergantung pada semuanya. Pembatasan pada skema dan peta enum juga bukan kebetulan — keduanya satu-satunya hal yang PRD dan SDD nyatakan **harus** identik di tiga tempat. Komponen UI justru contoh sebaliknya: `SDD-MOB-01` menyatakan secara eksplisit UI **tidak** dibagi, dan `SDD-FE-12` menempatkan komponen web sebagai kode yang disalin ke dalam repositori dan dirawat sendiri — milik `apps/web`, bukan calon paket bersama.

**SDD-REPO-06 / SDD-REPO-07 — arah ketergantungan.** `SDD-REPO-06` adalah `SDD-SYS-06` yang dinaikkan satu tingkat: sebagaimana *shared kernel* tidak boleh tahu tentang modul, paket bersama tidak boleh tahu tentang aplikasi — jika tidak ia berhenti menjadi hilir dan berubah menjadi simpul melingkar yang mengikat ketiga pohon menjadi satu.

`SDD-REPO-07` menjawab bahaya yang khas monorepo dan tidak ada pada repositori terpisah: begitu ketiga pohon dapat saling melihat di disk, `import { something } from '../../api/src/modules/…'` menjadi mungkin secara mekanis dan tampak tidak berbahaya di review. Sekali itu terjadi, `apps/web` bergantung pada internal backend, dan seluruh bangunan `SDD-SYS-02` dan `SDD-SYS-03` bocor melewati batas pohon. Monorepo membeli commit atomik; harganya adalah batas ini, dan harganya wajib ditegakkan mesin, bukan kebiasaan — alasan yang persis sama dengan `SDD-SYS-02`.

**SDD-REPO-08 — lint ber-akar per pohon.** [SDD-00 §4.2](00-system-architecture.md) menulis aturannya dalam jalur telanjang: `modules/*`, `shared/*`, `api/*`, `worker/*`. Web juga punya `shared/` dan `modules/`; mobile juga punya `shared/`. Satu konfigurasi global dengan pola-pola itu akan ikut mengenai pohon yang bukan sasarannya, dan `PR-00-02` — yang menuntut uji negatif bahwa impor terlarang benar-benar gagal CI — akan lulus atau gagal karena alasan yang salah. Aturan itu adalah aturan **backend**; cakupannya harus dinyatakan demikian.

**SDD-REPO-09 — infra di akar.** Bukan pilihan: `npm ci` menuntut `package-lock.json`, dan pada npm workspaces lockfile hanya ada satu, di akar. Konteks build karena itu wajib akar repositori, dan Dockerfile mengikuti konteksnya. Yang lahir dari situ adalah kewajiban `.dockerignore` — tanpanya `apps/web` dan `apps/mobile` ikut masuk ke dalam konteks build image backend.

---

## 4. Rancangan

### 4.1 Pohon repositori

Hanya tingkat yang dimiliki berkas ini yang diperlihatkan. Isi tiap `src/` adalah milik berkas yang tertera di sampingnya dan **tidak** diulang di sini.

```
sigm4/
├── package.json                 # npm workspaces: apps/*, packages/*   (SDD-REPO-03)
├── package-lock.json            # SATU lockfile, hanya di akar
├── tsconfig.base.json           # opsi kompilator bersama; tiap pohon meluaskannya
├── eslint.config.js             # basis lint bersama  (SDD-REPO-07, SDD-REPO-08)
├── .dockerignore                # mengecualikan apps/web, apps/mobile  (SDD-REPO-09)
├── Dockerfile                   # image sigm4-api + sigm4-worker  → SDD-16 §4.1
├── docker-compose.yml           # dependensi pengembangan          → SDD-16 §4.8
├── .github/workflows/           # pipeline CI/CD  GitHub Actions   → SDD-16 §4.3, SDD-INF-12
│
├── apps/
│   ├── api/                     # POHON BACKEND — isi src/ milik SDD-00 §4.1
│   │   ├── src/                 #   shared · modules · api · worker   (SDD-SYS-04, SDD-SYS-06/08)
│   │   ├── migrations/          #   berkas .sql, dijalankan dbmate    → SDD-05 §4.5, SDD-DB-12
│   │   └── eslint.config.js     #   aturan impor SDD-00 §4.2, ber-akar di sini  (SDD-REPO-08)
│   │
│   ├── web/                     # POHON WEB — isi src/ milik SDD-11 §4.1
│   │   ├── src/                 #   app · shared · modules · pages     (SDD-FE-01)
│   │   ├── vite.config.ts       #   build + Vitest, satu konfigurasi   (SDD-FE-14, SDD-REPO-11)
│   │   └── eslint.config.js
│   │
│   └── mobile/                  # POHON MOBILE — isi src/ milik SDD-12 §4.1
│       ├── src/                 #   app · shared · features            (SDD-12 §4.1)
│       ├── app.json · eas.json  #   Expo dev build + EAS Update        (SDD-MOB-10)
│       ├── metro.config.js      #   resolusi packages/*  (lihat §5)
│       └── eslint.config.js
│
└── packages/
    └── schemas/                 # SATU-SATUNYA paket bersama          (SDD-REPO-05)
                                 #   skema Zod        (SDD-FE-05, SDD-API-11)
                                 #   peta kode→label  (SDD-FE-08, SDD-MOB-01)
```

Dua hal yang sengaja **tidak** ada pada pohon ini: `apps/worker` (`SDD-REPO-04` — worker adalah *entrypoint*, bukan paket) dan paket komponen UI bersama (`SDD-MOB-01` dan `SDD-FE-12` — UI tidak dibagi).

### 4.2 Batas antar-pohon

| Dari | Boleh mengimpor | Dilarang |
|---|---|---|
| `apps/api/**` | `packages/schemas`, internal `apps/api` menurut [SDD-00 §4.2](00-system-architecture.md) | `apps/web/**`, `apps/mobile/**` |
| `apps/web/**` | `packages/schemas`, internal `apps/web` | `apps/api/**`, `apps/mobile/**` |
| `apps/mobile/**` | `packages/schemas`, internal `apps/mobile` | `apps/api/**`, `apps/web/**` |
| `packages/schemas/**` | pustaka pihak ketiga saja | `apps/**` (apa pun), `packages/*` lain |

Baris terakhir adalah yang paling penting, dan alasannya sama dengan baris terakhir [SDD-00 §4.2](00-system-architecture.md): paket bersama yang mengenal aplikasi berhenti menjadi hilir dan menjadi simpul melingkar.

Batas **di dalam** satu pohon tidak diatur di sini. Untuk `apps/api` berlaku [SDD-00 §4.2](00-system-architecture.md) tanpa perubahan selain akarnya; `apps/web` dan `apps/mobile` diatur berkasnya masing-masing.

### 4.3 Cara lint menegakkannya

Penegakan berlapis dua, karena satu lapis saja meninggalkan celah:

| Lapis | Menangkap | Mekanisme |
|---|---|---|
| **Lint** (`eslint.config.js` akar) | Impor lintas `apps/*` dan impor `apps/*` dari `packages/*` | `import/no-restricted-paths` dengan zona per direktori tingkat atas; berlaku atas seluruh repositori |
| **Kompilator** (`tsconfig`) | Jalur relatif yang menyelinap keluar akar pohonnya | Tiap pohon punya `rootDir` sendiri dan **tidak** merujuk proyek pohon lain; `../../` yang melewati batas gagal kompilasi, bukan sekadar gagal lint |

Lapis kedua ada karena aturan lint dapat dinonaktifkan satu baris dengan komentar, sedangkan referensi proyek yang tidak ada tidak dapat. Ini memperluas pola `SDD-SYS-02` — pelanggaran gagal di CI, bukan ditemukan saat review — ke batas antar-pohon.

Aturan impor [SDD-00 §4.2](00-system-architecture.md) hidup di `apps/api/eslint.config.js` dan pola-polanya diberi awalan akar pohonnya, sehingga `modules/*` di sana tidak pernah mengenai `apps/web/src/modules/*` (`SDD-REPO-08`).

Uji negatif yang sudah diwajibkan `PR-00-02` bagi batas modul berlaku dengan bentuk yang sama bagi batas antar-pohon: sebuah impor terlarang yang sengaja ditulis harus benar-benar menggagalkan CI. Aturan batas yang tidak pernah dibuktikan menolak apa pun adalah aturan yang tidak ada.

### 4.4 Perintah

| Perintah | Berlaku pada |
|---|---|
| `npm run lint` | Seluruh workspace — bentuk yang sudah tertulis pada Acceptance `PR-00-01`, tidak berubah |
| `npm run lint -w apps/api` | Satu pohon |
| `npm ci` | Akar; memasang seluruh workspace dari satu lockfile |
| `npm run test` | Seluruh workspace — Vitest (`SDD-REPO-11`); E2E Playwright/Maestro dijalankan perintah terpisah, bukan bagian baris ini |

`SDD-REPO-03` dipilih justru agar baris pertama tetap sah apa adanya.

---

## 5. Konsekuensi

- **Perubahan skema menjadi satu commit yang menyentuh empat direktori.** Itu keuntungan yang dibeli `SDD-REPO-01` sekaligus kewajiban yang lahir darinya: pull request yang mengubah `packages/schemas` tanpa menyesuaikan konsumennya akan merah di CI, dan itu memang perilaku yang diinginkan (`SDD-FE-05`).
- **CI berjalan atas ketiga pohon pada setiap perubahan.** Pipeline [SDD-16 §4.3](16-infrastructure-deployment.md) dirancang untuk backend; ia kini perlu menjalankan lint dan uji tiap pohon. Tanpa penyaringan berdasarkan jalur, perubahan satu baris di mobile ikut menjalankan uji konkurensi backend. Penyaringan itu adalah pekerjaan `PR-00-17`, bukan sesuatu yang datang gratis dari monorepo.
- **Konteks build image adalah akar repositori** (`SDD-REPO-09`). Karena itu `.dockerignore` menjadi berkas wajib, bukan kebersihan opsional: tanpanya `apps/web` dan `apps/mobile` masuk ke konteks build image backend, memperlambat build dan memperbesar permukaan yang dipindai `CD-01`. Isi `Dockerfile` tetap milik [SDD-16 §4.1](16-infrastructure-deployment.md); blok di sana ditulis untuk repositori berpohon tunggal dan perlu disesuaikan terhadap akar monorepo — pekerjaan tersendiri pada berkas tersebut, dicatat di sini agar tidak luput.
- **EAS membangun dari akar monorepo, bukan dari `apps/mobile`.** `SDD-MOB-10` menetapkan Expo dev build + EAS Update, dan resolver Metro tidak menelusuri ke luar akar proyek secara bawaan. `apps/mobile/metro.config.js` karena itu wajib menyatakan akar workspace sebagai *watch folder*. Ini friksi nyata yang dibeli `SDD-REPO-01` — dapat diselesaikan sekali di awal, tetapi bukan nol, dan setiap pemutakhiran lini Expo (`SDD-MOB-10`, [SDD-12 §5](12-mobile-architecture.md)) wajib memeriksanya ulang.
- **`node_modules` datar memungkinkan *phantom dependency*.** `apps/web` dapat mengimpor paket yang hanya dideklarasikan `apps/api` dan tetap berjalan di mesin pengembang — lalu gagal di tempat lain. Ini harga langsung `SDD-REPO-03`; mitigasinya di §6.
- **Satu lockfile berarti satu versi tiap dependensi bagi ketiga pohon.** Umumnya menguntungkan (React di web dan React Native di mobile tidak menyimpang tanpa disadari), tetapi berarti pemutakhiran yang dituntut satu pohon dapat memaksa dua lainnya ikut. Kasus paling mungkin adalah lini Expo (`SDD-MOB-10`) memaku versi React.
- **`SEC-CFG-04` kini memindai satu repositori berisi tiga pohon.** Cakupan pemindaian rahasia meluas ke konfigurasi web dan mobile — termasuk `eas.json`, yang menggoda untuk memuat kredensial. Larangan [SDD-16 §5](16-infrastructure-deployment.md) atas rahasia di dalam repositori berlaku penuh di sana.
- **Akses tulis menjadi satu bidang.** Satu repositori berarti satu daftar kontributor bagi ketiganya; pemisahan hak akses per pohon — bila suatu saat diperlukan — harus dicapai lewat *code owners*, bukan lewat batas repositori.

---

## 6. Risiko Teknis

| Risiko | Dampak | Mitigasi |
|---|---|---|
| Impor lintas pohon menyelinap lewat jalur relatif | `SDD-SYS-02`/`SDD-SYS-03` bocor melewati batas pohon; web bergantung pada internal backend | Penegakan berlapis dua §4.3 — lint **dan** `rootDir` terpisah; uji negatif seperti `PR-00-02` |
| *Phantom dependency* akibat `node_modules` datar | Build hijau lokal, merah di image atau di EAS | Pemeriksaan dependensi tak-terdeklarasi sebagai langkah CI; image dibangun dari konteks bersih pada setiap PR |
| `packages/` menjadi tempat penampungan | Ketiga pohon berangsur bergantung pada semuanya | Daftar paket bersama dikunci `SDD-REPO-05`; penambahan menuntut pembaruan berkas ini |
| CI melambat karena seluruh pohon diuji tiap perubahan | Umpan balik memburuk, gerbang mulai dilewati | Penyaringan berdasarkan jalur di `PR-00-17`; Turborepo tetap dapat ditambahkan tanpa memindahkan berkas (`SDD-REPO-03`) |
| Konteks build image membengkak | Build lambat; permukaan pindai `CD-01` melebar | `.dockerignore` wajib (`SDD-REPO-09`), diperiksa saat ukuran image dipantau |
| Pemutakhiran lini Expo memaksa versi bagi web dan backend | Pekerjaan tak terduga di dua pohon lain | Satu lockfile membuat benturan terlihat saat pemutakhiran, bukan saat rilis; pemutakhiran Expo sudah berstatus pekerjaan terjadwal ([SDD-12 §5](12-mobile-architecture.md)) |
| `apps/api` dipecah menjadi paket api dan worker | Melanggar `SDD-INF-01`; dua versi kode dapat berjalan bersamaan | `SDD-REPO-04` menyatakannya terlarang; review menolak paket workspace baru di bawah `apps/` |

---

## 7. Requirement Terkait

`NFR-M-02` `NFR-M-07` · `CD-01` … `CD-07` · `ST-01` `ST-02` · `SEC-CFG-01` `SEC-CFG-04` ·
`MOB-REL-01` … `MOB-REL-06` · `INF-04` `INF-05`

Keputusan SDD yang menjadi batasannya: `SDD-SYS-02` `SDD-SYS-03` `SDD-SYS-04` `SDD-SYS-06` `SDD-SYS-08` ·
`SDD-FE-01` `SDD-FE-05` `SDD-FE-08` `SDD-FE-12` · `SDD-MOB-01` `SDD-MOB-10` · `SDD-API-11` · `SDD-DB-12` ·
`SDD-INF-01` `SDD-INF-02`

---

## 8. TBD

Tidak ada. Seluruh keputusan pada berkas ini dapat diambil dari batasan yang sudah ditetapkan SDD-00, SDD-11, SDD-12, dan SDD-16.
