// Permukaan publik m02-users (SDD-SYS-03). Hanya berkas ini yang boleh
// diimpor modul lain / entrypoint `api/` — `repositories/`, `controllers/`,
// dan `services/` privat terhadap modul ini.
export type { UsersModuleDeps } from "./routes.js";
export type {
    StudentObligation,
    StudentObligationChecker,
} from "./services/student-obligation-registry.js";
export { studentObligations } from "./services/student-obligation-registry.js";
export { GraduationService, tanggalWib } from "./services/graduation.service.js";
export {
    classPromotionRoute,
    createUserRoute,
    getUserRoute,
    importUsersRoute,
    listRolesRoute,
    listUsersRoute,
    updateRolePermissionsRoute,
    updateUserRoute,
    updateUserStatusRoute,
    usersRouter,
} from "./routes.js";
