"use client";
// Link do cliente: /c/{token}. Público; o celular cadastrado funciona como senha.
// Os dados vêm da Edge Function "portal" (service_role fica no servidor da função).
import { use, useState } from "react";
import { brl, STATUSES } from "@/lib/rules.ts";

interface PortalData {
  shop: string; number: number; plate: string; make: string | null; model: string | null;
  customer_first_name: string; status: string; last_update: { at: string; text: string } | null;
  quote: null | { number: number; status: string; total: number; discount: number;
    items: { kind: string; description: string; details: string | null; qty: number; unit_price: number }[] };
  photos: { position: string; url: string | null }[];
  records: { tab: string; url: string | null; mime: string | null; description: string | null }[];
}

export default function Portal({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [phone, setPhone] = useState("");
  const [data, setData] = useState<PortalData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function call(extra: Record<string, string> = {}) {
    setBusy(true); setErr(null);
    const r = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/portal`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! },
      body: JSON.stringify({ token, phone, ...extra }),
    }).catch(() => null);
    const j = r ? await r.json().catch(() => ({ error: "Resposta inválida." })) : { error: "Sem conexão." };
    setBusy(false);
    if (j.error) setErr(j.error); else setData(j);
  }

  if (!data) return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 16 }}>
      <form className="card" style={{ width: "min(380px,100%)", display: "grid", gap: 14 }} onSubmit={e => { e.preventDefault(); call(); }}>
        <div className="brand">AUTOGRADO<small>Acompanhe seu veículo</small></div>
        <label className="label" htmlFor="ph">Seu celular (com DDD)</label>
        <input id="ph" className="input" inputMode="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="(61) 9 9999-9999" />
        {err && <p className="error" role="alert">{err}</p>}
        <button className="btn btn-primary" disabled={busy}>Ver meu veículo</button>
      </form>
    </main>
  );

  const step = STATUSES.findIndex(s => s.id === data.status);
  const q = data.quote;
  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: 16, display: "grid", gap: 16 }}>
      <div className="card">
        <div className="muted">Olá, {data.customer_first_name}</div>
        <h1 style={{ margin: "6px 0" }}>{[data.make, data.model].filter(Boolean).join(" ")} <span className="plate">{data.plate}</span></h1>
        <div className="muted num">O.S. {data.number}</div>
        <ol style={{ display: "flex", gap: 6, listStyle: "none", padding: 0, flexWrap: "wrap" }}>
          {STATUSES.map((s, i) => (
            <li key={s.id} className="btn" style={i <= step ? { background: "var(--accent)", color: "#fff", borderColor: "var(--accent)" } : {}}>{s.label}</li>
          ))}
        </ol>
        {data.last_update && <p className="muted">Última atualização: {data.last_update.text}</p>}
      </div>
      {q && (
        <div className="card">
          <strong>Orçamento nº {q.number}</strong>
          {q.items.map((it, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
              <span>{it.qty}× {it.description}{it.details && <small className="muted"><br />{it.details}</small>}</span>
              <span className="num">{brl(it.qty * it.unit_price)}</span>
            </div>
          ))}
          {Number(q.discount) > 0 && <p className="num">Desconto: −{brl(Number(q.discount))}</p>}
          <p className="num" style={{ fontSize: 22, fontWeight: 700 }}>Total: {brl(Number(q.total))}</p>
          {["rascunho", "enviado"].includes(q.status) && (
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-primary" disabled={busy} onClick={() => call({ decision: "aprovado" })}>Aprovar orçamento</button>
              <button className="btn" disabled={busy} onClick={() => call({ decision: "recusado" })}>Recusar</button>
            </div>
          )}
          {q.status === "aprovado" && <p>Orçamento aprovado ✓</p>}
          {err && <p className="error">{err}</p>}
        </div>
      )}
      {data.photos.length > 0 && (
        <div className="card" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: 8 }}>
          {data.photos.map(p => p.url && <img key={p.position} src={p.url} alt={p.position} style={{ width: "100%", borderRadius: 12 }} />)}
        </div>
      )}
    </main>
  );
}
