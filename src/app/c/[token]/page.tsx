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
  const [zoom, setZoom] = useState<ZoomState | null>(null);
  const [recusando, setRecusando] = useState(false);
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
  const pendente = !!r && (r.status === "rascunho" || r.status === "enviado") && !fin;
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
        <Linha d={data} />
      </section>

      {(() => {
        const orc = r && (
        <section className="panel" key="orc">
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
          {pendente && <p className="hint" style={{ margin: "10px 0 0" }}>Aprove ou recuse pelos botões no fim da tela. Se preferir, fale com a oficina pelo WhatsApp.</p>}
        </section>
        );
        const gals = [
          <Gal key="servicos" recs={data.records} titulo="Serviço executado" k="servicos" onOpen={setZoom} />,
          <Gal key="pecas" recs={data.records} titulo="Peças" k="pecas" onOpen={setZoom} />,
          <Gal key="avarias" recs={data.records} titulo="Avarias registradas" k="avarias" onOpen={setZoom} />,
        ];
        const vazio = !data.records.length && (
          <p key="vazio" className="hint" style={{ margin: 0, textAlign: "center" }}>Assim que a equipe registrar avarias e o serviço, as fotos aparecem aqui.</p>);
        // esperando aprovação: orçamento e avarias primeiro; depois de aprovado, o serviço vem antes
        return pendente ? [orc, gals[2], gals[1], gals[0], vazio] : [gals[0], gals[1], gals[2], orc, vazio];
      })()}
      {fotos.length > 0 && (
        <section className="panel"><div className="ph"><h2>Fotos da entrada</h2></div>
          <div className="photos-mini">{fotos.map(f => (
            <button type="button" className="slot has" key={f.l} onClick={() => setZoom({ list: fotos.map(x => ({ url: x.url!, mime: "image/jpeg", text: x.l })), i: fotos.indexOf(f) })}
              aria-label={`Ampliar foto ${f.l}`}><img src={f.url!} alt={f.l} /><span className="cap">{f.l}</span></button>
          ))}</div>
        </section>
      )}
      {pendente && r && (
        <div className="pt-bar" role="region" aria-label="Decisão do orçamento">
          {recusando
            ? <><span className="pt-q">Recusar o orçamento nº {r.number}?</span>
                <button className="key" disabled={busy} onClick={() => setRecusando(false)}>Voltar</button>
                <button className="key danger" disabled={busy} onClick={() => { setRecusando(false); void decidir("recusado"); }}>Sim, recusar</button></>
            : <><span className="pt-t"><span className="label">Orçamento nº {r.number}</span><strong className="mono">{brl(Number(r.total))}</strong></span>
                <button className="key" disabled={busy} onClick={() => setRecusando(true)}>Recusar</button>
                <button className="key accent" disabled={busy} onClick={() => void decidir("aprovado")}>Aprovar</button></>}
        </div>
      )}
      {zoom && <Zoom z={zoom} onClose={() => setZoom(null)} onGo={i => setZoom({ ...zoom, i })} />}
      <div className="row" style={{ justifyContent: "center" }}><button className="key sm" onClick={sair}>Sair</button></div>
      {FOOT}
    </div><ToastHost /></div>
  );
}

function assinatura(d: PortalData) {
  return JSON.stringify([d.status, d.exited_at, d.last_update, d.quote && [d.quote.status, d.quote.total, d.quote.items.length],
    d.photos.map(p => p.position), d.records.map(r => [r.tab, r.at, r.description, !!r.url])]);
}

type ZoomItem = { url: string; mime: string | null; text: string };
type ZoomState = { list: ZoomItem[]; i: number };

function Fig({ m, onOpen }: { m: PRec; onOpen: () => void }) {
  const vid = (m.mime ?? "").startsWith("video");
  return (
    <figure>
      {m.url && <div className="pv">{vid
        ? <video src={m.url} controls playsInline preload="metadata" />
        : <button type="button" className="pv-btn" onClick={onOpen} aria-label="Ampliar foto"><img src={m.url} alt={m.description || ""} /></button>}</div>}
      <figcaption><span className="label">{dt(m.at)}</span>{m.description && <><br />{m.description}</>}</figcaption>
    </figure>
  );
}

/** galeria de uma aba; aba sem registro não aparece */
function Gal({ recs, titulo, k, onOpen }: { recs: PRec[]; titulo: string; k: string; onOpen: (z: ZoomState) => void }) {
  const l = recs.filter(x => x.tab === k);
  if (!l.length) return null;
  const fotos = l.filter(m => m.url && !(m.mime ?? "").startsWith("video"));
  return (
    <section className="panel"><div className="ph"><h2>{titulo}</h2><span className="count">{l.length}</span></div>
      <div className="gal">{l.map(m => <Fig key={`${m.at}-${m.url ?? ""}`} m={m}
        onOpen={() => onOpen({ list: fotos.map(f => ({ url: f.url!, mime: f.mime, text: f.description || dt(f.at) })), i: fotos.indexOf(m) })} />)}</div>
    </section>
  );
}

/** foto em tela cheia: ‹ › ou deslizar para passar, Esc ou toque fora para fechar */
function Zoom({ z, onClose, onGo }: { z: ZoomState; onClose: () => void; onGo: (i: number) => void }) {
  const n = z.list.length, it = z.list[z.i];
  const x0 = useRef<number | null>(null);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight" && z.i < n - 1) onGo(z.i + 1);
      if (e.key === "ArrowLeft" && z.i > 0) onGo(z.i - 1);
    };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, [z.i, n, onClose, onGo]);
  if (!it) return null;
  return (
    <div className="zoom" role="dialog" aria-modal="true" aria-label="Foto ampliada" onClick={onClose}
      onTouchStart={e => { x0.current = e.touches[0].clientX; }}
      onTouchEnd={e => { const d = x0.current === null ? 0 : e.changedTouches[0].clientX - x0.current; x0.current = null;
        if (d < -50 && z.i < n - 1) onGo(z.i + 1); else if (d > 50 && z.i > 0) onGo(z.i - 1); }}>
      <img src={it.url} alt={it.text} onClick={e => e.stopPropagation()} />
      <div className="zoom-bar" onClick={e => e.stopPropagation()}>
        <button type="button" className="key" aria-label="Foto anterior" aria-disabled={z.i === 0} onClick={() => onGo(z.i - 1)}>‹</button>
        <span>{it.text}<small className="mono"> · {z.i + 1}/{n}</small></span>
        <button type="button" className="key" aria-label="Próxima foto" aria-disabled={z.i === n - 1} onClick={() => onGo(z.i + 1)}>›</button>
        <button type="button" className="key" aria-label="Fechar" onClick={onClose}>×</button>
      </div>
    </div>
  );
}

/** linha do tempo do carro, montada com o que o portal já recebe */
function Linha({ d }: { d: PortalData }) {
  const tab = (k: string) => d.records.filter(x => x.tab === k).sort((a, b) => (a.at < b.at ? -1 : 1));
  const plural = (n: number, s: string, p: string) => `${n} ${n > 1 ? p : s}`;
  const av = tab("avarias"), pc = tab("pecas"), sv = tab("servicos");
  const ev: { at: string | null; t: string; on?: boolean }[] = [{ at: d.entered_at, t: "Entrada na oficina" }];
  if (av.length) ev.push({ at: av[0].at, t: plural(av.length, "avaria registrada", "avarias registradas") });
  if (d.quote) ev.push({ at: null, t: `Orçamento nº ${d.quote.number}: ${ORC_ST[d.quote.status] ?? d.quote.status}` });
  if (pc.length) ev.push({ at: pc[pc.length - 1].at, t: plural(pc.length, "registro de peças", "registros de peças") });
  if (sv.length) ev.push({ at: sv[sv.length - 1].at, t: plural(sv.length, "registro do serviço", "registros do serviço") });
  if (d.exited_at) ev.push({ at: d.exited_at, t: "Carro entregue", on: true });
  else ev.push({ at: d.last_update?.at ?? null, t: `Agora: ${STATUSES.find(s => s.id === d.status)?.label ?? d.status}`, on: true });
  return (
    <ol className="pt-line" aria-label="O que aconteceu com o seu carro">
      {ev.map((e, j) => <li key={j} className={e.on ? "on" : ""}><span>{e.t}</span>{e.at && <time className="mono">{dt(e.at)}</time>}</li>)}
    </ol>
  );
}
