// Clientes para as telas que o mecânico também abre (O.S., Quadro, Histórico, Calendário, Nova O.S., sino).
// O nome vem de customer_names (todos os perfis); o telefone, de customers, que a RLS só libera para o
// escritório. Para o mecânico, phone volta sempre "".
import type { SupabaseClient } from "@supabase/supabase-js";

export interface CustomerLite { id: string; name: string; phone: string }

/** Lista de clientes (ou só os de `ids`), em ordem de nome. Use `ids` para poucos clientes. */
export async function loadCustomers(sb: SupabaseClient, ids?: (string | null | undefined)[]): Promise<CustomerLite[]> {
  const only = ids ? [...new Set(ids.filter(Boolean) as string[])] : null;
  if (only && !only.length) return [];
  let qn = sb.from("customer_names").select("id, name").order("name");
  let qp = sb.from("customers").select("id, phone");
  if (only) { qn = qn.in("id", only); qp = qp.in("id", only); }
  const [{ data: names }, { data: phones }] = await Promise.all([qn, qp]);
  const tel = new Map(((phones ?? []) as { id: string; phone: string }[]).map(p => [p.id, p.phone]));
  return ((names ?? []) as { id: string; name: string }[]).map(n => ({ id: n.id, name: n.name, phone: tel.get(n.id) ?? "" }));
}

export const byId = (list: CustomerLite[]) => new Map(list.map(c => [c.id, c]));
