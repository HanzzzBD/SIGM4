import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { getDefaultConfig } from "expo/metro-config.js";
export default getDefaultConfig(dirname(fileURLToPath(import.meta.url)));
