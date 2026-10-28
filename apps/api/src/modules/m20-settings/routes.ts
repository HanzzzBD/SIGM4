// Route M-20 (SDD-AUTH-01, PM-01) + perakit router modul. `GET /health` juga
// tercantum di `m20-settings.md` §7 tetapi sudah dimiliki `api/health.ts` (PR-01-15).

import express from "express";
import type { RequestHandler, Router } from "express";
import type { Kysely } from "kysely";
import type { AuditLogger } from "../../shared/audit/index.js";
import type { Database } from "../../shared/db/index.js";
import { defineRoute } from "../../shared/http/index.js";
import type { RouteDefinition } from "../../shared/http/index.js";
import {
    activateAcademicYearHandler,
    createAcademicYearHandler,
    createHolidayHandler,
    deleteHolidayHandler,
    getWorkDaysHandler,
    listAcademicYearsHandler,
    listHolidaysHandler,
    updateAcademicYearHandler,
    updateHolidayHandler,
    updateWorkDaysHandler,
} from "./controllers/calendar.controller.js";
import { getSettingsHandler, updateSettingsHandler } from "./controllers/setting.controller.js";
import {
    createWorkUnitHandler,
    listWorkUnitsHandler,
    updateWorkUnitHandler,
    updateWorkUnitStatusHandler,
} from "./controllers/work-unit.controller.js";
import {
    AcademicYearBodySchema,
    DeleteHolidayResponseSchema,
    HolidayBodySchema,
    IdParamSchema,
    ListAcademicYearsResponseSchema,
    ListHolidaysResponseSchema,
    SingleAcademicYearResponseSchema,
    SingleHolidayResponseSchema,
    UpdateWorkDaysBodySchema,
    WorkDaysResponseSchema,
} from "./schemas/calendar.schema.js";
import {
    ListSettingsResponseSchema,
    UpdateSettingsBodySchema,
    UpdateSettingsResponseSchema,
} from "./schemas/setting.schema.js";
import {
    ListWorkUnitsResponseSchema,
    SingleWorkUnitResponseSchema,
    UpdateWorkUnitStatusBodySchema,
    WorkUnitBodySchema,
} from "./schemas/work-unit.schema.js";
import { AcademicYearService } from "./services/academic-year.service.js";
import { CalendarService } from "./services/calendar.service.js";
import { SettingService } from "./services/setting.service.js";
import { WorkUnitService } from "./services/work-unit.service.js";

/** Pemilik katalog endpoint M-20 (m20-settings.md §7). */
const MODUL = "m20-settings";

/** FR-20.1 langkah 1-2: parameter (terpaginasi, dapat disaring per kelompok) beserta penjelasan, nilai bawaan, dan rentangnya. */
export const getSettingsRoute = defineRoute({
    method: "GET",
    path: "/settings",
    permission: "setting.view",
    rateLimitClass: "default",
    module: MODUL,
    summary: "Baca parameter sistem",
    response: ListSettingsResponseSchema,
});

/** FR-20.1 langkah 3-4: simpan; nilai di luar rentang ditolak dengan penjelasan (A1). */
export const updateSettingsRoute = defineRoute({
    method: "PUT",
    path: "/settings",
    permission: "setting.manage",
    rateLimitClass: "default",
    module: MODUL,
    summary: "Perbarui parameter sistem",
    body: UpdateSettingsBodySchema,
    response: UpdateSettingsResponseSchema,
});

/** Lampiran E.2: tahun ajaran beserta semesternya (P-71). */
export const listAcademicYearsRoute = defineRoute({
    method: "GET",
    path: "/academic-years",
    permission: "setting.view",
    rateLimitClass: "default",
    module: MODUL,
    summary: "Daftar tahun ajaran beserta semesternya",
    response: ListAcademicYearsResponseSchema,
});

/** AC-YR-01: tahun ajaran pertama otomatis aktif. */
export const createAcademicYearRoute = defineRoute({
    method: "POST",
    path: "/academic-years",
    permission: "setting.manage",
    rateLimitClass: "default",
    module: MODUL,
    summary: "Buat tahun ajaran beserta semesternya",
    body: AcademicYearBodySchema,
    response: SingleAcademicYearResponseSchema,
});

export const updateAcademicYearRoute = defineRoute({
    method: "PUT",
    path: "/academic-years/:id",
    permission: "setting.manage",
    rateLimitClass: "default",
    module: MODUL,
    summary: "Sunting nama, rentang tanggal, dan semester tahun ajaran",
    params: IdParamSchema,
    body: AcademicYearBodySchema,
    response: SingleAcademicYearResponseSchema,
});

/** AC-YR-02 (`SDD-DB-18`): tepat satu tahun ajaran aktif; pergantiannya satu transaksi. */
export const activateAcademicYearRoute = defineRoute({
    method: "PATCH",
    path: "/academic-years/:id/activate",
    permission: "setting.manage",
    rateLimitClass: "default",
    module: MODUL,
    summary: "Jadikan tahun ajaran aktif",
    params: IdParamSchema,
    response: SingleAcademicYearResponseSchema,
});

export const listHolidaysRoute = defineRoute({
    method: "GET",
    path: "/holidays",
    permission: "setting.view",
    rateLimitClass: "default",
    module: MODUL,
    summary: "Daftar hari libur (filter tahun ajaran)",
    response: ListHolidaysResponseSchema,
});

export const createHolidayRoute = defineRoute({
    method: "POST",
    path: "/holidays",
    permission: "setting.manage",
    rateLimitClass: "default",
    module: MODUL,
    summary: "Tambah hari libur",
    body: HolidayBodySchema,
    response: SingleHolidayResponseSchema,
});

export const updateHolidayRoute = defineRoute({
    method: "PUT",
    path: "/holidays/:id",
    permission: "setting.manage",
    rateLimitClass: "default",
    module: MODUL,
    summary: "Sunting hari libur",
    params: IdParamSchema,
    body: HolidayBodySchema,
    response: SingleHolidayResponseSchema,
});

export const deleteHolidayRoute = defineRoute({
    method: "DELETE",
    path: "/holidays/:id",
    permission: "setting.manage",
    rateLimitClass: "default",
    module: MODUL,
    summary: "Hapus hari libur",
    params: IdParamSchema,
    response: DeleteHolidayResponseSchema,
});

export const getWorkDaysRoute = defineRoute({
    method: "GET",
    path: "/work-days",
    permission: "setting.view",
    rateLimitClass: "default",
    module: MODUL,
    summary: "Baca hari kerja sekolah",
    response: WorkDaysResponseSchema,
});

export const updateWorkDaysRoute = defineRoute({
    method: "PUT",
    path: "/work-days",
    permission: "setting.manage",
    rateLimitClass: "default",
    module: MODUL,
    summary: "Perbarui hari kerja sekolah",
    body: UpdateWorkDaysBodySchema,
    response: WorkDaysResponseSchema,
});

/** Lampiran E.3 (P-72). */
export const listWorkUnitsRoute = defineRoute({
    method: "GET",
    path: "/work-units",
    permission: "setting.view",
    rateLimitClass: "default",
    module: MODUL,
    summary: "Daftar unit kerja (filter jenis, status)",
    response: ListWorkUnitsResponseSchema,
});

export const createWorkUnitRoute = defineRoute({
    method: "POST",
    path: "/work-units",
    permission: "setting.manage",
    rateLimitClass: "default",
    module: MODUL,
    summary: "Buat unit kerja",
    body: WorkUnitBodySchema,
    response: SingleWorkUnitResponseSchema,
});

export const updateWorkUnitRoute = defineRoute({
    method: "PUT",
    path: "/work-units/:id",
    permission: "setting.manage",
    rateLimitClass: "default",
    module: MODUL,
    summary: "Sunting unit kerja",
    params: IdParamSchema,
    body: WorkUnitBodySchema,
    response: SingleWorkUnitResponseSchema,
});

/** WU-02: tidak ada hapus — unit hanya dinonaktifkan. */
export const updateWorkUnitStatusRoute = defineRoute({
    method: "PATCH",
    path: "/work-units/:id/status",
    permission: "setting.manage",
    rateLimitClass: "default",
    module: MODUL,
    summary: "Aktifkan atau nonaktifkan unit kerja",
    params: IdParamSchema,
    body: UpdateWorkUnitStatusBodySchema,
    response: SingleWorkUnitResponseSchema,
});

export interface SettingsModuleDeps {
    readonly db: Kysely<Database>;
    readonly auditLogger: AuditLogger;
}

/** Router M-20. `batasi`/`otorisasi` datang dari perakit `api/index.ts`. */
export function settingsRouter(
    deps: SettingsModuleDeps,
    batasi: (route: RouteDefinition) => RequestHandler,
    otorisasi: (permission: string) => RequestHandler,
): Router {
    const settings = new SettingService(deps.db, deps.auditLogger);
    const tahunAjaran = new AcademicYearService(deps.db, deps.auditLogger);
    const kalender = new CalendarService(deps.db, deps.auditLogger);
    const unitKerja = new WorkUnitService(deps.db, deps.auditLogger);
    const router = express.Router();

    const pasang = (
        route: RouteDefinition & { readonly permission: string },
        handler: RequestHandler,
    ): void => {
        const daftar = {
            GET: router.get.bind(router),
            POST: router.post.bind(router),
            PUT: router.put.bind(router),
            PATCH: router.patch.bind(router),
            DELETE: router.delete.bind(router),
        } as const;
        daftar[route.method](route.path, batasi(route), otorisasi(route.permission), handler);
    };

    pasang(getSettingsRoute, getSettingsHandler(settings));
    pasang(updateSettingsRoute, updateSettingsHandler(settings));
    pasang(listAcademicYearsRoute, listAcademicYearsHandler(tahunAjaran));
    pasang(createAcademicYearRoute, createAcademicYearHandler(tahunAjaran));
    pasang(updateAcademicYearRoute, updateAcademicYearHandler(tahunAjaran));
    pasang(activateAcademicYearRoute, activateAcademicYearHandler(tahunAjaran));
    pasang(listHolidaysRoute, listHolidaysHandler(kalender));
    pasang(createHolidayRoute, createHolidayHandler(kalender));
    pasang(updateHolidayRoute, updateHolidayHandler(kalender));
    pasang(deleteHolidayRoute, deleteHolidayHandler(kalender));
    pasang(getWorkDaysRoute, getWorkDaysHandler(kalender));
    pasang(updateWorkDaysRoute, updateWorkDaysHandler(kalender));
    pasang(listWorkUnitsRoute, listWorkUnitsHandler(unitKerja));
    pasang(createWorkUnitRoute, createWorkUnitHandler(unitKerja));
    pasang(updateWorkUnitRoute, updateWorkUnitHandler(unitKerja));
    pasang(updateWorkUnitStatusRoute, updateWorkUnitStatusHandler(unitKerja));

    return router;
}
