import {screen} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {describe,expect,it} from "vitest";
import {pasangServer,renderAplikasi,sukses} from "../helpers";
describe("UX-001 login format",()=>{it("focuses and associates the email error without sending credentials",async()=>{
 const calls=pasangServer(()=>sukses({}));await renderAplikasi("/login");
 const email=screen.getByLabelText(/^Email/);await userEvent.type(email,"bukan-email");await userEvent.type(screen.getByLabelText(/^Password/),"test-password");
 await userEvent.click(screen.getByRole("button",{name:"Masuk"}));
 expect(calls.some(c=>c.url==="/auth/login")).toBe(false);expect(email.getAttribute("aria-invalid")).toBe("true");expect(document.activeElement).toBe(email);expect(document.getElementById(email.getAttribute("aria-describedby")!)?.textContent).toContain("alamat email yang benar");
});});
