"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { brl } from "@/lib/rules.ts";
import { FPAGN, dataBR, periodo, ymd } from "@/lib/labels.ts";
import { compraSit, naFaixa, purchaseTotal, type PurchaseRow } from "@/lib/fin-b.ts";
import { PerBar } from "../despesas/fin-ui.tsx";

export function Compras({ list, calendario }: { list: PurchaseRow[]; calendario: boolean }) {
  const router = useRouter();
  const [st, setSt] = useState(() => { const [de, ate] = periodo("mes"); return { de, ate, per: "mes", busca: "" }; });
  const hoje = ymd();
  const q = st.busca.toLowerCase();
  const rows = list.filter(c => naFaixa(c.purchased_on, st.de, st.ate))
    .filter(c => !q || [c.supplier_name, c.invoice_number, ...c.items.map(i => i.description)].join(" ").toLowerCase().includes(q))
    .sort((a, b) => b.purchased_on.localeCompare(a.purchased_on));
  const tot = rows.reduce((a, c) => a + purchaseTotal(c), 0);
  const pend = list.filter(c => !c.paid);
  const venc = pend.filter(c => compraSit(c, hoje).k === "vencido");

  return (
    <div className="stack" style={{ gap: 22 }}>
      <section className="panel">
        <div className="ph"><h2>Compras</h2><Link className="key accent" href="/financeiro/compras/novo">+ Registrar nova compra</Link></div>
        <PerBar per={st.per} onPick={k => { const [de, ate] = periodo(k); setSt(s => ({ ...s, de, ate, per: k })); }} />
        <div className="grid3">
          <label className="field"><span className="label">De (data da compra)</span><input className="input mono" type="date" id="fs-de" value={st.de} onChange={e => setSt(s => ({ ...s, de: e.target.value, per: "" }))} /></label>
          <label className="field"><span className="label">Até</span><input className="input mono" type="date" id="fs-ate" value={st.ate} onChange={e => setSt(s => ({ ...s, ate: e.target.value, per: "" }))} /></label>
          <label className="field"><span className="label">Buscar</span><input className="input" id="fs-busca" placeholder="Fornecedor, nota ou item" value={st.busca} onChange={e => setSt(s => ({ ...s, busca: e.target.value }))} /></label>
        </div>
      </section>
      <div className="g-ops">
        <div className="kpi"><span className="label">Compras no período</span><strong>{brl(tot)}</strong><span className="hint">{rows.length} compra{rows.length === 1 ? "" : "s"}</span></div>
        <div className="kpi"><span className="label">A pagar (boletos em aberto)</span><strong>{brl(pend.reduce((a, c) => a + purchaseTotal(c), 0))}</strong>
          <span className="hint">{pend.length} boleto{pend.length === 1 ? "" : "s"}{calendario && <> · <Link className="lnk" href="/financeiro/calendario">ver calendário</Link></>}</span></div>
        <div className={`kpi ${venc.length ? "alert" : ""}`}><span className="label">Vencidos</span><strong>{brl(venc.reduce((a, c) => a + purchaseTotal(c), 0))}</strong>
          <span className="hint">{venc.length ? `${venc.length} boleto${venc.length > 1 ? "s" : ""} em atraso` : "Nenhum boleto vencido"}</span></div>
      </div>
      <section className="panel">
        <div className="ph"><h2>Registros de compras</h2><span className="count">{rows.length}</span></div>
        <div className="tbl-wrap"><table><thead><tr><th>Compra</th><th>Fornecedor</th><th>Nota</th><th>Itens</th><th>Pagamento</th><th>Situação</th><th className="num">Total</th></tr></thead><tbody>
          {rows.map(c => {
            const sx = compraSit(c, hoje);
            return (
              <tr key={c.id} className="click" onClick={() => router.push(`/financeiro/compras/${c.id}`)}>
                <td className="mono">{dataBR(c.purchased_on)}</td>
                <td><b>{c.supplier_name}</b><div className="hint">{c.received_on ? `Recebido ${dataBR(c.received_on)}` : "Aguardando recebimento"}</div></td>
                <td className="mono">{c.invoice_number || "—"}</td>
                <td>{c.items.length} ite{c.items.length === 1 ? "m" : "ns"}</td>
                <td>{FPAGN[c.payment_method]}{c.payment_method === "boleto" && c.due_date && <div className="hint mono">vence {dataBR(c.due_date)}</div>}</td>
                <td><span className={`chip ${sx.cls}`}>{sx.l}</span></td>
                <td className="num"><b>{brl(purchaseTotal(c))}</b></td>
              </tr>
            );
          })}
          {!rows.length && <tr><td colSpan={7}><div className="empty">Nenhuma compra neste período</div></td></tr>}
        </tbody></table></div>
      </section>
    </div>
  );
}
