import {describe,it,expect} from "vitest";
import {roleLabel} from "@sigm4/schemas";
describe("UX-022 role labels",()=>{it("labels all standard roles and custom roles without showing raw IDs",()=>{for(const code of ["R-01","R-02","R-03","R-04","R-05","R-06","R-07"])expect(roleLabel(code)).not.toContain("R-");expect(roleLabel("R-91","Koordinator Laboratorium")).toBe("Koordinator Laboratorium");expect(roleLabel("R-91")).toBe("Peran khusus");});});
