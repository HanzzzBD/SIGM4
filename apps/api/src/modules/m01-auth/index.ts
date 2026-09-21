// Permukaan publik m01-auth (SDD-SYS-03). Hanya berkas ini yang boleh diimpor modul
// lain / entrypoint `api/` — `repositories/`, `controllers/`, dan `services/` privat.
export type { AuthModuleDeps, PenerbitPasswordSementara } from "./routes.js";
export type { PenyimpanTantangan } from "./services/tantangan-dua-faktor.js";
export { PenyimpanTantanganRedis } from "./services/tantangan-dua-faktor.js";
export {
    authRouter,
    buatPenerbitPasswordSementara,
    cabutSesiRoute,
    enrollDuaFaktorRoute,
    forgotPasswordRoute,
    gantiPasswordRoute,
    kodeCadanganBaruRoute,
    konfirmasiDuaFaktorRoute,
    lihatProfilRoute,
    listPermintaanResetRoute,
    listSesiRoute,
    loginRoute,
    logoutRoute,
    logoutSemuaRoute,
    perbaruiProfilRoute,
    refreshRoute,
    terbitkanResetRoute,
    tolakResetRoute,
    verifyDuaFaktorRoute,
} from "./routes.js";
