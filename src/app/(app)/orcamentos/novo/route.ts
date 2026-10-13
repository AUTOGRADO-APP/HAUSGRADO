// Cria um orçamento (rascunho) e abre o editor. Com ?os={id}, liga a O.S., o cliente e a placa.
import { NextResponse, type NextRequest } from "next/server";
import { createClient, getMe } from "@/lib/supabase/server.ts";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const me = await getMe();
  if (!me) return NextResponse.redirect(new URL("/login", req.url));
  const sb = await createClient();
  const osId = req.nextUrl.searchParams.get("os");
  let link: { service_order_id: string; customer_id: string; plate: string } | null = null;
  if (osId) {
    const { data: o } = await sb.from("service_orders").select("id, customer_id, plate").eq("id", osId).maybeSingle();
    if (o) link = { service_order_id: o.id, customer_id: o.customer_id, plate: o.plate };
  }
  const { data: q, error } = await sb.from("quotes").insert({ status: "rascunho", validity_days: 7, ...(link ?? {}) }).select("id, number").single();
  if (error || !q) return NextResponse.redirect(new URL("/orcamentos?erro=1", req.url));
  await sb.from("quote_items").insert([
    { quote_id: q.id, kind: "peca", description: "", qty: 1, unit_price: 0, position: 0 },
    { quote_id: q.id, kind: "mao", description: "Mão de obra", qty: 1, unit_price: 0, position: 1 },
  ]);
  if (link) await sb.from("service_order_history").insert({ service_order_id: link.service_order_id, text: `Orçamento nº ${q.number} criado` });
  return NextResponse.redirect(new URL(`/orcamentos/${q.id}`, req.url), 303);
}
