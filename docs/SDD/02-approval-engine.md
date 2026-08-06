# SDD-02 — Desain Mesin Persetujuan

**Area:** `APR` · **Status:** Draft untuk review · **Basis:** [`../03-architecture/approval-rule-dsl.md`](../PRD/03-architecture/approval-rule-dsl.md), [`../02-modules/m10-approval.md`](../PRD/02-modules/m10-approval.md)

---

## 1. Konteks

| Kelompok | ID |
|---|---|
| Aturan bisnis persetujuan | `BR-035` … `BR-043`, `BR-039a` |
| Semantik evaluasi DSL | `RE-01` … `RE-12` |
| Requirement fungsional | `FR-10.1`, `FR-10.2`, `FR-10.3` |
| Jenis pengajuan yang dilayani | `FR-07.2`, `FR-08.2`, `FR-09.5`, `FR-14.1`, `FR-21.1` |
| Waktu & SLA | `CAL-01` (jam kerja), Lampiran E.1 |
| Konkurensi | `CC-03` |

Satu mesin melayani **lima** jenis pengajuan. Tidak boleh ada cabang khusus per modul di dalam mesin — perbedaan diserap oleh *adapter* (SDD-APR-09).

---

## 2. Keputusan Desain

| ID | Keputusan |
|---|---|
| **SDD-APR-01** | Evaluator aturan berjalan di **lapisan aplikasi** sebagai fungsi murni, bukan di basis data. Masukannya objek fakta biasa; tidak menyentuh koneksi DB. |
| **SDD-APR-02** | Definisi aturan divalidasi terhadap **JSON Schema** saat disimpan, bukan saat dievaluasi. Aturan tidak valid ditolak `422 INVALID_RULE_DEFINITION` (`RE-08`). |
| **SDD-APR-03** | `rule_snapshot` disimpan sebagai `jsonb` berisi **definisi aturan utuh** (kondisi + seluruh langkah), bukan sekadar `rule_id` + versi. |
| **SDD-APR-04** | Instance persetujuan memakai kolom `langkah_aktif` sebagai penunjuk tunggal; baris `approval_steps` dibuat **seluruhnya di muka** saat instance lahir, berstatus `Menunggu`/`Belum Aktif`. |
| **SDD-APR-05** | Resolusi "first responder wins" (`BR-041`, `RE-09`) memakai **conditional UPDATE + pemeriksaan jumlah baris terpengaruh**, bukan `SELECT` lalu `UPDATE`, dan bukan lock tabel. |
| **SDD-APR-06** | SLA dihitung dalam **jam kerja** oleh `BusinessCalendarService` tersendiri yang membaca `work_days` + `holidays` (`CAL-01`). Tidak ada aritmetika tanggal tersebar di service lain. |
| **SDD-APR-07** | Tenggat SLA disimpan sebagai `sla_deadline` **absolut** pada tiap langkah saat langkah menjadi aktif — bukan dihitung ulang setiap kali dibaca. |
| **SDD-APR-08** | Pemilihan aturan (`RE-04`) dan pembentukan langkah dijalankan **di dalam transaksi yang sama** dengan pembuatan pengajuan. Pengajuan tanpa instance persetujuan tidak mungkin ada. |
| **SDD-APR-09** | Tiap jenis pengajuan menyediakan **`FactAdapter`** yang memetakan entitasnya ke kamus fakta DSL (Lampiran D.2). Mesin tidak mengenal `reservations`, `procurements`, maupun `asset_disposals`. |
| **SDD-APR-10** | Endpoint pratinjau (`RE-07`) memanggil **evaluator yang sama persis**. Dilarang ada implementasi kedua untuk pratinjau. |
| **SDD-APR-11** | Ketersediaan objek diverifikasi ulang saat keputusan akhir (`BR-043`) dengan **mengunci** slot terkait, bukan sekadar membacanya. |
| **SDD-APR-12** | Langkah yang dilewati (`BR-039`) tetap ditulis sebagai baris `approval_steps` berstatus `Dilewati` beserta alasannya — bukan dihapus. |

---

## 3. Alasan

**SDD-APR-01 — evaluator di aplikasi.** Alternatif menyimpan logika di PostgreSQL (`jsonb` + fungsi PL/pgSQL) ditolak karena `RE-07` mewajibkan pratinjau tanpa efek samping, dan karena aturan harus dapat diuji unit secara masif (`NFR-M-03` menyebut approval engine sebagai logika inti). Fungsi murni tanpa I/O dapat diuji ribuan kasus dalam hitungan detik; fungsi PL/pgSQL tidak.

**SDD-APR-03 — snapshot definisi utuh, bukan pointer versi.** `BR-040` dan `RE-05` mengharuskan instance berjalan tidak terpengaruh perubahan aturan. Menyimpan `rule_id + versi` tetap membuat pembacaan bergantung pada baris `approval_rules` yang bisa dihapus atau disunting. Menyimpan definisi utuh membuat instance benar-benar mandiri — dan menjadikan `FR-10.3` (linimasa) dapat direkonstruksi bertahun-tahun kemudian meski aturannya sudah lama tidak ada.

Harga: duplikasi data. Dapat diterima karena snapshot bersifat *immutable historical record*, bukan sumber kebenaran yang bisa menyimpang.

**SDD-APR-04 — buat semua langkah di muka.** Alternatif membuat langkah satu per satu saat dibutuhkan membuat `FR-10.3` tidak bisa menampilkan "sisa langkah" dan membuat pengujian eskalasi sulit. Membuat semuanya di muka juga membuat `BR-039` (lewati konflik kepentingan) dapat diselesaikan saat instance lahir, bukan di tengah jalan.

**SDD-APR-05 — conditional UPDATE.** Dua approver menekan Setujui bersamaan (`CC-03`) adalah kejadian nyata karena `BR-041` sengaja menotifikasi seluruh pemegang role. Pola `SELECT … IF status = 'Menunggu' … UPDATE` punya jendela balapan. Satu pernyataan:

```sql
UPDATE approval_steps
   SET keputusan = $1, approver_id = $2, diputuskan_pada = now(), catatan = $3
 WHERE instance_id = $4 AND urutan = $5 AND keputusan IS NULL
```

Jumlah baris terpengaruh menjadi pemenangnya: `1` = menang, `0` = kalah → `409 APPROVAL_ALREADY_DECIDED`. Tidak ada lock eksplisit, tidak ada jendela.

**SDD-APR-06 — kalender terpisah.** `SC-03` mengukur persetujuan dalam hari kerja sementara `BR-028` menghitung denda dalam hari kalender. Bila aritmetika ini tersebar, dua modul akan mengimplementasikannya berbeda — persis kelemahan yang ditemukan pada audit PRD. Satu service, satu definisi.

**SDD-APR-07 — tenggat absolut.** Menghitung ulang tenggat setiap pembacaan berarti perubahan `holidays` di kemudian hari menggeser tenggat pengajuan yang sudah berjalan — melanggar semangat `BR-040`. Menyimpannya absolut membuat tenggat stabil sejak langkah aktif.

**SDD-APR-11 — kunci, bukan baca.** `BR-043` menyatakan persetujuan tidak berlaku bila objek sudah tidak tersedia. Membaca tanpa mengunci menyisakan jendela antara verifikasi dan promosi slot ke `Confirmed`. Karena promosi itu sendiri menyentuh `booking_slots`, penguncian mengikuti aturan urutan `CI-02` dari [SDD-01](01-availability-concurrency.md).

---

## 4. Rancangan

### 4.1 Bentuk komponen

```
ApprovalService
├── RuleRepository        — baca aturan aktif per jenis pengajuan
├── RuleValidator         — JSON Schema (SDD-APR-02)
├── RuleSelector          — RE-04: prioritas tertinggi, seri -> id terkecil
├── ConditionEvaluator    — fungsi murni, RE-01..RE-03
├── StepPlanner           — bentuk langkah + terapkan BR-039 / RE-11
├── DecisionHandler       — RE-09, BR-038, BR-042, BR-043
├── SlaTracker            — SDD-APR-06/07, dipanggil job approval-sla-check
└── FactAdapter (per jenis pengajuan)   — SDD-APR-09
```

### 4.2 Kontrak evaluator

```ts
type Fact = string | number | boolean | null | Array<string | number>;
type Facts = Readonly<Record<string, Fact>>;

// Fungsi murni: tanpa I/O, tanpa jam sistem, tanpa random.
function evaluate(node: ConditionNode, facts: Facts): boolean;

// RE-02: field yang tidak berlaku -> tidak cocok, bukan galat
// RE-03: nilai null -> predikat false, kecuali operator is_false
```

`FactAdapter` per jenis pengajuan:

```ts
interface FactAdapter<T> {
  readonly submissionType: SubmissionType;
  buildFacts(entity: T, requester: UserContext): Facts;
}
```

Mesin tidak pernah mengimpor tipe domain. Penambahan jenis pengajuan baru = satu adapter baru, nol perubahan pada mesin.

### 4.3 Pembentukan instance

```
createInstance(submission, requester):        -- dalam transaksi pemanggil (SDD-APR-08)
  facts   := adapter.buildFacts(submission, requester)
  rules   := repo.activeRules(submission.type)
  matched := rules.filter(r => evaluate(r.kondisi, facts))
  rule    := matched.sort(byPriorityDesc, byIdAsc)[0] ?? DEFAULT_RULE   -- RE-04 / RE-06

  steps := rule.steps.map(planStep)
  for each step:
     if resolvesToRequesterOnly(step, requester):     -- BR-039
        mark 'Dilewati', alasan 'konflik kepentingan'
  if all steps skipped:                                -- RE-11
     append fallbackStep(rule.fallback_approver ?? ROLE_ADMINISTRATOR)

  INSERT approval_instances (rule_snapshot = rule, langkah_aktif = firstActive(steps))
  INSERT approval_steps (seluruhnya)
  activate(firstActive)   -> set sla_deadline (SDD-APR-07), kirim NT-01
```

`DEFAULT_RULE` (`RE-06`, `BR-036`) didefinisikan sebagai konstanta kode dengan kondisi kosong `{}`, satu langkah, role Petugas Sarana Prasarana, SLA 24 jam. Bukan baris basis data — agar tidak bisa terhapus.

### 4.4 Pemrosesan keputusan

```
decide(instanceId, stepOrder, actor, decision, note):
  BEGIN
    affected := UPDATE approval_steps SET ... WHERE keputusan IS NULL ...   -- SDD-APR-05
    IF affected = 0 -> 409 APPROVAL_ALREADY_DECIDED

    IF decision = Ditolak        -> instance.status = Ditolak; release slot; NT-03; END  -- BR-038
    IF decision = Perlu Revisi   -> instance.status = PerluRevisi; NT-04; END            -- FR-10.2 A1

    next := nextActiveStep()
    IF next EXISTS -> langkah_aktif = next; set sla_deadline; NT-05
    ELSE
       assertObjectStillAvailable(FOR UPDATE)   -- BR-043, SDD-APR-11
       promote slots Tentative -> Confirmed     -- lihat SDD-01 §4.3
       instance.status = Disetujui; NT-02
  COMMIT
```

Idempotensi permintaan ganda ditangani lapisan `Idempotency-Key` dari [SDD-01 §4.4](01-availability-concurrency.md) (`ID-01`).

### 4.5 SLA & eskalasi

Job `approval-sla-check` (tiap 30 menit, lihat `JOB-*` pada SDD-01):

```
FOR each step aktif WHERE sla_deadline < now():
   IF on_sla_breach = 'remind'   -> NT-06 (maks 1x/hari per objek, lihat ketentuan anti-spam)
   IF on_sla_breach = 'escalate' -> alihkan ke escalate_to_user_id; NT-07
   IF tidak ada jalur eskalasi tersisa:
        terminal := snapshot.terminal_on_exhausted_escalation ?? 'hold_and_alert'
        hold_and_alert -> instance tetap Menunggu + NT-47      (BR-039a)
        auto_reject    -> instance.status = Ditolak + NT-03
```

`BR-039a` melarang persetujuan otomatis akibat kelalaian; karena itu `auto_approve` **tidak** termasuk nilai yang sah pada `terminal_on_exhausted_escalation`, dan JSON Schema menolaknya.

### 4.6 Indeks pendukung

```sql
CREATE INDEX approval_steps_pending
    ON approval_steps (instance_id, urutan) WHERE keputusan IS NULL;

CREATE INDEX approval_steps_sla
    ON approval_steps (sla_deadline) WHERE keputusan IS NULL;

CREATE INDEX approval_instances_lookup
    ON approval_instances (jenis_pengajuan, referensi_id);

CREATE INDEX approval_rules_active
    ON approval_rules (jenis_pengajuan, prioritas DESC) WHERE status_aktif;
```

---

## 5. Konsekuensi

- **Modul terdampak:** M-07, M-08, M-09 (perpanjangan), M-14, M-21 — masing-masing wajib menyediakan satu `FactAdapter` dan tidak boleh menulis logika persetujuan sendiri.
- **Batasan yang lahir:** jenis pengajuan baru **hanya** boleh ditambah lewat adapter + kamus fakta (Lampiran D.2). Menambah field fakta berarti memperbarui JSON Schema dan uji evaluator.
- **Kewajiban pengujian:** `CC-03` wajib dijalankan terhadap PostgreSQL nyata. Evaluator diuji sebagai *table-driven test* mencakup seluruh operator Lampiran D.3 dan seluruh kasus `RE-02`/`RE-03`.
- **Dampak ke SDD berikutnya:** `BusinessCalendarService` (SDD-APR-06) juga dipakai perhitungan denda dan target work order — akan dirujuk oleh SDD-04 dan SDD-05.

---

## 6. Risiko Teknis

| Risiko | Dampak | Mitigasi |
|---|---|---|
| Snapshot aturan membengkak | Ukuran baris `approval_instances` naik | `jsonb` ter-*TOAST* otomatis; snapshot hanya definisi, bukan data pengajuan |
| Aturan salah konfigurasi membuat pengajuan buntu (`RS-06`) | Proses berhenti diam-diam | Pratinjau (`RE-07`) memakai evaluator yang sama; `DEFAULT_RULE` sebagai jaring pengaman; `NT-47` mengalarmi |
| `FactAdapter` mengirim field yang tidak dikenal | Aturan tidak pernah cocok | JSON Schema membatasi nama field ke kamus Lampiran D.2; adapter diuji kontrak |
| Zona waktu pada `sla_deadline` | Tenggat bergeser | Seluruh perhitungan lewat `BusinessCalendarService`; disimpan `timestamptz` |
| Evaluator tidak sengaja melakukan I/O | Pratinjau menimbulkan efek samping | Uji arsitektur melarang impor repository di dalam modul evaluator |
| Bersarang DSL terlalu dalam | Sulit dipahami Administrator | Kedalaman dibatasi 3 tingkat oleh schema (Lampiran D.1) |

---

## 7. Requirement Terkait

`BR-035` `BR-036` `BR-037` `BR-038` `BR-039` `BR-039a` `BR-040` `BR-041` `BR-042` `BR-043` ·
`RE-01` … `RE-12` · `FR-10.1` `FR-10.2` `FR-10.3` · `FR-07.2` `FR-08.2` `FR-09.5` `FR-14.1` `FR-14.2` `FR-21.1` `FR-21.2` ·
`NT-01` … `NT-07` `NT-47` · `CAL-01` · `CC-03` · `NFR-M-03` `NFR-R-06` · `RS-05` `RS-06` · `SC-03`

---

## 8. TBD — Menunggu Keputusan

| ID | Pertanyaan |
|---|---|
| **TBD-APR-A** | `fallback_approver` pada definisi aturan disebut oleh `RE-11` tetapi tidak tercantum sebagai field pada skema langkah di Lampiran D.5. Perlu ditetapkan apakah ia field tingkat aturan (`rule.fallback_approver`) atau selalu jatuh ke role Administrator tanpa konfigurasi. |
| **TBD-APR-B** | Jam kerja untuk perhitungan SLA: apakah memakai jam operasional sekolah (06.00–18.00, `FR-20.1`) atau jam kerja administratif yang lebih sempit. Keduanya masuk akal dan menghasilkan tenggat berbeda. |
| **TBD-APR-C** | Perilaku bila approver yang ditunjuk `approver_type='user'` dinonaktifkan setelah instance berjalan. `FR-02.1 A3` memblokir penonaktifan approver aktif, namun tidak mengatur instance yang sudah memakai snapshot berisi user tersebut. |
