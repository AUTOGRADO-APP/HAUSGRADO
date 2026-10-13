import { createClient } from "@/lib/supabase/server.ts";
import { quoteTotals } from "@/lib/rules.ts";
import { ymd } from "@/lib/labels.ts";
import { Historico, type HistRow } from "./Historico.tsx";

export const dynamic = "force-dynamic";

interface OSDb {
  id: string; number: number; plate: string; make: string | null; model: string | null; entry_type: string;
  entered_at: string; exited_at: string | null; customers: { name: string } | null;
}
interface QDb {
  id: string; service_order_id: string; status: string; discount: number; created_at: string;
  quote_items: { kind: "peca" | "mao"; qty: number; unit_price: number }[];
}

export default async function HistoricoPage() {
  const sb = await createClient();
  const [{ data: oss, error }, { data: qs }] = await Promise.all([
    sb.from("service_orders")
      .select("id, number, plate, make, model, entry_type, entered_at, exited_at, customers(name)")
      .eq("status", "finalizado").order("exited_at", { ascending: false }),
    sb.from("quotes")
      .select("id, service_order_id, status, discount, created_at, quote_items(kind, qty, unit_price)")
      .not("service_order_id", "is", null).neq("status", "recusado").order("created_at", { ascending: false }),
  ]);
  // Mesma regra de os_total(): o orçamento não recusado mais recente da O.S.
  const orc: Record<string, { total: number; aprovado: boolean }> = {};
  for (const q of (qs ?? []) as unknown as QDb[]) {
    if (orc[q.service_order_id]) continue;
    const items = (q.quote_items ?? []).map(i => ({ kind: i.kind, qty: Number(i.qty), unit_price: Number(i.unit_price) }));
    orc[q.service_order_id] = { total: quoteTotals(items, Number(q.discount)).total, aprovado: q.status === "aprovado" };
  }
  const rows: HistRow[] = ((oss ?? []) as unknown as OSDb[]).map(o => ({
    id: o.id, number: o.number, plate: o.plate, veiculo: [o.make, o.model].filter(Boolean).join(" "),
    cliente: o.customers?.name ?? "—", tipo: o.entry_type, entered_at: o.entered_at, exited_at: o.exited_at,
    saida: o.exited_at ? ymd(new Date(o.exited_at)) : "",
    total: orc[o.id]?.total ?? null, aprovado: !!orc[o.id]?.aprovado,
  }));
  return (
    <>
      {error && <div className="banner"><span>Erro ao carregar o histórico: {error.message}</span></div>}
      <Historico rows={rows} />
    </>
  );
}
