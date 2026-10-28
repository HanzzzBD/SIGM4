import { useQuery } from "@tanstack/react-query";
import { KeadaanGalat, KeadaanKosong, KeadaanMemuat } from "../../shared/states";
import { analyticsCatalogQuery } from "./api";
import { useSesi } from "../../shared/auth";
import { analyticsCacheScope } from "./cache-scope";
const descriptions: Record<string, string> = { "kondisi-aset": "Komposisi kondisi dan perubahan antarbulan.", "pemanfaatan-fasilitas": "Jam pemakaian ruangan dan aset dibandingkan kapasitasnya.", "biaya-pemeliharaan": "Biaya per kategori, aset, dan periode.", "tren-kerusakan": "Laporan kerusakan dan waktu penyelesaiannya.", "aktivitas-peminjaman": "Aktivitas peminjam, aset populer, dan keterlambatan.", "konsumsi-bahan": "Pemakaian bahan dan unit kerja peminta.", "kebutuhan-pengadaan": "Kandidat penggantian berdasarkan kondisi dan umur teknis.", "rekapitulasi-aset": "Daftar aset, lokasi, tahun, dan nilai sesuai izin." };
export default function AnalyticsListPage() {
    const query = useQuery({ ...analyticsCatalogQuery, queryKey: [...analyticsCatalogQuery.queryKey, ...analyticsCacheScope(useSesi())] });
    return <div className="flex flex-col gap-6"><header><h1 className="text-2xl font-semibold text-text-heading">Statistik & Analitik</h1><p className="mt-2 text-base text-text-secondary">Pilih laporan untuk perencanaan dan evaluasi sarana prasarana. Data mengikuti cakupan akses Anda.</p></header>
        {query.isPending ? <KeadaanMemuat label="Memuat jenis laporan" /> : query.isError ? <KeadaanGalat galat={query.error} onCobaLagi={() => void query.refetch()} /> : !query.data.length ? <KeadaanKosong judul="Belum ada laporan yang dapat diakses" pesan="Laporan memerlukan izin baca domain sumber." /> : <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label="Jenis laporan">{query.data.map(r => <li key={r.jenis} className="rounded-md border border-border-subtle bg-surface-default p-5"><h2 className="text-lg font-semibold text-text-heading">{r.status === "SIAP" ? <a href={`/analitik/${r.jenis}`} className="text-text-link hover:underline">{r.judul}</a> : r.judul}</h2><p className="mt-2 text-base text-text-secondary">{descriptions[r.jenis]}</p>{r.status === "BELUM_TERSEDIA" && <p className="mt-3 text-sm text-text-secondary">Perhitungan belum tersedia</p>}</li>)}</ul>}
    </div>;
}
