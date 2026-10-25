# Evaluasi chatbot

golden-set.jsonl memuat 100 pertanyaan berlabel untuk sepuluh AI-UC. Rubrik
scoreAnswer menguji pengenal acuan, kelengkapan, tautan dan pelanggaran akses.
Unit test rubrik/katalog berjalan di CI; integrasi menguji SQL dengan akun nyata.
Hasil CONTRACT tidak membuktikan akurasi model atau cache Gemini.

Untuk LIVE, gunakan database fixture terisolasi berisi CHAT-PUB/CHAT-SECRET,
Aula dan akun tujuh role dengan alamat @chat.test, tanpa pinjaman/pengajuan/denda
atau tiket KRS-FIXTURE. Waktu acuan adalah 14 Oktober 2026 pukul 10.00 WIB.
Jangan memakai database aplikasi. Isi fixture tidak mencakup identitas nyata.

Sesudah build API, tetapkan GEMINI_API_KEY dan CHAT_EVAL_DATABASE_URL, lalu
jalankan `node evals/chatbot/run-eval.mjs`. CHAT_EVAL_BASELINE dapat berisi
akurasi LIVE sebelumnya. Runner memeriksa token prefiks ≥4.500, cache positif
pada permintaan kedua, 700 pasangan pertanyaan/role, akurasi ≥85%, nol kebocoran,
serta penurunan maksimal lima poin persentase. Kegagalan autentikasi, kuota,
fixture atau verifikasi cache menggagalkan run; tidak ada fallback skor tiruan.

Runner menyimpan skor LIVE ke chat_evaluations pada database fixture dan artefak
tmp/chat-live-eval.json. CI manual dapat mengunggah artefak untuk peninjauan;
publikasi bukti ke database sekolah memakai entry CLI worker dengan audit,
tanpa endpoint HTTP. Statistik hanya memuat rubrik/ID kasus, bukan pesan privat.

Runner tersedia pada workflow manual `.github/workflows/chat-live-eval.yml`.
Workflow memakai secret GEMINI_API_KEY, menjalankan build, lalu membuat database
acak `sigm4_pr0238_*` melalui wrapper yang menghapusnya sesudah run. Fixture
integrasi menyiapkan data/akun dan memanggil runner LIVE hanya ketika
CHAT_EVAL_LIVE=true. CI biasa tidak menghubungi Gemini dan tidak memakai secret.
Untuk lokal, isi key pada environment dan set CHAT_EVAL_LIVE=true lalu jalankan
`node scripts/pr0238-test-db.mjs node_modules/vitest/vitest.mjs run --root apps/api --config vitest.integration.config.ts tests/integration/m19-chatbot.test.ts --maxWorkers=1`.
DATABASE_URL pada wrapper menunjuk server uji; database baru dibuat otomatis.
Run LIVE dapat memakai 700 giliran model dan kuota penyedia. Tidak dijalankan
secara otomatis pada setiap push. Model/key/fixture yang gagal tidak diganti
model atau skor lain secara diam-diam.
