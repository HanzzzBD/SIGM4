# Status Implementasi

**Diperbarui:** 6 September 2026 — `PR-00-01` … `PR-00-03` tergabung ke `develop`. Proteksi cabang `main` dan `develop` aktif; `PR-00-04` siap dimulai.

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
| [00](phases/phase-00.md) | Foundation | — | 18 | `In Progress` | 3/18 | `PR-00-01` … `PR-00-03` tergabung; keputusan stack `PR-00-04` … `PR-00-18` seluruhnya terkunci |
| [01](phases/phase-01.md) | Master Data Independen | 4 | 14 | `Not Started` | 0/14 | |
| [02](phases/phase-02.md) | Inti Sistem | 5 | 30 | `Not Started` | 0/30 | Phase terbesar; di lintasan kritis |
| [03](phases/phase-03.md) | Layanan Aset & Reservasi | 6 | 23 | `Not Started` | 0/23 | Menutup `M1` |
| [04](phases/phase-04.md) | Siklus Hidup Aset | 3 | 14 | `Not Started` | 0/14 | Menutup `M2` |
| [05](phases/phase-05.md) | Penutupan Siklus | 2 | 14 | `Not Started` | 0/14 | Menutup `M3` & `M4` |
| [06](phases/phase-06.md) | Analitik | 1 | 10 | `Not Started` | 0/10 | Menutup `M5` |
| [07](phases/phase-07.md) | Integrasi & UAT | — | 14 | `Not Started` | 0/14 | |
| [08](phases/phase-08.md) | Pengerasan & Kesiapan Rilis | — | 15 | `Not Started` | 0/15 | Menutup `M6` |
| | **Total** | **22** | **163** | | **3/163** | |

## Ringkasan milestone PRD

Definisi dan kriteria keluar milestone ada di [PRD 29.2](../PRD/01-product/delivery-plan.md). Kolom **Status** di sini hanya mencerminkan kemajuan phase yang mengisinya.

| Milestone | Terisi di phase | Status | Ditutup pada |
|---|---|---|:---:|
| `M0 — Fondasi Teknis` | 00 | `In Progress` | Phase 00 |
| `M1 — Identitas & Data Induk` | 01, 02, 03 | `Not Started` | Phase 03 |
| `M2 — Mesin Persetujuan & Pemesanan` | 02, 03, 04 | `Not Started` | Phase 04 |
| `M3 — Siklus Operasional` | 03, 04, 05 | `Not Started` | Phase 05 |
| `M4 — Kontrol & Siklus Hidup Aset` | 03, 04, 05 | `Not Started` | Phase 05 |
| `M5 — Insight, Notifikasi & AI` | 01, 02, 03, 06 | `Not Started` | Phase 06 |
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

### Phase 00 — Foundation · `In Progress`

| ID | Status | PR | Catatan |
|---|---|:---:|---|
| `PR-00-01` | `Done` | [#6](https://github.com/HanzzzBD/SIGM4/pull/6) | Kerangka repo, TypeScript, lint, struktur folder |
| `PR-00-02` | `Done` | [#9](https://github.com/HanzzzBD/SIGM4/pull/9) | Aturan lint impor antar-modul |
| `PR-00-03` | `Done` | [#11](https://github.com/HanzzzBD/SIGM4/pull/11) | Dockerfile multi-stage + compose pengembangan |
| `PR-00-04` … `PR-00-18` | `Not Started` | — | Rincian: [`phases/phase-00.md` §7](phases/phase-00.md) |

### Phase 01 — Master Data Independen · `Not Started`

| ID | Status | PR | Catatan |
|---|---|:---:|---|
| `PR-01-01` … `PR-01-14` | `Not Started` | — | Rincian: [`phases/phase-01.md` §7](phases/phase-01.md) |

### Phase 02 — Inti Sistem · `Not Started`

| ID | Status | PR | Catatan |
|---|---|:---:|---|
| `PR-02-01` … `PR-02-30` | `Not Started` | — | Rincian: [`phases/phase-02.md` §7](phases/phase-02.md) |

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
| `PR-05-01` … `PR-05-14` | `Not Started` | — | Rincian: [`phases/phase-05.md` §7](phases/phase-05.md) |

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
| `PR-08-01` … `PR-08-15` | `Not Started` | — | Rincian: [`phases/phase-08.md` §7](phases/phase-08.md) |

**Cara memakai tabel ini.** Saat sebuah phase dimulai, ganti barisnya menjadi satu baris per PR. Selama phase belum dimulai, satu baris ringkas lebih jujur daripada 163 baris `Not Started` yang tidak ada yang membacanya.

---

## Penghalang aktif

| Yang terhalang | Menunggu | Sejak | Penanggung jawab |
|---|---|---|---|
| Phase 08 | `TBD-SEC-A` (penyedia pentest) · `TBD-OBS-B` (penerima alarm) | — | Pemilik produk / sekolah |

Daftar TBD lengkap beserta pertanyaannya: [`../SDD/TBD-REGISTER.md`](../SDD/TBD-REGISTER.md) — **13 terbuka, 42 tertutup**. Jadwal penutupan yang diharapkan: [`ROADMAP.md` §8](ROADMAP.md).

**Tidak ada penghalang TBD pada pengerjaan Phase 00–08, dan tidak ada lagi gerbang rilis yang tertahan oleh keputusan yang belum diambil.** Dua belas TBD ditutup 25 Agustus 2026 dalam empat batch. Migrasi penyedia LLM 2 September 2026 sempat membuka `TBD-AI-D` (kelompok A), dan surat pernyataan Kepala Sekolah menutupnya pada hari yang sama (`SDD-AI-16`) — `GL-07` bagian chatbot terbuka. Tiga belas TBD kelompok B masih terbuka tetapi tidak memblokir apa pun: seluruhnya parameter yang dikalibrasi Phase 07–08 setelah data staging tersedia. `GL-07` masih menunggu satu butir administratif — salinan resmi surat persetujuan lintas yurisdiksi, yang nomornya belum tercatat (`SDD-AI-16`); itu dokumen yang belum lengkap, bukan keputusan yang belum diambil.

## Pergeseran jadwal tercatat

| Tanggal | Phase | Pergeseran | Sebab | Dampak pada lintasan kritis |
|---|---|---|---|---|
| — | — | — | — | — |

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
