import type { PageTourSpec, TourCopy } from "../../shared/ui/tour";

/**
 * Katalog tur produk mobile berbasis role (keputusan pemilik produk 26 Oktober 2026). Role hanya memilih
 * NARASI; hak akses tetap dari `/me` — tab Chatbot dan tombol mengambang yang tidak dirender bagi pengguna
 * tanpa `chat.use` otomatis tidak menjadi langkah tur. Kunci berawalan `mobile.` agar progres web dan
 * mobile tersimpan terpisah di `/me/tours`.
 */

/** Naikkan bila isi tur berubah: server menyimpan versi terakhir yang dilihat pengguna. */
export const TOUR_VERSION = 1;

export type MainStep = "home" | "tasks" | "scan" | "chat" | "menu";
export const MAIN_STEP_ORDER: Readonly<Record<MainStep, number>> = { home: 1, tasks: 2, scan: 3, chat: 4, menu: 5 };

interface RoleCopy { readonly role: string; readonly tasks: string; readonly scan: string; readonly menu: string }

const ROLE_COPY: Readonly<Record<string, RoleCopy>> = {
    "R-01": { role: "Administrator", tasks: "Permintaan reset password dan persetujuan yang menunggu Anda.", scan: "Pindai QR aset untuk melihat detailnya.", menu: "Pengguna, Role, Approval Rules, Pengaturan, dan Activity Log ada di sini." },
    "R-02": { role: "Petugas Sarana Prasarana", tasks: "Serah terima, laporan kerusakan, dan work order hari ini.", scan: "Pindai QR aset untuk serah terima, mutasi, atau opname.", menu: "Inventaris, Bahan, Opname, dan Pengadaan ada di sini." },
    "R-03": { role: "Pimpinan Sekolah", tasks: "Pengajuan yang menunggu keputusan Anda.", scan: "Pindai QR aset untuk melihat kondisi dan riwayatnya.", menu: "Analitik, Laporan, dan Penghapusan Aset ada di sini." },
    "R-04": { role: "Teknisi", tasks: "Work order yang ditugaskan kepada Anda.", scan: "Pindai QR aset untuk melapor atau mengerjakan perbaikan.", menu: "Jadwal Pemeliharaan dan Laporan Kerusakan ada di sini." },
    "R-05": { role: "Guru", tasks: "Reservasi, peminjaman, dan persetujuan Anda.", scan: "Pindai QR aset untuk melihat detail atau melapor kerusakan.", menu: "Kalender Ruangan, Katalog Aset, dan Reservasi ada di sini." },
    "R-06": { role: "Staf / Tata Usaha", tasks: "Reservasi dan peminjaman Anda.", scan: "Pindai QR aset untuk melihat detail atau melapor kerusakan.", menu: "Kalender Ruangan, Katalog Aset, dan Reservasi ada di sini." },
    "R-07": { role: "Siswa / OSIS", tasks: "Peminjaman dan tenggat pengembalian Anda.", scan: "Pindai QR aset untuk melihat detail atau melapor kerusakan.", menu: "Katalog Aset, Reservasi, dan Denda ada di sini." },
};

const GENERIC: RoleCopy = { role: "pengguna", tasks: "Pekerjaan yang menunggu Anda.", scan: "Pindai QR aset untuk melihat detailnya.", menu: "Seluruh fitur sesuai hak akses Anda ada di sini." };

export const mainTourKey = (roleCode: string) => `mobile.utama.${roleCode.toLowerCase()}`;

/** Teks setiap langkah tur utama untuk role ini; role kustom memakai narasi umum. */
export function mainTourCopy(roleCode: string, name: string): Readonly<Record<MainStep, TourCopy>> {
    const c = ROLE_COPY[roleCode] ?? GENERIC;
    const first = name.split(" ")[0] ?? name;
    return {
        home: { title: `Selamat datang, ${first}!`, text: `Tur singkat SIGM4 untuk peran ${c.role}. Beranda berisi ringkasan dan aksi cepat Anda.` },
        tasks: { title: "Tugas", text: c.tasks },
        scan: { title: "Scan QR", text: c.scan },
        chat: { title: "Chatbot", text: "Tanyakan apa saja tentang aset dan prosedur sekolah. Tombol bulat di pojok kanan bawah membukanya dari layar mana pun." },
        menu: { title: "Menu", text: `${c.menu} Tur ini dapat diputar lagi dari Menu.` },
    };
}

const page = (key: string, header: TourCopy, content: TourCopy): PageTourSpec => ({ key: `mobile.halaman.${key}`, header, content });

/** Mini-tur layar inti: path expo-router → tur (pencocokan persis; layar dinamis tidak memiliki tur). */
export const PAGE_TOURS: Readonly<Record<string, PageTourSpec>> = {
    "/": page("beranda", { title: "Beranda", text: "Ringkasan keadaan dan hal yang perlu Anda tindak." }, { title: "Aksi cepat", text: "Ketuk kartu atau tile untuk langsung membuka fiturnya." }),
    "/tugas": page("tugas", { title: "Tugas", text: "Semua pekerjaan yang menunggu Anda dalam satu daftar." }, { title: "Kerjakan", text: "Ketuk tugas untuk membuka dan menyelesaikannya." }),
    "/scan": page("scan", { title: "Scan QR", text: "Arahkan kamera ke label QR aset." }, { title: "Tanpa QR?", text: "Ketik kode aset secara manual bila label rusak." }),
    "/menu": page("menu", { title: "Menu", text: "Pintu ke seluruh fitur, dikelompokkan per bidang kerja." }, { title: "Cari fitur", text: "Ketik nama fitur atau ketuk tile modulnya." }),
    "/aset": page("inventaris", { title: "Inventaris Aset", text: "Semua aset sekolah dalam satu daftar." }, { title: "Saring & buka", text: "Saring menurut kategori atau kondisi, lalu ketuk kartu untuk detail." }),
    "/katalog-aset": page("katalog-aset", { title: "Katalog Aset", text: "Alat yang dapat dipinjam sesuai hak Anda." }, { title: "Pilih alat", text: "Ketuk alat untuk melihat ketersediaan dan mengajukan peminjaman." }),
    "/kalender-ruangan": page("kalender-ruangan", { title: "Kalender Ruangan", text: "Jadwal setiap ruangan sebelum memesan." }, { title: "Pesan ruangan", text: "Pilih slot kosong untuk mengajukan reservasi." }),
    "/reservasi/baru": page("wizard-reservasi", { title: "Ajukan Reservasi", text: "Tiga langkah: pilih slot, isi detail, tinjau." }, { title: "Tinjau dulu", text: "Langkah terakhir menampilkan tanggal bentrok sebelum dikirim." }),
    "/peminjaman": page("peminjaman", { title: "Peminjaman", text: "Barang yang dipinjam beserta tenggatnya." }, { title: "Perpanjang", text: "Ketuk peminjaman untuk memperpanjang atau melihat bukti." }),
    "/persetujuan": page("persetujuan", { title: "Persetujuan", text: "Pengajuan yang menunggu keputusan Anda." }, { title: "Putuskan", text: "Ketuk pengajuan untuk menyetujui atau menolak dengan alasan." }),
    "/kerusakan/lapor": page("lapor-kerusakan", { title: "Lapor Kerusakan", text: "Laporkan fasilitas yang rusak dalam beberapa langkah." }, { title: "Foto membantu", text: "Sertakan foto dan tingkat kerusakan agar cepat ditangani." }),
    "/work-order": page("work-order", { title: "Work Order", text: "Pekerjaan perbaikan dari ditugaskan sampai selesai." }, { title: "Catat progres", text: "Ketuk work order untuk mencatat pekerjaan, biaya, dan hasil." }),
    "/opname": page("opname", { title: "Stock Opname", text: "Sesi hitung fisik aset dan bahan." }, { title: "Pindai untuk menghitung", text: "Buka sesi lalu pindai QR setiap aset di lokasi." }),
    "/pengadaan": page("pengadaan", { title: "Pengadaan", text: "Usulan pembelian dari draf sampai barang diterima." }, { title: "Buat usulan", text: "Lampirkan foto faktur atau spesifikasi langsung dari kamera." }),
    "/analitik": page("analitik", { title: "Statistik & Analitik", text: "Grafik pemanfaatan, kerusakan, dan biaya." }, { title: "Laporan", text: "Ketuk grafik untuk laporan rinci dan ekspor." }),
    "/pengguna": page("pengguna", { title: "Pengguna", text: "Seluruh akun sekolah beserta role-nya." }, { title: "Kelola akun", text: "Ketuk akun untuk mengubah, mereset password, atau menonaktifkan." }),
    "/approval-rules": page("approval-rules", { title: "Approval Rules", text: "Aturan alur persetujuan setiap jenis pengajuan." }, { title: "Ubah aturan", text: "Ketuk aturan untuk mengatur langkah, SLA, dan approver cadangan." }),
};

export function pageTourFor(pathname: string): PageTourSpec | null { return PAGE_TOURS[pathname] ?? null; }

export interface TourProgress { readonly kunci: string; readonly status: "SELESAI" | "DILEWATI"; readonly versi: number }

/** Tur perlu diputar otomatis bila belum pernah selesai/dilewati, atau versinya sudah usang. */
export function needsTour(progress: readonly TourProgress[], key: string, version = TOUR_VERSION): boolean {
    const p = progress.find((x) => x.kunci === key);
    return p === undefined || p.versi < version;
}

/** Mini-tur halaman hanya otomatis setelah tur utama tuntas, agar dua tur tidak bertumpuk. */
export function shouldAutoRunPage(progress: readonly TourProgress[] | null, mainKey: string, key: string): boolean {
    return progress !== null && !needsTour(progress, mainKey) && needsTour(progress, key);
}
