"use client";
// Financeiro › Comissões (seção 7.12): % sobre a mão de obra das O.S. finalizadas, pela data de saída.
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client.ts";
import { brl } from "@/lib/rules.ts";
import { FPER, dataBR, periodo } from "@/lib/labels.ts";
import { errMsg, sfx, toast } from "@/lib/ui.ts";
import { diaDe, naFaixa } from "@/lib/fin-a.ts";
import { Plate } from "@/components/Plate.tsx";

export interface ComRow { service_order_id: string; number: number; plate: string; exited_at: string; technician_name: string | null; labor_total: number; commission: number; paid_at: string | null }

export function Comissoes({ rows: initial, pct }: { rows: ComRow[]; pct: number }) {
  const sb = useMemo(() => createClient(), []);
  const router = useRouter();
  const [all, setAll] = useState(initial);
  useEffect(() => setAll(initial), [initial]);
  const [C, setC] = useState(() => { const [de, ate] = periodo("mes"); return { de, ate, per: "mes" }; });
  // sel: null = todos; "" = sem responsável; nome = profissional
  const [sel, setSel] = useState<string | null>(null);

  const noPer = all.filter(x => naFaixa(diaDe(x.exited_at), C.de, C.ate));
  const rows = noPer.filter(x => sel === null || (x.technician_name || "") === sel);
  const grp: Record<string, { n: number; mo: number; com: number; pend: number }> = {};
  noPer.forEach(x => { const g = (grp[x.technician_name || ""] ||= { n: 0, mo: 0, com: 0, pend: 0 }); g.n++; g.mo += x.labor_total; g.com += x.commission; if (!x.paid_at) g.pend += x.commission; });
  const sum = (k: "labor_total" | "commission") => rows.reduce((a, x) => a + x[k], 0);
  const pend = rows.filter(x => !x.paid_at).reduce((a, x) => a + x.commission, 0);

  async function pagar(x: ComRow) {
    if (x.paid_at) {
      setAll(l => l.map(r => (r.service_order_id === x.service_order_id ? { ...r, paid_at: null } : r)));
      const { error } = await sb.from("commission_payments").delete().eq("service_order_id", x.service_order_id);
      if (error) { toast(errMsg(error), { err: true }); router.refresh(); return; }
      sfx("tap");
    } else {
      setAll(l => l.map(r => (r.service_order_id === x.service_order_id ? { ...r, paid_at: new Date().toISOString() } : r)));
      const { error } = await sb.from("commission_payments").insert({ service_order_id: x.service_order_id });
      if (error) { toast(errMsg(error), { err: true }); router.refresh(); return; }
      sfx("ok");
    }
    router.refresh();
  }

  return (
    <main id="view">
      <div className="stack" style={{ gap: 22 }}>
        <section className="panel"><div className="ph"><h2>Comissões</h2><span className="hint">{String(pct).replace(".", ",")}% sobre a mão de obra das O.S. finalizadas, pela data de saída</span></div>
          <div className="row" style={{ marginBottom: 14 }}>{FPER.map(([k, l]) => <button key={k} className={`key sm ${C.per === k ? "on" : ""}`} onClick={() => { const [de, ate] = periodo(k); setC(s => ({ ...s, de, ate, per: k })); }}>{l}</button>)}</div>
          <div className="grid3">
            <label className="field"><span className="label">De</span><input className="input mono" type="date" value={C.de} onChange={e => setC(s => ({ ...s, de: e.target.value, per: "" }))} /></label>
            <label className="field"><span className="label">Até</span><input className="input mono" type="date" value={C.ate} onChange={e => setC(s => ({ ...s, ate: e.target.value, per: "" }))} /></label>
          </div>
        </section>
        <div className="stats" style={{ gridTemplateColumns: "repeat(3,minmax(0,1fr))" }}>
          <div className="stat"><span>Mão de obra no período</span><strong>{brl(sum("labor_total"))}</strong></div>
          <div className="stat hl"><span>Comissões no período</span><strong>{brl(sum("commission"))}</strong></div>
          <div className="stat"><span>A pagar</span><strong>{brl(pend)}</strong></div>
        </div>
        <section className="panel"><div className="ph"><h2>Por profissional</h2>{sel !== null && <button className="key sm" onClick={() => setSel(null)}>Ver todos</button>}</div>
          <div className="com-grid">
            {Object.keys(grp).length ? Object.entries(grp).sort((a, b) => b[1].com - a[1].com).map(([n, g]) => (
              <button key={n || "_sem"} className={`com-card ${sel === n && n ? "sel" : ""} ${!n ? "warn" : ""}`} onClick={() => setSel(s => (s === n ? null : n))}>
                <span className="label">{n || "Sem responsável"}</span><strong>{brl(g.com)}</strong>
                <span className="hint">{g.n} O.S. · mão de obra {brl(g.mo)}{g.pend ? ` · a pagar ${brl(g.pend)}` : " · tudo pago"}</span>
                {!n && <span className="hint" style={{ color: "var(--danger)" }}>Defina o responsável nessas O.S.</span>}
              </button>
            )) : <div className="empty">Nenhuma O.S. finalizada neste período</div>}
          </div>
        </section>
        <section className="panel"><div className="ph"><h2>O.S. do período{sel ? " · " + sel : sel === "" ? " · Sem responsável" : ""}</h2><span className="count">{rows.length}</span></div>
          <div className="tbl-wrap"><table><thead><tr><th>O.S.</th><th>Placa</th><th>Saída</th><th>Responsável</th><th className="num">Mão de obra</th><th className="num">Comissão</th><th>Pagamento</th></tr></thead><tbody>
            {rows.length ? rows.map(x => (
              <tr key={x.service_order_id} className="click" onClick={() => router.push(`/os/${x.service_order_id}`)}>
                <td className="mono"><b>{x.number}</b></td><td><Plate p={x.plate} /></td><td className="mono">{dataBR(diaDe(x.exited_at))}</td>
                <td>{x.technician_name || <span style={{ color: "var(--danger)", fontWeight: 600 }}>Sem responsável</span>}</td>
                <td className="num">{brl(x.labor_total)}</td><td className="num" style={{ color: "var(--accent)", fontWeight: 700 }}>{brl(x.commission)}</td>
                <td onClick={e => e.stopPropagation()}>{x.paid_at
                  ? <button className="chip ok" style={{ cursor: "pointer" }} onClick={() => pagar(x)} title="Desfazer">Paga {dataBR(diaDe(x.paid_at)).slice(0, 5)}</button>
                  : <button className="key sm" onClick={() => pagar(x)}>Marcar paga</button>}</td>
              </tr>
            )) : <tr><td colSpan={7}><div className="empty">Nenhuma comissão neste período</div></td></tr>}
          </tbody></table></div>
        </section>
      </div>
    </main>
  );
}
