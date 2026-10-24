// Nilai API desimal dipertahankan sebagai teks, tanpa kehilangan presisi Number.
export const rupiah = (value: string | null) => {
    if (value === null) return "Menunggu penetapan";
    const [whole, fraction = "00"] = value.split(".");
    return `Rp${whole!.replace(/\B(?=(\d{3})+(?!\d))/g, ".")}${fraction === "00" ? "" : `,${fraction}`}`;
};
export const loanLabels = { DIPINJAM: "Dipinjam", SEBAGIAN_DIKEMBALIKAN: "Sebagian Dikembalikan", DIKEMBALIKAN: "Dikembalikan", TERLAMBAT: "Terlambat", HILANG: "Hilang" } as const;
export const waktuWib = (time: string) => `${new Date(time).toLocaleString("id-ID", { timeZone: "Asia/Jakarta", dateStyle: "long", timeStyle: "short" })} WIB`;
