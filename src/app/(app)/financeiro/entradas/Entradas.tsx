"use client";
// Financeiro › Entradas (seção 7.16): recebimentos registrados ao finalizar cada O.S.
import { useRouter } from "next/navigation";
import { useState } from "react";
import { brl, round2 } from "@/lib/rules.ts";
import { FORMAN, FORMAS, FPER, dt, periodo } from "@/lib/labels.ts";
import { diaDe, naFaixa } from "@/lib/fin-a.ts";
import { Plate } from "@/components/Plate.tsx";

export interface Pay { method: string; amount: number; installments: number; fee_pct: number }
export interface Rec { id: string; received_at: string; total: number; difference: number; service_order_id: string; number: number | null; plate: string | null; customer: string | null; pays: Pay[] }

const CURTO: Record<string, string> = { dinheiro: "Dinheiro", credito: "Crédito", debito: "Débito", pix: "Pix" };
const taxaDe = (r: Rec) => round2(r.pays.reduce((a, p) => a + round2(p.amount * p.fee_pct / 100), 0));

export function Entradas({ list: all }: { list: Rec[] }) {
  const router = useRouter();
  const [st, setSt] = useState(() => { const [de, ate] = periodo("mes"); return { de, ate, per: "mes", busca: "" }; });
  const q = st.busca.toLowerCase().trim();
  const list = all.filter(e => naFaixa(diaDe(e.received_at), st.de, st.ate))
    .filter(e => !q || [e.plate, e.customer, e.number].join(" ").toLowerCase().includes(q));
  const tot = list.reduce((a, e) => a + e.total, 0);
  const txTot = list.reduce((a, e) => a + taxaDe(e), 0);
  const porF: Record<string, number> = {};
  list.forEach(e => e.pays.forEach(p => (porF[p.method] = (porF[p.method] || 0) + p.amount)));
  const mx = Math.max(1, ...Object.values(porF));
  const pc = (k: string) => (tot ? Math.round((porF[k] || 0) / tot * 100) : 0);

  return (
    <main id="view">
      <div className="stack" style={{ gap: 22 }}>
        <section className="panel"><div className="ph"><h2>Entradas</h2><span className="hint">Recebimentos registrados ao finalizar cada O.S.</span></div>
          <div className="row" style={{ marginBottom: 14 }}>{FPER.map(([k, l]) => <button key={k} className={`key sm ${st.per === k ? "on" : ""}`} onClick={() => { const [de, ate] = periodo(k); setSt(s => ({ ...s, de, ate, per: k })); }}>{l}</button>)}</div>
          <div className="grid3">
            <label className="field"><span className="label">De</span><input className="input mono" type="date" value={st.de} onChange={e => setSt(s => ({ ...s, de: e.target.value, per: "" }))} /></label>
            <label className="field"><span className="label">Até</span><input className="input mono" type="date" value={st.ate} onChange={e => setSt(s => ({ ...s, ate: e.target.value, per: "" }))} /></label>
            <label className="field"><span className="label">Buscar</span><input className="input" placeholder="Placa, cliente ou nº da O.S." value={st.busca} onChange={e => setSt(s => ({ ...s, busca: e.target.value }))} /></label>
          </div>
        </section>
        <div className="ent-top">
          <div className="kpi main ent-main"><span className="label">Recebido no período</span><strong>{brl(tot)}</strong>
            <div className="ent-split" aria-label="Divisão por forma de pagamento">
              {FORMAS.some(([k]) => porF[k]) ? FORMAS.filter(([k]) => porF[k]).map(([k]) => <span key={k} className={`sg sg-${k}`} style={{ flex: porF[k] }} title={`${FORMAN[k]} ${brl(porF[k])}`} />) : <span className="sg" style={{ flex: 1 }} />}
            </div>
            <div className="ent-legend">{FORMAS.map(([k]) => <span key={k}><i className={`sw2 sg-${k}`} />{CURTO[k]} {pc(k)}%</span>)}</div>
            <div className="ent-nums">
              <div><span className="label">Recebimentos</span><b className="mono">{list.length}</b></div>
              <div><span className="label">Ticket médio</span><b className="mono">{brl(list.length ? tot / list.length : 0)}</b></div>
              <div><span className="label">Taxas</span><b className="mono">− {brl(txTot)}</b></div>
              <div><span className="label">Líquido</span><b className="mono acc">{brl(tot - txTot)}</b></div>
            </div>
          </div>
          <div className="ent-forms">{FORMAS.map(([k, l]) => {
            const n = list.filter(e => e.pays.some(p => p.method === k)).length;
            return (
              <div key={k} className="kpi ent-f">
                <div className="row" style={{ justifyContent: "space-between", gap: 8 }}><span className="label"><i className={`sw2 sg-${k}`} />{l}</span><span className="dl">{pc(k)}%</span></div>
                <strong>{brl(porF[k] || 0)}</strong>
                <span className="meter"><span className={`sg-${k}`} style={{ width: `${(porF[k] || 0) / mx * 100}%` }} /></span>
                <span className="hint">{n} recebimento{n === 1 ? "" : "s"}</span>
              </div>
            );
          })}</div>
        </div>
        <section className="panel"><div className="ph"><h2>Recebimentos</h2><span className="count">{list.length}</span></div>
          <div className="tbl-wrap"><table><thead><tr><th>Data</th><th>O.S.</th><th>Placa</th><th>Cliente</th><th>Forma de pagamento</th><th className="num">Taxas</th><th className="num">Valor</th></tr></thead><tbody>
            {list.length ? list.map(e => {
              const tx = taxaDe(e);
              return (
                <tr key={e.id} className="click" onClick={() => router.push(`/os/${e.service_order_id}`)}>
                  <td className="mono">{dt(e.received_at)}</td><td className="mono"><b>{e.number ?? "—"}</b></td><td>{e.plate ? <Plate p={e.plate} /> : "—"}</td><td>{e.customer || "—"}</td>
                  <td><div className="row" style={{ gap: 4 }}>{e.pays.map((p, i) => <span key={i} className="chip">{FORMAN[p.method]}{p.installments > 1 ? ` ${p.installments}x` : ""} · <span className="mono">{brl(p.amount)}</span></span>)}</div>
                    {e.difference < 0 && <div className="hint" style={{ color: "var(--danger)" }}>Desconto no fechamento: {brl(-e.difference)}</div>}</td>
                  <td className="num" style={{ color: "var(--muted)" }}>{tx ? "−" + brl(tx) : "—"}</td><td className="num"><b>{brl(e.total)}</b></td>
                </tr>
              );
            }) : <tr><td colSpan={7}><div className="empty">Nenhum recebimento neste período</div></td></tr>}
          </tbody></table></div>
        </section>
      </div>
    </main>
  );
}
