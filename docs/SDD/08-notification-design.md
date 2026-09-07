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
| **SDD-NTF-10** | `notifications_archive` **dapat dibaca pemiliknya sendiri** lewat filter arsip pada endpoint daftar yang sudah ada (`FR-17.1 A2`), bukan hanya lewat pemeriksaan administratif. Karena itu tabel arsip memperoleh indeks `(user_id, dibuat_pada DESC)`. Tidak ada endpoint maupun permission baru — `notification.manage_own` tetap berlaku dan *scope* pemilik ditegakkan di repository (`SDD-AUTH-02`). Menutup `TBD-NTF-B` (keputusan pemilik produk, 25 Agustus 2026; `UXD-10`). |

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
    dibuat_pada    timestamptz NOT NULL DEFAULT now(),
    dedupe_key     text                          -- SDD-NTF-07
);

CREATE UNIQUE INDEX notifications_dedupe
    ON notifications (dedupe_key) WHERE dedupe_key IS NOT NULL;

CREATE INDEX notifications_inbox
    ON notifications (user_id, dibuat_pada DESC);
CREATE INDEX notifications_unread
    ON notifications (user_id) WHERE dibaca_pada IS NULL;

CREATE TABLE notification_deliveries (
    id              bigserial PRIMARY KEY,
    notification_id bigint NOT NULL REFERENCES notifications(id),
    kanal           notification_channel NOT NULL,  -- SDD-DB-02; Bab 11.3 "Kanal Notifikasi"
    status          text   NOT NULL,            -- 'pending'|'sent'|'failed'|'skipped'
    attempts        int    NOT NULL DEFAULT 0,
    last_error      text,
    sent_at         timestamptz
);
```

`dedupe_key` dibentuk `"{kode}:{user_id}:{referensi_jenis}:{referensi_id}:{YYYY-MM-DD}"` untuk notifikasi berulang harian (`NT-12`, `NT-13`, `NT-23`), dan `NULL` untuk notifikasi kejadian tunggal.

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
    'persetujuan',
    'reservasi_peminjaman',
    'denda_kewajiban',
    'kerusakan_perawatan',
    'opname_pengadaan',
    'akun_sistem'
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
| `persetujuan` | `NT-01`…`NT-07`, `NT-47` | Ya — seluruhnya |
| `reservasi_peminjaman` | `NT-08`…`NT-14`, `NT-27`, `NT-46` | Sebagian |
| `denda_kewajiban` | `NT-15`…`NT-18` | Sebagian |
| `kerusakan_perawatan` | `NT-19`…`NT-26`, `NT-28`, `NT-29` | Sebagian |
| `opname_pengadaan` | `NT-30`…`NT-36`, `NT-43`…`NT-45` | Sebagian |
| `akun_sistem` | `NT-37`…`NT-42`, `NT-48` | Sebagian |

Templat `SDD-NTF-04` membawa `jenis` sebagai bagian definisi tiap kode `NT-xx`, sehingga pemetaan di atas hidup di kode bersama templatnya — bukan sebagai tabel terpisah yang dapat menyimpang.

> **Catatan lapisan.** Daftar kelompok ini bersifat kebijakan produk dan idealnya bermukim di PRD `M-17`. Selama belum dinaikkan ke sana, berkas inilah pemiliknya; bila kemudian ditambahkan ke `m17-notifications.md`, baris di atas wajib diganti rujukan ID.

### 4.6 Arsip

Notifikasi > 90 hari dipindahkan job harian ke `notifications_archive` (`FR-17.1 A2`, Bab 11.4). Tabel arsip memakai skema identik **tanpa indeks *unread*** — status terbaca tidak lagi bermakna di arsip — sehingga tabel utama tetap ramping (`NFR-SC-06`).

Arsip dibaca pemiliknya sendiri (`SDD-NTF-10`):

```sql
CREATE INDEX notifications_archive_owner
    ON notifications_archive (user_id, dibuat_pada DESC);
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