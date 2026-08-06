# Changelog — Implementation Documentation

Riwayat perubahan **dokumentasi implementasi**, bukan riwayat perubahan perangkat lunak. Riwayat perangkat lunak berada pada tag rilis `vMAJOR.MINOR.PATCH` (`CD-03`).

Perubahan pada [PRD](../PRD/) dan [SDD](../SDD/) tidak dicatat di sini — masing-masing memiliki riwayatnya sendiri.

---

## 2026-08-06 — Penutupan TBD kelompok C

Delapan TBD kelompok C ("pilihan teknis murni — dapat diputuskan arsitek") ditutup. **Tidak ada requirement, business rule, maupun kriteria penerimaan yang berubah**; seluruhnya pilihan bentuk kode dan perkakas. Keputusannya dicatat pada berkas SDD pemiliknya — proyek ini tidak memakai berkas ADR terpisah ([`templates/ADR-REFERENCE.md`](templates/ADR-REFERENCE.md)).

### Diubah

**TBD tertutup** — ID keputusan SDD yang menjadi pemiliknya:

| TBD | Pemilik |
|---|---|
| `TBD-AUTH-A` | Dikonfirmasi — `SDD-SESS-03/04/06` (tanpa butir baru; penyimpanan PostgreSQL sudah beralamat di sana) |
| `TBD-DB-A` | `SDD-DB-12` — runner SQL siap pakai atas berkas `.sql` bernomor |
| `TBD-API-A` | `SDD-API-11` — Zod |
| `TBD-API-B` | `SDD-API-12` — `/api/docs` tetap dilarang di produksi; `openapi.json` jadi artefak rilis |
| `TBD-FE-A` | `SDD-FE-11` (TanStack Query) · `SDD-FE-12` (primitif headless + token sendiri) |
| `TBD-MOB-A` | `SDD-MOB-10` — Expo SDK + EAS Update |
| `TBD-OBS-A` | `SDD-OBS-09` — OpenTelemetry + backend terkelola |
| `TBD-INF-B` | `SDD-INF-10` — Docker Compose |

**TBD dibuka** — satu, kelompok B:

- `TBD-SESS-B` — retensi & pembersihan baris `refresh_tokens`; lahir sebagai konsekuensi tercatat, bukan keputusan yang ditunda. Berkaitan dengan `TBD-EVT-A` dan `TBD-AVL-A`.

**Penjadwalan ulang**

- `ROADMAP.md` §8 — `TBD-SEC-B` maju dari "sebelum Phase 08" menjadi **sebelum `PR-00-06`**: `SDD-OBS-09` mengirim log aplikasi ke luar premis sejak logger terstruktur dipasang, sehingga lingkup kepatuhan harus diketahui saat perkakas dipilih
- `phases/phase-03.md` §10 — risiko baru: lantai OS lini Expo di atas `NFR-C-03`; bila terjadi, itu **perubahan requirement**, bukan keputusan SDD
- `phases/phase-02.md`, `logs/phase-00.md` — rujukan TBD yang sudah tertutup diganti ID SDD-nya
- Hitungan TBD diperbarui di `README.md`, `IMPLEMENTATION-STATUS.md`, dan `ROADMAP.md` §8

**Status TBD: 27 terbuka · 8 tertutup** — A (12) · B (14) · C (0) · D (1).

---

## 2026-08-06 — Penyusunan awal

Lapisan IMPLEMENTATION dibangun di atas PRD dan SDD yang sudah selesai. Tidak ada requirement, keputusan desain, maupun business rule yang ditambahkan, dipindahkan, atau diubah.

### Ditambahkan

**Perencanaan**

- `ROADMAP.md` — graf dependensi phase & modul, alasan urutan, pemetaan phase ⇄ milestone PRD, lintasan kritis, jadwal penutupan TBD
- `DELIVERY-PLAN.md` — urutan PR lintas phase, jalur kerja paralel, cakupan SDD, strategi migrasi, urutan pengujian & penempatan
- `BRANCHING-STRATEGY.md` — diturunkan dari `CD-03`; penamaan cabang, aturan penggabungan, alur review, DoD tingkat PR
- `RELEASE-PLAN.md` — bentuk rilis, pemetaan gerbang → phase, urutan rilis produksi, urutan cutover, strategi rollback

**Pelaksanaan**

- `phases/phase-00.md` … `phase-08.md` — sembilan phase, masing-masing 12 bagian baku, total **152 pull request** terencana
- `logs/phase-00.md` … `phase-08.md` — sembilan kerangka log, masing-masing memuat daftar butir yang wajib tercatat pada phase itu
- `IMPLEMENTATION-STATUS.md` — status per phase dan per PR
- `README.md`, `CHANGELOG.md`

**Template**

- `templates/PHASE-TEMPLATE.md` — bentuk baku 12 bagian; skala kompleksitas PR S/M/L
- `templates/PULL-REQUEST.md` — bentuk deskripsi PR; klasifikasi komentar peninjau
- `templates/ADR-REFERENCE.md` — penunjuk ke SDD; proyek ini **tidak** memakai berkas ADR terpisah
- `templates/RISK-LOG.md` — risiko pelaksanaan; risiko produk tetap di `RS-xx`, risiko teknis tetap di bagian 6 SDD
- `templates/DEPLOYMENT-CHECKLIST.md` — menegakkan `CD-01` … `CD-07` dan `SDD-16`
- `templates/ROLLBACK-CHECKLIST.md` — menegakkan `CD-05` dan `BR-DR-01` … `BR-DR-06`

### Keputusan struktural

Empat keputusan diambil bersama pemilik dokumen sebelum penyusunan:

| # | Pertanyaan | Yang dipilih |
|:-:|---|---|
| 1 | Siklus M-04 ↔ M-14 | M-04 dibangun lebih dulu; `assets.procurement_id` nullable tanpa FK aktif; M-14 mengisinya kemudian |
| 2 | Duplikasi rencana dengan PRD Bab 29 | **IMPLEMENTATION menurunkan, tidak mengulang** — milestone, DoD, gerbang, dan scope-cut tetap milik PRD; dokumen di sini merujuk lewat kode |
| 3 | Kepemilikan status | Dua tingkat tanpa tumpang tindih: `traceability.md` memiliki status **per requirement**; `IMPLEMENTATION-STATUS.md` memiliki status **per phase/PR** |
| 4 | Granularitas phase | **Phase = gelombang dependensi**, bukan salinan milestone. Sembilan phase |

### Diperbaiki selama penyusunan

- **Nama milestone pada judul phase 01–06 tidak sesuai PRD 29.2.** Judul awal memuat pengelompokan yang tidak ada di PRD. Seluruhnya diganti dengan kode milestone PRD yang sebenarnya, dan bagian §3.1 "Kontribusi terhadap milestone PRD" ditambahkan ke tiap phase untuk memetakan silang phase ⇄ milestone secara eksplisit.
- **Phase 05 mengklaim cakupan berlebih.** Tertulis seluruh 21 modul terimplementasi, padahal M-16 baru dibangun di Phase 06. Diperbaiki menjadi 20 dari 21.
- **`phase-00.md` menyatakan penggabungan ke `develop` men-deploy staging**, sementara `CD-03` menetapkan rantai `main ← staging ← develop ← feature`. Diselaraskan: lingkungan staging menerima dari cabang `staging`.

### Yang sengaja tidak dibuat

| Tidak dibuat | Alasan |
|---|---|
| Berkas ADR terpisah | Setiap berkas SDD sudah memuat Konteks / Keputusan / Alasan / Konsekuensi dengan ID `SDD-<area>-<nomor>`. Menambah ADR menciptakan sumber kedua bagi keputusan yang sama |
| Salinan milestone, DoD, gerbang rilis | Milik PRD Bab 29; dirujuk lewat kode |
| Status per requirement | Milik `traceability.md` |
| Berkas graf dependensi terpisah | Dilipat ke `ROADMAP.md` §1–2 agar tidak menambah berkas di luar struktur yang disetujui |
| Estimasi tanggal & durasi | PRD tidak menetapkan tanggal; menebaknya di sini akan menjadikan tebakan itu tampak seperti komitmen |

### Belum terselesaikan

- **34 TBD terbuka** di [`../SDD/TBD-REGISTER.md`](../SDD/TBD-REGISTER.md) — kelompok A (12, memblokir), B (13, ditunda sampai staging), C (8), D (1)
- Sepuluh di antaranya memblokir Phase 01–03; jadwal penutupannya di [`ROADMAP.md` §8](ROADMAP.md)

---

## Cara mencatat perubahan berikutnya

Satu bagian per tanggal, terbaru di atas. Kelompokkan menjadi **Ditambahkan · Diubah · Diperbaiki · Dihapus**.

Yang wajib dicatat:

- Penambahan atau penghapusan phase, atau perubahan urutannya
- Penambahan atau penghapusan PR terencana
- Perubahan pemetaan phase ⇄ milestone
- Perubahan strategi percabangan, rilis, migrasi, atau rollback
- Setiap perbaikan atas pertentangan dengan PRD atau SDD — **sertakan apa yang bertentangan dan bagaimana diselesaikan**

Yang tidak perlu dicatat: perbaikan ejaan, penataan ulang tabel, penambahan tautan.

**Perubahan yang menyentuh requirement, desain, atau business rule tidak dicatat di sini** — ia tidak boleh terjadi di folder ini sejak awal. Bila kebutuhan itu muncul, PRD atau SDD diperbarui lebih dulu, lalu dokumen di sini menyesuaikan diri.
