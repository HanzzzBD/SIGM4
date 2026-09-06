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

| PR | Judul | Kompleksitas | Bergantung | FR/SDD | Acceptance |
|---|---|:---:|---|---|---|
| `PR-03-01` | Pembuatan QR + payload + penyimpanan | M | Ph02 | `FR-05.1`, `BR-001` `BR-002` | Payload tidak memuat data pribadi |
| `PR-03-02` | Cetak QR massal (PDF, tata letak label) | M | 01 | `FR-05.1 A2` | 100 label satu berkas |
| `PR-03-03` | Endpoint pemindaian + resolusi ke aset | S | 01 | `FR-05.2` | QR tak dikenal → galat jelas, bukan 500 |
| `PR-03-04` | Layanan berkas: presigned URL unggah/unduh | M | Ph02 | `FR-06.1`, `SDD-FS-01/02/03` | URL kedaluwarsa sesuai `SDD-FS-02` |
| `PR-03-05` | Pemindaian antivirus + karantina | M | 04 | `SDD-FS-04/05` | Berkas terinfeksi tidak pernah dapat diunduh |
| `PR-03-06` | Metadata dokumen aset + CRUD + hak akses | M | 04 | `FR-06.1`, `BR-073` | Dokumen di luar scope pengguna tidak terlihat |
| `PR-03-07` | Turunan gambar + siklus hidup berkas | M | 05 | `SDD-FS-06/07` | Berkas yatim terbersihkan job terjadwal |
| `PR-03-08` | Skema reservasi ruangan + integrasi `booking_slots` | M | Ph02 | `FR-07.2`, `SDD-AVL-06` | Slot terbentuk dalam transaksi yang sama |
| `PR-03-09` | Kalender ketersediaan ruangan | L | 08 | `FR-07.1`, `AV-01` … `AV-05`, `SDD-FE-07/08` | Konflik terlihat sebelum pengajuan dikirim |
| `PR-03-10` | Pengajuan reservasi + pemicuan approval | L | 08, Ph02 | `FR-07.2`, `BR-017` … `BR-023c` | Pengajuan bertabrakan → 409 dengan penjelasan |
| `PR-03-11` | Pembatalan & perubahan reservasi + pelepasan slot | M | 10 | `FR-07.3`, `BR-024` `BR-024a` `BR-024b` | Slot terlepas seketika saat batal |
| `PR-03-12` | Penggunaan & penyelesaian reservasi | M | 10 | `FR-07.4`, `BR-025` `BR-030` | Aktivasi slot mengikuti sekuens 15.2 |
| `PR-03-13` | Blokade jadwal tetap + blokade manual | L | 08 | `FR-07.5` | Jadwal berulang menutup ruangan tanpa membuat ribuan baris berlebih |
| `PR-03-14` | Skema laporan kerusakan + pengajuan dari mobile | M | Ph02 | `FR-11.1`, `BR-044` `BR-045` | Foto wajib; unggah antre saat luring |
| `PR-03-15` | Verifikasi & tindak lanjut laporan | M | 14 | `FR-11.2`, `BR-032`, `BR-052` | Titik ekstensi work order disiapkan, belum diisi |
| `PR-03-16` | Pemantauan status kerusakan | S | 14 | `FR-11.3` | Pelapor melihat perkembangan tanpa akses penuh |
| `PR-03-17` | Skema pengadaan + pengajuan usulan | M | Ph02 | `FR-14.1`, `BR-060` `BR-061` | Anggaran & justifikasi tervalidasi |
| `PR-03-18` | Persetujuan usulan pengadaan | M | 17, Ph02 | `FR-14.2`, `BR-062` `BR-063` | Rule bertingkat sesuai nilai usulan |
| `PR-03-19` | Penerimaan barang → pembuatan aset + **isi `procurement_id`** | L | 18, Ph02 | `FR-14.3`, `BR-064` `BR-065`, `SDD-DB-08` | Aset baru ber-`procurement_id`; aset lama tetap `NULL` dan sah |
| `PR-03-20` | Orkestrator AI: klien, streaming, kendali kuota | L | Ph02 | `FR-19.1`, `SDD-AI-01/02/03/04/12/14/15`, `AI-CTL-02` `AI-CTL-07` `AI-CTL-09` `AI-CTL-10` | `interactions.create` dengan `store: false`; tanpa `temperature`/`top_p`/`top_k`; `thinking_level` eksplisit; hanya custom function tool |
| `PR-03-21` | Definisi tool chatbot + guardrail permission di lapisan kueri | L | 20 | `BR-075` `BR-076`, `SDD-AI-05/06/15` | Automatic function calling SDK dimatikan; tool menerima `AuthContext`; data di luar scope tidak pernah terbaca |
| `PR-03-22` | Prompt caching (awalan statis, sasaran ≥ 4.500 token) | M | 20 | `SDD-AI-04/05/13`, `AI-CTL-01` | Uji memverifikasi **panjang awalan** dan `usage.total_cached_tokens > 0` pada permintaan kedua; metrik `chat_cache_read_ratio` terpantau |
| `PR-03-23` | Riwayat percakapan + evaluasi + eval harness | M | 21 | `FR-19.2`, `BR-077` … `BR-079`, `SDD-AI-09/10` | Eval berjalan di CI terhadap `SC-10` |

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
