import { createClient } from "@/lib/supabase/server.ts";
import { Servicos, type Servico } from "./Servicos.tsx";

export const dynamic = "force-dynamic";

export default async function ServicosPage() {
  const sb = await createClient();
  const [{ data, error }, { data: usos }] = await Promise.all([
    sb.from("service_catalog").select("id, name, description, price").order("name"),
    sb.from("quote_items").select("quote_id, service_id").not("service_id", "is", null),
  ]);
  // "Usado em N orçamentos": orçamentos distintos que têm o serviço.
  const qs: Record<string, Set<string>> = {};
  for (const u of (usos ?? []) as { quote_id: string; service_id: string }[]) (qs[u.service_id] ||= new Set()).add(u.quote_id);
  const rows: Servico[] = ((data ?? []) as Omit<Servico, "usos">[]).map(s => ({ ...s, price: Number(s.price), usos: qs[s.id]?.size ?? 0 }));
  return (
    <>
      {error && <div className="banner"><span>Erro ao carregar os serviços: {error.message}</span></div>}
      <Servicos rows={rows} />
    </>
  );
}
