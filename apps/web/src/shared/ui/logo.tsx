// Identitas SIGM4 (DESIGN-SYSTEM §2, DSD-01): wordmark untuk sidebar terbuka & halaman masuk,
// ikon untuk sidebar ciut dan favicon. Salinan web dari `logosidebar.svg`/`iconwebsite.svg`
// di akar repositori dengan viewBox dipangkas ke isinya — tanpa ruang kosong kanvas.
import ikon from "./aset/ikon-sigm4.svg";
import logo from "./aset/logo-sigm4.svg";
import { gabung } from "./primitives";

const TINGGI = { sm: "h-6", md: "h-8", lg: "h-12" } as const;

/** Nama aplikasi dibawa `alt` — logo menggantikan teks "SIGM4", bukan hiasan. */
export function Logo({ varian = "wordmark", ukuran = "md", className }: { readonly varian?: "wordmark" | "ikon"; readonly ukuran?: keyof typeof TINGGI; readonly className?: string }) {
    return <img src={varian === "wordmark" ? logo : ikon} alt="SIGM4" className={gabung(TINGGI[ukuran], "w-auto", className)} />;
}
