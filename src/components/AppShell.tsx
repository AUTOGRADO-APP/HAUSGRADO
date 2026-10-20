"use client";
// Moldura do app igual ao protótipo: menu lateral fixo, barra do topo (Nova O.S., LCD, mascote, sino, som,
// engrenagem, tema, relógio), painel de lembretes, rodapé e toast.
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { logout } from "@/app/login/actions.ts";
import { createClient } from "@/lib/supabase/client.ts";
import { brl } from "@/lib/rules.ts";
import { PAPEIS, dataBR, iniciais, primeiroNome, ymd } from "@/lib/labels.ts";
import { msgLemb, waURL } from "@/lib/msgs.ts";
import { qtdBR } from "@/lib/estoque.ts";
import { POSE, poseFor } from "@/lib/sprite.ts";
import { mmss, useBalanco, useRestante } from "@/lib/balanco.ts";
import { copyText, errMsg, getTheme, setSom, setTheme, sfx, somOn, toast } from "@/lib/ui.ts";
import type { ShellData, ShellBill } from "@/lib/types.ts";
import { canAccess, isFin } from "@/lib/permissions.ts";
import { MascotButton } from "./Mascot.tsx";
import { Plate } from "./Plate.tsx";
import { ToastHost } from "./Toast.tsx";
import { IKEY } from "./icons.tsx";

const NAVI: Record<string, string> = {
  servcat: "M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z",
  gestao: "M3 10.5 12 3l9 7.5M5.5 8.5V21h13V8.5M10 21v-6h4v6",
  historico: "", agenda: "", quadro: "", clientes: "", orcamentos: "", produtos: "", financeiro: "",
};
function NavIcon({ k }: { k: string }) {
  const p = { className: "ic", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  switch (k) {
    case "financeiro": return <svg {...p}><rect x="2.5" y="6" width="19" height="13" rx="2.5" /><path d="M2.5 10h19M6.5 15h4" /></svg>;
    case "quadro": return <svg {...p}><rect x="3" y="4" width="5" height="16" rx="1.5" /><rect x="10" y="4" width="5" height="10" rx="1.5" /><rect x="17" y="4" width="4" height="13" rx="1.5" /></svg>;
    case "agenda": return <svg {...p}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>;
    case "clientes": return <svg {...p}><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M21.5 20a6.5 6.5 0 0 0-4-6" /></svg>;
    case "orcamentos": return <svg {...p}><path d="M6 3h9l4 4v14H6z" /><path d="M14 3v5h5M9 13h7M9 17h5" /></svg>;
    case "produtos": return <svg {...p}><path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5z" /><path d="M3 7.5 12 12l9-4.5M12 12v9" /></svg>;
    case "historico": return <svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>;
    default: return <svg {...p}><path d={NAVI[k]} /></svg>;
  }
}

// Menu em dois blocos: PRINCIPAL (o dia a dia) e CADASTROS (listas e consultas)
const NAV: { k: string; href: string; l: string; g: "principal" | "cadastros" }[] = [
  { k: "gestao", href: "/gestao", l: "Visão geral", g: "principal" },
  { k: "quadro", href: "/quadro", l: "Quadro", g: "principal" },
  { k: "financeiro", href: "/financeiro/entradas", l: "Financeiro", g: "principal" },
  { k: "agenda", href: "/calendario", l: "Calendário", g: "principal" },
  { k: "clientes", href: "/clientes", l: "Clientes", g: "cadastros" },
  { k: "orcamentos", href: "/orcamentos", l: "Orçamentos", g: "cadastros" },
  { k: "produtos", href: "/produtos", l: "Produtos", g: "cadastros" },
  { k: "servcat", href: "/servicos", l: "Serviços", g: "cadastros" },
  { k: "historico", href: "/historico", l: "Histórico de O.S.", g: "cadastros" },
];
const GRUPOS = [["principal", "Principal"], ["cadastros", "Cadastros"]] as const;
const SUB: [string, string][] = [["/financeiro/entradas", "Entradas"], ["/financeiro/compras", "Compras"], ["/financeiro/despesas", "Despesas"], ["/financeiro/fornecedores", "Fornecedores"], ["/financeiro/comissoes", "Comissões"], ["/financeiro/metas", "Metas"], ["/financeiro/calendario", "Calendário financeiro"]];

const ISOM = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9z" /><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" /></svg>;
const ISOMX = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9z" /><path d="M17 9l5 6M22 9l-5 6" /></svg>;
const IBELL = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>;
const IGEAR = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.830l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>;

const ISOL = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>;
const ILUA = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11z" /></svg>;

/** Seletor de tema compacto: sol (claro) e lua (escuro). */
function TemaSwitch({ tema, onTema }: { tema: "light" | "dark"; onTema: (t: "light" | "dark") => void }) {
  return (
    <div className="theme theme-ic" role="group" aria-label="Tema">
      {(["light", "dark"] as const).map(t => (
        <button key={t} className={tema === t ? "on" : ""} aria-pressed={tema === t} aria-label={t === "light" ? "Tema claro" : "Tema escuro"} title={t === "light" ? "Tema claro" : "Tema escuro"}
          onClick={() => { setTheme(t); onTema(t); sfx("tap"); }}>{t === "light" ? ISOL : ILUA}</button>
      ))}
    </div>
  );
}

export const FOOT = <footer className="foot">Aplicativo desenvolvido por Vinícius de Albuquerque para uso exclusivo da Autogrado.</footer>;

function Brand({ small = "Gestão de pátio" }: { small?: string }) {
  return <div className="brand"><span className="pill" aria-hidden="true" /><div className="brand-t"><b className="wordmark">HAUSGRADO</b><small>{small}</small></div></div>;
}

/* ---------- LCD de dicas ---------- */
const TICK = { msgs: [] as string[], i: -1, x: 0, last: 0, w: 0, cur: "" };
function tickMsgs(d: ShellData) {
  const fin = isFin(d.me.role); const m: string[] = [];
  m.push(`${d.patio} carros no pátio · ${d.servico} em serviço`);
  if (d.parados) m.push(`Atenção: ${d.parados} carro${d.parados > 1 ? "s" : ""} parado${d.parados > 1 ? "s" : ""} há 3+ dias na mesma etapa`);
  const am = d.amanha.filter(a => !a.reminder_sent_at).length;
  if (am) m.push(`${am} lembrete${am > 1 ? "s" : ""} de agendamento para enviar · toque no sino`);
  if (d.hojeAgendados) m.push(`Hoje tem ${d.hojeAgendados} cliente${d.hojeAgendados > 1 ? "s" : ""} agendado${d.hojeAgendados > 1 ? "s" : ""}`);
  const eb = d.estoqueBaixo.length;
  if (eb) m.push(eb === 1 ? `Estoque baixo: ${d.estoqueBaixo[0].name}` : `${eb} produtos com estoque baixo · veja em Produtos`);
  if (fin) {
    if (d.contas.length) m.push(`${d.contas.length} conta${d.contas.length > 1 ? "s" : ""} a pagar vencendo · total ${brl(d.contas.reduce((a, c) => a + c.amount, 0))}`);
    m.push(`Faturamento do mês: ${brl(d.fatMes)} · ticket médio ${brl(d.ticketMes)}`);
  }
  const dicas = ["Dica: aperte N para abrir uma nova O.S.", "Dica: aperte / para buscar uma placa no quadro", "Dica: arraste o card entre as colunas do quadro", "Dica: use a foto rápida do card para registrar o serviço", "Dica: toque em Ditar e fale a descrição do serviço", "Dica: envie o link de acompanhamento pelo WhatsApp", "Dica: gere a guia de serviço direto do orçamento", "Dica: + Peça cadastrada puxa o preço do catálogo", "Dica: Esc fecha janelas e volta para o quadro"];
  if (fin) dicas.push("Dica: cadastre a chave pix do fornecedor para pagar mais rápido", "Dica: despesas fixas podem repetir todo mês");
  for (let k = 0; k < 3; k++) m.push(dicas[Math.floor(Math.random() * dicas.length)]);
  return [...new Set(m)].map(x => x.toUpperCase());
}
function Lcd({ data }: { data: ShellData }) {
  const ref = useRef<HTMLSpanElement>(null);
  const dataRef = useRef(data); dataRef.current = data;
  useEffect(() => {
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const next = () => { if (TICK.i < 0 || TICK.i >= TICK.msgs.length - 1) { TICK.msgs = tickMsgs(dataRef.current); TICK.i = 0; } else TICK.i++; return TICK.msgs[TICK.i]; };
    let raf = 0;
    const frame = (t: number) => {
      const el = ref.current;
      if (el && el.parentElement) {
        const win = el.parentElement.clientWidth;
        if (!TICK.cur || el.dataset.m !== TICK.cur) { if (!TICK.cur) { TICK.cur = next(); TICK.x = win; } el.textContent = TICK.cur; el.dataset.m = TICK.cur; TICK.w = el.scrollWidth; }
        if (reduce) { el.style.transform = "translateX(0)"; if (t - TICK.last > 6000) { TICK.last = t; TICK.cur = next(); } }
        else {
          const dt = Math.min(64, t - (TICK.last || t)); TICK.last = t; TICK.x -= dt * 0.045;
          if (TICK.x < -TICK.w - 10) { TICK.cur = next(); TICK.x = win; el.textContent = TICK.cur; el.dataset.m = TICK.cur; TICK.w = el.scrollWidth; }
          el.style.transform = `translateX(${Math.round(TICK.x / 2) * 2}px)`;
        }
      } else TICK.last = t;
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <div className="lcd-tick" role="marquee" aria-live="off" title="Dicas e informações"><span className="lcd-led" aria-hidden="true" /><div className="lcd-win"><span ref={ref} className="lcd-txt" /></div></div>;
}

function Clock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => { setNow(new Date()); const iv = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(iv); }, []);
  const t = now?.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) ?? "--:--:--";
  const d0 = now?.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) ?? "";
  return <div className="clock"><b>{t}</b><span>{d0.charAt(0).toUpperCase() + d0.slice(1)}</span></div>;
}

/* ---------- Lembretes ---------- */
export function despSit(d: { paid: boolean; due_date: string }) {
  if (d.paid) return { k: "pago", l: "Pago", cls: "ok" };
  if (d.due_date < ymd()) return { k: "vencido", l: "Vencido", cls: "bad" };
  return { k: "pendente", l: "Pendente", cls: "warn" };
}
export function BillCard({ d, onPay, quando }: { d: ShellBill; onPay: (d: ShellBill) => void; quando?: string }) {
  const sx = despSit(d); const hoje = ymd();
  return (
    <div className={`ag-it ${quando && d.due_date < hoje ? "is-late" : ""}`}>
      {quando && <span className={`lemb-q ${d.due_date < hoje ? "red" : ""}`}>{quando}</span>}
      <div className="row" style={{ justifyContent: "space-between" }}><b>{d.description || d.category}</b><span className={`chip ${sx.cls}`}>{sx.l}</span></div>
      <div className="row" style={{ justifyContent: "space-between" }}><span className="hint">{d.category} · {d.paid ? "pago em " + dataBR(d.paid_on || d.due_date) : "vence " + dataBR(d.due_date)}</span><b className="mono">{brl(d.amount)}</b></div>
      {d.payment_code && <div className="keyline">{IKEY}<span className="mono">{d.payment_code.length > 34 ? d.payment_code.slice(0, 34) + "…" : d.payment_code}</span><button className="key sm" onClick={() => copyText(d.payment_code!)}>Copiar</button></div>}
      <div className="row">
        {!d.paid && <button className="key sm accent" onClick={() => onPay(d)}>Marcar como pago</button>}
        {d.source === "purchase" && d.purchase_id ? <Link className="key sm" href={`/financeiro/compras/${d.purchase_id}`}>Ver compra</Link>
          : d.source === "manual" ? <Link className="key sm" href={`/financeiro/despesas?edit=${d.id}`}>Editar</Link> : null}
      </div>
    </div>
  );
}

function LembPanel({ data, onClose }: { data: ShellData; onClose: () => void }) {
  const router = useRouter(); const sb = createClient();
  const fin = isFin(data.me.role); const hoje = ymd();
  async function sent(id: string) {
    await sb.from("appointments").update({ reminder_sent_at: new Date().toISOString() }).eq("id", id);
    setTimeout(() => { router.refresh(); toast("WhatsApp aberto com o lembrete. Toque em enviar."); }, 60);
  }
  async function pay(d: ShellBill) {
    const { error } = await sb.from("expenses").update({ paid: true, paid_on: hoje }).eq("id", d.id);
    if (error) return toast(errMsg(error), { err: true });
    router.refresh();
    toast(`${d.description || d.category} marcada como paga`, { sound: "ok", undo: async () => { await sb.from("expenses").update({ paid: false, paid_on: null }).eq("id", d.id); router.refresh(); } });
  }
  return (
    <section className="panel lemb">
      <div className="ph"><h2>Lembretes</h2><button className="key sm" onClick={onClose}>Fechar</button></div>
      <div className={`lemb-grid ${fin ? "two" : ""}`}>
        <div className="lemb-col"><div className="label lemb-t">Agendamentos de amanhã · {data.amanha.length}</div>
          <div className="stack" style={{ gap: 10 }}>
            {data.amanha.length ? data.amanha.map(a => {
              const wa = waURL(a.customer_phone, msgLemb(a, data.shopName));
              return (
                <div className="ag-it" key={a.id}>
                  <div className="row" style={{ justifyContent: "space-between" }}>
                    <span className="row"><b className="mono" style={{ fontSize: "13pt" }}>{a.time}</b>{a.plate && <Plate p={a.plate} />}<b>{a.customer_name}</b></span>
                    {a.reminder_sent_at && <span className="chip ok">Lembrete enviado {new Date(a.reminder_sent_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>}
                  </div>
                  {a.reason && <div className="muted">{a.reason}</div>}
                  {wa && <div className="row"><a className={`key ${a.reminder_sent_at ? "" : "accent"} sm`} href={wa} target="_blank" rel="noopener" onClick={() => sent(a.id)}>{a.reminder_sent_at ? "Enviar de novo" : "Enviar lembrete no WhatsApp"}</a></div>}
                </div>
              );
            }) : <div className="empty">Nenhum agendamento para amanhã</div>}
          </div>
        </div>
        {fin && <div className="lemb-col"><div className="label lemb-t">Financeiro · contas vencidas, de hoje e de amanhã · {data.contas.length}</div>
          <div className="stack" style={{ gap: 10 }}>
            {data.contas.length ? data.contas.map(d => <BillCard key={d.id} d={d} onPay={pay} quando={d.due_date < hoje ? "Vencida" : d.due_date === hoje ? "Vence hoje" : "Vence amanhã"} />)
              : <div className="empty">Nenhuma conta para hoje ou amanhã</div>}
          </div>
          {data.estoqueBaixo.length > 0 && <>
            <div className="label lemb-t" style={{ marginTop: 18 }}>Estoque baixo · {data.estoqueBaixo.length}</div>
            <div className="stack" style={{ gap: 10 }}>
              {data.estoqueBaixo.slice(0, 6).map(p => (
                <div className="ag-it" key={p.id}>
                  <div className="row" style={{ justifyContent: "space-between" }}><b>{p.name}</b>
                    <span className="chip bad">{p.stock_qty <= 0 ? "Sem estoque" : "Estoque baixo"}</span></div>
                  <span className="hint mono">Em estoque {qtdBR(p.stock_qty)}{p.min_stock > 0 ? ` · mínimo ${qtdBR(p.min_stock)}` : ""}</span>
                </div>
              ))}
              <div className="row"><Link className="key sm" href="/produtos?f=baixo" onClick={onClose}>Ver em Produtos{data.estoqueBaixo.length > 6 ? ` (+${data.estoqueBaixo.length - 6})` : ""}</Link></div>
            </div>
          </>}
        </div>}
      </div>
    </section>
  );
}

/** Celular: marca as tabelas de lista (classe "tm") e copia o título de cada coluna para as células
 *  (data-label), para o CSS mostrar cada linha como um cartão. As tabelas de itens editáveis (orçamento, compra) têm um layout próprio. */
function useTabelasCartao() {
  useEffect(() => {
    const root = document.querySelector(".content");
    if (!root) return;
    const marcar = () => {
      root.querySelectorAll<HTMLTableElement>(".tbl-wrap > table").forEach(t => {
        const ths = Array.from(t.querySelectorAll("thead th"));
        if (ths.length < 2) return;
        // tabelas de itens editáveis na linha (orçamento, compra) têm layout próprio no celular
        t.classList.toggle("tm", !t.querySelector("tbody .it-in"));
        const nomes = ths.map(th => (th.textContent || "").trim());
        t.querySelectorAll("tbody tr").forEach(tr => {
          let i = 0;
          Array.from(tr.children).forEach(td => {
            const l = nomes[i] ?? "";
            if (td.getAttribute("data-label") !== l) td.setAttribute("data-label", l);
            i += (td as HTMLTableCellElement).colSpan || 1;
          });
        });
      });
    };
    marcar();
    let pend = 0;
    const mo = new MutationObserver(() => { if (!pend) pend = requestAnimationFrame(() => { pend = 0; marcar(); }); });
    mo.observe(root, { childList: true, subtree: true });
    return () => { mo.disconnect(); if (pend) cancelAnimationFrame(pend); };
  }, []);
}

export function AppShell({ data, children }: { data: ShellData; children: ReactNode }) {
  const path = usePathname() || "/";
  const router = useRouter();
  const [som, setSomS] = useState(true);
  const [tema, setTema] = useState<"light" | "dark">("light");
  const [lemb, setLemb] = useState(false);
  const [menu, setMenu] = useState(false);   // menu retrátil do celular (≤ 980px)
  useTabelasCartao();
  const U = data.me; const fin = isFin(U.role); const master = U.role === "master";
  useEffect(() => { setSomS(somOn()); setTema(getTheme()); }, []);
  useEffect(() => { setLemb(false); setMenu(false); }, [path]);
  // menu aberto: trava a rolagem da página atrás dele
  useEffect(() => {
    if (!menu) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [menu]);
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = !!t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable);
      if (e.key === "Escape") {
        if (document.querySelector(".modal-bg")) return;            // o modal trata o Esc
        if (menu) { setMenu(false); return; }
        if (lemb) { setLemb(false); return; }
        if (!typing && /^\/os\//.test(path)) router.push("/quadro");
        return;
      }
      if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "n" || e.key === "N") { e.preventDefault(); sfx("tap"); router.push("/os/nova"); }
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [lemb, menu, path, router]);
  useEffect(() => {
    const p = new URLSearchParams(location.search);
    if (p.get("restrito")) { toast("Acesso restrito ao seu perfil", { err: true }); history.replaceState(null, "", path); }
  }, [path]);

  const hoje = ymd();
  const pend = data.amanha.filter(a => !a.reminder_sent_at);
  const nBell = pend.length + (fin ? data.contas.length + data.estoqueBaixo.length : 0);
  const venc = fin && data.contas.some(c => c.due_date < hoje);
  const fimBal = useBalanco(), restBal = useRestante(fimBal);
  const balanco = fimBal != null && path.startsWith("/produtos");
  const pose = balanco ? POSE.balanco : poseFor(path);
  const cur = (href: string) => path === href || path.startsWith(href + "/");
  const finOpen = path.startsWith("/financeiro");

  return (
    <div className="wrap">
      <div className="casing">
        <header className="top">
          <button className="mnav-btn" aria-label="Abrir menu" aria-expanded={menu} aria-controls="menu-principal" onClick={() => { setMenu(true); sfx("tap"); }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
          </button>
          <div className="top-brand"><Brand /></div>
          <div className="top-r">
            <Link className={`key accent nova ${path === "/os/nova" ? "on-n" : ""}`} title="Nova O.S. (atalho: N)" href="/os/nova" onClick={() => sfx("tap")}>
              <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>Nova O.S.
            </Link>
            <Lcd data={data} />
            <MascotButton pose={pose} fixa={balanco ? `Balanço · ${mmss(restBal)}` : undefined} />
            <button className={`bell ${nBell ? "hot" : ""} ${lemb ? "on" : ""}`} title="Lembretes"
              aria-label={`Lembretes: ${pend.length} agendamento(s)${fin ? `, ${data.contas.length} conta(s) a pagar, ${data.estoqueBaixo.length} produto(s) com estoque baixo` : ""}`}
              onClick={() => { setLemb(v => { if (!v) { sfx("bell"); scrollTo(0, 0); } return !v; }); }}>
              {IBELL}{nBell > 0 && <span className={`bell-n ${venc ? "red" : ""}`}>{nBell}</span>}
            </button>
            <button className="gear" aria-label={som ? "Desligar sons" : "Ligar sons"} title={som ? "Sons ligados" : "Sons desligados"}
              onClick={() => { const v = !som; setSom(v); setSomS(v); if (v) sfx("tap"); }}>{som ? ISOM : ISOMX}</button>
            <TemaSwitch tema={tema} onTema={setTema} />
            <Clock />
          </div>
        </header>

        <div className="shell">
          {menu && <div className="side-bg" aria-hidden="true" onClick={() => setMenu(false)} />}
          <aside className={`side ${menu ? "open" : ""}`} id="menu-principal" aria-label="Menu">
            <div className="side-brand"><Brand />
              <button className="side-x" aria-label="Fechar menu" onClick={() => setMenu(false)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
              </button>
            </div>
            <nav className="side-nav" aria-label="Menu principal">
              {GRUPOS.map(([g, gl]) => {
                const itens = NAV.filter(n => n.g === g && canAccess(U.role, n.href));
                if (!itens.length) return null;
                return (
                  <div key={g} className="side-grp" role="group" aria-label={gl}>
                    <div className="side-grp-t" aria-hidden="true">{gl}</div>
                    {itens.map(n => {
                      const isGrupo = n.k === "financeiro";
                      const on = isGrupo ? finOpen : cur(n.href) || (n.k === "quadro" && path.startsWith("/os/"));
                      return (
                        <div key={n.k} style={{ display: "contents" }}>
                          <Link className={`key ${on ? "on" : ""}`} href={n.href} aria-current={on ? "page" : undefined} aria-expanded={isGrupo ? on : undefined} onClick={() => { sfx("tap"); if (!isGrupo || on) setMenu(false); }}>
                            <NavIcon k={n.k} /><span>{n.l}</span>
                            {isGrupo && <svg className="ic chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d={on ? "M6 15l6-6 6 6" : "M9 6l6 6-6 6"} /></svg>}
                          </Link>
                          {isGrupo && on && <div className="sub-nav">{SUB.filter(([h]) => canAccess(U.role, h)).map(([h, l]) => <Link key={h} className={`key sub ${cur(h) ? "on" : ""}`} href={h} onClick={() => { sfx("tap"); setMenu(false); }}>{l}</Link>)}</div>}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </nav>
            {/* Configurações no pé do menu; no celular, também o tema e o som (que saem da barra do topo) */}
            <div className="side-extra">
              {master && <Link className={`key side-cfg ${cur("/config") ? "on" : ""}`} href="/config" onClick={() => { sfx("tap"); setMenu(false); }}>{IGEAR}<span>Configurações</span></Link>}
              <div className="row side-prefs">
                <TemaSwitch tema={tema} onTema={setTema} />
                <button className="gear" aria-label={som ? "Desligar sons" : "Ligar sons"} title={som ? "Sons ligados" : "Sons desligados"}
                  onClick={() => { const v = !som; setSom(v); setSomS(v); if (v) sfx("tap"); }}>{som ? ISOM : ISOMX}</button>
              </div>
            </div>
            <div className="me">
              <span className="avatar" aria-hidden="true">{iniciais(U.full_name)}</span>
              <span className="me-t"><b>{primeiroNome(U.full_name)}</b><small>{PAPEIS[U.role]}</small></span>
              <form action={logout} style={{ marginLeft: "auto" }}><button className="key sm" title="Sair" onClick={() => sfx("out")}>Sair</button></form>
            </div>
          </aside>
          <div className="content">
            {lemb && <LembPanel data={data} onClose={() => setLemb(false)} />}
            {children}
          </div>
        </div>
        {FOOT}
      </div>
      <ToastHost />
    </div>
  );
}
