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

Model ditetapkan PRD Bab 22.1: **`claude-sonnet-5`**, dapat dikonfigurasi Administrator (`FR-20.1`). Otorisasi tool memakai `AuthContext` yang sama dengan seluruh sistem — lihat [SDD-03 §4.6](03-authorization.md).

---

## 2. Keputusan Desain

| ID | Keputusan |
|---|---|
| **SDD-AI-01** | Integrasi memakai **Anthropic SDK resmi untuk TypeScript** (`@anthropic-ai/sdk`), bukan HTTP mentah. |
| **SDD-AI-02** | **Thinking dinonaktifkan** (`thinking: { type: "disabled" }`) dan `effort` disetel `"low"`. Alasan pada §3 — ini menentukan tercapainya `AI-CTL-07` dan `FR-19.1` (respons ≤ 8 detik). |
| **SDD-AI-03** | Steering perilaku **sepenuhnya lewat prompt**, bukan parameter sampling. `temperature`/`top_p`/`top_k` **tidak boleh dikirim** — ditolak `400` pada `claude-sonnet-5`. |
| **SDD-AI-04** | System prompt dipecah dua blok: **prefiks statis** (peran, batasan, aturan format, definisi tool) dan **sufiks dinamis** (role, scope, waktu). Hanya prefiks yang diberi `cache_control` (`AI-CTL-01`). |
| **SDD-AI-05** | Prefiks statis **wajib ≥ 1.024 token**. Di bawah itu, `claude-sonnet-5` tidak meng-cache sama sekali — tanpa galat, hanya `cache_creation_input_tokens: 0`. |
| **SDD-AI-06** | Loop tool ditulis **manual**, bukan memakai *tool runner* SDK. Alasan: setiap pemanggilan tool harus melewati `AuthContext` dan *allow-list* field (`AI-SEC-03`), dan batas iterasi 5 (`AI-CTL-03`) harus ditegakkan oleh kami. |
| **SDD-AI-07** | Seluruh `tool_result` dari satu giliran dikembalikan dalam **satu** pesan `user`. Memecahnya ke beberapa pesan melatih model berhenti memanggil tool secara paralel. |
| **SDD-AI-08** | Respons di-*stream* ke klien; token pertama ditargetkan ≤ 2 detik (`AI-CTL-07`). |
| **SDD-AI-09** | Penghitungan token memakai endpoint `messages.count_tokens`, **tidak pernah** pustaka tokenizer pihak lain — hasilnya akan salah untuk model Claude. |
| **SDD-AI-10** | Deskripsi tool ditulis **preskriptif tentang kapan dipanggil**, bukan sekadar apa fungsinya. |
| **SDD-AI-11** | `stop_reason` diperiksa **sebelum** membaca `content`, mencakup `refusal`, `max_tokens`, dan `pause_turn`. |
| **SDD-AI-12** | Adapter penyedia LLM berada di satu berkas; seluruh modul lain memanggilnya lewat antarmuka `ChatProvider` agar `NFR-A-05` dapat ditegakkan di satu titik. |

---

## 3. Alasan

**SDD-AI-02 — menonaktifkan thinking adalah keputusan paling berdampak di berkas ini.** Pada `claude-sonnet-5`, *adaptive thinking* aktif **secara bawaan**: permintaan yang tidak menyertakan field `thinking` tetap berpikir, menghabiskan token dan waktu sebelum token jawaban pertama muncul. Untuk chatbot yang tugasnya menerjemahkan pertanyaan menjadi satu-dua panggilan tool lalu merangkum hasilnya, itu biaya tanpa manfaat — dan bertabrakan langsung dengan `FR-19.1` (≤ 8 detik) serta `AI-CTL-07` (token pertama ≤ 2 detik).

Karena itu `thinking: { type: "disabled" }` dan `effort: "low"`. `claude-sonnet-5` menerima kombinasi ini. Bila evaluasi (§4.7) menunjukkan akurasi di bawah `SC-10`, urutan penyesuaiannya: naikkan `effort` ke `"medium"` lebih dulu, baru pertimbangkan mengaktifkan thinking — dan revisi target latensi bersama pemilik produk, jangan diam-diam.

**SDD-AI-03 — tidak ada parameter sampling.** `temperature`, `top_p`, dan `top_k` **ditolak dengan 400** pada model ini. Kode yang dipindahkan dari integrasi model lama akan gagal total, bukan berdegradasi. Konsistensi jawaban dikendalikan lewat instruksi prompt (Bab 22.5), bukan angka.

**SDD-AI-04/05 — caching adalah prefix match, dan diam-diam gagal.** Cache Claude cocok berdasarkan **awalan byte**: satu byte berubah di posisi N membatalkan seluruh cache setelahnya. Urutan render adalah `tools` → `system` → `messages`. Karena itu waktu sistem dan konteks pengguna **wajib** berada setelah *breakpoint*, bukan di header prompt — kesalahan klasik yang membuat cache tidak pernah kena.

Dua jebakan yang khusus mengancam sistem ini:

1. **Minimum 1.024 token** untuk `claude-sonnet-5`. Prefiks yang lebih pendek tidak di-cache dan **tidak ada galat** — hanya `cache_creation_input_tokens: 0`. `AI-CTL-01` mewajibkan caching, jadi panjang prefiks menjadi persyaratan, bukan kebetulan.
2. **Definisi tool di-render paling awal.** Menambah, menghapus, atau mengurutkan ulang tool membatalkan seluruh cache. Daftar tool karena itu **statis dan terurut deterministik** — tidak dibangun per pengguna berdasarkan permission (penyaringan terjadi di lapisan eksekusi, bukan di daftar tool).

**SDD-AI-06 — loop manual, bukan tool runner.** *Tool runner* SDK menjalankan fungsi tool secara otomatis. Di sistem ini setiap eksekusi tool wajib melewati `AuthContext` pengguna penanya (`BR-076`) dan melewati *allow-list* field sebelum hasilnya kembali ke model (`AI-SEC-03`, `DP-AI-02`). Menulis loop sendiri membuat kedua gerbang itu tidak mungkin terlewat, dan membuat batas 5 iterasi (`AI-CTL-03`) menjadi milik kami.

**SDD-AI-07 — satu pesan untuk semua tool result.** Model dapat meminta beberapa tool sekaligus dalam satu respons. Bila hasilnya dikirim balik sebagai beberapa pesan terpisah, model belajar berhenti melakukan pemanggilan paralel — jawaban jadi lebih lambat tanpa sebab yang terlihat.

**SDD-AI-09 — jangan pakai tokenizer pihak lain.** `tiktoken` dan sejenisnya adalah tokenizer OpenAI; hasilnya meleset untuk Claude, dan `claude-sonnet-5` memakai tokenizer baru yang menghasilkan sekitar 30% lebih banyak token dibanding generasi sebelumnya untuk teks yang sama. Anggaran token `AI-CTL-02` hanya bermakna bila diukur dengan `messages.count_tokens` terhadap model yang benar-benar dipakai.

**SDD-AI-10 — deskripsi tool yang preskriptif.** Deskripsi yang hanya menyatakan *apa* sebuah tool lakukan menghasilkan pemanggilan yang jarang atau keliru. Menyatakan **kapan** memanggilnya memberi peningkatan nyata pada tingkat pemanggilan yang benar. Ini berlaku di deskripsi tool itu sendiri, bukan hanya di system prompt.

---

## 4. Rancangan

### 4.1 Komponen

```
AiOrchestrator
├── ChatProvider        — adapter Anthropic; satu-satunya yang mengenal SDK (SDD-AI-12)
├── PromptBuilder       — rakit prefiks statis + sufiks dinamis (SDD-AI-04)
├── ToolRegistry        — 10 tool Bab 22.3, terurut deterministik
├── ToolExecutor        — AuthContext + allow-list field  (BR-076, AI-SEC-03)
├── ConversationStore   — chat_sessions / chat_messages, jendela 10 pesan
├── UsageMeter          — token & biaya per pengguna       (AI-CTL-08)
└── EvalHarness         — golden set, dijalankan CI        (AI-EV-01…07)
```

### 4.2 Bentuk permintaan

```ts
const stream = client.messages.stream({
  model: settings.chatModel,               // "claude-sonnet-5" (Bab 22.1)
  max_tokens: 1000,                        // AI-CTL-02
  thinking: { type: "disabled" },          // SDD-AI-02
  output_config: { effort: "low" },        // SDD-AI-02
  // TIDAK ADA temperature / top_p / top_k — ditolak 400 (SDD-AI-03)
  system: [
    { type: "text", text: STATIC_PREFIX,        // ≥ 1024 token (SDD-AI-05)
      cache_control: { type: "ephemeral" } },   // breakpoint
    { type: "text", text: dynamicSuffix },      // role, scope, waktu — SETELAH breakpoint
  ],
  tools: TOOL_DEFINITIONS,                 // statis & terurut (SDD-AI-04)
  messages: history,                       // maksimum 10 pesan terakhir
});
```

`dynamicSuffix` memuat **role dan cakupan akses saja** — bukan nama pengguna (`DP-AI-01`). Sapaan personal dirakit server setelah jawaban diterima.

### 4.3 Loop tool

```
runTurn(userMessage, authCtx):
  messages = history(10) + [userMessage]
  for iteration in 1..5:                                  # AI-CTL-03
      res = provider.stream(buildRequest(messages, authCtx))

      guard(res.stop_reason)                              # SDD-AI-11
      if res.stop_reason != "tool_use": break

      messages.push({ role: "assistant", content: res.content })

      results = []
      for each tool_use in res.content:                   # boleh paralel
          raw  = toolExecutor.run(tool_use, authCtx)      # BR-076
          safe = allowList(tool_use.name, raw)            # AI-SEC-03
          results.push({ type: "tool_result",
                         tool_use_id: tool_use.id,
                         content: wrapAsData(safe) })     # AI-SEC-01
      messages.push({ role: "user", content: results })   # SATU pesan (SDD-AI-07)

  if iteration exhausted:
      instruksikan model menjawab dengan data yang ada,
      atau nyatakan tidak dapat menjawab                  # AI-CTL-03
```

`wrapAsData()` membungkus hasil tool dengan penanda eksplisit bahwa isinya **data untuk dilaporkan, bukan instruksi untuk dijalankan** (`AI-SEC-01`), serta menyanitasi pola instruksi dari field yang diisi pengguna — nama aset, deskripsi kerusakan, keperluan reservasi (`AI-SEC-02`).

### 4.4 Penanganan `stop_reason`

| Nilai | Tindakan |
|---|---|
| `end_turn` | Normal — tampilkan jawaban |
| `tool_use` | Jalankan tool, lanjut iterasi |
| `max_tokens` | Jawaban terpotong: tampilkan apa adanya + tautan pencarian manual |
| `refusal` | **Periksa sebelum membaca `content`** — `content` bisa kosong. Tampilkan pesan netral, catat sebagai anomali, jangan ulangi permintaan yang sama |
| `pause_turn` | Tidak diharapkan (tidak ada server tool). Bila muncul: catat dan hentikan giliran |

Membaca `content[0]` tanpa memeriksa `stop_reason` lebih dulu akan meledak pada `refusal` — ini kelas bug yang mudah lolos ke produksi karena refusal jarang muncul di pengujian.

### 4.5 Penanganan galat

Ditangkap sebagai rantai dari yang paling spesifik, bukan satu tangkapan lebar:

| Galat | HTTP ke klien | Perilaku |
|---|---|---|
| `RateLimitError` (429) | `503 LLM_UNAVAILABLE` | Hormati header `retry-after`; jangan ulang dalam permintaan yang sama |
| `APIConnectionError` | `503 LLM_UNAVAILABLE` | Ulang maksimum 2 kali, *exponential backoff* (`AI-CTL-05`) |
| `APIStatusError` ≥ 500 | `503 LLM_UNAVAILABLE` | Idem |
| `BadRequestError` (400) | `500 INTERNAL_ERROR` | **Tidak diulang** — ini bug kami (mis. parameter terlarang) dan wajib memicu alarm |
| Timeout 20 detik | `503 LLM_UNAVAILABLE` | `AI-CTL-04` |

Seluruh jalur 503 menampilkan pesan gangguan sementara dan mengarahkan ke pencarian manual (`FR-19.1 A4`), tanpa memengaruhi modul lain (`NFR-A-05`).

### 4.6 Verifikasi cache

`AI-CTL-01` tidak dapat dianggap terpenuhi tanpa bukti. Setiap respons mencatat:

```
usage.cache_creation_input_tokens   // tulis cache (~1,25×)
usage.cache_read_input_tokens       // baca cache (~0,1×)
usage.input_tokens                  // sisa tanpa cache (harga penuh)
```

Bila `cache_read_input_tokens` tetap **0** pada permintaan berulang, ada pembatal senyap — biasanya waktu atau pengenal yang menyelinap ke prefiks statis, atau daftar tool yang berubah urutan. Metrik ini wajib tampil di dashboard (`OBS-05`) karena kegagalannya tidak menghasilkan galat apa pun.

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
| Anggaran token | Riwayat dipangkas dari yang terlama hingga ≤ 8.000 token masukan (`AI-CTL-02`), diukur `count_tokens` |
| Pemantauan biaya | `UsageMeter` menjumlahkan `usage` per respons; alarm bila biaya harian melewati ambang (`OBS-05`) |
| Pengalih mati | Parameter sistem menonaktifkan chatbot tanpa deployment (`AI-CTL-09`) |

---

## 5. Konsekuensi

- Seluruh kode yang menyentuh SDK Anthropic berada di `ChatProvider`. Modul lain tidak boleh mengimpornya — ditegakkan aturan lint (`SDD-SYS-02`).
- Daftar tool bersifat statis; menambah tool berarti membatalkan cache untuk seluruh pengguna sampai prefiks baru terbentuk. Perubahan daftar tool karena itu dijadwalkan bersama rilis, bukan diubah runtime.
- Menonaktifkan thinking adalah pilihan yang bergantung pada hasil eval. Bila `SC-10` tidak tercapai, keputusan ini yang pertama ditinjau — dan konsekuensinya terhadap `FR-19.1` harus dibicarakan, bukan diserap diam-diam.
- Karena parameter sampling dilarang, tidak ada cara menurunkan variasi jawaban selain prompt. Konsistensi diuji lewat golden set, bukan diasumsikan.

---

## 6. Risiko Teknis

| Risiko | Dampak | Mitigasi |
|---|---|---|
| Prefiks statis < 1.024 token | Caching diam-diam mati; biaya naik berlipat | Uji memverifikasi panjang prefiks **dan** `cache_read_input_tokens > 0` pada permintaan kedua |
| Waktu/ID menyelinap ke prefiks | Cache tidak pernah kena | Prefiks dibangun dari konstanta; uji membandingkan byte prefiks dua permintaan berturut-turut |
| Efek samping menonaktifkan thinking | Akurasi di bawah `SC-10` | Eval harness mendeteksi sebelum rilis; jalur eskalasi effort terdokumentasi (§3) |
| Model mengembalikan `refusal` | Klien meledak membaca `content[0]` | `guard(stop_reason)` wajib sebelum membaca isi; diuji dengan respons tiruan |
| Injeksi lewat data | Model menuruti instruksi dari nama aset | Pembungkusan data + sanitasi (`AI-SEC-01/02`); red-teaming wajib (`ST-06`) |
| Tokenizer baru menaikkan biaya | Anggaran token meleset | Pengukuran ulang dengan `count_tokens` terhadap model produksi, bukan estimasi |
| Kunci API bocor | Penyalahgunaan berbayar | Secret manager (`SEC-CFG-01`), rotasi 12 bulan (`SEC-CFG-02`), alarm biaya harian |

---

## 7. Requirement Terkait

`FR-19.1` `FR-19.2` · `BR-075` `BR-076` `BR-077` `BR-078` `BR-079` ·
`AI-CTL-01` … `AI-CTL-10` · `AI-EV-01` … `AI-EV-07` · `AI-SEC-01` … `AI-SEC-08` · `AI-L-01` … `AI-L-12` ·
`DP-AI-01` … `DP-AI-05` · `NFR-A-05` `NFR-S-07` `NFR-S-14` · `SC-10` `PO-08` · `RS-08` `RS-09` `RS-10` · `ST-06` · Bab 22.3–22.5

---

## 8. TBD

| ID | Pertanyaan |
|---|---|
| **TBD-AI-A** | Panjang dan isi final prefiks statis belum ditetapkan. Ia harus ≥ 1.024 token agar caching aktif — bila naskah prompt Bab 22.5 lebih pendek, perlu diputuskan apakah prefiks diperkaya (mis. dengan panduan format dan contoh) atau caching dilepas untuk sistem ini. |
| **TBD-AI-B** | Nilai `effort` produksi. Rancangan ini memilih `"low"` demi latensi; keputusan final menunggu hasil eval terhadap `SC-10`. |
| **TBD-AI-C** | Ambang biaya harian Claude API yang memicu alarm (`OBS-05`) belum ditetapkan — bergantung anggaran sekolah (PRD 27.9). |
