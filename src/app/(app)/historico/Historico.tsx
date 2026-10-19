"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { brl } from "@/lib/rules.ts";
import { FPER, TIPOS, dataBR, normPlaca, periodo } from "@/lib/labels.ts";
import { Plate } from "@/components/Plate.tsx";

export interface HistRow {
  id: string; number: number; plate: string; veiculo: string; cliente: string; tipo: string;
  entered_at: string; exited_at: string | null;
  saida: string;              // 'aaaa-mm-dd' (São Paulo)
  total: number | null;       // os_total: orçamento não recusado mais recente; null = sem orçamento
  aprovado: boolean;
}

/** valores = false para o mecânico (sem acesso a orçamentos): some a coluna e o total. */
export function Historico({ rows, valores }: { rows: HistRow[]; valores: boolean }) {
  const router = useRouter();
  const [H, setH] = useState(() => { const [de, ate] = periodo("mes"); return { de, ate, busca: "", per: "mes" }; });

  const q = H.busca.trim().toLowerCase(), qp = normPlaca(H.busca);
  const list = rows.filter(o => {
    const d = o.saida;
    if (H.de && (!d || d < H.de)) return false;
    if (H.ate && (!d || d > H.ate)) return false;
    if (q) return (!!qp && o.plate.includes(qp)) || o.cliente.toLowerCase().includes(q) || String(o.number).includes(q);
    return true;
  }).sort((a, b) => (b.exited_at || "").localeCompare(a.exited_at || ""));
  const total = list.reduce((a, o) => a + (o.aprovado && o.total ? o.total : 0), 0);

  return (
    <main id="view">
      <div className="stack" style={{ gap: 22 }}>
        <section className="panel">
          <div className="ph"><h2>Histórico de O.S.</h2><span className="hint">O.S. finalizadas, filtradas pela data de saída</span></div>
          <div className="row" style={{ marginBottom: 14 }}>
            {FPER.map(([k, l]) => <button key={k} className={`key sm ${H.per === k ? "on" : ""}`} onClick={() => { const [de, ate] = periodo(k); setH({ ...H, de, ate, per: k }); }}>{l}</button>)}
          </div>
          <div className="grid3">
            <label className="field"><span className="label">De</span>
              <input className="input mono" type="date" id="h-de" value={H.de} onChange={e => setH({ ...H, de: e.target.value, per: "" })} /></label>
            <label className="field"><span className="label">Até</span>
              <input className="input mono" type="date" id="h-ate" value={H.ate} onChange={e => setH({ ...H, ate: e.target.value, per: "" })} /></label>
            <label className="field"><span className="label">Buscar</span>
              <input className="input" id="h-busca" placeholder="Placa, cliente ou nº da O.S." value={H.busca} onChange={e => setH({ ...H, busca: e.target.value })} /></label>
          </div>
        </section>
        <div className="stats" style={{ gridTemplateColumns: `repeat(${valores ? 2 : 1},minmax(0,1fr))` }}>
          <div className="stat"><span>O.S. no período</span><strong>{String(list.length).padStart(2, "0")}</strong></div>
          {valores && <div className="stat hl"><span>Orçamentos aprovados no período</span><strong>{brl(total)}</strong></div>}
        </div>
        <section className="panel">
          <div className="ph"><h2>O.S. finalizadas</h2><span className="count">{list.length}</span></div>
          <div className="tbl-wrap"><table><thead><tr><th>O.S.</th><th>Placa</th><th>Veículo</th><th>Cliente</th><th>Tipo</th><th>Entrada</th><th>Saída</th>{valores && <th className="num">Orçamento</th>}</tr></thead><tbody>
            {list.map(o => (
              <tr key={o.id} className="click" onClick={() => router.push(`/os/${o.id}`)}>
                <td className="mono"><b>{o.number}</b></td>
                <td><Plate p={o.plate} /></td>
                <td>{o.veiculo || "—"}</td>
                <td>{o.cliente}</td>
                <td>{TIPOS[o.tipo] ?? o.tipo}</td>
                <td className="mono">{dataBR(o.entered_at)}</td>
                <td className="mono">{dataBR(o.exited_at)}</td>
                {valores && <td className="num">{o.total == null ? "—" : brl(o.total)}</td>}
              </tr>
            ))}
            {!list.length && <tr><td colSpan={valores ? 8 : 7}><div className="empty">Nenhuma O.S. finalizada neste período</div></td></tr>}
          </tbody></table></div>
        </section>
      </div>
    </main>
  );
}
