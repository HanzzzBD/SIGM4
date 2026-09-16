// Permukaan publik m02-users (SDD-SYS-03). Hanya berkas ini yang boleh
// diimpor modul lain / entrypoint `api/` — `repositories/`, `controllers/`,
// dan `services/` privat terhadap modul ini.
export type { UsersModuleDeps } from "./routes.js";
export {
    createUserRoute,
    getUserRoute,
    importUsersRoute,
    listUsersRoute,
    updateUserRoute,
    updateUserStatusRoute,
    usersRouter,
} from "./routes.js";
