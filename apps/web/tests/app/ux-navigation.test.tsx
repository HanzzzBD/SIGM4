import {screen,waitFor,within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {describe,it,expect,vi,afterEach} from "vitest";
import {ME_ADMIN,pasangServer,renderAplikasi,sukses} from "../helpers";
const me={...ME_ADMIN,permissions:{"user.view":"all","user.create":"all","role.view":"all"}};
function server(){return pasangServer(p=>p.url==="/me"?sukses(me):p.url==="/roles"?sukses([]):p.url==="/users"?{status:200,data:{data:[],meta:{total_pages:1,total:0,page:1}}}:sukses([]));}
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();});
describe("QA UX navigation regressions",()=>{
 it("UX-011 traps keyboard focus, closes with Escape and restores the menu trigger",async()=>{
  vi.stubGlobal("matchMedia",()=>({matches:false,addEventListener:()=>undefined,removeEventListener:()=>undefined}));server();const user=userEvent.setup();await renderAplikasi("/profil");const trigger=screen.getByRole("button",{name:"Buka atau ciutkan menu"});await user.click(trigger);const dialog=await screen.findByRole("dialog",{name:"Menu navigasi"});
  for(let i=0;i<12;i++){await user.tab();expect(dialog.contains(document.activeElement)).toBe(true);}await user.keyboard("{Escape}");await waitFor(()=>expect(screen.queryByRole("dialog")).toBeNull());expect(document.activeElement).toBe(trigger);
 });
 it("UX-013 retains a user draft when cancelling navigation, discards only after confirmation",async()=>{
  server();const user=userEvent.setup(),{router}=await renderAplikasi("/pengguna/baru");await user.type(await screen.findByLabelText(/^Nama lengkap/),"Draft Uji");await user.click(screen.getByRole("button",{name:"Batal"}));let dialog=await screen.findByRole("dialog");await user.click(within(dialog).getByRole("button",{name:"Batal"}));expect((screen.getByLabelText(/^Nama lengkap/) as HTMLInputElement).value).toBe("Draft Uji");await user.click(screen.getByRole("button",{name:"Batal"}));dialog=await screen.findByRole("dialog");await user.click(within(dialog).getByRole("button",{name:"Buang perubahan dan lanjutkan"}));await waitFor(()=>expect(router.state.location.pathname).toBe("/pengguna"));
 });
 it("UX-025 updates the document title as pages and async headings change",async()=>{
  server();const user=userEvent.setup();await renderAplikasi("/profil");await waitFor(()=>expect(document.title).toBe("Profil | SIGM4"));await user.click(screen.getByRole("link",{name:"Keamanan & 2FA"}));await waitFor(()=>expect(document.title).toBe("Keamanan & 2FA | SIGM4"));
 });
 it("UX-027 leaves the shell before clearing /me, without a React exception",async()=>{
  server();const errors=vi.spyOn(console,"error").mockImplementation(()=>undefined),user=userEvent.setup();const {router,queryClient}=await renderAplikasi("/profil");await user.click(screen.getByRole("button",{name:me.user.nama}));await user.click(await screen.findByRole("menuitem",{name:"Keluar"}));await waitFor(()=>expect(router.state.location.pathname).toBe("/login"));await waitFor(()=>expect(queryClient.getQueryData(["me"])).toBeUndefined());expect(errors.mock.calls).toEqual([]);
 });
});
