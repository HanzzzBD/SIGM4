# Changelog — Implementation Documentation

Riwayat perubahan **dokumentasi implementasi**, bukan riwayat perubahan perangkat lunak. Riwayat perangkat lunak berada pada tag rilis `vMAJOR.MINOR.PATCH` (`CD-03`).

Perubahan pada [PRD](../PRD/) dan [SDD](../SDD/) tidak dicatat di sini — masing-masing memiliki riwayatnya sendiri.

---


## 2 September 2026 — Sinkronisasi turunan: alarm kuota & sisa rujukan `TBD-AI-D`

**Status TBD: 13 terbuka · 28 tertutup** — A (0) · B (13) · C (0) · D (0). **Tidak ada TBD yang dibuka maupun ditutup**; entri ini murni menyelaraskan lapisan turunan dengan dua keputusan yang sudah diambil hari itu (`SDD-AI-16`, `SDD-AI-17`).

Dua keputusan 2 September 2026 tidak seluruhnya mengalir ke bawah. Keputusan tier gratis (`SDD-AI-17`) menghapus tagihan, tetapi delapan tempat masih mendefinisikan alarm `OBS-05` sebagai *biaya harian Gemini API* — termasuk `SDD-15`, yang dicatat sebagai pemilik penyesuaian itu tetapi tidak pernah disunting. Penutupan `TBD-AI-D` (`SDD-AI-16`) juga menyisakan tiga klaim bahwa ia masih memblokir `GL-07`, salah satunya berselisih dengan paragraf empat baris di bawahnya pada berkas yang sama.

| Yang berubah | Berkas yang menyesuaikan |
|---|---|
| Alarm & metrik `OBS-05`: biaya harian → konsumsi kuota + batas laju penyedia | `SDD/15-observability-logging.md` §4.3 §4.6 §6 §8 · `SDD/10-ai-orchestrator-design.md` §4.1 §4.8 §6 §8 · `SDD/13-security-design.md` §4.1 §4.4 · `SDD/TBD-REGISTER.md` · `phases/phase-03.md` |
| Sisa rujukan `TBD-AI-D` sebagai penghalang `GL-07` dihapus | `IMPLEMENTATION-STATUS.md` (baris tabel *Penghalang aktif*) · `phases/phase-03.md` · `SDD/10-ai-orchestrator-design.md` §5 |
| Hitungan register diselaraskan `13 terbuka · 28 tertutup` | `UX/UX-SPEC.md` §Tindak lanjut |
| Kalimat menggantung sisa `TBD-AI-D` terbuka | `ROADMAP.md` §8 |
| Requirement PRD `AI-CTL-08`, `OBS-05`, Bab 22.1, Bab 27.9 | dicatat di `PRD/CHANGELOG.md`, bukan di sini |

**Tidak ada keputusan, requirement, angka ambang, maupun ID baru.** `TBD-AI-C` tetap terbuka dan tetap tanpa angka — yang berubah hanya rumusan pertanyaannya, mengikuti `SDD-AI-17`. Register kini mencatatnya menyentuh `SDD-10` **dan** `SDD-15`.

**Dampak pada lintasan kritis:** tidak ada. Total PR tetap **163**; tidak ada PR bertambah, berpindah phase, atau berubah kompleksitas.

---


## 2 September 2026 — `TBD-AI-D` tertutup & tier gratis diizinkan

**Status TBD: 13 terbuka · 28 tertutup** — A (0) · B (13) · C (0) · D (0). Satu TBD ditutup; **kelompok A kembali kosong**.

Dua keputusan pemilik produk pada hari yang sama. `TBD-AI-D` — dibuka pagi itu juga oleh migrasi penyedia LLM — ditutup oleh surat pernyataan Kepala Sekolah (`SDD-AI-16`), sehingga `GL-07` bagian chatbot terbuka. Nomor suratnya **belum dicatat** — ditandai TBD di `SDD-AI-16` dan wajib dilengkapi sebelum `GL-07` diperiksa. Terpisah dari itu, sekolah tidak menganggarkan biaya chatbot dan memilih **tier gratis** (`SDD-AI-17`), yang menuntut `DP-AI-04` disunting di PRD lebih dulu.

| Yang berubah | Berkas yang menyesuaikan |
|---|---|
| `TBD-AI-D` tertutup; kelompok A kosong | `SDD/TBD-REGISTER.md` · `SDD/10-ai-orchestrator-design.md` · `ROADMAP.md` §8 · `IMPLEMENTATION-STATUS.md` · `README.md` · `../../CLAUDE.md` |
| Dua keputusan SDD baru: `SDD-AI-16` (persetujuan) dan `SDD-AI-17` (tier) | `SDD/10-ai-orchestrator-design.md` §2 |
| Requirement PRD `DP-AI-04`, `AI-SEC-08`, Bab 22.1, `AS-15`, `RS-21`, Bab 27.9 | dicatat di `PRD/CHANGELOG.md`, bukan di sini |

**Dampak pada lintasan kritis:** tidak ada. Tidak ada PR yang berubah lingkupnya; `PR-03-20` … `PR-03-23` dan `PR-05-25` tetap seperti rencana. Yang berubah adalah kredensial yang dipakai dan sebuah gerbang rilis yang tidak lagi tertahan.

**Dua butir sengaja dibiarkan terbuka** dan dicatat di `PRD/CHANGELOG.md`: penyaringan PII pada teks bebas pengguna, dan ID risiko tersendiri bagi pemakaian isi percakapan oleh penyedia. Keduanya menunggu keputusan pemilik produk, bukan pengukuran.

---


## 2 September 2026 — Migrasi penyedia LLM: Claude API → Google Gemini

**Status TBD: 14 terbuka · 27 tertutup** — A (1) · B (13) · C (0) · D (0). Satu TBD **dibuka**, tidak ada yang ditutup.

Keputusan pemilik produk memindahkan chatbot M-19 dari Claude API ke **Google Gemini Developer API — paid tier**, model **`gemini-3.6-flash`** (stabil/GA). Tier gratis dilarang untuk data SIGM4 karena isinya dapat dipakai penyedia untuk meningkatkan produk; alias `latest`, versi preview, dan eksperimental dilarang karena siklus hidupnya tidak menjamin perilaku tetap.

| Keputusan | Isi | Berkas yang menyesuaikan |
|---|---|---|
| Permukaan API | **Interactions API** (`interactions.create`) dengan **`store: false`** — tidak ada state percakapan di sisi penyedia; riwayat tetap milik SIGM4. Konsekuensi yang diterima: `previous_interaction_id` tidak dipakai dan hanya *implicit caching* tersedia | `SDD-10` (**`SDD-AI-14`** baru) |
| Tool bawaan penyedia | **Dilarang seluruhnya** — Google Search, Maps, File Search, Code Execution, URL Context, Computer Use, MCP jarak jauh. Hanya 12 custom function Bab 22.3 | `SDD-10` (**`SDD-AI-15`** baru) |
| Ambang caching | 1.024 → **4.096 token** (ambang Gemini 3.x), sasaran ≥ 4.500 | `SDD-10` (`SDD-AI-05`, `SDD-AI-13`) · `phases/phase-03.md` · `phases/phase-05.md` · `logs/phase-03.md` |
| Anggaran token masukan | `AI-CTL-02` **±8.000 → ±16.000** — tanpa kenaikan ini awalan statis memakan lebih dari separuh jendela dan riwayat 10 pesan tidak lagi muat | `PRD/03-architecture/ai-features.md` · `SDD-10` §4.8 |
| Thinking | `thinking: disabled` + `effort: "low"` → **`thinking_level: "minimal"`**. Thinking tidak dapat dimatikan penuh pada model ini; bawaannya `"medium"` | `SDD-10` (`SDD-AI-02`) · `phases/phase-03.md` |
| Residensi data | Penyedia tidak menjaminnya. **`TBD-AI-D` dibuka** (kelompok A) beserta risiko **`RS-21`**; memblokir `GL-07`, tidak memblokir satu PR pun | `SDD/TBD-REGISTER.md` · `PRD/01-product/assumptions-risks.md` · `ROADMAP.md` · `IMPLEMENTATION-STATUS.md` |

| Berkas | Perubahan |
|---|---|
| `SDD/10-ai-orchestrator-design.md` | Ditulis ulang untuk Gemini. `SDD-AI-01` … `SDD-AI-13` tetap pada topiknya masing-masing; `SDD-AI-14` dan `SDD-AI-15` baru. §4.2 bentuk permintaan, §4.3 loop `function_call`/`function_result`, §4.4 tabel `status` menggantikan `stop_reason`, §4.5 galat `ApiError`, §4.6 `usage.total_cached_tokens` menggantikan `cache_read_input_tokens` |
| `PRD/03-architecture/ai-features.md` | 22.1 penyedia & model; 22.1 pola integrasi menegaskan backend yang mengeksekusi tool; `AI-CTL-02` naik ke ±16.000; `AI-SEC-08` menyebut paid tier, larangan tier gratis, dan celah residensi |
| `PRD/01-product/assumptions-risks.md` | `AS-15` dan `RS-08` menyebut Gemini paid tier; **`RS-21`** baru (residensi data) |
| `PRD/02-modules/m19-chatbot.md` · `PRD/03-architecture/system-overview.md` · `PRD/03-architecture/deployment-ops.md` | Label diagram `Claude API` → `Gemini API`; sekuens memakai `function_call`/`function_result`; `OBS-05`, `SEC-CFG-02`, dan tabel biaya 27.9 menyebut Gemini |
| `SDD/13-security-design.md` · `SDD/15-observability-logging.md` · `SDD/16-infrastructure-deployment.md` | Kunci pihak ketiga & rotasi menyebut Gemini; alarm biaya harian Gemini; **`ANTHROPIC_API_KEY` → `GEMINI_API_KEY`**; metrik **`chat_thought_tokens_total`** baru sebagai bukti `thinking_level` tidak diam-diam kembali ke bawaan |
| `phases/phase-03.md` | `PR-03-20` … `PR-03-22` menyesuaikan rujukan `SDD-AI-*`; task breakdown `PR-03-20` ditulis ulang; risiko `store: true` ditambahkan; gerbang keluar menyebut `TBD-AI-D` |
| `phases/phase-05.md` · `logs/phase-03.md` | Nama field usage dan angka ambang awalan statis |
| `SDD/TBD-REGISTER.md` · `SDD/README.md` · `ROADMAP.md` · `IMPLEMENTATION-STATUS.md` | Hitungan **14 · 27**; kelompok A menjadi **1** |

**Dampak pada lintasan kritis: tidak ada.** Total PR tetap **163**; tidak ada PR bertambah, berpindah phase, maupun berubah kompleksitas. `TBD-AI-D` menunggu di gerbang go-live `GL-07`, bukan di depan sebuah PR — Phase 03 tetap membangun dan mengevaluasi chatbot seperti direncanakan.

**Requirement yang berubah:** `AI-CTL-02` (angka anggaran token) dan `AI-SEC-08` (ketentuan tier & residensi), keduanya disetujui pemilik produk sebagai bagian dari keputusan migrasi. Satu risiko baru (`RS-21`). Tidak ada business rule, permission, endpoint, maupun aksi activity log baru — chatbot tetap read-only (`BR-075`), tetap difilter di lapisan kueri (`BR-076`), dan tetap berhenti pada 5 iterasi tool (`AI-CTL-03`).

**Yang tidak berubah, dan itu disengaja.** Batas keamanan chatbot tidak ikut dipindahkan: `ToolExecutor` tetap satu-satunya jalur eksekusi tool, setiap tool tetap menerima `AuthContext`, hasil tool tetap melewati allow-list dan pembungkusan data anti-injeksi, dan tidak ada tool tulis. Migrasi ini mengganti penyedia, bukan model ancamannya — karena itu `SDD-AI-06` justru dipertegas menjadi larangan eksplisit atas *automatic function calling* SDK, dan `SDD-AI-15` menutup pintu tool sisi-server yang sebelumnya tidak perlu disebut karena tidak ada.

---


## 25 Agustus 2026 — Batch TBD 4: reservasi, privasi & AI

**Status TBD: 13 terbuka · 27 tertutup** — A (0) · B (13) · C (0) · D (0). Empat TBD ditutup pemilik produk. **Kelompok A dan D kosong.**

| TBD | Keputusan | Berkas yang menyesuaikan |
|---|---|---|
| `TBD-AVL-B` | Endpoint reservasi **tetap satu rumpun `/reservations`**; pemisahan per jenis ditolak | `SDD-01` §8 · `PRD/02-modules/m07-reservation-room.md` §15 · `UX` (**UXD-15**) |
| `TBD-FS-A` | Foto berwajah **dipertahankan sebagai bukti** — tidak dikaburkan, tidak dihapus. **Wajib** dinyatakan pada Pemberitahuan Privasi | `PRD/03-architecture/privacy-compliance.md` (**`DP-05a`** baru) · `SDD-09` (`SDD-FS-11`, §4.6) · `SDD-13` §4.7 · `UX` (**UXD-14**) |
| `TBD-BHN-E` | **Dua tool bahan** masuk katalog 22.3; diimplementasikan Phase 05, bukan Phase 03 | `PRD/03-architecture/ai-features.md` §22.3 · `SDD-10` §5 · `phases/phase-05.md` (**`PR-05-25`** baru) |
| `TBD-AI-A` | Prefiks statis **diperkaya dengan isi yang berguna**, sasaran ≥ 1.200 token; uji memverifikasi panjang **dan** cache benar-benar kena | `SDD-10` (`SDD-AI-05` disesuaikan, `SDD-AI-13` baru) |

| Berkas | Perubahan |
|---|---|
| `PRD/03-architecture/privacy-compliance.md` | **`DP-05a` ditambahkan** — foto berwajah tidak ikut dipseudonimkan; kewajiban menyatakannya pada Pemberitahuan Privasi melekat pada aturan itu sendiri |
| `PRD/03-architecture/ai-features.md` | Dua baris tool pada 22.3 + catatan penempatan Phase 05 dan konsekuensi pembatalan cache |
| `SDD/09-file-storage-design.md` · `SDD/13-security-design.md` | `SDD-FS-11` + alasan; baris §4.6 dan komentar SQL §4.7 tidak lagi menunjuk TBD. **Seluruh TBD `SDD-13` tertutup** |
| `SDD/10-ai-orchestrator-design.md` | `SDD-AI-05` memperoleh sasaran ≥ 1.200; `SDD-AI-13` + alasan; §5 menyebut penerapan pertama pembatalan cache |
| `phases/phase-05.md` | **`PR-05-25`** (tool chatbot bahan, `S`); risiko `TBD-FS-A` ditutup dan diganti risiko pembatalan cache; satu baris rollback |
| `DELIVERY-PLAN.md` · `IMPLEMENTATION-STATUS.md` · `IMPLEMENTATION/README.md` · `README.md` akar · `CLAUDE.md` · `scripts/validate_impl.py` | Total PR **162 → 163** |
| `UX/DECISIONS.md` | **UXD-14** dan **UXD-15** pindah ke §12.2. **§12.3 kini kosong** — tidak ada lagi keputusan `BLOCKED` |
| `SDD/TBD-REGISTER.md` · `SDD/README.md` · `ROADMAP.md` · `UX-SPEC.md` | Hitungan 13 · 27; kelompok A dan D menjadi 0 |

**Dampak pada lintasan kritis:** `PR-03-04` … `PR-03-08`, `PR-03-21`, `PR-03-22`, dan `PR-04-01` tidak lagi terhalang. **Tidak ada phase yang tertahan TBD.** Tiga belas TBD kelompok B tetap terbuka dan tetap tidak memblokir — seluruhnya parameter yang dikalibrasi Phase 07–08 setelah data staging tersedia.

**Requirement baru yang lahir dari batch ini:** `DP-05a` dan dua baris tool pada 22.3, keduanya disetujui pemilik produk sebagai bagian dari keputusan `TBD-FS-A` dan `TBD-BHN-E`. Tidak ada business rule, permission, endpoint, maupun aksi activity log baru — Lampiran C tetap 78 dan katalog endpoint tetap 119.

**Satu PR bertambah, dan itu disengaja.** `PR-05-25` ada karena tool bahan tidak dapat dibangun pada Phase 03: M-22 baru hadir Phase 05 (Keputusan #26). Menempatkannya di Phase 03 akan menuntut repository yang belum ada; menempatkannya di Phase 05 menjaga urutan itu utuh dan membatasi pembatalan prompt cache menjadi satu kali yang terjadwal.

---

## 25 Agustus 2026 — Batch TBD 3: approval & notifikasi

**Status TBD: 17 terbuka · 23 tertutup** — A (3) · B (13) · C (0) · D (1). Empat TBD ditutup pemilik produk.

| TBD | Keputusan | Berkas yang menyesuaikan |
|---|---|---|
| `TBD-APR-A` | `fallback_approver` menjadi field **opsional tingkat aturan**; kosong berarti role Administrator | `PRD/03-architecture/approval-rule-dsl.md` (D.5 + `RE-11`) · `PRD/02-modules/m10-approval.md` (A4) · `SDD-02` (`SDD-APR-13`) · `UX` (**UXD-09**, §7.6.5) |
| `TBD-APR-B` | `CAL-01` ditegaskan apa adanya — SLA memakai jam operasional terkonfigurasi. **Tidak ada** kalender administratif kedua | `SDD-02` (`SDD-APR-15`). Tidak ada perubahan PRD |
| `TBD-APR-C` | Langkah dengan approver nonaktif **dilewati** beralasan `approver nonaktif`, lalu jatuh ke jalur fallback `RE-11` yang sama. Penonaktifan pengguna tidak pernah tertahan instance berjalan | `PRD/03-architecture/approval-rule-dsl.md` (**`RE-13`** baru) · `SDD-02` (`SDD-APR-14`, §4.4 `activate`) |
| `TBD-NTF-B` | Arsip notifikasi **dapat dibaca pemiliknya** lewat filter arsip pada P-13 | `SDD-08` (`SDD-NTF-10`, §4.6) · `UX` (**UXD-10**, §7.6.8) |

| Berkas | Perubahan |
|---|---|
| `PRD/03-architecture/approval-rule-dsl.md` | `RE-11` berhenti menyebut *fallback approver* "wajib" sekaligus mengatur "bila tidak ditetapkan" — dua klausa yang saling meniadakan. `fallback_approver` masuk ke tabel field D.5 sebagai opsional. **`RE-13` ditambahkan** |
| `PRD/02-modules/m10-approval.md` | Kalimat A4 diselaraskan dengan `RE-11` yang baru dan menunjuk `RE-13` |
| `SDD/02-approval-engine.md` | Tiga keputusan (`SDD-APR-13/14/15`) + alasan; §4.3 menandai jalur fallback; §4.4 memperoleh blok `activate()` yang menyaring approver nonaktif. **Seluruh TBD berkas ini tertutup** |
| `SDD/08-notification-design.md` | `SDD-NTF-10` + §4.6 memperoleh indeks `notifications_archive_owner` dan ketentuan parameter kueri |
| `UX/PAGE-SPECIFICATION.md` | Dua baris `BLOCKED` terakhir (§7.6.5, §7.6.8) terisi; satu baris peringatan approver nonaktif pada panel Pratinjau |
| `UX/DECISIONS.md` | **UXD-09** dan **UXD-10** pindah ke §12.2; keputusan terbuka 4 → 2 |
| `SDD/TBD-REGISTER.md` · `SDD/README.md` · `ROADMAP.md` · `IMPLEMENTATION-STATUS.md` · `README.md` · `UX-SPEC.md` | Hitungan 17 · 23, kelompok A 3; penghalang Phase 02 dihapus |

**Dampak pada lintasan kritis:** `PR-02-20`, `PR-02-22`, dan `PR-02-25` tidak lagi terhalang. **Phase 00, 01, dan 02 kini bebas TBD sepenuhnya.** Yang tersisa hanya menghadang Phase 03.

**Requirement baru yang lahir dari batch ini:** satu aturan `RE-13` dan satu field opsional pada skema D.5, keduanya disetujui pemilik produk sebagai bagian dari keputusan `TBD-APR-C` dan `TBD-APR-A`. Tidak ada business rule, permission, endpoint, maupun aksi activity log baru — Lampiran C tetap 78 dan katalog endpoint tetap 119.

**Pertentangan yang diperbaiki, bukan hanya ditutup:** `RE-11` menyatakan *fallback approver* wajib **dan** mengatur perilaku bila ia tidak ada. Pertentangan itu sudah ada sebelum batch ini dan akan menghasilkan dua implementasi yang sama-sama dapat dibenarkan. Ia kini berbunyi satu arah.

---

## 25 Agustus 2026 — Batch TBD 2: otorisasi & outbox

**Status TBD: 21 terbuka · 19 tertutup** — A (7) · B (13) · C (0) · D (1). Dua TBD ditutup pemilik produk.

| TBD | Keputusan | Berkas yang menyesuaikan |
|---|---|---|
| `TBD-AUTH-C` | Mekanisme teknis boleh ditetapkan di tingkat SDD **bila lolos uji tiga syarat** — tidak mengubah perilaku teramati, tidak menyentuh empat katalog satu-pemilik, dan semata menjadi cara memenuhi requirement yang sudah ada. `role_version` lolos | `SDD-03` (`SDD-AUTH-11`, §3, §8) |
| `TBD-EVT-B` | Dead letter **terlihat, tanpa tombol proses ulang**. Kartu peringatan baca-saja pada Dashboard Administrator lewat `GET /dashboard` yang sudah ada; pemrosesan ulang tetap operasional | `SDD-07` (`SDD-EVT-10`, §3, §6, §8) · `SDD-15` (§8) · `PRD/04-frontend/dashboards.md` §19.2 · `UX/DECISIONS.md` (**UXD-13**) · `UX/PAGE-SPECIFICATION.md` §8.3.1 |

| Berkas | Perubahan |
|---|---|
| `PRD/04-frontend/dashboards.md` | Kartu **Efek Tertunda Gagal** ditambahkan ke 19.2 — spesifikasi antarmuka, bukan business rule; tidak ada permission, endpoint, maupun aksi log baru |
| `SDD/07-event-flow.md` §6 | Mitigasi dead letter salah merujuk `OBS-06` (pemeriksaan `/health`, kartu "Kesehatan Integrasi" berisi status LLM/FCM). Dikoreksi ke `OBS-05` + `SDD-OBS-07` + `SDD-EVT-10`, dengan catatan kekeliruannya |
| `UX/DECISIONS.md` | **UXD-13** pindah dari §12.3 ke §12.2; hitungan keputusan terbuka 5 → 4 |
| `UX/PAGE-SPECIFICATION.md` §8.3.1 | Satu baris kartu tanpa sasaran drill-down — daftarnya tampil di kartu |
| `SDD/TBD-REGISTER.md` · `SDD/README.md` | Dua baris ke **Tertutup**; hitungan 21 · 19, kelompok A 7 |
| `IMPLEMENTATION/ROADMAP.md` · `IMPLEMENTATION-STATUS.md` · `README.md` | Penghalang Phase 01 dihapus; klaim jangkauan TBD kelompok A diperbarui |
| `UX/UX-SPEC.md` | Tindak lanjut #2 dan #3 disesuaikan |

**Dampak pada lintasan kritis:** `PR-01-04` (matriks permission + `role_version`) dan `PR-01-10` (`system_settings`) tidak lagi terhalang. **Phase 00 dan Phase 01 kini bebas TBD sepenuhnya.** Tujuh TBD kelompok A yang tersisa menghadang Phase 02–03.

**Requirement baru yang lahir dari batch ini:** satu baris kartu pada 19.2, disetujui pemilik produk sebagai bagian dari keputusan `TBD-EVT-B`. Tidak ada business rule, permission, endpoint, maupun aksi activity log baru — hitungan Lampiran C tetap 78 dan katalog endpoint tetap 119.

---

## 25 Agustus 2026 — Batch TBD 1: infrastruktur & kepatuhan

**Status TBD: 23 terbuka · 17 tertutup** — A (9) · B (13) · C (0) · D (1). Dua TBD ditutup pemilik produk.

| TBD | Keputusan | Berkas yang menyesuaikan |
|---|---|---|
| `TBD-SEC-B` | Kepatuhan formal terbatas pada UU PDP No. 27/2022, **tanpa** standar dinas pendidikan tambahan — disertai kewajiban **residensi data wilayah Indonesia** bagi seluruh layanan pihak ketiga yang menerima data | `PRD/00-foundation/decisions.md` (Keputusan #29) · `SDD-13` (`SDD-SEC-10`, §3, §5, §6, §8) · `SDD-15` (`SDD-OBS-10`, §3, §5, §8) |
| `TBD-INF-A` | **VPS ber-region Indonesia** untuk API/worker/Redis/reverse proxy + **PostgreSQL terkelola** ber-region Indonesia. Docker Compose tetap (`SDD-INF-10`); pengecualian Kubernetes `INF-05` tidak berlaku. Sizing & biaya tetap menunggu uji beban bersama `TBD-AVL-C` | `SDD-16` (`SDD-INF-11`, §3, §4.2, §4.5, §5, §6, §8) |

| Berkas | Perubahan |
|---|---|
| `SDD/TBD-REGISTER.md` | Dua baris dipindah ke **Tertutup**; hitungan menjadi 23 · 17, kelompok A 9 dan B 13; paragraf pengecualian `TBD-INF-A` disesuaikan |
| `SDD/README.md` | Hitungan TBD dan tabel kelompok disesuaikan |
| `IMPLEMENTATION/ROADMAP.md` §8 | Dua baris ditandai tertutup; dua paragraf "maju ke Phase 00" ditulis ulang menjadi catatan penutupan; klaim "sembilan dari sepuluh" diperbaiki |
| `IMPLEMENTATION/IMPLEMENTATION-STATUS.md` | Dua penghalang Phase 00 dihapus; `TBD-SEC-B` dicabut dari penghalang Phase 08; hitungan disesuaikan |
| `IMPLEMENTATION/README.md` | Butir risiko nomor 1 dan hitungan TBD disesuaikan |

**Dampak pada lintasan kritis:** `PR-00-06` (perkakas observability) dan `PR-00-18` (deploy staging) tidak lagi terhalang. **Phase 00 kini bebas TBD sepenuhnya.** Sembilan TBD kelompok A yang tersisa seluruhnya menghadang Phase 01–03.

**Yang sengaja tidak diputuskan di sini:** sizing instance, tier langganan, dan angka biaya (PRD 27.3, 27.9) tetap milik `TBD-AVL-C` dan ditetapkan setelah uji beban `NFR-P-09` — memilih penyedia bukan memilih ukurannya.

---

## 2026-08-25 — Sinkronisasi hitungan pasca-M-22 & jadwal `TBD-INF-A`

Sapuan lanjutan atas hitungan yang tertinggal setelah M-22 masuk 23 Agustus. Sinkronisasi 24 Agustus menutup hitungan TBD dan papan skor UX, tetapi tidak menyentuh permission, endpoint, maupun katalog notifikasi. **Tidak ada requirement, business rule, permission, endpoint, maupun keputusan baru** — seluruhnya penyelarasan angka, path, dan jadwal.

| Berkas | Perubahan |
|---|---|
| `phases/phase-00.md` | Seed permission tertulis **71** pada tiga tempat dan **70** pada task breakdown `PR-00-16`; Lampiran C.2 berisi **78** kode sejak M-22 menambah tujuh `material.*`. Diseragamkan ke 78 |
| `ROADMAP.md` §8 · `IMPLEMENTATION-STATUS.md` | `TBD-INF-A` dijadwalkan bersama kelompok B — "Phase 07–08, setelah data staging ada" — padahal `PR-00-18` justru yang membangun staging dan lingkungannya menuntut penyedia terpilih. Dimajukan ke **sebelum `PR-00-18`**; kelompok dan pertanyaannya tidak berubah |
| `scripts/allocation_map.py` | `OPEN_ISSUES` menyimpan salinan *hardcoded* bagian 15 tiap modul dan sudah menyimpang dari sumbernya (`NT-48` vs `NT-51`; "barang" vs "aset"). Diganti pembacaan langsung dari `docs/PRD/02-modules/<slug>.md`, sehingga bagian D `traceability.md` ikut terkoreksi saat regenerasi |

Penyelarasan di luar `IMPLEMENTATION/` yang menyertainya, dicatat pada riwayat lapisan masing-masing:

- **PRD** — `roles-permissions.md` (71 → 78 kode), `m17-notifications.md` (`NT-48` → `NT-51`, path indeks), `m18-activity-log.md` (path indeks), `README.md` (label empat indeks); seluruhnya masih menunjuk `03-architecture/` padahal indeks digenerate ke `_generated/`
- **SDD** — `05` (71 → 78 kode), `06` (93 → 119 endpoint, dua tempat), `08` (katalog `NT-48` → `NT-51`, 49 → 52 baris), `README` (kelompok A 9 → 10, sesuai `TBD-REGISTER`), `TBD-REGISTER` (catatan pengecualian jadwal `TBD-INF-A`)

**Status TBD: 25 terbuka · 15 tertutup** — A (10) · B (14) · C (0) · D (1). Tidak ada TBD yang ditutup pada perubahan ini.

---

## 2026-08-24 — Sinkronisasi hitungan & pemulihan `audit_docs.py`

Audit kesiapan dokumentasi menemukan enam selisih yang tertinggal setelah penutupan TBD 22 Agustus dan masuknya M-22 pada 23 Agustus. **Tidak ada requirement, business rule, maupun keputusan baru** — seluruhnya penyelarasan angka dan penerusan keputusan yang sudah diambil.

| Berkas | Perubahan |
|---|---|
| `scripts/audit_docs.py` | Dilepaskan dari `PRD.v1.1.full.md` yang dihapus di `a00993f`; skrip berhenti dengan `FileNotFoundError` sejak itu. Perbandingan arsip diganti pemeriksaan invarian: FR terdefinisi & tidak ganda, aturan satu pemilik (BR · NT · endpoint · aksi log), tautan silang, struktur 15 bagian |
| `IMPLEMENTATION-STATUS.md` · `ROADMAP.md` §8 · `phases/phase-02.md` · `phases/phase-04.md` | `TBD-NTF-A`, `TBD-FE-B`, `TBD-MOB-B` masih terdaftar sebagai penghalang terbuka padahal ditutup 22 Agustus (**UXD-05**, **UXD-12**, **UXD-11**). Diganti rujukan ke keputusan yang menutupnya |
| `ROADMAP.md` §8 | `TBD-BHN-E` — dibuka 23 Agustus bersama M-22 — belum punya baris jadwal. Ditambahkan: memblokir `PR-03-21` (katalog tool chatbot), sebelum Phase 03 |
| `CLAUDE.md` · `README.md` · `IMPLEMENTATION-STATUS.md` · `SDD/README.md` · `SDD/TBD-REGISTER.md` · `UX/UX-SPEC.md` | Hitungan TBD berbeda di lima tempat (27 · 25 · 24) dan kelompok A tertulis 9 padahal tabelnya 10 baris. Diseragamkan menjadi **25 terbuka · 15 tertutup**, kelompok A **10** — sembilan di antaranya memblokir Phase 01–03 |

Penyelarasan di luar `IMPLEMENTATION/` yang menyertainya — papan skor UX-SPEC §13, pola subgrup kartu `DESIGN/PATTERNS.md §3.5` (**UXD-18**), dan kriteria keluar `M4` untuk saldo bahan — dicatat pada riwayat lapisan masing-masing.

**Status TBD: 25 terbuka · 15 tertutup** — A (10) · B (14) · C (0) · D (1).

---

## 2026-08-23 — Domain Bahan masuk lingkup (M-22)

Menyusul perubahan lingkup yang diputuskan di PRD ([`bahan-scope-change.md`](../PRD/01-product/bahan-scope-change.md), Keputusan Kunci #17–#28), domain Bahan masuk rilis berjalan sebagai **M-22 Manajemen Bahan**. Perubahan pada dokumentasi implementasi:

| Berkas | Perubahan |
|---|---|
| `ROADMAP.md` | M-22 → Phase 05, milestone `M4`; peta modul dan validasi graf menjadi 22/22 |
| `phases/phase-05.md` | Modul PRD bertambah M-22; **10 PR baru** `PR-05-15`…`PR-05-24`; dependensi, risiko, rollback, dan gerbang keluar disesuaikan |
| `DELIVERY-PLAN.md` | Total **21 → 22 modul**, **152 → 162 PR**; `PR-05-17` (ledger saldo) masuk daftar PR bertulang-punggung |
| `IMPLEMENTATION-STATUS.md` · `README.md` | Hitungan modul dan PR |
| `phases/phase-06.md` · `phases/phase-07.md` | Gerbang keluar menyebut 22 modul |

**Perubahan di luar folder ini yang menjadi konsekuensinya:** `scripts/validate_impl.py` mengunci `range(1, 22)` dan `total == 152` sebagai nilai harfiah, sehingga skrip itu **wajib** ikut disunting menjadi `range(1, 23)` dan `total == 162`. Tanpa itu, penambahan M-22 ke header phase membuat validasi gagal. `CLAUDE.md` dan `README.md` akar juga memuat hitungan yang sama.

**Catatan urutan.** Penulisan modul, penambahan PR, dan pembaruan hitungan harus terjadi dalam satu langkah. Berkas modul yang ada tanpa PR penampung, atau PR yang ada tanpa pembaruan ambang validator, sama-sama membuat `validate_impl.py` merah.

---

## 2026-08-06 — Penutupan TBD kelompok C

Delapan TBD kelompok C ("pilihan teknis murni — dapat diputuskan arsitek") ditutup. **Tidak ada requirement, business rule, maupun kriteria penerimaan yang berubah**; seluruhnya pilihan bentuk kode dan perkakas. Keputusannya dicatat pada berkas SDD pemiliknya — proyek ini tidak memakai berkas ADR terpisah ([`templates/ADR-REFERENCE.md`](templates/ADR-REFERENCE.md)).

### Diubah

**TBD tertutup** — ID keputusan SDD yang menjadi pemiliknya:

| TBD | Pemilik |
|---|---|
| `TBD-AUTH-A` | Dikonfirmasi — `SDD-SESS-03/04/06` (tanpa butir baru; penyimpanan PostgreSQL sudah beralamat di sana) |
| `TBD-DB-A` | `SDD-DB-12` — runner SQL siap pakai atas berkas `.sql` bernomor |
| `TBD-API-A` | `SDD-API-11` — Zod |
| `TBD-API-B` | `SDD-API-12` — `/api/docs` tetap dilarang di produksi; `openapi.json` jadi artefak rilis |
| `TBD-FE-A` | `SDD-FE-11` (TanStack Query) · `SDD-FE-12` (primitif headless + token sendiri) |
| `TBD-MOB-A` | `SDD-MOB-10` — Expo SDK + EAS Update |
| `TBD-OBS-A` | `SDD-OBS-09` — OpenTelemetry + backend terkelola |
| `TBD-INF-B` | `SDD-INF-10` — Docker Compose |

**TBD dibuka** — satu, kelompok B:

- `TBD-SESS-B` — retensi & pembersihan baris `refresh_tokens`; lahir sebagai konsekuensi tercatat, bukan keputusan yang ditunda. Berkaitan dengan `TBD-EVT-A` dan `TBD-AVL-A`.

**Penjadwalan ulang**

- `ROADMAP.md` §8 — `TBD-SEC-B` maju dari "sebelum Phase 08" menjadi **sebelum `PR-00-06`**: `SDD-OBS-09` mengirim log aplikasi ke luar premis sejak logger terstruktur dipasang, sehingga lingkup kepatuhan harus diketahui saat perkakas dipilih
- `phases/phase-03.md` §10 — risiko baru: lantai OS lini Expo di atas `NFR-C-03`; bila terjadi, itu **perubahan requirement**, bukan keputusan SDD
- `phases/phase-02.md`, `logs/phase-00.md` — rujukan TBD yang sudah tertutup diganti ID SDD-nya
- Hitungan TBD diperbarui di `README.md`, `IMPLEMENTATION-STATUS.md`, dan `ROADMAP.md` §8

**Status TBD: 27 terbuka · 8 tertutup** — A (12) · B (14) · C (0) · D (1).

---

## 2026-08-06 — Penyusunan awal

Lapisan IMPLEMENTATION dibangun di atas PRD dan SDD yang sudah selesai. Tidak ada requirement, keputusan desain, maupun business rule yang ditambahkan, dipindahkan, atau diubah.

### Ditambahkan

**Perencanaan**

- `ROADMAP.md` — graf dependensi phase & modul, alasan urutan, pemetaan phase ⇄ milestone PRD, lintasan kritis, jadwal penutupan TBD
- `DELIVERY-PLAN.md` — urutan PR lintas phase, jalur kerja paralel, cakupan SDD, strategi migrasi, urutan pengujian & penempatan
- `BRANCHING-STRATEGY.md` — diturunkan dari `CD-03`; penamaan cabang, aturan penggabungan, alur review, DoD tingkat PR
- `RELEASE-PLAN.md` — bentuk rilis, pemetaan gerbang → phase, urutan rilis produksi, urutan cutover, strategi rollback

**Pelaksanaan**

- `phases/phase-00.md` … `phase-08.md` — sembilan phase, masing-masing 12 bagian baku, total **152 pull request** terencana
- `logs/phase-00.md` … `phase-08.md` — sembilan kerangka log, masing-masing memuat daftar butir yang wajib tercatat pada phase itu
- `IMPLEMENTATION-STATUS.md` — status per phase dan per PR
- `README.md`, `CHANGELOG.md`

**Template**

- `templates/PHASE-TEMPLATE.md` — bentuk baku 12 bagian; skala kompleksitas PR S/M/L
- `templates/PULL-REQUEST.md` — bentuk deskripsi PR; klasifikasi komentar peninjau
- `templates/ADR-REFERENCE.md` — penunjuk ke SDD; proyek ini **tidak** memakai berkas ADR terpisah
- `templates/RISK-LOG.md` — risiko pelaksanaan; risiko produk tetap di `RS-xx`, risiko teknis tetap di bagian 6 SDD
- `templates/DEPLOYMENT-CHECKLIST.md` — menegakkan `CD-01` … `CD-07` dan `SDD-16`
- `templates/ROLLBACK-CHECKLIST.md` — menegakkan `CD-05` dan `BR-DR-01` … `BR-DR-06`

### Keputusan struktural

Empat keputusan diambil bersama pemilik dokumen sebelum penyusunan:

| # | Pertanyaan | Yang dipilih |
|:-:|---|---|
| 1 | Siklus M-04 ↔ M-14 | M-04 dibangun lebih dulu; `assets.procurement_id` nullable tanpa FK aktif; M-14 mengisinya kemudian |
| 2 | Duplikasi rencana dengan PRD Bab 29 | **IMPLEMENTATION menurunkan, tidak mengulang** — milestone, DoD, gerbang, dan scope-cut tetap milik PRD; dokumen di sini merujuk lewat kode |
| 3 | Kepemilikan status | Dua tingkat tanpa tumpang tindih: `traceability.md` memiliki status **per requirement**; `IMPLEMENTATION-STATUS.md` memiliki status **per phase/PR** |
| 4 | Granularitas phase | **Phase = gelombang dependensi**, bukan salinan milestone. Sembilan phase |

### Diperbaiki selama penyusunan

- **Nama milestone pada judul phase 01–06 tidak sesuai PRD 29.2.** Judul awal memuat pengelompokan yang tidak ada di PRD. Seluruhnya diganti dengan kode milestone PRD yang sebenarnya, dan bagian §3.1 "Kontribusi terhadap milestone PRD" ditambahkan ke tiap phase untuk memetakan silang phase ⇄ milestone secara eksplisit.
- **Phase 05 mengklaim cakupan berlebih.** Tertulis seluruh 21 modul terimplementasi, padahal M-16 baru dibangun di Phase 06. Diperbaiki menjadi 20 dari 21.
- **`phase-00.md` menyatakan penggabungan ke `develop` men-deploy staging**, sementara `CD-03` menetapkan rantai `main ← staging ← develop ← feature`. Diselaraskan: lingkungan staging menerima dari cabang `staging`.

### Yang sengaja tidak dibuat

| Tidak dibuat | Alasan |
|---|---|
| Berkas ADR terpisah | Setiap berkas SDD sudah memuat Konteks / Keputusan / Alasan / Konsekuensi dengan ID `SDD-<area>-<nomor>`. Menambah ADR menciptakan sumber kedua bagi keputusan yang sama |
| Salinan milestone, DoD, gerbang rilis | Milik PRD Bab 29; dirujuk lewat kode |
| Status per requirement | Milik `traceability.md` |
| Berkas graf dependensi terpisah | Dilipat ke `ROADMAP.md` §1–2 agar tidak menambah berkas di luar struktur yang disetujui |
| Estimasi tanggal & durasi | PRD tidak menetapkan tanggal; menebaknya di sini akan menjadikan tebakan itu tampak seperti komitmen |

### Belum terselesaikan

- **34 TBD terbuka** di [`../SDD/TBD-REGISTER.md`](../SDD/TBD-REGISTER.md) — kelompok A (12, memblokir), B (13, ditunda sampai staging), C (8), D (1)
- Sepuluh di antaranya memblokir Phase 01–03; jadwal penutupannya di [`ROADMAP.md` §8](ROADMAP.md)

---

## Cara mencatat perubahan berikutnya

Satu bagian per tanggal, terbaru di atas. Kelompokkan menjadi **Ditambahkan · Diubah · Diperbaiki · Dihapus**.

Yang wajib dicatat:

- Penambahan atau penghapusan phase, atau perubahan urutannya
- Penambahan atau penghapusan PR terencana
- Perubahan pemetaan phase ⇄ milestone
- Perubahan strategi percabangan, rilis, migrasi, atau rollback
- Setiap perbaikan atas pertentangan dengan PRD atau SDD — **sertakan apa yang bertentangan dan bagaimana diselesaikan**

Yang tidak perlu dicatat: perbaikan ejaan, penataan ulang tabel, penambahan tautan.

**Perubahan yang menyentuh requirement, desain, atau business rule tidak dicatat di sini** — ia tidak boleh terjadi di folder ini sejak awal. Bila kebutuhan itu muncul, PRD atau SDD diperbarui lebih dulu, lalu dokumen di sini menyesuaikan diri.
