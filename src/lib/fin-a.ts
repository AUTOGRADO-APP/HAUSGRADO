// Auxiliares das telas Calendário, Entradas, Comissões e Calendário financeiro.
import { ymd } from "./labels.ts";

/** Valor curto para a grade do calendário financeiro ("R$ 370", "R$ 1,2 mil"). */
export const brlK = (v: number) => (v >= 1000 ? `R$ ${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil` : `R$ ${Math.round(v)}`);

/** Data 'aaaa-mm-dd' dentro do intervalo [de, até] (vazio = sem limite). */
export const naFaixa = (d: string, de: string, ate: string) => (!de || d >= de) && (!ate || d <= ate);

/** Dia (São Paulo) de um timestamp ISO. */
export const diaDe = (iso: string | null | undefined) => (iso ? ymd(new Date(iso)) : "");

export interface CalCell { k: string; day: number; out: boolean; month: number }
/** Células da grade mensal (Dom–Sáb), mês 0–11. */
export function monthCells(ano: number, mes: number): CalCell[] {
  const first = new Date(Date.UTC(ano, mes, 1, 12));
  const dow = first.getUTCDay();
  const lastDate = new Date(Date.UTC(ano, mes + 1, 0, 12)).getUTCDate();
  const weeks = Math.ceil((dow + lastDate) / 7);
  const out: CalCell[] = [];
  for (let i = 0; i < weeks * 7; i++) {
    const d = new Date(Date.UTC(ano, mes, 1 - dow + i, 12));
    out.push({ k: d.toISOString().slice(0, 10), day: d.getUTCDate(), out: d.getUTCMonth() !== mes, month: d.getUTCMonth() });
  }
  return out;
}

/** Ano/mês (0–11) de 'aaaa-mm-dd'. */
export const anoMes = (k: string) => { const [y, m] = k.split("-").map(Number); return { ano: y, mes: m - 1 }; };
/** Soma meses a (ano, mês). */
export const moveMes = (ano: number, mes: number, d: number) => { const t = new Date(Date.UTC(ano, mes + d, 1)); return { ano: t.getUTCFullYear(), mes: t.getUTCMonth() }; };

/** "Segunda-feira, 13 de outubro" a partir de 'aaaa-mm-dd'. */
export const tituloDia = (k: string) =>
  new Date(k + "T12:00:00Z").toLocaleDateString("pt-BR", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" }).replace(/^./, c => c.toUpperCase());

export const DOW = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
