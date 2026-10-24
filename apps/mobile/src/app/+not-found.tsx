import { router } from "expo-router";
import { Button, Notice, Screen } from "../shared/ui";
export default function NotFound() { return <Screen title="Halaman belum tersedia"><Notice message="Layar tujuan belum tersedia di aplikasi ini. Buka antrean yang tersedia pada tab Tugas atau Notifikasi." /><Button title="Kembali ke Tugas" onPress={() => router.replace("/tugas" as "/scan")} /><Button title="Buka notifikasi" secondary onPress={() => router.replace("/notifikasi" as "/scan")} /></Screen>; }
