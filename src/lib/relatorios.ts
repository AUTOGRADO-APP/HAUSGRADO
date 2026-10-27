// Relatórios do estoque (botão Relatórios em Produtos): contas puras, usadas pela página do PDF e pelos testes.
import { addDays, ymd } from "./labels.ts";

export type TipoRel = "todos" | "categoria" | "valor" | "vendidos" | "abc";
export const TIPOS_REL: { k: TipoRel; l: string; d: string; vendas?: boolean; office?: boolean }[] = [
  { k: "todos", l: "Todos os produtos", d: "Lista completa em ordem alfabética, com estoque e preço." },
  { k: "categoria", l: "Por categoria", d: "Produtos agrupados por categoria, com o total de cada grupo." },
  { k: "valor", l: "Valor do estoque", d: "Quanto o estoque vale a preço de custo e a preço de venda.", office: true },
  { k: "vendidos", l: "Mais vendidos", d: "Ranking das peças cadastradas vendidas nas O.S. finalizadas.", vendas: true, office: true },
  { k: "abc", l: "Curva ABC", d: "Classifica as peças pelo faturamento: A (80%), B (15%) e C (5%).", vendas: true, office: true },
];

export const PERIODOS_REL: [string, string][] = [["30", "Últimos 30 dias"], ["90", "Últimos 90 dias"], ["180", "Últimos 6 meses"], ["365", "Últimos 12 meses"], ["ano", "Este ano"], ["livre", "De / até"]];

/** Período em 'aaaa-mm-dd' (inclusivo) a partir do atalho; "livre" usa de/até informados. */
export function periodoRel(p: string, de?: string, ate?: string, hoje: string = ymd()): { de: string; ate: string } {
  if (p === "ano") return { de: hoje.slice(0, 4) + "-01-01", ate: hoje };
  if (p === "livre" && de && ate) return de <= ate ? { de, ate } : { de: ate, ate: de };
  const n = Number(p) > 0 ? Number(p) : 90;
  return { de: addDays(hoje, -(n - 1)), ate: hoje };
}

export interface ProdRel { id: string; name: string; category: string; stock_qty: number; cost: number; price: number }

/** Valor do estoque: só saldo positivo entra na conta (estoque negativo vale 0 e é contado à parte). */
export function valorEstoque(rows: ProdRel[]) {
  const r2 = (x: number) => Math.round(x * 100) / 100;
  let custo = 0, venda = 0, unid = 0, neg = 0;
  const linhas = rows.map(p => {
    const q = Math.max(0, Number(p.stock_qty) || 0);
    if ((Number(p.stock_qty) || 0) < 0) neg++;
    const c = r2(q * (Number(p.cost) || 0)), v = r2(q * (Number(p.price) || 0));
    custo += c; venda += v; unid += q;
    return { ...p, q, vCusto: c, vVenda: v };
  });
  custo = r2(custo); venda = r2(venda);
  return { linhas, custo, venda, lucro: r2(venda - custo), markup: custo ? Math.round(((venda - custo) / custo) * 100) : null, unid: r2(unid), neg };
}

export interface ItemVenda { product_id: string; qty: number; unit_price: number; unit_cost?: number | null; os_id: string }
export interface Vendido { product_id: string; qty: number; valor: number; custo: number; os: number }

/** Soma as peças vendidas por produto, do maior faturamento para o menor (empate: quantidade). */
export function somaVendas(itens: ItemVenda[]): Vendido[] {
  const m = new Map<string, Vendido & { set: Set<string> }>();
  for (const i of itens) {
    const q = Number(i.qty) || 0;
    if (!i.product_id || q <= 0) continue;
    const a = m.get(i.product_id) ?? { product_id: i.product_id, qty: 0, valor: 0, custo: 0, os: 0, set: new Set<string>() };
    a.qty += q; a.valor += q * (Number(i.unit_price) || 0); a.custo += q * (Number(i.unit_cost) || 0); a.set.add(i.os_id);
    m.set(i.product_id, a);
  }
  return [...m.values()].map(({ set, ...a }) => ({ ...a, qty: Math.round(a.qty * 100) / 100, valor: Math.round(a.valor * 100) / 100, custo: Math.round(a.custo * 100) / 100, os: set.size }))
    .sort((a, b) => b.valor - a.valor || b.qty - a.qty);
}

export type Classe = "A" | "B" | "C";
/** Curva ABC pelo faturamento: A até 80% do acumulado, B até 95%, C o resto.
 *  O item que cruza a linha fica na classe de cima (o primeiro item é sempre A). */
export function curvaABC<T extends { valor: number }>(lista: T[]): (T & { pct: number; acum: number; classe: Classe })[] {
  const ord = [...lista].sort((a, b) => b.valor - a.valor);
  const tot = ord.reduce((s, x) => s + x.valor, 0);
  let acum = 0;
  return ord.map(x => {
    const antes = tot ? acum / tot : 0;
    acum += x.valor;
    const pct = tot ? (x.valor / tot) * 100 : 0;
    const classe: Classe = antes < 0.8 ? "A" : antes < 0.95 ? "B" : "C";
    return { ...x, pct, acum: tot ? (acum / tot) * 100 : 0, classe };
  });
}

/** Orçamento ativo da O.S. (mesma regra de os_quote() no banco): o aprovado; senão o mais recente não recusado. */
export function orcAtivo<Q extends { id: string; service_order_id: string | null; status: string; created_at: string }>(quotes: Q[]): Map<string, string> {
  const m = new Map<string, Q>();
  for (const q of quotes) {
    if (!q.service_order_id || q.status === "recusado") continue;
    const a = m.get(q.service_order_id);
    const melhor = !a || (q.status === "aprovado") > (a.status === "aprovado") || ((q.status === "aprovado") === (a.status === "aprovado") && q.created_at > a.created_at);
    if (melhor) m.set(q.service_order_id, q);
  }
  return new Map([...m].map(([os, q]) => [os, q.id]));
}
