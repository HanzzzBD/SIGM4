// Katalog tur produk web berbasis role (keputusan pemilik produk 26 Oktober 2026).
// Role hanya memilih NARASI tur; hak akses tetap dari `/me` (SDD-FE-04): langkah yang
// elemennya tidak dirender — karena permission, layar sempit, atau halaman belum terdaftar —
// dilewati, sehingga tur tidak pernah menunjuk menu yang tidak boleh dibuka pengguna.
// Jangkar memakai `data-tour` pada shell dan selektor semantik (href, h1, table) pada halaman,
// agar tetap berlaku saat tata letak halaman berubah.

/** Naikkan bila isi tur berubah: server menyimpan versi terakhir yang dilihat pengguna. */
export const VERSI_TUR = 1;

export interface LangkahTur {
    /** Selektor kandidat; yang pertama ditemukan & terlihat dipakai. Kosong = popover di tengah. */
    readonly elemen?: readonly string[];
    readonly judul: string;
    readonly isi: string;
}

export interface Tur {
    readonly kunci: string;
    readonly judul: string;
    readonly langkah: readonly LangkahTur[];
}

const nav = (halaman: string, judul: string, isi: string): LangkahTur => ({ elemen: [`[data-tour="nav-${halaman}"]`], judul, isi });

const PEMBUKA_SHELL: readonly LangkahTur[] = [
    { elemen: ['[data-tour="sidebar"]'], judul: "Menu utama", isi: "Semua fitur Anda ada di sini, dikelompokkan per bidang kerja. Menu yang tampil sudah disesuaikan dengan hak akses Anda." },
];

const PENUTUP_SHELL: readonly LangkahTur[] = [
    { elemen: ['[data-tour="cari"]'], judul: "Cari cepat", isi: "Ketik kode aset, nomor seri, atau nama untuk langsung menemukan aset." },
    { elemen: ['[data-tour="lonceng"]'], judul: "Notifikasi", isi: "Tenggat, persetujuan, dan pembaruan status muncul di lonceng ini." },
    { elemen: [".sigm4-chat-launcher"], judul: "Tanya SIGM4", isi: "Bingung? Tanyakan apa saja tentang aset dan prosedur sekolah ke asisten ini." },
    { elemen: ['[data-tour="bantuan-halaman"]'], judul: "Panduan halaman", isi: "Tombol ini memutar panduan singkat untuk halaman yang sedang dibuka." },
    { elemen: ['[data-tour="menu-pengguna"]'], judul: "Putar ulang tur", isi: "Tur ini dapat diputar lagi kapan saja lewat menu akun → Tur Aplikasi." },
];

/** Narasi per role: sambutan + menu yang paling sering dipakai role itu. */
const NARASI_ROLE: Readonly<Record<string, { readonly peran: string; readonly menu: readonly LangkahTur[] }>> = {
    "R-01": {
        peran: "Administrator",
        menu: [
            nav("P-60", "Pengguna", "Tambah, impor, dan nonaktifkan akun, termasuk kenaikan kelas massal."),
            nav("P-65", "Role & Permission", "Atur hak akses setiap role lewat matriks permission."),
            nav("P-68", "Approval Rules", "Tentukan siapa yang menyetujui setiap jenis pengajuan."),
            nav("P-70", "Parameter Sistem", "Identitas sekolah, kalender akademik, dan aturan operasional."),
            nav("P-73", "Activity Log", "Jejak setiap perubahan data untuk audit."),
        ],
    },
    "R-02": {
        peran: "Petugas Sarana Prasarana",
        menu: [
            nav("P-15", "Inventaris Aset", "Daftar seluruh aset sekolah: tambah, mutasi, dan cetak label QR."),
            nav("P-33", "Serah Terima", "Serahkan dan terima kembali barang pinjaman dengan bukti foto."),
            nav("P-42", "Work Order", "Tugaskan perbaikan ke teknisi dan pantau sampai selesai."),
            nav("P-47", "Stock Opname", "Hitung fisik aset dan bahan secara berkala."),
            nav("P-51", "Pengadaan", "Ajukan pembelian dan catat penerimaan barang."),
        ],
    },
    "R-03": {
        peran: "Pimpinan Sekolah",
        menu: [
            nav("P-12", "Dashboard", "Ringkasan kondisi aset dan hal yang menunggu keputusan Anda."),
            nav("P-37", "Persetujuan Saya", "Setujui atau tolak pengajuan yang menunggu Anda."),
            nav("P-58", "Statistik & Analitik", "Tren pemanfaatan, kerusakan, dan biaya untuk perencanaan."),
            nav("P-55", "Penghapusan Aset", "Putuskan usulan penghapusan aset yang tidak layak pakai."),
        ],
    },
    "R-04": {
        peran: "Teknisi",
        menu: [
            nav("P-42", "Work Order", "Daftar perbaikan yang ditugaskan kepada Anda."),
            nav("P-39", "Laporan Kerusakan", "Kerusakan yang dilaporkan pengguna."),
            nav("P-45", "Jadwal Pemeliharaan", "Perawatan rutin yang akan jatuh tempo."),
        ],
    },
    "R-05": {
        peran: "Guru",
        menu: [
            nav("P-27", "Kalender Ruangan", "Lihat ruangan yang kosong sebelum memesan."),
            nav("P-28", "Katalog Aset", "Cari alat yang dapat dipinjam untuk pembelajaran."),
            nav("P-30", "Reservasi", "Pantau status pengajuan ruangan dan alat Anda."),
            nav("P-32", "Peminjaman", "Barang yang sedang Anda pinjam beserta tenggatnya."),
            nav("P-39", "Laporan Kerusakan", "Laporkan fasilitas yang rusak dalam beberapa langkah."),
        ],
    },
    "R-06": {
        peran: "Staf / Tata Usaha",
        menu: [
            nav("P-27", "Kalender Ruangan", "Lihat ruangan yang kosong sebelum memesan."),
            nav("P-28", "Katalog Aset", "Cari alat yang dapat dipinjam."),
            nav("P-30", "Reservasi", "Pantau status pengajuan Anda."),
            nav("P-39", "Laporan Kerusakan", "Laporkan fasilitas yang rusak."),
        ],
    },
    "R-07": {
        peran: "Siswa / OSIS",
        menu: [
            nav("P-28", "Katalog Aset", "Cari alat yang boleh dipinjam siswa."),
            nav("P-30", "Reservasi", "Ajukan dan pantau peminjaman ruangan atau alat."),
            nav("P-32", "Peminjaman", "Barang yang sedang Anda pinjam dan tenggat pengembaliannya."),
            nav("P-35", "Denda & Kewajiban", "Cek denda bila ada keterlambatan."),
            nav("P-39", "Laporan Kerusakan", "Laporkan fasilitas yang rusak."),
        ],
    },
};

/** Tur utama untuk role ini; role kustom memakai narasi umum tanpa sorotan menu khusus. */
export function turUtama(roleKode: string, nama: string): Tur {
    const narasi = NARASI_ROLE[roleKode];
    const peran = narasi?.peran ?? "pengguna";
    return {
        kunci: `utama.${roleKode.toLowerCase()}`,
        judul: "Tur Aplikasi",
        langkah: [
            { judul: `Selamat datang, ${nama.split(" ")[0] ?? nama}!`, isi: `Tur singkat ini memperkenalkan SIGM4 untuk peran ${peran}. Tekan Lanjut, atau Lewati bila sudah paham.` },
            ...PEMBUKA_SHELL,
            ...(narasi?.menu ?? []),
            ...PENUTUP_SHELL,
            { judul: "Siap digunakan", isi: "Setiap halaman inti punya panduan singkat yang muncul saat pertama kali dibuka." },
        ],
    };
}

const judul: readonly string[] = ["main h1"];
const filter: readonly string[] = ['main [role="search"]', "main form"];
const data: readonly string[] = ["main table", "main ul"];

/** Mini-tur halaman inti: pola path TanStack Router → tur. */
export const TUR_HALAMAN: Readonly<Record<string, Tur>> = {
    "/": {
        kunci: "halaman.dashboard",
        judul: "Dashboard",
        langkah: [
            { elemen: ['main section[aria-labelledby="zona-1"]', "main section"], judul: "Perlu tindakan", isi: "Kartu teratas berisi hal yang menunggu Anda. Klik kartu untuk membuka daftarnya." },
            { elemen: ['main section[aria-labelledby="zona-2"]'], judul: "Keadaan saat ini", isi: "Angka ringkas kondisi aset dan kegiatan hari ini." },
            { elemen: ['main section[aria-labelledby="zona-3"]'], judul: "Kecenderungan", isi: "Grafik tren untuk melihat perubahan dari waktu ke waktu." },
        ],
    },
    "/aset": {
        kunci: "halaman.inventaris",
        judul: "Inventaris Aset",
        langkah: [
            { elemen: judul, judul: "Inventaris Aset", isi: "Semua aset sekolah dalam satu daftar." },
            { elemen: filter, judul: "Saring", isi: "Persempit daftar menurut kategori, lokasi, kondisi, atau status. Filter tersimpan di alamat halaman sehingga dapat dibagikan." },
            { elemen: ['main a[href="/aset/baru"]'], judul: "Tambah aset", isi: "Daftarkan aset baru; kode dan QR dibuat otomatis." },
            { elemen: data, judul: "Daftar aset", isi: "Klik baris untuk membuka detail, riwayat, dan dokumen aset." },
        ],
    },
    "/kalender-ruangan": {
        kunci: "halaman.kalender-ruangan",
        judul: "Kalender Ruangan",
        langkah: [
            { elemen: judul, judul: "Kalender Ruangan", isi: "Lihat jadwal setiap ruangan sebelum memesan." },
            { elemen: ['main a[href^="/reservasi/baru"]'], judul: "Ajukan reservasi", isi: "Pilih slot kosong lalu ajukan dalam tiga langkah." },
        ],
    },
    "/katalog-aset": {
        kunci: "halaman.katalog-aset",
        judul: "Katalog Aset",
        langkah: [
            { elemen: judul, judul: "Katalog Aset", isi: "Alat yang dapat dipinjam sesuai hak Anda." },
            { elemen: filter, judul: "Cari alat", isi: "Saring menurut kategori atau ketersediaan." },
        ],
    },
    "/reservasi/baru": {
        kunci: "halaman.wizard-reservasi",
        judul: "Ajukan Reservasi",
        langkah: [
            { elemen: ["main ol", ...judul], judul: "Tiga langkah", isi: "Pilih slot → isi detail → tinjau. Anda dapat kembali tanpa kehilangan isian." },
            { judul: "Tinjau sebelum kirim", isi: "Langkah terakhir menampilkan tanggal bentrok yang akan dilewati, jadi tidak ada kejutan setelah dikirim." },
        ],
    },
    "/peminjaman": {
        kunci: "halaman.peminjaman",
        judul: "Peminjaman",
        langkah: [
            { elemen: judul, judul: "Peminjaman", isi: "Barang yang sedang dipinjam beserta tenggat pengembaliannya." },
            { elemen: data, judul: "Status & tenggat", isi: "Buka baris untuk memperpanjang atau melihat bukti serah terima." },
        ],
    },
    "/peminjaman/serah-terima": {
        kunci: "halaman.serah-terima",
        judul: "Serah Terima",
        langkah: [
            { elemen: judul, judul: "Antrean serah terima", isi: "Reservasi yang siap diserahkan atau dikembalikan hari ini." },
            { elemen: data, judul: "Proses", isi: "Pilih baris lalu ambil foto bukti dan tanda tangan peminjam." },
        ],
    },
    "/persetujuan": {
        kunci: "halaman.persetujuan",
        judul: "Persetujuan Saya",
        langkah: [
            { elemen: judul, judul: "Menunggu keputusan Anda", isi: "Pengajuan yang perlu Anda setujui atau tolak." },
            { elemen: data, judul: "Putuskan", isi: "Buka pengajuan untuk melihat rincian, lalu setujui atau tolak dengan alasan." },
        ],
    },
    "/kerusakan": {
        kunci: "halaman.kerusakan",
        judul: "Laporan Kerusakan",
        langkah: [
            { elemen: judul, judul: "Laporan Kerusakan", isi: "Kerusakan yang sudah dilaporkan beserta statusnya." },
            { elemen: ['main a[href="/kerusakan/baru"]'], judul: "Lapor kerusakan", isi: "Pilih aset, beri foto, dan tentukan tingkat kerusakan." },
            { elemen: filter, judul: "Saring", isi: "Cari laporan menurut status atau urgensi." },
        ],
    },
    "/work-order": {
        kunci: "halaman.work-order",
        judul: "Work Order",
        langkah: [
            { elemen: judul, judul: "Work Order", isi: "Pekerjaan perbaikan dari ditugaskan sampai diverifikasi." },
            { elemen: ['main a[href="/work-order/baru"]'], judul: "Buat work order", isi: "Ubah laporan kerusakan menjadi tugas untuk teknisi." },
            { elemen: data, judul: "Pantau", isi: "Buka work order untuk mencatat progres, biaya, dan hasil." },
        ],
    },
    "/opname": {
        kunci: "halaman.opname",
        judul: "Stock Opname",
        langkah: [
            { elemen: judul, judul: "Stock Opname", isi: "Sesi hitung fisik aset dan bahan." },
            { elemen: ['main a[href="/opname/baru"]'], judul: "Buat sesi", isi: "Tentukan lokasi dan pelaksana; hitungan dilakukan dengan memindai QR dari ponsel." },
            { elemen: data, judul: "Rekonsiliasi", isi: "Selisih hasil hitung ditinjau lalu disetujui Pimpinan." },
        ],
    },
    "/pengadaan": {
        kunci: "halaman.pengadaan",
        judul: "Pengadaan",
        langkah: [
            { elemen: judul, judul: "Pengadaan", isi: "Usulan pembelian dari draf sampai barang diterima." },
            { elemen: ['main a[href="/pengadaan/baru"]'], judul: "Buat usulan", isi: "Isi kebutuhan, perkiraan harga, dan lampiran spesifikasi." },
        ],
    },
    "/analitik": {
        kunci: "halaman.analitik",
        judul: "Statistik & Analitik",
        langkah: [
            { elemen: judul, judul: "Statistik & Analitik", isi: "Grafik pemanfaatan, kerusakan, dan biaya." },
            { elemen: filter, judul: "Rentang waktu", isi: "Ubah periode untuk membandingkan tren." },
        ],
    },
    "/pengguna": {
        kunci: "halaman.pengguna",
        judul: "Pengguna",
        langkah: [
            { elemen: judul, judul: "Pengguna", isi: "Seluruh akun sekolah beserta role-nya." },
            { elemen: ['main a[href="/pengguna/baru"]', 'main a[href="/pengguna/impor"]'], judul: "Tambah atau impor", isi: "Tambah satu akun atau impor banyak sekaligus dari templat." },
            { elemen: filter, judul: "Saring", isi: "Cari menurut nama, role, atau status akun." },
        ],
    },
    "/approval-rules": {
        kunci: "halaman.approval-rules",
        judul: "Approval Rules",
        langkah: [
            { elemen: judul, judul: "Approval Rules", isi: "Aturan alur persetujuan untuk setiap jenis pengajuan." },
            { elemen: data, judul: "Ubah aturan", isi: "Buka aturan untuk mengatur kondisi, langkah, SLA, dan approver cadangan; gunakan pratinjau sebelum menyimpan." },
        ],
    },
};

/** Mini-tur untuk path saat ini (pencocokan persis; segmen dinamis tidak memiliki tur). */
export function turHalaman(path: string): Tur | undefined {
    return TUR_HALAMAN[path];
}
