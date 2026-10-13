"use client";
import { useActionState } from "react";
import { login } from "./actions.ts";

export default function LoginPage() {
  const [state, action, pending] = useActionState(login, undefined);
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 16 }}>
      <form action={action} className="card" style={{ width: "min(380px,100%)", display: "grid", gap: 16 }}>
        <div className="brand">HAUSGRADO<small>Gestão de pátio · beta</small></div>
        <div>
          <label className="label" htmlFor="u">Usuário</label>
          <input id="u" name="username" className="input" autoComplete="username" autoCapitalize="none" required />
        </div>
        <div>
          <label className="label" htmlFor="p">Senha</label>
          <input id="p" name="password" type="password" className="input" autoComplete="current-password" required />
        </div>
        {state?.error && <p className="error" role="alert">{state.error}</p>}
        <button className="btn btn-primary" disabled={pending}>{pending ? "Entrando…" : "Entrar"}</button>
      </form>
    </main>
  );
}
