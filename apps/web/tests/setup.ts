// Setup Vitest web: DOM dibersihkan setiap uji agar render tak saling bocor.
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
    cleanup();
});
