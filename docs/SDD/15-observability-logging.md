# SDD-15 — Observability & Logging

**Area:** `OBS` · **Status:** Draft · **Basis:** [`deployment-ops.md`](../PRD/03-architecture/deployment-ops.md), [`activity-log.md`](../PRD/03-architecture/activity-log.md)

---

## 1. Konteks

| Kelompok | ID |
|---|---|
| Observability | `OBS-01` … `OBS-07` |
| Log aplikasi | `NFR-M-06`, `NFR-R-10` |
| Activity log | `AL-01` … `AL-10`, `BR-071`, `BR-072` |
| Keamanan | `NFR-S-10`, `NFR-S-16`, `AL-05` |
| Pekerjaan terjadwal | `JOB-05`, `JOB-06` |
| Ketersediaan | `NFR-A-07`, `NFR-A-01` |
| Retensi | Bab 11.4 |

---

## 2. Keputusan Desain

| ID | Keputusan |
|---|---|
| **SDD-OBS-01** | **Activity log dan log aplikasi adalah dua sistem berbeda** dengan tujuan, penyimpanan, retensi, dan jaminan berbeda. Keduanya tidak pernah digabung. |
| **SDD-OBS-02** | Log aplikasi berformat **JSON terstruktur** dengan field wajib tetap; tidak ada log teks bebas di jalur produksi. |
| **SDD-OBS-03** | `request_id` dibangkitkan di *edge*, dipropagasi lewat seluruh lapisan termasuk worker dan job, dan muncul di respons (`X-Request-Id`) serta di entri activity log. |
| **SDD-OBS-04** | *Redaction* dilakukan **di formatter log**, bukan di titik pemanggilan — sehingga field sensitif tidak bisa lolos karena satu pemanggil lupa. |
| **SDD-OBS-05** | Metrik mengikuti pola **RED** (Rate, Errors, Duration) per kelas endpoint (`SDD-PERF-01`), ditambah metrik domain yang spesifik sistem ini. |
| **SDD-OBS-06** | `/health` memisahkan **liveness** dan **readiness**, dan melaporkan status dependensi untuk kartu "Kesehatan Integrasi" (`OBS-06`, 19.2). |
| **SDD-OBS-07** | Setiap alarm memiliki **penerima dan runbook** sebelum diaktifkan; alarm tanpa keduanya tidak dipasang. |
| **SDD-OBS-08** | *Tracing* dipasang pada lima alur transaksional kritis saja, bukan seluruh endpoint (`OBS-03`). |
| **SDD-OBS-09** | Instrumentasi memakai **OpenTelemetry** di dalam aplikasi; *backend* log, metrik, dan trace adalah **layanan terkelola tier kecil**. Activity log tidak ikut ke sana (`SDD-OBS-01`). |

---

## 3. Alasan

**SDD-OBS-01 — dua sistem, bukan satu.** Ini keputusan paling penting di berkas ini, dan menggabungkan keduanya adalah kesalahan yang sering terjadi:

| | Activity log | Log aplikasi |
|---|---|---|
| Untuk siapa | Auditor, Pimpinan Sekolah, Administrator | Tim pengembang & operasional |
| Menjawab | "Siapa mengubah ini, kapan, dari apa ke apa" | "Mengapa permintaan ini gagal" |
| Tempat | Tabel PostgreSQL, dipartisi, berantai hash | Agregator log terpusat |
| Retensi | ≥ 2 tahun aktif, **tidak pernah dihapus** (`AL-09`) | 30 hari (`OBS-02`) |
| Jaminan | *Append-only*, tamper-evident (`AL-03a`) | *Best effort* |
| Ditulis | Sinkron, dalam transaksi bisnis (`SDD-EVT-08`) | Asinkron, tidak pernah memblokir |
| Kegagalan | Alarm, tidak menggagalkan transaksi (`AL-08`) | Diabaikan |

Menyimpan activity log di agregator akan melanggar `AL-09` (retensi) dan `AL-03` (tidak dapat dihapus). Menyimpan log debug di PostgreSQL akan membanjiri basis data transaksional. Keduanya punya tempatnya masing-masing.

**SDD-OBS-03 — `request_id` sampai ke worker.** Rantai sebab-akibat sistem ini melewati batas proses: permintaan HTTP → transaksi → outbox → worker → notifikasi. Tanpa korelasi yang menyeberang, menelusuri "mengapa pemohon ini tidak menerima notifikasi" berarti membaca dua kumpulan log tanpa penghubung. `request_id` karena itu disimpan pada baris outbox dan diteruskan ke konteks pekerjaan.

**SDD-OBS-04 — redaction di formatter.** `NFR-S-10` dan `AL-05` melarang data sensitif muncul di log. Menyerahkannya pada disiplin pemanggil berarti satu `logger.info({ user })` yang menyertakan `password_hash` akan lolos. Daftar tolak di formatter menutupnya di satu tempat.

**SDD-OBS-07 — alarm tanpa runbook tidak dipasang.** Alarm yang tidak ada penerimanya adalah derau; alarm yang penerimanya tidak tahu harus berbuat apa lebih buruk — ia melatih orang mengabaikan alarm. `OBS-07` mewajibkan penerima ditetapkan sebelum go-live; rancangan ini menambahkan runbook sebagai syarat aktivasi.

**SDD-OBS-09 — OpenTelemetry di aplikasi, backend terkelola.** Dua bagian keputusan ini punya alasan yang berbeda dan sebaiknya tidak dicampur.

**OpenTelemetry berlaku tanpa syarat**, terlepas dari backend mana pun yang dipilih. Ia memisahkan instrumentasi — metrik domain §4.3, lima trace §4.4, propagasi `request_id` (`SDD-OBS-03`) — dari tempat data itu bermuara, sehingga penggantian backend menjadi perubahan konfigurasi alih-alih penulisan ulang kode aplikasi. Karena bagian kedua keputusan ini justru yang paling mungkin ditinjau ulang, netralitas itu bernilai langsung, bukan spekulatif.

**Backend terkelola dipilih atas dasar kapasitas operasional, bukan kemampuan teknis.** Stack swa-kelola (Prometheus + Grafana + Loki + Tempo) memenuhi seluruh kebutuhan §4.3–§4.7 dan punya keunggulan nyata: tidak ada data yang meninggalkan infrastruktur sekolah, dan tidak ada biaya per-GB. Ia ditolak karena menambahkan empat layanan pada host yang topologinya sudah padat ([SDD-16 §4.2](16-infrastructure-deployment.md)), menjadikan retensi §4.7 sebagai persoalan disk sekolah, dan membuat alarm "disk > 80%" ikut menjaga sistem pemantauannya sendiri — semuanya pada pihak yang [SDD-16 §6](16-infrastructure-deployment.md) sudah tandai sebagai risiko dengan mitigasi berupa pelatihan dan hypercare berbatas waktu. Perlu dicatat pula bahwa swa-kelola penuh tetap tidak menghilangkan komponen luar: `OBS-04` menuntut pemantauan *uptime* **eksternal** atas `/health`, karena pemantau yang berada di host yang sama akan mati bersama host yang dipantaunya.

Yang **tidak** ikut ke backend mana pun adalah activity log. `SDD-OBS-01` sudah menetapkannya sebagai sistem terpisah di PostgreSQL berantai hash; memindahkannya ke agregator akan melanggar `AL-09` dan `AL-03`. Keputusan ini karena itu hanya menyangkut log aplikasi, metrik, dan trace.

---

## 4. Rancangan

### 4.1 Skema log aplikasi

```json
{
  "ts": "2026-08-05T02:31:44.812Z",
  "level": "info",
  "msg": "reservation created",
  "request_id": "req_01J8XK2",
  "trace_id": "4bf92f3577b34da6",
  "user_id": 42,
  "role": "GURU",
  "modul": "m07-reservation-room",
  "route": "POST /api/v1/reservations",
  "status": 201,
  "duration_ms": 187,
  "db_queries": 6
}
```

Field wajib: `ts`, `level`, `msg`, `request_id`, `modul`. `user_id` diisi bila ada sesi. Log galat menambahkan `error.type`, `error.message`, dan `error.stack` — **stack hanya ke agregator, tidak pernah ke klien** (`NFR-R-10`).

### 4.2 Redaction

```ts
const REDACT = [
  'password', 'password_hash', 'token', 'access_token', 'refresh_token',
  'token_hash', 'totp_secret', 'totp_secret_enc', 'code_hash',
  'authorization', 'cookie', 'set-cookie', 'api_key', 'secret_value',
  'nip_nis', 'telepon',                    // PII — DP-03
];
```

Diterapkan rekursif oleh formatter pada kunci **dan** pola nilai (mis. string berawalan `sk-`). Diuji: log yang sengaja diberi objek pengguna lengkap tidak boleh memuat satu pun field di atas.

### 4.3 Metrik

**RED per kelas endpoint** (`SDD-PERF-01`):

```
http_requests_total{class,method,route,status}
http_request_duration_seconds{class,route}     histogram
http_errors_total{class,route,error_code}
```

**Metrik domain** — yang benar-benar penting bagi sistem ini:

| Metrik | Mengapa |
|---|---|
| `booking_conflicts_total` | Pelanggaran exclusion constraint = indikator kontensi (`CI-01`) |
| `tentative_slots_expired_total` | Slot menggantung yang dibebaskan (`BR-023b`) |
| `approval_sla_breached_total` | Kesehatan proses persetujuan (`SC-03`, `RS-05`) |
| `outbox_pending_count` | Keterlambatan notifikasi (`NFR-P-12`) |
| `outbox_dead_letter_count` | Efek yang hilang diam-diam (`SDD-EVT-*`) |
| `scheduled_job_duration_seconds{job}` | `JOB-05` |
| `scheduled_job_failures_total{job}` | `JOB-06` |
| `file_scan_pending_count` | Berkas tertahan AV (`NFR-S-18`) |
| `chat_tokens_total{user}` / `chat_cost_daily` | `AI-CTL-08` |
| `chat_cache_read_ratio` | Bukti caching aktif (`AI-CTL-01`) — nol berarti caching mati diam-diam |
| `sse_connections_active` | Beban notifikasi real-time (`NTF-03`) |
| `activity_log_chain_verified` | Integritas rantai hash (`NFR-S-03d`) |
| `login_failures_total`, `accounts_locked_total` | `NFR-S-16` |

### 4.4 Tracing

Lima alur diinstrumentasi (`OBS-03`):

| Alur | Span penting |
|---|---|
| Pengajuan reservasi | validasi → lock → insert slot → bentuk approval → commit → outbox |
| Serah terima | scan → verifikasi alokasi → transaksi → notifikasi |
| Pengembalian | check-in → denda → tiket kerusakan → transisi status |
| Keputusan approval | evaluasi → conditional update → promosi slot → notifikasi |
| Chatbot | prompt build → panggilan LLM → iterasi tool → streaming |

Span membawa `request_id`; span worker menjadi anak dari span permintaan yang menerbitkan event.

### 4.5 Health check

```
GET /health/live     → 200 selama proses hidup (tanpa memeriksa dependensi)
GET /health/ready    → 200 hanya bila DB, Redis, dan storage siap
GET /health          → ringkasan untuk kartu Kesehatan Integrasi (OBS-06)
```

```json
{
  "status": "degraded",
  "checks": {
    "database":       { "status": "up",       "latency_ms": 3 },
    "redis":          { "status": "up",       "latency_ms": 1 },
    "object_storage": { "status": "up",       "latency_ms": 42 },
    "av_scanner":     { "status": "up",       "queue": 0 },
    "fcm":            { "status": "up" },
    "llm":            { "status": "degraded", "note": "latensi di atas normal" }
  }
}
```

`llm` dan `fcm` **tidak pernah** membuat `/health/ready` gagal — gangguan keduanya tidak boleh mengeluarkan instance dari rotasi (`NFR-A-05`, `NFR-A-06`).

### 4.6 Alarm

| Alarm | Ambang | Keparahan | Runbook menjawab |
|---|---|---|---|
| Tingkat galat 5xx | > 1% selama 5 menit | Kritis | Mana endpoint? rollback atau perbaiki? |
| Latensi p95 | > anggaran kelas selama 10 menit | Tinggi | Kueri mana? indeks hilang? |
| Pekerjaan terjadwal gagal | Sekali | Tinggi | Jalankan ulang manual; efek apa yang tertunda? |
| Worker tidak berdenyut | 10 menit | Kritis | Denda & pengingat tidak terbit |
| Kedalaman antrean | > 1.000 | Tinggi | Skalakan worker atau selidiki handler lambat |
| Dead letter bertambah | Sekali | Tinggi | Efek apa yang hilang? proses ulang |
| Disk | > 80% | Tinggi | Partisi log? berkas? |
| Cadangan gagal | Sekali | Kritis | RPO terancam (`NFR-R-01`) |
| Sertifikat TLS | < 14 hari | Tinggi | Perbarui |
| Kegagalan tulis activity log | Sekali | Kritis | `AL-08` — transaksi lanjut tapi jejak hilang |
| Rantai hash log terputus | Sekali | Kritis | Dugaan manipulasi; eskalasi ke Kepala Sekolah |
| Biaya harian Claude API | > ambang | Sedang | Tinjau pemakaian; pertimbangkan pengalih (`AI-CTL-09`) |
| `chat_cache_read_ratio` = 0 | 1 jam | Sedang | Prefiks statis berubah? cache mati (`AI-CTL-01`) |
| Break-glass dijalankan | Sekali | Kritis | Verifikasi otorisasi tertulis (`FR-01.6`) |
| Lonjakan login gagal | > 50/menit | Tinggi | Dugaan credential stuffing |

### 4.7 Retensi & korelasi

| Data | Retensi | Tempat |
|---|---|---|
| Log aplikasi | 30 hari | Agregator (`OBS-02`) |
| Metrik | 90 hari mentah, 1 tahun teragregasi | Sistem metrik |
| Trace | 7 hari | Sistem tracing |
| **Activity log** | **≥ 2 tahun aktif, tidak pernah dihapus** | PostgreSQL terpartisi (`AL-09`) |

Ketiga sistem pertama dikorelasikan lewat `request_id`; activity log memuat `request_id` yang sama sehingga temuan audit dapat ditelusuri ke log teknisnya selama masih dalam retensi.

---

## 5. Konsekuensi

- Tim operasional memerlukan akses ke tiga sistem (log, metrik, trace) plus antarmuka activity log di aplikasi. Perbedaan tujuan keempatnya perlu dijelaskan saat pelatihan (`IMP-07`).
- `request_id` menjadi field wajib di banyak tempat, termasuk baris outbox dan konteks job — pengabaiannya memutus penelusuran.
- Alarm memerlukan penerima yang ditetapkan sebelum go-live (`OBS-07`); tanpa itu, gerbang rilis tidak dapat dinyatakan lulus.
- Metrik `chat_cache_read_ratio` mengubah `AI-CTL-01` dari niat menjadi sesuatu yang terpantau — kegagalan caching tidak lagi tak terlihat.
- **Log aplikasi meninggalkan infrastruktur sekolah** (`SDD-OBS-09`). Akibatnya *redaction* di formatter (`SDD-OBS-04`) naik status dari higiene menjadi **kontrol kepatuhan**: daftar tolak §4.2 dan pengujiannya menjadi syarat, bukan praktik baik. **TBD-SEC-B** (kepatuhan formal di luar UU PDP) karena itu wajib dijawab **sebelum** vendor dipilih, bukan sesudahnya.
- Bila jawaban TBD-SEC-B melarang data keluar premis, yang berubah hanya backend — instrumentasi OpenTelemetry tidak perlu ditulis ulang, dan stack swa-kelola menjadi jalur cadangan dengan biaya perpindahan yang kecil.
- Retensi §4.7 (log 30 hari, metrik 90 hari mentah + 1 tahun teragregasi, trace 7 hari) menjadi parameter langganan, bukan kapasitas disk — ia berpindah dari risiko operasional menjadi baris biaya pada PRD 27.9, dan ikut bergantung pada **TBD-INF-A**.
- `OBS-04` tetap memerlukan pemantauan *uptime* eksternal; pada backend terkelola umumnya tercakup, tetapi keberadaannya harus diverifikasi saat vendor dipilih, bukan diasumsikan.

---

## 6. Risiko Teknis

| Risiko | Dampak | Mitigasi |
|---|---|---|
| Volume log membanjiri agregator | Biaya naik, pencarian melambat | Level `info` di produksi; `debug` hanya sementara & bertenggat |
| Redaction terlewat pada field baru | PII masuk log | Daftar tolak + uji yang sengaja mengirim objek sensitif |
| Alarm terlalu berisik | Diabaikan | Ambang dikalibrasi pada staging; setiap alarm punya runbook |
| Metrik kardinalitas tinggi | Sistem metrik membengkak | `user_id` tidak dipakai sebagai label kecuali pada metrik biaya AI yang volumenya kecil |
| Tracing menambah latensi | Regresi performa | Hanya lima alur; *sampling* diaktifkan bila overhead terukur |
| Rantai hash gagal diverifikasi karena bug, bukan manipulasi | Alarm palsu tingkat kritis | Verifikasi diuji pada data uji sebelum diaktifkan di produksi |

---

## 7. Requirement Terkait

`OBS-01` … `OBS-07` · `AL-01` … `AL-10` · `NFR-M-06` `NFR-R-10` `NFR-S-03d` `NFR-S-10` `NFR-S-16` `NFR-S-18` ·
`NFR-A-05` `NFR-A-06` `NFR-A-07` · `NFR-P-12` · `JOB-05` `JOB-06` · `AI-CTL-01` `AI-CTL-08` `AI-CTL-09` ·
`BR-071` `BR-072` · `NTF-03` · `SC-03` · `RS-05` `RS-14` · Bab 11.4 · `FR-01.6` `FR-18.1` `FR-18.2`

---

## 8. TBD

| ID | Pertanyaan |
|---|---|
| **TBD-OBS-B** | Penerima alarm (*on-call*) dan jalur eskalasinya belum ditetapkan — `OBS-07` mewajibkannya sebelum go-live. Ini keputusan organisasi sekolah, bukan teknis. |
| **TBD-EVT-B** *(dari SDD-07)* | Apakah dead letter memerlukan antarmuka pemrosesan ulang di menu Administrator, atau cukup ditangani lewat akses operasional. |
