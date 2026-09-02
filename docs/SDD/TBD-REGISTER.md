# Register TBD — Keputusan yang Belum Ditetapkan

Berkas ini mengumpulkan seluruh titik dalam SDD yang **memerlukan keputusan** dan sengaja tidak diisi. Tidak ada angka, kebijakan, atau perilaku yang dikarang.

**Status: 13 terbuka · 28 tertutup** — terkumpul dari 18 berkas SDD dan dari [proposal perubahan lingkup domain Bahan](../PRD/01-product/bahan-scope-change.md).

---

## A. Kebijakan produk & lingkup — memblokir penyelesaian SDD

Perlu keputusan pemilik produk. Tidak dapat ditetapkan tim teknis.

_Seluruhnya tertutup — lihat [Tertutup](#tertutup)._

## B. Parameter operasional — sebaiknya ditunda sampai staging berdiri

Menebaknya sekarang tidak menambah nilai; ditetapkan setelah uji beban `NFR-P-09` dan sizing nyata.

| ID | Berkas | Pertanyaan |
|---|---|---|
| **TBD-AVL-A** | [SDD-01](01-availability-concurrency.md) · [SDD-05](05-database-design.md) | Kebijakan arsip/partisi `booking_slots`. Slot `Released` dipertahankan untuk analitik sehingga tabel tumbuh monoton. |
| **TBD-AVL-C** | [SDD-01](01-availability-concurrency.md) · [SDD-14](14-performance-design.md) · [SDD-16](16-infrastructure-deployment.md) | Ukuran connection pool per instance API dan worker. |
| **TBD-AVL-D** | [SDD-01](01-availability-concurrency.md) · [SDD-14](14-performance-design.md) | TTL cache ketersediaan. Rancangan memilih tanpa cache; nilai dalam batas `AV-04` diperlukan bila `AV-03` tidak tercapai. |
| **TBD-AUTH-B** | [SDD-03](03-authorization.md) · [SDD-04](04-authentication-session.md) | Masa tumpang tindih dua kunci Ed25519 saat rotasi 6 bulanan (`SEC-CFG-02`). |
| **TBD-SESS-A** | [SDD-04](04-authentication-session.md) | Masa berlaku *challenge token* 2FA. Rancangan memilih 5 menit; tidak ada angka di PRD. |
| **TBD-SESS-B** | [SDD-04](04-authentication-session.md) | Retensi dan pembersihan baris `refresh_tokens` yang kedaluwarsa atau dicabut. Tabel tumbuh monoton; indeks `expires_at` sudah ada, angkanya belum. Berkaitan dengan **TBD-EVT-A** dan **TBD-AVL-A**. |
| **TBD-EVT-A** | [SDD-07](07-event-flow.md) | Retensi baris `event_outbox` yang sudah diproses. Berkaitan dengan **TBD-AVL-A**. |
| **TBD-FS-B** | [SDD-09](09-file-storage-design.md) | Apakah berkas perlu dipindah ke penyimpanan dingin setelah entitasnya lama tidak aktif. Berkaitan dengan estimasi biaya. |
| **TBD-AI-B** | [SDD-10](10-ai-orchestrator-design.md) | Nilai `thinking_level` produksi untuk chatbot. Rancangan memilih `"minimal"` demi latensi; keputusan final menunggu hasil eval terhadap `SC-10`. |
| **TBD-AI-C** | [SDD-10](10-ai-orchestrator-design.md) · [SDD-15](15-observability-logging.md) | Ambang konsumsi kuota dan batas laju Gemini API yang memicu alarm (`OBS-05`). Sejak tier gratis (`SDD-AI-17`) objeknya bukan lagi biaya harian — tidak ada tagihan yang diambang-batasi. |
| **TBD-PERF-A** | [SDD-14](14-performance-design.md) | Ambang jumlah kueri per endpoint untuk uji N+1 (`SDD-PERF-02`). Dikalibrasi saat endpoint pertama dibangun. |
| **TBD-SEC-A** | [SDD-13](13-security-design.md) | Penyedia penetration test independen dan anggarannya — dependensi jadwal pada `GL-04`. |
| **TBD-OBS-B** | [SDD-15](15-observability-logging.md) | Penerima alarm (*on-call*) dan jalur eskalasi. `OBS-07` mewajibkannya sebelum go-live; keputusan organisasi sekolah. |

**`TBD-INF-A` sudah tertutup 25 Agustus 2026** — ia adalah pengecualian di kelompok ini karena staging yang menjadi prasyarat kelompok B justru tidak dapat berdiri sebelum penyedianya dipilih. `SDD-INF-11` menetapkan penyedianya; yang tetap menunggu uji beban adalah sizing dan biayanya, dan itu berjalan bersama `TBD-AVL-C`.

## C. Pilihan teknis murni — dapat diputuskan arsitek

Tidak mengubah requirement; hanya bentuk kode dan perkakas.

_Seluruhnya tertutup — lihat [Tertutup](#tertutup)._

## D. Konten yang belum final

| ID | Berkas | Pertanyaan |
|---|---|---|

---

## Cara membaca register ini

| Kelompok | Jumlah | Kapan diputuskan |
|---|---|---|
| A — Kebijakan produk | 0 | Dikosongkan kembali 2 September 2026 — `TBD-AI-D` tertutup hari yang sama saat ia dibuka |
| B — Parameter operasional | 13 | Setelah staging berdiri & uji beban dijalankan |
| C — Pilihan teknis | 0 | Seluruhnya tertutup 6 Agustus 2026 |
| D — Konten | 0 | Seluruhnya tertutup 25 Agustus 2026 |

Kelompok B sengaja ditunda: menetapkan ukuran pool koneksi atau TTL cache tanpa data pengukuran hanya memindahkan tebakan ke dokumen. **Kelompok A, C, dan D seluruhnya tertutup.** `TBD-AI-D` dibuka dan ditutup pada hari yang sama, 2 September 2026: migrasi penyedia LLM membukanya, surat pernyataan Kepala Sekolah menutupnya. Tidak ada lagi keputusan yang belum diambil — yang tersisa seluruhnya angka yang menunggu pengukuran.

---

## Tertutup

| ID | Berkas | Pertanyaan | Keputusan | Tanggal |
|---|---|---|---|---|
| **TBD-BHN-A** | [M-14](../PRD/02-modules/m14-procurement.md) · [M-22 (proposal)](../PRD/01-product/bahan-scope-change.md) | `BR-064` mewajibkan setiap penerimaan pengadaan menjadi record aset per unit, sementara Bahan juga diadakan lewat M-14. | Keputusan #27 — `procurement_items` memperoleh kolom `jenis`; `BR-064` dipersempit ke item Aset, item Bahan menambah saldo | 23 Agustus 2026 |
| **TBD-BHN-B** | [M-20](../PRD/02-modules/m20-settings.md) | Satuan bahan: master data tertutup atau teks bebas? | Daftar tertutup dikelola Administrator lewat `FR-20.1`; entitas `material_units`, ditegakkan `BR-084` | 23 Agustus 2026 |
| **TBD-BHN-C** | [M-22](../PRD/02-modules/m22-materials.md) | Kategori bahan memakai ulang kategori aset atau berdiri sendiri? | Master `material_categories` tersendiri, terpisah penuh dari kategori aset | 23 Agustus 2026 |
| **TBD-BHN-D** | [M-13](../PRD/02-modules/m13-audit-stocktake.md) | Hasil opname bahan perlu persetujuan Pimpinan? | Ya — `BR-094`, sejajar `BR-057` pada sesi aset | 23 Agustus 2026 |
| **TBD-AUTH-A** | [SDD-04](04-authentication-session.md) | Media penyimpanan daftar refresh token. **SDD-04 merancangnya di PostgreSQL** (pencabutan tidak boleh hilang saat Redis restart) — perlu konfirmasi atau evaluasi ulang. | Dikonfirmasi — `SDD-SESS-03/04/06` | 6 Agustus 2026 |
| **TBD-DB-A** | [SDD-05](05-database-design.md) | Alat migration (SQL polos + runner vs perkakas seperti node-pg-migrate). | `SDD-DB-12` | 6 Agustus 2026 |
| **TBD-API-A** | [SDD-06](06-api-design.md) | Pustaka validasi (Zod, Valibot, TypeBox). Ketiganya memenuhi `SDD-API-01`. | `SDD-API-11` | 6 Agustus 2026 |
| **TBD-API-B** | [SDD-06](06-api-design.md) | Apakah `/api/docs` boleh aktif di produksi dengan proteksi autentikasi, atau tetap dilarang sesuai Bab 17.1. | `SDD-API-12` | 6 Agustus 2026 |
| **TBD-FE-A** | [SDD-11](11-frontend-architecture.md) | Pustaka server-state dan pustaka komponen dasar. | `SDD-FE-11` · `SDD-FE-12` | 6 Agustus 2026 |
| **TBD-MOB-A** | [SDD-12](12-mobile-architecture.md) | Versi React Native dan strategi pembaruan OTA. Berdampak pada kecepatan pengiriman perbaikan tanpa peninjauan store. | `SDD-MOB-10` | 6 Agustus 2026 |
| **TBD-OBS-A** | [SDD-15](15-observability-logging.md) | Perkakas observability (mandiri vs terkelola). Berdampak pada biaya dan beban pemeliharaan sekolah. | `SDD-OBS-09` | 6 Agustus 2026 |
| **TBD-INF-B** | [SDD-16](16-infrastructure-deployment.md) | Orkestrasi: Docker Compose (sesuai `INF-05`) atau Kubernetes bila sekolah sudah memilikinya. | `SDD-INF-10` | 6 Agustus 2026 |
| **TBD-NTF-A** | [SDD-08](08-notification-design.md) | Pengelompokan `jenis` untuk preferensi notifikasi (`FR-17.3`) belum ada di PRD. Perlu daftar kelompok yang dilihat pengguna + pemetaan tiap `NT-xx`. | **UXD-05** — keputusan pemilik produk | 22 Agustus 2026 |
| **TBD-MOB-B** | [SDD-12](12-mobile-architecture.md) | Apakah aplikasi mobile perlu dukungan tablet khusus. `NFR-C-04` hanya menyebut potret dan lanskap terbatas. | **UXD-11** — keputusan pemilik produk | 22 Agustus 2026 |
| **TBD-FE-B** | [SDD-11](11-frontend-architecture.md) | Apakah web perlu mode gelap. Tidak disebut PRD; berdampak pada jumlah token warna dan uji kontras. | **UXD-12** — keputusan pemilik produk | 22 Agustus 2026 |
| **TBD-SEC-B** | [SDD-13](13-security-design.md) · [SDD-15](15-observability-logging.md) | Apakah sekolah memerlukan kepatuhan formal di luar UU PDP (mis. standar dinas pendidikan setempat). | `SDD-SEC-10` · `SDD-OBS-10` — UU PDP saja, **tanpa** standar tambahan; disertai kewajiban residensi data wilayah Indonesia (Keputusan #29) | 25 Agustus 2026 |
| **TBD-INF-A** | [SDD-16](16-infrastructure-deployment.md) | Penyedia infrastruktur. Menentukan sizing dan biaya nyata, serta PostgreSQL terkelola vs dikelola sendiri. | `SDD-INF-11` — VPS ber-region Indonesia + PostgreSQL terkelola; Kubernetes tidak dipakai. Sizing & biaya tetap menunggu uji beban bersama `TBD-AVL-C` | 25 Agustus 2026 |
| **TBD-AUTH-C** | [SDD-03](03-authorization.md) | Konfirmasi bahwa penambahan mekanisme teknis murni seperti `role_version` boleh diputuskan di tingkat SDD tanpa dianggap perubahan requirement. | `SDD-AUTH-11` — boleh, bila lolos **uji tiga syarat**; gagal satu syarat berarti wajib naik ke PRD | 25 Agustus 2026 |
| **TBD-EVT-B** | [SDD-07](07-event-flow.md) · [SDD-15](15-observability-logging.md) | Apakah dead letter memerlukan antarmuka pemrosesan ulang di menu Administrator, atau cukup lewat akses operasional. Berdampak pada lingkup M-20. | `SDD-EVT-10` · **UXD-13** — terlihat sebagai kartu baca-saja 19.2; pemrosesan ulang tetap operasional. Tanpa halaman, permission, atau endpoint tulis baru | 25 Agustus 2026 |
| **TBD-APR-A** | [SDD-02](02-approval-engine.md) | `fallback_approver` disebut `RE-11` tetapi tidak ada pada skema Lampiran D.5. Field tingkat aturan, atau selalu jatuh ke Administrator tanpa konfigurasi? | `SDD-APR-13` · **UXD-09** — field **opsional** tingkat aturan; kosong berarti Administrator. `RE-11` disunting agar berhenti menyebut "wajib" | 25 Agustus 2026 |
| **TBD-APR-B** | [SDD-02](02-approval-engine.md) | Jam kerja untuk perhitungan SLA: jam operasional sekolah (06.00–18.00) atau jam administratif yang lebih sempit? | `SDD-APR-15` — `CAL-01` ditegaskan apa adanya: jam operasional terkonfigurasi. Tidak ada kalender kedua; pengencangan tenggat lewat `sla_hours` per aturan | 25 Agustus 2026 |
| **TBD-APR-C** | [SDD-02](02-approval-engine.md) | Perilaku bila approver `approver_type='user'` dinonaktifkan setelah instance berjalan. | `SDD-APR-14` · `RE-13` — langkah dilewati beralasan `approver nonaktif`, lalu jalur fallback `RE-11` yang sama. Penonaktifan tidak pernah tertahan instance berjalan | 25 Agustus 2026 |
| **TBD-NTF-B** | [SDD-08](08-notification-design.md) | Apakah notifikasi terarsip (>90 hari) tetap dapat diakses pengguna lewat filter arsip, atau hanya administratif. | `SDD-NTF-10` · **UXD-10** — dapat dibaca pemiliknya lewat filter arsip P-13; tabel arsip memperoleh indeks `(user_id, dibuat_pada DESC)` | 25 Agustus 2026 |
| **TBD-AVL-B** | [SDD-01](01-availability-concurrency.md) | Endpoint reservasi: tetap satu `/reservations` atau dipecah per jenis. | `SDD-01 §8` · **UXD-15** — tetap satu rumpun `/reservations`; `BR-017`…`BR-025` berlaku identik bagi kedua jenis | 25 Agustus 2026 |
| **TBD-FS-A** | [SDD-09](09-file-storage-design.md) · [SDD-13](13-security-design.md) | Perlakuan foto berwajah saat permintaan penghapusan data (`DP-04`). | `SDD-FS-11` · `DP-05a` · **UXD-14** — dipertahankan sebagai bukti; **wajib** dinyatakan pada Pemberitahuan Privasi | 25 Agustus 2026 |
| **TBD-BHN-E** | [ai-features](../PRD/03-architecture/ai-features.md) | Apakah chatbot perlu tool berdomain Bahan? | 22.3 — dua tool (`get_material_stock`, `get_low_stock_materials`) ditambahkan; diimplementasikan `PR-05-25` di Phase 05 | 25 Agustus 2026 |
| **TBD-AI-D** | [SDD-10](10-ai-orchestrator-design.md) | Persetujuan tertulis sekolah atas pemrosesan data percakapan chatbot **lintas yurisdiksi** (`RS-21`). | `SDD-AI-16` — **disetujui**, atas surat pernyataan Kepala Sekolah (nomor surat **TBD**, menunggu salinan resmi). Ditutup pada hari yang sama saat dibuka. Pemakaian tier gratis diputuskan terpisah (`SDD-AI-17`, `DP-AI-04` disunting) | 2 September 2026 |
| **TBD-AI-A** | [SDD-10](10-ai-orchestrator-design.md) | Panjang dan isi final prefiks statis system prompt (ambang caching penyedia). | `SDD-AI-13` — diperkaya dengan isi berguna; uji memverifikasi panjang **dan** cache benar-benar kena. Angka disesuaikan ke ambang Gemini 3.x (≥ 4.096, sasaran ≥ 4.500) pada migrasi 2 September 2026 | 25 Agustus 2026 |

Kolom **Keputusan** memuat ID keputusan SDD — atau ID keputusan UX (`UXD-xx`) bila yang memutuskan adalah pemilik produk, bukan arsitek — dan bukan uraiannya — uraian, opsi yang ditolak, dan konsekuensinya ada di berkas SDD pemiliknya.

Format saat menutup: pindahkan barisnya ke sini, tambahkan kolom **Keputusan** dan **Tanggal**, lalu perbarui berkas SDD yang bersangkutan.
