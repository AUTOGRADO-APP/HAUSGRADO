"use client";
import Link from "next/link";
import { useEffect, useState } from "react";

// TODO (ver CLAUDE.md › Barra superior): painel LCD de dicas, mascote doberman, sino de lembretes, som.
export function TopBar({ title, isMaster }: { title: string; isMaster: boolean }) {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  useEffect(() => { setTheme(document.documentElement.dataset.theme === "dark" ? "dark" : "light"); }, []);
  const toggle = () => {
    const t = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = t;
    try { localStorage.setItem("hg-theme", t); } catch {}
    setTheme(t);
  };
  return (
    <header className="topbar">
      <h1>{title}</h1>
      <Link href="/os/nova" className="btn btn-primary">+ Nova O.S.</Link>
      {isMaster && <Link href="/config" className="btn" aria-label="Configurações">⚙</Link>}
      <button className="btn" onClick={toggle} aria-label="Alternar tema">{theme === "dark" ? "☀" : "☾"}</button>
    </header>
  );
}
