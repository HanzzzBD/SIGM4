import { useCallback, useState } from "react";
import { z } from "zod";
import { useAuth } from "../auth";
import { useResource } from "../../shared/api/useResource";
import { Button, Card, Input, Label, Notice } from "../../shared/ui";
import type { DamageObject } from "./model";

const Id = z.string().regex(/^[1-9]\d*$/);
const AssetList = z.object({ data: z.array(z.object({ id: Id, kode_barang: z.string(), nama: z.string() })), meta: z.object({ total_pages: z.number() }) });
const Locations = z.object({ data: z.array(z.object({ nama: z.string(), areas: z.array(z.object({ rooms: z.array(z.object({ id: Id, nama: z.string() })) })) })) });
export function ObjectPicker({ onChoose }: { onChoose: (object: DamageObject) => void }) {
    const { api, state } = useAuth(); const permissions = state.kind === "READY" ? state.session.permissions : {}; const account = state.kind === "READY" ? state.session.user.id : "";
    const [kind, setKind] = useState<DamageObject["kind"]>("ASET"); const [query, setQuery] = useState(""); const [search, setSearch] = useState(""); const [page, setPage] = useState(1);
    const permitted = Object.hasOwn(permissions, kind === "ASET" ? "asset.view" : "location.view");
    const load = useCallback(async (signal: AbortSignal) => {
        if (!permitted) return null;
        if (kind === "ASET") { const response = AssetList.parse((await api.get("/assets", { params: { q: search, page, per_page: 10 }, signal })).data); return { rows: response.data.map((item) => ({ kind, id: item.id, label: `${item.kode_barang} · ${item.nama}` })), pages: response.meta.total_pages }; }
        const response = Locations.parse((await api.get("/locations/tree", { signal })).data);
        const rows = response.data.flatMap((building) => building.areas.flatMap((area) => area.rooms.map((room) => ({ kind, id: room.id, label: `${room.nama} · ${building.nama}` })))).filter((room) => room.label.toLowerCase().includes(search.toLowerCase()));
        return { rows: rows.slice((page - 1) * 10, page * 10), pages: Math.ceil(rows.length / 10) };
    }, [api, kind, permitted, search, page]);
    const resource = useResource(`${account}:damage-object:${kind}:${search}:${page}`, load);
    return <Card><Label>Pilih objek yang rusak</Label><Button title={kind === "ASET" ? "Jenis objek: Aset" : "Jenis objek: Ruangan"} secondary onPress={() => { setKind((value) => value === "ASET" ? "RUANGAN" : "ASET"); setPage(1); setQuery(""); setSearch(""); }} />
        {!permitted ? <Notice message={kind === "ASET" ? "Izin membaca daftar aset belum tersedia. Anda dapat memilih ruangan bila memiliki izin lokasi." : "Izin membaca lokasi belum tersedia. Anda dapat memilih aset bila memiliki izin aset."} /> : <><Input label={kind === "ASET" ? "Cari kode atau nama aset" : "Cari nama ruangan"} value={query} maxLength={100} onChangeText={setQuery} /><Button title="Cari objek" secondary onPress={() => { setSearch(query.trim()); setPage(1); }} />
            {resource.loading && <Label>Memuat objek...</Label>}{resource.error && <><Notice message={resource.error} /><Button icon="refresh" title="Coba lagi" onPress={resource.reload} /></>}{resource.data?.rows.length === 0 && <Label>Objek tidak ditemukan atau tidak dapat diakses.</Label>}
            {resource.data?.rows.map((object) => <Button key={object.id} title={object.label} secondary onPress={() => onChoose(object)} />)}{resource.data && resource.data.pages > 1 && <><Label>Halaman {page} dari {resource.data.pages}</Label><Button title="Objek sebelumnya" secondary disabled={page === 1 || resource.loading} onPress={() => setPage((value) => value - 1)} /><Button title="Objek berikutnya" secondary disabled={page >= resource.data!.pages || resource.loading} onPress={() => setPage((value) => value + 1)} /></>}
        </>}
    </Card>;
}
