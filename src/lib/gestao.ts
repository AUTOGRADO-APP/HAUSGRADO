// Cálculos da página Gestão (seção 7.2 / 9 do CLAUDE.md). Puro: sem banco e sem React.
// Faturamento = recebido nas entradas (receipts.total), pela data do recebimento — a mesma base da Meta e de Financeiro > Entradas.
// Datas sempre no fuso de São Paulo (chaves 'aaaa-mm-dd' geradas com ymd()).
import { round2 } from "./rules.ts";
import { ymd } from "./labels.ts";

export interface GOrder {
  id: string; status: string; entry_type: string;
  entered_at: string; exited_at: string | null; technician_id: string | null;
}
/** Entrada (1 por O.S. finalizada). difference < 0 = desconto concedido no fechamento.
 *  service_order_id null = entrada FANTASMA (ajuste da implantação): soma no faturamento, mas não conta como O.S. */
export interface GReceipt { service_order_id: string | null; received_at: string; total: number; difference: number }
export interface GQuoteItem { kind: "peca" | "mao"; description: string | null; qty: number; unit_price: number }
export interface GQuote {
  id: string; service_order_id: string | null; status: string; discount: number; created_at: string; items: GQuoteItem[];
}
export interface GTech { id: string; name: string; active: boolean }

export interface MesDados {
  n: number; fat: number; pecas: number; mao: number; ticket: number; tempo: number;
  /** descontos dados no fechamento (soma positiva) e em quantas O.S. */
  desc: number; descN: number;
  /** soma das entradas fantasma (ajustes da implantação), já incluída em fat */
  fantasma: number;
  serv: { n: string; q: number; v: number }[]; tipos: Record<string, number>;
}
/** Um dia do mês: recebido no dia (v), nº de recebimentos (n) e acumulado até o dia (acc). */
export interface DiaMes { k: string; d: number; v: number; n: number; acc: number }
export interface MecCard {
  id: string | null; n: string; q: number; fat: number; mao: number; ticket: number; tempo: number; ag: number; agS: number; com: number;
}
export interface GestaoData {
  mes: string; ant: string; M: MesDados; P: MesDados;
  /** dia do mês usado na comparação (no mês corrente = hoje; em mês passado = último dia) */
  ateDia: number;
  cur: DiaMes[]; prev: DiaMes[];
  aFat: number; aFatN: number; taxa: number; decN: number;
  mec: MecCard[]; totMec: number;
}

const itemsSum = (q: GQuote, kind?: "peca" | "mao") =>
  q.items.filter(i => !kind || i.kind === kind).reduce((s, i) => s + Number(i.qty || 0) * Number(i.unit_price || 0), 0);
export const quoteTotal = (q: GQuote) => round2(itemsSum(q) - Number(q.discount || 0));

/** Orçamento que vale para a O.S.: o aprovado, senão o mais recente não recusado (mesma regra de os_quote() no banco). */
export function quoteByOrder(quotes: GQuote[]): Map<string, GQuote> {
  const m = new Map<string, GQuote>();
  for (const q of quotes) {
    if (!q.service_order_id || q.status === "recusado") continue;
    const cur = m.get(q.service_order_id);
    const pri = (x: GQuote) => (x.status === "aprovado" ? 1 : 0);
    if (!cur || pri(q) > pri(cur) || (pri(q) === pri(cur) && q.created_at > cur.created_at)) m.set(q.service_order_id, q);
  }
  return m;
}

/** 'aaaa-mm' do mês anterior/seguinte. */
export function addMonth(m: string, d: number) {
  const [y, mm] = m.split("-").map(Number);
  const t = y * 12 + (mm - 1) + d;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
}

export const diasNoMes = (mes: string) => { const [y, m] = mes.split("-").map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); };
const diaRec = (r: GReceipt) => ymd(new Date(r.received_at));
const dias = (o: GOrder) => (o.exited_at ? (new Date(o.exited_at).getTime() - new Date(o.entered_at).getTime()) / 864e5 : 0);

/** Nome do serviço para o ranking: sem o prefixo "Mão de obra — ". */
export function nomeServico(desc: string | null) {
  let n = String(desc || "Mão de obra").replace(/^m[ãa]o de obra\s*[—–-]?\s*/i, "").trim() || "Mão de obra";
  n = n.charAt(0).toUpperCase() + n.slice(1);
  return n;
}

/** Entradas do mês 'aaaa-mm', opcionalmente só até o dia `ateDia` (para comparar mês corrente com o mesmo trecho do anterior). */
export function recebimentosDoMes(receipts: GReceipt[], mes: string, ateDia = 31) {
  return receipts.filter(r => { const k = diaRec(r); return k.slice(0, 7) === mes && Number(k.slice(8, 10)) <= ateDia; });
}

export function mesDados(receipts: GReceipt[], orders: Map<string, GOrder>, qmap: Map<string, GQuote>, mes: string, ateDia = 31): MesDados {
  const recs = recebimentosDoMes(receipts, mes, ateDia);
  let fat = 0, fatOS = 0, nOS = 0, fantasma = 0, pecas = 0, mao = 0, d = 0, nd = 0, desc = 0, descN = 0;
  const serv: Record<string, { n: string; q: number; v: number }> = {};
  const tipos: Record<string, number> = { servico: 0, manutencao: 0, garantia: 0 };
  for (const r of recs) {
    fat += Number(r.total);
    if (!r.service_order_id) { fantasma += Number(r.total); continue; }
    fatOS += Number(r.total); nOS++;
    if (Number(r.difference) < 0) { desc -= Number(r.difference); descN++; }
    const o = orders.get(r.service_order_id);
    if (o) {
      tipos[o.entry_type] = (tipos[o.entry_type] || 0) + 1;
      if (o.exited_at) { d += dias(o); nd++; }
    }
    const q = qmap.get(r.service_order_id);
    if (!q) continue;
    for (const i of q.items) {
      const v = Number(i.qty || 0) * Number(i.unit_price || 0);
      if (i.kind === "peca") pecas += v;
      else {
        mao += v;
        const n = nomeServico(i.description), k = n.toLowerCase();
        serv[k] = serv[k] || { n, q: 0, v: 0 };
        serv[k].q++; serv[k].v += v;
      }
    }
  }
  return {
    n: nOS, fat: round2(fat), pecas: round2(pecas), mao: round2(mao),
    ticket: nOS ? fatOS / nOS : 0, tempo: nd ? d / nd : 0, desc: round2(desc), descN, fantasma: round2(fantasma),
    serv: Object.values(serv).sort((a, b) => b.q - a.q || b.v - a.v), tipos,
  };
}

/** Todos os dias do mês com o recebido no dia e o acumulado. */
export function serieMes(receipts: GReceipt[], mes: string): DiaMes[] {
  const n = diasNoMes(mes);
  const out: DiaMes[] = [];
  let acc = 0;
  for (let d = 1; d <= n; d++) {
    const k = `${mes}-${String(d).padStart(2, "0")}`;
    const rs = receipts.filter(r => diaRec(r) === k);
    const v = round2(rs.reduce((a, r) => a + Number(r.total), 0));
    acc = round2(acc + v);
    out.push({ k, d, v, n: rs.filter(r => r.service_order_id).length, acc });
  }
  return out;
}

/** Variação percentual inteira; null = sem base. */
export const variacao = (a: number, b: number) => (b ? Math.round((a - b) / b * 100) : null);

export function computeGestao(input: {
  /** O.S. no pátio + O.S. das entradas */
  orders: GOrder[]; receipts: GReceipt[]; quotes: GQuote[]; techs: GTech[]; commissionPct: number; mes: string; hoje: string;
  /** contagem de orçamentos decididos (todos os tempos); se omitido, conta a partir de `quotes` */
  decididos?: { aprovados: number; recusados: number };
}): GestaoData {
  const { orders, receipts, quotes, techs, commissionPct, mes, hoje, decididos } = input;
  const qmap = quoteByOrder(quotes);
  const byId = new Map(orders.map(o => [o.id, o]));
  const ant = addMonth(mes, -1);
  // mês corrente: compara com o mês anterior até o mesmo dia; mês passado: meses inteiros
  const ateDia = mes === hoje.slice(0, 7) ? Number(hoje.slice(8, 10)) : diasNoMes(mes);
  const M = mesDados(receipts, byId, qmap, mes);
  const P = mesDados(receipts, byId, qmap, ant, mes === hoje.slice(0, 7) ? ateDia : 31);
  const cur = serieMes(receipts, mes), prev = serieMes(receipts, ant);
  const tot = (o: GOrder) => (qmap.has(o.id) ? quoteTotal(qmap.get(o.id)!) : 0);

  // operação atual (independe do mês)
  const patio = orders.filter(o => o.status !== "finalizado");
  const aprov = patio.filter(o => o.status !== "orcamento");
  const aFat = round2(aprov.reduce((a, o) => a + tot(o), 0));
  const nAprov = decididos ? decididos.aprovados : quotes.filter(q => q.status === "aprovado").length;
  const nDec = nAprov + (decididos ? decididos.recusados : quotes.filter(q => q.status === "recusado").length);
  const taxa = nDec ? Math.round(nAprov / nDec * 100) : 0;

  // por mecânico: entradas do mês pelo responsável da O.S.
  const recMes = recebimentosDoMes(receipts, mes).filter(r => r.service_order_id);   // fantasma não tem mecânico
  const tecDe = (r: GReceipt) => byId.get(r.service_order_id!)?.technician_id ?? null;
  const nome = new Map(techs.map(t => [t.id, t.name]));
  const ids = new Set<string | null>([
    ...techs.filter(t => t.active).map(t => t.id),
    ...recMes.map(tecDe), ...patio.map(o => o.technician_id),
  ]);
  const mec: MecCard[] = [...ids].map(id => {
    const f = recMes.filter(r => tecDe(r) === id);
    const fat = round2(f.reduce((a, r) => a + Number(r.total), 0));
    const mao = round2(f.reduce((a, r) => a + (qmap.has(r.service_order_id!) ? itemsSum(qmap.get(r.service_order_id!)!, "mao") : 0), 0));
    const os = f.map(r => byId.get(r.service_order_id!)).filter((o): o is GOrder => !!o?.exited_at);
    const ag = patio.filter(o => o.technician_id === id);
    return {
      id, n: id ? nome.get(id) ?? "—" : "", q: f.length, fat, mao,
      ticket: f.length ? fat / f.length : 0, tempo: os.length ? os.reduce((a, o) => a + dias(o), 0) / os.length : 0,
      ag: ag.length, agS: ag.filter(o => o.status === "servico").length,
      com: round2(mao * commissionPct / 100),
    };
  }).filter(x => (x.id ? true : x.q > 0)).sort((a, b) => b.fat - a.fat);
  const totMec = Math.max(1, mec.reduce((a, x) => a + x.fat, 0));

  return { mes, ant, M, P, ateDia, cur, prev, aFat, aFatN: aprov.length, taxa, decN: nDec, mec, totMec };
}

// ---------------------------------------------------------------------------
// "Precisa de atenção": o que cobrar hoje (independe do mês exibido)

export interface Atencao {
  rascunho: { n: number; v: number };
  /** orçamentos enviados sem resposta; `dias` = há quantos dias espera o mais antigo */
  enviado: { n: number; v: number; dias: number };
  parados: number;
  entrega: { n: number; v: number };
  vencidas: { n: number; v: number };
}

export function computeAtencao(input: {
  /** orçamentos em rascunho/enviado, com a situação da O.S. (null = sem O.S.) */
  quotes: (GQuote & { os_status: string | null })[];
  /** quando cada O.S. teve o orçamento enviado pelo WhatsApp (último registro no histórico) */
  enviadoEm: Map<string, string>;
  board: { status: string; status_since: string; total: number }[];
  vencidas: { amount: number }[];
  agora?: Date;
}): Atencao {
  const agora = (input.agora ?? new Date()).getTime();
  // orçamento de O.S. já finalizada não espera mais nada
  const qs = input.quotes.filter(q => q.os_status !== "finalizado");
  const ras = qs.filter(q => q.status === "rascunho"), env = qs.filter(q => q.status === "enviado");
  const desde = env.map(q => (q.service_order_id && input.enviadoEm.get(q.service_order_id)) || q.created_at);
  const maisAntigo = desde.length ? Math.min(...desde.map(s => new Date(s).getTime())) : agora;
  const pat = input.board.filter(b => b.status !== "finalizado");
  const ent = pat.filter(b => b.status === "entrega");
  return {
    rascunho: { n: ras.length, v: round2(ras.reduce((a, q) => a + quoteTotal(q), 0)) },
    enviado: { n: env.length, v: round2(env.reduce((a, q) => a + quoteTotal(q), 0)), dias: Math.max(0, Math.floor((agora - maisAntigo) / 864e5)) },
    parados: pat.filter(b => (agora - new Date(b.status_since).getTime()) / 864e5 >= 3).length,
    entrega: { n: ent.length, v: round2(ent.reduce((a, b) => a + Number(b.total || 0), 0)) },
    vencidas: { n: input.vencidas.length, v: round2(input.vencidas.reduce((a, e) => a + Number(e.amount), 0)) },
  };
}
