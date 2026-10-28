import type { PageTourSpec, TourCopy } from "../../shared/ui/tour";

/**
 * Katalog tur produk mobile berbasis role (keputusan pemilik produk 26 Oktober 2026). Role hanya memilih
 * NARASI; hak akses tetap dari `/me` — tab Chatbot dan tombol mengambang yang tidak dirender bagi pengguna
 * tanpa `chat.use` otomatis tidak menjadi langkah tur. Kunci berawalan `mobile.` agar progres web dan
 * mobile tersimpan terpisah di `/me/tours`.
 */

/** Naikkan bila isi tur berubah: server menyimpan versi terakhir yang dilihat pengguna. */
export const TOUR_VERSION = 3;

export type MainStep = "home" | "tasks" | "scan" | "chat" | "menu";
export const MAIN_STEP_ORDER: Readonly<Record<MainStep, number>> = { home: 1, tasks: 2, scan: 3, chat: 4, menu: 5 };

interface RoleCopy { readonly role: string; readonly tasks: string; readonly scan: string; readonly menu: string }

const ROLE_COPY: Readonly<Record<string, RoleCopy>> = {
    "R-01": { role: "Administrator", tasks: "Buka tugas untuk menindaklanjuti permintaan reset password atau memberi keputusan pada pengajuan.", scan: "Pindai QR untuk membuka identitas dan riwayat aset tanpa mencarinya dari daftar.", menu: "Kelola akun dan hak akses di Pengguna dan Role; atur alur keputusan di Approval Rules." },
    "R-02": { role: "Petugas Sarana Prasarana", tasks: "Buka tugas untuk memproses serah terima barang atau melihat perbaikan yang perlu ditindaklanjuti.", scan: "Pindai QR untuk mengenali aset, lalu pilih proses seperti mutasi atau opname yang tersedia bagi Anda.", menu: "Mulai dari Inventaris untuk mencari aset, atau Serah Terima untuk mencatat barang keluar dan kembali." },
    "R-03": { role: "Pimpinan Sekolah", tasks: "Buka pengajuan di daftar tugas untuk melihat rinciannya, lalu setujui atau tolak.", scan: "Pindai QR untuk melihat kondisi dan riwayat aset sebelum mengambil keputusan.", menu: "Gunakan Analitik untuk meninjau kondisi dan biaya; buka Penghapusan Aset untuk memutuskan usulan." },
    "R-04": { role: "Teknisi", tasks: "Buka work order yang ditugaskan, catat progres perbaikan, lalu kirim hasilnya untuk ditinjau.", scan: "Pindai QR untuk memastikan aset yang sedang diperbaiki dan menghubungkannya dengan laporan.", menu: "Work Order berisi daftar perbaikan Anda; Jadwal Pemeliharaan berisi perawatan rutin yang akan datang." },
    "R-05": { role: "Guru", tasks: "Buka tugas untuk memeriksa status persetujuan, jadwal reservasi, dan tenggat barang pinjaman.", scan: "Pindai QR untuk memastikan detail alat; dari aset, Anda juga dapat membuat laporan kerusakan.", menu: "Cek Kalender Ruangan sebelum memesan; gunakan Katalog Aset untuk mencari alat yang bisa dipinjam." },
    "R-06": { role: "Staf / Tata Usaha", tasks: "Buka tugas untuk memeriksa status reservasi dan tenggat barang yang sedang dipinjam.", scan: "Pindai QR untuk mengenali aset dan melihat detailnya sebelum membuat laporan kerusakan.", menu: "Cek Kalender Ruangan sebelum memesan; Katalog Aset menunjukkan barang yang tersedia untuk dipinjam." },
    "R-07": { role: "Siswa / OSIS", tasks: "Buka tugas untuk melihat barang yang dipinjam dan kapan harus dikembalikan.", scan: "Pindai QR untuk melihat detail aset; pastikan barang yang dipilih sesuai sebelum mengajukan pinjaman.", menu: "Cari barang di Katalog Aset dan ajukan lewat Reservasi; cek tenggat di Peminjaman atau kewajiban di Denda." },
};

const GENERIC: RoleCopy = { role: "pengguna", tasks: "Buka tugas untuk melihat pekerjaan atau pengajuan yang perlu Anda tindak lanjuti.", scan: "Pindai QR untuk membuka detail aset tanpa mencarinya dari daftar.", menu: "Cari nama fitur di Menu; daftar yang tampil mengikuti akses akun Anda." };

export const mainTourKey = (roleCode: string) => `mobile.utama.${roleCode.toLowerCase()}`;

/** Teks setiap langkah tur utama untuk role ini; role kustom memakai narasi umum. */
export function mainTourCopy(roleCode: string, name: string): Readonly<Record<MainStep, TourCopy>> {
    const c = ROLE_COPY[roleCode] ?? GENERIC;
    const first = name.split(" ")[0] ?? name;
    return {
        home: { title: `Selamat datang, ${first}!`, text: `Pengenalan singkat untuk ${c.role}. Beranda merangkum keadaan sekolah dan menaruh hal yang perlu Anda tindak di bagian atas.` },
        tasks: { title: "Mulai dari Tugas", text: c.tasks },
        scan: { title: "Kenali aset dengan Scan", text: c.scan },
        chat: { title: "Chatbot", text: "Tanyakan apa saja tentang aset dan prosedur sekolah. Tombol bulat di pojok kanan bawah membukanya dari layar mana pun." },
        menu: { title: "Temukan fitur di Menu", text: `${c.menu} Ketuk Cari modul untuk menemukan fitur yang belum terlihat; pengenalan ini bisa dibuka lagi dari sini.` },
    };
}

const page = (key: string, header: TourCopy, content: TourCopy, extras: Pick<PageTourSpec, "action" | "footer"> = {}): PageTourSpec => ({ key: `mobile.halaman.${key}`, header, content, ...extras });

/** Mini-tur layar inti: path expo-router → tur (pencocokan persis; layar dinamis tidak memiliki tur). */
export const PAGE_TOURS: Readonly<Record<string, PageTourSpec>> = {
    "/": page("beranda", { title: "Beranda", text: "Ringkasan kondisi sekolah dan hal yang perlu Anda tindak ada di sini." }, { title: "Mulai dari yang perlu tindakan", text: "Ketuk kartu tugas untuk langsung membuka daftar yang perlu diselesaikan." }, { action: { title: "Atur rentang ringkasan", text: "Pilih periode untuk mengganti rentang data yang tampil di Beranda." } }),
    "/tugas": page("tugas", { title: "Tugas", text: "Daftar ini mengumpulkan pengajuan dan pekerjaan yang perlu Anda tindaklanjuti." }, { title: "Lihat langkah berikutnya", text: "Ketuk satu tugas untuk melihat detail, mengambil keputusan, atau mencatat progres." }),
    "/scan": page("scan", { title: "Scan QR", text: "Arahkan kamera ke label QR pada aset untuk membuka detail dan riwayatnya." }, { title: "Jika label tidak terbaca", text: "Pilih masukkan kode, lalu ketik kode aset yang tercetak pada label." }),
    "/menu": page("menu", { title: "Menu", text: "Fitur dikelompokkan menurut bidang kerja dan mengikuti akses akun Anda." }, { title: "Cari lalu buka", text: "Ketik nama fitur di Cari modul; ketuk hasilnya untuk membuka halaman tersebut." }),
    "/aset": page("inventaris", { title: "Inventaris Aset", text: "Daftar ini berisi aset sekolah beserta lokasi dan kondisinya." }, { title: "Saring dan periksa", text: "Pilih kategori atau kondisi untuk mempersempit daftar, lalu buka aset untuk melihat detail dan riwayat." }, { footer: { title: "Aksi inventaris", text: "Saat memilih aset, tombol di bawah menjalankan mutasi lokasi untuk aset yang sudah dicentang." } }),
    "/katalog-aset": page("katalog-aset", { title: "Katalog Aset", text: "Cari alat yang boleh dipinjam melalui akun Anda." }, { title: "Cek sebelum mengajukan", text: "Buka alat untuk melihat ketersediaannya, lalu kirim permintaan pinjaman dari halaman detail." }),
    "/kalender-ruangan": page("kalender-ruangan", { title: "Kalender Ruangan", text: "Pilih tanggal untuk melihat jadwal dan waktu kosong setiap ruangan." }, { title: "Ajukan waktu kosong", text: "Ketuk slot yang tersedia untuk membawa pilihan tanggal dan waktu ke formulir reservasi." }),
    "/reservasi/baru": page("wizard-reservasi", { title: "Ajukan Reservasi", text: "Isi pengajuan dalam tiga tahap: pilih jadwal, lengkapi keperluan, lalu tinjau." }, { title: "Periksa sebelum mengirim", text: "Tinjauan menandai jadwal bentrok agar Anda bisa mengubah pilihan sebelum mengajukan." }, { footer: { title: "Lanjutkan atau kirim", text: "Gunakan tombol bawah untuk berpindah tahap; pada tinjauan, tombol itu mengirim pengajuan." } }),
    "/peminjaman": page("peminjaman", { title: "Peminjaman", text: "Lihat barang yang sedang dipinjam, statusnya, dan tanggal pengembalian." }, { title: "Buka detail pinjaman", text: "Gunakan detail untuk melihat bukti serah terima atau meminta perpanjangan jika tersedia." }),
    "/persetujuan": page("persetujuan", { title: "Persetujuan", text: "Daftar ini berisi pengajuan yang menunggu keputusan Anda." }, { title: "Baca lalu putuskan", text: "Buka pengajuan untuk memeriksa rincian, kemudian setujui atau tolak dengan alasan." }, { action: { title: "Kembali ke Tugas", text: "Tombol ini membawa Anda ke antrean tugas tanpa mengubah pengajuan." } }),
    "/kerusakan/lapor": page("lapor-kerusakan", { title: "Lapor Kerusakan", text: "Pilih aset dan jelaskan kerusakan agar petugas tahu apa yang perlu diperbaiki." }, { title: "Tambahkan bukti", text: "Sertakan foto dan tingkat kerusakan; laporan yang lengkap lebih mudah diprioritaskan." }),
    "/work-order": page("work-order", { title: "Work Order", text: "Pantau perbaikan dari penugasan sampai hasilnya diperiksa." }, { title: "Catat pekerjaan", text: "Buka work order untuk mengisi progres, biaya, dan hasil perbaikan sebelum dikirim." }),
    "/opname": page("opname", { title: "Stock Opname", text: "Gunakan sesi ini untuk mencocokkan catatan aset dengan jumlah fisik di lokasi." }, { title: "Pindai tiap aset", text: "Buka sesi opname, lalu scan QR setiap aset yang ditemukan agar hasil hitung tercatat." }),
    "/pengadaan": page("pengadaan", { title: "Pengadaan", text: "Pantau usulan pembelian dari pengajuan sampai barang diterima." }, { title: "Lengkapi usulan", text: "Isi barang dan perkiraan biaya, lalu lampirkan foto faktur atau spesifikasi sebagai bukti." }, { footer: { title: "Kirim atau simpan draf", text: "Pilih Ajukan untuk memulai proses persetujuan, atau Simpan draf untuk melanjutkan nanti." } }),
    "/analitik": page("analitik", { title: "Statistik & Analitik", text: "Grafik merangkum pemanfaatan aset, kerusakan, dan biaya." }, { title: "Sesuaikan periode", text: "Pilih rentang waktu untuk membandingkan tren; buka grafik untuk rincian bila tersedia." }),
    "/pengguna": page("pengguna", { title: "Pengguna", text: "Daftar ini memuat akun sekolah dan role yang menentukan aksesnya." }, { title: "Kelola akun", text: "Buka akun untuk mengubah data, mengatur ulang password, atau menonaktifkan akses." }),
    "/approval-rules": page("approval-rules", { title: "Approval Rules", text: "Aturan ini menentukan siapa yang memeriksa tiap jenis pengajuan dan urutannya." }, { title: "Periksa sebelum menyimpan", text: "Buka aturan untuk mengubah approver atau batas waktu, lalu gunakan pratinjau untuk mengecek alurnya." }),
};

export function pageTourFor(pathname: string, title: string): PageTourSpec {
    return PAGE_TOURS[pathname] ?? {
        key: "mobile.halaman.lainnya",
        header: { title, text: `Ini halaman ${title}. Ikon info di bagian atas menjelaskan aturan atau batasan khusus halaman ini.` },
        content: { title: "Gunakan isi halaman", text: "Gulir untuk melihat seluruh informasi dan kontrol. Buka baris atau kartu untuk melihat detail; sebelum menyimpan, periksa kembali data yang Anda isi." },
    };
}

export interface TourProgress { readonly kunci: string; readonly status: "SELESAI" | "DILEWATI"; readonly versi: number }

/** Tur perlu diputar otomatis bila belum pernah selesai/dilewati, atau versinya sudah usang. */
export function needsTour(progress: readonly TourProgress[], key: string, version = TOUR_VERSION): boolean {
    const p = progress.find((x) => x.kunci === key);
    return p === undefined || p.versi < version;
}
