// Metas de faturamento (Financeiro > Metas e painel da Gestão). Puro: sem banco e sem React.
// Faturamento = soma das entradas (receipts.total) recebidas no mês, como na página Entradas.
import { round2 } from "./rules.ts";

export interface Meta { month: string; goal: number; super_goal: number }
export type Nivel = "abaixo" | "meta" | "super";

/** Limites [início, fim) de um mês 'aaaa-mm' em São Paulo, para filtrar received_at. */
export function faixaMes(mes: string): [string, string] {
  const [y, m] = mes.split("-").map(Number);
  const ny = m === 12 ? y + 1 : y, nm = m === 12 ? 1 : m + 1;
  return [`${mes}-01T00:00:00-03:00`, `${ny}-${String(nm).padStart(2, "0")}-01T00:00:00-03:00`];
}

const diasNoMes = (mes: string) => { const [y, m] = mes.split("-").map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); };

/** Fim da escala do medidor: 20% além da super meta, para o ponteiro ter onde passar dela. */
export const escalaMax = (m: Pick<Meta, "goal" | "super_goal">) => Math.max(m.super_goal, m.goal) * 1.2;

/** Fração 0–1 da escala (o ponteiro para no fim se passar). */
export const fracao = (v: number, max: number) => (max > 0 ? Math.min(1, Math.max(0, v / max)) : 0);

export interface MetaStatus {
  nivel: Nivel; pctMeta: number; pctSuper: number; faltaMeta: number; faltaSuper: number;
  /** dias que ainda contam no mês, incluindo hoje (0 em mês passado) */
  diasRest: number; porDiaMeta: number; porDiaSuper: number;
  /** faturamento projetado no ritmo atual (só no mês corrente; mês passado = o próprio faturamento) */
  projecao: number;
}

export function metaStatus(fat: number, m: Pick<Meta, "goal" | "super_goal">, mes: string, hoje: string): MetaStatus {
  const nivel: Nivel = fat >= m.super_goal ? "super" : fat >= m.goal ? "meta" : "abaixo";
  const faltaMeta = round2(Math.max(0, m.goal - fat)), faltaSuper = round2(Math.max(0, m.super_goal - fat));
  const total = diasNoMes(mes), atual = hoje.slice(0, 7);
  const passados = mes < atual ? total : mes > atual ? 0 : Number(hoje.slice(8, 10));
  const diasRest = mes < atual ? 0 : mes > atual ? total : total - passados + 1;
  // ritmo: o que entrou até ontem dividido pelos dias já fechados (hoje ainda está acontecendo)
  const fechados = Math.max(1, passados - (mes === atual ? 1 : 0));
  const projecao = mes < atual ? fat : mes > atual ? 0 : round2(fat + (fat / fechados) * (total - fechados));
  return {
    nivel, faltaMeta, faltaSuper, diasRest,
    pctMeta: m.goal > 0 ? Math.round(fat / m.goal * 100) : 0,
    pctSuper: m.super_goal > 0 ? Math.round(fat / m.super_goal * 100) : 0,
    porDiaMeta: diasRest ? round2(faltaMeta / diasRest) : 0,
    porDiaSuper: diasRest ? round2(faltaSuper / diasRest) : 0,
    projecao,
  };
}

/** Validação do formulário; devolve a mensagem de erro ou null. */
export function metaErro(goal: number, superGoal: number): string | null {
  if (!(goal > 0)) return "Informe o valor da META";
  if (!(superGoal > 0)) return "Informe o valor da SUPER META";
  if (superGoal < goal) return "A SUPER META precisa ser maior ou igual à META";
  return null;
}
