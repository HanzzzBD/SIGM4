import { lazy, Suspense, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Link } from "@tanstack/react-router";
import { MessageCircle, X } from "lucide-react";
import { useCan } from "../../shared/auth";
import "./chat.css";
const ChatConversation = lazy(() => import("./ChatConversation").then(m => ({ default: m.ChatConversation })));
export function ChatPanel() {
 const can = useCan(), [open, setOpen] = useState(false), [id, setId] = useState<string | null>(null);
 if (!can("chat.use")) return null;
 return <Dialog.Root open={open} onOpenChange={setOpen}>
  <Dialog.Trigger asChild><button className="sigm4-chat-launcher" aria-label="Tanya SIGM4"><MessageCircle size={30} aria-hidden="true" /></button></Dialog.Trigger>
  <Dialog.Portal><Dialog.Overlay className="sigm4-chat-overlay" /><Dialog.Content className="sigm4-chat-panel">
   <header className="sigm4-chat-header"><div><Dialog.Title>Asisten SIGM4</Dialog.Title><Dialog.Description>Asisten digital SMKN 4</Dialog.Description></div><Dialog.Close className="sigm4-chat-close" aria-label="Tutup chatbot"><X size={20} /></Dialog.Close></header>
   <Link to="/chat" onClick={() => setOpen(false)} className="sigm4-chat-history">Lihat riwayat</Link>
   <Suspense fallback={<p role="status">Memuat percakapan?</p>}><ChatConversation sessionId={id} onSession={s => setId(s || null)} onFollow={() => setOpen(false)} /></Suspense>
  </Dialog.Content></Dialog.Portal>
 </Dialog.Root>;
}
