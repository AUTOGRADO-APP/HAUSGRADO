// Painel de meta do mês (Gestão e Financeiro > Metas): medidor + números de apoio.
import Link from "next/link";
import { brl } from "@/lib/rules.ts";
import { metaStatus, type Meta } from "@/lib/metas.ts";
import { MetaGauge } from "./MetaGauge.tsx";

export function MetaPanel({ titulo, mes, nomeMes, fat, meta, hoje, nRec, editar = true }: {
  titulo: string; mes: string; nomeMes: string; fat: number; meta: Meta | null; hoje: string; nRec: number; editar?: boolean;
}) {
  const href = `/financeiro/metas?m=${mes}`;
  if (!meta) {
    return (
      <section className="panel mg-panel">
        <div className="ph"><h2>{titulo}</h2><span className="hint">{nomeMes}</span></div>
        <div className="empty">
          Nenhuma meta definida para {nomeMes}. Recebido até agora: <b className="mono">{brl(fat)}</b>
          {editar && <div style={{ marginTop: 12 }}><Link className="key accent sm" href={href}>Definir META e SUPER META</Link></div>}
        </div>
      </section>
    );
  }
  const s = metaStatus(fat, meta, mes, hoje);
  return (
    <section className="panel mg-panel">
      <div className="ph">
        <div><h2>{titulo}</h2><p className="hint" style={{ margin: "4px 0 0" }}>{nomeMes} · recebido nas entradas do mês ({nRec} recebimento{nRec === 1 ? "" : "s"})</p></div>
        {editar && <Link className="key sm" href={href}>Editar metas</Link>}
      </div>
      <div className="mg-body">
        <MetaGauge fat={fat} goal={meta.goal} superGoal={meta.super_goal} nivel={s.nivel} pctMeta={s.pctMeta} />
        <MetaNums meta={meta} fat={fat} mes={mes} hoje={hoje} />
      </div>
    </section>
  );
}

/** Os 4 números de apoio da meta (META, SUPER META, ritmo/projeção ou resultado). */
export function MetaNums({ meta, fat, mes, hoje }: { meta: Meta; fat: number; mes: string; hoje: string }) {
  const s = metaStatus(fat, meta, mes, hoje);
  const corrente = mes === hoje.slice(0, 7);
  return (
    <dl className="mg-nums">
      <div><dt>META</dt><dd className="mono">{brl(meta.goal)}</dd>
        <span className={`hint ${s.faltaMeta ? "" : "mg-ok"}`}>{s.faltaMeta ? `Faltam ${brl(s.faltaMeta)}` : "✓ Batida"}</span></div>
      <div><dt>SUPER META</dt><dd className="mono">{brl(meta.super_goal)}</dd>
        <span className={`hint ${s.faltaSuper ? "" : "mg-ok"}`}>{s.faltaSuper ? `Faltam ${brl(s.faltaSuper)} · ${s.pctSuper}%` : "✓ Batida"}</span></div>
      {corrente ? <>
        <div><dt>Para bater a meta</dt><dd className="mono">{s.faltaMeta ? brl(s.porDiaMeta) : "—"}</dd>
          <span className="hint">{s.faltaMeta ? `por dia nos ${s.diasRest} dia${s.diasRest === 1 ? "" : "s"} que restam` : "Agora é a super meta"}</span></div>
        <div><dt>Projeção do mês</dt><dd className="mono">{brl(s.projecao)}</dd>
          <span className="hint">no ritmo atual{s.projecao >= meta.super_goal ? " · passa da super meta" : s.projecao >= meta.goal ? " · bate a meta" : ""}</span></div>
      </> : <>
        <div><dt>Resultado</dt><dd className="mono">{s.pctMeta}%</dd><span className="hint">da meta</span></div>
        <div><dt>Diferença</dt><dd className="mono">{brl(fat - meta.goal)}</dd><span className="hint">em relação à meta</span></div>
      </>}
    </dl>
  );
}
