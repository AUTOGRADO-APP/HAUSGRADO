// Gestão (seção 7.2): um mês por vez (?m=aaaa-mm), base = recebido nas entradas do mês (a mesma da Meta e de Entradas).
import Link from "next/link";
import { createClient } from "@/lib/supabase/server.ts";
import { brl } from "@/lib/rules.ts";
import { MESES, TIPOS, fmtDias, iniciais, ymd } from "@/lib/labels.ts";
import { addMonth, computeAtencao, computeGestao, resultadoMes, variacao, type GExpense, type GOrder, type GQuote, type GReceipt, type GTech } from "@/lib/gestao.ts";
import { faixaMes, metaStatus, type Meta } from "@/lib/metas.ts";
import { MetaGauge } from "@/components/MetaGauge.tsx";
import { MonthChart } from "./MonthChart.tsx";

export const dynamic = "force-dynamic";

const nomeMes = (m: string) => `${MESES[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;

function Delta({ a, b, inv }: { a: number; b: number; inv?: boolean }) {
  const d = variacao(a, b);
  if (d === null) return <span className="dl">sem base</span>;
  const good = inv ? d <= 0 : d >= 0;
  return <span className={`dl ${d === 0 ? "" : good ? "up" : "down"}`}>{d > 0 ? "▲" : d < 0 ? "▼" : "="} {Math.abs(d)}%</span>;
}

/** Variação em R$ (para valores que podem ser negativos, onde o % engana). */
function DeltaRS({ a, b }: { a: number; b: number }) {
  const d = Math.round((a - b) * 100) / 100;
  return <span className={`dl ${d === 0 ? "" : d > 0 ? "up" : "down"}`} title="Comparado com o mesmo período do mês anterior">{d > 0 ? "▲" : d < 0 ? "▼" : "="} {brl(Math.abs(d))}</span>;
}

function Bars({ rows }: { rows: { n: string; p: number; lab: string }[] }) {
  return <>{rows.map(r => (
    <div className="hb" key={r.n} title={`${r.n}: ${r.lab}`}>
      <span className="hb-l">{r.n}</span>
      <span className="hb-t"><span className="hb-b" style={{ width: `${Math.max(3, r.p)}%` }} /></span>
      <span className="hb-v mono">{r.lab}</span>
    </div>
  ))}</>;
}

type QRow = Omit<GQuote, "items"> & { quote_items: GQuote["items"] };
const toQuote = (q: QRow): GQuote => ({
  id: q.id, service_order_id: q.service_order_id, status: q.status, discount: Number(q.discount), created_at: q.created_at,
  items: (q.quote_items ?? []).map(i => ({ kind: i.kind, description: i.description, qty: Number(i.qty), unit_price: Number(i.unit_price) })),
});
/** `.in()` em lotes, para a URL não passar do limite com muitos ids. */
async function emLotes<T>(ids: string[], f: (lote: string[]) => PromiseLike<{ data: unknown; error: { message: string } | null }>) {
  const out: T[] = []; let error: { message: string } | null = null;
  for (let i = 0; i < ids.length; i += 150) {
    const r = await f(ids.slice(i, i + 150));
    if (r.error) error = r.error; else out.push(...((r.data ?? []) as T[]));
  }
  return { data: out, error };
}

function Att({ href, titulo, n, sub, tone }: { href: string; titulo: string; n: number; sub?: string; tone?: "bad" }) {
  return (
    <Link href={href} className={`att ${n ? tone ?? "" : "zero"}`}>
      <span className="label">{titulo}</span>
      <strong className="mono">{n}</strong>
      <span className="hint">{n ? sub : "Nada pendente"}</span>
    </Link>
  );
}

export default async function GestaoPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const sp = await searchParams;
  const hoje = ymd(), atual = hoje.slice(0, 7);
  const mes = sp.m && /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.m) && sp.m <= atual ? sp.m : atual;
  const ant = addMonth(mes, -1);
  const qsel = "id, service_order_id, status, discount, created_at, quote_items(kind, description, qty, unit_price)";
  const osel = "id, status, entry_type, entered_at, exited_at, technician_id";

  const sb = await createClient();
  const [antIni] = faixaMes(ant), [, mFim] = faixaMes(mes);
  const [rec, pat, qAb, nAp, nRe, techs, shop, meta, board, venc, desp] = await Promise.all([
    sb.from("receipts").select("service_order_id, received_at, total, difference").gte("received_at", antIni).lt("received_at", mFim),
    sb.from("service_orders").select(osel).neq("status", "finalizado"),
    sb.from("quotes").select(qsel + ", service_orders(status)").in("status", ["rascunho", "enviado"]),
    sb.from("quotes").select("id", { count: "exact", head: true }).eq("status", "aprovado"),
    sb.from("quotes").select("id", { count: "exact", head: true }).eq("status", "recusado"),
    sb.from("technicians").select("id, name, active"),
    sb.from("shops").select("commission_pct").maybeSingle(),
    sb.from("revenue_goals").select("month, goal, super_goal").eq("month", mes + "-01").maybeSingle(),
    sb.from("v_board").select("status, status_since, total"),
    sb.from("expenses").select("amount").eq("paid", false).neq("source", "fee").lt("due_date", hoje),
    sb.from("expenses").select("category, amount, paid_on").eq("paid", true).gte("paid_on", antIni.slice(0, 10)).lt("paid_on", mFim.slice(0, 10)),
  ]);
  const receipts = ((rec.data ?? []) as GReceipt[]).map(r => ({ ...r, total: Number(r.total), difference: Number(r.difference) }));
  const patio = (pat.data ?? []) as GOrder[];
  const recIds = [...new Set(receipts.flatMap(r => (r.service_order_id ? [r.service_order_id] : [])))];
  const osIds = [...new Set([...recIds, ...patio.map(o => o.id)])];
  type QAb = QRow & { service_orders: { status: string } | null };
  const abertos = (qAb.data ?? []) as unknown as QAb[];
  const envOS = abertos.filter(q => q.status === "enviado" && q.service_order_id).map(q => q.service_order_id!);
  const [recOs, qOs, hist] = await Promise.all([
    emLotes<GOrder>(recIds, l => sb.from("service_orders").select(osel).in("id", l)),
    emLotes<QRow>(osIds, l => sb.from("quotes").select(qsel).in("service_order_id", l)),
    emLotes<{ service_order_id: string; created_at: string }>(envOS, l => sb.from("service_order_history").select("service_order_id, created_at")
      .eq("text", "Orçamento enviado ao cliente pelo WhatsApp").in("service_order_id", l)),
  ]);
  const err = rec.error || desp.error || pat.error || qAb.error || techs.error || board.error || recOs.error || qOs.error;

  const pct = Number((shop.data as { commission_pct: number } | null)?.commission_pct ?? 5);
  const G = computeGestao({
    orders: [...patio, ...recOs.data], receipts, quotes: qOs.data.map(toQuote), techs: (techs.data ?? []) as GTech[],
    commissionPct: pct, mes, hoje, decididos: { aprovados: nAp.count ?? 0, recusados: nRe.count ?? 0 },
  });
  const enviadoEm = new Map<string, string>();
  for (const h of hist.data) if ((enviadoEm.get(h.service_order_id) ?? "") < h.created_at) enviadoEm.set(h.service_order_id, h.created_at);
  const A = computeAtencao({
    quotes: abertos.map(q => ({ ...toQuote(q), os_status: q.service_orders?.status ?? null })), enviadoEm,
    board: ((board.data ?? []) as { status: string; status_since: string; total: number }[]),
    vencidas: (venc.data ?? []) as { amount: number }[],
  });

  const { M, P } = G;
  const corrente = mes === atual;
  const nm = nomeMes(mes), nAnt = MESES[Number(ant.slice(5, 7)) - 1];
  const cmp = corrente ? `${nAnt} até o dia ${G.ateDia}` : nAnt;
  const top = M.serv.slice(0, 6), maxV = Math.max(1, ...top.map(x => x.v));
  const fdia = (k: string) => new Date(k + "T12:00:00Z").toLocaleDateString("pt-BR", { timeZone: "UTC", weekday: "short", day: "2-digit", month: "2-digit" });
  const pctTxt = String(pct).replace(".", ",");
  const mrow = meta.data as { month: string; goal: number; super_goal: number } | null;
  const metaMes: Meta | null = mrow ? { month: mrow.month, goal: Number(mrow.goal), super_goal: Number(mrow.super_goal) } : null;
  const st = metaStatus(M.fat, metaMes ?? { goal: 0, super_goal: 0 }, mes, hoje);
  const s = (n: number, um: string, varios: string) => (n === 1 ? um : varios);
  const metaTxt = !metaMes
    ? <><strong className="mono muted">—</strong><Link className="hint" href={`/financeiro/metas?m=${mes}`}>Definir meta do mês</Link></>
    : !corrente
      ? <><strong className="mono">{st.pctMeta}%</strong><span className="hint">{M.fat >= metaMes.goal ? "Meta batida" : `Ficaram faltando ${brl(st.faltaMeta)}`}</span></>
      : st.faltaMeta
        ? <><strong className="mono">Faltam {brl(st.faltaMeta)}</strong><span className="hint">{brl(st.porDiaMeta)} por dia nos {st.diasRest} {s(st.diasRest, "dia", "dias")} que restam</span></>
        : <><strong className="mono g-ok">✓ Batida</strong><span className="hint">{st.faltaSuper ? `Faltam ${brl(st.faltaSuper)} para a super meta` : "Super meta batida"}</span></>;

  // resultado do mês (regime de caixa), comparado com o mês anterior até o mesmo dia
  const expenses = ((desp.data ?? []) as GExpense[]);
  const R = resultadoMes(M.fat, expenses, mes);
  const RP = resultadoMes(P.fat, expenses, ant, corrente ? G.ateDia : 31);
  const desp1 = `/financeiro/despesas?cat=`;
  // cascata: cada degrau vai do acumulado anterior ao seguinte, numa escala que inclui o zero e o ponto mais baixo
  const corte = [R.recebido, R.taxas, R.comissoes, R.compras, R.outras];
  const nivel = corte.map((_, i) => R.recebido - corte.slice(1, i + 1).reduce((a, v) => a + v, 0));
  const lo = Math.min(0, ...nivel), span = Math.max(1, Math.max(R.recebido, 0) - lo);
  const pos = (a: number, b: number) => ({ ini: (Math.min(a, b) - lo) / span * 100, w: Math.abs(a - b) / span * 100 });
  const passo = (i: number, n: string, href: string | null, sub?: string) =>
    ({ n, v: -corte[i], sinal: corte[i] ? "− " : "", ...pos(nivel[i - 1], nivel[i]), cls: "out", href, sub });
  const degraus = [
    { n: "Recebido", v: R.recebido, sinal: "", ...pos(0, R.recebido), cls: "in", href: "/financeiro/entradas" as string | null, sub: undefined as string | undefined },
    passo(1, "Taxas de cartão e pix", desp1 + encodeURIComponent("Taxa de pagamento")),
    passo(2, "Comissões", desp1 + encodeURIComponent("Comissão")),
    passo(3, "Compras de mercadorias", desp1 + encodeURIComponent("Compra de mercadorias")),
    passo(4, "Outras despesas", "/financeiro/despesas", R.outrasCats.slice(0, 3).map(c => c.n).join(", ") || undefined),
    { n: "Resultado", v: R.resultado, sinal: R.resultado < 0 ? "− " : "", ...pos(0, R.resultado), cls: R.resultado < 0 ? "neg" : "res", href: null, sub: undefined },
  ];

  return (
    <main id="view">
      {err && <div className="banner"><span>Erro ao carregar a gestão: {err.message}</span></div>}
      <div className="g-wrap">
        <section className="g-head">
          <div>
            <span className="label">Painel de gestão</span>
            <h1>{nm}</h1>
            <p className="hint" style={{ margin: "2px 0 0" }}>Recebido nas entradas do mês · comparado com {cmp}</p>
          </div>
          <div className="row">
            <Link className="key sm" href={`/gestao?m=${ant}`} aria-label="Mês anterior">‹</Link>
            <Link className={`key sm ${corrente ? "on" : ""}`} href="/gestao">Mês atual</Link>
            {mes < atual
              ? <Link className="key sm" href={`/gestao?m=${addMonth(mes, 1)}`} aria-label="Próximo mês">›</Link>
              : <button className="key sm" aria-label="Próximo mês" aria-disabled="true" disabled>›</button>}
          </div>
        </section>

        <section className="g-att-wrap" aria-labelledby="g-att-t">
          <span className="label" id="g-att-t">Precisa de atenção agora</span>
          <div className="g-att">
            <Att href="/orcamentos?st=rascunho" titulo="Orçamentos para enviar" n={A.rascunho.n} sub={`${brl(A.rascunho.v)} em rascunho`} />
            <Att href="/orcamentos?st=enviado" titulo="Esperando o cliente" n={A.enviado.n}
              sub={`${brl(A.enviado.v)} · ${A.enviado.dias ? `mais antigo há ${A.enviado.dias} ${s(A.enviado.dias, "dia", "dias")}` : "enviado hoje"}`} />
            <Att href="/quadro?f=parados" titulo="Carros parados" n={A.parados} sub="há 3 dias ou mais na mesma etapa" tone="bad" />
            <Att href="/quadro?f=entrega" titulo="Prontos para entrega" n={A.entrega.n} sub={`${brl(A.entrega.v)} a receber`} />
            {A.vencidas.n > 0 && <Att href="/financeiro/calendario" titulo="Contas vencidas" n={A.vencidas.n} sub={`${brl(A.vencidas.v)} em aberto`} tone="bad" />}
          </div>
        </section>

        <section className="panel g-fat">
          <div className="ph">
            <div><h2>Faturamento do mês</h2>
              <p className="hint" style={{ margin: "4px 0 0" }}>{nm} · recebido nas entradas ({M.n} {s(M.n, "recebimento", "recebimentos")}{M.fantasma ? ` + ${brl(M.fantasma)} em entrada fantasma` : ""}), dia a dia comparado com {nAnt}</p></div>
            <Link className="key sm" href={`/financeiro/metas?m=${mes}`}>{metaMes ? "Editar metas" : "Definir metas"}</Link>
          </div>
          <div className="g-fat-body">
            <div className="g-fat-main">
              {metaMes
                ? <MetaGauge fat={M.fat} goal={metaMes.goal} superGoal={metaMes.super_goal} nivel={st.nivel} pctMeta={st.pctMeta} />
                : <div className="g-fat-big"><span className="label">Recebido</span><strong className="mono">{brl(M.fat)}</strong></div>}
              <div className="kpi-f g-fat-cmp"><Delta a={M.fat} b={P.fat} /><span className="hint">{cmp}: {brl(P.fat)}</span></div>
              {M.desc > 0 && <span className="hint">Descontos no fechamento: <b className="mono">{brl(M.desc)}</b> em {M.descN} O.S.</span>}
            </div>
            <div className="g-fat-chart">
              <div className="lc-leg">
                <span><i className="sw cur" />{nm.split(" ")[0]}</span><span><i className="sw prev" />{nAnt}</span><span><i className="sw bar" />Recebido no dia</span>
                {metaMes && <><span><i className="sw goal" />META</span>{metaMes.super_goal > metaMes.goal && <span><i className="sw goal sup" />SUPER META</span>}</>}
                {corrente && <span><i className="sw proj" />Projeção</span>}
              </div>
              {M.fat || P.fat
                ? <MonthChart cur={G.cur} prev={G.prev} ateDia={G.ateDia} hojeDia={corrente ? G.ateDia : null} nomeAnt={nAnt}
                    goal={metaMes?.goal} superGoal={metaMes?.super_goal} projecao={corrente ? st.projecao : undefined} />
                : <div className="empty">Sem recebimentos ainda neste mês</div>}
              <details className="g-tbl"><summary>Ver em tabela</summary>
                <div className="tbl-wrap"><table>
                  <thead><tr><th>Dia</th><th className="num">No dia</th><th className="num">Acumulado</th><th className="num">{nAnt} acumulado</th></tr></thead>
                  <tbody>{G.cur.slice(0, G.ateDia).map((c, i) => <tr key={c.k}><td>{fdia(c.k)}</td><td className="num">{brl(c.v)}</td><td className="num">{brl(c.acc)}</td>
                    <td className="num">{G.prev[i] ? brl(G.prev[i].acc) : "—"}</td></tr>)}</tbody>
                </table></div>
              </details>
            </div>
          </div>
          <div className="g-strip">
            <div><span className="label">O.S. finalizadas</span><strong className="mono">{M.n}</strong>
              <div className="kpi-f"><Delta a={M.n} b={P.n} /><span className="hint">{nAnt}: {P.n}</span></div></div>
            <div><span className="label">Ticket médio</span><strong className="mono">{brl(M.ticket)}</strong>
              <div className="kpi-f"><Delta a={M.ticket} b={P.ticket} /><span className="hint">{nAnt}: {brl(P.ticket)}</span></div></div>
            <div><span className="label">Tempo médio de pátio</span><strong className="mono">{fmtDias(M.tempo)}</strong>
              <div className="kpi-f"><Delta a={M.tempo} b={P.tempo} inv /><span className="hint">{nAnt}: {fmtDias(P.tempo)}</span></div></div>
            <div><span className="label">Meta</span>{metaTxt}</div>
            <div><span className="label">A faturar no pátio</span><strong className="mono">{brl(G.aFat)}</strong>
              <span className="hint">{G.aFatN} O.S. aprovadas em andamento</span></div>
            <div><span className="label">Taxa de aprovação</span><strong className="mono">{G.taxa}%</strong>
              <span className="hint">{G.decN} orçamentos decididos</span></div>
          </div>
        </section>

        <section className="panel">
          <div className="ph"><h2>Serviço por mecânico</h2><span className="hint">{nm} · recebido no mês e carga atual no pátio</span></div>
          <div className="mec-grid">
            {G.mec.length ? G.mec.map(m => (
              <article className={`mec ${m.id ? "" : "warn"}`} key={m.id ?? "none"}>
                <header>
                  <span className="avatar">{m.id ? iniciais(m.n) : "?"}</span>
                  <div><b>{m.id ? m.n : "Sem responsável"}</b><span className="hint">{m.ag} no pátio · {m.agS} em serviço agora</span></div>
                  <strong className="mono">{brl(m.fat)}</strong>
                </header>
                <div className="mec-share" title={`${Math.round(m.fat / G.totMec * 100)}% do faturamento do mês`}>
                  <span style={{ width: `${Math.max(2, m.fat / G.totMec * 100)}%` }} />
                </div>
                <dl>
                  <div><dt>O.S. finalizadas</dt><dd>{m.q}</dd></div>
                  <div><dt>Ticket médio</dt><dd>{brl(m.ticket)}</dd></div>
                  <div><dt>Mão de obra</dt><dd>{brl(m.mao)}</dd></div>
                  <div><dt>Tempo médio</dt><dd>{fmtDias(m.tempo)}</dd></div>
                </dl>
                <div className="hint">Comissão estimada ({pctTxt}%): <b className="mono" style={{ color: "var(--accent)" }}>{brl(m.com)}</b></div>
              </article>
            )) : <div className="empty">Nenhum mecânico com O.S. neste mês</div>}
          </div>
        </section>

        <div className="g-bottom">
          <section className="panel">
            <div className="ph">
              <div><h2>Resultado do mês</h2>
                <p className="hint" style={{ margin: "4px 0 0" }}>Recebido menos as despesas pagas em {nm}{corrente ? ` até o dia ${G.ateDia}` : ""}</p></div>
              <div className="g-res-tot">
                <strong className={`mono ${R.resultado < 0 ? "neg" : ""}`}>{R.resultado < 0 ? "− " : ""}{brl(Math.abs(R.resultado))}</strong>
                <div className="kpi-f">{R.margem !== null && <span className="hint">{R.margem}% do recebido</span>}<DeltaRS a={R.resultado} b={RP.resultado} /></div>
              </div>
            </div>
            <div className="wf" role="list" style={{ ["--z" as string]: `${-lo / span * 100}%` }} data-neg={lo < 0 ? "" : undefined}>
              {degraus.map(d => {
                const row = <>
                  <span className="wf-l"><b>{d.n}</b>{d.sub && <small className="hint">{d.sub}</small>}</span>
                  <span className="wf-t"><span className={`wf-b ${d.cls}`} style={{ left: `${d.ini}%`, width: `${Math.max(d.v ? 0.6 : 0, d.w)}%` }} /></span>
                  <span className={`wf-v mono ${d.cls}`}>{d.sinal}{brl(Math.abs(d.v))}</span>
                </>;
                return d.href
                  ? <Link role="listitem" key={d.n} href={d.href} className="wf-r">{row}</Link>
                  : <div role="listitem" key={d.n} className={`wf-r ${d.cls === "res" || d.cls === "neg" ? "wf-sum" : ""}`}>{row}</div>;
              })}
            </div>
            <p className="hint" style={{ margin: "12px 0 0" }}>
              Regime de caixa: cada despesa conta no dia em que foi paga, igual ao Financeiro.
              {R.retiradas > 0 && <> Retiradas (antecipação de lucros) ficam fora da conta: <b className="mono">{brl(R.retiradas)}</b>.</>}
            </p>
          </section>
          <section className="panel">
            <div className="ph"><h2>Serviços mais feitos</h2><span className="hint">Mão de obra, pelo valor</span></div>
            {top.length
              ? <div className="hbars"><Bars rows={top.map(x => ({ n: x.n, p: x.v / maxV * 100, lab: `${brl(x.v)} · ${x.q}×` }))} /></div>
              : <div className="empty">Nenhum serviço finalizado neste mês</div>}
            <p className="hint" style={{ margin: "16px 0 0" }}>
              {M.n} {s(M.n, "O.S. recebida", "O.S. recebidas")}: {Object.entries(TIPOS).map(([k, l]) => `${M.tipos[k] || 0} ${l.toLowerCase()}`).join(", ")}.
              {" "}Peças {brl(M.pecas)} e mão de obra {brl(M.mao)} nos orçamentos.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
