// Permukaan publik m20-settings (SDD-SYS-03). Hanya berkas ini yang boleh
// diimpor modul lain / entrypoint `api/` — `repositories/`, `controllers/`,
// dan `services/` privat terhadap modul ini.
export type { SettingsModuleDeps } from "./routes.js";
export {
    activateAcademicYearRoute,
    createAcademicYearRoute,
    createHolidayRoute,
    createWorkUnitRoute,
    deleteHolidayRoute,
    getSettingsRoute,
    getWorkDaysRoute,
    listAcademicYearsRoute,
    listHolidaysRoute,
    listWorkUnitsRoute,
    settingsRouter,
    updateAcademicYearRoute,
    updateHolidayRoute,
    updateSettingsRoute,
    updateWorkDaysRoute,
    updateWorkUnitRoute,
    updateWorkUnitStatusRoute,
} from "./routes.js";
export type { Periode } from "./services/dashboard-source.js";
export { kelengkapanKonfigurasi, periodeAkademikAktif } from "./services/dashboard-source.js";

export { MaterialUnitService,materialUnitOptions,claimMaterialUnit } from "./services/material-unit.service.js";
export { materialUnitsRouter,materialUnitRoutes } from "./material-unit.routes.js";
export { materialRequestThresholds, setMaterialRequestThreshold, MATERIAL_DEFAULT_THRESHOLD } from "./services/material-request-policy.js";

export { reportLetterhead, reportSchoolName } from "./services/report-letterhead.js";
