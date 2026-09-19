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
