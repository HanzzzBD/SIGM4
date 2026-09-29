# SDD-08 — Desain Notifikasi

**Area:** `NTF` · **Status:** Draft · **Basis:** [`m17-notifications.md`](../PRD/02-modules/m17-notifications.md), [`notifications-index.md`](../PRD/_generated/notifications-index.md)

---

## 1. Konteks

| Kelompok | ID |
|---|---|
| Katalog notifikasi | `NT-01` … `NT-51` (52 baris, dimiliki modul penerbit) |
| Transport & fanout | `NTF-01` … `NTF-05` |
| Requirement fungsional | `FR-17.1`, `FR-17.2`, `FR-17.3` |
| Latensi & keandalan | `NFR-P-12`, `NFR-A-06`, `NFR-R-08` |
| Ketentuan umum | Bab 20.1 (kanal, wajib, anti-spam, retensi) |
| Mobile | `MOB-DL-01` … `MOB-DL-05`, `MOB-SEC-05` |

---

## 2. Keputusan Desain

| ID | Keputusan |
|---|---|
| **SDD-NTF-01** | Transport web memakai **SSE** (`NTF-01`), dengan *fallback* polling 60 detik bila SSE gagal tiga kali berturut-turut. |
| **SDD-NTF-02** | Fanout antar-instance memakai **Redis Pub/Sub** dengan kanal per pengguna: `ntf:user:{id}` (`NTF-02`). |
| **SDD-NTF-03** | Notifikasi ditulis ke basis data **di dalam** transaksi bisnis lewat outbox ([SDD-07](07-event-flow.md)); pengiriman terjadi di worker setelah commit (`NTF-04`). |
| **SDD-NTF-04** | *Rendering* isi notifikasi memakai **templat berkunci kode NT**, dengan parameter terstruktur. Templat disimpan sebagai konstanta kode, bukan baris basis data. |
| **SDD-NTF-05** | Penghitung belum dibaca dihitung server dan **disiarkan bersama setiap event**, bukan dihitung ulang klien (`NTF-05`). |
| **SDD-NTF-06** | Preferensi pengguna (`FR-17.3`) diperiksa **saat pengiriman**, bukan saat penerbitan. Notifikasi wajib melewati pemeriksaan ini. |
| **SDD-NTF-07** | Anti-spam (maksimum 1×/hari per objek, Bab 20.1) ditegakkan **unique index** pada basis data, bukan pemeriksaan aplikasi. |
| **SDD-NTF-08** | Pengiriman FCM memakai **batch multicast** per pengguna, dengan pembersihan token tidak valid berdasarkan respons FCM (`FR-17.2 A2`). |
| **SDD-NTF-09** | Setiap notifikasi menyimpan `deep_link` sebagai **path relatif aplikasi** (mis. `/reservations/1234`), bukan URL absolut — agar berlaku sama di web dan mobile. |
| **SDD-NTF-10** | `notifications_archive` **dapat dibaca pemiliknya sendiri** lewat filter arsip pada endpoint daftar yang sudah ada (`FR-17.1 A2`), bukan hanya lewat pemeriksaan administratif. Karena itu tabel arsip memperoleh indeks `(user_id, created_at DESC)`. Tidak ada endpoint maupun permission baru — `notification.manage_own` tetap berlaku dan *scope* pemilik ditegakkan di repository (`SDD-AUTH-02`). Menutup `TBD-NTF-B` (keputusan pemilik produk, 25 Agustus 2026; `UXD-10`). |

---

## 3. Alasan

**SDD-NTF-01 — SSE, bukan WebSocket.** Arah komunikasi hanya server→klien. WebSocket menambah kompleksitas (heartbeat, reconnect manual, penanganan proxy) tanpa manfaat. SSE melakukan reconnect otomatis dan lolos melalui proxy HTTP biasa — relevan karena jaringan sekolah kerap memakai proxy (`FR-17.1` mengantisipasinya lewat fallback polling).

**SDD-NTF-02 — Pub/Sub, bukan penyimpanan bersama.** Dengan dua instance API (`SDD-SYS-01`), pengguna terhubung ke instance A sementara event lahir di instance B. Tanpa fanout, notifikasi tidak akan pernah sampai sampai pengguna memuat ulang. Pub/Sub adalah mekanisme paling sederhana yang menyelesaikannya; kehilangan pesan saat Redis putus dapat ditoleransi karena notifikasi **sudah tersimpan** di basis data dan klien memuatnya saat reconnect.

**SDD-NTF-04 — templat sebagai konstanta kode.** Menyimpan templat di basis data terdengar fleksibel, tetapi Bab 20.2 menetapkan isi tiap notifikasi sebagai bagian requirement. Mengizinkan penyuntingan runtime akan membuat isi menyimpang dari PRD tanpa jejak. Templat di kode berarti perubahannya melewati review dan versi.

**SDD-NTF-06 — preferensi diperiksa saat kirim.** Bila diperiksa saat penerbitan, perubahan preferensi tidak berlaku bagi event yang sudah antre. Memeriksanya saat kirim juga menempatkan aturan "notifikasi wajib tidak dapat dinonaktifkan" (`FR-17.3 A1`) pada satu titik.

**SDD-NTF-07 — anti-spam lewat constraint.** Pemeriksaan aplikasi ("apakah sudah ada notifikasi serupa hari ini?") punya jendela balapan saat job harian dan aksi pengguna bersamaan. Unique index menutupnya, dan konflik cukup ditelan sebagai "sudah pernah dikirim".

---

## 4. Rancangan

### 4.1 Skema

```sql
CREATE TABLE notifications (
    id             bigserial PRIMARY KEY,
    user_id        bigint      NOT NULL REFERENCES users(id),
    kode           text        NOT NULL,        -- 'NT-19'
    jenis          text        NOT NULL,        -- kelompok untuk preferensi
    judul          text        NOT NULL,
    isi            text        NOT NULL,        -- hasil render templat
    params         jsonb       NOT NULL,        -- parameter templat (audit & render ulang)
    referensi_jenis text,
    referensi_id   bigint,
    deep_link      text,                        -- SDD-NTF-09
    wajib          boolean     NOT NULL DEFAULT false,
    dibaca_pada    timestamptz,
    created_at     timestamptz NOT NULL DEFAULT now(),
    dedupe_key     text                          -- SDD-NTF-07
);

CREATE UNIQUE INDEX notifications_dedupe
    ON notifications (dedupe_key) WHERE dedupe_key IS NOT NULL;

CREATE INDEX notifications_inbox
    ON notifications (user_id, created_at DESC);
CREATE INDEX notifications_unread
    ON notifications (user_id) WHERE dibaca_pada IS NULL;

CREATE TABLE notification_deliveries (
    id              bigserial PRIMARY KEY,
    notification_id bigint NOT NULL REFERENCES notifications(id),
    kanal           notification_channel NOT NULL,  -- SDD-DB-02; Bab 11.3 "Kanal Notifikasi"
    status          delivery_status NOT NULL,   -- SDD-DB-02
    attempts        int    NOT NULL DEFAULT 0,
    last_error      text,
    sent_at         timestamptz
);
```

`dedupe_key` dibentuk `"{kode}:{user_id}:{referensi_jenis}:{referensi_id}:{YYYY-MM-DD}"` untuk notifikasi berulang harian (`NT-12`, `NT-13`, `NT-23`, `NT-06`), dan `"{kode}:{user_id}:evt:{event_id}"` (id baris `event_outbox`) untuk notifikasi **kejadian tunggal** — bukan `NULL`: dispatcher bersifat *at-least-once* (`SDD-EVT-07`, maks 5 percobaan), sehingga handler yang diulang setelah sebagian penerima tersimpan tidak boleh mengirim ganda. *(Keputusan 75 log phase-02; diterapkan `PR-02-25`.)*

### 4.2 Alur pengiriman

```
worker: outbox dispatcher menerima event  →  NotificationService.emit(kode, target, params)
   1. tentukan penerima (pengguna, atau seluruh pemegang role bila approver by-role)
   2. render templat[kode](params)                       SDD-NTF-04
   3. INSERT notifications (dedupe_key)  → konflik = lewati diam-diam
   4. untuk tiap kanal:
        wajib?  → selalu kirim
        selain itu → periksa preferensi pengguna         SDD-NTF-06
      in_app : PUBLISH ntf:user:{id}  {payload ringkas + unread_count}
      push   : bila ada device_tokens aktif → FCM multicast
   5. catat notification_deliveries
```

### 4.2a Konsumen penerbit (`PR-02-25`, keputusan 78)

| Aspek | Ketentuan |
|---|---|
| Tempat | Handler outbox di **worker**, satu per event, didaftarkan ke `EventHandlerRegistry`; pelaku `SYSTEM` (`SystemAuthContext`). Tiap handler menulis dalam transaksinya sendiri — notifikasi lahir hanya dari event yang sudah commit (`SDD-EVT-04`) |
| Idempotensi | `dedupe_key` kejadian tunggal = `{kode}:{user_id}:evt:{event_id}` (§4.1); handler yang diulang dispatcher (*at-least-once*, `SDD-EVT-07`) tidak menambah baris |
| Penerima | Dihitung **modul pemilik** lewat fungsi baca di `index.ts`-nya, dipanggil konsumen setelah commit — mis. M-10 `penerimaNotifikasi` memakai aturan pemutus sah `SDD-APR-16` yang sama dengan kotak masuk; M-17 tidak mengimpor internal modul lain (`SDD-SYS-03`) |
| Rincian pengajuan | `{nomor}`/`{objek}`/`{tanggal}`/`deep_link` notifikasi approval disediakan registri `penyediaRincian` per jenis pengajuan (m10, pola `penanganHasil`); jenis tanpa penyedia dirender generik `"{jenis} #{referensi_id}"` dengan `deep_link` ke linimasa (`FR-10.3`) |
| Templat | Konstanta per kode `NT-xx` (`SDD-NTF-04`) memuat `jenis` (§4.5), `wajib`, `judul`, dan fungsi render; kode yang dipakai konsumen tetapi tanpa templat gagal saat worker menyala |
| Di luar `PR-02-25` | Kanal SSE + daftar/tandai baca + arsip harian → `PR-02-26`; FCM + `device_tokens` + konsumen `SessionRevoked` → `PR-02-27`; preferensi → `PR-02-28`; konsumen M-01 (`NT-37`/`38`/`38a`/`39`/`39a`/`53`) + notifikasi pemakaian ulang refresh token → `PR-02-35` |

### 4.3 SSE

```
GET /notifications/stream          (Accept: text/event-stream)

  server:
    verifikasi sesi   → user_id dari token, BUKAN dari query (NTF-01)
    tolak bila sudah ada 2 koneksi aktif → putus yang terlama (NTF-03)
    SUBSCRIBE ntf:user:{id}
    kirim event awal: { unread_count }
    heartbeat  : komentar SSE tiap 25 detik (menahan timeout proxy)
    retry hint : 5000 ms
```

Klien menangani `Last-Event-ID` dengan memuat ulang daftar notifikasi lewat `GET /notifications` — bukan memutar ulang aliran, karena kebenaran ada di basis data.

### 4.4 Push FCM

| Aspek | Ketentuan |
|---|---|
| Pengiriman | `sendEachForMulticast` ke seluruh token aktif pengguna (`FR-17.2 A4`) |
| Token tidak valid | `messaging/registration-token-not-registered` → hapus baris `device_tokens` |
| Percobaan ulang | Maksimum 3 dengan backoff bertingkat (`FR-17.2 A3`) |
| Kegagalan total | Dicatat; **tidak** menggagalkan apa pun (`NFR-A-06`) |
| Payload | Ringan: `kode`, `judul`, `isi` ringkas, `deep_link`. Tidak memuat data pribadi selain yang sudah ada di judul/isi |
| Prioritas | `high` untuk notifikasi wajib (`NT-20`, `NT-11`, `NT-12`, `NT-01`), `normal` selainnya |

Payload push tidak memuat nilai finansial maupun identitas pengguna lain — konsisten dengan `BR-073` karena notifikasi tampil di layar terkunci.

### 4.5 Preferensi

```sql
CREATE TYPE notification_group AS ENUM (
    'PERSETUJUAN',
    'RESERVASI_PEMINJAMAN',
    'DENDA_KEWAJIBAN',
    'KERUSAKAN_PERAWATAN',
    'OPNAME_PENGADAAN',
    'AKUN_SISTEM'
);

CREATE TABLE notification_preferences (
    user_id bigint NOT NULL REFERENCES users(id),
    jenis   notification_group NOT NULL,
    in_app  boolean NOT NULL DEFAULT true,
    push    boolean NOT NULL DEFAULT true,
    PRIMARY KEY (user_id, jenis)
);
```

Ketiadaan baris berarti "aktif" — sehingga pengguna baru menerima segalanya tanpa perlu seed. Notifikasi bertanda wajib mengabaikan tabel ini seluruhnya (`FR-17.3 A1`).

**Enam kelompok** menutup `TBD-NTF-A`. Pengelompokan mengikuti domain proses yang dikenali pengguna, bukan batas modul — pengguna non-teknis tidak mengenal `M-13` (`UX-06`). Keputusan pemilik produk `UXD-05`; layar preferensinya dispesifikasikan [`UX/PAGE-SPECIFICATION.md §7.6.8`](../UX/PAGE-SPECIFICATION.md#768-p-78-preferensi-notifikasi).

| `jenis` | Kode `NT-xx` | Memuat notifikasi wajib? |
|---|---|---|
| `PERSETUJUAN` | `NT-01`…`NT-07`, `NT-47` | Ya — seluruhnya |
| `RESERVASI_PEMINJAMAN` | `NT-08`…`NT-14`, `NT-27`, `NT-46` | Sebagian |
| `DENDA_KEWAJIBAN` | `NT-15`…`NT-18` | Sebagian |
| `KERUSAKAN_PERAWATAN` | `NT-19`…`NT-26`, `NT-28`, `NT-29` | Sebagian |
| `OPNAME_PENGADAAN` | `NT-30`…`NT-36`, `NT-43`…`NT-45`, `NT-49`…`NT-51` | Sebagian |
| `AKUN_SISTEM` | `NT-37`…`NT-42`, `NT-38a`, `NT-48` | Sebagian |

Seluruh **52** kode `NT-xx` terpetakan; tidak boleh ada kode tanpa kelompok, sebab `SDD-NTF-06` memeriksa preferensi per kelompok saat pengiriman dan notifikasi tanpa kelompok tidak punya perilaku yang terdefinisi. `NT-49`…`NT-51` (bahan habis pakai, M-22) masuk `OPNAME_PENGADAAN` yang memang sudah memuat alur logistik — mengikuti `UXD-16` yang menolak Bahan menjadi grup tersendiri.

Templat `SDD-NTF-04` membawa `jenis` sebagai bagian definisi tiap kode `NT-xx`, sehingga pemetaan di atas hidup di kode bersama templatnya — bukan sebagai tabel terpisah yang dapat menyimpang.

> **Catatan lapisan.** Daftar enam kelompok kini dimiliki PRD Bab 11.3 "Kelompok Notifikasi" (`data-model.md`, keputusan 78 log phase-02); tabel di atas hanya memetakan kode `NT-xx` ke kelompok.

### 4.6 Arsip

Notifikasi > 90 hari dipindahkan job harian ke `notifications_archive` (`FR-17.1 A2`, Bab 11.4). Tabel arsip memakai skema identik **tanpa indeks *unread*** — status terbaca tidak lagi bermakna di arsip — sehingga tabel utama tetap ramping (`NFR-SC-06`).

Arsip dibaca pemiliknya sendiri (`SDD-NTF-10`):

```sql
CREATE INDEX notifications_archive_owner
    ON notifications_archive (user_id, created_at DESC);
```

Endpoint daftar notifikasi menerima penanda arsip sebagai **parameter kueri**, bukan endpoint kedua; permintaan tanpa penanda itu tidak pernah menyentuh tabel arsip. Kedua tabel tidak pernah di-`UNION` dalam satu respons — filter arsip adalah pilihan yang saling meniadakan, sepola dengan tab pada P-13.

---

## 5. Konsekuensi

- Setiap kode `NT-xx` baru memerlukan templat di kode; kode tanpa templat gagal saat *bootstrap* (pola yang sama dengan permission pada `SDD-AUTH-01`).
- Karena isi notifikasi dirender saat penerbitan dan disimpan, perubahan templat **tidak** mengubah notifikasi lama. Ini disengaja — riwayat mencerminkan apa yang benar-benar dibaca pengguna. `params` disimpan agar render ulang tetap mungkin bila diperlukan.
- Batas 2 koneksi SSE per pengguna berarti membuka aplikasi di banyak tab akan memutus tab terlama. Perlu ditangani UI ([SDD-11](11-frontend-architecture.md)) dengan pesan yang jelas, bukan diam.
- Redis menjadi jalur kritis untuk notifikasi *real-time* (bukan untuk kebenarannya). Bila Redis mati, notifikasi tetap tersimpan dan muncul saat pengguna memuat ulang.

---

## 6. Risiko Teknis

| Risiko | Dampak | Mitigasi |
|---|---|---|
| Proxy sekolah memutus koneksi SSE panjang | Notifikasi real-time mati diam-diam | Heartbeat 25 detik; deteksi kegagalan → fallback polling (`SDD-NTF-01`) |
| Approver by-role menghasilkan banyak penerima | Ledakan baris notifikasi | Jumlah pemegang role kecil (≤ puluhan); dedupe key mencegah pengulangan harian |
| Kuota/kegagalan FCM | Push tidak sampai | In-app tetap jalur utama (`FR-17.2 A1`); kegagalan dicatat, bukan digagalkan |
| Backlog outbox membuat notifikasi > 60 detik | `NFR-P-12` tidak terpenuhi | Alarm kedalaman antrean; dispatcher berinterval detik |
| Templat memuat data yang tidak boleh dilihat penerima | Kebocoran lewat notifikasi | Templat hanya menerima parameter yang sudah disaring; ditinjau saat review bersama `SEC-T-02` |

---

## 7. Requirement Terkait

`FR-17.1` `FR-17.2` `FR-17.3` · `NT-01` … `NT-51` · `NTF-01` … `NTF-05` · Bab 20.1 ·
`NFR-P-12` `NFR-A-06` `NFR-R-08` `NFR-SC-06` · `BR-073` · `MOB-DL-01` … `MOB-DL-05` `MOB-SEC-05` ·
`OBS-05` · Bab 11.4 (retensi)

---

## 8. TBD

| ID | Pertanyaan |
|---|---|


**Tertutup**

| ID | Ditutup | Keputusan |
|---|---|---|
| **TBD-NTF-A** | 22 Agustus 2026 | Enam kelompok domain proses — lihat §4.5 (`UXD-05`) |
| **TBD-NTF-B** | 25 Agustus 2026 | Arsip dapat dibaca pemiliknya lewat filter — lihat §4.6 (`SDD-NTF-10`, `UXD-10`) |