import "server-only";
import { createClient, type Me } from "./supabase/server.ts";
import { addDays, ymd } from "./labels.ts";
import { estoqueBaixo } from "./estoque.ts";
import { isFin } from "./permissions.ts";
import type { ShellData } from "./types.ts";

/** Dados do topo (LCD, sino e lembretes) carregados a cada navegação. */
export async function loadShell(me: Me): Promise<ShellData> {
  const sb = await createClient();
  const fin = isFin(me.role);
  const hoje = ymd(), am = addDays(hoje, 1);
  const mesIni = hoje.slice(0, 8) + "01";
  const [board, shop, appts, contas, rec, prods] = await Promise.all([
    sb.from("v_board").select("status, status_since"),
    sb.from("shops").select("name").maybeSingle(),
    sb.from("appointments").select("id, date, time, plate, reason, reminder_sent_at, status, customers(name, phone)").in("date", [hoje, am]).eq("status", "agendado").order("time"),
    fin ? sb.from("expenses").select("id, description, category, amount, due_date, payment_code, paid, paid_on, source, purchase_id").eq("paid", false).neq("source", "fee").lte("due_date", am).order("due_date")
        : Promise.resolve({ data: [] as never[] }),
    fin ? sb.from("receipts").select("total").gte("received_at", mesIni + "T00:00:00-03:00") : Promise.resolve({ data: [] as never[] }),
    sb.from("products").select("id, name, stock_qty, min_stock").or("min_stock.gt.0,stock_qty.lt.0").order("name"),
  ]);
  const baixos = ((prods.data ?? []) as ShellData["estoqueBaixo"])
    .map(p => ({ ...p, stock_qty: Number(p.stock_qty), min_stock: Number(p.min_stock) }))
    .filter(p => estoqueBaixo(p) || p.stock_qty < 0);
  const rows = (board.data ?? []) as { status: string; status_since: string }[];
  const pat = rows.filter(r => r.status !== "finalizado");
  type A = { id: string; date: string; time: string; plate: string | null; reason: string | null; reminder_sent_at: string | null; customers: { name: string; phone: string } | null };
  const ap = (appts.data ?? []) as unknown as A[];
  const recs = (rec.data ?? []) as { total: number }[];
  const fat = recs.reduce((a, r) => a + Number(r.total), 0);
  return {
    me: { id: me.id, full_name: me.full_name, role: me.role, shop_id: me.shop_id },
    shopName: (shop.data as { name: string } | null)?.name ?? "Autogrado",
    patio: pat.length,
    servico: pat.filter(r => r.status === "servico").length,
    parados: pat.filter(r => (Date.now() - new Date(r.status_since).getTime()) / 864e5 >= 3).length,
    hojeAgendados: ap.filter(a => a.date === hoje).length,
    amanha: ap.filter(a => a.date === am).map(a => ({ id: a.id, date: a.date, time: a.time.slice(0, 5), plate: a.plate, reason: a.reason, reminder_sent_at: a.reminder_sent_at, customer_name: a.customers?.name ?? "Sem cliente", customer_phone: a.customers?.phone ?? "" })),
    contas: ((contas.data ?? []) as ShellData["contas"]).map(c => ({ ...c, amount: Number(c.amount) })),
    estoqueBaixo: baixos,
    fatMes: fat, ticketMes: recs.length ? fat / recs.length : 0,
  };
}
