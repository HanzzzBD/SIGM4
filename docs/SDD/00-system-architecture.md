# SDD-00 — Arsitektur Sistem

**Area:** `SYS` · **Status:** Draft · **Basis:** [`system-overview.md`](../PRD/03-architecture/system-overview.md), [`deployment-ops.md`](../PRD/03-architecture/deployment-ops.md)

---

## 1. Konteks

| Kelompok | ID |
|---|---|
| Skala target | ±5.000 aset · 1.000 pengguna · 150 concurrent (`NFR-P-09`, `NFR-SC-02`) |
| Pemisahan lapisan | `NFR-M-02`, `NFR-M-07` |
| Penskalaan | `NFR-SC-01`, `NFR-SC-05`, `JOB-01` |
| Integritas transaksi | `NFR-R-05`, `CI-03` |
| Basis teknologi | `INF-01` … `INF-07` |
| Ketersediaan | `NFR-A-01`, `NFR-A-05`, `NFR-A-06` |

Berkas ini menetapkan bentuk sistem secara keseluruhan. Seluruh SDD lain beroperasi di dalam batas yang ditetapkan di sini.

---

## 2. Keputusan Desain

| ID | Keputusan |
|---|---|
| **SDD-SYS-01** | **Modular monolith**, bukan microservices. Satu artefak API yang dapat di-*deploy*, ditambah satu artefak worker dari basis kode yang sama. |
| **SDD-SYS-02** | Batas modul ditegakkan oleh struktur folder **dan** aturan lint impor. Modul dilarang mengimpor lapisan dalam modul lain. |
| **SDD-SYS-03** | Komunikasi antar-modul hanya melalui **service interface** yang diekspor modul pemilik. Repository bersifat privat terhadap modulnya. |
| **SDD-SYS-04** | 21 modul PRD dipetakan satu-ke-satu ke folder `src/modules/`. Tidak ada modul kode yang tidak punya padanan di PRD. |
| **SDD-SYS-05** | Efek samping lintas modul (notifikasi, activity log, pembatalan slot) dijalankan lewat **domain event**, bukan panggilan langsung berantai. Rinciannya di [SDD-07](07-event-flow.md). |
| **SDD-SYS-06** | Terdapat *shared kernel* berisi: `AuthContext`, `BusinessCalendarService`, `Clock`, `DocumentNumberService`, `ErrorMapper`, `EventBus`, `AuditLogger`. Modul boleh bergantung padanya; ia tidak boleh bergantung pada modul. |
| **SDD-SYS-07** | Waktu **selalu** diambil dari `Clock` yang di-*inject*, tidak pernah dari `new Date()` langsung. Ini prasyarat `TD-04` (test hook waktu). |
| **SDD-SYS-08** | Worker berbagi basis kode dengan API namun memiliki *entrypoint* terpisah dan **tidak** membuka port HTTP kecuali `/health`. |
| **SDD-SYS-09** | Chatbot AI berjalan sebagai modul di dalam monolith (`AI Orchestrator`), bukan layanan terpisah — tetapi seluruh panggilannya ke penyedia LLM melewati satu adapter agar `NFR-A-05` (graceful degradation) dapat ditegakkan di satu titik. |

---

## 3. Alasan

**SDD-SYS-01 — monolith modular.** Microservices ditolak karena tiga alasan yang spesifik pada sistem ini:

1. **Transaksi lintas modul adalah hal biasa, bukan pengecualian.** Satu pengajuan reservasi menulis `reservations`, `reservation_items`, `booking_slots`, `approval_instances`, `approval_steps`, dan `activity_logs` dalam **satu** transaksi (`CI-03`, `SDD-APR-08`). Memecahnya menjadi layanan berarti mengganti jaminan ACID dengan saga dan kompensasi — kompleksitas besar tanpa manfaat pada skala ini.
2. **Skala tidak menuntutnya.** 150 concurrent user dan 5.000 aset dilayani nyaman oleh dua instance API (`NFR-SC-02` bahkan menargetkan 3× volume tanpa perubahan arsitektur).
3. **Operasi dilakukan sekolah, bukan tim platform.** `AS-14`/`INF-05` menetapkan VPS terkelola. Menjalankan belasan layanan di lingkungan itu menambah beban operasional yang tidak ada yang menanggungnya.

Yang tetap diambil dari semangat microservices: batas modul yang tegas (SDD-SYS-02, SDD-SYS-03), sehingga bila suatu saat satu modul benar-benar perlu dipisah, biayanya wajar.

**SDD-SYS-02 — lint, bukan konvensi.** Batas modul yang hanya berupa kesepakatan akan luruh dalam beberapa bulan. Aturan lint impor membuat pelanggaran gagal di CI, bukan ditemukan saat review.

**SDD-SYS-05 — domain event untuk efek samping.** Tanpa ini, `LoanService.checkin()` harus memanggil `DamageService`, `FineService`, `NotificationService`, dan `AuditLogger` secara langsung — menjadikan modul peminjaman bergantung pada empat modul lain dan mustahil diuji terisolasi. Dengan event, ia hanya menerbitkan `LoanReturned`.

**SDD-SYS-07 — `Clock` di-inject.** `TD-04` mewajibkan pengujian jatuh tempo, TTL slot, SLA, dan eskalasi. Semua itu bergantung pada waktu. Tanpa `Clock` yang dapat diganti, pengujiannya menjadi menunggu atau memanipulasi jam sistem — keduanya rapuh.

---

## 4. Rancangan

### 4.1 Struktur kode

```
src/
├── shared/                     # shared kernel (SDD-SYS-06)
│   ├── auth/                   #   AuthContext, permission middleware
│   ├── calendar/               #   BusinessCalendarService (CAL-01)
│   ├── clock/                  #   Clock (SDD-SYS-07)
│   ├── events/                 #   EventBus, outbox
│   ├── numbering/              #   DocumentNumberService (SEQ-01..04)
│   ├── errors/                 #   ErrorMapper -> kode galat Bab 17.3
│   ├── audit/                  #   AuditLogger (AL-01)
│   └── db/                     #   koneksi, transaksi, tipe repository
│
├── modules/
│   ├── m01-auth/               # tiap modul: routes / controllers / services
│   ├── m02-users/              #              repositories / events / schemas
│   ├── …
│   └── m21-disposal/
│
├── api/                        # entrypoint HTTP  (SDD-SYS-08)
└── worker/                     # entrypoint job & queue consumer
```

Isi tiap modul:

```
mXX-nama/
├── index.ts          # HANYA ini yang boleh diimpor modul lain
├── routes.ts         # deklarasi route + permission (SDD-AUTH-01)
├── controllers/
├── services/         # logika bisnis; boleh diekspor lewat index.ts
├── repositories/     # PRIVAT terhadap modul (SDD-SYS-03)
├── events/           # event yang diterbitkan & ditangani
└── schemas/          # validasi masukan/keluaran
```

### 4.2 Aturan impor yang ditegakkan lint

| Dari | Boleh mengimpor | Dilarang |
|---|---|---|
| `modules/*` | `shared/*`, `modules/*/index.ts` | `modules/*/repositories/*`, `modules/*/controllers/*` |
| `shared/*` | `shared/*` | `modules/*` (apa pun) |
| `api/*`, `worker/*` | `shared/*`, `modules/*/index.ts` | internal modul |

Aturan ketiga adalah yang paling penting: *shared kernel* tidak boleh tahu tentang modul, jika tidak ia berubah menjadi simpul ketergantungan melingkar.

### 4.3 Alur satu permintaan tulis

```
HTTP  →  api/  →  middleware (autentikasi → gerbang sesi → permission → rate limit)
                     ↓
                  controller (validasi skema)
                     ↓
                  service   ── BEGIN TRANSACTION
                     ├── repository(ctx)          scope diterapkan  (PM-03)
                     ├── AuditLogger.write()      dalam transaksi   (AL-01)
                     └── EventBus.publish()       ke outbox         (SDD-EVT-*)
                              COMMIT
                     ↓
                  outbox dispatcher (worker) → notifikasi, FCM, SSE
```

Notifikasi dan push **selalu** berada di luar transaksi bisnis, sehingga kegagalannya tidak pernah menggagalkan transaksi (`NFR-A-06`, `NTF-04`).

### 4.4 Pemetaan modul PRD → folder kode

| PRD | Folder | PRD | Folder |
|---|---|---|---|
| M-01 | `m01-auth` | M-12 | `m12-maintenance` |
| M-02 | `m02-users` | M-13 | `m13-audit-stocktake` |
| M-03 | `m03-locations` | M-14 | `m14-procurement` |
| M-04 | `m04-assets` | M-15 | `m15-dashboard` |
| M-05 | `m05-qr` | M-16 | `m16-analytics` |
| M-06 | `m06-documents` | M-17 | `m17-notifications` |
| M-07 | `m07-reservation-room` | M-18 | `m18-activity-log` |
| M-08 | `m08-reservation-item` | M-19 | `m19-chatbot` |
| M-09 | `m09-loans` | M-20 | `m20-settings` |
| M-10 | `m10-approval` | M-21 | `m21-disposal` |
| M-11 | `m11-damage-reports` | | |

### 4.5 Artefak yang dapat di-deploy

| Artefak | Entrypoint | Menjalankan | Skala |
|---|---|---|---|
| `sigm4-api` | `src/api` | HTTP, SSE, orkestrasi AI | Horizontal (≥2) |
| `sigm4-worker` | `src/worker` | Scheduler, antrean, outbox, ekspor, PDF, AV | Vertikal (1), lihat `JOB-02` |

Keduanya dari image yang sama dengan variabel lingkungan berbeda — menghilangkan risiko versi kode API dan worker berbeda.

---

## 5. Konsekuensi

- Seluruh SDD lain wajib menempatkan komponennya pada struktur §4.1. Tidak ada folder tingkat atas baru tanpa pembaruan berkas ini.
- Modul yang butuh data modul lain **harus** melewati service interface — bila ternyata dibutuhkan kueri gabungan lintas modul untuk performa, itu menjadi keputusan sadar yang dicatat, bukan pintasan diam-diam.
- Worker tunggal menjadi titik kegagalan tunggal untuk pekerjaan terjadwal. Diterima karena job bersifat idempoten dan dapat diulang (`JOB-03`, `JOB-06`); pemantauan kegagalan job wajib (`OBS-05`).
- Karena chatbot berada di dalam monolith (SDD-SYS-09), lonjakan pemakaian AI dapat memengaruhi latensi API. Dimitigasi oleh rate limit khusus (`AI-CTL-06`) dan pengalih penonaktifan (`AI-CTL-09`).

---

## 6. Risiko Teknis

| Risiko | Dampak | Mitigasi |
|---|---|---|
| Batas modul luruh seiring waktu | Monolith menjadi *big ball of mud* | Aturan lint impor di CI (SDD-SYS-02); review menolak impor lintas lapisan |
| *Shared kernel* menggemuk | Semua modul bergantung pada semuanya | Isi kernel dibatasi daftar tetap di SDD-SYS-06; penambahan memerlukan pembaruan berkas ini |
| Monolith membesar hingga *build* lambat | Umpan balik pengembangan melambat | Batas modul memungkinkan pemecahan bila benar-benar diperlukan; belum menjadi masalah pada skala ini |
| Worker mati tanpa disadari | Denda, pengingat, dan work order preventif tidak terbit | Alarm kegagalan job dan *heartbeat* worker (`OBS-05`) |
| `new Date()` menyelinap ke kode | Uji waktu menjadi rapuh | Aturan lint melarang `new Date()` di luar `shared/clock` |

---

## 7. Requirement Terkait

`NFR-M-02` `NFR-M-07` `NFR-M-09` · `NFR-SC-01` `NFR-SC-02` `NFR-SC-05` · `NFR-R-05` `NFR-R-08` ·
`NFR-A-05` `NFR-A-06` `NFR-A-07` · `NFR-P-09` · `INF-01` … `INF-07` · `JOB-01` … `JOB-06` ·
`CI-03` · `AL-01` `AL-06` · `PM-02` `PM-03` · `AI-CTL-06` `AI-CTL-09` · `TD-04`

---

## 8. TBD

Tidak ada. Seluruh keputusan pada berkas ini dapat diambil dari batasan yang sudah ditetapkan PRD.
