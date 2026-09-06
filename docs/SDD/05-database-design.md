# SDD-05 — Desain Basis Data

**Area:** `DB` · **Status:** Draft · **Basis:** [`data-model.md`](../PRD/03-architecture/data-model.md)

---

## 1. Konteks

| Kelompok | ID |
|---|---|
| Entitas & atribut | Bab 11.1, 11.2 (dimiliki tiap modul, bagian 8) |
| Enum & data acuan | Bab 11.3 |
| Retensi | Bab 11.4 |
| Integritas transaksi | `NFR-R-05`, `CI-01` … `CI-05` |
| Migration & lingkungan | `NFR-M-04`, `CD-04`, `CD-05` |
| Skalabilitas tabel besar | `NFR-SC-03`, `NFR-SC-06` |
| Waktu | `NFR-C-10`, `CAL-01` … `CAL-03` |

Skema khusus `booking_slots`, `idempotency_keys`, dan `document_counters` didefinisikan di [SDD-01](01-availability-concurrency.md); skema sesi di [SDD-04](04-authentication-session.md). Berkas ini menetapkan **konvensi dan pola yang berlaku bagi seluruh tabel**.

---

## 2. Keputusan Desain

| ID | Keputusan |
|---|---|
| **SDD-DB-01** | Kunci primer memakai `bigserial` (integer berurut), bukan UUID. Pengecualian: `assets.uuid` yang memang diwajibkan `FR-05.1` untuk QR. |
| **SDD-DB-02** | Enum disimpan sebagai **PostgreSQL native enum** dengan nilai berupa **kode teknis huruf besar** (`BAIK`, `RUSAK_RINGAN`, `MENUNGGU_PERSETUJUAN`), sesuai ketetapan pemisahan kode ↔ label pada Bab 11.3. |
| **SDD-DB-03** | Seluruh kolom waktu bertipe `timestamptz`. Tidak ada `timestamp` polos di mana pun. |
| **SDD-DB-04** | *Soft delete* memakai kolom eksplisit per entitas (`status`, `dihapuskan`), **bukan** kolom generik `deleted_at`. Alasannya: PRD memberi makna berbeda pada tiap penonaktifan. |
| **SDD-DB-05** | Uniqueness bersyarat memakai **partial unique index**, bukan `UNIQUE` biasa — khususnya `assets.nomor_seri` yang unik hanya bila diisi (`BR-003`). |
| **SDD-DB-06** | Kolom uang bertipe `numeric(14,2)`. Tidak pernah `float`/`double`. |
| **SDD-DB-07** | `activity_logs` dipartisi **RANGE per bulan** sejak awal, bukan setelah membesar. |
| **SDD-DB-08** | Migration memakai berkas SQL bernomor maju-saja dengan pasangan `down` yang diuji, dijalankan pola **expand → migrate → contract** (`CD-04`). |
| **SDD-DB-09** | Kolom `nilai_sebelum`/`nilai_sesudah` pada `activity_logs` bertipe `jsonb`, dengan indeks GIN hanya pada `entitas`+`entitas_id`, bukan pada isi JSON. |
| **SDD-DB-10** | Data acuan yang dirujuk kode (permission, role bawaan, aturan approval bawaan) di-*seed* lewat migration, bukan lewat skrip manual. |
| **SDD-DB-11** | Akun aplikasi tidak memiliki hak DDL; migration dijalankan akun terpisah (`SEC-CFG-03`). Akun aplikasi juga **tidak** punya `UPDATE`/`DELETE` pada `activity_logs` (`AL-03b`). |
| **SDD-DB-13** | Saldo bahan disimpan sebagai **ledger + saldo termaterialisasi**: `material_transactions` adalah kebenaran, `material_balances` adalah agregat turunannya yang diperbarui **dalam transaksi yang sama**. Tidak ada saldo yang dihitung ulang saat baca (`BR-081`, `BR-092`). |
| **SDD-DB-14** | Pengurangan saldo bahan mengunci baris `material_balances` dengan `SELECT … FOR UPDATE` sebelum memeriksa kecukupan. Larangan saldo negatif (`BR-083`) ditegakkan **CHECK constraint + row lock**, bukan hanya validasi service. |
| **SDD-DB-12** | Berkas migration §4.5 dijalankan **dbmate** — runner SQL siap pakai, bukan runner buatan sendiri, bukan pula perkakas ber-DSL JavaScript. Dua kemampuan bersifat wajib, bukan preferensi: **opt-out transaksi per-migration** dan *advisory lock*; keduanya diverifikasi pada `PR-00-05` sebelum migration pertama ditulis. |
| **SDD-DB-15** | Akses data memakai **Kysely di atas driver `pg`** — *query builder* ber-tipe yang **tidak memiliki skema**. Berkas `.sql` §4.3/§4.4 tetap satu-satunya sumber skema (`SDD-DB-08`); tipe tabel Kysely adalah cerminan yang diturunkan dari basis data, bukan pendefinisinya. Fitur PostgreSQL yang ditetapkan berkas ini — *exclusion constraint* (`CI-01`), `tstzrange`, native enum (`SDD-DB-02`), partial unique index (`SDD-DB-05`), `SELECT … FOR UPDATE` (`SDD-DB-14`), tabel terpartisi (`SDD-DB-07`) — ditulis sebagai SQL mentah lewat *template* `sql` tanpa kehilangan tipe. ORM yang memiliki skema sendiri tidak dipakai. |

---

## 3. Alasan

**SDD-DB-13 — ledger, bukan kolom saldo tunggal.** Menyimpan hanya `materials.saldo` membuat riwayat mustahil direkonstruksi dan setiap koreksi menjadi suntingan tanpa jejak — persis yang dilarang `BR-081`. Menyimpan hanya ledger tanpa agregat memaksa `SUM()` seluruh riwayat pada setiap pembacaan daftar bahan; pada ±20.000 transaksi itu berarti *sequential scan* di halaman yang paling sering dibuka. Karena itu keduanya disimpan, dengan satu syarat mengikat: **agregat tidak pernah ditulis di luar transaksi yang menulis ledger-nya**, sehingga keduanya tidak dapat menyimpang. `saldo_sesudah` pada tiap baris ledger (`BR-092`) membuat penyimpangan dapat dideteksi tanpa menghitung ulang: baris terakhir per (bahan, lokasi) wajib sama dengan `material_balances.saldo`.

**SDD-DB-14 — row lock, bukan pemeriksaan optimistik.** Dua penyerahan bersamaan atas bahan yang sama adalah *read-modify-write* klasik. Tanpa kunci, keduanya membaca saldo 5, masing-masing mengurangi 3, dan saldo berakhir 2 — bukan ditolak. Ini persoalan yang sama dengan `SDD-AVL-01` pada `booking_slots`, tetapi **tidak** memerlukan exclusion constraint karena tidak ada dimensi waktu: cukup kunci baris agregat. `CHECK (saldo >= 0)` menjadi jaring terakhir bila ada jalur kode yang lupa mengunci — constraint basis data tidak dapat dilewati service yang keliru.

**SDD-DB-01 — bigserial, bukan UUID.** UUID acak sebagai kunci primer merusak lokalitas indeks B-tree dan memperbesar setiap indeks sekunder. Pada tabel bervolume tinggi (`activity_logs` ±150.000/tahun, `notifications` ±40.000/tahun) itu terasa. `assets.uuid` tetap ada karena `FR-05.2 A3` mensyaratkan pengenal yang tidak dapat ditebak untuk halaman publik QR — tetapi ia kolom sekunder ber-indeks unik, bukan kunci primer.

**SDD-DB-02 — native enum berkode teknis.** Tiga alternatif dipertimbangkan: `text` + `CHECK`, tabel lookup, dan native enum. Native enum dipilih karena memberi validasi di lapisan basis data tanpa biaya *join*, dan karena himpunan nilainya memang stabil (ditetapkan PRD). Nilainya memakai kode teknis agar perubahan istilah oleh sekolah tidak memerlukan migrasi data — konsisten dengan ketetapan Bab 11.3.

Konsekuensi yang diterima: menambah nilai enum memerlukan migration (`ALTER TYPE ... ADD VALUE`), yang tidak dapat di-*rollback* dalam transaksi. Karena itu penambahan nilai enum selalu menjadi migration tersendiri.

**SDD-DB-04 — soft delete eksplisit.** Kolom generik `deleted_at` menyeragamkan hal-hal yang PRD sengaja bedakan: aset "dinonaktifkan" (`BR-008`) berbeda maknanya dari aset "dihapuskan" lewat M-21, dan berbeda lagi dari pengguna "dinonaktifkan" (`BR-067`). Menyeragamkannya akan menghilangkan perbedaan itu dan membuka peluang kueri yang salah.

**SDD-DB-07 — partisi sejak awal.** Mempartisi tabel yang sudah berisi jutaan baris memerlukan *downtime* atau prosedur rumit. Mempartisinya sejak awal nyaris tanpa biaya. `NFR-SC-03` menyebut activity log sebagai tabel bervolume tinggi, dan `AL-09` mewajibkan retensi ≥2 tahun aktif — kombinasi yang membuat partisi bulanan tepat.

**SDD-DB-09 — jangan indeks isi JSON.** Menggoda untuk memberi GIN pada `nilai_sesudah` agar bisa mencari "siapa mengubah kondisi menjadi Rusak Berat". Ditolak karena indeks GIN pada jsonb yang sering ditulis memperlambat setiap operasi tulis di seluruh sistem, sementara `FR-18.2` hanya menuntut filter berdasarkan tanggal, pengguna, role, modul, aksi, dan entitas — semuanya kolom biasa.

**SDD-DB-15 — query builder, bukan ORM.** Batasan yang mengikat pilihan ini seluruhnya sudah ada di berkas ini, dan hanya satu di antaranya yang menentukan: `SDD-DB-08` menempatkan kepemilikan skema pada berkas `.sql` tulisan tangan. Perkakas yang **juga** memiliki skema karena itu gugur bukan karena kemampuannya, melainkan karena ia menciptakan sumber kedua bagi hal yang `SDD-DB-08` sudah tetapkan pemiliknya — alasan yang sama persis dengan penolakan perkakas ber-DSL pada `SDD-DB-12`.

**Prisma** ditolak atas dasar itu, dan kemampuannya memperkuat penolakan alih-alih melunakkannya: *exclusion constraint*, `tstzrange`, dan partisi RANGE tidak dapat dinyatakan pada modelnya, sehingga `CI-01` dan `SDD-DB-07` — dua hal yang paling perlu dijaga — justru jatuh ke `$queryRaw` yang kehilangan tipe. **Drizzle** ditolak lebih tipis: ia mendukung fitur-fitur itu, tetapi skemanya dideklarasikan di TypeScript; memakainya hanya sebagai pembaca skema berarti membayar ketergantungan untuk sebagian kecil nilainya. **`pg` polos** ditolak karena harganya jatuh di tempat lain: tanpa lapisan ber-tipe, setiap repository menulis pemetaan barisnya sendiri, dan `SDD-AUTH-05` (`AuthContext` pada setiap repository) kehilangan satu titik yang dapat menegakkannya secara seragam.

Kysely menyisakan skema persis di tempat `SDD-DB-08` menaruhnya sambil memberi tipe pada kueri. Konvensi nama kolom Bahasa Indonesia bukan hambatan bagi pilihan ini melainkan alasannya: karena tidak ada pemetaan otomatis berbahasa Inggris yang perlu dilawan, tipe tabel ditulis apa adanya — `tanggal_jatuh_tempo` tetap `tanggal_jatuh_tempo`.

**SDD-DB-12 — runner SQL, bukan DSL dan bukan buatan sendiri.** Bentuk artefaknya sudah ditetapkan `SDD-DB-08` dan §4.5: berkas `.sql` bernomor maju-saja dengan pasangan `down` yang diuji. Yang belum ditetapkan hanya siapa yang menjalankannya, dan tiga jalur dipertimbangkan.

**Perkakas ber-DSL JavaScript** (mis. node-pg-migrate) ditolak. Ia mendukung `down`, opt-out transaksi, dan advisory lock — jadi penolakannya bukan soal kemampuan. Persoalannya, satu-satunya nilai tambahnya adalah DSL-nya, dan batasan berkas ini membuat DSL itu tidak boleh dipakai: fitur PostgreSQL yang sudah ditetapkan di sini — exclusion constraint (`CI-01`), partial unique index (§4.3), partisi RANGE (§4.4), GIN terbatas (`SDD-DB-09`) — tetap harus ditulis sebagai SQL mentah. Yang tersisa hanyalah permukaan tambahan yang mengundang skema ditulis dalam JavaScript, padahal yang di-*review* dan yang harus cocok dengan §4.3/§4.4 adalah SQL-nya.

**Runner buatan sendiri** ditolak karena harganya tidak sepadan. Advisory lock (agar dua job migration tidak berlomba, `SDD-INF-03`), urutan, tabel versi, checksum berkas yang telah diterapkan, dan eksekusi `down` semuanya menjadi kode yang harus ditulis dan diuji — infrastruktur murni tanpa kandungan domain, di proyek yang sudah punya cukup permukaan untuk dipelihara.

**Runner SQL siap pakai** menyisakan berkas persis seperti §4.5 sambil menyediakan mekanisme itu. Dua kemampuannya dinyatakan wajib karena lahir dari keputusan yang sudah diambil, bukan dari selera: opt-out transaksi per-migration dituntut konsekuensi `SDD-DB-02` (`ALTER TYPE … ADD VALUE` tidak dapat di-*rollback* dalam transaksi) dan akan dituntut lagi oleh `CREATE INDEX CONCURRENTLY` pada tabel yang sudah berisi data; advisory lock dituntut `SDD-INF-03` yang menjalankan migration sebagai job terpisah. Runner yang tidak memenuhi keduanya tidak memenuhi syarat, sekalipun populer.

**dbmate dipilih di dalam kelas itu.** Ia menyimpan `migrate:up` dan `migrate:down` pada satu berkas `.sql`, sehingga pasangan `down` yang `SDD-DB-08` wajibkan berada tepat di sebelah `up`-nya alih-alih pada berkas terpisah yang mudah tertinggal. Ia juga berupa biner mandiri, sehingga `SDD-INF-03` — migration sebagai job sekali-jalan dengan akun DDL terpisah — tidak menuntut *runtime* aplikasi ikut hadir di dalam container job. Postgrator, kandidat lain di kelas yang sama, tidak gugur karena cacat; ia hanya mengembalikan sebagian mekanisme yang menjadi alasan memakai runner siap pakai kepada kita. Kedua kemampuan wajib di atas tetap **diverifikasi** pada `PR-00-05`; memilih nama tidak menggantikan pembuktian.

---

## 4. Rancangan

### 4.1 Konvensi penamaan

| Objek | Aturan | Contoh |
|---|---|---|
| Tabel | `snake_case`, jamak | `asset_documents` |
| Kolom | `snake_case`, tunggal | `tanggal_jatuh_tempo` |
| Kunci asing | `<entitas_tunggal>_id` | `asset_id`, `peminjam_id` |
| Indeks | `<tabel>_<kolom>_<jenis>` | `assets_kode_barang_uq` |
| Constraint | `<tabel>_<aturan>` | `booking_slots_no_overlap` |
| Enum type | `<domain>_<konsep>` | `asset_condition`, `booking_status` |
| Partisi | `<tabel>_yYYYYmMM` | `activity_logs_y2026m08` |

Nama kolom mengikuti istilah PRD (Bahasa Indonesia) agar dapat ditelusuri langsung ke requirement. Nama teknis lintas domain (`created_at`, `updated_at`, `id`) memakai Bahasa Inggris.

### 4.2 Kolom baku

Setiap tabel transaksional memiliki:

```sql
id          bigserial PRIMARY KEY,
created_at  timestamptz NOT NULL DEFAULT now(),
updated_at  timestamptz NOT NULL DEFAULT now(),
created_by  bigint REFERENCES users(id),
updated_by  bigint REFERENCES users(id)
```

`updated_at` dipelihara trigger, bukan aplikasi, agar tidak bisa lupa. Tabel master data acuan (`work_days`, `holidays`) dikecualikan.

### 4.3 Pola uniqueness bersyarat

```sql
-- BR-003: nomor seri unik HANYA bila diisi
CREATE UNIQUE INDEX assets_nomor_seri_uq
    ON assets (nomor_seri) WHERE nomor_seri IS NOT NULL;

-- BR-002 + BR-065e: kode barang unik sistem-wide termasuk aset terhapus
CREATE UNIQUE INDEX assets_kode_barang_uq ON assets (kode_barang);

-- BR-068 + BR-070a: minimal dua Administrator aktif
--   ditegakkan di service layer, bukan constraint, karena melibatkan agregat
```

Aturan "minimal dua Administrator" sengaja **tidak** dijadikan constraint: constraint agregat memerlukan trigger yang mengunci tabel `users` pada setiap tulis. Ditegakkan di `UserService` dengan `SELECT ... FOR UPDATE` pada baris Administrator.

### 4.4 Partisi `activity_logs`

```sql
CREATE TABLE activity_logs (
    id            bigserial,
    waktu         timestamptz NOT NULL,
    user_id       bigint,
    user_nama     text,                    -- snapshot (AL-*)
    role          text,
    ip            inet,
    user_agent    text,
    modul         text        NOT NULL,
    aksi          text        NOT NULL,
    entitas       text,
    entitas_id    bigint,
    nilai_sebelum jsonb,
    nilai_sesudah jsonb,
    keterangan    text,
    hasil         text        NOT NULL,
    request_id    text,
    prev_hash     bytea,                   -- rantai hash (NFR-S-03d)
    row_hash      bytea NOT NULL,
    PRIMARY KEY (id, waktu)
) PARTITION BY RANGE (waktu);

CREATE INDEX ON activity_logs (waktu DESC);
CREATE INDEX ON activity_logs (user_id, waktu DESC);
CREATE INDEX ON activity_logs (entitas, entitas_id, waktu DESC);
CREATE INDEX ON activity_logs (modul, aksi, waktu DESC);
```

Partisi bulan berikutnya dibuat otomatis oleh job terjadwal; kegagalannya memicu alarm (`OBS-05`).

**Rantai hash** (`NFR-S-03d`, `AL-03a`): `row_hash = sha256(prev_hash || kanonikal(baris))`. Job harian memverifikasi rantai per partisi dan mengalarmi bila terputus. Karena `activity_logs` bersifat *append-only* dan akun aplikasi tidak punya `UPDATE`/`DELETE` (`SDD-DB-11`), rantai hanya perlu diverifikasi, tidak diperbaiki.

### 4.5 Strategi migration

```
migrations/
  0001_extensions.sql          -- btree_gist, pgcrypto
  0002_enums.sql
  0003_core_users_roles.sql
  0004_locations.sql
  ...
  0030_seed_permissions.sql    -- SDD-DB-10
  0031_seed_default_roles.sql
```

Pola **expand → migrate → contract** (`CD-04`):

| Tahap | Isi | Boleh rollback aplikasi? |
|---|---|---|
| Expand | Tambah kolom/tabel baru, *nullable*, tanpa menghapus apa pun | Ya |
| Migrate | Isi data, ubah kode agar memakai bentuk baru | Ya |
| Contract | Hapus kolom lama — **hanya setelah** versi lama tidak lagi berjalan | Tidak |

Aturannya: satu rilis tidak boleh memuat expand dan contract untuk kolom yang sama.

### 4.6 Seed wajib

| Seed | Sumber kebenaran | Idempoten karena |
|---|---|---|
| 78 kode permission | [Lampiran C](../PRD/00-foundation/roles-permissions.md) | `ON CONFLICT (kode) DO UPDATE` |
| 7 role bawaan + matriks | Bab 5 & Bab 18 | idem |
| Aturan approval bawaan | `RE-06` — konstanta kode, bukan baris | tidak di-seed (lihat SDD-APR §4.3) |
| `work_days` Senin–Sabtu | [Lampiran E.2](../PRD/00-foundation/conventions.md) | idem |
| Parameter sistem bawaan | `FR-20.1` | idem |

### 4.8 Saldo bahan — ledger dan agregat

```sql
-- BR-082: saldo unik per kombinasi bahan x lokasi penyimpanan
CREATE TABLE material_balances (
    id          bigserial PRIMARY KEY,
    material_id bigint  NOT NULL REFERENCES materials(id),
    room_id     bigint  NOT NULL REFERENCES rooms(id),
    saldo       integer NOT NULL DEFAULT 0,
    CONSTRAINT material_balances_uq UNIQUE (material_id, room_id),
    -- BR-083: jaring terakhir bila service lupa mengunci (SDD-DB-14)
    CONSTRAINT material_balances_non_negatif CHECK (saldo >= 0)
);

-- BR-081 + BR-092: ledger adalah kebenaran; saldo_sesudah membuat
-- penyimpangan terdeteksi tanpa menghitung ulang seluruh riwayat
CREATE TABLE material_transactions (
    id             bigserial   PRIMARY KEY,
    material_id    bigint      NOT NULL REFERENCES materials(id),
    room_id        bigint      NOT NULL REFERENCES rooms(id),
    jenis          material_transaction_type NOT NULL,  -- SDD-DB-02
    jumlah         integer     NOT NULL,
    saldo_sesudah  integer     NOT NULL,
    referensi_tipe text,
    referensi_id   bigint,
    alasan         text,                                -- BR-088: wajib saat PENYESUAIAN
    dibuat_oleh    bigint      NOT NULL REFERENCES users(id),
    dibuat_pada    timestamptz NOT NULL,                -- SDD-DB-03, dari Clock (SDD-SYS-07)
    CONSTRAINT material_transactions_jumlah_nonzero CHECK (jumlah <> 0),
    -- BR-088 ditegakkan skema, bukan hanya service
    CONSTRAINT material_transactions_alasan_penyesuaian
        CHECK (jenis <> 'PENYESUAIAN' OR alasan IS NOT NULL)
);

-- kartu stok FR-22.2: selalu dibaca per bahan, berurutan waktu
CREATE INDEX material_transactions_kartu_stok_idx
    ON material_transactions (material_id, room_id, dibuat_pada DESC);
```

**Urutan wajib setiap mutasi saldo** — dijalankan seluruhnya dalam **satu** transaksi (`SDD-EVT-02`):

```text
BEGIN
  SELECT saldo FROM material_balances
    WHERE material_id = $1 AND room_id = $2
    FOR UPDATE                          -- SDD-DB-14: kunci sebelum periksa
  -- periksa kecukupan (BR-083) -> tolak bila tidak cukup
  UPDATE material_balances SET saldo = saldo + $delta
  INSERT INTO material_transactions (..., saldo_sesudah = saldo baru)
  INSERT INTO activity_logs (...)       -- BR-071, AL-01
  INSERT INTO event_outbox (...)        -- NT-49 bila menembus stok minimum
COMMIT
```

Baris `material_balances` dibuat saat bahan pertama kali bertransaksi di suatu lokasi (`INSERT … ON CONFLICT (material_id, room_id) DO UPDATE`), bukan saat bahan didaftarkan — mencegah ledakan baris kosong sebesar jumlah bahan × jumlah ruangan.

**Stok minimum (`BR-085`) dievaluasi terhadap saldo total seluruh lokasi**, sehingga pemeriksaannya menjumlahkan `material_balances` per `material_id` — bukan membandingkan per baris.

### 4.7 Retensi & arsip

| Tabel | Kebijakan | Mekanisme |
|---|---|---|
| `activity_logs` | ≥2 tahun aktif, tidak pernah dihapus (`AL-09`) | Partisi lama di-*detach* ke tabel arsip, tetap dapat dikueri |
| `notifications` | 90 hari aktif | Job arsip harian memindahkan ke `notifications_archive` |
| `chat_messages` | 90 hari (`BR-078`) | idem, isi pesan dianonimkan (`DP-AI-05`) |
| `idempotency_keys` | 24 jam | `DELETE WHERE expires_at < now()` |
| `material_transactions` | Tidak pernah dihapus — dasar kartu stok & rekonstruksi saldo | Tetap aktif; volume rendah (± 20.000/tahun) |
| `booking_slots` (`Released`) | Belum ditetapkan | **TBD-AVL-A** |

---

## 5. Konsekuensi

- Penambahan nilai enum selalu menjadi migration tersendiri dan tidak dapat digabung dengan perubahan lain dalam satu transaksi.
- Rantai hash `activity_logs` mengharuskan penulisan log **berurutan per partisi**; penulisan paralel memerlukan penguncian ringan pada baris terakhir. Ini diterima karena volume log rendah (±150.000/tahun ≈ 0,005 tulis/detik rata-rata).
- Konvensi nama kolom Bahasa Indonesia berarti tidak ada pemetaan otomatis berbahasa Inggris yang dapat diandalkan; nama kolom dipakai apa adanya pada tipe tabel `SDD-DB-15`, ditulis eksplisit dan diperiksa terhadap basis data.
- Tipe tabel `SDD-DB-15` adalah artefak turunan, bukan sumber. Setiap migration yang mengubah bentuk tabel mewajibkan tipe itu ikut disegarkan pada PR yang sama — bila tidak, kompilator berhenti mencerminkan skema dan berubah menjadi kebohongan yang diperiksa CI.
- Aturan expand→contract berarti perubahan skema yang menghapus kolom memerlukan **dua rilis**.
- Runner migration dbmate (`SDD-DB-12`) menjadi dependensi yang ikut ke dalam image (`SDD-INF-01`) dan dijalankan sebagai job terpisah dengan akun DDL (`SDD-INF-03`, `SEC-CFG-03`). Penggantian runner di kemudian hari hanya menyentuh cara berkas dijalankan, bukan isinya — berkas `.sql` tetap portabel.
- Runner tidak membangkitkan `down`; ia tetap ditulis tangan dan diuji sebagaimana `SDD-DB-08` mensyaratkan. Memilih perkakas tidak mengurangi kewajiban itu.

---

## 6. Risiko Teknis

| Risiko | Dampak | Mitigasi |
|---|---|---|
| Partisi bulan berikutnya gagal dibuat | Penulisan log gagal | Job membuat 3 bulan ke depan, bukan 1; alarm bila gagal (`OBS-05`) |
| Rantai hash menjadi leher botol tulis | Latensi operasi tulis naik | Volume rendah; bila terbukti bermasalah, rantai dapat dipindah ke perhitungan asinkron per batch |
| Migration `ALTER TYPE` mengunci | Deploy tertahan | Penambahan nilai enum dijadwalkan di luar jam operasional (`NFR-A-03`) |
| Enum berkode teknis salah dipetakan ke label | Tampilan salah | Peta kode→label diuji lengkap terhadap Bab 11.3 |
| Seed permission menyimpang dari Lampiran C | Celah otorisasi | Uji membandingkan hasil seed dengan katalog Lampiran C baris per baris |
| `material_balances` menyimpang dari ledger | Saldo yang ditampilkan salah tanpa ada yang menyadari | Job pemeriksa berkala membandingkan `saldo` dengan `saldo_sesudah` transaksi terakhir per (bahan, lokasi); selisih memicu alarm (`OBS-05`) |
| Jalur kode baru memutakhirkan saldo tanpa menulis ledger | Riwayat berlubang, `BR-081` dilanggar diam-diam | Akun aplikasi menulis `material_balances` hanya lewat satu repository; uji integrasi menolak mutasi saldo yang tidak berpasangan dengan baris ledger |

---

## 7. Requirement Terkait

`BR-002` `BR-003` `BR-008` `BR-067` `BR-081` `BR-082` `BR-083` `BR-085` `BR-088` `BR-092` `BR-068` `BR-070a` `BR-071` `BR-072` `BR-078` ·
`AL-01` `AL-03` `AL-03a` `AL-03b` `AL-05` `AL-09` · `NFR-R-05` `NFR-M-04` `NFR-SC-03` `NFR-SC-06` ·
`NFR-S-03d` `NFR-S-12` · `NFR-C-10` · `CD-04` `CD-05` `SEC-CFG-03` · `CAL-01` … `CAL-03` · `DP-AI-05` · `INF-01`

---

## 8. TBD

| ID | Pertanyaan |
|---|---|
| **TBD-AVL-A** *(dari SDD-01)* | Kebijakan arsip/partisi `booking_slots`. Berkas ini menyiapkan polanya (mengikuti `activity_logs`) namun tidak menetapkannya. |
