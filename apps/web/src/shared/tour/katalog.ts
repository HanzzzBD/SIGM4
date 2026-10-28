// Katalog tur produk web berbasis role (keputusan pemilik produk 26 Oktober 2026).
// Role hanya memilih NARASI tur; hak akses tetap dari `/me` (SDD-FE-04): langkah yang
// elemennya tidak dirender — karena permission, layar sempit, atau halaman belum terdaftar —
// dilewati, sehingga tur tidak pernah menunjuk menu yang tidak boleh dibuka pengguna.
// Jangkar memakai `data-tour` pada shell dan selektor semantik (href, h1, table) pada halaman,
// agar tetap berlaku saat tata letak halaman berubah.

/** Naikkan bila isi tur berubah: server menyimpan versi terakhir yang dilihat pengguna. */
export const VERSI_TUR = 3;

export interface LangkahTur {
    /** Selektor kandidat; yang pertama ditemukan & terlihat dipakai. Kosong = popover di tengah. */
    readonly elemen?: readonly string[];
    readonly judul: string;
    readonly isi: string;
    readonly sisi?: "top" | "right" | "bottom" | "left";
    readonly rata?: "start" | "center" | "end";
}

export interface Tur {
    readonly kunci: string;
    readonly judul: string;
    readonly langkah: readonly LangkahTur[];
}

const nav = (halaman: string, judul: string, isi: string): LangkahTur => ({ elemen: [`[data-tour="nav-${halaman}"]`], judul, isi, sisi: "right", rata: "center" });

/** Dua titik mulai paling penting per role; detail cara kerja ada di panduan halaman sesuai kebutuhan. */
const NARASI_ROLE: Readonly<Record<string, { readonly peran: string; readonly menu: readonly LangkahTur[] }>> = {
    "R-01": {
        peran: "Administrator",
        menu: [
            nav("P-60", "Pengguna", "Buat akun, impor daftar staf atau siswa, dan nonaktifkan akun yang sudah tidak digunakan."),
            nav("P-65", "Role & Permission", "Tentukan fitur mana yang boleh dilihat dan digunakan setiap kelompok pengguna."),
        ],
    },
    "R-02": {
        peran: "Petugas Sarana Prasarana",
        menu: [
            nav("P-15", "Inventaris Aset", "Cari aset, perbarui lokasinya, atau daftarkan aset baru. Label QR bisa dicetak dari data aset."),
            nav("P-33", "Serah Terima", "Catat barang saat diberikan atau dikembalikan agar peminjam dan kondisinya tercatat."),
        ],
    },
    "R-03": {
        peran: "Pimpinan Sekolah",
        menu: [
            nav("P-12", "Dashboard", "Mulai di sini untuk melihat kondisi aset dan pengajuan yang menunggu keputusan Anda."),
            nav("P-37", "Persetujuan Saya", "Periksa rincian pengajuan, lalu setujui atau tolak dengan alasan."),
        ],
    },
    "R-04": {
        peran: "Teknisi",
        menu: [
            nav("P-42", "Work Order", "Buka perbaikan yang ditugaskan, catat pekerjaan dan biaya, lalu kirim hasilnya untuk diperiksa."),
            nav("P-45", "Jadwal Pemeliharaan", "Periksa perawatan rutin yang segera jatuh tempo dan catat hasil saat selesai."),
        ],
    },
    "R-05": {
        peran: "Guru",
        menu: [
            nav("P-27", "Kalender Ruangan", "Pilih tanggal untuk melihat waktu kosong sebelum mengajukan pemakaian ruangan."),
            nav("P-28", "Katalog Aset", "Cari alat yang tersedia, buka detailnya, lalu ajukan pinjaman untuk kegiatan belajar."),
        ],
    },
    "R-06": {
        peran: "Staf / Tata Usaha",
        menu: [
            nav("P-27", "Kalender Ruangan", "Pilih tanggal untuk melihat waktu kosong sebelum mengajukan pemakaian ruangan."),
            nav("P-28", "Katalog Aset", "Cari barang yang tersedia dan buka detailnya untuk mengajukan peminjaman."),
        ],
    },
    "R-07": {
        peran: "Siswa / OSIS",
        menu: [
            nav("P-28", "Katalog Aset", "Cari alat yang boleh dipinjam, lalu buka detailnya sebelum membuat pengajuan."),
            nav("P-30", "Reservasi", "Ajukan pemakaian ruangan atau alat, lalu cek apakah permintaan sudah disetujui."),
        ],
    },
};

/** Pengenalan singkat berbasis role; role kustom mendapat pengantar umum tanpa sorotan khusus. */
export function turUtama(roleKode: string, nama: string): Tur {
    const narasi = NARASI_ROLE[roleKode];
    const peran = narasi?.peran ?? "pengguna";
    return {
        kunci: `utama.${roleKode.toLowerCase()}`,
        judul: "Pengenalan SIGM4",
        langkah: [
            { judul: `Selamat datang, ${nama.split(" ")[0] ?? nama}!`, isi: `Pengenalan singkat untuk ${peran}: lihat tugas utama dan lokasi fitur yang paling sering digunakan.` },
            { elemen: ['[data-tour="sidebar"]'], judul: "Temukan fitur", isi: "Pilih nama fitur di menu samping untuk membuka daftar atau pekerjaan terkait. Menu mengikuti akses akun Anda.", sisi: "right", rata: "center" },
            ...(narasi?.menu ?? []),
            { elemen: ['[data-tour="bantuan-halaman"]', '[data-tour="menu-pengguna"]'], judul: "Butuh bantuan?", isi: "Panduan tiap halaman tersedia lewat ikon bantuan. Pengenalan ini bisa diputar lagi dari menu akun." },
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
export function turHalaman(path: string): Tur {
    return TUR_HALAMAN[path] ?? {
        kunci: "halaman.lainnya",
        judul: "Panduan halaman",
        langkah: [
            { elemen: judul, judul: "Halaman ini", isi: "Gunakan bagian halaman ini untuk melihat daftar atau mengisi data. Buka ikon bantuan lagi kapan pun Anda perlu pengingat." },
        ],
    };
}
