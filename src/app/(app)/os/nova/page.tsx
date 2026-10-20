import { createClient, getMe } from "@/lib/supabase/server.ts";
import { loadCustomers } from "@/lib/customers.ts";
import { NovaOS, type NovaCliente, type NovaAgenda, type NovaVeiculo } from "./NovaOS.tsx";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ cliente?: string; ag?: string }> }) {
  const sp = await searchParams;
  const sb = await createClient();
  const me = await getMe();
  const clientes = await loadCustomers(sb);

  let agenda: NovaAgenda | null = null;
  let veiculo: NovaVeiculo | null = null;
  if (sp.ag) {
    const { data } = await sb.from("appointments").select("id, date, time, customer_id, plate, reason, status").eq("id", sp.ag).maybeSingle();
    agenda = (data as NovaAgenda | null) ?? null;
    if (agenda?.plate) {
      const { data: v } = await sb.from("vehicles").select("plate, customer_id, make, model, year, color, fuel").eq("plate", agenda.plate).maybeSingle();
      veiculo = (v as NovaVeiculo | null) ?? null;
    }
  }

  return (
    <main id="view">
      <NovaOS shopId={me!.shop_id} clientes={clientes as NovaCliente[]} agenda={agenda} veiculo={veiculo}
        clienteInicial={agenda?.customer_id ?? sp.cliente ?? ""} />
    </main>
  );
}
