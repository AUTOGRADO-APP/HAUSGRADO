import { createClient } from "@/lib/supabase/server.ts";
import type { ExpenseRow } from "@/lib/fin-b.ts";
import { CATDESP } from "@/lib/labels.ts";
import { Despesas } from "./Despesas.tsx";

export const dynamic = "force-dynamic";

type Raw = Omit<ExpenseRow, "pay_method" | "invoice" | "supplier"> & {
  purchase: { payment_method: string; invoice_number: string | null; supplier: { name: string } | null } | null;
};

export default async function DespesasPage({ searchParams }: { searchParams: Promise<{ edit?: string; cat?: string }> }) {
  const sp = await searchParams;
  const sb = await createClient();
  const { data, error } = await sb.from("expenses")
    .select("id, description, category, amount, due_date, payment_code, paid, paid_on, source, purchase_id, purchase:purchases(payment_method, invoice_number, supplier:suppliers(name))")
    .order("due_date", { ascending: false });
  const list: ExpenseRow[] = ((data ?? []) as unknown as Raw[]).map(({ purchase, ...e }) => ({
    ...e, amount: Number(e.amount),
    pay_method: purchase?.payment_method ?? null, invoice: purchase?.invoice_number ?? null, supplier: purchase?.supplier?.name ?? null,
  }));
  return (
    <main id="view">
      {error && <div className="banner"><span>Erro ao carregar despesas: {error.message}</span></div>}
      <Despesas list={list} editId={sp.edit ?? null} cat0={sp.cat && CATDESP.includes(sp.cat) ? sp.cat : ""} />
    </main>
  );
}
