import type { MaterialSummary } from "@sigm4/schemas";
import { Lencana } from "../../shared/ui/primitives";
import type { Semantik } from "../../shared/ui/primitives";

/** BR-091a, UXD-29: status stok bagi Siswa/OSIS — badge ikon + teks (UX-03) pengganti angka saldo. */
const PETA: Readonly<Record<MaterialSummary["status_stok"], readonly [Semantik, string]>> = { TERSEDIA: ["success", "Tersedia"], TERBATAS: ["warning", "Terbatas"], HABIS: ["error", "Habis"] };

export function StatusStok({ status }: { readonly status: MaterialSummary["status_stok"] }) {
    const [varian, label] = PETA[status];
    return <Lencana varian={varian}>{label}</Lencana>;
}
