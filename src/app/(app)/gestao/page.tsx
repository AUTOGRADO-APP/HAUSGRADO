// Gestão (seção 7.2): um mês por vez (?m=aaaa-mm), base = recebido nas entradas do mês (a mesma da Meta e de Entradas).
import Link from "next/link";
import { createClient } from "@/lib/supabase/server.ts";
import { brl } from "@/lib/rules.ts";
import { MESES, TIPOS, fmtDias, iniciais, ymd } from "@/lib/labels.ts";
import { addMonth, computeAtencao, computeGestao, variacao, type GOrder, type GQuote, type GReceipt, type GTech } from "@/lib/gestao.ts";
import { faixaMes, metaStatus, type Meta } from "@/lib/metas.ts";
import { MetaNums } from "@/components/MetaPanel.tsx";
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
  const [rec, pat, qAb, nAp, nRe, techs, shop, meta, board, venc] = await Promise.all([
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
  ]);
  const receipts = ((rec.data ?? []) as GReceipt[]).map(r => ({ ...r, total: Number(r.total), difference: Number(r.difference) }));
  const patio = (pat.data ?? []) as GOrder[];
  const recIds = [...new Set(receipts.map(r => r.service_order_id))];
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
  const err = rec.error || pat.error || qAb.error || techs.error || board.error || recOs.error || qOs.error;

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
  const top = M.serv.slice(0, 6), maxQ = Math.max(1, ...top.map(x => x.q)), totT = Math.max(1, M.n);
  const pm = (M.pecas + M.mao) || 1, pPec = Math.round(M.pecas / pm * 100);
  const fdia = (k: string) => new Date(k + "T12:00:00Z").toLocaleDateString("pt-BR", { timeZone: "UTC", weekday: "short", day: "2-digit", month: "2-digit" });
  const pctTxt = String(pct).replace(".", ",");
  const mrow = meta.data as { month: string; goal: number; super_goal: number } | null;
  const metaMes: Meta | null = mrow ? { month: mrow.month, goal: Number(mrow.goal), super_goal: Number(mrow.super_goal) } : null;
  const st = metaStatus(M.fat, metaMes ?? { goal: 0, super_goal: 0 }, mes, hoje);
  const s = (n: number, um: string, varios: string) => (n === 1 ? um : varios);

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
              <p className="hint" style={{ margin: "4px 0 0" }}>{nm} · recebido nas entradas ({M.n} {s(M.n, "recebimento", "recebimentos")})</p></div>
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
            <div className="g-fat-side">
              <div className="g-mini">
                <div><span className="label">O.S. finalizadas</span><strong className="mono">{M.n}</strong>
                  <div className="kpi-f"><Delta a={M.n} b={P.n} /><span className="hint">{nAnt}: {P.n}</span></div></div>
                <div><span className="label">Ticket médio</span><strong className="mono">{brl(M.ticket)}</strong>
                  <div className="kpi-f"><Delta a={M.ticket} b={P.ticket} /><span className="hint">{nAnt}: {brl(P.ticket)}</span></div></div>
                <div><span className="label">Tempo médio de pátio</span><strong className="mono">{fmtDias(M.tempo)}</strong>
                  <div className="kpi-f"><Delta a={M.tempo} b={P.tempo} inv /><span className="hint">{nAnt}: {fmtDias(P.tempo)}</span></div></div>
              </div>
              {metaMes
                ? <MetaNums meta={metaMes} fat={M.fat} mes={mes} hoje={hoje} />
                : <div className="empty">Nenhuma meta definida para {nm}.
                    <div style={{ marginTop: 10 }}><Link className="key accent sm" href={`/financeiro/metas?m=${mes}`}>Definir META e SUPER META</Link></div></div>}
            </div>
          </div>
        </section>

        <section className="panel g-chart">
          <div className="ph">
            <div><h2>Faturamento acumulado no mês</h2>
              <p className="hint" style={{ margin: "4px 0 0" }}>{M.fat ? `Recebido dia a dia em ${nm}, comparado com ${nAnt}` : "Sem recebimentos ainda neste mês"}</p></div>
            <div className="g-sum">
              <div><span className="label">{corrente ? `Até hoje, dia ${G.ateDia}` : nm}</span><b className="mono">{brl(M.fat)}</b></div>
              <div><span className="label">{cmp}</span><b className="mono muted">{brl(P.fat)}</b></div>
              <Delta a={M.fat} b={P.fat} />
            </div>
          </div>
          <div className="lc-leg">
            <span><i className="sw cur" />{nm.split(" ")[0]}</span><span><i className="sw prev" />{nAnt}</span><span><i className="sw bar" />Recebido no dia</span>
            {metaMes && <><span><i className="sw goal" />META</span>{metaMes.super_goal > metaMes.goal && <span><i className="sw goal sup" />SUPER META</span>}</>}
            {corrente && <span><i className="sw proj" />Projeção</span>}
          </div>
          <MonthChart cur={G.cur} prev={G.prev} ateDia={G.ateDia} hojeDia={corrente ? G.ateDia : null} nomeAnt={nAnt}
            goal={metaMes?.goal} superGoal={metaMes?.super_goal} projecao={corrente ? st.projecao : undefined} />
          <details className="g-tbl"><summary>Ver em tabela</summary>
            <div className="tbl-wrap"><table>
              <thead><tr><th>Dia</th><th className="num">No dia</th><th className="num">Acumulado</th><th className="num">{nAnt} acumulado</th></tr></thead>
              <tbody>{G.cur.slice(0, G.ateDia).map((c, i) => <tr key={c.k}><td>{fdia(c.k)}</td><td className="num">{brl(c.v)}</td><td className="num">{brl(c.acc)}</td>
                <td className="num">{G.prev[i] ? brl(G.prev[i].acc) : "—"}</td></tr>)}</tbody>
            </table></div>
          </details>
        </section>

        <div className="g-ops">
          <div className="kpi sm"><span className="label">A faturar no pátio</span><strong>{brl(G.aFat)}</strong><span className="hint">{G.aFatN} O.S. aprovadas em andamento</span></div>
          <div className="kpi sm"><span className="label">Taxa de aprovação</span><strong>{G.taxa}%</strong>
            <span className="meter"><span style={{ width: `${G.taxa}%` }} /></span><span className="hint">{G.decN} orçamentos decididos</span></div>
        </div>

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
            <div className="ph"><h2>Serviços mais feitos</h2><span className="hint">Itens de mão de obra</span></div>
            {top.length
              ? <div className="hbars"><Bars rows={top.map(x => ({ n: x.n, p: x.q / maxQ * 100, lab: `${x.q}× · ${brl(x.v)}` }))} /></div>
              : <div className="empty">Nenhum serviço finalizado neste mês</div>}
          </section>
          <section className="panel">
            <div className="ph"><h2>Composição</h2></div>
            <div className="split-bar" title={`Peças ${pPec}% · Mão de obra ${100 - pPec}%`}>
              <span className="a" style={{ width: `${pPec}%` }} /><span className="b" style={{ width: `${100 - pPec}%` }} />
            </div>
            <div className="stack" style={{ gap: 8, marginTop: 12 }}>
              <div className="row" style={{ justifyContent: "space-between" }}><span><i className="sw cur" />Peças · {pPec}%</span><b className="mono">{brl(M.pecas)}</b></div>
              <div className="row" style={{ justifyContent: "space-between" }}><span><i className="sw mut" />Mão de obra · {100 - pPec}%</span><b className="mono">{brl(M.mao)}</b></div>
            </div>
            <div className="ph" style={{ margin: "20px 0 10px" }}><h2>Por tipo de entrada</h2></div>
            <div className="hbars"><Bars rows={Object.entries(TIPOS).map(([k, l]) => ({ n: l, p: (M.tipos[k] || 0) / totT * 100, lab: String(M.tipos[k] || 0) }))} /></div>
          </section>
        </div>
      </div>
    </main>
  );
}
