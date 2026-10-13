import { createClient } from "@/lib/supabase/server.ts";
import type { ShellBill } from "@/lib/types.ts";
import { FinCal } from "./FinCal.tsx";

export const dynamic = "force-dynamic";

export default async function CalendarioFinanceiroPage() {
  const sb = await createClient();
  // Compras, despesas e comissões pagas. Taxas de cartão/pix ficam só em Despesas.
  const { data, error } = await sb.from("expenses")
    .select("id, description, category, amount, due_date, payment_code, paid, paid_on, source, purchase_id")
    .in("source", ["manual", "purchase", "commission"])
    .order("due_date");
  const list: ShellBill[] = ((data ?? []) as ShellBill[]).map(d => ({ ...d, amount: Number(d.amount) }));
  return (
    <>
      {error && <div className="banner"><span>Erro ao carregar o calendário financeiro: {error.message}</span></div>}
      <FinCal initial={list} />
    </>
  );
}
