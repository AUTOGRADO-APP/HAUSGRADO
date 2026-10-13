// Cálculos da página Gestão (seção 7.2 / 9 do CLAUDE.md). Puro: sem banco e sem React.
// Datas sempre no fuso de São Paulo (chaves 'aaaa-mm-dd' geradas com ymd()).
import { round2 } from "./rules.ts";
import { addDays, ymd } from "./labels.ts";

export interface GOrder {
  id: string; status: string; entry_type: string;
  entered_at: string; exited_at: string | null; technician_id: string | null;
}
export interface GQuoteItem { kind: "peca" | "mao"; description: string | null; qty: number; unit_price: number }
export interface GQuote {
  id: string; service_order_id: string | null; status: string; discount: number; created_at: string; items: GQuoteItem[];
}
export interface GTech { id: string; name: string; active: boolean }

export interface MesDados {
  n: number; fat: number; pecas: number; mao: number; ticket: number; tempo: number;
  serv: { n: string; q: number; v: number }[]; tipos: Record<string, number>;
}
export interface DiaSerie { k: string; v: number; n: number }
export interface MecCard {
  id: string | null; n: string; q: number; fat: number; mao: number; ticket: number; tempo: number; ag: number; agS: number; com: number;
}
export interface GestaoData {
  mes: string; ant: string; M: MesDados; P: MesDados;
  cur: DiaSerie[]; prev: DiaSerie[];
  aFat: number; aFatN: number; vAb: number; abN: number; taxa: number; decN: number;
  mec: MecCard[]; totMec: number;
}

const itemsSum = (q: GQuote, kind?: "peca" | "mao") =>
  q.items.filter(i => !kind || i.kind === kind).reduce((s, i) => s + Number(i.qty || 0) * Number(i.unit_price || 0), 0);
export const quoteTotal = (q: GQuote) => round2(itemsSum(q) - Number(q.discount || 0));

/** Orçamento que vale para a O.S.: o mais recente não recusado (mesma regra de os_total() no banco). */
export function quoteByOrder(quotes: GQuote[]): Map<string, GQuote> {
  const m = new Map<string, GQuote>();
  for (const q of quotes) {
    if (!q.service_order_id || q.status === "recusado") continue;
    const cur = m.get(q.service_order_id);
    if (!cur || q.created_at > cur.created_at) m.set(q.service_order_id, q);
  }
  return m;
}

/** 'aaaa-mm' do mês anterior/seguinte. */
export function addMonth(m: string, d: number) {
  const [y, mm] = m.split("-").map(Number);
  const t = y * 12 + (mm - 1) + d;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
}

const dias = (o: GOrder) => (new Date(o.exited_at!).getTime() - new Date(o.entered_at).getTime()) / 864e5;
const exitKey = (o: GOrder) => (o.exited_at ? ymd(new Date(o.exited_at)) : "");
const finalizadas = (orders: GOrder[]) => orders.filter(o => o.status === "finalizado" && o.exited_at);

/** Nome do serviço para o ranking: sem o prefixo "Mão de obra — ". */
export function nomeServico(desc: string | null) {
  let n = String(desc || "Mão de obra").replace(/^m[ãa]o de obra\s*[—–-]?\s*/i, "").trim() || "Mão de obra";
  n = n.charAt(0).toUpperCase() + n.slice(1);
  return n;
}

export function mesDados(orders: GOrder[], qmap: Map<string, GQuote>, mes: string): MesDados {
  const fin = finalizadas(orders).filter(o => exitKey(o).slice(0, 7) === mes);
  let fat = 0, pecas = 0, mao = 0, d = 0;
  const serv: Record<string, { n: string; q: number; v: number }> = {};
  const tipos: Record<string, number> = { servico: 0, manutencao: 0, garantia: 0 };
  for (const o of fin) {
    tipos[o.entry_type] = (tipos[o.entry_type] || 0) + 1;
    d += dias(o);
    const q = qmap.get(o.id);
    if (!q) continue;
    fat += quoteTotal(q);
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
    n: fin.length, fat: round2(fat), pecas: round2(pecas), mao: round2(mao),
    ticket: fin.length ? fat / fin.length : 0, tempo: fin.length ? d / fin.length : 0,
    serv: Object.values(serv).sort((a, b) => b.q - a.q || b.v - a.v), tipos,
  };
}

/** 7 dias terminando em hoje − fimOff dias. */
export function serieDias(orders: GOrder[], qmap: Map<string, GQuote>, hoje: string, fimOff: number): DiaSerie[] {
  const fin = finalizadas(orders);
  const out: DiaSerie[] = [];
  for (let i = 6; i >= 0; i--) {
    const k = addDays(hoje, -i - fimOff);
    const os = fin.filter(o => exitKey(o) === k);
    out.push({ k, v: round2(os.reduce((a, o) => a + (qmap.has(o.id) ? quoteTotal(qmap.get(o.id)!) : 0), 0)), n: os.length });
  }
  return out;
}

/** Variação percentual inteira; null = sem base. */
export const variacao = (a: number, b: number) => (b ? Math.round((a - b) / b * 100) : null);

export function computeGestao(input: {
  orders: GOrder[]; quotes: GQuote[]; techs: GTech[]; commissionPct: number; mes: string; hoje: string;
  /** contagem de orçamentos decididos (todos os tempos); se omitido, conta a partir de `quotes` */
  decididos?: { aprovados: number; recusados: number };
}): GestaoData {
  const { orders, quotes, techs, commissionPct, mes, hoje, decididos } = input;
  const qmap = quoteByOrder(quotes);
  const ant = addMonth(mes, -1);
  const M = mesDados(orders, qmap, mes), P = mesDados(orders, qmap, ant);
  const cur = serieDias(orders, qmap, hoje, 0), prev = serieDias(orders, qmap, hoje, 7);
  const tot = (o: GOrder) => (qmap.has(o.id) ? quoteTotal(qmap.get(o.id)!) : 0);

  // operação atual (independe do mês)
  const patio = orders.filter(o => o.status !== "finalizado");
  const aprov = patio.filter(o => o.status !== "orcamento");
  const aFat = round2(aprov.reduce((a, o) => a + tot(o), 0));
  const abertos = quotes.filter(q => q.status === "enviado" || q.status === "rascunho");
  const vAb = round2(abertos.reduce((a, q) => a + quoteTotal(q), 0));
  const nAprov = decididos ? decididos.aprovados : quotes.filter(q => q.status === "aprovado").length;
  const nDec = nAprov + (decididos ? decididos.recusados : quotes.filter(q => q.status === "recusado").length);
  const taxa = nDec ? Math.round(nAprov / nDec * 100) : 0;

  // por mecânico
  const finMes = finalizadas(orders).filter(o => exitKey(o).slice(0, 7) === mes);
  const nome = new Map(techs.map(t => [t.id, t.name]));
  const ids = new Set<string | null>([
    ...techs.filter(t => t.active).map(t => t.id),
    ...finMes.map(o => o.technician_id), ...patio.map(o => o.technician_id),
  ]);
  const mec: MecCard[] = [...ids].map(id => {
    const f = finMes.filter(o => o.technician_id === id);
    const fat = round2(f.reduce((a, o) => a + tot(o), 0));
    const mao = round2(f.reduce((a, o) => a + (qmap.has(o.id) ? itemsSum(qmap.get(o.id)!, "mao") : 0), 0));
    const d = f.reduce((a, o) => a + dias(o), 0);
    const ag = patio.filter(o => o.technician_id === id);
    return {
      id, n: id ? nome.get(id) ?? "—" : "", q: f.length, fat, mao,
      ticket: f.length ? fat / f.length : 0, tempo: f.length ? d / f.length : 0,
      ag: ag.length, agS: ag.filter(o => o.status === "servico").length,
      com: round2(mao * commissionPct / 100),
    };
  }).filter(x => (x.id ? true : x.q > 0)).sort((a, b) => b.fat - a.fat);
  const totMec = Math.max(1, mec.reduce((a, x) => a + x.fat, 0));

  return { mes, ant, M, P, cur, prev, aFat, aFatN: aprov.length, vAb, abN: abertos.length, taxa, decN: nDec, mec, totMec };
}
