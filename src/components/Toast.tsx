"use client";
import { useEffect, useRef, useState } from "react";
import { sfx } from "@/lib/ui.ts";

interface T { msg: string; err: boolean; undo?: () => void; n: number }

/** Toast invertido, centralizado embaixo; vermelho quando é erro; ação Desfazer opcional (6 s). */
export function ToastHost() {
  const [t, setT] = useState<T | null>(null);
  const [show, setShow] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent).detail as Omit<T, "n">;
      setT({ ...d, n: Date.now() }); setShow(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setShow(false), d.undo ? 6000 : 3500);
    };
    window.addEventListener("hg-toast", on);
    return () => window.removeEventListener("hg-toast", on);
  }, []);
  return (
    <div className={`toast${show ? " show" : ""}${t?.err ? " err" : ""}`} role="status" aria-live="polite">
      {t && <span>{t.msg}</span>}
      {t?.undo && <button className="toast-undo" onClick={() => { t.undo?.(); setShow(false); sfx("tap"); }}>Desfazer</button>}
    </div>
  );
}
