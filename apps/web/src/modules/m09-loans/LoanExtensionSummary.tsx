import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useCan } from "../../shared/auth";
import { KeadaanGalat, KeadaanMemuat } from "../../shared/states";
import { extensionContextQuery } from "./management-api";
import { waktuWib } from "./presentation";

export default function LoanExtensionSummary({ id }: { readonly id: number }) {
 const query = useQuery(extensionContextQuery(id)), can = useCan();
 if (query.isPending) return <KeadaanMemuat label="Memuat konteks perpanjangan" />;
 if (query.isError) return <KeadaanGalat galat={query.error} onCobaLagi={() => void query.refetch()} />;
 const { pengajuan: ext, peminjaman: loan } = query.data;
 return <div className="flex flex-col gap-3"><p className="font-semibold">Perpanjangan {loan.nomor}</p><p>Peminjam: {loan.peminjam}</p><p>Jatuh tempo lama {waktuWib(ext.jatuh_tempo_lama)}</p><p>Jadwal yang diminta {waktuWib(ext.jatuh_tempo_baru)}</p><p>Alasan: {ext.alasan}</p><ul>{loan.unit.map((u) => <li key={u.kode_barang}>{u.kode_barang} · {u.nama} · {u.status_kembali === "BELUM_KEMBALI" ? "Belum kembali" : "Sudah diproses"}</li>)}</ul><p className="text-sm">Ketersediaan, batas durasi dan keadaan peminjaman diperiksa kembali oleh server saat keputusan. Keterlambatan sebelum persetujuan tetap dihitung.</p>{can("loan.view") && <Link to="/peminjaman/$id" params={{ id: loan.id }} className="text-text-link underline">Buka detail peminjaman</Link>}</div>;
}
