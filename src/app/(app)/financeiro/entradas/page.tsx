import { createClient } from "@/lib/supabase/server.ts";
import { Entradas, type Rec } from "./Entradas.tsx";

export const dynamic = "force-dynamic";

export default async function EntradasPage() {
  const sb = await createClient();
  const { data, error } = await sb.from("receipts")
    .select("id, received_at, total, difference, service_order_id, receipt_payments(method, amount, installments, fee_pct), service_orders(number, plate, customers(name))")
    .order("received_at", { ascending: false });
  type One<T> = T | T[] | null;
  const one = <T,>(v: One<T>): T | null => (Array.isArray(v) ? v[0] ?? null : v);
  type Row = { id: string; received_at: string; total: number; difference: number; service_order_id: string;
    receipt_payments: { method: string; amount: number; installments: number; fee_pct: number }[] | null;
    service_orders: One<{ number: number; plate: string; customers: One<{ name: string }> }> };
  const list: Rec[] = ((data ?? []) as unknown as Row[]).map(r => {
    const o = one(r.service_orders);
    return {
      id: r.id, received_at: r.received_at, total: Number(r.total), difference: Number(r.difference), service_order_id: r.service_order_id,
      number: o?.number ?? null, plate: o?.plate ?? null, customer: one(o?.customers ?? null)?.name ?? null,
      pays: (r.receipt_payments ?? []).map(p => ({ method: p.method, amount: Number(p.amount), installments: p.installments, fee_pct: Number(p.fee_pct) })),
    };
  });
  return (
    <>
      {error && <div className="banner"><span>Erro ao carregar as entradas: {error.message}</span></div>}
      <Entradas list={list} />
    </>
  );
}
