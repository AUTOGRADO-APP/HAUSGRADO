"use client";
// Botão de ditado por voz (seção 8.3): SpeechRecognition pt-BR, contínuo, com resultados parciais.
// Uso: <MicButton onText={t => setTexto(v => juntarDitado(v, t))} onInterim={setParcial} />
// onText recebe o texto final de cada frase; onInterim (opcional) recebe o trecho ainda parcial ("" ao terminar).
// Fica escondido quando o navegador não oferece a API.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "@/lib/ui.ts";
import { IMIC } from "./icons.tsx";

interface SRResult { isFinal: boolean; 0: { transcript: string } }
interface SREvent { resultIndex: number; results: ArrayLike<SRResult> }
interface SR {
  lang: string; continuous: boolean; interimResults: boolean;
  onresult: ((e: SREvent) => void) | null; onerror: ((e: { error: string }) => void) | null; onend: (() => void) | null;
  start(): void; stop(): void;
}
type SRCtor = new () => SR;

const getSR = (): SRCtor | null => {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: SRCtor; webkitSpeechRecognition?: SRCtor };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
};

// Só um ditado por vez na página inteira.
let ATIVO: SR | null = null;

/** Junta o texto ditado ao que já está no campo (espaço entre frases, primeira letra maiúscula). */
export function juntarDitado(atual: string | null | undefined, novo: string) {
  const a = String(atual ?? "").replace(/\s+$/, "");
  const n = novo.trim().replace(/\s+/g, " ");
  if (!n) return a;
  const txt = a ? `${a} ${n}` : n;
  return txt.charAt(0).toUpperCase() + txt.slice(1);
}

export function MicButton({ onText, onInterim, onEnd, className = "", label = "Ditar", icon = IMIC }: {
  onText: (t: string) => void; onInterim?: (t: string) => void; onEnd?: () => void; className?: string; label?: string; icon?: ReactNode;
}) {
  const [ok, setOk] = useState(false);
  const [rec, setRec] = useState(false);
  const r = useRef<SR | null>(null);
  const cbs = useRef({ onText, onInterim, onEnd });
  cbs.current = { onText, onInterim, onEnd };

  useEffect(() => { setOk(!!getSR()); return () => { r.current?.stop(); }; }, []);
  if (!ok) return null;

  function parar() { r.current?.stop(); }

  function iniciar() {
    const Ctor = getSR(); if (!Ctor) return;
    if (ATIVO) ATIVO.stop();
    const s = new Ctor();
    s.lang = "pt-BR"; s.continuous = true; s.interimResults = true;
    s.onresult = (e) => {
      let tmp = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) { if (t.trim()) cbs.current.onText(t); } else tmp += t;
      }
      cbs.current.onInterim?.(tmp.trim());
    };
    s.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed" || e.error === "audio-capture")
        toast("Microfone bloqueado. Libere o microfone nas permissões do navegador ou use o microfone do teclado.", { err: true });
      else if (e.error !== "no-speech" && e.error !== "aborted") toast("Não foi possível ouvir. Tente de novo.", { err: true });
    };
    s.onend = () => {
      cbs.current.onInterim?.("");
      cbs.current.onEnd?.();
      setRec(false);
      if (r.current === s) r.current = null;
      if (ATIVO === s) ATIVO = null;
    };
    r.current = s;
    ATIVO = s;
    try { s.start(); setRec(true); } catch { setRec(false); }
  }

  return (
    <button type="button" className={`key sm mic ${rec ? "rec" : ""} ${className}`.trim()}
      aria-label={rec ? "Parar ditado" : "Ditar por voz"} aria-pressed={rec}
      onClick={e => { e.preventDefault(); if (rec) parar(); else iniciar(); }}>
      {icon}{rec ? "Ouvindo… parar" : label}
    </button>
  );
}
