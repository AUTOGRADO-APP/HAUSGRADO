"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client.ts";
import { brl, round2 } from "@/lib/rules.ts";
import { parseNum } from "@/lib/labels.ts";
import { toast, errMsg } from "@/lib/ui.ts";
import { metaErro, metaStatus, type Meta } from "@/lib/metas.ts";

const fmtV = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export interface MesLinha { k: string; nome: string; meta: Meta | null; fat: number; n: number; futuro: boolean }

export function MetasTabela({ linhas, sel, hoje }: { linhas: MesLinha[]; sel: string; hoje: string }) {
  const router = useRouter();
  return (
    <section className="panel">
      <div className="ph"><h2>Metas por mês</h2><span className="hint">Recebido = entradas do mês, pela data do recebimento</span></div>
      <div className="tbl-wrap"><table>
        <thead><tr><th>Mês</th><th className="num">META</th><th className="num">SUPER META</th><th className="num">Recebido</th><th>Situação</th></tr></thead>
        <tbody>{linhas.map(l => {
          const s = l.meta ? metaStatus(l.fat, l.meta, l.k, hoje) : null;
          const enc = l.k < hoje.slice(0, 7);
          const sit = !s ? <span className="hint">Sem meta</span>
            : s.nivel === "super" ? <span className="chip ok">Super meta batida</span>
            : s.nivel === "meta" ? <span className="chip ok">Meta batida</span>
            : l.futuro ? <span className="chip">Planejada</span>
            : enc ? <span className="chip bad">Não batida · {s.pctMeta}%</span>
            : <span className="chip">{s.pctMeta}% da meta</span>;
          return (
            <tr key={l.k} className={`click ${l.k === sel ? "sel" : ""}`} onClick={() => router.push(`/financeiro/metas?m=${l.k}`)}>
              <td><b>{l.nome}</b>{l.k === hoje.slice(0, 7) && <span className="hint"> · mês atual</span>}</td>
              <td className="num">{l.meta ? brl(l.meta.goal) : "—"}</td>
              <td className="num">{l.meta ? brl(l.meta.super_goal) : "—"}</td>
              <td className="num"><b>{l.futuro ? "—" : brl(l.fat)}</b></td>
              <td>{sit}</td>
            </tr>
          );
        })}</tbody>
      </table></div>
    </section>
  );
}

export function MetasForm({ mes, nome, meta, media }: { mes: string; nome: string; meta: Meta | null; media: number }) {
  const router = useRouter();
  const [goal, setGoal] = useState(meta ? fmtV(meta.goal) : "");
  const [sup, setSup] = useState(meta ? fmtV(meta.super_goal) : "");
  const [busy, setBusy] = useState(false);
  const [pend, setPend] = useState(false);
  const g = parseNum(goal), s = parseNum(sup);
  const extra = g > 0 && s > 0 ? Math.round((s / g - 1) * 100) : null;

  function sugerir() {
    const base = Math.ceil(media * 1.1 / 100) * 100;
    setGoal(fmtV(base)); setSup(fmtV(Math.ceil(base * 1.25 / 100) * 100));
  }

  async function salvar() {
    const e = metaErro(g, s);
    if (e) return toast(e, { err: true });
    setBusy(true);
    const { error } = await createClient().from("revenue_goals")
      .upsert({ month: mes + "-01", goal: round2(g), super_goal: round2(s) }, { onConflict: "shop_id,month" });
    setBusy(false);
    if (error) return toast(errMsg(error), { err: true });
    toast(meta ? "Metas atualizadas" : "Metas definidas", { sound: "ok" });
    router.refresh();
  }

  async function excluir() {
    setPend(false);
    const { error } = await createClient().from("revenue_goals").delete().eq("month", mes + "-01");
    if (error) return toast(errMsg(error), { err: true });
    setGoal(""); setSup("");
    toast("Metas do mês removidas");
    router.refresh();
  }

  return (
    <aside className="stack sticky">
      <section className="panel">
        <div className="ph"><h2>{meta ? "Editar metas" : "Definir metas"}</h2><span className="hint">{nome}</span></div>
        <div className="stack">
          <label className="field"><span className="label">Mês</span>
            <input className="input mono" type="month" id="mt-mes" value={mes} onChange={e => e.target.value && router.push(`/financeiro/metas?m=${e.target.value}`)} />
          </label>
          <label className="field"><span className="label">META (R$) *</span>
            <input className="input mono" id="mt-meta" inputMode="decimal" placeholder="Ex.: 50.000,00" value={goal} onChange={e => setGoal(e.target.value)} />
            <span className="hint">O faturamento que a oficina precisa alcançar no mês</span>
          </label>
          <label className="field"><span className="label">SUPER META (R$) *</span>
            <input className="input mono" id="mt-super" inputMode="decimal" placeholder="Ex.: 65.000,00" value={sup} onChange={e => setSup(e.target.value)} />
            <span className="hint">{extra !== null && extra >= 0 ? `${extra}% acima da META` : "O desafio extra, maior ou igual à META"}</span>
          </label>
          {media > 0 && (
            <div className="hint">Média recebida nos 3 meses anteriores: <b className="mono">{brl(media)}</b>{" "}
              <button className="key sm" type="button" onClick={sugerir}>Sugerir metas</button>
            </div>
          )}
          <button className="key accent" style={{ padding: 13 }} disabled={busy} onClick={salvar}>{meta ? "Salvar alterações" : "Salvar metas"}</button>
          {meta && (pend
            ? <div className="row"><span>Remover as metas de {nome}?</span><button className="key sm danger" onClick={excluir}>Remover</button><button className="key sm" onClick={() => setPend(false)}>Cancelar</button></div>
            : <button className="key sm" onClick={() => setPend(true)}>Remover metas do mês</button>)}
        </div>
      </section>
    </aside>
  );
}

