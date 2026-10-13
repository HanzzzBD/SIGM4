export function taskSections(permissions: Readonly<Record<string, string>>) {
    const can = (permission: string) => Object.hasOwn(permissions, permission);
    const sections: { kind: string; label: string }[] = [];
    if (can("workorder.execute")) sections.push({ kind: "workorder", label: "Work order saya" });
    if (can("loan.manage")) sections.push({ kind: "handover", label: "Serah terima hari ini" }, { kind: "returns", label: "Pengembalian jatuh tempo dan terlambat" });
    if (can("audit.execute")) sections.push({ kind: "stocktake", label: "Sesi opname berjalan" });
    if (can("approval.decide")) sections.push({ kind: "approval", label: "Persetujuan menunggu keputusan saya" });
    if (can("damage.verify") && can("damage.view")) sections.push({ kind: "damage", label: "Laporan kerusakan belum diverifikasi" });
    if (sections.length === 0) {
        if (can("reservation.view")) sections.push({ kind: "requests", label: "Pengajuan saya" });
        if (can("loan.view")) sections.push({ kind: "loans", label: "Peminjaman aktif saya" });
        if (can("fine.view")) sections.push({ kind: "fines", label: "Denda saya" });
    }
    return sections;
}
