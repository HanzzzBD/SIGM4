# UI mobile dan Gemini 3.5 Flash Lite — 15 Oktober 2026

Permintaan pengguna: perbaiki ikon/tata letak mobile, perbaiki chatbot web/mobile, dan gunakan Gemini 3.5 Flash Lite karena model sebelumnya mencapai kuota penyedia.

## Perubahan

- Komponen native bersama memakai ikon SVG dari react-native-svg yang sudah tersedia, header tetap, input berikon, tombol dengan keadaan ditekan/sibuk, badge, baris daftar, dan empty state. Tidak menambah dependensi.
- Tab bawah kembali menampilkan ikon, termasuk aksi scan. Dashboard, tugas, login, notifikasi, profil, dan percakapan memakai hierarki informasi serta jarak yang konsisten. Tombol operasional di layar lain mendapat ikon melalui komponen bersama.
- Chat native memiliki composer di footer, gelembung pesan, riwayat yang dapat dibuka, dan ringkasan kuota harian/token. Persetujuan pemrosesan terlihat langsung di web maupun native. Pesan gagal tetap berada di input.
- Pengaturan lokal chat.model berubah menjadi gemini-3.5-flash-lite melalui scripts/set-chat-model.mjs dengan audit perubahan pengaturan. API key tidak diubah. Skrip dibatasi ke database lokal nonproduksi. Migrasi historis tidak ditulis ulang; pengaturan tersimpan tetap menjadi sumber model aktif.
- Default provider/fallback repository memakai model tersebut; pemeriksaan kesehatan memakai model tersimpan saat API mulai. Adapter menangkap status HTTP penyedia sebelum SDK mengonsumsi badan error, mempertahankan HTTP 429/Retry-After, dan menampilkan keterangan batas kuota/laju. Tidak berpindah model otomatis.

## Verifikasi lokal

- Build API, typecheck tes API, build web, typecheck mobile, dan lint mobile lulus.
- Sembilan unit test provider dan lima test UI chat web lulus. Percobaan awal web terlambat memuat route; pengulangan lulus tanpa mengubah assertion.
- Sepuluh berkas / 90 tes mobile lulus dengan satu worker dan --testTimeout=30000. Tes opname persisten 200 scan sebelumnya melewati timeout bawaan lima detik; assertion tidak diubah.
- Metro berhasil menyusun bundle Android dari entry aplikasi: HTTP 200, 9.199.478 byte, termasuk ikon bersama dan layar chat terbaru.
- Setelah izin eksplisit pengguna untuk mengirim pesan demo beserta instruksi sistem/definisi alat ke Gemini, percakapan melalui API dengan autentikasi platform Android berhasil: HTTP 200, event start → delta → done, pesan COMPLETED.
- Chromium berhasil login akun guru demo, menyetujui pemrosesan, mengirim sapaan melalui UI web, menerima jawaban lengkap, dan memperbarui kuota dari 49 menjadi 48 dari batas 50 pesan. Sapaan tanpa data sekolah nyata; bukan pengujian seluruh tool/pengambilan data sekolah.
- Panel web pada viewport 390 × 844 menampilkan kuota, persetujuan, pesan dan composer tanpa overflow horizontal. Bukti lokal: tmp/demo/chat-app-check.json, tmp/demo/mobile-bundle-check.json, tmp/demo/chat-web-mobile.png (diabaikan Git).

## Batas verifikasi

Tidak ada perangkat Android tersambung. Emulator AVD gagal mulai karena ruang disk tidak cukup. Rendering native, keyboard, sentuhan, dan safe area belum diperiksa langsung pada perangkat; keberhasilan bundle/typecheck/tes transport bukan klaim uji perangkat. Muat ulang Expo development build untuk mengambil JavaScript terbaru.

Drive C kemudian kehabisan ruang saat pencatatan hasil. Video simulasi QR buatan agen di tmp/demo/qr-camera.y4m dibersihkan agar pencatatan dapat diselesaikan; video dapat dibuat ulang oleh tmp/check-qr-camera.mjs. Tidak menghapus data pengguna atau database. Tidak ada perubahan status PR, commit/push, atau deployment.
