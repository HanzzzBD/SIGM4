// Permukaan publik m01-auth (SDD-SYS-03). Hanya berkas ini yang boleh diimpor modul
// lain / entrypoint `api/` — `repositories/`, `controllers/`, dan `services/` privat.
export type { AuthModuleDeps, PenerbitPasswordSementara } from "./routes.js";
export {
    authRouter,
    buatPenerbitPasswordSementara,
    cabutSesiRoute,
    forgotPasswordRoute,
    listPermintaanResetRoute,
    listSesiRoute,
    loginRoute,
    logoutRoute,
    logoutSemuaRoute,
    refreshRoute,
    terbitkanResetRoute,
    tolakResetRoute,
} from "./routes.js";
