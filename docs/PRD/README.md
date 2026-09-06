# SIGM4 — Dokumentasi Engineering

**SIGM4 — Sistem Informasi Management 4set** · Sarana dan Prasarana Sekolah · PRD v1.1

Dokumentasi ini adalah **sumber kebenaran tunggal** untuk pembangunan sistem. Ditujukan agar dapat dipakai langsung oleh Product Manager, Software Architect, Backend/Frontend/Mobile Developer, QA, DevOps, maupun AI Coding Agent — **tanpa perlu membaca seluruh repositori dokumentasi**.

---

## Cara membaca dokumentasi ini

### 1. Alamat sebenarnya adalah **ID**, bukan path berkas

| Prefiks | Arti | Contoh |
|---|---|---|
| `FR-xx.y` | Functional Requirement | `FR-08.2` |
| `BR-xxx` | Business Rule | `BR-028a` |
| `NT-xx` | Notifikasi | `NT-19` |
| `NFR-x-xx` | Non-Functional Requirement | `NFR-S-07` |
| `RE-xx` | Aturan evaluasi approval engine | `RE-09` |
| `CI-xx` | Aturan integritas konkurensi | `CI-01` |
| `AV/ID/SEQ/JOB-xx` | Ketersediaan, idempotensi, penomoran, scheduler | `AV-03` |
| `DP-xx` | Perlindungan data pribadi | `DP-02` |
| `INF/CD/OBS/BR-DR-xx` | Infrastruktur & operasional | `OBS-05` |
| `SC-xx` · `G-xx` · `BO/PO-xx` | Kriteria sukses, goal, objective | `SC-05` |
| `AS-xx` · `RS-xx` · `FE-xx` | Asumsi, risiko, future enhancement | `RS-11` |
| `M-xx` | Modul | `M-09` |

Path berkas boleh dirapikan kapan saja; ID tidak pernah berubah. Untuk menemukan segala sesuatu yang terkait sebuah aturan, `grep` kodenya.

### 2. Satu modul = satu berkas = cukup untuk implementasi

Setiap berkas di [`02-modules/`](02-modules/) bersifat **self-contained** dengan 15 bagian tetap:

```
1. Overview          6. Business Rules     11. Activity Log
2. Scope             7. API Endpoints      12. Acceptance Criteria
3. Actors            8. Database Entity    13. Dependencies
4. Business Flow     9. Notification       14. Related Modules
5. Functional Req.  10. Permission         15. Open Issues
```

Developer cukup membuka satu berkas modul untuk mengimplementasikannya.

### 3. Satu baris = satu pemilik (Zero Duplication)

Setiap Business Rule, endpoint, notifikasi, entitas, permission, dan aksi activity log **dimiliki tepat satu modul**. Tidak ada salinan di tempat lain.

Berkas pusat berikut adalah **indeks yang digenerate** dari modul, bukan salinan manual — menyuntingnya sia-sia karena akan tertimpa:

| Indeks | Digenerate dari |
|---|---|
| [`_generated/business-rules-index.md`](_generated/business-rules-index.md) | bagian 6 tiap modul |
| [`_generated/api-index.md`](_generated/api-index.md) | bagian 7 tiap modul |
| [`_generated/notifications-index.md`](_generated/notifications-index.md) | bagian 9 tiap modul |
| [`_generated/activity-log-index.md`](_generated/activity-log-index.md) | bagian 11 tiap modul |

Bila sebuah aturan berlaku bagi beberapa modul, pemiliknya tetap satu; modul lain merujuknya lewat ID pada bagian **Related Modules**, dan kepemilikan bersama itu dicatat terbuka pada **Open Issues**.

### 4. Yang mengikat lintas modul

Tiga berkas ini berlaku meski tidak selalu disebut, dan menjadi fondasi SDD:

1. [`03-architecture/availability-concurrency.md`](03-architecture/availability-concurrency.md) — model ketersediaan berbasis waktu, pencegahan *double-booking*, idempotensi, penomoran, scheduler
2. [`03-architecture/approval-rule-dsl.md`](03-architecture/approval-rule-dsl.md) — skema DSL mesin persetujuan
3. [`00-foundation/roles-permissions.md`](00-foundation/roles-permissions.md) — katalog permission kanonik & aturan scope

---

## Peta dokumen

### 00 · Foundation
| Berkas | Isi |
|---|---|
| [decisions.md](00-foundation/decisions.md) | 16 keputusan stakeholder yang mengikat |
| [conventions.md](00-foundation/conventions.md) | Kalender & satuan waktu, master data tambahan, siklus akun siswa, template impor |
| [roles-permissions.md](00-foundation/roles-permissions.md) | Role, matriks permission, katalog permission kanonik |
| [glossary.md](00-foundation/glossary.md) | Glosarium, **batas domain Aset vs Bahan (Lampiran A.1)** |

### 01 · Product
| Berkas | Isi |
|---|---|
| [overview.md](01-product/overview.md) | Executive summary, latar belakang, objectives, stakeholders |
| [personas-journeys.md](01-product/personas-journeys.md) | 7 persona & user journey |
| [delivery-plan.md](01-product/delivery-plan.md) | Milestone M0–M6, gerbang rilis, scope-cut ladder, DoD, cutover |
| [assumptions-risks.md](01-product/assumptions-risks.md) | Asumsi & risiko |
| [future-enhancements.md](01-product/future-enhancements.md) | Di luar lingkup rilis ini |
| [bahan-scope-change.md](01-product/bahan-scope-change.md) | Catatan perubahan lingkup domain Bahan — keputusan, berkas terdampak, dan TBD tersisa |

### 02 · Modules
| Modul | Berkas | Modul | Berkas |
|---|---|---|---|
| M-01 Autentikasi | [m01-auth](02-modules/m01-auth.md) | M-12 Maintenance | [m12-maintenance](02-modules/m12-maintenance.md) |
| M-02 User & Role | [m02-users](02-modules/m02-users.md) | M-13 Audit & Opname | [m13-audit-stocktake](02-modules/m13-audit-stocktake.md) |
| M-03 Lokasi | [m03-locations](02-modules/m03-locations.md) | M-14 Pengadaan | [m14-procurement](02-modules/m14-procurement.md) |
| M-04 Inventaris Aset | [m04-assets](02-modules/m04-assets.md) | M-15 Dashboard | [m15-dashboard](02-modules/m15-dashboard.md) |
| M-05 QR Code | [m05-qr](02-modules/m05-qr.md) | M-16 Analitik | [m16-analytics](02-modules/m16-analytics.md) |
| M-06 Dokumen Aset | [m06-documents](02-modules/m06-documents.md) | M-17 Notifikasi | [m17-notifications](02-modules/m17-notifications.md) |
| M-07 Reservasi Ruangan | [m07-reservation-room](02-modules/m07-reservation-room.md) | M-18 Activity Log | [m18-activity-log](02-modules/m18-activity-log.md) |
| M-08 Reservasi Aset | [m08-reservation-item](02-modules/m08-reservation-item.md) | M-19 Chatbot AI | [m19-chatbot](02-modules/m19-chatbot.md) |
| M-09 Peminjaman | [m09-loans](02-modules/m09-loans.md) | M-20 Konfigurasi | [m20-settings](02-modules/m20-settings.md) |
| M-10 Approval Engine | [m10-approval](02-modules/m10-approval.md) | M-21 Penghapusan Aset | [m21-disposal](02-modules/m21-disposal.md) |
| M-11 Laporan Kerusakan | [m11-damage-reports](02-modules/m11-damage-reports.md) | M-22 Manajemen Bahan | [m22-materials](02-modules/m22-materials.md) |

### 03 · Architecture
| Berkas | Isi |
|---|---|
| [data-model.md](03-architecture/data-model.md) | Master data, transaksi, enum, retensi, ERD |
| [api-conventions.md](03-architecture/api-conventions.md) | Konvensi, format respons, kode galat, keamanan API |
| [availability-concurrency.md](03-architecture/availability-concurrency.md) | `booking_slots`, exclusion constraint, idempotensi, penomoran, scheduler |
| [approval-rule-dsl.md](03-architecture/approval-rule-dsl.md) | Skema DSL kondisi & langkah approval |
| [security.md](03-architecture/security.md) | NFR keamanan + pengujian keamanan & manajemen kerentanan |
| [privacy-compliance.md](03-architecture/privacy-compliance.md) | UU PDP, data anak, minimisasi data ke LLM |
| [deployment-ops.md](03-architecture/deployment-ops.md) | Topologi, sizing, CI/CD, backup & DR, observability |
| [nfr.md](03-architecture/nfr.md) | NFR performa, ketersediaan, keandalan, skalabilitas, aksesibilitas |
| [system-overview.md](03-architecture/system-overview.md) | Arsitektur tingkat tinggi, state diagram, scheduled jobs, use case |
| [activity-log.md](03-architecture/activity-log.md) | Prinsip pencatatan & struktur entri |
| [ai-features.md](03-architecture/ai-features.md) | Tool, prompt strategy, evaluasi, kuota, privasi AI |
| *-index.md | **Digenerate** — jangan disunting |

### 04 · Frontend · 05 · Mobile · 06 · Quality · 07 · SDD · 08 · UX · 09 · DESIGN
| Berkas | Isi |
|---|---|
| [04-frontend/ui-foundation.md](04-frontend/ui-foundation.md) | Design token, komponen inti, spesifikasi kalender |
| [04-frontend/dashboards.md](04-frontend/dashboards.md) | Rincian dashboard per role |
| [05-mobile/mobile-requirements.md](05-mobile/mobile-requirements.md) | Kebijakan luring, media, versi aplikasi, deep link, store |
| [06-quality/test-strategy.md](06-quality/test-strategy.md) | Piramida uji, alur kritis, uji konkurensi, UAT |
| [06-quality/traceability.md](06-quality/traceability.md) | **Papan skor implementasi** — status semua FR & BR |
| [07-sdd/README.md](../SDD/README.md) | Software Design Document — *bagaimana* sistem dibangun |
| [08-ux/UX-SPEC.md](../UX/UX-SPEC.md) | UX Specification — *bagaimana* requirement disajikan: halaman, navigasi, alur, keadaan |
| [09-design/DESIGN-SYSTEM.md](../DESIGN/DESIGN-SYSTEM.md) | Design System — *seperti apa* tampilannya: token, tipografi, komponen |

---

## Batas antara PRD dan SDD

| | Menjawab | Berisi |
|---|---|---|
| **Dokumentasi ini (eks-PRD)** | *Apa* yang dibangun | Requirement, aturan bisnis, kriteria penerimaan |
| **[07-sdd/](../SDD/)** | *Bagaimana* dibangun | Keputusan desain teknis, struktur kode, skema fisik, algoritma |

SDD **tidak menduplikasi** isi dokumentasi ini; ia merujuk lewat ID. Hal yang sama berlaku bagi [`UX/`](../UX/) dan [`DESIGN/`](../DESIGN/): UX menjabarkan penyajian requirement ini menjadi halaman dan alur, DESIGN menetapkan bahasa visualnya. Keduanya turunan — bila bertentangan dengan dokumentasi ini, **dokumentasi ini yang berlaku**.

---

## Perkakas

| Skrip | Fungsi |
|---|---|
| `scripts/build_docs.py` | Rakit 22 modul self-contained dari sumber — **skrip ini tidak ada di pohon kerja** |
| `scripts/build_central.py` | Rakit berkas pusat + regenerasi 4 indeks |
| `scripts/audit_docs.py` | Audit kehilangan requirement & rujukan silang rusak |
| `scripts/gen_trace.py` | Regenerasi papan skor traceability |
| `scripts/build_full.py` | Bangun ulang arsip `PRD.v1.1.full.md` + verifikasi sidik jari |

Arsip PRD utuh sebelum dipecah: `PRD.v1.1.full.md` (5.912 baris, SHA-256 `ef24c261…4d4d57`) — **saat ini tidak ada di pohon kerja**; bangun ulang dengan `scripts/build_full.py` atau pulihkan dari riwayat git. `audit_docs.py` memerlukannya untuk berjalan.
