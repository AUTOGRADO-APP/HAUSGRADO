import { createClient } from "@/lib/supabase/server.ts";
import type { SupplierRow } from "@/lib/fin-b.ts";
import { Fornecedores, type FornStats } from "./Fornecedores.tsx";

export const dynamic = "force-dynamic";

export default async function FornecedoresPage() {
  const sb = await createClient();
  const [{ data: sups, error }, { data: purch }] = await Promise.all([
    sb.from("suppliers").select("id, name, salesperson, salesperson_phone, pix_key").order("name"),
    sb.from("purchases").select("supplier_id, freight, paid, purchase_items(qty, unit_cost)"),
  ]);
  const stats: Record<string, FornStats> = {};
  for (const p of (purch ?? []) as { supplier_id: string; freight: number; paid: boolean; purchase_items: { qty: number; unit_cost: number }[] }[]) {
    const tot = (p.purchase_items ?? []).reduce((a, i) => a + Number(i.qty) * Number(i.unit_cost), 0) + Number(p.freight || 0);
    const s = stats[p.supplier_id] ?? (stats[p.supplier_id] = { n: 0, tot: 0, aberto: 0 });
    s.n++; s.tot += tot; if (!p.paid) s.aberto += tot;
  }
  return (
    <main id="view">
      {error && <div className="banner"><span>Erro ao carregar fornecedores: {error.message}</span></div>}
      <Fornecedores list={(sups ?? []) as SupplierRow[]} stats={stats} />
    </main>
  );
}
