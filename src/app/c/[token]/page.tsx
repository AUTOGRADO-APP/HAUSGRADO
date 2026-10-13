"use client";
// Link do cliente: /c/{token}. Público; o celular cadastrado funciona como senha.
// Os dados vêm da Edge Function "portal" (service_role fica no servidor da função).
// Visual do protótipo (vPortal). "Ao vivo": recarrega sozinho a cada 30 s e ao voltar para a aba.
import { use, useCallback, useEffect, useRef, useState } from "react";
import { brl, isBlankItem, STATUSES } from "@/lib/rules.ts";
import { FOTOS, ORC_ST, digits, dt, fmtFone } from "@/lib/labels.ts";
import { sfx, toast } from "@/lib/ui.ts";
import { Plate } from "@/components/Plate.tsx";
import { ToastHost } from "@/components/Toast.tsx";
import { FOOT } from "@/components/AppShell.tsx";

interface PRec { tab: string; url: string | null; mime: string | null; description: string | null; at: string }
interface PortalData {
  shop: string; number: number; plate: string; make: string | null; model: string | null;
  customer_first_name: string; status: string; entered_at: string; exited_at: string | null;
  last_update: { at: string; text: string } | null;
  quote: null | { id: string; number: number; status: string; total: number; discount: number;
    items: { kind: string; description: string; details: string | null; qty: number; unit_price: number }[] };
  photos: { position: string; url: string | null }[];
  records: PRec[];
}

const OFICINA = process.env.NEXT_PUBLIC_SHOP_NAME || "Autogrado";

export default function Portal({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [phone, setPhone] = useState("");
  const [data, setData] = useState<PortalData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const senha = useRef("");
  const ultima = useRef({ sig: "", at: 0 });

  const call = useCallback(async (p: string, extra: Record<string, string> = {}, silent = false) => {
    if (!silent) { setBusy(true); setErr(null); }
    const r = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/portal`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! },
      body: JSON.stringify({ token, phone: p, ...extra }),
    }).catch(() => null);
    const j = r ? await r.json().catch(() => ({ error: "Resposta inválida." })) : { error: "Sem conexão." };
    if (!silent) setBusy(false);
    if (j.error) { if (!silent) { setErr(j.error); sfx("err"); } return false; }
    const d = j as PortalData;
    const sig = assinatura(d);
    // na atualização automática, só troca os dados se algo mudou (ou se as URLs assinadas estão perto de expirar)
    if (!silent || sig !== ultima.current.sig || Date.now() - ultima.current.at > 45 * 60e3) {
      ultima.current = { sig, at: Date.now() };
      setData(d);
    }
    return true;
  }, [token]);

  async function entrar() {
    let p = digits(phone); if (p.startsWith("55") && p.length > 11) p = p.slice(2);
    if (p.length < 10) { setErr("Digite o celular com DDD"); sfx("err"); return; }
    if (await call(p)) { senha.current = p; sfx("login"); }
  }
  function sair() { senha.current = ""; setPhone(""); setData(null); setErr(null); }
  async function decidir(decision: "aprovado" | "recusado") {
    if (await call(senha.current, { decision })) {
      if (decision === "aprovado") toast("Orçamento aprovado. Obrigado!", { sound: "ok" });
      else toast("Orçamento recusado. A oficina vai entrar em contato.");
    } else toast("Não foi possível registrar agora. Tente de novo.", { err: true });
  }

  // ao vivo: atualiza periodicamente enquanto a página está aberta
  const logado = !!data;
  useEffect(() => {
    if (!logado) return;
    const tick = () => { if (senha.current && document.visibilityState === "visible") void call(senha.current, {}, true); };
    const t = setInterval(tick, 30000);
    document.addEventListener("visibilitychange", tick);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", tick); };
  }, [logado, call]);

  if (!data) return (
    <div className="wrap"><div className="portal">
      <section className="panel login">
        <div className="brand"><span className="pill" aria-hidden="true" /><div className="brand-t"><b>{OFICINA}</b><small>Acompanhamento do seu veículo</small></div></div>
        <div className={`lcd lcd-msg ${err ? "err" : ""}`} role="status">{err ? err.toUpperCase() : "DIGITE SEU CELULAR COM DDD"}</div>
        <form className="stack" onSubmit={e => { e.preventDefault(); void entrar(); }}>
          <input className={`input ${err ? "bad" : ""}`} id="pt-senha" inputMode="tel" placeholder="(61) 98765-4321" aria-label="Celular com DDD"
            style={{ fontSize: "16pt", textAlign: "center" }} autoComplete="off" value={fmtFone(phone)} onChange={e => setPhone(digits(e.target.value))} />
          <button className="key accent" style={{ padding: 14 }} disabled={busy}>{busy ? "Entrando…" : "Entrar"}</button>
        </form>
        <p className="hint" style={{ margin: 0, textAlign: "center" }}>A senha é o seu celular com DDD, só números. Seus dados são usados apenas para o atendimento do seu veículo.</p>
      </section>
      {FOOT}
    </div><ToastHost /></div>
  );

  const i = Math.max(0, STATUSES.findIndex(s => s.id === data.status));
  const fin = data.status === "finalizado";
  const r = data.quote;
  const fotos = FOTOS.map(([k, l]) => ({ l, url: data.photos.find(p => p.position === k)?.url })).filter(f => f.url);
  return (
    <div className="wrap"><div className="portal">
      <section className="panel">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <span className="label">{data.shop} · OS {data.number}</span><span className="live"><span className="dot" />AO VIVO</span></div>
        <div className="os-head" style={{ marginTop: 10 }}>
          <Plate p={data.plate} lg />
          <div className="info"><h1>{data.make} {data.model}</h1>
            <div className="muted">Olá, {data.customer_first_name}. Entrada em {dt(data.entered_at)}</div></div>
        </div>
        <div className={`lcd total-lcd ${fin ? "ok" : ""}`} style={{ marginTop: 16 }}>
          <span className="lcd-msg">Etapa atual</span>
          <strong style={{ fontSize: "16pt", ...(fin ? { color: "inherit" } : {}) }}>{STATUSES[i].label}</strong>
        </div>
        <div className="steps" style={{ marginTop: 12 }}>
          {STATUSES.map((s, j) => (
            <div key={s.id} className={`step ${j <= i ? "done" : ""} ${j === i ? "cur" : ""} ${i === 5 ? "fin" : ""}`}><div className="bar" /><span>{s.label}</span></div>
          ))}
        </div>
        {data.last_update && <p className="hint" style={{ margin: "10px 0 0" }}>Última atualização: {dt(data.last_update.at)} — {data.last_update.text}</p>}
      </section>

      {r && (
        <section className="panel">
          <div className="ph"><h2>Orçamento nº {r.number}</h2>
            <span className={`chip ${r.status === "aprovado" ? "ok" : r.status === "recusado" ? "bad" : ""}`}>{ORC_ST[r.status]}</span></div>
          <div className="tbl-wrap"><table><tbody>
            {r.items.filter(it => !isBlankItem(it)).map((it, j) => (
              <tr key={j}><td>{it.description}
                {it.details && <div className="hint">{it.details}</div>}
                <div className="hint">{it.kind === "peca" ? "Peça" : "Mão de obra"} · {Number(it.qty)}x {brl(Number(it.unit_price))}</div></td>
                <td className="num">{brl(Number(it.qty) * Number(it.unit_price))}</td></tr>
            ))}
            {Number(r.discount) > 0 && <tr><td>Desconto</td><td className="num">−{brl(Number(r.discount))}</td></tr>}
          </tbody></table></div>
          <div className="lcd total-lcd" style={{ marginTop: 10 }}><span className="lcd-msg">TOTAL</span><strong>{brl(Number(r.total))}</strong></div>
          {(r.status === "rascunho" || r.status === "enviado") && (
            <div className="grid2" style={{ marginTop: 12 }}>
              <button className="key accent" style={{ padding: 14 }} disabled={busy} onClick={() => void decidir("aprovado")}>Aprovar orçamento</button>
              <button className="key" style={{ padding: 14 }} disabled={busy} onClick={() => void decidir("recusado")}>Recusar</button>
            </div>
          )}
        </section>
      )}

      <Gal recs={data.records} titulo="Serviço" k="servicos" vazio="A equipe ainda não registrou serviços." />
      <Gal recs={data.records} titulo="Peças" k="pecas" vazio="Nenhuma peça registrada." />
      <Gal recs={data.records} titulo="Avarias registradas" k="avarias" vazio="Nenhuma avaria registrada." />
      {fotos.length > 0 && (
        <section className="panel"><div className="ph"><h2>Fotos da entrada</h2></div>
          <div className="photos-mini">{fotos.map(f => (
            <span className="slot has" key={f.l}><img src={f.url!} alt={f.l} /><span className="cap">{f.l}</span></span>
          ))}</div>
        </section>
      )}
      <div className="row" style={{ justifyContent: "center" }}><button className="key sm" onClick={sair}>Sair</button></div>
      {FOOT}
    </div><ToastHost /></div>
  );
}

function assinatura(d: PortalData) {
  return JSON.stringify([d.status, d.exited_at, d.last_update, d.quote && [d.quote.status, d.quote.total, d.quote.items.length],
    d.photos.map(p => p.position), d.records.map(r => [r.tab, r.at, r.description, !!r.url])]);
}

function Fig({ m }: { m: PRec }) {
  return (
    <figure>
      {m.url && <div className="pv">{(m.mime ?? "").startsWith("video")
        ? <video src={m.url} controls playsInline preload="metadata" />
        : <img src={m.url} alt={m.description || ""} />}</div>}
      <figcaption><span className="label">{dt(m.at)}</span><br />{m.description || "Sem descrição"}</figcaption>
    </figure>
  );
}

function Gal({ recs, titulo, k, vazio }: { recs: PRec[]; titulo: string; k: string; vazio: string }) {
  const l = recs.filter(x => x.tab === k);
  return (
    <section className="panel"><div className="ph"><h2>{titulo}</h2><span className="count">{l.length}</span></div>
      {l.length ? <div className="gal">{l.map(m => <Fig key={`${m.at}-${m.url ?? ""}`} m={m} />)}</div> : <div className="empty">{vazio}</div>}
    </section>
  );
}
