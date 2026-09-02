# SDD-10 — Desain AI Orchestrator

**Area:** `AI` · **Status:** Draft · **Basis:** [`ai-features.md`](../PRD/03-architecture/ai-features.md), [`m19-chatbot.md`](../PRD/02-modules/m19-chatbot.md)

---

## 1. Konteks

| Kelompok | ID |
|---|---|
| Requirement fungsional | `FR-19.1`, `FR-19.2` |
| Aturan bisnis | `BR-075` … `BR-079` |
| Tool & prompt | Bab 22.3, 22.4, 22.5 |
| Evaluasi | `AI-EV-01` … `AI-EV-07`, `SC-10` |
| Kendali biaya & performa | `AI-CTL-01` … `AI-CTL-10` |
| Privasi & injeksi | `AI-SEC-01` … `AI-SEC-08`, `DP-AI-01` … `DP-AI-05` |
| Ketersediaan | `NFR-A-05`, `AI-L-04` |
| Keterbatasan yang diakui | `AI-L-01` … `AI-L-12` |

Penyedia dan model ditetapkan PRD Bab 22.1: **Google Gemini Developer API — *paid tier*** dengan model **`gemini-3.6-flash`** (versi stabil/GA), dapat dikonfigurasi Administrator di antara model stabil/GA (`FR-20.1`). Otorisasi tool memakai `AuthContext` yang sama dengan seluruh sistem — lihat [SDD-03 §4.6](03-authorization.md).

**Berkas ini merancang, belum mengimplementasikan.** Kode chatbot dibangun pada Phase 03 (`PR-03-20` … `PR-03-23`); saat berkas ini ditulis belum ada satu baris pun yang berjalan.

---

## 2. Keputusan Desain

| ID | Keputusan |
|---|---|
| **SDD-AI-01** | Integrasi memakai **Google GenAI SDK resmi untuk TypeScript** (`@google/genai`), bukan HTTP mentah. Kunci dibaca dari secret `GEMINI_API_KEY` (`SEC-CFG-01`). |
| **SDD-AI-02** | **`thinking_level` disetel `"minimal"`** — nilai terendah yang tersedia pada `gemini-3.6-flash`. Thinking **tidak dapat dimatikan sepenuhnya** pada model ini; bawaannya `"medium"`. Alasan pada §3 — ini menentukan tercapainya `AI-CTL-07` dan `FR-19.1` (respons ≤ 8 detik). |
| **SDD-AI-03** | Steering perilaku **sepenuhnya lewat prompt**, bukan parameter sampling. `temperature`/`top_p`/`top_k` **tidak boleh dikirim** — pada `gemini-3.6-flash` nilainya **diabaikan diam-diam**, bukan ditolak. `frequency_penalty`/`presence_penalty` **menghasilkan galat** dan juga tidak boleh dikirim. |
| **SDD-AI-04** | System prompt dipecah dua blok: **prefiks statis** (peran, batasan, aturan format) dan **sufiks dinamis** (role, scope, waktu). Konten statis diletakkan **paling awal** pada setiap permintaan agar awalannya identik antar-permintaan — syarat kena *implicit caching* (`AI-CTL-01`). |
| **SDD-AI-05** | Awalan statis (deklarasi tool + prefiks system prompt) **wajib ≥ 4.096 token**, dengan **sasaran ≥ 4.500** sebagai margin. Di bawah 4.096, Gemini 3.x tidak meng-cache sama sekali — tanpa galat, hanya `usage.total_cached_tokens: 0`. |
| **SDD-AI-06** | Loop tool ditulis **manual**. *Automatic function calling* SDK **dinonaktifkan**; model hanya boleh **mengusulkan** `function_call`, yang menjalankannya adalah `ToolExecutor` kami. Alasan: setiap pemanggilan tool harus melewati `AuthContext` dan *allow-list* field (`AI-SEC-03`), dan batas iterasi 5 (`AI-CTL-03`) harus ditegakkan oleh kami. |
| **SDD-AI-07** | Seluruh `function_result` dari satu giliran **dikumpulkan lebih dulu**, lalu dikirim dalam **satu** permintaan lanjutan. Mengirim satu permintaan per hasil melatih model berhenti memanggil tool secara paralel dan melipatgandakan biaya awalan. |
| **SDD-AI-08** | Respons di-*stream* ke klien (`stream: true`); token pertama ditargetkan ≤ 2 detik (`AI-CTL-07`). |
| **SDD-AI-09** | Penghitungan token memakai `models.countTokens` **terhadap model produksi**, tidak pernah pustaka tokenizer pihak lain — tokenizer OpenAI maupun Anthropic menghasilkan angka yang salah untuk Gemini. |
| **SDD-AI-10** | Deskripsi tool ditulis **preskriptif tentang kapan dipanggil**, bukan sekadar apa fungsinya. |
| **SDD-AI-11** | `status` interaksi diperiksa **sebelum** membaca keluaran, mencakup `incomplete`, `failed`, `budget_exceeded`, dan `cancelled`. |
| **SDD-AI-12** | Adapter penyedia LLM berada di satu berkas; seluruh modul lain memanggilnya lewat antarmuka `ChatProvider` agar `NFR-A-05` dapat ditegakkan di satu titik. |
| **SDD-AI-13** | Ambang `SDD-AI-05` dipenuhi dengan **isi yang berguna**, bukan teks pengisi: aturan format keluaran (22.4), pola penolakan (`AI-SEC-01`), dan contoh dialog yang benar. Uji `PR-03-22` memverifikasi **dua** hal sekaligus — panjang awalan statis **dan** `total_cached_tokens > 0` pada permintaan kedua. Menutup `TBD-AI-A` (keputusan pemilik produk, 25 Agustus 2026; angka disesuaikan ke ambang Gemini 2 September 2026). |
| **SDD-AI-14** | Permukaan API adalah **Interactions API** (`client.interactions.create`) dengan **`store: false`**. Tidak ada *state* percakapan yang disimpan di sisi penyedia: riwayat tetap milik SIGM4 (`ConversationStore`) dan dikirim utuh pada setiap permintaan. Konsekuensi yang diterima: `previous_interaction_id` dan eksekusi latar tidak dipakai, dan hanya *implicit caching* yang tersedia. |
| **SDD-AI-15** | Model **hanya** menerima *custom function tools* Bab 22.3. Seluruh tool bawaan sisi-server Google — Google Search, Google Maps, File Search, Code Execution, URL Context, Computer Use — dan seluruh MCP server jarak jauh **tidak pernah** dideklarasikan. |

---

## 3. Alasan

**SDD-AI-14 — Interactions API, tetapi tanpa memori penyedia.** Interactions API adalah antarmuka utama Gemini sejak Juni 2026 dan satu-satunya jalur yang menerima model, tool, dan kemampuan baru; `generateContent` masih didukung penuh tetapi dinyatakan *legacy*. Memilihnya sekarang menghindari migrasi kedua di tengah umur sistem.

Yang harus dimatikan adalah kenyamanannya. Secara bawaan API ini menyimpan setiap interaksi (`store: true`) dan menahannya **55 hari** pada paid tier, sehingga percakapan tentang aset, denda, dan pengajuan sekolah akan hidup di dua tempat sekaligus — satu di antaranya tidak tunduk pada `BR-078` (arsip 90 hari) maupun `DP-AI-05` (penghapusan oleh pengguna). Karena itu `store: false`, dan riwayat 10 pesan dikirim ulang dari `ConversationStore` pada setiap permintaan. Harganya nyata dan diterima: tanpa `store`, `previous_interaction_id` tidak dapat dipakai, sehingga seluruh linimasa langkah — termasuk `function_call` dan `function_result` giliran sebelumnya — ikut dikirim ulang. Itu justru bentuk yang kita inginkan: satu-satunya salinan percakapan yang berumur panjang berada di basis data sekolah.

Konsekuensi kedua: **explicit context caching tidak tersedia** di Interactions API. Yang bekerja hanya *implicit caching*, dan itu mengubah bentuk `SDD-AI-04/05` — lihat di bawah.

**SDD-AI-02 — thinking tidak bisa dimatikan, hanya dikecilkan.** Pada `gemini-3.6-flash` `thinking_level` menerima `"minimal"`, `"low"`, `"medium"`, `"high"`, dan **bawaannya `"medium"`**: permintaan yang tidak menyebut field ini akan berpikir, menghabiskan token dan waktu sebelum token jawaban pertama muncul. Untuk chatbot yang tugasnya menerjemahkan pertanyaan menjadi satu-dua panggilan tool lalu merangkum hasilnya, itu biaya tanpa manfaat — dan bertabrakan langsung dengan `FR-19.1` (≤ 8 detik) serta `AI-CTL-07` (token pertama ≤ 2 detik).

Karena itu `"minimal"`, nilai terendah yang tersedia. Ini **bukan** padanan persis dari keputusan lama "thinking dinonaktifkan": sebagian *thought token* tetap terbit dan tetap dibayar, dan itu harus terlihat pada `UsageMeter` (`usage.total_thought_tokens`), bukan diasumsikan nol. Bila evaluasi (§4.7) menunjukkan akurasi di bawah `SC-10`, urutan penyesuaiannya: naikkan ke `"low"` lebih dulu, baru `"medium"` — dan revisi target latensi bersama pemilik produk, jangan diam-diam. Nilai final adalah `TBD-AI-B`.

**SDD-AI-03 — tidak ada parameter sampling, dan kegagalannya senyap.** Pada `gemini-3.6-flash`, `temperature`, `top_p`, dan `top_k` yang dikirim **diabaikan tanpa galat**; hanya `frequency_penalty` dan `presence_penalty` yang menghasilkan error. Ini kebalikan dari perilaku yang diasumsikan rancangan sebelumnya, dan lebih berbahaya: kode yang mengirim `temperature: 0` akan tampak bekerja, lulus uji, dan diam-diam tidak melakukan apa pun — sementara penulisnya percaya variasi jawaban sudah dikendalikan. Konsistensi jawaban dikendalikan lewat instruksi prompt (Bab 22.5) dan diuji lewat golden set, bukan lewat angka. Uji `PR-03-20` memeriksa bahwa permintaan yang dikirim **tidak memuat** ketiga field itu sama sekali.

**SDD-AI-04/05 — implicit caching adalah prefix match, dan diam-diam gagal.** Cache Gemini cocok berdasarkan **awalan** permintaan: satu perubahan di posisi N membatalkan seluruh cache setelahnya. Dokumentasi penyedia menyatakannya sebagai anjuran — letakkan konten besar dan berulang di awal prompt — tetapi bagi kami itu persyaratan, karena `AI-CTL-01` mewajibkan caching. Waktu sistem dan konteks pengguna karena itu **wajib** berada di sufiks, bukan di header prompt.

Dua jebakan yang khusus mengancam sistem ini:

1. **Minimum 4.096 token** untuk seluruh keluarga Gemini 3.x — empat kali ambang yang berlaku pada rancangan sebelumnya. Awalan yang lebih pendek tidak di-cache dan **tidak ada galat**, hanya `usage.total_cached_tokens: 0`.
2. **Deklarasi tool ikut membentuk awalan.** Menambah, menghapus, atau mengurutkan ulang tool membatalkan seluruh cache. Daftar tool karena itu **statis dan terurut deterministik** — tidak dibangun per pengguna berdasarkan permission (penyaringan terjadi di lapisan eksekusi, bukan di daftar tool).

Ambang 4.096 token itu yang memaksa `AI-CTL-02` dinaikkan dari ±8.000 ke ±16.000 token masukan (keputusan pemilik produk, 2 September 2026). Dengan anggaran lama, awalan statis akan memakan lebih dari separuh jendela dan riwayat 10 pesan yang dijanjikan Bab 22.3 tidak lagi muat — caching dibayar dengan memori percakapan. Menaikkan anggaran membuat keduanya dapat hidup bersama; biaya tambahannya sebagian besar kembali lewat tarif token yang di-cache.

**SDD-AI-06 — loop manual, dan *automatic function calling* dimatikan.** SDK Google dapat menjalankan fungsi tool sendiri. Di sistem ini setiap eksekusi tool wajib melewati `AuthContext` pengguna penanya (`BR-076`) dan melewati *allow-list* field sebelum hasilnya kembali ke model (`AI-SEC-03`, `DP-AI-02`). Eksekusi otomatis melewati kedua gerbang itu, jadi ia dimatikan secara eksplisit — bukan diasumsikan tidak aktif. Menulis loop sendiri juga membuat batas 5 iterasi (`AI-CTL-03`) menjadi milik kami.

**SDD-AI-15 — tidak ada tool bawaan Google.** Setiap tool bawaan sisi-server mengirim isi percakapan ke layanan lain dan menghasilkan langkah yang tidak melewati `ToolExecutor` — dua hal yang membatalkan `BR-076` dan `AI-SEC-03` sekaligus. Ketiadaannya juga menjaga `pause`/langkah tak terduga tidak muncul di linimasa (§4.4). Ini larangan, bukan preferensi.

**SDD-AI-07 — satu permintaan lanjutan untuk semua hasil tool.** Model dapat meminta beberapa tool sekaligus dalam satu giliran. Bila tiap hasil dikirim sebagai permintaan tersendiri, model belajar berhenti melakukan pemanggilan paralel, jawaban jadi lebih lambat tanpa sebab yang terlihat, dan awalan yang panjang itu dibayar berkali-kali.

**SDD-AI-09 — jangan pakai tokenizer pihak lain.** `tiktoken` adalah tokenizer OpenAI dan penghitung Anthropic adalah tokenizer Claude; keduanya meleset untuk Gemini. Anggaran token `AI-CTL-02` hanya bermakna bila diukur dengan `models.countTokens` terhadap model yang benar-benar dipakai.

**SDD-AI-10 — deskripsi tool yang preskriptif.** Deskripsi yang hanya menyatakan *apa* sebuah tool lakukan menghasilkan pemanggilan yang jarang atau keliru. Menyatakan **kapan** memanggilnya memberi peningkatan nyata pada tingkat pemanggilan yang benar. Ini berlaku di deskripsi tool itu sendiri, bukan hanya di system prompt.

**SDD-AI-13 — melewati ambang dengan isi, bukan dengan panjang.** `AI-CTL-01` mewajibkan caching dan `SDD-AI-05` menetapkan ambangnya, sehingga satu-satunya pertanyaan tersisa adalah **bagaimana** ambang itu dicapai. Melepaskan caching menuntut penyuntingan `AI-CTL-01` — sebuah kontrol PRD — dan mengembalikan `RS-08` yang kontrol itu mitigasi. Mengisi dengan boilerplate memenuhi ambang secara harfiah tetapi menenggelamkan instruksi yang penting di antara yang tidak, dan prompt yang lebih panjang tanpa isi yang lebih baik umumnya menurunkan akurasi — yang justru akan tertangkap `AI-EV-04` sebagai penghambat rilis.

Memperkaya dengan contoh dialog membuat token tambahan membayar dirinya sendiri. Yang berubah pada 2 September 2026 hanya angkanya: 4.096 sebagai ambang, ≥ 4.500 sebagai sasaran. Marginnya disengaja — menyunting satu kalimat prompt tidak boleh mematikan caching diam-diam, dan kegagalan bentuk ini tidak menghasilkan galat apa pun (§6). Ruang itu tidak diisi dengan pengulangan: deklarasi 12 tool Bab 22.3 dengan deskripsi preskriptif `SDD-AI-10` sudah menyumbang sebagian besar awalan.

Uji yang memeriksa panjang saja tidak cukup. Awalan dapat cukup panjang namun tetap tidak pernah kena cache bila ada pembatal senyap — waktu atau pengenal yang menyelinap ke dalamnya. Karena itu `PR-03-22` memverifikasi keduanya.

---

## 4. Rancangan

### 4.1 Komponen

```
AiOrchestrator
├── ChatProvider        — adapter Gemini; satu-satunya yang mengenal SDK (SDD-AI-12)
├── PromptBuilder       — rakit prefiks statis + sufiks dinamis (SDD-AI-04)
├── ToolRegistry        — 12 tool Bab 22.3, terurut deterministik
├── ToolExecutor        — AuthContext + allow-list field  (BR-076, AI-SEC-03)
├── ConversationStore   — chat_sessions / chat_messages, jendela 10 pesan
├── UsageMeter          — token & biaya per pengguna       (AI-CTL-08)
└── EvalHarness         — golden set, dijalankan CI        (AI-EV-01…07)
```

### 4.2 Bentuk permintaan

```ts
const stream = await client.interactions.create({
  model: settings.chatModel,          // "gemini-3.6-flash" (Bab 22.1)
  store: false,                       // tanpa state penyedia (SDD-AI-14)
  stream: true,                       // SDD-AI-08
  tools: TOOL_DECLARATIONS,           // statis & terurut, custom function saja (SDD-AI-15)
  system_instruction: STATIC_PREFIX + dynamicSuffix,  // SDD-AI-04
  input: history,                     // linimasa langkah milik SIGM4, ≤ 10 pesan
  generation_config: {
    max_output_tokens: 1000,          // AI-CTL-02
    thinking_level: "minimal",        // SDD-AI-02
    tool_choice: "auto",
    // TIDAK ADA temperature / top_p / top_k — diabaikan diam-diam (SDD-AI-03)
    // TIDAK ADA frequency_penalty / presence_penalty — menghasilkan galat
  },
  // automatic function calling SDK dimatikan — model hanya mengusulkan (SDD-AI-06)
});
```

Urutan perakitan `system_instruction` mengikat: `STATIC_PREFIX` selalu mendahului `dynamicSuffix`, dan `TOOL_DECLARATIONS` tidak pernah disusun ulang. `dynamicSuffix` memuat **role dan cakupan akses saja** — bukan nama pengguna (`DP-AI-01`). Sapaan personal dirakit server setelah jawaban diterima.

### 4.3 Loop tool

```
runTurn(userMessage, authCtx):
  history = conversationStore.window(10) + [userInputStep(userMessage)]

  for iteration in 1..5:                                  # AI-CTL-03
      res = provider.create(buildRequest(history))        # store:false

      guard(res.status)                                   # SDD-AI-11
      history.push(...res.steps)                          # linimasa dikelola SIGM4

      calls = res.steps.filter(s => s.type == "function_call")
      if calls.is_empty: break

      for each call in calls:                             # boleh paralel
          raw  = toolExecutor.run(call, authCtx)          # BR-076
          safe = allowList(call.name, raw)                # AI-SEC-03
          history.push({ type: "function_result",
                         name: call.name,
                         call_id: call.id,
                         result: [{ type: "text",
                                    text: wrapAsData(safe) }] })   # AI-SEC-01
      # seluruh hasil dikirim pada SATU permintaan berikutnya (SDD-AI-07)

  if iteration exhausted:
      instruksikan model menjawab dengan data yang ada,
      atau nyatakan tidak dapat menjawab                  # AI-CTL-03
```

`wrapAsData()` membungkus hasil tool dengan penanda eksplisit bahwa isinya **data untuk dilaporkan, bukan instruksi untuk dijalankan** (`AI-SEC-01`), serta menyanitasi pola instruksi dari field yang diisi pengguna — nama aset, deskripsi kerusakan, keperluan reservasi (`AI-SEC-02`).

Langkah yang dikembalikan model **disalin apa adanya** ke `history` sebelum hasil tool ditambahkan. Ini bukan kerapian: langkah `thought` membawa tanda tangan internal yang harus ikut terkirim pada giliran berikutnya dalam mode tanpa `store`, dan menyusunnya ulang secara manual adalah cara termudah merusaknya.

### 4.4 Penanganan `status`

| Nilai | Tindakan |
|---|---|
| `completed` | Normal — bila ada `function_call` yang belum dijawab, lanjut iterasi; bila tidak, tampilkan jawaban |
| `requires_action` | Model menunggu hasil tool — jalankan tool, lanjut iterasi |
| `incomplete` | Jawaban terpotong (mis. `max_output_tokens`): tampilkan apa adanya + tautan pencarian manual |
| `budget_exceeded` | Anggaran giliran habis: tampilkan jawaban parsial bila ada, jangan ulangi permintaan yang sama |
| `failed` | **Periksa sebelum membaca keluaran** — keluaran bisa kosong. Tampilkan pesan netral, catat sebagai anomali |
| `cancelled` · `queued` · `in_progress` | Tidak diharapkan pada mode sinkron tanpa `background`. Bila muncul: catat dan hentikan giliran |

Membaca teks keluaran tanpa memeriksa `status` lebih dulu akan meledak pada `failed` — ini kelas bug yang mudah lolos ke produksi karena kegagalan jarang muncul di pengujian.

**Penolakan model tidak punya status tersendiri.** Ia datang sebagai jawaban `completed` yang isinya menolak. Karena itu penolakan **tidak boleh** dideteksi dengan mencocokkan kata pada teks jawaban; yang dicatat sebagai anomali (`AI-SEC-05`) adalah giliran yang berakhir tanpa panggilan tool untuk pertanyaan yang seharusnya memicunya, dan itu diukur oleh golden set (`AI-EV-03`), bukan oleh heuristik runtime.

### 4.5 Penanganan galat

Ditangkap sebagai rantai dari yang paling spesifik, bukan satu tangkapan lebar. SDK memunculkan `ApiError` dengan `code` HTTP dan `status`:

| Galat | HTTP ke klien | Perilaku |
|---|---|---|
| `429 RESOURCE_EXHAUSTED` | `503 LLM_UNAVAILABLE` | Hormati `retry-after` bila ada; jangan ulang dalam permintaan yang sama |
| Galat koneksi / DNS / TLS | `503 LLM_UNAVAILABLE` | Ulang maksimum 2 kali, *exponential backoff* (`AI-CTL-05`) |
| `500` · `503 UNAVAILABLE` | `503 LLM_UNAVAILABLE` | Idem |
| `400 INVALID_ARGUMENT` | `500 INTERNAL_ERROR` | **Tidak diulang** — ini bug kami (mis. `frequency_penalty` terkirim) dan wajib memicu alarm |
| `403 PERMISSION_DENIED` · `401` | `500 INTERNAL_ERROR` | Kunci salah, dicabut, atau kuota proyek dimatikan. Tidak diulang; alarm segera |
| Timeout 20 detik | `503 LLM_UNAVAILABLE` | `AI-CTL-04` |

Seluruh jalur 503 menampilkan pesan gangguan sementara dan mengarahkan ke pencarian manual (`FR-19.1 A4`), tanpa memengaruhi modul lain (`NFR-A-05`).

### 4.6 Verifikasi cache

`AI-CTL-01` tidak dapat dianggap terpenuhi tanpa bukti. Setiap respons mencatat:

```
usage.total_input_tokens     // seluruh token masukan giliran ini
usage.total_cached_tokens    // bagian yang terbaca dari cache (tarif diskon)
usage.total_output_tokens    // token jawaban
usage.total_thought_tokens   // thought token — tidak nol meski thinking_level "minimal"
```

Bila `total_cached_tokens` tetap **0** pada permintaan berulang, ada pembatal senyap — biasanya waktu atau pengenal yang menyelinap ke awalan statis, daftar tool yang berubah urutan, atau awalan yang menyusut di bawah 4.096 token. Metrik ini wajib tampil di dashboard (`OBS-05`) karena kegagalannya tidak menghasilkan galat apa pun.

`total_thought_tokens` dipantau bersamanya: ia yang membedakan `thinking_level` yang benar-benar `"minimal"` dari permintaan yang diam-diam kembali ke bawaan `"medium"` karena field-nya hilang saat penyuntingan.

### 4.7 Eval harness

```
evals/chatbot/
├── golden-set.jsonl        # ≥100 pertanyaan berlabel (AI-EV-01)
├── fixtures/               # seed DB deterministik (TD-02)
└── run-eval.ts             # dijalankan CI (AI-EV-04)
```

Tiap butir dinilai empat dimensi (`AI-EV-03`) dan dijalankan untuk **ketujuh role** (`AI-EV-05`). Kebocoran lintas hak akses dihitung **kegagalan kritis**, bukan penurunan skor — target nol (`PO-08`). Penurunan akurasi > 5% dibanding basis sebelumnya memblokir rilis.

### 4.8 Kendali biaya

| Kendali | Implementasi |
|---|---|
| Batas harian per pengguna | Penghitung di Redis, kunci `chat:quota:{user}:{tanggal}` |
| Rate limit 10/menit | Kelas rate limit tersendiri (`NFR-S-07`, `AI-CTL-06`) |
| Anggaran token | Riwayat dipangkas dari yang terlama hingga ≤ 16.000 token masukan (`AI-CTL-02`), diukur `models.countTokens` |
| Pemantauan biaya | `UsageMeter` menjumlahkan `usage` per respons, termasuk `total_thought_tokens`; alarm bila biaya harian melewati ambang (`OBS-05`, `TBD-AI-C`) |
| Pengalih mati | Parameter sistem menonaktifkan chatbot tanpa deployment (`AI-CTL-09`) |

---

## 5. Konsekuensi

- Seluruh kode yang menyentuh SDK Google GenAI berada di `ChatProvider`. Modul lain tidak boleh mengimpornya — ditegakkan aturan lint (`SDD-SYS-02`).
- Daftar tool bersifat statis; menambah tool berarti membatalkan cache untuk seluruh pengguna sampai awalan baru terbentuk. Perubahan daftar tool karena itu dijadwalkan bersama rilis, bukan diubah runtime. **Penerapan pertama yang sudah diketahui:** dua tool bahan (`get_material_stock`, `get_low_stock_materials`) masuk pada Phase 05 bersama M-22 (`TBD-BHN-E`), sehingga pembatalan cache itu terjadi sekali dan terjadwal.
- `store: false` berarti tidak ada pemulihan percakapan dari sisi penyedia. Bila `chat_messages` hilang, percakapan hilang — konsekuensi yang diterima, dan alasan tambahan mengapa `BR-DR-01` berlaku atas tabel ini seperti atas tabel lain.
- `thinking_level: "minimal"` adalah pilihan yang bergantung pada hasil eval. Bila `SC-10` tidak tercapai, keputusan ini yang pertama ditinjau — dan konsekuensinya terhadap `FR-19.1` harus dibicarakan, bukan diserap diam-diam.
- Karena parameter sampling diabaikan penyedia, tidak ada cara menurunkan variasi jawaban selain prompt. Konsistensi diuji lewat golden set, bukan diasumsikan.
- Penyedia **tidak menjamin residensi data**: prompt dan hasil tool dapat diproses atau di-*cache* di yurisdiksi mana pun. Paid tier menjamin data tidak dipakai melatih model (`DP-AI-04`, `AI-SEC-08`) dan tunduk pada DPA Google, tetapi persetujuan sekolah atas pemrosesan lintas yurisdiksi adalah keputusan tersendiri — `TBD-AI-D`, `RS-21`, prasyarat `GL-07`.

---

## 6. Risiko Teknis

| Risiko | Dampak | Mitigasi |
|---|---|---|
| Awalan statis < 4.096 token | Caching diam-diam mati; biaya naik berlipat | Uji memverifikasi panjang awalan **dan** `total_cached_tokens > 0` pada permintaan kedua |
| Waktu/ID menyelinap ke awalan | Cache tidak pernah kena | Awalan dibangun dari konstanta; uji membandingkan byte awalan dua permintaan berturut-turut |
| `thinking_level` hilang saat penyuntingan | Diam-diam kembali ke `"medium"`; latensi & biaya naik | `total_thought_tokens` dipantau; uji memeriksa field terkirim pada setiap permintaan |
| Parameter sampling terkirim | Diabaikan diam-diam, penulis mengira variasi terkendali | Uji memeriksa permintaan **tidak memuat** `temperature`/`top_p`/`top_k` |
| `store` berubah menjadi `true` | Percakapan sekolah tersimpan 55 hari di sisi penyedia, di luar `BR-078` dan `DP-AI-05` | Nilai dikunci konstanta di `ChatProvider`; uji memeriksa `store: false` pada setiap permintaan |
| *Automatic function calling* aktif kembali | Tool berjalan tanpa `AuthContext` dan tanpa allow-list — kebocoran lintas scope | Dimatikan eksplisit; uji memastikan `ToolExecutor` adalah satu-satunya jalur eksekusi |
| Tool bawaan Google dideklarasikan | Isi percakapan dikirim ke layanan lain; langkah tidak melewati `ToolExecutor` | `SDD-AI-15`; uji memeriksa daftar tool hanya memuat 12 nama Bab 22.3 |
| `status` tidak diperiksa | Klien meledak pada `failed` | `guard(status)` wajib sebelum membaca keluaran; diuji dengan respons tiruan |
| Injeksi lewat data | Model menuruti instruksi dari nama aset | Pembungkusan data + sanitasi (`AI-SEC-01/02`); red-teaming wajib (`ST-06`) |
| Tokenizer keliru menaikkan biaya | Anggaran token meleset | Pengukuran dengan `models.countTokens` terhadap model produksi, bukan estimasi |
| Kunci API bocor | Penyalahgunaan berbayar | Secret manager (`SEC-CFG-01`), rotasi 12 bulan (`SEC-CFG-02`), alarm biaya harian |
| Model stabil dihentikan penyedia | Chatbot berhenti tanpa perubahan di sisi kami | Hanya versi stabil/GA yang dipakai (Bab 22.1); `AI-CTL-09` mematikan chatbot tanpa deployment sampai model pengganti dievaluasi `AI-EV-04` |

---

## 7. Requirement Terkait

`FR-19.1` `FR-19.2` · `BR-075` `BR-076` `BR-077` `BR-078` `BR-079` ·
`AI-CTL-01` … `AI-CTL-10` · `AI-EV-01` … `AI-EV-07` · `AI-SEC-01` … `AI-SEC-08` · `AI-L-01` … `AI-L-12` ·
`DP-AI-01` … `DP-AI-05` · `NFR-A-05` `NFR-S-07` `NFR-S-14` · `SC-10` `PO-08` · `RS-08` `RS-09` `RS-10` `RS-21` · `ST-06` · `GL-07` · Bab 22.3–22.5

---

## 8. TBD

| ID | Pertanyaan |
|---|---|
| **TBD-AI-B** | Nilai `thinking_level` produksi. Rancangan ini memilih `"minimal"` demi latensi; keputusan final menunggu hasil eval terhadap `SC-10`. |
| **TBD-AI-C** | Ambang biaya harian Gemini API yang memicu alarm (`OBS-05`) belum ditetapkan — bergantung anggaran sekolah (PRD 27.9). |
| **TBD-AI-D** | Persetujuan tertulis sekolah atas pemrosesan data percakapan **lintas yurisdiksi**. Gemini Developer API tidak menjamin residensi data; paid tier menjamin data tidak dipakai melatih model, tetapi lokasi pemrosesan tidak dapat dibatasi. Memblokir `GL-07`, bukan Phase 03. |

**Tertutup 25 Agustus 2026:** `TBD-AI-A` → `SDD-AI-13`. Tool bahan (`TBD-BHN-E`) masuk 22.3 dan diimplementasikan Phase 05.

**Diperbarui 2 September 2026:** migrasi penyedia dari Claude API ke Google Gemini Developer API. `SDD-AI-14` dan `SDD-AI-15` baru; `SDD-AI-01` … `SDD-AI-13` disesuaikan ke Gemini tanpa berpindah topik. Angka `SDD-AI-05` naik 1.024 → 4.096 mengikuti ambang caching Gemini 3.x, dan `AI-CTL-02` naik ±8.000 → ±16.000 sebagai konsekuensinya.
