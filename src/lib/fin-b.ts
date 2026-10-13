// Regras de Compras, Despesas e Fornecedores (portadas do protótipo: compraSit, despSit, allDespesas, brlK).
import { round2 } from "./rules.ts";
import { ymd } from "./labels.ts";

export interface PurchaseItemRow { id?: string; description: string; qty: number; unit_cost: number; product_id: string | null; sku: string | null; position?: number }
export interface PurchaseRow {
  id: string; supplier_id: string; invoice_number: string | null; purchased_on: string; received_on: string | null;
  freight: number; notes: string | null; payment_method: string; payment_code: string | null; due_date: string | null;
  paid: boolean; paid_on: string | null; supplier_name: string; items: PurchaseItemRow[];
}
export interface SupplierRow { id: string; name: string; salesperson: string | null; salesperson_phone: string | null; pix_key: string | null }
export interface ExpenseRow {
  id: string; description: string | null; category: string; amount: number; due_date: string; payment_code: string | null;
  paid: boolean; paid_on: string | null; source: "manual" | "purchase" | "fee" | "commission"; purchase_id: string | null;
  pay_method?: string | null; invoice?: string | null; supplier?: string | null;
}

export const itemsSubtotal = (items: { qty: number | string; unit_cost: number | string }[]) =>
  round2(items.reduce((a, i) => a + (Number(i.qty) || 0) * (Number(i.unit_cost) || 0), 0));
/** Total da compra = Σ(qtd × custo) + frete */
export const purchaseTotal = (p: { items: { qty: number | string; unit_cost: number | string }[]; freight: number | string }) =>
  round2(itemsSubtotal(p.items) + (Number(p.freight) || 0));

export type Sit = { k: "pago" | "vencido" | "pendente"; l: string; cls: "ok" | "bad" | "warn" };
/** Situação da compra: pago → Pago; vencimento < hoje → Vencido; senão Pendente */
export function compraSit(c: { paid: boolean; due_date: string | null }, hoje = ymd()): Sit {
  if (c.paid) return { k: "pago", l: "Pago", cls: "ok" };
  if (c.due_date && c.due_date < hoje) return { k: "vencido", l: "Vencido", cls: "bad" };
  return { k: "pendente", l: "Pendente", cls: "warn" };
}
/** Situação de qualquer despesa */
export function despSit(d: { paid: boolean; due_date: string }, hoje = ymd()): Sit {
  if (d.paid) return { k: "pago", l: "Pago", cls: "ok" };
  if (d.due_date < hoje) return { k: "vencido", l: "Vencido", cls: "bad" };
  return { k: "pendente", l: "Pendente", cls: "warn" };
}

/** "R$ 1,2 mil" / "R$ 370" */
export const brlK = (v: number) => v >= 1000 ? `R$ ${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil` : `R$ ${Math.round(v)}`;

export const naFaixa = (d: string, de: string, ate: string) => (!de || d >= de) && (!ate || d <= ate);

/** Mesma data em N meses (dia limitado ao último dia do mês), 'aaaa-mm-dd' */
export function addMonths(k: string, n: number) {
  const [y, m, d] = k.split("-").map(Number);
  const last = new Date(Date.UTC(y, m - 1 + n + 1, 0)).getUTCDate();
  const dt = new Date(Date.UTC(y, m - 1 + n, Math.min(d, last)));
  return dt.toISOString().slice(0, 10);
}

/** select padrão de compras (com fornecedor e itens) */
export const PURCHASE_SELECT = "id, supplier_id, invoice_number, purchased_on, received_on, freight, notes, payment_method, payment_code, due_date, paid, paid_on, supplier:suppliers(name), purchase_items(id, description, qty, unit_cost, product_id, sku, position)";
export type PurchaseRaw = Omit<PurchaseRow, "supplier_name" | "items"> & { supplier: { name: string } | null; purchase_items: PurchaseItemRow[] | null };
export function toPurchase(r: PurchaseRaw): PurchaseRow {
  const { supplier, purchase_items, ...p } = r;
  return {
    ...p, freight: Number(p.freight), supplier_name: supplier?.name ?? "—",
    items: [...(purchase_items ?? [])].sort((a, b) => (a.position ?? 0) - (b.position ?? 0)).map(i => ({ ...i, qty: Number(i.qty), unit_cost: Number(i.unit_cost) })),
  };
}
