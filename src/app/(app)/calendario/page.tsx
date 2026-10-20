import { createClient } from "@/lib/supabase/server.ts";
import { loadCustomers } from "@/lib/customers.ts";
import { Agenda, type Appt, type Cli, type Veh } from "./Agenda.tsx";

export const dynamic = "force-dynamic";

export default async function CalendarioPage() {
  const sb = await createClient();
  const [{ data: ags, error }, clis, { data: vehs }] = await Promise.all([
    sb.from("appointments").select("id, date, time, customer_id, plate, reason, status, service_order_id, service_orders!appointments_os_fk(number)").order("date").order("time"),
    loadCustomers(sb),
    sb.from("vehicles").select("customer_id, plate"),
  ]);
  type Row = Omit<Appt, "os_number"> & { service_orders: { number: number } | { number: number }[] | null };
  const list: Appt[] = ((ags ?? []) as unknown as Row[]).map(({ service_orders: so, ...a }) => ({
    ...a, time: String(a.time).slice(0, 5), os_number: (Array.isArray(so) ? so[0]?.number : so?.number) ?? null,
  }));
  return (
    <>
      {error && <div className="banner"><span>Erro ao carregar a agenda: {error.message}</span></div>}
      <Agenda initial={list} clientes={clis as Cli[]} veiculos={(vehs ?? []) as Veh[]} />
    </>
  );
}
