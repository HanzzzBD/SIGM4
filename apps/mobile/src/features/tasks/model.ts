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

/** Known routes only; web handoff uses the configured HTTPS school origin. */
export function taskDestination(kind: string, permissions: Readonly<Record<string,string>>, origin: string, id?: string): {native: string} | {web: string} | null {
    const routes: Record<string,{path:string;permission:string;native:boolean}> = {
        workorder:{path:"/work-order",permission:"workorder.execute",native:true},stocktake:{path:"/opname",permission:"audit.execute",native:true},
        approval:{path:"/persetujuan",permission:"approval.decide",native:true},damage:{path:"/kerusakan",permission:"damage.view",native:true},
        requests:{path:"/reservasi",permission:"reservation.view",native:true},handover:{path:"/peminjaman/serah-terima",permission:"loan.manage",native:false},
        returns:{path:"/peminjaman",permission:"loan.manage",native:false},loans:{path:"/peminjaman",permission:"loan.view",native:false},fines:{path:"/denda",permission:"fine.view",native:false},
    };
    const route=routes[kind];if(!route||!Object.hasOwn(permissions,route.permission)||(id!==undefined&&!/^[1-9]\d*$/.test(id)))return null;
    const path=route.path+(id===undefined?"":`/${id}`);
    if(route.native)return {native:path};
    try{const base=new URL(origin);if(base.protocol!=="https:"||base.username||base.password)return null;return {web:new URL(path,base.origin).toString()};}catch{return null;}
}
