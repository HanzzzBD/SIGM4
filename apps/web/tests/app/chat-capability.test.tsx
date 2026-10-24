import {screen,waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {describe,it,expect} from "vitest";
import {ME_ADMIN,pasangServer,renderAplikasi,sukses} from "../helpers";
describe("UX-023 chatbot capability",()=>{it.each(["DISABLED","UNAVAILABLE"])("explains %s before sending and offers authorized manual workflows",async capability=>{
 const calls=pasangServer(p=>p.url==="/me"?sukses({...ME_ADMIN,permissions:{"chat.use":"all","asset.view":"all"}}):p.url==="/chat/usage"?sukses({tanggal:"2026-10-15",batas:50,terpakai:0,tersisa:50,reset_at:"2026-10-15T17:00:00Z",token_input:0,token_output:0,capability}):{status:200,data:{data:[],meta:{page:1,total_pages:1}}});
 await renderAplikasi("/chat");await waitFor(()=>expect(screen.getByLabelText("Pertanyaan untuk SIGM4").hasAttribute("disabled")).toBe(true));expect(await screen.findByText(capability==="DISABLED"?"Chatbot belum diaktifkan oleh sekolah.":"Layanan chatbot sedang tidak tersedia. Coba lagi beberapa saat.")).toBeTruthy();expect(screen.getByRole("link",{name:"Cari aset"})).toBeTruthy();await userEvent.click(screen.getByRole("button",{name:"Kirim pertanyaan"}));expect(calls.some(c=>c.url==="/chat/messages"||c.method==="POST"&&c.url==="/chat/sessions")).toBe(false);
});});
