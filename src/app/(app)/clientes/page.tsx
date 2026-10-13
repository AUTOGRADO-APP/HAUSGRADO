import { createClient } from "@/lib/supabase/server.ts";
import { Clientes, type CliRow } from "./Clientes.tsx";

export const dynamic = "force-dynamic";

export default async function ClientesPage() {
  const sb = await createClient();
  const [{ data: clientes, error }, { data: veics }, { data: oss }] = await Promise.all([
    sb.from("customers").select("id, name, phone, document, zip_code").order("name"),
    sb.from("vehicles").select("customer_id, plate"),
    sb.from("service_orders").select("id, customer_id, plate, entered_at").order("entered_at", { ascending: false }),
  ]);
  // Última O.S. de cada placa (lista vem da mais recente para a mais antiga).
  const ultimaOS: Record<string, string> = {};
  for (const o of (oss ?? []) as { id: string; plate: string }[]) if (!ultimaOS[o.plate]) ultimaOS[o.plate] = o.id;
  // Placas por cliente: veículos cadastrados + placas das O.S. dele.
  const placas: Record<string, string[]> = {};
  const add = (c: string | null, p: string) => { if (!c || !p) return; const l = (placas[c] ||= []); if (!l.includes(p)) l.push(p); };
  for (const v of (veics ?? []) as { customer_id: string | null; plate: string }[]) add(v.customer_id, v.plate);
  for (const o of (oss ?? []) as { customer_id: string; plate: string }[]) add(o.customer_id, o.plate);
  const rows: CliRow[] = ((clientes ?? []) as Omit<CliRow, "veiculos">[]).map(c => ({
    ...c,
    veiculos: (placas[c.id] ?? []).map(p => ({ plate: p, osId: ultimaOS[p] ?? null })),
  }));
  return (
    <>
      {error && <div className="banner"><span>Erro ao carregar os clientes: {error.message}</span></div>}
      <Clientes rows={rows} />
    </>
  );
}
