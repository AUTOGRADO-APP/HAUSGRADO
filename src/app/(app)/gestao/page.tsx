// Gestão (seção 7.2): um mês por vez (?m=aaaa-mm), base = O.S. finalizadas no mês pela data de saída.
import Link from "next/link";
import { createClient } from "@/lib/supabase/server.ts";
import { brl } from "@/lib/rules.ts";
import { MESES, TIPOS, addDays, fmtDias, iniciais, ymd } from "@/lib/labels.ts";
import { addMonth, computeGestao, variacao, type GOrder, type GQuote, type GTech } from "@/lib/gestao.ts";
import { LineChart } from "./LineChart.tsx";

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

export default async function GestaoPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const sp = await searchParams;
  const hoje = ymd(), atual = hoje.slice(0, 7);
  const mes = sp.m && /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.m) && sp.m <= atual ? sp.m : atual;
  const ant = addMonth(mes, -1);
  // finalizadas desde o início do mês anterior (ou dos últimos 14 dias, para o gráfico) + todas no pátio
  const desde = [ant + "-01", addDays(hoje, -14)].sort()[0];
  const desdeISO = desde + "T00:00:00-03:00";
  const qsel = "id, service_order_id, status, discount, created_at, quote_items(kind, description, qty, unit_price)";

  const sb = await createClient();
  const [os, qOs, qAb, nAp, nRe, techs, shop] = await Promise.all([
    sb.from("service_orders").select("id, status, entry_type, entered_at, exited_at, technician_id")
      .or(`status.neq.finalizado,exited_at.gte.${desdeISO}`),
    sb.from("quotes").select(qsel + ", service_orders!inner(status, exited_at)")
      .or(`status.neq.finalizado,exited_at.gte.${desdeISO}`, { referencedTable: "service_orders" }),
    sb.from("quotes").select(qsel).in("status", ["rascunho", "enviado"]),
    sb.from("quotes").select("id", { count: "exact", head: true }).eq("status", "aprovado"),
    sb.from("quotes").select("id", { count: "exact", head: true }).eq("status", "recusado"),
    sb.from("technicians").select("id, name, active"),
    sb.from("shops").select("commission_pct").maybeSingle(),
  ]);
  const err = os.error || qOs.error || qAb.error || techs.error;

  const qById = new Map<string, GQuote>();
  for (const q of [...((qOs.data ?? []) as unknown as QRow[]), ...((qAb.data ?? []) as unknown as QRow[])]) qById.set(q.id, toQuote(q));
  const pct = Number((shop.data as { commission_pct: number } | null)?.commission_pct ?? 5);
  const G = computeGestao({
    orders: (os.data ?? []) as GOrder[], quotes: [...qById.values()], techs: (techs.data ?? []) as GTech[],
    commissionPct: pct, mes, hoje, decididos: { aprovados: nAp.count ?? 0, recusados: nRe.count ?? 0 },
  });
  const { M, P } = G;
  const nm = nomeMes(mes), nAnt = MESES[Number(ant.slice(5, 7)) - 1];
  const tc = G.cur.reduce((a, x) => a + x.v, 0), tp = G.prev.reduce((a, x) => a + x.v, 0);
  const top = M.serv.slice(0, 6), maxQ = Math.max(1, ...top.map(x => x.q)), totT = Math.max(1, M.n);
  const pm = (M.pecas + M.mao) || 1, pPec = Math.round(M.pecas / pm * 100);
  const fdia = (k: string) => new Date(k + "T12:00:00Z").toLocaleDateString("pt-BR", { timeZone: "UTC", weekday: "short", day: "2-digit", month: "2-digit" });
  const pctTxt = String(pct).replace(".", ",");

  return (
    <main id="view">
      {err && <div className="banner"><span>Erro ao carregar a gestão: {err.message}</span></div>}
      <div className="g-wrap">
        <section className="g-head">
          <div>
            <span className="label">Painel de gestão</span>
            <h1>{nm}</h1>
            <p className="hint" style={{ margin: "2px 0 0" }}>O.S. finalizadas no mês, pela data de saída · comparado com {nAnt}</p>
          </div>
          <div className="row">
            <Link className="key sm" href={`/gestao?m=${ant}`} aria-label="Mês anterior">‹</Link>
            <Link className={`key sm ${mes === atual ? "on" : ""}`} href="/gestao">Mês atual</Link>
            {mes < atual
              ? <Link className="key sm" href={`/gestao?m=${addMonth(mes, 1)}`} aria-label="Próximo mês">›</Link>
              : <button className="key sm" aria-label="Próximo mês" aria-disabled="true" disabled>›</button>}
          </div>
        </section>

        <div className="g-kpis">
          <div className="kpi main"><span className="label">Faturamento de serviços finalizados</span><strong>{brl(M.fat)}</strong>
            <div className="kpi-f"><Delta a={M.fat} b={P.fat} /><span className="hint">{nAnt}: {brl(P.fat)}</span></div></div>
          <div className="kpi"><span className="label">O.S. finalizadas</span><strong>{M.n}</strong>
            <div className="kpi-f"><Delta a={M.n} b={P.n} /><span className="hint">{nAnt}: {P.n}</span></div></div>
          <div className="kpi"><span className="label">Ticket médio</span><strong>{brl(M.ticket)}</strong>
            <div className="kpi-f"><Delta a={M.ticket} b={P.ticket} /><span className="hint">{nAnt}: {brl(P.ticket)}</span></div></div>
          <div className="kpi"><span className="label">Tempo médio de pátio</span><strong>{fmtDias(M.tempo)}</strong>
            <div className="kpi-f"><Delta a={M.tempo} b={P.tempo} inv /><span className="hint">{nAnt}: {fmtDias(P.tempo)}</span></div></div>
        </div>

        <section className="panel g-chart">
          <div className="ph">
            <div><h2>Faturamento diário</h2><p className="hint" style={{ margin: "4px 0 0" }}>Últimos 7 dias comparados aos 7 dias anteriores</p></div>
            <div className="g-sum">
              <div><span className="label">Últimos 7 dias</span><b className="mono">{brl(tc)}</b></div>
              <div><span className="label">7 dias anteriores</span><b className="mono muted">{brl(tp)}</b></div>
              <Delta a={tc} b={tp} />
            </div>
          </div>
          <div className="lc-leg"><span><i className="sw cur" />Últimos 7 dias</span><span><i className="sw prev" />7 dias anteriores</span></div>
          <LineChart cur={G.cur} prev={G.prev} />
          <details className="g-tbl"><summary>Ver em tabela</summary>
            <div className="tbl-wrap"><table>
              <thead><tr><th>Dia</th><th className="num">Últimos 7 dias</th><th className="num">Anteriores</th></tr></thead>
              <tbody>{G.cur.map((c, i) => <tr key={c.k}><td>{fdia(c.k)}</td><td className="num">{brl(c.v)}</td><td className="num">{brl(G.prev[i].v)}</td></tr>)}</tbody>
            </table></div>
          </details>
        </section>

        <div className="g-ops">
          <div className="kpi sm"><span className="label">A faturar no pátio</span><strong>{brl(G.aFat)}</strong><span className="hint">{G.aFatN} O.S. aprovadas em andamento</span></div>
          <div className="kpi sm"><span className="label">Orçamentos aguardando resposta</span><strong>{brl(G.vAb)}</strong>
            <span className="hint">{G.abN} orçamento{G.abN === 1 ? "" : "s"} em rascunho ou enviado{G.abN === 1 ? "" : "s"}</span></div>
          <div className="kpi sm"><span className="label">Taxa de aprovação</span><strong>{G.taxa}%</strong>
            <span className="meter"><span style={{ width: `${G.taxa}%` }} /></span><span className="hint">{G.decN} orçamentos decididos</span></div>
        </div>

        <section className="panel">
          <div className="ph"><h2>Serviço por mecânico</h2><span className="hint">{nm} · finalizadas no mês e carga atual no pátio</span></div>
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
