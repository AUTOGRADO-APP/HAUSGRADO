import { notFound } from "next/navigation";
import { createClient, getMe } from "@/lib/supabase/server.ts";
import { canDelete } from "@/lib/permissions.ts";
import type { PickProduct } from "@/components/ProductPicker.tsx";
import { orcSig } from "@/lib/orc-link.ts";
import { loadQuote } from "../data.ts";
import { Editor, type OSOpt, type ServOpt } from "./Editor.tsx";

export const dynamic = "force-dynamic";

export default async function OrcamentoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const b = await loadQuote(id);
  if (!b) notFound();
  const sb = await createClient();
  const me = await getMe();
  const [{ data: oss }, { data: prods }, { data: servs }, { data: pw }, { data: extra }, { data: ativos }] = await Promise.all([
    sb.from("service_orders").select("id, number, plate, model, status, customer_id, customers(name)").order("number", { ascending: false }),
    sb.from("products").select("id, name, manufacturer, sku, ean, cost, price, category, viscosity, api, volume, application_spec, application_brands, additive_type, stock_qty").order("name"),
    sb.from("service_catalog").select("id, name, description, price").eq("active", true).order("name"),
    sb.rpc("discount_password_status"),
    sb.rpc("product_stock_extra"),
    sb.from("quotes").select("service_order_id").neq("status", "recusado").neq("id", id).not("service_order_id", "is", null),
  ]);
  // cada O.S. tem um orçamento ativo: não oferece O.S. que já têm outro (o banco também barra)
  const comOrc = new Set(((ativos ?? []) as { service_order_id: string }[]).map(x => x.service_order_id));
  type OSRow = Omit<OSOpt, "customer_name"> & { customers: { name: string } | { name: string }[] | null };
  const osList: OSOpt[] = ((oss ?? []) as unknown as OSRow[])
    .filter(o => o.id === b.quote.service_order_id || (o.status !== "finalizado" && !comOrc.has(o.id)))
    .map(({ customers, ...o }) => ({ ...o, customer_name: (Array.isArray(customers) ? customers[0]?.name : customers?.name) || "" }));
  // Reservado por OUTROS orçamentos: se este já está aprovado (O.S. no pátio), as peças dele não contam contra ele mesmo.
  const res = new Map(((extra ?? []) as { product_id: string; reserved: number }[]).map(x => [x.product_id, Number(x.reserved) || 0]));
  const osAtual = ((oss ?? []) as { id: string; status: string }[]).find(o => o.id === b.quote.service_order_id);
  if (b.quote.status === "aprovado" && osAtual && osAtual.status !== "finalizado")
    b.items.forEach(i => { if (i.product_id) res.set(i.product_id, (res.get(i.product_id) ?? 0) - i.qty); });
  const produtos = ((prods ?? []) as PickProduct[]).map(p => ({ ...p, cost: Number(p.cost) || 0, price: Number(p.price) || 0,
    stock_qty: Number(p.stock_qty) || 0, reserved: Math.max(0, res.get(p.id) ?? 0) }));
  const servicos = ((servs ?? []) as ServOpt[]).map(s => ({ ...s, price: Number(s.price) || 0 }));
  return (
    <main id="view">
      <Editor bundle={b} osList={osList} produtos={produtos} servicos={servicos} hasPassword={!!(pw as { active?: boolean } | null)?.active} canDelete={canDelete(me?.role)} pdfSig={orcSig(b.quote.id)} />
    </main>
  );
}
