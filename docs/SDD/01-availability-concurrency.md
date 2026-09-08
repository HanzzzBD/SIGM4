# SDD-01 — Desain Ketersediaan & Konkurensi

**Area:** `AVL` · **Status:** Draft untuk review · **Basis:** [`../03-architecture/availability-concurrency.md`](../PRD/03-architecture/availability-concurrency.md)

---

## 1. Konteks

Rancangan ini melayani requirement berikut. Teksnya **tidak disalin** ke sini — rujuk ID-nya.

| Kelompok | ID |
|---|---|
| Model ketersediaan | `BR-005`, `BR-005a`, `BR-005b`, `BR-017`, `BR-023b`, `BR-023c` |
| Integritas konkurensi | `CI-01` … `CI-05` |
| Performa ketersediaan | `AV-01` … `AV-05`, `NFR-P-05` |
| Idempotensi | `ID-01` … `ID-05`, `NFR-R-06` |
| Penomoran dokumen | `SEQ-01` … `SEQ-04` |
| Pekerjaan terjadwal | `JOB-01` … `JOB-06`, `NFR-SC-01` |
| Requirement fungsional utama | `FR-07.1`, `FR-07.2`, `FR-07.5`, `FR-08.1`, `FR-08.2`, `FR-09.1`, `FR-09.2`, `FR-09.5` |
| Risiko yang dimitigasi | `RS-11` (race condition), `SC-05` (nol double-booking) |

Basis teknologi yang sudah ditetapkan dan tidak dibahas ulang: PostgreSQL 15+ (`INF-01`), Redis 7+ (`INF-03`), worker terpisah dari API (`JOB-01`).

---

## 2. Keputusan Desain

| ID | Keputusan |
|---|---|
| **SDD-AVL-01** | `booking_slots` adalah **satu tabel tunggal** untuk ruangan maupun unit aset, dengan kolom polimorfik `resource_type` + `resource_id`. Bukan dua tabel terpisah. |
| **SDD-AVL-02** | Rentang waktu disimpan sebagai `tstzrange` **half-open** `[mulai, selesai)`. Nilai literal yang ditulis aplikasi selalu `'[)'`. |
| **SDD-AVL-03** | Larangan irisan ditegakkan oleh **exclusion constraint GiST berpredikat**, bukan oleh pemeriksaan aplikasi. Aplikasi hanya menerjemahkan galatnya. |
| **SDD-AVL-04** | `resource_id` **tidak** memiliil foreign key (karena polimorfik). Integritas dijaga oleh *trigger* validasi `AFTER INSERT OR UPDATE` dan oleh satu-satunya jalur tulis di service layer. |
| **SDD-AVL-05** | Alokasi unit otomatis memakai `SELECT … FOR UPDATE SKIP LOCKED`; pemilihan unit manual oleh Petugas memakai `FOR UPDATE NOWAIT` agar konflik langsung terlihat, bukan menunggu. |
| **SDD-AVL-06** | Penguncian baris **selalu** terurut menaik berdasarkan `assets.id`. Diterapkan sebagai `ORDER BY id` pada kueri pengunci, bukan sebagai konvensi lisan. |
| **SDD-AVL-07** | `SQLSTATE 23P01` (*exclusion_violation*) dipetakan ke `409 RESERVATION_CONFLICT` / `409 ASSET_NOT_AVAILABLE` oleh *error mapper* terpusat. Tidak ada `try/catch` ad hoc di controller. |
| **SDD-AVL-08** | Idempotensi memakai tabel `idempotency_keys` + *advisory lock* PostgreSQL untuk mendeteksi permintaan yang sedang berjalan. Bukan Redis, agar berada dalam transaksi yang sama dengan efeknya. |
| **SDD-AVL-09** | Penomoran dokumen memakai tabel `document_counters` dengan `INSERT … ON CONFLICT DO UPDATE … RETURNING`, bukan `CREATE SEQUENCE` dinamis per tahun. |
| **SDD-AVL-10** | Penjadwal memakai **BullMQ repeatable job** di atas Redis. Kunci terdistribusi diperoleh dari BullMQ itu sendiri (satu job id per periode), bukan dari `SET NX` manual. |
| **SDD-AVL-11** | `assets.status` bersifat **turunan**. Hanya empat penulis yang diizinkan: `LoanService`, `MaintenanceService`, `AssetService`, dan job `slot-activation`. Ditegakkan lewat *code ownership* + uji arsitektur. |
| **SDD-AVL-12** | Reservasi berulang menghasilkan **satu** baris induk `origin='reservation'` tanpa rentang, dan N baris turunan ber-`parent_slot_id`. Induk tidak ikut exclusion constraint. |
| **SDD-AVL-13** | Slot `Released` **tidak dihapus**. Dipindahkan dari partisi aktif melalui kebijakan arsip (lihat TBD-AVL-A). |
| **SDD-AVL-14** | **Bahan tidak memakai `booking_slots`.** Bahan tidak dapat direservasi maupun dipinjam (`BR-087`), sehingga tidak memiliki dimensi waktu untuk dikunci. Konkurensinya diselesaikan dengan row lock atas `material_balances` (`SDD-DB-14`), bukan exclusion constraint. |

---

## 3. Alasan

**SDD-AVL-01 — satu tabel, bukan dua.** Alternatif `room_bookings` + `asset_bookings` ditolak karena `FR-07.2` mengizinkan satu pengajuan memuat ruangan *dan* aset (`BR-024b`, *all-or-nothing*). Dengan dua tabel, transaksi harus mengunci dua tabel sekaligus dan urutan lock menjadi sumber deadlock baru. Satu tabel juga membuat blokade pemeliharaan (`origin='maintenance'`) dan jadwal tetap (`origin='fixed_schedule'`, `FR-07.5`) memakai mekanisme yang sama persis — tidak ada jalur khusus yang bisa lupa diperiksa.

**SDD-AVL-14 — bahan berada di luar model ini seluruhnya.** Godaan yang wajar adalah memperluas `booking_slots` dengan `resource_type='material'` demi keseragaman. Itu keliru: slot menjawab pertanyaan "apakah sumber daya ini bebas pada rentang waktu tertentu", sedangkan bahan menjawab "apakah jumlahnya cukup sekarang". Bahan yang sudah diserahkan tidak pernah kembali (`BR-087`), sehingga tidak ada rentang untuk dibebaskan dan tidak ada irisan untuk ditolak. Memaksakannya ke `booking_slots` akan menambah `resource_type` yang seluruh kolom waktunya `NULL` — dan melumpuhkan exclusion constraint yang justru menjadi alasan tabel itu ada.

Harga yang dibayar: kehilangan foreign key pada `resource_id`. Dimitigasi oleh SDD-AVL-04.

**SDD-AVL-02 — half-open.** Kegiatan 08:00–10:00 dan 10:00–12:00 harus dianggap **tidak** bentrok. Dengan rentang tertutup `[]`, keduanya beririsan di titik 10:00 dan sistem akan menolak pemesanan yang sah. Ini kesalahan klasik yang baru terlihat saat UAT.

**SDD-AVL-03 — constraint, bukan validasi aplikasi.** `CI-01` mensyaratkannya, dan `RS-11` menyebut race condition sebagai risiko berdampak tinggi. Validasi aplikasi (`SELECT` lalu `INSERT`) selalu punya jendela antara pembacaan dan penulisan, seberapa pun rapatnya. Constraint menutup jendela itu di lapisan yang tidak bisa dilewati jalur kode manapun — termasuk skrip migrasi dan perbaikan data manual.

**SDD-AVL-05 — `SKIP LOCKED` untuk alokasi otomatis.** Ketika 50 permintaan memperebutkan 10 unit setara (`CC-02`), `FOR UPDATE` biasa membuat 49 permintaan antre di belakang satu sama lain lalu sebagian gagal — lambat dan boros koneksi. `SKIP LOCKED` membuat tiap permintaan langsung mengambil unit bebas berikutnya, sehingga 10 permintaan pertama sukses paralel. Untuk pemilihan manual, perilaku itu justru salah: petugas memilih unit **tertentu**, jadi melewatinya diam-diam akan membingungkan. Karena itu `NOWAIT` — gagal cepat dengan pesan jelas.

**SDD-AVL-08 — idempotensi di PostgreSQL, bukan Redis.** Kunci idempotensi harus commit bersama efek bisnisnya. Bila disimpan di Redis dan transaksi DB gagal setelah kunci ditulis, permintaan ulang akan menerima "sudah diproses" padahal tidak ada apa-apa yang tersimpan. Menyimpannya di tabel yang sama dengan transaksi menghilangkan kelas bug ini seluruhnya.

**SDD-AVL-09 — tabel penghitung, bukan sequence per tahun.** `SEQ-01` mereset nomor tiap tahun. Membuat `CREATE SEQUENCE` baru tiap tahun berarti DDL saat runtime — memerlukan hak yang justru dilarang `SEC-CFG-03`. Tabel penghitung tidak butuh DDL, tetap *gap-tolerant* (`SEQ-03`), dan aman terhadap konkurensi karena `ON CONFLICT DO UPDATE` mengunci baris.

**SDD-AVL-10 — BullMQ, bukan `SET NX` manual.** `JOB-02` menuntut distributed lock. BullMQ repeatable job sudah menjamin satu eksekusi per periode lintas worker, plus percobaan ulang dan riwayat yang `JOB-06` butuhkan. Menulis lock sendiri berarti menulis ulang komponen yang sudah teruji, termasuk kasus tepi lock kedaluwarsa saat job masih berjalan.

---

## 4. Rancangan

### 4.1 Skema fisik

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Nilai booking_status memakai kode huruf besar (SDD-DB-02); nama keadaan pada
-- §4.3 dan pada prosa dokumen lain adalah label, bukan nilai kolom. booking_resource
-- dan booking_origin sengaja TIDAK ikut: glossary PRD memakukan resource_type='asset'
-- sebagai kontrak teknis yang tidak berubah.

CREATE TYPE booking_resource AS ENUM ('room', 'asset');
CREATE TYPE booking_status   AS ENUM ('TENTATIVE', 'CONFIRMED', 'ACTIVE', 'RELEASED');
CREATE TYPE booking_origin   AS ENUM ('reservation', 'loan', 'maintenance',
                                      'fixed_schedule', 'manual_block');

CREATE TABLE booking_slots (
    id              bigserial PRIMARY KEY,
    resource_type   booking_resource NOT NULL,
    resource_id     bigint           NOT NULL,
    slot_range      tstzrange,                    -- NULL hanya untuk baris induk berulang
    status          booking_status   NOT NULL,
    origin          booking_origin   NOT NULL,
    reservation_id  bigint REFERENCES reservations(id),
    loan_id         bigint REFERENCES loans(id),
    work_order_id   bigint REFERENCES work_orders(id),
    parent_slot_id  bigint REFERENCES booking_slots(id) ON DELETE CASCADE,
    expires_at      timestamptz,                  -- TTL slot Tentative (BR-023b)
    created_by      bigint REFERENCES users(id),
    created_at      timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT slot_range_required
        CHECK (parent_slot_id IS NOT NULL OR slot_range IS NOT NULL OR status = 'RELEASED'),
    CONSTRAINT slot_range_bounds
        CHECK (slot_range IS NULL OR (lower_inc(slot_range) AND NOT upper_inc(slot_range))),
    CONSTRAINT tentative_needs_ttl
        CHECK (status <> 'TENTATIVE' OR expires_at IS NOT NULL)
);

-- CI-01: penegak nol double-booking
ALTER TABLE booking_slots
    ADD CONSTRAINT booking_slots_no_overlap
    EXCLUDE USING gist (
        resource_type WITH =,
        resource_id   WITH =,
        slot_range    WITH &&
    ) WHERE (status IN ('TENTATIVE','CONFIRMED','ACTIVE') AND slot_range IS NOT NULL);

-- AV-01
CREATE INDEX booking_slots_lookup
    ON booking_slots USING gist (resource_type, resource_id, slot_range)
    WHERE status IN ('TENTATIVE','CONFIRMED','ACTIVE');

CREATE INDEX booking_slots_expiry
    ON booking_slots (expires_at) WHERE status = 'TENTATIVE';

-- AV-02
CREATE INDEX assets_availability
    ON assets (category_id, status, kondisi)
    WHERE dapat_dipinjam AND NOT dihapuskan;
```

Trigger validasi polimorfik (SDD-AVL-04):

```sql
CREATE FUNCTION check_booking_resource() RETURNS trigger AS $$
BEGIN
  IF NEW.resource_type = 'room' THEN
     PERFORM 1 FROM rooms  WHERE id = NEW.resource_id;
  ELSE
     PERFORM 1 FROM assets WHERE id = NEW.resource_id;
  END IF;
  IF NOT FOUND THEN
     RAISE foreign_key_violation
       USING MESSAGE = format('resource %s/%s tidak ditemukan',
                              NEW.resource_type, NEW.resource_id);
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER booking_slots_resource_fk
  BEFORE INSERT OR UPDATE OF resource_type, resource_id ON booking_slots
  FOR EACH ROW EXECUTE FUNCTION check_booking_resource();
```

### 4.2 Algoritma alokasi unit (`FR-08.2`)

```
allocateUnits(categoryId, qty, range, userCtx, preferredIds?):
  BEGIN                                             -- READ COMMITTED (CI-03)

  1. assertNotBlocked(userCtx)                      -- BR-030
  2. assertPendingQuota(userCtx)                    -- BR-023a
  3. assertWithinHorizon(range)                     -- BR-023c

  4. candidates :=
       SELECT a.id FROM assets a
        WHERE a.category_id = :categoryId
          AND a.dapat_dipinjam AND NOT a.dihapuskan
          AND a.kondisi IN ('BAIK','RUSAK_RINGAN')
          AND a.status NOT IN ('DALAM_PERBAIKAN','TIDAK_TERSEDIA')
          AND (userCtx.role <> 'SISWA' OR a.boleh_dipinjam_siswa)
          AND NOT EXISTS (                          -- AV-01 memakai indeks GiST
                SELECT 1 FROM booking_slots s
                 WHERE s.resource_type = 'asset' AND s.resource_id = a.id
                   AND s.status IN ('TENTATIVE','CONFIRMED','ACTIVE')
                   AND s.slot_range && :range)
        ORDER BY a.id                               -- CI-02: urutan lock
        LIMIT :qty
        FOR UPDATE OF a SKIP LOCKED                 -- SDD-AVL-05

  5. IF count(candidates) < qty -> ROLLBACK, 409 ASSET_NOT_AVAILABLE
  6. INSERT booking_slots (status='TENTATIVE', expires_at=ttl()) untuk tiap kandidat
       -> exclusion constraint adalah pemutus akhir (CI-01)
  7. INSERT reservation + reservation_items
  8. buildApprovalInstance()                        -- lihat SDD-02
  COMMIT
```

Langkah 4 sengaja **tidak** dipisah menjadi "cek dulu lalu insert". Pemeriksaan `NOT EXISTS` hanya penyaring untuk mengurangi tabrakan; yang menjamin kebenaran adalah constraint di langkah 6.

### 4.3 Transisi status slot

| Peristiwa | Transisi | Penulis |
|---|---|---|
| Pengajuan dibuat | → `Tentative` (+`expires_at`) | `ReservationService` |
| Approval level terakhir disetujui | `Tentative` → `Confirmed`, `expires_at = NULL` | `ApprovalService` |
| Serah terima | `Confirmed` → `Active` | `LoanService` |
| Pengembalian | `Active` → `Released` | `LoanService` |
| Ditolak / dibatalkan / TTL habis | * → `Released` | service terkait / job |
| Aset masuk perbaikan | `Tentative`/`Confirmed` → `Released` | `MaintenanceService` |

### 4.4 Idempotensi

```sql
CREATE TABLE idempotency_keys (
    key           uuid PRIMARY KEY,
    endpoint      text        NOT NULL,
    request_hash  text        NOT NULL,
    status_code   int,
    response_body jsonb,
    created_at    timestamptz NOT NULL DEFAULT now(),
    expires_at    timestamptz NOT NULL DEFAULT now() + interval '24 hours'
);
CREATE INDEX ON idempotency_keys (expires_at);
```

Alur (`ID-01` … `ID-05`):

```
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtext(key))
                           -> 409 REQUEST_IN_PROGRESS        (ID-05)
  row := SELECT * FROM idempotency_keys WHERE key = :key
  IF row IS NULL           -> INSERT ; jalankan bisnis ;
                              UPDATE hasil ; COMMIT ; 201
  IF row.request_hash <> h -> 409 IDEMPOTENCY_KEY_REUSED     (ID-04)
  ELSE                     -> kembalikan response tersimpan  (ID-03)
```

Advisory lock bersifat transaksional, jadi lepas otomatis saat commit/rollback — tidak ada kunci menggantung bila proses mati.

**Kuncinya `try`, bukan menunggu — dan itu yang membuat `ID-05` ada.** Versi pertama alur ini memakai `pg_advisory_xact_lock` yang memblokir, lalu memeriksa `status_code NULL` untuk mendeteksi permintaan yang sedang berjalan. Pemeriksaan itu **tidak dapat menyala**: `SDD-AVL-08` menempatkan kunci dan efeknya pada satu transaksi, sehingga baris ber-`status_code NULL` tidak pernah terlihat sesi lain — permintaan kedua menunggu sampai yang pertama commit, lalu melihat baris yang sudah selesai. `ID-05` karena itu tidak akan pernah tercapai, dan permintaan kedua menahan satu koneksi pool selama bisnis berjalan. Dengan `pg_try_advisory_xact_lock`, kegagalan mengambil kunci **itu sendiri** adalah bukti ada permintaan berkunci sama yang sedang berjalan — dijawab seketika, tanpa menahan koneksi. Kolom `status_code` tetap ada karena `ID-02` mewajibkannya disimpan, bukan sebagai penanda *in-flight*. Dikoreksi 7 September 2026 (keputusan pemilik produk, `PR-00-10`).

### 4.5 Penomoran dokumen

```sql
CREATE TABLE document_counters (
    prefix text NOT NULL,
    year   int  NOT NULL,
    value  bigint NOT NULL DEFAULT 0,
    PRIMARY KEY (prefix, year)
);

-- SEQ-02, aman konkurensi, gap-tolerant (SEQ-03)
INSERT INTO document_counters (prefix, year, value) VALUES ($1, $2, 1)
ON CONFLICT (prefix, year) DO UPDATE SET value = document_counters.value + 1
RETURNING value;
```

Format dirakit aplikasi sesuai `SEQ-01`, divalidasi terhadap regex `SEQ-04` pada uji.

### 4.6 Pekerjaan terjadwal

| Job | Jadwal (UTC, lihat `JOB-04`) | Idempoten karena |
|---|---|---|
| `slot-activation` | tiap 5 menit | `UPDATE … WHERE status <> target` |
| `tentative-slot-expiry` | tiap 15 menit | `WHERE status='TENTATIVE' AND expires_at < now()` |
| `loan-overdue` | 17:05 (= 00:05 WIB) | denda diperiksa unik per `(loan_item_id, tanggal)` |
| `reservation-expiry` | 16:00 (= 23:00 WIB) | transisi hanya dari `Confirmed` |

Setiap job menulis entri `activity_log` berpelaku `SYSTEM` (`JOB-05`, `AL-06`).

---

## 5. Konsekuensi

- **Modul terdampak:** M-04 (status turunan), M-07, M-08, M-09, M-12, M-21 — semuanya menulis atau membaca `booking_slots`. Tidak ada modul yang boleh menulis `assets.status` di luar empat penulis pada SDD-AVL-11.
- **Batasan yang lahir:** MySQL menjadi mustahil (tidak punya exclusion constraint), memperkuat `INF-01`. Migrasi basis data di kemudian hari berarti menulis ulang seluruh jaminan konkurensi.
- **Kewajiban pengujian:** `CC-01` … `CC-07` pada [`test-strategy.md`](../PRD/06-quality/test-strategy.md) menjadi wajib lolos sebelum modul reservasi dianggap selesai. Uji harus dijalankan terhadap PostgreSQL nyata, bukan basis data in-memory.
- **Beban operasional:** `booking_slots` tumbuh monoton karena `Released` dipertahankan. Perlu kebijakan arsip (TBD-AVL-A).

---

## 6. Risiko Teknis

| Risiko | Dampak | Mitigasi |
|---|---|---|
| Kesalahan menulis rentang `[]` alih-alih `[)` | Slot berdempet ditolak keliru | `CHECK slot_range_bounds` menolaknya di lapisan DB |
| Beban tulis `booking_slots` pada jam sibuk | Latensi pengajuan naik | Indeks berpredikat; slot `Released` dikeluarkan dari indeks aktif |
| Trigger polimorfik menambah biaya tulis | Throughput turun | Trigger hanya `PERFORM 1` beririndeks PK; diukur pada uji beban `NFR-P-09` |
| `SKIP LOCKED` melewati unit yang sebenarnya bebas | Pemohon menerima "habis" padahal ada | Hanya untuk alokasi otomatis; pemohon dapat memilih manual, dan pengujian `CC-02` memverifikasi jumlah sukses = jumlah unit |
| Advisory lock bertabrakan karena `hashtext` | Dua kunci berbeda ter-serialisasi | Dampaknya hanya pelambatan, bukan kesalahan; ruang hash 2³² memadai untuk volume ini |
| Jam WIB↔UTC salah konversi pada job | Denda/tenggat bergeser sehari | Job dijadwalkan UTC eksplisit; uji memakai *time hook* (`TD-04`) |

---

## 7. Requirement Terkait

`BR-005` `BR-005a` `BR-005b` `BR-017` `BR-020` `BR-023` `BR-023a` `BR-023b` `BR-023c` `BR-024a` `BR-024b` `BR-030` ·
`CI-01` `CI-02` `CI-03` `CI-04` `CI-05` · `AV-01` … `AV-05` · `ID-01` … `ID-05` · `SEQ-01` … `SEQ-04` · `JOB-01` … `JOB-06` ·
`FR-07.1` `FR-07.2` `FR-07.5` `FR-08.1` `FR-08.2` `FR-09.1` `FR-09.2` `FR-09.5` ·
`NFR-P-05` `NFR-P-09` `NFR-R-05` `NFR-R-06` `NFR-R-07` `NFR-SC-01` · `SC-05` · `RS-11` · `CC-01` … `CC-07`

---

## 8. TBD — Menunggu Keputusan

Tidak diisi sendiri. Lihat ringkasan di [`TBD-REGISTER.md`](TBD-REGISTER.md).

| ID | Pertanyaan |
|---|---|
| **TBD-AVL-A** | Kebijakan arsip/partisi `booking_slots`. Slot `Released` dipertahankan (`BR-005`-turunan, analitik utilisasi `SC-05`) sehingga tabel tumbuh monoton. Perlu ditetapkan: partisi per tahun, pemindahan ke tabel arsip, atau dibiarkan hingga volume nyata terukur. |
| **TBD-AVL-C** | Ukuran connection pool per instance API dan worker. Tidak ada angka di PRD; bergantung pada batas koneksi PostgreSQL yang disediakan penyedia. |
| **TBD-AVL-D** | TTL cache hasil ketersediaan. `AV-04` menetapkan batas atas 30 detik, tetapi nilai operasionalnya (0 = tanpa cache, atau 10–30 detik) belum ditetapkan. |

**Tertutup 25 Agustus 2026 — `TBD-AVL-B`.** Endpoint reservasi **tetap satu rumpun `/reservations`**, dimiliki `M-07` dan dirujuk `M-08` (`UXD-15`, keputusan pemilik produk). Pemisahan `/room-reservations` + `/item-reservations` ditolak karena `BR-017` … `BR-025` berlaku identik bagi kedua jenis: memecah permukaan API di atas perilaku yang sama menghasilkan dua kontrak yang wajib dijaga seragam selamanya, tanpa satu pun requirement yang meminta perbedaannya. Perbedaan jenis diserap **di dalam** muatan permintaan, sebagaimana `SDD-AVL-04` sudah memperlakukan `booking_slots` secara polimorfik. Katalog endpoint tidak berubah; `PR-03-08` dan `PR-04-01` berjalan sesuai rencana.
