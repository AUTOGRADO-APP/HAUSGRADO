import { createClient } from "@/lib/supabase/server.ts";
import { Comissoes, type ComRow } from "./Comissoes.tsx";

export const dynamic = "force-dynamic";

export default async function ComissoesPage() {
  const sb = await createClient();
  const [{ data, error }, { data: shop }] = await Promise.all([
    sb.from("v_commissions").select("service_order_id, number, plate, exited_at, technician_name, labor_total, commission, paid_at").not("exited_at", "is", null).order("exited_at", { ascending: false }),
    sb.from("shops").select("commission_pct").single(),
  ]);
  type Row = Omit<ComRow, "labor_total" | "commission"> & { labor_total: number | string; commission: number | string };
  // Sem mão de obra (sem orçamento, orçamento recusado ou só peças) não gera comissão
  const rows: ComRow[] = ((data ?? []) as Row[]).map(r => ({ ...r, labor_total: Number(r.labor_total), commission: Number(r.commission) })).filter(r => r.labor_total > 0);
  return (
    <>
      {error && <div className="banner"><span>Erro ao carregar as comissões: {error.message}</span></div>}
      <Comissoes rows={rows} pct={Number((shop as { commission_pct?: number } | null)?.commission_pct ?? 5)} />
    </>
  );
}
