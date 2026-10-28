import { AnalyticsProviderRegistry } from "../registry.js";
import { conditionProvider, needsProvider, recapProvider } from "./assets.js";
import { facilitiesProvider } from "./facilities.js";
import { damageProvider } from "./damage.js";
import { loansProvider } from "./loans.js";
import { maintenanceProvider } from "./maintenance.js";
import { materialsProvider } from "./materials.js";

/** PR-06-03…07: production registration, measured as executable code in coverage. */
export function createAnalyticsProviders() {
    const registry = new AnalyticsProviderRegistry();
    for (const provider of [conditionProvider, facilitiesProvider, damageProvider, loansProvider, maintenanceProvider, materialsProvider, needsProvider, recapProvider]) registry.register(provider);
    return registry;
}
