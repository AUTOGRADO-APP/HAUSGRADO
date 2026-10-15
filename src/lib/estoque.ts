// Estoque dos produtos cadastrados (migration 20261015000000_stock). O saldo é do banco; aqui só a leitura da tela.

export interface Saldo { stock_qty: number; min_stock: number; reserved?: number; incoming?: number }

/** Quantidade sem zeros sobrando: 4 → "4", 1.5 → "1,5". */
export const qtdBR = (n: number | null | undefined) => {
  const v = Math.round((Number(n) || 0) * 100) / 100;
  return String(v).replace(".", ",");
};

/** Disponível = em estoque − reservado em orçamentos aprovados de carros no pátio. */
export const disponivel = (s: Saldo) => Math.round(((Number(s.stock_qty) || 0) - (Number(s.reserved) || 0)) * 100) / 100;

/** Estoque baixo: há mínimo definido e o saldo chegou nele (ou abaixo). */
export const estoqueBaixo = (s: Saldo) => (Number(s.min_stock) || 0) > 0 && (Number(s.stock_qty) || 0) <= (Number(s.min_stock) || 0);

/** Situação para o selo da lista: sem estoque (≤ 0), baixo ou ok. */
export function estoqueSit(s: Saldo): { k: "zero" | "baixo" | "ok"; l: string; cls: string } {
  if ((Number(s.stock_qty) || 0) <= 0) return { k: "zero", l: "Sem estoque", cls: "bad" };
  if (estoqueBaixo(s)) return { k: "baixo", l: "Estoque baixo", cls: "bad" };
  return { k: "ok", l: "OK", cls: "" };
}

/** Ajuste manual → quantidade com sinal enviada para adjust_stock().
 *  Inventário: contado − saldo atual. Entrada: +q. Saída: −q. */
export function deltaAjuste(modo: "inventario" | "entrada" | "saida", q: number, saldoAtual: number) {
  const r = (x: number) => Math.round(x * 100) / 100;
  if (modo === "inventario") return r(q - saldoAtual);
  return modo === "entrada" ? r(Math.abs(q)) : r(-Math.abs(q));
}

export const MOTIVOS_AJUSTE = ["Inventário (contagem)", "Perda / avaria", "Uso interno da oficina", "Devolução ao fornecedor", "Correção de lançamento", "Outro"];
