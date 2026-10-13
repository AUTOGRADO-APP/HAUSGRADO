"use client";
import { useActionState, useEffect, useState } from "react";
import { login } from "./actions.ts";
import { MascotImg } from "@/components/Mascot.tsx";
import { FOOT } from "@/components/AppShell.tsx";
import { sfx } from "@/lib/ui.ts";

export default function LoginPage() {
  const [state, action, pending] = useActionState(login, undefined);
  const [ver, setVer] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (new URLSearchParams(location.search).get("e") === "inativo") setErr("Este usuário está bloqueado. Fale com o administrador master.");
  }, []);
  useEffect(() => { if (state?.error) { setErr(state.error); sfx("err"); } }, [state]);
  return (
    <div className="wrap">
      <div className="login-wrap">
        <form className="login-card" action={action} onSubmit={() => sfx("login")}>
          <div className="brand"><span className="pill" aria-hidden="true" /><div className="brand-t"><b className="wordmark">HAUSGRADO</b><small>Gestão de pátio</small></div></div>
          <div className="login-mascot"><MascotImg pose="acena" w={96} /><span className="login-hi">Au! Bem-vindo de volta.</span></div>
          <div className="stack" style={{ gap: 12 }}>
            <label className="field"><span className="label">Usuário</span>
              <input className={`input ${err ? "bad" : ""}`} name="username" autoComplete="username" autoCapitalize="none" placeholder="seu usuário" required onChange={() => setErr(null)} /></label>
            <label className="field"><span className="label">Senha</span>
              <span className="pw">
                <input className={`input ${err ? "bad" : ""}`} name="password" type={ver ? "text" : "password"} autoComplete="current-password" placeholder="••••••••" required onChange={() => setErr(null)} />
                <button type="button" className="pw-eye" onClick={() => setVer(v => !v)} aria-label={ver ? "Ocultar senha" : "Mostrar senha"}>{ver ? "Ocultar" : "Mostrar"}</button>
              </span></label>
            {err && <div className="hint" style={{ color: "var(--danger)" }} role="alert">{err}</div>}
            <button className="key accent" style={{ padding: 14 }} disabled={pending}>{pending ? "Entrando…" : "Entrar"}</button>
          </div>
        </form>
        {FOOT}
      </div>
    </div>
  );
}
