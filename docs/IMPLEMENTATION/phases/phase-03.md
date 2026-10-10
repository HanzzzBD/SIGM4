# Phase 03 — Layanan Berbasis Aset & Reservasi Ruangan

| | |
|---|---|
| **Milestone PRD** | `M1` (M-05) · `M2` (M-07) · `M3` (M-06, M-11) · `M4` (M-14) · `M5` (M-19) — lihat §3.1 |
| **Status** | Lihat [`IMPLEMENTATION-STATUS.md`](../IMPLEMENTATION-STATUS.md) |
| **Modul PRD** | M-05 QR · M-06 Dokumen · M-07 Reservasi Ruangan · M-11 Kerusakan · M-14 Pengadaan · M-19 Chatbot |
| **Bergantung pada** | Phase 02 |
| **Memblokir** | Phase 04 |
| **Log** | [`logs/phase-03.md`](../logs/phase-03.md) |

---

## 1. Objective

Aset menjadi *dapat ditindaklanjuti*: dipindai, dilampiri dokumen, dilaporkan rusak, dan diadakan. Ruangan menjadi *dapat direservasi* — konsumen pertama mesin ketersediaan yang ditanam di Phase 02. Chatbot mulai menjawab pertanyaan atas data yang kini cukup kaya untuk dipertanyakan.

Ini phase terbesar dalam jumlah modul (6) namun keenamnya **saling independen** — hanya berbagi hulu yang sama.

## 2. Scope

**Termasuk**

- M-05: pembuatan & pencetakan QR, pemindaian
- M-06: unggah dokumen aset, pemindaian antivirus, siklus hidup berkas
- M-07: ketersediaan ruangan, pengajuan, pembatalan, penggunaan, blokade jadwal tetap
- M-11: pelaporan kerusakan, verifikasi, pemantauan status
- M-14: usulan pengadaan, persetujuan, penerimaan barang → **mulai mengisi `assets.procurement_id`**
- M-19: percakapan asisten AI, riwayat & evaluasi
- `room_fixed_schedules` (`FR-07.5`) — ditunda dari Phase 01 bersama modulnya

**Tidak termasuk**

- Reservasi **aset** (M-08) → **Phase 04** — berbagi tabel `booking_slots` dan aturan `BR-017`…`BR-030`; dipisah agar konflik ruangan tuntas dulu
- Work order dari laporan kerusakan (`BR-052`) → **Phase 04** bersama M-12
- Penghapusan aset rusak berat → **Phase 05** bersama M-21

## 3. Dependencies

| Bergantung pada | Alasan teknis |
|---|---|
| Phase 02 → M-04 | Seluruh enam modul berporos pada entitas aset |
| Phase 02 → M-10 | M-07 dan M-14 adalah pengaju approval pertama |
| Phase 02 → `booking_slots` | M-07 adalah konsumen pertamanya |
| Phase 02 → M-17 | Enam modul menerbitkan notifikasi |
| Phase 01 → M-03 | Ruangan sebagai sumber daya reservasi |

Di dalam phase, keenam modul berjalan paralel:

```
M-05  M-06  M-07  M-11  M-14  M-19   ← tanpa ketergantungan antar-modul
```

### 3.1 Kontribusi terhadap milestone PRD

| Modul | Milestone PRD ([29.2](../../PRD/01-product/delivery-plan.md)) |
|---|---|
| M-05 | `M1 — Identitas & Data Induk` — **menutup M1** |
| M-07 | `M2 — Mesin Persetujuan & Pemesanan` |
| M-06, M-11 | `M3 — Siklus Operasional` |
| M-14 | `M4 — Kontrol & Siklus Hidup Aset` |
| M-19 | `M5 — Insight, Notifikasi & AI` |

**`M1` tertutup di phase ini.** Kriteria keluarnya (500 aset terimpor, QR dicetak & dipindai, RBAC lolos uji otorisasi per role `ST-05`) baru dapat diuji setelah M-05 hidup.

## 4. Referensi PRD

| Berkas | ID yang dilayani |
|---|---|
| [`m05-qr.md`](../../PRD/02-modules/m05-qr.md) | `FR-05.1` `FR-05.2` · `BR-001` `BR-002` |
| [`m06-documents.md`](../../PRD/02-modules/m06-documents.md) | `FR-06.1` · `BR-073` |
| [`m07-reservation-room.md`](../../PRD/02-modules/m07-reservation-room.md) | `FR-07.1` … `FR-07.5` · `BR-017` … `BR-025`, `BR-030` |
| [`m11-damage-reports.md`](../../PRD/02-modules/m11-damage-reports.md) | `FR-11.1` … `FR-11.3` · `BR-032` `BR-044` `BR-045` `BR-052` |
| [`m14-procurement.md`](../../PRD/02-modules/m14-procurement.md) | `FR-14.1` … `FR-14.3` · `BR-060` … `BR-065` |
| [`m19-chatbot.md`](../../PRD/02-modules/m19-chatbot.md) | `FR-19.1` `FR-19.2` · `BR-075` … `BR-079` |
| [`ai-features.md`](../../PRD/03-architecture/ai-features.md) | Bab 22 · `AI-CTL-01` … `AI-CTL-10`, `SC-10` |
| [`availability-concurrency.md`](../../PRD/03-architecture/availability-concurrency.md) | `CI-01` … `CI-05` (penerapan nyata pertama) |

## 5. Referensi SDD

| Berkas | Keputusan yang diterapkan |
|---|---|
| [`01-availability-concurrency.md`](../../SDD/01-availability-concurrency.md) | `SDD-AVL-06` … `SDD-AVL-11` (penerapan) |
| [`09-file-storage-design.md`](../../SDD/09-file-storage-design.md) | `SDD-FS-01` … `SDD-FS-09` |
| [`10-ai-orchestrator-design.md`](../../SDD/10-ai-orchestrator-design.md) | `SDD-AI-01` … `SDD-AI-10`, `SDD-AI-12` … `SDD-AI-15` |
| [`02-approval-engine.md`](../../SDD/02-approval-engine.md) | Penerapan pada M-07 & M-14 |
| [`12-mobile-architecture.md`](../../SDD/12-mobile-architecture.md) | `SDD-MOB-01` … `SDD-MOB-06` (pemindaian & unggah) |
| [`11-frontend-architecture.md`](../../SDD/11-frontend-architecture.md) | `SDD-FE-07` … `SDD-FE-09` (komponen kalender) |
| [`05-database-design.md`](../../SDD/05-database-design.md) | `SDD-DB-08` (kontrak `procurement_id`) |

## 6. Deliverables

- QR dapat dicetak massal dan dipindai dari aplikasi mobile
- Dokumen aset terunggah lewat presigned URL dan lolos pemindaian AV
- Kalender ketersediaan ruangan + pengajuan reservasi yang melewati approval
- Blokade jadwal tetap (jam pelajaran) menutup ruangan otomatis
- Laporan kerusakan dari mobile dengan foto
- Alur pengadaan lengkap hingga barang diterima menjadi aset dengan `procurement_id` terisi
- Chatbot read-only dengan filter permission di lapisan kueri

## 7. Pull Request Plan

| PR | Judul | Kode | Uji | Bergantung | FR/SDD | Acceptance |
|---|---|:---:|:---:|---|---|---|
| `PR-03-01` | Pembuatan QR + payload + penyimpanan *(cakupan diperjelas, keputusan 1 log phase-03)* | M | M | Ph02 | `FR-05.1`, `FR-05.1 A2`, `BR-001` `BR-002` | Payload tidak memuat data pribadi; payload memakai `APP_BASE_URL` (`https://{domain}/a/{asset_uuid}`), yang masuk skema `shared/config` sebagai URL https berhost (`SDD-SYS-14`); matriks QR bertingkat koreksi galat **M** (AC 2×2 cm); "penyimpanan" = hanya `assets.uuid` yang disimpan, QR dirender saat dibutuhkan (tanpa berkas gambar); respons aset memuat `qr_url` dan `qr_terpasang`; `POST /assets/{id}/qr/regenerate` (`asset.qr_regenerate`, alasan wajib, `ASSET_QR_REGENERATED`) dan `PATCH /assets/qr-terpasang` (`asset.qr_print`, `ASSET_UPDATED`) |
| `PR-03-02` | Cetak QR massal (PDF, tata letak label) *(cakupan diperjelas, keputusan 2 log phase-03)* | M | M | 01 | `FR-05.1` langkah 2–4, `FR-05.1 A1`, `NFR-P-07`, `NFR-C-07`, `SDD-FS-12` | `POST /assets/qr/print` (`asset.qr_print`, 1–200 aset, `ASSET_QR_PRINTED` + jumlah) → satu PDF 1.7 A4; tiga preset (A4 3×8, 4×10, 2×5), elemen kode aset/nama; dirender Playwright (Chromium) **sinkron di API** ≤ 5 detik (`SDD-PERF-06`) sampai jalur worker tersedia pasca `PR-03-04` |
| `PR-03-03` | Endpoint pemindaian + resolusi ke aset *(cakupan diperjelas, keputusan 3 log phase-03)* | S | S | 01 | `FR-05.2` langkah 3, A1–A3, `SDD-AUTH-02` (pengecualian publik) | QR tak dikenal → galat jelas, bukan 500; `GET /assets/by-uuid/{uuid}` (`asset.view`, bentuk item katalog + kategori/lokasi + `dihapuskan`, BR-073, scope `restricted` → 404) dan `GET /public/assets/{uuid}` (publik, `public-asset`, `noindex`, atribut non-sensitif + `aktif`). Aksi kontekstual langkah 4 milik klien |
| `PR-03-04` | Layanan berkas — fondasi: registri, konfigurasi, adapter object storage *(dipecah, keputusan 5 log phase-03)* | M | M | Ph02 | `SDD-FS-01/02/05/06/13`, `INF-02`, `OBS-06` | Migration `expand` `0038`: `stored_files` (+ enum Bab 11.3 `file_scan_status`, `file_owner_type`) dan `users.foto_file_id` → `stored_files(id)` (keputusan 4 log phase-01); `S3_ENDPOINT`/`S3_REGION`/`S3_BUCKET`/`S3_ACCESS_KEY`/`S3_SECRET_KEY` masuk skema `shared/config`; `shared/storage` — AWS SDK v3, Backblaze B2 (produksi) / MinIO (dev, CI), path-style, presigned PUT (MIME & ukuran ikut ditandatangani) dan GET ditandatangani lewat `S3_PUBLIC_ENDPOINT` (`SDD-FS-13`), HEAD; pemeriksaan `object_storage` di `/health` menentukan `ready` (`OBS-06`); MinIO nyata di CI |
| `PR-03-05` | Pemindaian antivirus + karantina | M | M | 04, 25 | `SDD-FS-04/05` | Berkas terinfeksi tidak pernah dapat diunduh; pemeriksaan `av_scanner` terdaftar di `/health` (`OBS-06`) |
| `PR-03-06` | Metadata dokumen aset + CRUD + hak akses | M | L | 04, 25 | `FR-06.1`, `BR-073` | Migration `expand` `0039`: `asset_documents` (satu berkas `stored_files`) + `asset_document_links` (A3, keputusan 9b log phase-03); `GET`/`POST /assets/{id}/documents`, `DELETE …/{docId}` (lepas tautan; tautan terakhir → dokumen dihapus, SDD-09 §4.6) dan `GET …/download` (keputusan 9a); Dokumen di luar scope pengguna tidak terlihat. Entri linimasa jenis `DOKUMEN` dikerjakan `PR-03-24` (keputusan 9d); notifikasi garansi `PR-03-26` (keputusan 9c) |
| `PR-03-07` | Turunan gambar + siklus hidup berkas | M | M | 05 | `SDD-FS-06/07` | Berkas yatim terbersihkan job terjadwal |
| `PR-03-08` | Skema reservasi ruangan + integrasi `booking_slots` *(cakupan diperjelas, keputusan 11 log phase-03)* | M | L | Ph02 | `FR-07.2`, `SDD-AVL-06/12` | Slot terbentuk dalam transaksi yang sama: migration `expand` `0043` — `reservations` (+ `parent_id` berulang `BR-024a`, nomor anak `.NN`), tipe `reservation_type`, FK `booking_slots.reservation_id`; modul `m07-reservation-room` lahir dengan `ReservationService.buatReservasiRuangan` (nomor `RSV-RG` + reservasi + slot `TENTATIVE` + `RESERVATION_CREATED` di transaksi pemanggil). Tanpa endpoint; `reservation_items` → `PR-04-02` |
| `PR-03-09` | Kalender ketersediaan ruangan *(cakupan diperjelas, keputusan 12 log phase-03)* | L | L | 08 | `FR-07.1`, `AV-01` … `AV-05`, `CAL-UI-01` … `CAL-UI-09`, `SDD-FE-08/09` | Konflik terlihat sebelum pengajuan dikirim: `GET /rooms/availability` (`reservation.view`; rentang ≤ 42 hari, filter gedung/jenis/kapasitas, scope `restricted` tanpa rincian pemohon) + layar P-27 / C-24 (harian/mingguan/bulanan, grid tervirtualisasi, papan ketik, daftar < 768 px) dalam satu PR; migration `expand` `0044` kunci `reservasi.granularitas_menit` (15/30/60); jam operasional dari `DEFAULT_OPERATING_HOURS` sampai `PR-03-10` |
| `PR-03-10` | Pengajuan reservasi + pemicuan approval *(cakupan diperjelas, keputusan 14 log phase-03)* | L | L | 08, Ph02 | `FR-07.2`, `BR-017` … `BR-023c`, `SDD-APR-17` | Pengajuan bertabrakan → 409 dengan penjelasan; penangan hasil `RESERVASI_RUANGAN` terdaftar di registri `penanganHasil` (m10) sehingga penolakan manusia **dan** `auto_reject` job `approval-sla-check` melepas slot — diuji lewat jalur worker (keputusan 75 log phase-02); jam operasional `BR-018` dibaca dari `system_settings` (kunci baru seed migration `expand`, menggantikan konstanta `DEFAULT_OPERATING_HOURS` `SDD-APR-15` sehingga SLA approval **dan kalender P-27** memakai nilai yang sama — keputusan 88e log phase-02, keputusan 12b log phase-03); wizard P-29 didaftarkan dan dipasang sebagai aksi slot terpilih P-27 (`aksiPilihan`, keputusan 12 log phase-03); validasi rentang pengajuan terhadap `reservasi.granularitas_menit`; konsumen event `TentativeSlotExpired` (`PR-02-37`) menetapkan reservasi ruangan `Kedaluwarsa` (`RESERVATION_EXPIRED`) dan menotifikasi pemohon + approver (`BR-023b`); memakai `ReservationService.buatReservasiRuangan` (`PR-03-08`) — kelayakan ruangan (aktif, `dapat_direservasi`, `BR-022`) diperiksa sebelumnya lewat M-03; berulang `BR-024a` = induk + baris anak ber-`parent_id` bernomor `.NN`; aset pendukung ditolak sampai `PR-04-02` (keputusan 11 log phase-03). Keputusan 14: jam operasional = kunci `TEKS` `reservasi.jam_operasional_mulai/_selesai`, H-1 = `reservasi.jarak_minimum_hari` (migration `0045`); `POST /reservations/preview` baru bagi langkah Tinjau P-29 (jalur `RE-07`); induk berulang tanpa slot (`SDD-AVL-12` disunting); `NT-01` lewat `ApprovalInstanceCreated`; BR-030 lewat titik ekstensi `blokirPemohon` |
| `PR-03-11` | Pembatalan & perubahan reservasi + pelepasan slot | M | L | 10 | `FR-07.3`, `BR-024` `BR-024a` `BR-024b` | Slot terlepas seketika saat batal. *Keputusan 15 log phase-03:* API saja (`POST /reservations/{id}/cancel` + `NT-08`); drawer Batalkan dan "Ubah jadwal" (`BR-024`) pindah ke `PR-03-27`; pembatalan gabungan `BR-024b` ikut `PR-04-02` |
| `PR-03-12` | Penggunaan & penyelesaian reservasi | M | L | 10 | `FR-07.4`, `BR-025` `BR-030` | Aktivasi slot mengikuti sekuens 15.2. *Keputusan 16 log phase-03:* transisi otomatis di job `slot-activation`, endpoint baru `POST /reservations/{id}/usage` + permission `reservation.record_usage` (migration `0046`); API saja — drawer pencatatan P-31 ikut `PR-03-27` |
| `PR-03-13` | Blokade jadwal tetap + blokade manual | L | L | 08 | `FR-07.5` | Jadwal berulang menutup ruangan tanpa membuat ribuan baris berlebih. *Keputusan 19 log phase-03:* aturan mingguan + blokade manual (migration `0047`), materialisasi sinkron + job harian `fixed-schedule-materialize`, bentrok reservasi = pilihan eksplisit; UI = panel aksi sekunder P-27; impor CSV (A2, E.5.3) dan P-23 = PR baru |
| `PR-03-14` | Skema laporan kerusakan + pengajuan dari mobile | M | M | Ph02 | `FR-11.1`, `BR-044` `BR-045` | Foto wajib; unggah antre saat luring. *Keputusan 20 log phase-03:* API saja — migration `0048` (`damage_reports`, `damage_report_photos`), `POST /damage-reports` + `GET /damage-reports/open`, NT-19/NT-20; foto = pesanan presign `DAMAGE_PHOTO` yang boleh tertunda (A2); duplikat terbuka → 409. Layar P-39/P-40/P-41 = PR UI baru; MS-15 + antrean expo-sqlite ikut fondasi mobile `GAP-05-MOBILE` |
| `PR-03-15` | Verifikasi & tindak lanjut laporan | M | M | 14 | `FR-11.2`, `BR-032`, `BR-052` | Titik ekstensi work order disiapkan, belum diisi. *Keputusan 21 log phase-03:* API saja — `GET /damage-reports/{id}` (foto, foto tertunda, garansi aktif BR-052, scope `own`) + `POST /damage-reports/{id}/verify` (Tindak Lanjut / Perbaikan Ringan / Tolak beralasan, kondisi aset opsional atomik lewat inti M-04), NT-21, migration `0049` (`catatan_verifikasi`); titik ekstensi = `TitikWorkOrderKerusakan` di `index.ts` m11. A2 & `BR-032` → Phase 05 (tabel `loans`) |
| `PR-03-16` | Pemantauan status kerusakan | S | S | 14 | `FR-11.3` | Pelapor melihat perkembangan tanpa akses penuh |
| `PR-03-17` | Skema pengadaan + pengajuan usulan | M | M | Ph02 | `FR-14.1`, `BR-060` `BR-061` | Anggaran & justifikasi tervalidasi |
| `PR-03-18` | Persetujuan usulan pengadaan | M | M | 17, Ph02 | `FR-14.2`, `BR-062` `BR-063` | Rule bertingkat sesuai nilai usulan |
| `PR-03-19` | Penerimaan barang → pembuatan aset + **isi `procurement_id`** | L | L | 18, Ph02 | `FR-14.3`, `BR-064` `BR-065`, `SDD-DB-08` | Aset baru ber-`procurement_id`; aset lama tetap `NULL` dan sah |
| `PR-03-20` | Orkestrator AI: klien, streaming, kendali kuota | L | L | Ph02 | `FR-19.1`, `SDD-AI-01/02/03/04/12/14/15`, `AI-CTL-02` `AI-CTL-07` `AI-CTL-09` `AI-CTL-10` | `interactions.create` dengan `store: false`; tanpa `temperature`/`top_p`/`top_k`; `thinking_level` eksplisit; hanya custom function tool; pemeriksaan `llm` terdaftar di `/health` tanpa memengaruhi `ready` (`OBS-06`); `GEMINI_API_KEY` dan `CHAT_ENABLED` masuk skema `shared/config` (`SDD-SYS-14`) |
| `PR-03-21` | Definisi tool chatbot + guardrail permission di lapisan kueri | L | L | 20 | `BR-075` `BR-076`, `SDD-AI-05/06/15` | Automatic function calling SDK dimatikan; tool menerima `AuthContext`; data di luar scope tidak pernah terbaca |
| `PR-03-22` | Prompt caching (awalan statis, sasaran ≥ 4.500 token) | M | M | 20 | `SDD-AI-04/05/13`, `AI-CTL-01` | Uji memverifikasi **panjang awalan** dan `usage.total_cached_tokens > 0` pada permintaan kedua; metrik `chat_cache_read_ratio` terpantau |
| `PR-03-23` | Riwayat percakapan + evaluasi + eval harness | M | M | 21 | `FR-19.2`, `BR-077` … `BR-079`, `SDD-AI-09/10` | Eval berjalan di CI terhadap `SC-10` |
| `PR-03-24` | Detail aset + linimasa riwayat *(di luar rencana awal, keputusan 4 log phase-03)* | M | M | 03 | `FR-04.2` langkah 5 & A1, `BR-073` | `GET /assets/{id}` (identitas lengkap, QR, kategori/lokasi, foto aset `asset_photos` — dipindah dari catatan `PR-03-04`, keputusan 5 log phase-03; field finansial BR-073; scope `restricted`) dan `GET /assets/{id}/timeline` (terpaginasi, jenis `KONDISI`/`MUTASI` dari `asset_condition_history`/`asset_movements`; jenis sensitif disembunyikan bagi `restricted`). Jenis `DOKUMEN` dari `asset_documents`/`asset_document_links` ikut di sini karena `PR-03-06` tergabung lebih dulu (keputusan 9d log phase-03). Titik perluasan linimasa diisi PR pemilik riwayat lain: `PR-03-14`, `PR-04-10`, `PR-05-01` |
| `PR-03-25` | Layanan berkas — unggah/konfirmasi + foto profil *(dipecah dari `PR-03-04`, keputusan 5 log phase-03)* | M | M | 04 | `FR-06.1`, `FR-01.4` (foto, A3), `SDD-FS-01/02/03/06/09`, Bab 17.5 poin 6 | `POST /files/presign` dan `POST /files/confirm` (Bearer, m06 §7): kebijakan MIME/ukuran per jenis (SDD-09 §4.3), kunci buram, URL unggah 300 detik; confirm memverifikasi objek & ukuran, menerbitkan `FileUploaded` ke outbox (`SDD-EVT-03`) dan mencatat `FILE_UPLOADED`; penjaga unduh `409 FILE_NOT_SCANNED` (Bab 17.3) dipakai seluruh penerbit URL unduhan; `PUT /me` menerima `foto_file_id` (berkas milik pemanggil, jenis `USER_PHOTO`) dan `GET /me` memuat URL foto bila `CLEAN` |
| `PR-03-26` | Pemantauan garansi dokumen aset *(di luar rencana awal, keputusan 9c log phase-03)* | S | M | 06 | `FR-06.1` (AC notifikasi garansi, Post Conditions) | Kode NT baru di PRD (m06 §9) untuk Petugas Sarana Prasarana 30 hari sebelum `garansi_selesai`; job harian worker berpelaku SYSTEM, idempoten per dokumen; dokumen `dihapus` tidak diingatkan |
| `PR-03-27` | Daftar & detail reservasi *(di luar rencana awal, keputusan 13 log phase-03)* | L | M | 10 | `FR-07.3` langkah 1, `FR-10.3`, m07 §7, UX P-30/P-31 | `GET /reservations` (`reservation.view`, tersaring scope `reservation.view` (m07 §7 "tersaring sesuai role", UX P-30; `restricted` tanpa rincian pemohon pihak lain — tafsiran scope diputuskan saat PR dikerjakan); filter jenis/status/pemohon/rentang, terpaginasi) dan `GET /reservations/{id}` (objek, jadwal, tanggal turunan `BR-024a`, linimasa approval `FR-10.3`; di luar scope → 404); layar P-30 Daftar Reservasi dan P-31 Detail Reservasi; slot terisi di kalender P-27 bertaut ke P-31 bila berhak (UX §7.6.1). Drawer Batalkan beralasan (P-30/P-31, `FR-07.3`) dan "Ubah jadwal" = batalkan + wizard P-29 terisi (`BR-024`) dipasang di sini atas `POST /reservations/{id}/cancel` dari `PR-03-11` (keputusan 15a); drawer pencatatan penggunaan P-31 (`reservation.record_usage`) atas `POST /reservations/{id}/usage` dari `PR-03-12` (keputusan 16d). *Keputusan 17 log phase-03:* satu PR `L`; `restricted` = milik sendiri; linimasa lewat `GET /approvals/{id}/history`; Ajukan Ulang/Ubah jadwal = wizard terisi; riwayat dari activity log (`AL-10`) |

## 8. Task Breakdown

### `PR-03-10` — Pengajuan reservasi ruangan
- [ ] Bentuk slot `Tentative` dan instance approval dalam **satu** transaksi (`SDD-AVL-06`)
- [ ] Tangkap `23P01` → 409 `SLOT_CONFLICT` beserta rentang yang bentrok
- [ ] Naikkan slot ke `Confirmed` saat approval selesai (`FR-08.2` vs sekuens 15.2 — ikuti sekuens 15.2)
- [ ] Uji: dua pengaju bersamaan pada rentang sama → satu berhasil

### `PR-03-13` — Blokade jadwal tetap
- [ ] Simpan aturan berulang, **bukan** setiap kemunculannya
- [ ] Materialisasi slot dalam horizon bergulir lewat job terjadwal
- [ ] Hormati kalender akademik & hari libur dari Phase 01 (`CAL-01`…`CAL-03`)
- [ ] Blokade manual mengalahkan reservasi baru, tidak membatalkan yang sudah disetujui tanpa pemberitahuan (`NT-xx` terkait)

### `PR-03-19` — Penerimaan barang
- [ ] Buat aset dari baris usulan yang diterima
- [ ] Isi `assets.procurement_id` (kolom sudah ada sejak Phase 02)
- [ ] **Jangan** membuat FK menjadi `NOT NULL` — aset hibah/impor manual sah bernilai `NULL` selamanya
- [ ] Uji: aset Phase 02 tetap terbaca dan tidak terpengaruh

### `PR-03-20` — Orkestrator AI
- [ ] Model `gemini-3.6-flash` (stabil/GA) sesuai Bab 22.1; bukan alias `latest`, preview, atau eksperimental
- [ ] `store: false` pada setiap permintaan — tidak ada state percakapan di sisi penyedia (`SDD-AI-14`)
- [ ] `thinking_level: "minimal"` dinyatakan eksplisit — bawaannya `"medium"` (`SDD-AI-02`)
- [ ] Tidak mengirim `temperature`/`top_p`/`top_k` — diabaikan diam-diam, bukan ditolak (`SDD-AI-03`)
- [ ] Tidak mengirim `frequency_penalty`/`presence_penalty` — menghasilkan galat (`SDD-AI-03`)
- [ ] Automatic function calling SDK dimatikan; `ToolExecutor` satu-satunya jalur eksekusi (`SDD-AI-06`)
- [ ] Daftar tool hanya memuat custom function Bab 22.3 — tanpa tool bawaan Google (`SDD-AI-15`)
- [ ] Hitung token lewat `models.countTokens` terhadap model produksi, bukan pustaka pihak ketiga
- [ ] Periksa `status` sebelum membaca keluaran (`SDD-AI-11`)
- [ ] Kunci dibaca dari `GEMINI_API_KEY`; startup gagal bila kosong (`SDD-INF-08`)
- [ ] Pemantauan konsumsi kuota & batas laju penyedia + alarm (`AI-CTL-08` · retry 429 `AI-CTL-05`, **TBD-AI-C**)
- [ ] Pengalih penonaktifan chatbot lewat parameter sistem, tanpa memengaruhi modul lain (`AI-CTL-09` · `NFR-A-05`) — ini pula jalur pencabutan persetujuan lintas yurisdiksi (`SDD-AI-16`)
- [ ] Kegagalan penyedia berhenti di adapter `ChatProvider`: jalur 503 menampilkan pesan gangguan dan mengarahkan ke pencarian manual, tanpa galat di modul lain (`AI-CTL-10` · `FR-19.1 A4` · `SDD-AI-12`)

## 9. Acceptance Checklist

- [ ] Seluruh AC pada 16 FR yang tercakup terverifikasi
- [ ] `CI-01` terbukti pada jalur nyata: reservasi bertumpang tindih ditolak basis data, bukan aplikasi
- [ ] Berkas terinfeksi tidak pernah dapat diunduh (`SDD-FS-04`)
- [ ] Chatbot tidak dapat membaca data di luar permission penanya (`BR-076`) — diuji dengan akun berbeda scope
- [ ] Chatbot bersifat read-only: tidak ada tool yang menulis (`BR-075`)
- [ ] Aset hasil penerimaan pengadaan ber-`procurement_id`; aset lama tetap `NULL` tanpa galat
- [ ] Pemindaian QR bekerja luring lalu tersinkron saat daring (`SDD-MOB-03`)
- [ ] `/health` melaporkan keenam dependensi — DB, Redis, object storage, AV, FCM, LLM (`OBS-06`); pemeriksaannya didaftarkan `PR-02-27`, `PR-03-04`, `PR-03-05`, `PR-03-20`

## 10. Risks

| Risiko | Dampak | Mitigasi | Rujukan |
|---|---|---|---|
| Blokade jadwal tetap dimaterialisasi seluruh tahun ajaran | Ledakan baris `booking_slots` | Horizon bergulir; kebijakan arsip menunggu **TBD-AVL-A** | `FR-07.5` |
| Guardrail chatbot diterapkan di lapisan prompt, bukan kueri | Kebocoran data lintas scope — risiko keamanan tertinggi di phase ini | `AuthContext` wajib pada setiap tool; uji lintas-scope masuk gerbang keluar | `BR-076`, `SDD-AI-06` |
| Awalan statis menyusut di bawah 4.096 token akibat suntingan kemudian | Prompt caching mati diam-diam, latensi membengkak | Sasaran `SDD-AI-13` adalah ≥ 4.500 token — margin yang disengaja. Uji memverifikasi panjang **dan** cache benar-benar kena; metrik rasio cache dipantau sejak hari pertama | `SDD-AI-05` · `SDD-AI-13` |
| `store: true` lolos ke produksi | Percakapan sekolah tersimpan 55 hari di sisi penyedia, di luar `BR-078` dan `DP-AI-05` | Nilai dikunci konstanta di `ChatProvider`; uji memeriksa `store: false` pada setiap permintaan | `SDD-AI-14` · `DP-AI-05` |
| Enam modul paralel menyulitkan integrasi di akhir phase | Penumpukan konflik merge di pekan terakhir | Merge harian ke `develop`; tidak ada cabang berumur > 3 hari | `BRANCHING-STRATEGY` |
| Pemindaian AV memperlambat unggah dari mobile | Pengguna mengira aplikasi menggantung | Pemindaian asinkron dengan status berkas eksplisit | `SDD-FS-05` |
| Lantai OS lini Expo yang dipilih berada di atas `NFR-C-03` — Android 8.0 (API 26) / iOS 14 | Perangkat yang PRD janjikan didukung tidak dapat memasang aplikasi | Verifikasi lantai OS terhadap `NFR-C-03` **sebelum** versi dikunci, bukan sesudah kerangka dibangun. Bila lantai memang di atasnya, jalannya bukan menurunkan dukungan perangkat diam-diam: itu **perubahan requirement** yang naik ke pemilik produk, bukan keputusan SDD | `SDD-MOB-10`, `NFR-C-03` |

## 11. Rollback Strategy

| Skenario | Tindakan |
|---|---|
| PR gagal di staging | Revert PR; kelima modul lain tidak terdampak |
| `PR-03-19` bermasalah | `procurement_id` dikosongkan kembali — kolom nullable, tidak ada constraint yang pecah |
| Reservasi ruangan perlu ditarik | Slot berstatus `Released`, **tidak dihapus** — jejak audit dan analitik tetap utuh |
| Chatbot perlu dimatikan | *Feature flag* pada level route; modul lain tidak bergantung padanya |

Mulai phase ini `booking_slots` memuat data bermakna — `DROP TABLE` tidak lagi merupakan opsi rollback.

## 12. Definition of Done

**DoD dasar** — [PRD 29.5](../../PRD/01-product/delivery-plan.md).

**Tambahan khusus phase ini:**

- [ ] Kriteria keluar `M1` PRD terpenuhi: 500 aset terimpor, QR dicetak & dipindai, uji otorisasi tujuh role lulus (`ST-05`)
- [ ] Uji lintas-scope chatbot lulus untuk minimal tiga role berbeda
- [ ] Rasio *cache read* chatbot terukur dan tercatat di log phase
- [ ] Aset dari dua asal (pengadaan & manual) hidup berdampingan tanpa galat
- [ ] `TBD-AI-B` dan `TBD-AI-C` ditinjau; yang masih terbuka tercatat sebagai risiko terbawa. `TBD-AI-A` dan `TBD-FS-A` sudah tertutup 25 Agustus 2026 (`SDD-AI-13`, `SDD-FS-11`), `TBD-AI-D` tertutup 2 September 2026 (`SDD-AI-16`) sehingga `GL-07` bagian chatbot tidak lagi tertahan
- [ ] Log phase terisi

---

*Phase ini tidak memuat requirement maupun keputusan desain baru. Setiap pernyataan merujuk PRD atau SDD.*
