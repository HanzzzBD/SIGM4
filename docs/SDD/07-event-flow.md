# SDD-07 — Alur Event

**Area:** `EVT` · **Status:** Draft · **Basis:** lintas modul; lihat [`system-overview.md`](../PRD/03-architecture/system-overview.md)

---

## 1. Konteks

Banyak requirement PRD berbentuk "ketika X terjadi, maka Y juga terjadi" — dan Y berada di modul lain:

| Pemicu | Efek lintas modul | ID |
|---|---|---|
| Pengembalian aset rusak | Tiket kerusakan terbit otomatis | `BR-032` |
| Aset masuk perbaikan | Reservasi mendatang dibatalkan + pemohon dinotifikasi | `BR-048` , `NT-27` |
| Work order ditutup | Tiket kerusakan asalnya ikut tertutup | `BR-050` |
| Penerimaan pengadaan | Aset terbentuk + dokumen tertaut | `BR-064`, `BR-065` |
| Opname disetujui | Penyesuaian lokasi/kondisi/status aset diterapkan | `BR-057` |
| Approval final | Slot naik ke `Confirmed`, pemohon dinotifikasi | `BR-043`, `NT-02` |
| Penyerahan bahan | Saldo berkurang; bila menembus stok minimum, peringatan terbit | `BR-083`, `BR-085`, `NT-49` |
| Opname bahan disetujui | Transaksi `OPNAME` menyesuaikan saldo | `BR-094` |
| Setiap operasi tulis | Entri activity log | `BR-071`, `AL-01` |

Berkas ini menetapkan **bagaimana** rantai sebab-akibat itu dijalankan tanpa membuat modul saling bergantung, dan tanpa kehilangan efek bila proses mati di tengah jalan.

---

## 2. Keputusan Desain

| ID | Keputusan |
|---|---|
| **SDD-EVT-01** | Event bersifat **in-process** di dalam monolith, bukan message broker eksternal. |
| **SDD-EVT-02** | Efek yang **wajib atomik** dengan pemicunya dijalankan **sinkron di dalam transaksi yang sama**, bukan lewat event. |
| **SDD-EVT-03** | Efek yang **boleh tertunda** (notifikasi, push, ekspor, pemindaian AV) dikirim lewat **transactional outbox** dan diproses worker setelah commit. |
| **SDD-EVT-04** | Event diterbitkan ke outbox **di dalam** transaksi bisnis; dispatcher membacanya **setelah** commit. Tidak ada event yang terbit untuk transaksi yang gagal. |
| **SDD-EVT-05** | Nama event berformat `<Entitas><KataKerjaLampau>` dalam Bahasa Inggris: `LoanReturned`, `WorkOrderClosed`, `ApprovalDecided`. |
| **SDD-EVT-06** | *Payload* event hanya memuat **pengenal dan fakta minimum**, bukan seluruh entitas. Konsumen membaca ulang dari repository. |
| **SDD-EVT-07** | Setiap handler event **idempoten** dan aman diproses ulang; dispatcher menjamin *at-least-once*, bukan *exactly-once*. |
| **SDD-EVT-08** | Activity log **tidak** memakai event. Ia ditulis sinkron di dalam transaksi (`AL-01`, `AL-08`). |
| **SDD-EVT-09** | Urutan pemrosesan dijamin **per agregat**, tidak global. Outbox diproses berurutan berdasarkan `(aggregate_type, aggregate_id, id)`. |
| **SDD-EVT-10** | Dead letter **terlihat, tidak dapat diproses ulang dari antarmuka**. Jumlah dan daftar ringkasnya tampil sebagai kartu pada Dashboard Administrator (19.2) melalui `GET /dashboard` yang sudah ada — tanpa halaman baru, tanpa permission baru, tanpa endpoint tulis, dan tanpa aksi activity log baru. Pemrosesan ulang tetap berjalan lewat akses operasional dan runbook (`SDD-OBS-07`). Menutup `TBD-EVT-B` (keputusan pemilik produk, 25 Agustus 2026; `UXD-13`). |

---

## 3. Alasan

**SDD-EVT-01 — in-process.** Kafka/RabbitMQ ditolak karena alasan yang sama dengan penolakan microservices (`SDD-SYS-01`): tidak ada batas jaringan yang perlu diseberangi, dan menambah komponen yang harus dioperasikan sekolah. Redis sudah ada dan cukup sebagai antrean (`INF-03`).

**SDD-EVT-02 vs SDD-EVT-03 — pembagian yang menentukan.** Ini keputusan paling penting di berkas ini. Kriterianya:

> Bila kegagalan efek harus **membatalkan** pemicunya, efek itu sinkron. Bila tidak, ia asinkron.

| Efek | Sinkron / Asinkron | Alasan |
|---|---|---|
| Tiket kerusakan dari pengembalian rusak (`BR-032`) | **Sinkron** | Aset tidak boleh berstatus rusak tanpa tiketnya; keduanya satu kebenaran |
| Pembatalan slot saat aset masuk perbaikan (`BR-048`) | **Sinkron** | Bila gagal, aset "dalam perbaikan" masih bisa dipesan — pelanggaran `BR-047` |
| Penutupan tiket saat WO ditutup (`BR-050`) | **Sinkron** | Konsistensi status antar dua entitas |
| Pembentukan aset dari penerimaan (`BR-064`) | **Sinkron** | Penerimaan tanpa aset = data menggantung |
| Penerapan penyesuaian opname (`BR-057`) | **Sinkron** | Satu persetujuan = satu perubahan atomik |
| **Notifikasi in-app** | Asinkron | `NTF-04` melarang kegagalannya menggagalkan transaksi |
| **Push FCM** | Asinkron | `NFR-A-06` eksplisit |
| **Pemindaian AV** | Asinkron | Berdurasi panjang |
| **Ekspor & PDF** | Asinkron | `NFR-SC-05` |
| **Metrik & pemantauan** | Asinkron | Tidak pernah boleh menghambat |

**SDD-EVT-04 — outbox, bukan publikasi langsung.** Bila notifikasi dikirim tepat setelah `COMMIT` tanpa outbox, proses yang mati di antara keduanya menghilangkan notifikasi selamanya — dan `NT-01`/`NT-11` bertanda **wajib**. Outbox memindahkan jaminan ke basis data: tercatat bersama transaksi, atau tidak sama sekali.

**SDD-EVT-06 — payload minimum.** Payload gemuk membuat konsumen bekerja atas data basi dan mengunci bentuk entitas ke dalam kontrak event. Dengan hanya `{ loanId, assetIds }`, konsumen membaca kondisi terkini.

**SDD-EVT-08 — activity log sinkron.** `AL-01` mewajibkan **100%** operasi tulis tercatat. Melewatkan outbox berarti ada jendela di mana operasi sudah commit tetapi log belum ada. `AL-08` memang melarang kegagalan log menggagalkan transaksi — itu ditangani dengan menulis log di transaksi yang sama namun memperlakukan kegagalannya sebagai alarm, bukan rollback.

**SDD-EVT-10 — terlihat, tanpa tombol.** Kegagalan yang §6 takutkan berbunyi tepat: *efek hilang diam-diam*. Yang menyembuhkannya adalah visibilitas, dan visibilitas saja.

Tombol proses ulang menjawab pertanyaan yang berbeda — bukan "apakah ada yang gagal" melainkan "siapa yang memperbaikinya" — dan menjawabnya untuk pihak yang paling tidak siap menjawab. Event mencapai dead letter setelah lima percobaan gagal berturut-turut (§4.2); itu bukan gangguan sesaat melainkan cacat yang menuntut diagnosis. Administrator sistem ini adalah staf sekolah, bukan operator. Tombol yang menjalankan ulang sesuatu yang sebabnya belum diperbaiki akan gagal untuk keenam kalinya, dan yang tertinggal hanyalah keyakinan keliru bahwa tindakan sudah diambil.

Menunda antarmuka tulis juga menjaga ongkosnya tetap jujur. Halaman pemrosesan ulang menuntut permission baru, endpoint tulis baru, aksi activity log baru, dan satu halaman `P-xx` baru — seluruhnya **requirement baru di PRD**, bukan keputusan berkas ini. Kartu baca-saja tidak menuntut satu pun di antaranya: `GET /dashboard` (`M-15`) sudah mengembalikan muatan dashboard menurut role, sehingga yang bertambah hanyalah satu baris pada spesifikasi antarmuka 19.2.

Bila kelak pemrosesan ulang mandiri memang diperlukan, ia masuk lewat pintu yang benar — sebagai requirement PRD dengan permission-nya sendiri — bukan sebagai tombol yang tumbuh diam-diam di sisi kartu.

---

## 4. Rancangan

### 4.1 Skema outbox

```sql
CREATE TABLE event_outbox (
    id             bigserial PRIMARY KEY,
    event_name     text        NOT NULL,
    aggregate_type text        NOT NULL,
    aggregate_id   bigint      NOT NULL,
    payload        jsonb       NOT NULL,
    actor_id       bigint,
    request_id     text,
    occurred_at    timestamptz NOT NULL DEFAULT now(),
    processed_at   timestamptz,
    attempts       int         NOT NULL DEFAULT 0,
    last_error     text
);

CREATE INDEX event_outbox_pending
    ON event_outbox (aggregate_type, aggregate_id, id)
    WHERE processed_at IS NULL;                       -- SDD-EVT-09
```

### 4.2 Siklus penerbitan

```
service:
  BEGIN
    ... perubahan bisnis ...
    auditLogger.write(...)                 -- sinkron  (SDD-EVT-08)
    eventBus.publish(LoanReturned{...})    -- INSERT ke event_outbox
  COMMIT
                    ↓  (worker)
  dispatcher:
    ambil batch pending, urut per agregat
    untuk tiap event: jalankan seluruh handler terdaftar
      sukses  -> processed_at = now()
      gagal   -> attempts++, last_error, backoff eksponensial
      attempts >= 5 -> berhenti dicoba; baris menjadi dead letter + alarm (OBS-05)
```

**Dead letter adalah keadaan baris, bukan tempat lain.** Tidak ada tabel kedua dan tidak ada kolom penanda: sebuah event ber-*dead letter* bila `attempts >= 5 AND processed_at IS NULL`. Skema §4.1 sudah memuat seluruh yang dibutuhkan kartu 19.2 — `event_name` (jenis), `occurred_at` (waktu), `last_error` (galat terakhir) — dan metrik `outbox_dead_letter_count` (`SDD-15` §4.3) adalah `COUNT(*)` atas predikat yang sama. Dua akibatnya mengikat implementasi:

- Kueri pemungutan dispatcher **wajib** membawa `AND attempts < 5`, sebab tanpa itu baris dead letter dipungut ulang selamanya.
- Indeks `event_outbox_pending` (§4.1) berpredikat `processed_at IS NULL` saja, sehingga ia ikut memuat baris dead letter. Itu disengaja — jumlahnya kecil dan retensinya menjadi urusan `TBD-EVT-A`, bukan alasan menambah kolom.

Dispatcher memakai `SELECT ... FOR UPDATE SKIP LOCKED` sehingga aman meski suatu saat worker diskalakan. **Yang dikunci adalah agregatnya, bukan barisnya** — kunci diambil atas event pending tertua sebuah `(aggregate_type, aggregate_id)`, lalu seluruh event pending agregat itu diproses berurutan `id` di dalam kunci yang sama. Mengunci per baris akan melanggar `SDD-EVT-09` justru pada keadaan yang `SKIP LOCKED` ini siapkan: dispatcher kedua melewati baris yang sedang terkunci dan memungut event **berikutnya dari agregat yang sama**, sehingga urutannya terbalik.

Konsekuensinya, event yang gagal **menahan** event sesudahnya pada agregat yang sama sampai ia berhasil atau menjadi dead letter. Itu memang yang `SDD-EVT-09` minta: notifikasi `NT-14` yang mendahului `NT-15` pada satu peminjaman lebih baik tertunda daripada terbalik.

### 4.3 Katalog event

| Event | Diterbitkan oleh | Konsumen asinkron |
|---|---|---|
| `ReservationSubmitted` | M-07 / M-08 | Notifikasi `NT-01` |
| `ApprovalDecided` | M-10 | Notifikasi `NT-02`/`NT-03`/`NT-04`/`NT-05` |
| `ApprovalSlaBreached` | M-10 (job) | Notifikasi `NT-06`/`NT-07`/`NT-47` |
| `LoanCheckedOut` | M-09 | Notifikasi `NT-10` |
| `LoanReturned` | M-09 | Notifikasi `NT-14`, metrik utilisasi |
| `FineIssued` | M-09 | Notifikasi `NT-15` |
| `BorrowerBlocked` | M-09 | Notifikasi `NT-18` |
| `DamageReported` | M-11 | Notifikasi `NT-19`/`NT-20` |
| `WorkOrderAssigned` | M-12 | Notifikasi `NT-22` |
| `WorkOrderClosed` | M-12 | Notifikasi `NT-26` |
| `ReservationCancelledByMaintenance` | M-12 | Notifikasi `NT-27` |
| `AuditSessionSubmitted` | M-13 | Notifikasi `NT-31` |
| `AssetMarkedLost` | M-09 / M-13 | Notifikasi `NT-33` |
| `ProcurementDecided` | M-14 | Notifikasi `NT-35` |
| `AssetsGenerated` | M-14 | Notifikasi `NT-36` |
| `DisposalExecuted` | M-21 | Notifikasi `NT-45` |
| `MaterialIssued` | M-22 | Notifikasi `NT-51` |
| `MaterialStockLow` | M-22 | Notifikasi `NT-49` |
| `MaterialRequestReady` | M-22 | Notifikasi `NT-50` |
| `FileUploaded` | M-06 | Pemindaian AV, pembuatan thumbnail |
| `ExportRequested` | M-16 | Pembuatan berkas, notifikasi `NT-42` |

Kolom "konsumen asinkron" sengaja didominasi notifikasi — karena efek yang bukan notifikasi umumnya sinkron (SDD-EVT-02).

### 4.4 Contoh rantai: pengembalian aset rusak

```
POST /loans/{id}/checkin
BEGIN
  loan_items diperbarui (kondisi_akhir, foto_akhir)
  bila terlambat  -> fines diterbitkan per loan_item          BR-028a
  bila rusak      -> damage_reports dibuat                    BR-032  [SINKRON]
                     assets.status ditetapkan                 Bab 12.2
                     booking_slots mendatang -> Released      BR-048  [SINKRON]
  loans.status = Dikembalikan
  activity_log: LOAN_CHECKIN                                  AL-01   [SINKRON]
  outbox: LoanReturned, FineIssued?, DamageReported?
COMMIT
                 ↓ worker
  notifikasi NT-14, NT-15, NT-19  →  in-app + FCM
```

Empat efek berlabel `[SINKRON]` gagal bersama-sama bila salah satunya gagal — itulah yang diinginkan. Notifikasi tidak.

### 4.4a Contoh rantai: penyerahan bahan yang menembus stok minimum

Rantai ini dipilih sebagai contoh karena memuat keduanya sekaligus — efek yang **wajib atomik** dan efek yang **boleh tertunda** — pada satu operasi tulis yang sama.

```text
POST /material-requests/{id}/issue
│
├─ BEGIN ─────────────────────────────────────────────── sinkron, satu transaksi
│   1. SELECT … FOR UPDATE material_balances            (SDD-DB-14)
│   2. periksa kecukupan saldo                          (BR-083)  -> tolak bila kurang
│   3. periksa jumlah <= jumlah_disetujui                (BR-089)  -> tolak bila lebih
│   4. UPDATE material_balances                          (saldo baru)
│   5. INSERT material_transactions (saldo_sesudah)      (BR-081, BR-092)
│   6. UPDATE material_requests -> Diserahkan
│   7. INSERT activity_logs MATERIAL_ISSUED              (BR-071, AL-01)
│   8. INSERT event_outbox: MaterialIssued
│   9. evaluasi stok minimum atas SUM(saldo) bahan       (BR-085)
│      └─ bila menembus ambang: INSERT event_outbox: MaterialStockLow
└─ COMMIT ────────────────────────────────────────────────────────────────────
    │
    └─ worker (setelah commit)                            SDD-EVT-03, SDD-EVT-04
        ├─ MaterialIssued   -> NT-51 ke pemohon
        └─ MaterialStockLow -> NT-49 ke Petugas Sarpras + Administrator
```

**Yang membuat urutan ini mengikat.** Langkah 9 berada **di dalam** transaksi meskipun akibatnya hanya sebuah notifikasi: bila evaluasi stok minimum dilakukan setelah `COMMIT`, ia membaca saldo yang mungkin sudah diubah transaksi lain, dan peringatan bisa terbit dua kali atau tidak terbit sama sekali. Yang ditunda ke worker hanyalah **pengiriman**-nya, bukan **keputusan**-nya — persis pembagian yang `SDD-EVT-03` tetapkan.

Sebaliknya, langkah 4 dan 5 tidak boleh dipisah ke worker dengan alasan apa pun: saldo dan ledger yang tidak commit bersama berarti `material_balances` menyimpang dari kebenarannya (`SDD-DB-13`).

### 4.5 Idempotensi handler

| Handler | Kunci idempotensi |
|---|---|
| Notifikasi in-app | `(user_id, jenis, referensi_jenis, referensi_id, tanggal)` — juga memenuhi anti-spam 1×/hari (Bab 20.1) |
| Push FCM | Sama dengan di atas; pengiriman ulang ditoleransi |
| Pembuatan thumbnail | Keberadaan berkas turunan |
| Ekspor | `export_jobs.id` |

---

## 5. Konsekuensi

- Transaksi bisnis menjadi lebih panjang karena efek sinkron ikut di dalamnya. Batas atas yang diterima: `NFR-P-02` p95 ≤ 800 ms untuk API tulis; alur check-in adalah kandidat terberat dan wajib diukur pada uji beban.
- Outbox menjadi tabel bervolume menengah; perlu pembersihan berkala atas baris `processed_at` lama (mengikuti pola retensi `SDD-DB` §4.7).
- Karena jaminan *at-least-once*, pengguna berpotensi menerima notifikasi ganda bila handler gagal setelah mengirim. Diterima; dimitigasi kunci idempotensi §4.5.
- Setiap modul yang menerbitkan event wajib mendaftarkannya di katalog §4.3 — katalog ini menjadi bagian dari review.

---

## 6. Risiko Teknis

| Risiko | Dampak | Mitigasi |
|---|---|---|
| Dispatcher tertinggal (backlog) | Notifikasi terlambat melewati `NFR-P-12` (60 detik) | Metrik kedalaman outbox + alarm (`OBS-05`); dispatcher berjalan tiap beberapa detik |
| Handler lambat memblokir antrean per agregat | Event lain di agregat sama tertahan | Handler wajib ringan; kerja berat didorong ke antrean tersendiri |
| Transaksi sinkron terlalu panjang | Kunci baris tertahan, throughput turun | Efek sinkron dibatasi daftar di §3; penambahan memerlukan pembaruan berkas ini |
| Event dead-letter tidak diperhatikan | Efek hilang diam-diam | Alarm wajib (`OBS-05`) dengan penerima dan runbook (`SDD-OBS-07`); jumlah dan daftar ringkasnya tampil sebagai kartu Dashboard Administrator (`SDD-EVT-10`, 19.2). Rujukan `OBS-06` pada versi sebelumnya keliru — `OBS-06` adalah pemeriksaan `/health`, bukan permukaan dead letter |
| Payload minimum menyebabkan konsumen membaca data yang sudah berubah | Notifikasi menyebut kondisi terkini, bukan saat kejadian | Fakta yang penting bagi isi notifikasi (mis. jumlah hari terlambat) disertakan di payload |

---

## 7. Requirement Terkait

`BR-032` `BR-043` `BR-047` `BR-048` `BR-050` `BR-057` `BR-064` `BR-065` `BR-071` ·
`BR-081` `BR-083` `BR-085` `BR-089` `BR-092` `BR-094` ·
`AL-01` `AL-06` `AL-08` · `NT-01` … `NT-51` (penerbitan) · `NFR-A-06` `NFR-P-02` `NFR-P-12` `NFR-R-05` `NFR-R-08` `NFR-SC-05` ·
`NTF-04` · `JOB-03` `JOB-06` · `OBS-05` `OBS-06`

---

## 8. TBD

| ID | Pertanyaan |
|---|---|
| **TBD-EVT-A** | Retensi baris `event_outbox` yang sudah diproses. Berkas ini menyarankan mengikuti pola retensi umum, tetapi durasinya belum ditetapkan — berkaitan dengan **TBD-AVL-A**. |

**Tertutup 25 Agustus 2026:** `TBD-EVT-B` → `SDD-EVT-10`.
