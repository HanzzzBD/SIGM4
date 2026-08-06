# Rujukan Keputusan Arsitektur (ADR)

**Proyek ini tidak memakai berkas ADR terpisah.** Keputusan arsitektur sudah tercatat di [`../../SDD/`](../../SDD/) dalam bentuk yang setara dengan ADR — dan lebih baik, karena tersusun menurut area, bukan menurut urutan kronologis penulisan.

Menambahkan berkas ADR akan menciptakan sumber kedua bagi keputusan yang sama. Suatu hari keduanya akan berbeda, dan tidak ada yang tahu mana yang berlaku.

---

## Di mana keputusan arsitektur berada

Setiap berkas SDD memuat bagian yang secara persis menjawab pertanyaan yang dijawab ADR:

| Pertanyaan ADR | Bagian SDD |
|---|---|
| Konteks — masalah apa yang dihadapi? | §1 Konteks |
| Keputusan — apa yang diputuskan? | §2 Keputusan Desain |
| Alasan — mengapa, dan apa yang ditolak? | §3 Alasan |
| Konsekuensi — apa akibatnya? | §5 Konsekuensi · §6 Risiko Teknis |

Setiap keputusan memiliki ID `SDD-<area>-<nomor>` yang dapat dirujuk dari kode, PR, dan review — persis fungsi nomor ADR.

## Cara merujuk keputusan

**Di dalam kode:**

```js
// Lock diurutkan menaik berdasarkan asset_id — SDD-AVL-05
```

**Di dalam PR:** bagian "Keputusan desain yang diterapkan" pada [`PULL-REQUEST.md`](PULL-REQUEST.md).

**Di dalam berkas phase:** bagian 5 "Referensi SDD".

Rujuk **ID**, bukan nomor bagian maupun jalur berkas. ID bertahan saat berkas dirapikan; nomor bagian tidak.

## Peta area → berkas

| Area | Kode | Berkas SDD |
|---|---|---|
| System Architecture | `SYS` | [`00-system-architecture.md`](../../SDD/00-system-architecture.md) |
| Availability & Concurrency | `AVL` | [`01-availability-concurrency.md`](../../SDD/01-availability-concurrency.md) |
| Approval Engine | `APR` | [`02-approval-engine.md`](../../SDD/02-approval-engine.md) |
| Authorization | `AUTH` | [`03-authorization.md`](../../SDD/03-authorization.md) |
| Authentication & Session | `SESS` | [`04-authentication-session.md`](../../SDD/04-authentication-session.md) |
| Database | `DB` | [`05-database-design.md`](../../SDD/05-database-design.md) |
| API | `API` | [`06-api-design.md`](../../SDD/06-api-design.md) |
| Event Flow | `EVT` | [`07-event-flow.md`](../../SDD/07-event-flow.md) |
| Notification | `NTF` | [`08-notification-design.md`](../../SDD/08-notification-design.md) |
| File Storage | `FS` | [`09-file-storage-design.md`](../../SDD/09-file-storage-design.md) |
| AI Orchestrator | `AI` | [`10-ai-orchestrator-design.md`](../../SDD/10-ai-orchestrator-design.md) |
| Frontend | `FE` | [`11-frontend-architecture.md`](../../SDD/11-frontend-architecture.md) |
| Mobile | `MOB` | [`12-mobile-architecture.md`](../../SDD/12-mobile-architecture.md) |
| Security | `SEC` | [`13-security-design.md`](../../SDD/13-security-design.md) |
| Performance | `PERF` | [`14-performance-design.md`](../../SDD/14-performance-design.md) |
| Observability | `OBS` | [`15-observability-logging.md`](../../SDD/15-observability-logging.md) |
| Infrastructure | `INF` | [`16-infrastructure-deployment.md`](../../SDD/16-infrastructure-deployment.md) |
| Repo Layout | `REPO` | [`17-repo-layout.md`](../../SDD/17-repo-layout.md) |

---

## Bila muncul keputusan arsitektur baru saat implementasi

Ini akan terjadi. Yang **tidak** boleh dilakukan: memutuskannya di dalam PR, di dalam log phase, atau di dalam komentar kode, lalu melanjutkan.

Alurnya:

```
1. Hentikan sebentar. Tentukan jenisnya:

   a. Pilihan teknis murni yang tidak mengubah perilaku sistem
      → arsitek memutuskan
      → tambahkan sebagai keputusan baru pada berkas SDD area terkait
      → catat di log phase bagian 2

   b. Menyentuh perilaku, aturan, atau kriteria penerimaan
      → BUKAN keputusan arsitektur. Ini perubahan requirement.
      → naikkan ke pemilik produk; PRD diperbarui lebih dulu
      → SDD menyesuaikan; baru implementasi dilanjutkan

   c. Bertentangan dengan PRD atau SDD yang ada
      → jangan diselesaikan sendiri
      → PRD berlaku di atas SDD; SDD berlaku di atas IMPLEMENTATION
      → naikkan ke pemilik dokumen yang lebih tinggi
```

**Cara membedakan (a) dan (b):** tanyakan apakah pengguna dapat mengetahui perbedaannya. Memilih Zod atau Valibot — pengguna tidak dapat tahu, itu (a). Mengubah apa yang terjadi ketika dua approver menekan tombol bersamaan — pengguna dapat tahu, itu (b).

**Keputusan yang tidak dapat diambil siapa pun di tim teknis** terkumpul di [`../../SDD/TBD-REGISTER.md`](../../SDD/TBD-REGISTER.md) kelompok A. Menebaknya, bahkan dengan tebakan yang masuk akal, memindahkan tebakan itu ke dalam kode tempat tidak ada yang akan menemukannya kembali.

---

*Berkas ini adalah penunjuk arah, bukan tempat menyimpan keputusan. Keputusan arsitektur tetap milik [SDD](../../SDD/).*
