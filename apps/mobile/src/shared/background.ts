import { registerBackgroundPush } from "./push";
// Entry memulai listener sebelum layar; handler hanya melayani lifecycle native.
void registerBackgroundPush().catch(() => undefined);
