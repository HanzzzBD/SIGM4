# M-10 — Approval Workflow Engine

> **Modul self-contained.** Seluruh yang diperlukan untuk mengimplementasikan modul ini ada di
> berkas ini: requirement, aturan bisnis, endpoint, entitas, notifikasi, permission, jejak audit,
> dan kriteria penerimaan. Baris yang dimiliki modul lain dirujuk melalui ID, tidak disalin.
>
> Isi requirement bersifat **verbatim dari PRD v1.1**. Sumber kebenaran tunggal.

## 1. Overview

Lihat [`../01-product/overview.md`](../01-product/overview.md) untuk konteks produk menyeluruh.
Modul ini adalah **M-10 — Approval Workflow Engine** sebagaimana terdaftar pada Daftar Modul PRD.

## 2. Scope

Cakupan modul ditentukan oleh Functional Requirement yang tercantum pada bagian 5.
Hal di luar daftar tersebut berada di luar cakupan modul ini.

## 3. Actors

Aktor per requirement tercantum pada tabel **Actor** di tiap FR (bagian 5).
Definisi role: [`../00-foundation/roles-permissions.md`](../00-foundation/roles-permissions.md).

## 4. Business Flow

_Diagram alur khusus modul ini tidak ada pada PRD. Alur lintas modul: [`../03-architecture/system-overview.md`](../03-architecture/system-overview.md)._

## 5. Functional Requirements

### FR-10.1 Konfigurasi Approval Rules

| Aspek | Uraian |
|---|---|
| **Description** | Administrator mendefinisikan aturan persetujuan berjenjang per jenis pengajuan, lengkap dengan kondisi pemicu dan urutan approver. |
| **Actor** | Administrator |
| **Preconditions** | Data role dan pengguna tersedia |

**Main Flow**
1. Administrator membuka menu Approval Rules.
2. Administrator membuat aturan baru dan memilih **jenis pengajuan**: Reservasi Ruangan, Reservasi Aset, Perpanjangan Peminjaman, Pengadaan Barang, Penghapusan Aset, atau **Permintaan Bahan**.
3. Administrator menetapkan **kondisi pemicu** (dapat dikombinasikan dengan AND/OR):
   - Role pemohon (mis. Siswa/OSIS)
   - Nilai/estimasi biaya (mis. > Rp10.000.000)
   - Kategori aset atau jenis ruangan
   - Durasi peminjaman (mis. > 7 hari)
   - Jumlah unit yang diminta
4. Administrator menetapkan **langkah persetujuan berurutan**: nomor urutan, approver (berdasarkan role atau pengguna spesifik), SLA dalam jam, dan perilaku eskalasi bila SLA terlampaui.
5. Administrator menetapkan prioritas aturan (bila beberapa aturan cocok, aturan berprioritas tertinggi yang dipakai).
6. Administrator menyimpan dan mengaktifkan aturan.

**Alternative Flow**
- **A1 — Tidak ada aturan yang cocok dengan pengajuan:** Sistem menggunakan aturan *default* (persetujuan satu level oleh Petugas Sarana Prasarana).
- **A2 — Beberapa aturan cocok:** Sistem memilih aturan dengan prioritas tertinggi dan mencatat aturan mana yang dipakai pada instance approval.
- **A3 — Approver ditetapkan berdasarkan role dan terdapat lebih dari satu pengguna dengan role tersebut:** Sistem menotifikasi seluruhnya; keputusan pertama yang masuk mengikat (*first responder wins*).
- **A4 — Menonaktifkan aturan yang sedang dipakai instance berjalan:** Instance berjalan tetap memakai snapshot aturan lama hingga selesai.

**Post Conditions** — Aturan aktif dan dipakai untuk membentuk instance approval pada pengajuan berikutnya.

**Acceptance Criteria**
- [ ] Administrator dapat membuat aturan multi-level tanpa bantuan pengembang dan tanpa deployment.
- [ ] Perubahan aturan tidak mengubah jalur persetujuan pengajuan yang sedang berjalan.
- [ ] Sistem menyediakan pratinjau "aturan mana yang akan berlaku" untuk skenario contoh sebelum aturan disimpan.
- [ ] Setiap instance approval menyimpan referensi ke versi aturan yang digunakan.

### FR-10.2 Eksekusi Persetujuan

| Aspek | Uraian |
|---|---|
| **Description** | Approver meninjau, menyetujui, menolak, atau meminta revisi atas pengajuan yang masuk. |
| **Actor** | Approver (Petugas Sarpras / Pimpinan Sekolah / pengguna yang ditetapkan aturan) |
| **Preconditions** | Terdapat instance approval berstatus `Menunggu` pada langkah yang menjadi tanggung jawab approver |

**Main Flow**
1. Approver menerima notifikasi in-app dan push.
2. Approver membuka menu "Persetujuan Saya" dan melihat daftar pengajuan menunggu, terurut berdasarkan waktu pengajuan dan urgensi.
3. Approver membuka detail pengajuan: pemohon, objek yang diminta, jadwal, keperluan, riwayat pemohon (keterlambatan sebelumnya, denda tertunggak), dan ketersediaan objek.
4. Approver memilih **Setujui** atau **Tolak**, mengisi catatan (wajib bila menolak).
5. Bila disetujui dan masih ada langkah berikutnya, sistem meneruskan ke approver berikutnya dan menotifikasinya.
6. Bila disetujui pada langkah terakhir, sistem menetapkan pengajuan berstatus `Disetujui` dan menotifikasi pemohon.
7. Bila ditolak pada langkah mana pun, sistem menghentikan alur, menetapkan status `Ditolak`, dan menotifikasi pemohon beserta alasannya.

**Alternative Flow**
- **A1 — Approver meminta revisi:** Status berubah menjadi `Perlu Revisi`; pemohon dapat menyunting dan mengirim ulang, dan alur persetujuan dimulai kembali dari langkah pertama.
- **A2 — SLA terlampaui:** Sistem mengirim pengingat kepada approver; bila aturan mengaktifkan eskalasi, pengajuan diteruskan ke approver eskalasi setelah tenggat. SLA dihitung dalam **jam kerja**, bukan jam kalender (CAL-01).
- **A2a — Seluruh jalur eskalasi habis tanpa keputusan:** Berlaku `terminal_on_exhausted_escalation` pada definisi aturan (Lampiran D.5). Nilai bawaan `hold_and_alert`: pengajuan tetap menunggu, namun Administrator dan Petugas Sarpras dialarmi (NT-47) untuk tindakan manual. Pengajuan **tidak pernah** disetujui otomatis karena kelalaian approver.
- **A3 — Approver mendelegasikan:** Approver menetapkan pengganti untuk rentang tanggal tertentu (mis. cuti); pengajuan diarahkan ke pengganti dan tercatat sebagai delegasi. Linimasa tetap mencatat approver asli (RE-12).
- **A4 — Approver adalah pemohon itu sendiri:** Sistem otomatis melewati langkah tersebut dan mencatat `dilewati — konflik kepentingan` (BR-039). Bila **seluruh** langkah terlewati karena hal ini, pengajuan diarahkan ke *fallback approver* yang wajib ditetapkan pada aturan; bila tidak ditetapkan, berlaku role Administrator (RE-11).
- **A6 — Dua approver memutuskan bersamaan:** Keputusan pertama yang tersimpan mengikat; approver yang kalah menerima `409 APPROVAL_ALREADY_DECIDED` beserta identitas pemutus dan waktunya (RE-09, BR-041).
- **A5 — Objek tidak lagi tersedia saat persetujuan diberikan:** Sistem menolak persetujuan dan menampilkan penyebabnya kepada approver.

**Post Conditions** — Status pengajuan final atau berpindah ke langkah berikutnya; seluruh keputusan tercatat lengkap.

**Acceptance Criteria**
- [ ] Setiap keputusan menyimpan approver, waktu, keputusan, dan catatan.
- [ ] Approver hanya melihat pengajuan pada langkah yang menjadi kewenangannya.
- [ ] Penolakan pada langkah mana pun langsung mengakhiri alur.
- [ ] Approver dapat menyetujui langsung dari perangkat mobile.
- [ ] Sistem mencegah persetujuan ganda atas langkah yang sama (idempoten).

### FR-10.3 Riwayat & Pelacakan Persetujuan

| Aspek | Uraian |
|---|---|
| **Description** | Menampilkan jejak persetujuan lengkap suatu pengajuan sebagai linimasa. |
| **Actor** | Pemohon, Approver, Petugas Sarpras, Administrator, Pimpinan Sekolah |
| **Preconditions** | Terdapat instance approval |

**Main Flow**
1. Pengguna membuka detail pengajuan dan memilih tab Riwayat Persetujuan.
2. Sistem menampilkan linimasa: pengajuan dibuat → langkah 1 (approver, keputusan, waktu, catatan) → langkah berikutnya → keputusan final.
3. Sistem menampilkan indikator langkah yang sedang berjalan dan sisa waktu SLA.

**Alternative Flow**
- **A1 — Pemohon:** Hanya dapat melihat riwayat pengajuan miliknya sendiri.
- **A2 — Pengajuan yang mengalami eskalasi atau delegasi:** Linimasa menampilkan penanda khusus beserta alasannya.

**Post Conditions** — Tidak ada perubahan data.

**Acceptance Criteria**
- [ ] Linimasa menampilkan seluruh langkah termasuk yang dilewati beserta alasannya.
- [ ] Waktu ditampilkan dalam format lokal beserta durasi antar-langkah.

## 6. Business Rules

### Dimiliki modul ini

| Kode | Business Rule |
|---|---|
| BR-035 | Setiap pengajuan (reservasi, perpanjangan, pengadaan, penghapusan) wajib melalui approval engine. |
| BR-036 | Bila tidak ada aturan yang cocok, berlaku aturan bawaan berupa persetujuan satu level oleh Petugas Sarana Prasarana. |
| BR-037 | Bila beberapa aturan cocok, aturan dengan prioritas tertinggi yang digunakan. |
| BR-038 | Penolakan pada langkah mana pun langsung mengakhiri alur persetujuan. |
| BR-039 | Approver tidak boleh menyetujui pengajuannya sendiri; langkah tersebut dilewati otomatis dan dicatat sebagai konflik kepentingan. |
| BR-039a | Pengajuan tidak pernah disetujui otomatis akibat kekosongan approver maupun kelalaian approver. Bila seluruh langkah terlewati, berlaku *fallback approver* (RE-11); bila seluruh eskalasi habis, pengajuan ditahan dan dialarmi (Lampiran D.5). |
| BR-040 | Instance approval yang sedang berjalan tetap memakai *snapshot* aturan pada saat pengajuan dibuat, meskipun aturan diubah kemudian. |
| BR-041 | Bila approver ditetapkan berdasarkan role dan terdapat beberapa pengguna dengan role tersebut, keputusan pertama yang masuk bersifat mengikat. |
| BR-042 | Setiap keputusan persetujuan wajib menyimpan pelaku, waktu, keputusan, dan catatan; penolakan wajib disertai alasan. |
| BR-043 | Persetujuan tidak berlaku bila objek yang diminta sudah tidak tersedia pada saat keputusan dibuat. |

## 7. API Endpoints

### Endpoint

| Method | Endpoint | Permission | Deskripsi |
|---|---|---|---|
| GET | `/approval-rules` | `approval_rule.view` | Daftar aturan |
| POST | `/approval-rules` | `approval_rule.manage` | Buat aturan + langkah |
| POST | `/approval-rules/preview` | `approval_rule.manage` | Pratinjau aturan yang akan berlaku |
| GET | `/approvals/pending` | `approval.decide` | Pengajuan menunggu keputusan saya |
| POST | `/approvals/{id}/decide` | `approval.decide` | Setujui/tolak/minta revisi |
| POST | `/approvals/delegate` | `approval.delegate` | Tetapkan approver pengganti |
| GET | `/approvals/{id}/history` | `approval.view` | Linimasa persetujuan |

Konvensi umum, format respons, kode galat, dan ketentuan keamanan API:
[`../03-architecture/api-conventions.md`](../03-architecture/api-conventions.md).

## 8. Database Entity

### Entitas

| Entitas | Deskripsi | Atribut Utama | Keterangan |
|---|---|---|---|
| **approval_rules** | Aturan persetujuan | id, jenis_pengajuan, kondisi (JSON), prioritas, status_aktif, versi | Administrator |
| **approval_rule_steps** | Langkah dalam aturan | id, rule_id, urutan, approver_type, approver_role_id, approver_user_id, sla_jam, eskalasi_ke | Administrator |
| **approval_instances** | Instance persetujuan berjalan | id, jenis_pengajuan, referensi_id, rule_id, rule_snapshot (JSON), langkah_aktif, status, dibuat_pada, diselesaikan_pada | ± 3.500 |
| **approval_steps** | Keputusan per langkah | id, instance_id, urutan, approver_id, keputusan, catatan, diputuskan_pada, sla_deadline, dilewati, alasan_dilewati | ± 5.000 |

Model data menyeluruh dan ERD: [`../03-architecture/data-model.md`](../03-architecture/data-model.md).

## 9. Notification

### Notifikasi diterbitkan modul ini

| Kode | Event Pemicu | Penerima | Kanal | Wajib | Contoh Isi |
|---|---|---|---|:---:|---|
| **NT-01** | Pengajuan reservasi baru dibuat | Approver level aktif | In-app + Push | ✅ | "Pengajuan reservasi {nomor} dari {pemohon} menunggu persetujuan Anda." |
| **NT-02** | Pengajuan disetujui (level akhir) | Pemohon | In-app + Push | ✅ | "Reservasi {nomor} untuk {objek} pada {tanggal} telah disetujui." |
| **NT-03** | Pengajuan ditolak | Pemohon | In-app + Push | ✅ | "Reservasi {nomor} ditolak. Alasan: {alasan}." |
| **NT-04** | Pengajuan perlu revisi | Pemohon | In-app + Push | ✅ | "Reservasi {nomor} perlu direvisi. Catatan: {catatan}." |
| **NT-05** | Pengajuan naik ke level berikutnya | Approver level berikutnya | In-app + Push | ✅ | "Pengajuan {nomor} menunggu persetujuan Anda." |
| **NT-06** | SLA persetujuan terlampaui | Approver + Petugas Sarpras | In-app + Push | ✅ | "Pengajuan {nomor} melewati batas waktu persetujuan." |
| **NT-07** | Pengajuan dieskalasi | Approver eskalasi | In-app + Push | ✅ | "Pengajuan {nomor} dieskalasikan kepada Anda." |
| **NT-47** | Approval mencapai batas eskalasi terakhir | Petugas Sarpras + Administrator | In-app + Push | ✅ | "Pengajuan {nomor} tidak diputuskan hingga eskalasi terakhir dan memerlukan tindakan manual." |

Ketentuan umum kanal, latensi, dan preferensi: [`m17-notifications.md`](m17-notifications.md).

## 10. Permission

### Kode permission

| Kode | Domain | Deskripsi singkat | Role bawaan pemilik |
|---|---|---|---|
| `approval_rule.view` | Approval | Melihat aturan persetujuan | Admin, Pimpinan(view) |
| `approval_rule.manage` 🔒 | Approval | Membuat & mengubah aturan | Admin |
| `approval.view` | Approval | Melihat riwayat persetujuan | Semua (scope berbeda) |
| `approval.decide` | Approval | Menyetujui/menolak pengajuan | Sesuai approval rules |
| `approval.delegate` | Approval | Menetapkan approver pengganti | Approver aktif |

Katalog kanonik & aturan scope: [`../00-foundation/roles-permissions.md`](../00-foundation/roles-permissions.md).

## 11. Activity Log

### Aksi yang wajib dicatat

| Aksi | Keterangan |
|---|---|
| `APPROVAL_RULE_CREATED` / `APPROVAL_RULE_UPDATED` / `APPROVAL_RULE_DEACTIVATED` | Perubahan konfigurasi |
| `APPROVAL_INSTANCE_CREATED` | Termasuk aturan yang dipakai |
| `APPROVAL_DECIDED` | Keputusan beserta approver, catatan, dan level |
| `APPROVAL_STEP_SKIPPED` | Termasuk alasan (mis. konflik kepentingan) |
| `APPROVAL_ESCALATED` | Eskalasi akibat SLA terlampaui |
| `APPROVAL_DELEGATED` | Penetapan approver pengganti |

Prinsip, struktur entri, dan tamper-evidence: [`../03-architecture/activity-log.md`](../03-architecture/activity-log.md).

## 12. Acceptance Criteria

Kriteria penerimaan tercantum **inline** pada tiap Functional Requirement di bagian 5,
sesuai bentuk aslinya di PRD. Tidak diringkas maupun dipindahkan agar tidak terpisah dari
konteks requirement-nya.

Strategi pengujian: [`../06-quality/test-strategy.md`](../06-quality/test-strategy.md).

## 13. Dependencies

- [`m02-users.md`](m02-users.md) — M-02 Manajemen User & Role

## 14. Related Modules

- [`m02-users.md`](m02-users.md) — M-02 Manajemen User & Role

## 15. Open Issues

_Tidak ada isu terbuka._
