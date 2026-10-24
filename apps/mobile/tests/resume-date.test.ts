import {describe,it,expect} from "vitest";
import {resumeDateError,monthDates,moveMonth,dateLabel} from "../src/features/workorders/resume-date.js";
describe("UX-021 native date selection model",()=>{
 it("rejects invalid calendar dates, ISO typing mistakes and past dates",()=>{for(const value of ["2026-02-29","2026-02-30","15/10/2026",""])expect(resumeDateError(value,"2026-10-15")).not.toBeNull();expect(resumeDateError("2026-10-14","2026-10-15")).toContain("sebelum");expect(resumeDateError("2026-10-15","2026-10-15")).toBeNull();});
 it("offers valid day options across leap years and year transitions with Indonesian display",()=>{expect(monthDates("2028-02")).toHaveLength(29);expect(monthDates("2026-02")).toHaveLength(28);expect(moveMonth("2026-12",1)).toBe("2027-01");expect(dateLabel("2026-10-15")).toContain("15 Oktober 2026");});
});
