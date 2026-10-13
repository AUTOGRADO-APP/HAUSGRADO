"use client";
// Financeiro › Calendário financeiro (seção 7.16): contas a pagar no mês, cores por situação e próximos a pagar.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client.ts";
import { brl } from "@/lib/rules.ts";
import { MESES, ymd } from "@/lib/labels.ts";
import { errMsg, toast } from "@/lib/ui.ts";
import { DOW, anoMes, brlK, monthCells, moveMes, tituloDia } from "@/lib/fin-a.ts";
import { BillCard, despSit } from "@/components/AppShell.tsx";
import type { ShellBill } from "@/lib/types.ts";

export function FinCal({ initial }: { initial: ShellBill[] }) {
  const sb = useMemo(() => createClient(), []);
  const router = useRouter();
  const hoje = ymd();
  const [ev, setEv] = useState(initial);
  useEffect(() => setEv(initial), [initial]);
  const [C, setC] = useState(() => ({ ...anoMes(hoje), dia: hoje }));

  const by = useMemo(() => { const m: Record<string, ShellBill[]> = {}; ev.forEach(e => (m[e.due_date] ||= []).push(e)); return m; }, [ev]);
  const mesK = `${C.ano}-${String(C.mes + 1).padStart(2, "0")}`;
  const doMes = ev.filter(e => e.due_date.startsWith(mesK));
  const aPagar = doMes.filter(e => !e.paid).reduce((a, e) => a + e.amount, 0);
  const pago = doMes.filter(e => e.paid).reduce((a, e) => a + e.amount, 0);
  const vencido = ev.filter(e => despSit(e).k === "vencido").reduce((a, e) => a + e.amount, 0);
  const cells = monthCells(C.ano, C.mes);
  const dl = by[C.dia] || [];
  const prox = ev.filter(e => !e.paid).sort((a, b) => a.due_date.localeCompare(b.due_date)).slice(0, 6);

  const nome = (d: ShellBill) => d.description || d.category;
  async function setPago(d: ShellBill, pg: boolean) {
    const paid_on = pg ? ymd() : null;
    setEv(l => l.map(x => (x.id === d.id ? { ...x, paid: pg, paid_on } : x)));
    const { error } = await sb.from("expenses").update({ paid: pg, paid_on }).eq("id", d.id);
    if (error) { toast(errMsg(error), { err: true }); router.refresh(); return false; }
    router.refresh();
    return true;
  }
  async function pay(d: ShellBill) {
    if (await setPago(d, true)) toast(`${nome(d)} marcado como pago`, { sound: "ok", undo: () => { void setPago(d, false); } });
  }

  return (
    <main id="view">
      <div className="stack" style={{ gap: 22 }}>
        <div className="g-ops">
          <div className="kpi"><span className="label">A pagar em {MESES[C.mes]}</span><strong>{brl(aPagar)}</strong></div>
          <div className="kpi"><span className="label">Pago em {MESES[C.mes]}</span><strong>{brl(pago)}</strong></div>
          <div className={`kpi ${vencido ? "alert" : ""}`}><span className="label">Vencido (todos os meses)</span><strong>{brl(vencido)}</strong></div>
        </div>
        <div className="split">
          <section className="panel"><div className="ph"><h2>Calendário financeiro</h2>
            <div className="row"><button className="key sm" onClick={() => setC(c => ({ ...c, ...moveMes(c.ano, c.mes, -1) }))} aria-label="Mês anterior">‹</button><b style={{ minWidth: 150, textAlign: "center" }}>{MESES[C.mes]} {C.ano}</b><button className="key sm" onClick={() => setC(c => ({ ...c, ...moveMes(c.ano, c.mes, 1) }))} aria-label="Próximo mês">›</button><button className="key sm" onClick={() => setC({ ...anoMes(hoje), dia: hoje })}>Hoje</button></div></div>
            <div className="row" style={{ gap: 14, marginBottom: 10, fontSize: "9.5pt", fontWeight: 600 }}><span><i className="lgd fp-pendente" />Pendente</span><span><i className="lgd fp-vencido" />Vencido</span><span><i className="lgd fp-pago" />Pago</span><span className="hint">Compras, despesas e comissões pagas. Taxas de cartão/pix ficam em Despesas.</span></div>
            <div className="cal-grid">
              {DOW.map(d => <span key={d} className="cal-h">{d}</span>)}
              {cells.map(c => {
                const l = by[c.k] || [];
                return (
                  <button key={c.k} className={`cal-d ${c.out ? "out" : ""} ${c.k === hoje ? "today" : ""} ${c.k === C.dia ? "sel" : ""}`} onClick={() => setC({ ...anoMes(c.k), dia: c.k })} aria-label={`${c.day} de ${MESES[c.month]}: ${l.length} pagamento(s)`}>
                    <span className="cal-n">{c.day}</span>{l.length > 0 && <span className="cal-c">{l.length}</span>}
                    <span className="cal-items">
                      {l.slice(0, 3).map(e => <span key={e.id} className={`cal-p fp-${despSit(e).k}`}><b>{brlK(e.amount)}</b> {nome(e).split(" ")[0]}</span>)}
                      {l.length > 3 && <span className="cal-more">+{l.length - 3}</span>}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
          <aside className="stack sticky">
            <section className="panel"><div className="ph"><h2>{tituloDia(C.dia)}</h2><span className="count">{dl.length}</span></div>
              <div className="stack" style={{ gap: 10 }}>{dl.length ? dl.map(d => <BillCard key={d.id} d={d} onPay={pay} />) : <div className="empty">Nenhum pagamento neste dia</div>}</div></section>
            <section className="panel"><div className="ph"><h2>Próximos a pagar</h2></div>
              <div className="stack" style={{ gap: 10 }}>{prox.length ? prox.map(d => <BillCard key={d.id} d={d} onPay={pay} />) : <div className="empty">Nada em aberto</div>}</div>
              <div className="row" style={{ marginTop: 12 }}><Link className="key" style={{ flex: 1, textAlign: "center" }} href="/financeiro/despesas">+ Despesa</Link><Link className="key" style={{ flex: 1, textAlign: "center" }} href="/financeiro/compras/novo">+ Compra</Link></div>
            </section>
          </aside>
        </div>
      </div>
    </main>
  );
}
