## Lampiran D — Skema DSL Kondisi Approval Rule

> Menutup kekosongan spesifikasi `approval_rules.kondisi (JSON)` pada FR-10.1. Tanpa lampiran ini, komponen terkompleks di sistem dibangun berdasarkan tebakan dan tidak dapat diuji.

### Batas normatif ↔ rancangan

Berkas ini memuat bagian **normatif**: bentuk skema, kamus field, operator, dan semantik yang wajib dipenuhi implementasi apa pun. **Cara** mesin mewujudkannya berada di SDD dan tidak diulang di sini.

| Bagian | Sifat | Berada di |
|---|---|---|
| D.1 Bentuk umum · D.2 Kamus field · D.3 Operator | Normatif — kontrak yang mengikat | Berkas ini (PRD) |
| D.4 Semantik evaluasi (`RE-01`…`RE-08`) | Normatif — perilaku yang wajib | Berkas ini (PRD) |
| D.5 Definisi langkah & perilaku terminal | Normatif | Berkas ini (PRD) |
| D.6 Contoh aturan | Ilustratif | Berkas ini (PRD) |
| D.7 Aturan konkurensi & konflik kepentingan (`RE-09`…`RE-12`) | Normatif | Berkas ini (PRD) |
| Arsitektur evaluator, komponen, pola kueri, indeks | **Rancangan** | [`../../SDD/02-approval-engine.md`](../../SDD/02-approval-engine.md) |
| Validasi skema, snapshot, resolusi konkurensi teknis | **Rancangan** | [`../../SDD/02-approval-engine.md`](../../SDD/02-approval-engine.md) |

Bila SDD dan lampiran ini berbeda, **lampiran ini yang berlaku** dan SDD wajib disesuaikan.

### D.1 Bentuk Umum

```json
{
  "operator": "AND",
  "conditions": [
    { "field": "requester_role", "op": "in", "value": ["Siswa/OSIS"] },
    {
      "operator": "OR",
      "conditions": [
        { "field": "total_value", "op": "gt", "value": 10000000 },
        { "field": "duration_days", "op": "gt", "value": 7 }
      ]
    }
  ]
}
```

- Node bertipe **grup** memiliki `operator` (`AND` \| `OR`) dan `conditions` (array).
- Node bertipe **predikat** memiliki `field`, `op`, dan `value`.
- Kedalaman bersarang maksimum **3 tingkat**; melebihi itu ditolak saat penyimpanan.
- Kondisi kosong (`{}`) berarti **selalu cocok** — dipakai untuk aturan bawaan (BR-036).

### D.2 Field yang Tersedia per Jenis Pengajuan

| Field | Tipe | Berlaku pada jenis pengajuan | Sumber nilai |
|---|---|---|---|
| `requester_role` | enum role | semua | Role pemohon saat pengajuan dibuat |
| `requester_id` | integer | semua | ID pemohon |
| `requester_has_overdue` | boolean | semua | Ada peminjaman terlambat aktif |
| `total_value` | decimal | Pengadaan, Penghapusan | Total estimasi / total nilai perolehan |
| `item_count` | integer | Reservasi Aset, Pengadaan, Penghapusan, Permintaan Bahan | Jumlah unit/item |
| `material_category_id` | integer[] | Permintaan Bahan | Kategori bahan yang diminta |
| `material_qty_total` | integer | Permintaan Bahan | Total kuantitas bahan yang diminta — dasar ambang `BR-086` |
| `material_value_total` | decimal | Permintaan Bahan | Perkiraan nilai total bahan yang diminta |
| `duration_days` | integer | Reservasi Aset, Perpanjangan | Selisih hari mulai–selesai |
| `duration_hours` | integer | Reservasi Ruangan | Durasi penggunaan ruangan |
| `asset_category_id` | integer[] | Reservasi Aset, Penghapusan | Kategori aset yang diminta |
| `asset_value_max` | decimal | Reservasi Aset | Nilai perolehan tertinggi di antara unit yang diminta |
| `room_type` | enum | Reservasi Ruangan | Jenis ruangan |
| `room_id` | integer[] | Reservasi Ruangan | Ruangan yang diminta |
| `participant_count` | integer | Reservasi Ruangan | Perkiraan jumlah peserta |
| `is_recurring` | boolean | Reservasi Ruangan | Pengajuan berulang atau tunggal |
| `is_outside_operating_hours` | boolean | Reservasi Ruangan | Di luar jam operasional |
| `lead_time_hours` | integer | Reservasi | Selisih waktu pengajuan ke waktu mulai |
| `disposal_reason` | enum | Penghapusan | Alasan penghapusan |
| `priority` | enum | Pengadaan | Prioritas usulan |

### D.3 Operator

| `op` | Berlaku untuk tipe | Semantik |
|---|---|---|
| `eq` / `neq` | semua | Sama dengan / tidak sama dengan |
| `gt` / `gte` / `lt` / `lte` | numerik | Perbandingan numerik |
| `in` / `not_in` | enum, array | Keanggotaan himpunan |
| `between` | numerik | `value` berupa `[min, max]`, inklusif |
| `is_true` / `is_false` | boolean | Tanpa `value` |

### D.4 Semantik Evaluasi

| Kode | Aturan |
|---|---|
| RE-01 | Evaluasi bersifat murni (*pure*) dan bebas efek samping; hanya membaca *snapshot* atribut pengajuan pada saat pembuatan |
| RE-02 | Field yang tidak berlaku bagi jenis pengajuan tertentu dievaluasi sebagai **tidak cocok**, bukan galat |
| RE-03 | Nilai `null` pada field mana pun menjadikan predikatnya `false`, kecuali operator `is_false` |
| RE-04 | Bila beberapa aturan cocok, dipilih `prioritas` tertinggi; bila prioritas seri, dipilih `id` terkecil (deterministik) — melengkapi BR-037 |
| RE-05 | Aturan yang dipilih beserta **seluruh definisinya** disalin ke `approval_instances.rule_snapshot`; perubahan aturan setelahnya tidak memengaruhi instance berjalan (BR-040) |
| RE-06 | Bila tidak ada aturan yang cocok, berlaku aturan bawaan: satu level, approver = role Petugas Sarana Prasarana, SLA 24 jam (BR-036) |
| RE-07 | Endpoint `POST /approval-rules/preview` menerima contoh pengajuan dan mengembalikan: aturan yang akan terpilih, seluruh aturan yang cocok beserta prioritasnya, dan rangkaian langkah yang akan terbentuk (FR-10.1 AC) |
| RE-08 | Penyimpanan aturan divalidasi terhadap skema JSON ini; aturan tidak valid ditolak `422 INVALID_RULE_DEFINITION` |

### D.5 Definisi Langkah Persetujuan

```json
{
  "steps": [
    {
      "order": 1,
      "approver_type": "role",
      "approver_role": "Petugas Sarana Prasarana",
      "sla_hours": 24,
      "on_sla_breach": "remind"
    },
    {
      "order": 2,
      "approver_type": "role",
      "approver_role": "Pimpinan Sekolah",
      "sla_hours": 48,
      "on_sla_breach": "escalate",
      "escalate_to_user_id": 1
    }
  ],
  "terminal_on_exhausted_escalation": "hold_and_alert"
}
```

| Field | Nilai | Keterangan |
|---|---|---|
| `approver_type` | `role` \| `user` | Berdasarkan role atau pengguna spesifik |
| `on_sla_breach` | `remind` \| `escalate` | Perilaku saat SLA terlampaui |
| `fallback_approver` | `{ approver_type, approver_role \| approver_user_id }` | **Opsional, tingkat aturan** (bukan tingkat langkah). Dipakai bila seluruh langkah terlewati (`RE-11`). Bila tidak diisi, berlaku role Administrator |
| `terminal_on_exhausted_escalation` | `hold_and_alert` \| `auto_reject` | **Menutup celah menggantung**: perilaku bila seluruh eskalasi habis dan tetap tidak ada keputusan. Nilai bawaan `hold_and_alert` — pengajuan tetap menunggu namun Administrator dan Petugas Sarpras dialarmi (NT-47) |

### D.6 Contoh Aturan Lengkap

**Contoh 1 — Reservasi aset oleh siswa selalu perlu dua level**

```json
{
  "jenis_pengajuan": "Reservasi Aset",
  "prioritas": 100,
  "kondisi": { "field": "requester_role", "op": "eq", "value": "Siswa/OSIS" },
  "steps": [
    { "order": 1, "approver_type": "role", "approver_role": "Guru", "sla_hours": 24, "on_sla_breach": "remind" },
    { "order": 2, "approver_type": "role", "approver_role": "Petugas Sarana Prasarana", "sla_hours": 24, "on_sla_breach": "escalate", "escalate_to_user_id": 1 }
  ]
}
```

**Contoh 2 — Pengadaan bernilai tinggi naik ke Pimpinan**

```json
{
  "jenis_pengajuan": "Pengadaan Barang",
  "prioritas": 90,
  "kondisi": { "field": "total_value", "op": "gt", "value": 10000000 },
  "steps": [
    { "order": 1, "approver_type": "role", "approver_role": "Petugas Sarana Prasarana", "sla_hours": 48, "on_sla_breach": "remind" },
    { "order": 2, "approver_type": "role", "approver_role": "Pimpinan Sekolah", "sla_hours": 72, "on_sla_breach": "remind" }
  ],
  "terminal_on_exhausted_escalation": "hold_and_alert"
}
```

### D.7 Aturan Konkurensi & Konflik Kepentingan

| Kode | Aturan |
|---|---|
| RE-09 | **First responder wins** (BR-041) diimplementasikan dengan `UPDATE … WHERE status = 'Menunggu' AND langkah_aktif = :n` yang mengembalikan jumlah baris terpengaruh. Pemenang menerima `200`; approver yang kalah menerima `409 APPROVAL_ALREADY_DECIDED` beserta identitas pemutus dan waktunya |
| RE-10 | Approver yang identik dengan pemohon menyebabkan langkah **dilewati** dan dicatat `dilewati — konflik kepentingan` (BR-039) |
| RE-11 | Bila **seluruh** langkah terlewati, pengajuan diarahkan ke *fallback approver* — field **opsional** tingkat aturan (Lampiran D.5). Bila aturan tidak menetapkannya, berlaku role Administrator. Pengajuan tidak pernah otomatis disetujui karena kekosongan approver |
| RE-12 | Delegasi (FR-10.2 A3) tidak memindahkan tanggung jawab audit: linimasa mencatat approver asli dan penerima delegasi |
| RE-13 | Langkah yang approver-nya bertipe `user` dan pengguna tersebut **nonaktif saat langkah hendak diaktifkan** ditandai **dilewati** dengan alasan `dilewati — approver nonaktif`, dan pemrosesan lanjut ke langkah berikutnya. Bila seluruh langkah menjadi tidak tersedia karena sebab apa pun — konflik kepentingan (RE-10), approver nonaktif, atau gabungan keduanya — berlaku jalur fallback RE-11 yang sama. Administrator dialarmi (NT-47). Penonaktifan pengguna tidak pernah tertahan oleh instance yang sedang berjalan |
