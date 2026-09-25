# Roadmap Implementasi — SIGM4

Dokumen ini memetakan **urutan pengerjaan**. Ia tidak menetapkan milestone, tidak menetapkan kriteria keluar, dan tidak menetapkan gerbang rilis — seluruhnya milik [PRD Bab 29](../PRD/01-product/delivery-plan.md) dan dirujuk dari sini lewat kodenya.

> Phase ≠ milestone. **Phase** adalah gelombang dependensi teknis: sekumpulan modul yang boleh dikerjakan bersamaan karena tidak saling menunggu. **Milestone** adalah pengelompokan bisnis PRD 29.2. Keduanya bersilangan — satu phase dapat menyumbang ke beberapa milestone, dan satu milestone dapat terisi lintas beberapa phase. Pemetaan lengkapnya ada di §4.

---

## 1. Graf dependensi phase

```
Phase 00  Foundation
    │
    ▼
Phase 01  Master Data Independen        M-02 · M-03 · M-18 · M-20
    │
    ▼
Phase 02  Inti Sistem                   M-01 · M-04 · M-10 · M-15 · M-17
    │
    ▼
Phase 03  Layanan Aset & Reservasi      M-05 · M-06 · M-07 · M-11 · M-14 · M-19
    │
    ▼
Phase 04  Siklus Hidup Aset             M-08 · M-12 · M-13
    │
    ▼
Phase 05  Penutupan Siklus              M-09 · M-21
    │
    ▼
Phase 06  Analitik                      M-16
    │
    ▼
Phase 07  Integrasi Lintas Modul & UAT  —
    │
    ▼
Phase 08  Pengerasan & Kesiapan Rilis   —
```

Rantainya linear **antar-phase** dan paralel **di dalam phase**. Modul dalam satu phase tidak saling bergantung; itulah yang membuat mereka satu phase.

## 2. Graf dependensi modul

Panah dibaca "membutuhkan". Hanya ketergantungan yang memaksa urutan yang digambar.

```
                        ┌─────────── M-20 Konfigurasi ───────────┐
                        │                                        │
   M-02 User & Role ────┼──▶ M-01 Auth ──▶ M-10 Approval ────────┤
        │               │         │              │               │
   M-03 Lokasi ─────────┘         │              │               │
        │                         ▼              │               │
        └──────────────────▶ M-04 Aset ◀─────────┘               │
                              │  │  │                            │
              ┌───────────────┘  │  └──────────────┐             │
              ▼                  ▼                 ▼             │
        M-05 QR            M-11 Kerusakan    M-07 Reservasi Ruang │
              │                  │                 │             │
              │                  ▼                 ▼             │
              │            M-12 Pemeliharaan  M-08 Reservasi Aset │
              │                  │                 │             │
              ▼                  │                 ▼             │
        M-13 Opname              │           M-09 Peminjaman      │
              │                  │                 │             │
              └──────────────────┴────────┬────────┘             │
                                          ▼                      │
                                    M-21 Penghapusan             │
                                                                 │
   M-14 Pengadaan ─(mengisi procurement_id)─▶ M-04               │
   M-06 Dokumen ──(dilampirkan oleh)──▶ M-11 · M-14 · M-21       │
   M-18 Activity Log ◀──(ditulisi oleh seluruh modul)────────────┘
   M-17 Notifikasi  ◀──(dipicu oleh seluruh modul)
   M-15 Dashboard   ──(membaca)──▶ M-04 · M-10 · M-09
   M-16 Analitik    ──(membaca)──▶ seluruh modul
   M-19 Chatbot     ──(membaca, read-only)──▶ seluruh modul
```

**Siklus yang diputus.** M-04 ↔ M-14 saling merujuk pada PRD: aset lahir dari pengadaan, pengadaan menghasilkan aset. Diputus dengan membangun M-04 lebih dulu (Phase 02) dengan `assets.procurement_id` **nullable dan tanpa FK aktif**, lalu M-14 (Phase 03) mulai mengisinya. Kolom itu tetap nullable selamanya — aset hibah dan aset impor manual sah tanpa pengadaan. Rinciannya di [`phases/phase-02.md`](phases/phase-02.md) `PR-02-10` dan [`phases/phase-03.md`](phases/phase-03.md) `PR-03-19`.

**Tidak ada siklus lain.** Verifikasi ada di §6.

## 3. Alasan urutan phase

| Phase | Mengapa tidak boleh lebih awal | Mengapa tidak boleh lebih akhir |
|---|---|---|
| 00 | — | Setiap PR berikutnya menulis ke kerangka yang belum ada |
| 01 | Butuh migration runner, `AuthContext`, activity log dari Phase 00 | M-01 tidak dapat memberi role bila katalog role belum ada |
| 02 | Approval butuh user & role; aset butuh lokasi | `booking_slots` menentukan bentuk skema — menyisipkannya setelah reservasi berjalan berarti migrasi data hidup |
| 03 | Seluruh isinya menggantung pada aset dan approval | M-14 harus mulai mengisi `procurement_id` sebelum data aset menumpuk |
| 04 | Reservasi aset memakai `SlotService` bentukan Phase 02 | Opname membutuhkan aset berlabel QR (M-05) yang lahir di Phase 03 |
| 05 | Peminjaman adalah kelanjutan reservasi aset; Bahan butuh lokasi, approval, QR, pengadaan, dan mesin opname yang seluruhnya sudah berdiri | Penghapusan menutup siklus; tidak ada yang menunggunya |
| 06 | Analitik atas data tidak lengkap harus dibongkar ulang | Ia daun terakhir; tidak memblokir apa pun kecuali UAT |
| 07 | Integrasi lintas modul mensyaratkan seluruh 22 modul hidup | Baseline `IMP-04` harus terukur **sebelum** sistem dipakai |
| 08 | Pengerasan atas sistem yang masih berubah adalah pemborosan | Keluarannya go-live |

## 4. Pemetaan phase ⇄ milestone PRD

Milestone, isi, dan kriteria keluarnya ditetapkan [PRD 29.2](../PRD/01-product/delivery-plan.md). Tabel berikut **hanya memetakan**, tidak mendefinisikan ulang.

| Milestone PRD | Modul (menurut PRD 29.2) | Terisi di phase | Ditutup pada |
|---|---|---|:---:|
| `M0 — Fondasi Teknis` | — (infrastruktur) | 00 | **Phase 00** |
| `M1 — Identitas & Data Induk` | M-01, M-02, M-03, M-04, M-05, M-20 | 01, 02, 03 | **Phase 03** |
| `M2 — Mesin Persetujuan & Pemesanan` | M-10, M-07, M-08, Bab 26 | 02, 03, 04 | **Phase 04** |
| `M3 — Siklus Operasional` | M-09, M-11, M-12, M-06 | 03, 04, 05 | **Phase 05** |
| `M4 — Kontrol & Siklus Hidup Aset` | M-13, M-14, M-21 | 03, 04, 05 | **Phase 05** |
| `M5 — Insight, Notifikasi & AI` | M-15, M-16, M-17, M-18, M-19 | 01, 02, 03, 06 | **Phase 06** |
| `M6 — Pengerasan & Kesiapan Rilis` | Uji beban, pentest, DR drill, dokumentasi, pelatihan | 07, 08 | **Phase 08** |

Dibaca dari arah sebaliknya:

| Phase | Menyumbang ke | Menutup |
|:---:|---|---|
| 00 | `M0` | `M0` |
| 01 | `M1` (M-02, M-03, M-20) · `M5` (M-18) | — |
| 02 | `M1` (M-01, M-04) · `M2` (M-10, Bab 26) · `M5` (M-15, M-17) | — |
| 03 | `M1` (M-05) · `M2` (M-07) · `M3` (M-06, M-11) · `M4` (M-14) · `M5` (M-19) | `M1` |
| 04 | `M2` (M-08) · `M3` (M-12) · `M4` (M-13) | `M2` |
| 05 | `M3` (M-09) · `M4` (M-21, M-22) | `M3`, `M4` |
| 06 | `M5` (M-16) | `M5` |
| 07 | `M6` — gerbang `GL-01`, `GL-02`, `GL-05`, `GL-09` | — |
| 08 | `M6` — gerbang sisanya | `M6` |

**Konsekuensi yang harus disadari:** sebuah milestone baru boleh dinyatakan tercapai pada phase yang menutupnya, bukan pada phase pertama yang menyentuhnya. Demo `DL-02` untuk `M1` jatuh setelah Phase 03, bukan setelah Phase 01.

## 5. Peta modul → phase

| Modul | Nama | Phase | Milestone PRD |
|---|---|:---:|:---:|
| M-01 | Autentikasi & Otorisasi | 02 | `M1` |
| M-02 | Manajemen User & Role | 01 | `M1` |
| M-03 | Manajemen Lokasi | 01 | `M1` |
| M-04 | Manajemen Aset | 02 | `M1` |
| M-05 | QR Code | 03 | `M1` |
| M-06 | Manajemen Dokumen | 03 | `M3` |
| M-07 | Reservasi Ruangan | 03 | `M2` |
| M-08 | Reservasi Aset | 04 | `M2` |
| M-09 | Peminjaman & Serah Terima | 05 | `M3` |
| M-10 | Approval & Disposisi | 02 | `M2` |
| M-11 | Pelaporan Kerusakan | 03 | `M3` |
| M-12 | Pemeliharaan & Work Order | 04 | `M3` |
| M-13 | Stock Opname | 04 | `M4` |
| M-14 | Pengadaan | 03 | `M4` |
| M-15 | Dashboard | 02 | `M5` |
| M-16 | Analitik & Laporan | 06 | `M5` |
| M-17 | Notifikasi | 02 | `M5` |
| M-18 | Activity Log | 01 | `M5` |
| M-19 | Chatbot AI | 03 | `M5` |
| M-20 | Konfigurasi Sistem | 01 | `M1` |
| M-21 | Penghapusan Aset | 05 | `M4` |
| M-22 | Manajemen Bahan | 05 | `M4` |

22 dari 22 modul PRD tercakup. Verifikasi otomatis: §6.

## 6. Validasi graf

| Pemeriksaan | Hasil |
|---|---|
| Seluruh 22 modul PRD punya phase | ✅ 22/22 — §5 |
| Seluruh 18 berkas SDD punya phase yang menerapkannya | ✅ — lihat [`DELIVERY-PLAN.md` §5](DELIVERY-PLAN.md) |
| Tidak ada phase yatim (tanpa hulu maupun hilir) | ✅ — rantai 00→08 tersambung penuh |
| Tidak ada dependensi melingkar antar-phase | ✅ — graf phase linear; satu-satunya siklus modul (M-04↔M-14) diputus di §2 |
| Tidak ada modul yang dijadwalkan sebelum dependensinya | ✅ — §3 |
| Setiap phase punya DoD dan rujukan PRD/SDD | ✅ — bagian 4, 5, dan 12 pada tiap berkas phase |

## 7. Lintasan kritis

Rantai terpanjang yang tidak dapat dipersingkat dengan menambah orang:

```
PR-00-04 (koneksi DB + AuthContext)
  → PR-00-05 (migration runner)
    → PR-01-04 (matriks permission)
      → PR-02-16 (booking_slots + exclusion constraint)
        → PR-02-17 (SlotService)
          → PR-03-08 (reservasi ruangan)
            → PR-04-01 (reservasi aset)
              → PR-05-01 (peminjaman)
                → PR-07-xx (uji ujung-ke-ujung)
                  → PR-08-10 (migrasi produksi)
```

Setiap keterlambatan di rantai ini menggeser go-live hari-per-hari. Rincian dan cadangan waktunya di [`DELIVERY-PLAN.md` §3](DELIVERY-PLAN.md).

## 8. Ketergantungan pada keputusan yang belum diambil

Beberapa phase tidak dapat diselesaikan sebelum TBD tertentu ditutup. Daftar lengkap TBD ada di [`../SDD/TBD-REGISTER.md`](../SDD/TBD-REGISTER.md); di sini hanya waktunya.

| TBD | Kelompok | Memblokir | Batas waktu penutupan |
|---|:---:|---|---|
| ~~`TBD-AUTH-C`~~ | A | ~~`PR-01-04`~~ | ✅ **Tertutup 25 Agustus 2026** — `SDD-AUTH-11` |
| ~~`TBD-EVT-B`~~ | A | ~~`PR-01-10`~~ | ✅ **Tertutup 25 Agustus 2026** — `SDD-EVT-10` · `UXD-13` |
| ~~`TBD-APR-A` `TBD-APR-C`~~ | A | ~~`PR-02-20`~~ | ✅ **Tertutup 25 Agustus 2026** — `SDD-APR-13` · `SDD-APR-14` · `RE-13` |
| ~~`TBD-APR-B`~~ | A | ~~`PR-02-22`~~ | ✅ **Tertutup 25 Agustus 2026** — `SDD-APR-15` |
| ~~`TBD-NTF-B`~~ | A | ~~`PR-02-25`~~ | ✅ **Tertutup 25 Agustus 2026** — `SDD-NTF-10` · `UXD-10` |
| ~~`TBD-AVL-B`~~ | A | ~~`PR-03-08` · `PR-04-01`~~ | ✅ **Tertutup 25 Agustus 2026** — tetap satu `/reservations` (`UXD-15`) |
| ~~`TBD-FS-A`~~ | A | ~~`PR-03-04` … `PR-03-07`~~ | ✅ **Tertutup 25 Agustus 2026** — `SDD-FS-11` · `DP-05a` |
| ~~`TBD-BHN-E`~~ | A | ~~`PR-03-21`~~ | ✅ **Tertutup 25 Agustus 2026** — dua tool bahan, dipasang `PR-05-25` |
| ~~`TBD-AI-A`~~ | D | ~~`PR-03-22`~~ | ✅ **Tertutup 25 Agustus 2026** — `SDD-AI-13` |
| ~~`TBD-SEC-B`~~ | A | ~~`PR-00-06` · `PR-08-01` … `PR-08-06`~~ | ✅ **Tertutup 25 Agustus 2026** — `SDD-SEC-10` · `SDD-OBS-10` |
| ~~`TBD-INF-A`~~ | B | ~~`PR-00-18`~~ | ✅ **Tertutup 25 Agustus 2026** — `SDD-INF-11` |
| ~~`TBD-AI-D`~~ | A | ~~`GL-07` (gerbang go-live)~~ | ✅ **Tertutup 2 September 2026** — `SDD-AI-16`, disetujui sekolah pada hari yang sama saat dibuka |
| kelompok B (13 sisanya) | B | kalibrasi parameter | Phase 07–08, setelah data staging ada |
| kelompok A (0) | A | — | Dikosongkan kembali 2 September 2026 |
| kelompok C (0) | C | — | Seluruhnya tertutup 6 Agustus 2026 |
| kelompok D (0) | D | — | Seluruhnya tertutup 25 Agustus 2026 |

**`TBD-SEC-B` ditutup sebelum `PR-00-06`, sesuai jadwal.** Ia dimajukan ke Phase 00 karena `SDD-OBS-09` memilih *backend* observability terkelola, sehingga log aplikasi berisi PII meninggalkan infrastruktur sekolah sejak logger terstruktur dipasang — lingkup kepatuhan harus diketahui **saat perkakas dipilih**, bukan sesudahnya. Hasilnya (`SDD-SEC-10`): cakupan kepatuhan tetap UU PDP saja, disertai kewajiban **residensi wilayah Indonesia** yang menjadi kriteria gugur pada seleksi `PR-00-06` (`SDD-OBS-10`). `SDD-OBS-04` (*redaction* di formatter) adalah kontrol yang menyertainya, bukan penggantinya.

**`TBD-INF-A` ditutup sebelum `PR-00-18`, sesuai jadwal.** `PR-00-18` men-deploy staging beserta job migration-nya, dan lingkungan itu tidak dapat berdiri sebelum penyedia infrastrukturnya dipilih. Hasilnya (`SDD-INF-11`): **VPS ber-region Indonesia + PostgreSQL terkelola**, Docker Compose tetap (`SDD-INF-10`), pengecualian Kubernetes `INF-05` tidak berlaku. Yang berpindah hanya waktunya, bukan kelompoknya: sizing dan biaya nyata tetap ditetapkan setelah uji beban bersama `TBD-AVL-C`.

**Tidak ada TBD yang memblokir pengerjaan satu PR pun.** Dua belas TBD ditutup 25 Agustus 2026 dalam empat batch, mengosongkan kelompok A dan D sekaligus; `TBD-AI-D` membukanya kembali pada 2 September 2026, tetapi ia menunggu di gerbang go-live (`GL-07`), bukan di depan sebuah PR — chatbot tetap dibangun dan dievaluasi Phase 03. Yang tersisa adalah 13 parameter operasional kelompok B, seluruhnya dijadwalkan Phase 07–08 setelah data staging tersedia — parameter yang menunggu **pengukuran**, bukan keputusan yang menunggu **orang**. Butir berisiko tertinggi pada roadmap ini karena itu tidak lagi berupa keputusan yang belum diambil, melainkan pengukuran yang belum dijalankan.

---

*Roadmap ini tidak memuat requirement, keputusan desain, maupun business rule baru. Milestone, kriteria keluar, gerbang rilis, dan scope-cut ladder tetap milik [PRD Bab 29](../PRD/01-product/delivery-plan.md).*
