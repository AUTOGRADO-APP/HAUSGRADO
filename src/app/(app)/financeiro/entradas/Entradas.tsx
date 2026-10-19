"use client";
// Financeiro › Entradas (seção 7.16): recebimentos registrados ao finalizar cada O.S.
// O master também lança entradas FANTASMA (sem O.S.) para ajustes pontuais na implantação.
import { useRouter } from "next/navigation";
import { useState } from "react";
import { brl, round2 } from "@/lib/rules.ts";
import { FORMAN, FORMAS, FPER, dt, periodo } from "@/lib/labels.ts";
import { diaDe, naFaixa } from "@/lib/fin-a.ts";
import { Plate } from "@/components/Plate.tsx";
import { createClient } from "@/lib/supabase/client.ts";
import { errMsg, toast } from "@/lib/ui.ts";
import { GhostModal } from "./GhostModal.tsx";

export interface Pay { method: string; amount: number; installments: number; fee_pct: number }
export interface Rec { id: string; ghost: boolean; note: string | null; received_at: string; total: number; difference: number; service_order_id: string | null; number: number | null; plate: string | null; customer: string | null; pays: Pay[] }

const CURTO: Record<string, string> = { dinheiro: "Dinheiro", credito: "Crédito", debito: "Débito", pix: "Pix", fantasma: "Fantasma" };
const NOME: Record<string, string> = { ...FORMAN, fantasma: "FANTASMA" };
const taxaDe = (r: Rec) => round2(r.pays.reduce((a, p) => a + round2(p.amount * p.fee_pct / 100), 0));

export function Entradas({ list: all, isMaster }: { list: Rec[]; isMaster: boolean }) {
  const router = useRouter();
  const [novo, setNovo] = useState(false);
  const [del, setDel] = useState<string | null>(null);
  const [st, setSt] = useState(() => { const [de, ate] = periodo("mes"); return { de, ate, per: "mes", busca: "" }; });
  const q = st.busca.toLowerCase().trim();
  const list = all.filter(e => naFaixa(diaDe(e.received_at), st.de, st.ate))
    .filter(e => !q || [e.plate, e.customer, e.number, e.ghost ? "fantasma " + (e.note ?? "") : ""].join(" ").toLowerCase().includes(q));
  const tot = list.reduce((a, e) => a + e.total, 0);
  const txTot = list.reduce((a, e) => a + taxaDe(e), 0);
  const porF: Record<string, number> = {};
  list.forEach(e => e.pays.forEach(p => (porF[p.method] = (porF[p.method] || 0) + p.amount)));
  const mx = Math.max(1, ...Object.values(porF));
  // a forma "fantasma" só aparece na divisão quando há entrada fantasma no período
  const formas = porF.fantasma ? [...FORMAS, ["fantasma", "Fantasma"] as [string, string]] : FORMAS;
  async function excluir(id: string) {
    const { error } = await createClient().rpc("delete_ghost_receipt", { p_id: id });
    setDel(null);
    if (error) return toast(errMsg(error), { err: true });
    toast("Entrada fantasma excluída", { sound: "ok" });
    router.refresh();
  }
  const pc = (k: string) => (tot ? Math.round((porF[k] || 0) / tot * 100) : 0);

  return (
    <main id="view">
      <div className="stack" style={{ gap: 22 }}>
        <section className="panel"><div className="ph"><h2>Entradas</h2><span className="hint" style={{ flex: 1 }}>Recebimentos registrados ao finalizar cada O.S.</span>
          {isMaster && <button className="key accent sm" onClick={() => setNovo(true)} title="Entrada fantasma, sem O.S., para ajustes da implantação">+ ENTRADA</button>}</div>
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
              {formas.some(([k]) => porF[k]) ? formas.filter(([k]) => porF[k]).map(([k, l]) => <span key={k} className={`sg sg-${k}`} style={{ flex: porF[k] }} title={`${l} ${brl(porF[k])}`} />) : <span className="sg" style={{ flex: 1 }} />}
            </div>
            <div className="ent-legend">{formas.map(([k]) => <span key={k}><i className={`sw2 sg-${k}`} />{CURTO[k]} {pc(k)}%</span>)}</div>
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
                <tr key={e.id} className={e.ghost ? "ghost" : "click"} onClick={e.service_order_id ? () => router.push(`/os/${e.service_order_id}`) : undefined}>
                  <td className="mono">{dt(e.received_at)}</td>
                  <td className="mono">{e.ghost ? <span className="chip ghost">FANTASMA</span> : <b>{e.number ?? "—"}</b>}</td>
                  <td>{e.plate ? <Plate p={e.plate} /> : "—"}</td>
                  <td>{e.ghost ? (e.note ? <span className="hint">{e.note}</span> : "—") : e.customer || "—"}</td>
                  <td><div className="row" style={{ gap: 4 }}>{e.pays.map((p, i) => p.method === "fantasma"
                    ? <span key={i} className="chip ghost">FANTASMA</span>
                    : <span key={i} className="chip">{NOME[p.method] ?? p.method}{p.installments > 1 ? ` ${p.installments}x` : ""} · <span className="mono">{brl(p.amount)}</span></span>)}</div>
                    {e.difference < 0 && <div className="hint" style={{ color: "var(--danger)" }}>Desconto no fechamento: {brl(-e.difference)}</div>}</td>
                  <td className="num" style={{ color: "var(--muted)" }}>{tx ? "−" + brl(tx) : "—"}</td>
                  <td className="num"><b>{brl(e.total)}</b>
                    {e.ghost && isMaster && (del === e.id
                      ? <div className="row ghost-del"><button className="key danger sm" onClick={() => void excluir(e.id)}>Excluir</button><button className="key sm" onClick={() => setDel(null)}>Cancelar</button></div>
                      : <div className="ghost-del"><button className="key sm" onClick={() => setDel(e.id)} aria-label="Excluir entrada fantasma">Excluir</button></div>)}</td>
                </tr>
              );
            }) : <tr><td colSpan={7}><div className="empty">Nenhum recebimento neste período</div></td></tr>}
          </tbody></table></div>
        </section>
      </div>
      {novo && <GhostModal onClose={() => setNovo(false)} onDone={() => { setNovo(false); router.refresh(); }} />}
    </main>
  );
}
