// Regras de negócio puras (sem banco, sem React) — usadas na tela para PRÉ-VISUALIZAR.
// A palavra final é sempre do banco (supabase/migrations/*_logic.sql). Se mudar aqui, mude lá também.

export type Status = "orcamento" | "aprovado" | "pecas" | "servico" | "entrega" | "finalizado";
export type Role = "master" | "admin" | "atendente" | "mecanico";
export type PayMethod = "dinheiro" | "credito" | "debito" | "pix";

export const STATUSES: { id: Status; label: string }[] = [
  { id: "orcamento", label: "Orçamento" },
  { id: "aprovado", label: "Aprovado" },
  { id: "pecas", label: "Aguardando peças" },
  { id: "servico", label: "Em serviço" },
  { id: "entrega", label: "Esperando entrega" },
  { id: "finalizado", label: "Finalizado" },
];

export const DEFAULT_CREDIT_FEES = [3.19, 4.59, 5.29, 5.99, 6.69, 7.39, 8.09, 8.79, 9.49, 10.19, 10.89, 11.59];

/** Arredonda para centavos sem erro de ponto flutuante (ex.: 1.005 → 1.01). */
export const round2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

const brlFmt = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
/** "R$ 1.234,50" (com espaço normal, não o espaço especial do Intl). */
export const brl = (v: number) => brlFmt.format(v).replace(/ /g, " ");

/** Placa Mercosul ou antiga, só letras/números, maiúscula. Retorna null se inválida. */
export function normalizePlate(input: string): string | null {
  const p = input.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(p) ? p : null;
}

/** Celular/telefone só com dígitos e DDD (10 ou 11). Aceita +55 na frente. */
export function normalizePhone(input: string): string | null {
  let d = input.replace(/\D/g, "");
  if (d.length > 11 && d.startsWith("55")) d = d.slice(2);
  return /^[0-9]{10,11}$/.test(d) ? d : null;
}

/** (61) 99123-4567 */
export function formatPhone(d: string): string {
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return d;
}

/** CEP: 8 dígitos; formata 70040-010. */
export const normalizeCep = (input: string) => { const d = input.replace(/\D/g, ""); return d.length === 8 ? d : null; };
export const formatCep = (d: string) => (d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : d);

export interface QuoteItem { kind: "peca" | "mao"; qty: number; unit_price: number }
export function quoteTotals(items: QuoteItem[], discount = 0) {
  const pecas = round2(items.filter(i => i.kind === "peca").reduce((s, i) => s + i.qty * i.unit_price, 0));
  const mao = round2(items.filter(i => i.kind === "mao").reduce((s, i) => s + i.qty * i.unit_price, 0));
  const subtotal = round2(pecas + mao);
  return { pecas, mao, subtotal, discount: round2(discount), total: round2(subtotal - discount) };
}

/** Margem do orçamento = acréscimo sobre o CUSTO (markup): preço = custo × (1 + margem). 40% sobre R$ 100 = R$ 140.
 *  Mesma conta de public.min_part_price() no banco: custo × (1 + mínimo), arredondado PARA CIMA no centavo. */
export const minPartPrice = (cost: number, minPct: number): number => (minPct > 0 ? priceFromMargin(cost, minPct) ?? 0 : 0);
/** Preço a partir do custo e da margem (%) sobre o custo, arredondado para cima no centavo. null = margem abaixo de −100%. */
export function priceFromMargin(cost: number, marginPct: number): number | null {
  if (!(marginPct >= -100) || !Number.isFinite(marginPct)) return null;
  const cents = Math.round((Number(cost) || 0) * 100), bp = Math.round(marginPct * 100); // inteiros: sem erro de ponto flutuante
  return Math.max(0, Math.ceil((cents * (10000 + bp)) / 10000 - 1e-9)) / 100;
}
/** Margem (%) com uma casa: (preço − custo) ÷ custo. null quando não há custo. */
export const marginOf = (cost: number, price: number) => (cost > 0 ? Math.round(((price - cost) / cost) * 1000) / 10 : null);
/** A peça respeita a margem mínima? Mão de obra e peça a R$ 0 (garantia) não entram na regra. */
export const partPriceOk = (i: { kind: "peca" | "mao"; unit_price: number; unit_cost: number }, minPct: number) =>
  i.kind !== "peca" || !(i.unit_price > 0) || i.unit_price >= minPartPrice(i.unit_cost, minPct);

/** Linha de orçamento em branco (sem descrição e sem valor): não aparece para o cliente nem nos documentos. */
export const isBlankItem = (i: { description?: string | null; unit_price: number }) => !(i.description ?? "").trim() && !Number(i.unit_price);

export interface ShopFees { fee_debit_pct: number; fee_pix_pct: number; fee_credit_pct: number[] }
export interface Payment { method: PayMethod; amount: number; installments?: number }

/** Taxa (%) de uma forma de pagamento; crédito depende do número de parcelas (1..12). */
export function feePct(p: Payment, fees: ShopFees): number {
  switch (p.method) {
    case "debito": return fees.fee_debit_pct;
    case "pix": return fees.fee_pix_pct;
    case "credito": {
      const n = Math.min(12, Math.max(1, Math.trunc(p.installments ?? 1)));
      return fees.fee_credit_pct[n - 1] ?? 0;
    }
    default: return 0;
  }
}

/** Resumo do popup de pagamento: quanto falta/sobra, taxas e se pode finalizar. */
export function paymentSummary(total: number, payments: Payment[], fees: ShopFees, discountAuthorized = false) {
  const valid = payments.filter(p => p.amount > 0);
  const received = round2(valid.reduce((s, p) => s + p.amount, 0));
  const diff = round2(received - total);
  const fee = round2(valid.reduce((s, p) => s + round2(p.amount * feePct(p, fees) / 100), 0));
  const short = diff < 0;
  return {
    received, diff, fee, net: round2(received - fee),
    missing: short ? -diff : 0,
    change: diff > 0 ? diff : 0,                       // troco (dinheiro a mais)
    canFinalize: total <= 0 || (received > 0 && (!short || discountAuthorized)),
    needsPassword: short && received > 0,
  };
}

/** Comissão = % sobre a mão de obra (padrão 5%). */
export const commission = (laborTotal: number, pct = 5) => round2(laborTotal * pct / 100);

/** Dias inteiros entre duas datas (para o alerta "parado há X dias"). */
export const daysBetween = (from: Date, to: Date = new Date()) => Math.floor((to.getTime() - from.getTime()) / 864e5);

/** Carro parado no mesmo status há 3 dias ou mais (exceto finalizado). */
export const isStale = (status: Status, lastChange: Date, now = new Date()) => status !== "finalizado" && daysBetween(lastChange, now) >= 3;

/** Coluna "Finalizado" do quadro mostra só O.S. que saíram nos últimos 3 dias. */
export const showOnBoard = (status: Status, exitedAt: Date | null, now = new Date()) =>
  status !== "finalizado" || (exitedAt !== null && daysBetween(exitedAt, now) <= 3);

/** Login por usuário: "Master " → "master@dominio". */
export function usernameToEmail(username: string, domain: string): string | null {
  const u = username.trim().toLowerCase();
  return /^[a-z0-9._-]{3,}$/.test(u) ? `${u}@${domain}` : null;
}

/** Link de WhatsApp com mensagem pronta. */
export const whatsappLink = (phoneDigits: string, text: string) => `https://wa.me/55${phoneDigits}?text=${encodeURIComponent(text)}`;
