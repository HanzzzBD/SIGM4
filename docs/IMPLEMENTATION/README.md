# Implementation Documentation — SIGM4

**Status:** rencana lengkap, pengerjaan belum dimulai. 9 phase · 163 pull request · 22 modul.

---

## Batas dokumen ini

Lima lapisan dokumentasi, lima pertanyaan berbeda:

| Lapisan | Menjawab | Sumber |
|---|---|---|
| [`../PRD/`](../PRD/) | **Apa** yang dibangun | **Source of Truth** |
| [`../SDD/`](../SDD/) | **Bagaimana** sistem dirancang | Turunan PRD |
| [`../UX/`](../UX/) | **Bagaimana** requirement disajikan | Turunan PRD & SDD |
| [`../DESIGN/`](../DESIGN/) | **Seperti apa** tampilannya | Turunan PRD, SDD & UX |
| `IMPLEMENTATION/` | **Bagaimana** proyeknya dikerjakan | Turunan PRD & SDD |

PR bermuatan antarmuka mengambil daftar layar dari [`UX/PAGE-SPECIFICATION.md`](../UX/PAGE-SPECIFICATION.md) dan spesifikasi visualnya dari [`DESIGN/COMPONENTS.md`](../DESIGN/COMPONENTS.md). Deliverable desain `DS-01`…`DS-06` dilacak di [`DESIGN-SYSTEM.md`](../DESIGN/DESIGN-SYSTEM.md).

**Urutan prioritas: PRD → SDD → IMPLEMENTATION.** IMPLEMENTATION tidak boleh bertentangan dengan keduanya. Bila ditemukan pertentangan, yang diperbaiki adalah IMPLEMENTATION — bukan PRD, bukan SDD.

| Boleh ada di sini | Tidak boleh ada di sini |
|---|---|
| Urutan pengerjaan & dependensi | Requirement baru |
| Rencana pull request | Keputusan desain baru |
| Milestone yang **dirujuk** dari PRD 29.2 | Business rule |
| Strategi percabangan & review | Acceptance criteria |
| Rencana rilis, migrasi, rollback | Salinan teks PRD atau SDD |
| Status pengerjaan per phase & per PR | Status per requirement |

Aturan yang paling sering tergoda dilanggar: **IMPLEMENTATION menurunkan, tidak mengulang.** Milestone, kriteria keluar, gerbang rilis, scope-cut ladder, dan Definition of Done seluruhnya milik [PRD Bab 29](../PRD/01-product/delivery-plan.md). Dokumen di sini merujuknya lewat kode (`M2`, `GL-04`, `IMP-01`), tidak menyalin teksnya. Bila PRD berubah, dokumen di sini tidak perlu ikut diubah.

---

## Isi

### Perencanaan

| Berkas | Isi |
|---|---|
| [`ROADMAP.md`](ROADMAP.md) | Graf dependensi phase & modul · alasan urutan · pemetaan phase ⇄ milestone PRD · lintasan kritis · jadwal penutupan TBD |
| [`DELIVERY-PLAN.md`](DELIVERY-PLAN.md) | Urutan PR lintas phase · lintasan kritis · jalur kerja paralel · cakupan SDD · strategi migrasi · urutan pengujian & penempatan |
| [`BRANCHING-STRATEGY.md`](BRANCHING-STRATEGY.md) | Peta cabang · penamaan · aturan penggabungan · alur review · DoD tingkat PR · alur hotfix |
| [`GITHUB-CI-STATE.md`](GITHUB-CI-STATE.md) | Keadaan GitHub & CI/CD: current vs target, penyimpangan tercatat, setelan branch protection |
| [`RELEASE-PLAN.md`](RELEASE-PLAN.md) | Bentuk rilis · status gerbang · urutan rilis produksi · urutan cutover · strategi rollback |

### Pelaksanaan

| Berkas | Isi |
|---|---|
| [`IMPLEMENTATION-STATUS.md`](IMPLEMENTATION-STATUS.md) | Status **per phase dan per PR**. Status per requirement ada di [`traceability.md`](../PRD/06-quality/traceability.md) |
| [`phases/`](phases/) | Sembilan berkas phase, masing-masing 12 bagian baku |
| [`logs/`](logs/) | Sembilan log — apa yang **benar-benar terjadi**, bukan apa yang direncanakan |
| [`templates/`](templates/) | Bentuk baku phase, PR, risiko, penempatan, rollback |
| [`CHANGELOG.md`](CHANGELOG.md) | Riwayat perubahan dokumentasi implementasi |

---

## Peta phase

| Phase | Nama | Modul | PR | Milestone PRD |
|:---:|---|:---:|:---:|---|
| [00](phases/phase-00.md) | Foundation | — | 18 | `M0` — **menutup** |
| [01](phases/phase-01.md) | Master Data Independen | M-02 · M-03 · M-18 · M-20 | 14 | `M1` · `M5` (sebagian) |
| [02](phases/phase-02.md) | Inti Sistem | M-01 · M-04 · M-10 · M-15 · M-17 | 30 | `M1` · `M2` · `M5` (sebagian) |
| [03](phases/phase-03.md) | Layanan Aset & Reservasi Ruangan | M-05 · M-06 · M-07 · M-11 · M-14 · M-19 | 23 | `M1` — **menutup** |
| [04](phases/phase-04.md) | Siklus Hidup Aset | M-08 · M-12 · M-13 | 14 | `M2` — **menutup** |
| [05](phases/phase-05.md) | Penutupan Siklus | M-09 · M-21 | 14 | `M3` & `M4` — **menutup** |
| [06](phases/phase-06.md) | Analitik | M-16 | 10 | `M5` — **menutup** |
| [07](phases/phase-07.md) | Integrasi Lintas Modul & UAT | — | 14 | `M6` (sebagian) |
| [08](phases/phase-08.md) | Pengerasan & Kesiapan Rilis | — | 15 | `M6` — **menutup** |

**Phase bukan milestone.** Phase adalah gelombang dependensi teknis — sekumpulan modul yang boleh dikerjakan bersamaan karena tidak saling menunggu. Milestone adalah pengelompokan bisnis PRD 29.2. Keduanya bersilangan; pemetaan lengkapnya di [`ROADMAP.md` §4](ROADMAP.md).

Akibat praktisnya: sebuah milestone dinyatakan tercapai pada phase yang **menutupnya**, bukan pada phase pertama yang menyentuhnya. `M1` selesai setelah Phase 03, bukan setelah Phase 01.

---

## Cara memakai dokumen ini

**Akan mulai mengerjakan sebuah modul** → buka berkas phase-nya. Bagian 7 memuat daftar PR beserta urutan, dependensi, dan acceptance-nya.

**Akan membuka sebuah PR** → [`templates/PULL-REQUEST.md`](templates/PULL-REQUEST.md). Bagian "Requirement yang dilayani" tidak boleh kosong.

**Menemukan pertentangan antara PRD dan SDD** → jangan diputuskan sendiri. PRD berlaku; naikkan ke pemilik produk.

**Muncul keputusan arsitektur baru saat implementasi** → [`templates/ADR-REFERENCE.md`](templates/ADR-REFERENCE.md). Proyek ini tidak memakai berkas ADR terpisah; keputusan masuk ke SDD.

**Akan menempatkan ke staging atau produksi** → [`templates/DEPLOYMENT-CHECKLIST.md`](templates/DEPLOYMENT-CHECKLIST.md).

**Ada yang bermasalah setelah penempatan** → [`templates/ROLLBACK-CHECKLIST.md`](templates/ROLLBACK-CHECKLIST.md). Ia dimulai dengan satu pertanyaan, bukan penjelasan.

**Ingin tahu sudah sampai mana** → [`IMPLEMENTATION-STATUS.md`](IMPLEMENTATION-STATUS.md) untuk phase & PR; [`traceability.md`](../PRD/06-quality/traceability.md) untuk requirement.

---

## Tiga hal yang paling mudah keliru

**1. ~~TBD kelompok A memblokir phase berkode.~~ Tidak lagi berlaku sejak 25 Agustus 2026.**
Kelompok A dan D dikosongkan 25 Agustus 2026; tidak ada phase yang terhalang keputusan yang belum diambil. Daftar dan jadwalnya di [`ROADMAP.md` §8](ROADMAP.md); pertanyaannya di [`../SDD/TBD-REGISTER.md`](../SDD/TBD-REGISTER.md). **13 terbuka, 28 tertutup** — seluruh sisanya kelompok B, parameter operasional yang dikalibrasi Phase 07–08 setelah data staging tersedia. Migrasi penyedia LLM 2 September 2026 sempat membuka `TBD-AI-D`, dan persetujuan sekolah menutupnya pada hari yang sama. Risiko yang dulu tertinggi pada rencana ini kini berupa pengukuran yang belum dijalankan, bukan keputusan yang belum diambil.

**2. Baseline `IMP-04` hanya dapat diukur sebelum sistem dipakai.**
Durasi opname manual, waktu persetujuan disposisi kertas, tingkat pengembalian tepat waktu versi manual. Setelah go-live, `SC-03`, `SC-06`, `SC-07`, dan `SC-08` tidak dapat dibuktikan **selamanya** — bukan tertunda, tidak dapat. Ia masuk gerbang keluar Phase 07 sebagai butir yang menghalangi.

**3. Seluruh migration `contract` ditunda ke `PR-08-11`, setelah backup terverifikasi.**
Sepanjang Phase 00–07, setiap kegagalan pulih dengan mengganti image — 15 menit, tanpa menyentuh data. Setelah contract, biayanya melonjak menjadi RTO 4 jam disertai kemungkinan kehilangan data. Urutan `PR-08-07` → `PR-08-11` → `PR-08-10` mengikat; melanggarnya menghapus satu-satunya jaring pengaman ketiganya.

---

## Bentuk baku berkas phase

```
1. Objective              7. Pull Request Plan
2. Scope                  8. Task Breakdown
3. Dependencies           9. Acceptance Checklist
4. Referensi PRD         10. Risks
5. Referensi SDD         11. Rollback Strategy
6. Deliverables          12. Definition of Done
```

Bagian 4 dan 5 tidak boleh kosong. Phase tanpa rujukan PRD maupun SDD berarti mengerjakan sesuatu yang tidak diminta.

Skala kompleksitas PR: **S** ≤ 200 baris berubah · **M** ≤ 400 · **L** > 400 dan wajib disertai alasan mengapa tidak dipecah.

---

*Seluruh berkas di folder ini ditutup dengan pernyataan yang sama: tidak memuat requirement, keputusan desain, maupun business rule baru. Setiap pernyataan merujuk [PRD](../PRD/) atau [SDD](../SDD/).*
