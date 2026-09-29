// Entrypoint HTTP sigm4-api (SDD-SYS-08). Satu basis kode, dua entrypoint —
// worker/index.ts adalah yang kedua, dan keduanya dibangun menjadi satu image
// (SDD-REPO-04, SDD-INF-01).
//
// Yang dibangun PR-00-09 adalah GERBANG bootstrap-nya: registri route divalidasi
// sebelum apa pun berjalan, dan dokumen OpenAPI diturunkan darinya. PR-00-14
// merakit server Express minimal agar kedua probe kesehatan dapat dipanggil;
// PR-00-15 memasang dari rantai SDD-06 §4.2: `requestId`, header keamanan, rate
// limit, 404, dan `errorMapper`. Middleware permission (`authorize`, PM-02) ada
// sejak PR-01-15; `authenticate` — verifikasi token — sejak PR-02-02.

import type { Server } from "node:http";
import { pathToFileURL } from "node:url";
import express from "express";
import type { Express } from "express";
import type { Kysely } from "kysely";
import { AuditLogger } from "../shared/audit/index.js";
import { closeRedis, getRedis } from "../shared/cache/index.js";
import type { Clock } from "../shared/clock/index.js";
import { SystemClock } from "../shared/clock/index.js";
import { readApiConfig, zonaProses } from "../shared/config/index.js";
import {
    assertDatabaseTimeZoneUtc,
    closeDb,
    getDb,
} from "../shared/db/index.js";
import type { Database } from "../shared/db/index.js";
import {
    PermissionCache,
    SessionStore,
    authenticate,
    authenticated,
    authorize,
    gerbangGantiPassword,
} from "../shared/auth/index.js";
import type { SessionChecker } from "../shared/auth/index.js";

import type { JwtKeys, KotakRahasia } from "../shared/security/index.js";
import { RedisRateLimiter, RouteRegistry } from "../shared/http/index.js";
import type { RateLimiter } from "../shared/http/index.js";
import { Penghenti, tutupServer } from "../shared/lifecycle/index.js";
import type { LangkahHenti } from "../shared/lifecycle/index.js";
import {
    HealthRegistry,
    Logger,
    databaseCheck,
    redisCheck,
} from "../shared/observability/index.js";
import type { AuthModuleDeps, PenyimpanTantangan } from "../modules/m01-auth/index.js";
import {
    PenyimpanTantanganRedis,
    authRouter,
    buatPenerbitPasswordSementara,
    buatPengelolaDuaFaktor,
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
} from "../modules/m01-auth/index.js";
import {
    createUserRoute,
    getUserRoute,
    getUserImportRoute,
    classPromotionRoute,
    importUsersRoute,
    listRolesRoute,
    listUsersRoute,
    resetUserDuaFaktorRoute,
    resetUserPasswordRoute,
    terbitkanKodeAktivasiRoute,
    updateRolePermissionsRoute,
    updateUserRoute,
    updateUserStatusRoute,
    usersRouter,
} from "../modules/m02-users/index.js";
import {
    createAreaRoute,
    createBuildingRoute,
    createRoomRoute,
    getLocationTreeRoute,
    locationsRouter,
    updateBuildingStatusRoute,
    updateRoomRoute,
    updateRoomStatusRoute,
} from "../modules/m03-locations/index.js";
import {
    assetsRouter,
    createAssetRoute,
    createCategoryRoute,
    deleteCategoryRoute,
    listCategoriesRoute,
    updateCategoryRoute,
    listAssetsRoute,
    listRoomAssetsRoute,
    moveAssetsRoute,
    updateAssetConditionRoute,
} from "../modules/m04-assets/index.js";
import {
    approvalRouter,
    createRuleRoute,
    decideRoute,
    delegateRoute,
    historyRoute,
    listPendingRoute,
    listRulesRoute,
    previewRuleRoute,
    ruleStatusRoute,
    updateRuleRoute,
} from "../modules/m10-approval/index.js";
import type { HubSse } from "../modules/m17-notifications/index.js";
import {
    buatHubSse,
    deleteDeviceTokenRoute,
    fcmCheck,
    getPreferencesRoute,
    updatePreferencesRoute,
    registerDeviceTokenRoute,
    listNotificationsRoute,
    markAllReadRoute,
    markReadRoute,
    notificationsRouter,
    streamNotificationsRoute,
} from "../modules/m17-notifications/index.js";
import {
    activityLogRouter,
    exportActivityLogsRoute,
    listActivityLogsRoute,
} from "../modules/m18-activity-log/index.js";
import {
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
} from "../modules/m20-settings/index.js";
import {
    healthLiveRoute,
    healthReadyRoute,
    healthRouter,
    healthSummaryRoute,
    healthSummaryRouter,
} from "./health.js";
import { BASE_PATH } from "./openapi.js";
import { awalRantai, ujungRantai } from "./chain.js";
import { rateLimit } from "./security.js";
import type { SecurityConfig } from "./security.js";

/** Port container — `EXPOSE 3000` pada Dockerfile (SDD-16 §4.1). */
const PORT = 3000;

/**
 * Registri milik proses ini. Hanya route yang benar-benar dipasang yang
 * didaftarkan, agar OpenAPI tidak mengiklankan endpoint yang tidak dilayani.
 */
export const registry = new RouteRegistry().register(
    healthLiveRoute,
    healthReadyRoute,
    healthSummaryRoute,
    loginRoute,
    verifyDuaFaktorRoute,
    enrollDuaFaktorRoute,
    konfirmasiDuaFaktorRoute,
    kodeCadanganBaruRoute,
    refreshRoute,
    logoutRoute,
    logoutSemuaRoute,
    listSesiRoute,
    cabutSesiRoute,
    forgotPasswordRoute,
    listPermintaanResetRoute,
    terbitkanResetRoute,
    tolakResetRoute,
    lihatProfilRoute,
    perbaruiProfilRoute,
    gantiPasswordRoute,
    listUsersRoute,
    createUserRoute,
    getUserRoute,
    updateUserRoute,
    updateUserStatusRoute,
    resetUserPasswordRoute,
    resetUserDuaFaktorRoute,
    terbitkanKodeAktivasiRoute,
    importUsersRoute,
    getUserImportRoute,
    listRolesRoute,
    updateRolePermissionsRoute,
    getLocationTreeRoute,
    createBuildingRoute,
    createAreaRoute,
    createRoomRoute,
    updateRoomRoute,
    updateBuildingStatusRoute,
    updateRoomStatusRoute,
    listRoomAssetsRoute,
    createAssetRoute,
    listAssetsRoute,
    updateAssetConditionRoute,
    moveAssetsRoute,
    listCategoriesRoute,
    createCategoryRoute,
    updateCategoryRoute,
    deleteCategoryRoute,
    delegateRoute,
    listPendingRoute,
    decideRoute,
    historyRoute,
    listRulesRoute,
    createRuleRoute,
    updateRuleRoute,
    ruleStatusRoute,
    previewRuleRoute,
    listNotificationsRoute,
    streamNotificationsRoute,
    markAllReadRoute,
    markReadRoute,
    getPreferencesRoute,
    updatePreferencesRoute,
    registerDeviceTokenRoute,
    deleteDeviceTokenRoute,
    listActivityLogsRoute,
    exportActivityLogsRoute,
    getSettingsRoute,
    updateSettingsRoute,
    classPromotionRoute,
    listAcademicYearsRoute,
    createAcademicYearRoute,
    updateAcademicYearRoute,
    activateAcademicYearRoute,
    listHolidaysRoute,
    createHolidayRoute,
    updateHolidayRoute,
    deleteHolidayRoute,
    getWorkDaysRoute,
    updateWorkDaysRoute,
    listWorkUnitsRoute,
    createWorkUnitRoute,
    updateWorkUnitRoute,
    updateWorkUnitStatusRoute,
);

/**
 * Gerbang bootstrap (`PM-01`, `SDD-AUTH-01`). Dipanggil sebelum server menerima
 * trafik: route tanpa deklarasi permission menggagalkan startup, bukan diam-diam
 * terbuka.
 */
export function bootstrap(): RouteRegistry {
    return registry.validateOrThrow();
}

export interface AppDeps {
    readonly health: HealthRegistry;
    readonly limiter: RateLimiter;
    readonly security: SecurityConfig;
    readonly logger: Logger;
    /** AuditLogger (AL-01) dan `withTransaction` butuh Clock — SDD-SYS-07. */
    readonly clock: Clock;
    /** Pool Kysely bagi modul yang menulis basis data — m02-users sejak PR-01-02. */
    readonly db: Kysely<Database>;
    /** Penandatangan/pemverifikasi access token (SDD-SESS-02) dan permission efektif (PM-05). */
    readonly auth: {
        readonly jwtKeys: JwtKeys;
        readonly permissions: PermissionCache;
        /** Pemeriksa sesi hidup: access token dari sesi yang dicabut ditolak seketika (`PR-02-04`). */
        readonly sessions: SessionChecker;
        /** 2FA TOTP (`PR-02-07`): kunci enkripsi secret (`SDD-SESS-08`) dan penyimpan challenge (`SDD-SESS-10`). */
        readonly twoFactor: {
            readonly kotak: KotakRahasia;
            readonly tantangan: PenyimpanTantangan;
        };
    };
    /** Hub SSE proses ini (SDD-08 §4.3a) — ditutup saat berhenti; tanpa ini dibuat malas saat aliran pertama. */
    readonly notifikasi?: { readonly hub: HubSse } | undefined;
}

/** Merakit aplikasi tanpa membuka port — dipakai proses dan uji. */
export function createApp(deps: AppDeps): Express {
    bootstrap();
    const app = express();
    // Satu hop: trafik produksi masuk lewat Nginx (SDD-16 §4.2), sehingga `req.ip`
    // adalah IP klien — kunci rate limit bagi permintaan tanpa pengguna.
    app.set("trust proxy", 1);
    app.use(awalRantai(deps));
    // SDD-AUTH-09: authenticate → gerbang ganti password → (per route) permission.
    app.use(
        authenticate({
            jwtKeys: deps.auth.jwtKeys,
            permissions: deps.auth.permissions,
            sessions: deps.auth.sessions,
            clock: deps.clock,
        }),
    );
    app.use(gerbangGantiPassword(`${BASE_PATH}/auth/`));
    // M-01 dipakai dua tempat: routernya sendiri dan pintu reset password langsung milik M-02
    // (`POST /users/{id}/reset-password`) — satu deps, tanpa m02 mengimpor internal m01.
    const authDeps: AuthModuleDeps = {
        db: deps.db,
        jwtKeys: deps.auth.jwtKeys,
        permissionCache: deps.auth.permissions,
        auditLogger: new AuditLogger({
            clock: deps.clock,
            logger: deps.logger,
        }),
        clock: deps.clock,
        logger: deps.logger,
        kotakTotp: deps.auth.twoFactor.kotak,
        penyimpanTantangan: deps.auth.twoFactor.tantangan,
    };
    app.use(
        BASE_PATH,
        authRouter(
            authDeps,
            (route) => rateLimit(route, deps.limiter, deps.logger),
            authenticated,
            authorize,
        ),
    );
    app.use(
        BASE_PATH,
        healthRouter(deps.health, (route) =>
            rateLimit(route, deps.limiter, deps.logger),
        ),
    );
    app.use(
        BASE_PATH,
        healthSummaryRouter(
            deps.health,
            (route) => rateLimit(route, deps.limiter, deps.logger),
            authorize,
        ),
    );
    app.use(
        BASE_PATH,
        usersRouter(
            {
                db: deps.db,
                auditLogger: new AuditLogger({
                    clock: deps.clock,
                    logger: deps.logger,
                }),
                logger: deps.logger,
                clock: deps.clock,
                penerbitPassword: buatPenerbitPasswordSementara(authDeps),
                pengelolaDuaFaktor: buatPengelolaDuaFaktor(authDeps),
            },
            (route) => rateLimit(route, deps.limiter, deps.logger),
            authorize,
        ),
    );
    app.use(
        BASE_PATH,
        locationsRouter(
            {
                db: deps.db,
                auditLogger: new AuditLogger({
                    clock: deps.clock,
                    logger: deps.logger,
                }),
            },
            (route) => rateLimit(route, deps.limiter, deps.logger),
            authorize,
        ),
    );
    app.use(
        BASE_PATH,
        assetsRouter(
            {
                db: deps.db,
                auditLogger: new AuditLogger({
                    clock: deps.clock,
                    logger: deps.logger,
                }),
                clock: deps.clock,
            },
            (route) => rateLimit(route, deps.limiter, deps.logger),
            authorize,
        ),
    );
    app.use(
        BASE_PATH,
        approvalRouter(
            {
                db: deps.db,
                auditLogger: new AuditLogger({
                    clock: deps.clock,
                    logger: deps.logger,
                }),
                clock: deps.clock,
            },
            (route) => rateLimit(route, deps.limiter, deps.logger),
            authorize,
        ),
    );
    app.use(
        BASE_PATH,
        notificationsRouter(
            { db: deps.db, clock: deps.clock, logger: deps.logger, hub: deps.notifikasi?.hub },
            (route) => rateLimit(route, deps.limiter, deps.logger),
            authorize,
        ),
    );
    app.use(
        BASE_PATH,
        activityLogRouter(
            {
                db: deps.db,
                auditLogger: new AuditLogger({
                    clock: deps.clock,
                    logger: deps.logger,
                }),
            },
            (route) => rateLimit(route, deps.limiter, deps.logger),
            authorize,
        ),
    );
    app.use(
        BASE_PATH,
        settingsRouter(
            {
                db: deps.db,
                auditLogger: new AuditLogger({
                    clock: deps.clock,
                    logger: deps.logger,
                }),
            },
            (route) => rateLimit(route, deps.limiter, deps.logger),
            authorize,
        ),
    );
    app.use(ujungRantai(deps));
    return app;
}

/**
 * Tenggat henti API. `stop_grace_period` api pada deploy/staging adalah 30 s; sisa
 * 5 s milik pemaksaan dan penulisan log sebelum SIGKILL datang (keputusan 59).
 */
export const BATAS_HENTI_API_MS = 25_000;

/**
 * Urutan henti sigm4-api (`SDD-INF-04`, keputusan 58): readiness tidak siap,
 * port berhenti menerima koneksi baru sementara permintaan berjalan dituntaskan,
 * lalu koneksi ditutup. Proxy memindahkan trafik ke instance lain karena koneksi
 * baru ke instance ini ditolak.
 */
export function langkahHentiApi(
    health: HealthRegistry,
    server: Server,
    hub?: HubSse,
): LangkahHenti[] {
    return [
        {
            nama: "tandai-berhenti",
            jalankan: () => {
                health.tandaiBerhenti();
                return Promise.resolve();
            },
        },
        // Aliran SSE tak pernah selesai sendiri: tanpa ditutup lebih dulu, `server.close`
        // menunggu sampai tenggat (SDD-INF-05, SDD-08 §4.3a).
        ...(hub === undefined ? [] : [{ nama: "tutup-sse", jalankan: () => hub.tutup() }]),
        {
            nama: "tutup-server",
            jalankan: () => tutupServer(server),
            // Lewat tenggat: permintaan yang masih menggantung diputus.
            paksa: () => {
                server.closeAllConnections();
                return Promise.resolve();
            },
        },
        {
            nama: "koneksi",
            jalankan: async () => {
                await closeRedis();
                await closeDb();
            },
        },
    ];
}

export async function start(
    env: NodeJS.ProcessEnv = process.env,
    zona: string = zonaProses(),
): Promise<Penghenti> {
    // Konfigurasi divalidasi sebelum koneksi apa pun dibuka: proses menolak menyala
    // dengan konfigurasi tidak valid atau zona waktu bukan UTC (SDD-INF-08/09).
    const config = readApiConfig(env, zona);
    // Sesi basis data dipaksa UTC oleh createDb; pemeriksaan ini membuktikan
    // paksaannya bekerja pada basis data yang sebenarnya (SDD-INF-09).
    await assertDatabaseTimeZoneUtc(getDb());
    const clock = new SystemClock();
    const health = new HealthRegistry().register(
        databaseCheck(getDb()),
        redisCheck(getRedis()),
        // OBS-06: dilaporkan, tidak menentukan `ready` (SDD-15 §4.5, keputusan 80a).
        fcmCheck(config.fcm),
    );
    const logger = new Logger({
        clock,
        modulBawaan: "api",
        level: config.logLevel,
    });
    const hub = buatHubSse(clock, logger);
    const server = createApp({
        notifikasi: { hub },
        health,
        limiter: new RedisRateLimiter(getRedis(), clock),
        security: { objectStorageOrigin: config.objectStoragePublicOrigin },
        logger,
        clock,
        db: getDb(),
        auth: {
            jwtKeys: config.jwtKeys,
            permissions: new PermissionCache(getDb(), getRedis()),
            sessions: new SessionStore(getDb()),
            twoFactor: { kotak: config.totpKey, tantangan: new PenyimpanTantanganRedis(getRedis()) },
        },
    }).listen(PORT);
    return new Penghenti(langkahHentiApi(health, server, hub), {
        batasMs: BATAS_HENTI_API_MS,
        logger,
    });
}

// Hanya bila berkas ini dijalankan sebagai proses (CMD Dockerfile), bukan saat diimpor.
if (
    process.argv[1] !== undefined &&
    import.meta.url === pathToFileURL(process.argv[1]).href
) {
    // SIGTERM/SIGINT hanya ditangkap di sini, saat berjalan sebagai proses: tanpa
    // penangkap, `node` sebagai PID 1 container mengabaikan SIGTERM (SDD-INF-04).
    start()
        .then((penghenti) => penghenti.pasang())
        .catch((galat: unknown) => {
            // Level eksplisit: LOG_LEVEL yang tidak valid bisa jadi penyebab kegagalannya.
            new Logger({
                clock: new SystemClock(),
                modulBawaan: "api",
                level: "error",
            }).error("Proses gagal menyala", galat);
            process.exit(1);
        });
}
