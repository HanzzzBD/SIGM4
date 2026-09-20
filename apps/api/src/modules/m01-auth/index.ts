// Permukaan publik m01-auth (SDD-SYS-03). Hanya berkas ini yang boleh diimpor modul
// lain / entrypoint `api/` — `repositories/`, `controllers/`, dan `services/` privat.
export type { AuthModuleDeps, PenerbitPasswordSementara } from "./routes.js";
export {
    authRouter,
    buatPenerbitPasswordSementara,
    cabutSesiRoute,
    forgotPasswordRoute,
    gantiPasswordRoute,
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
} from "./routes.js";
