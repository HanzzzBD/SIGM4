import { lazy,Suspense } from "react";
import { KeadaanMemuat } from "../../shared/states";
const History=lazy(()=>import("./ChatPage").then(m=>({default:m.ChatPage}))),Monitor=lazy(()=>import("./ChatMonitorPage").then(m=>({default:m.ChatMonitorPage})));
export const ChatPage=()=> <Suspense fallback={<KeadaanMemuat label="Memuat chatbot"/>}><History/></Suspense>;
export const ChatMonitorPage=()=> <Suspense fallback={<KeadaanMemuat label="Memuat monitoring chatbot"/>}><Monitor/></Suspense>;
export { ChatPanel } from "./ChatPanel";
