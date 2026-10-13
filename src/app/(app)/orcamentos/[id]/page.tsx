import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server.ts";
import type { PickProduct } from "@/components/ProductPicker.tsx";
import { loadQuote } from "../data.ts";
import { Editor, type OSOpt, type ServOpt } from "./Editor.tsx";

export const dynamic = "force-dynamic";

export default async function OrcamentoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const b = await loadQuote(id);
  if (!b) notFound();
  const sb = await createClient();
  const [{ data: oss }, { data: prods }, { data: servs }, { data: pw }] = await Promise.all([
    sb.from("service_orders").select("id, number, plate, model, status, customer_id, customers(name)").order("number", { ascending: false }),
    sb.from("products").select("id, name, manufacturer, sku, ean, cost, price, category, viscosity, api, volume, application_spec, application_brands, additive_type").order("name"),
    sb.from("service_catalog").select("id, name, description, price").eq("active", true).order("name"),
    sb.rpc("discount_password_status"),
  ]);
  type OSRow = Omit<OSOpt, "customer_name"> & { customers: { name: string } | { name: string }[] | null };
  const osList: OSOpt[] = ((oss ?? []) as unknown as OSRow[])
    .filter(o => o.status !== "finalizado" || o.id === b.quote.service_order_id)
    .map(({ customers, ...o }) => ({ ...o, customer_name: (Array.isArray(customers) ? customers[0]?.name : customers?.name) || "" }));
  const produtos = ((prods ?? []) as PickProduct[]).map(p => ({ ...p, cost: Number(p.cost) || 0, price: Number(p.price) || 0 }));
  const servicos = ((servs ?? []) as ServOpt[]).map(s => ({ ...s, price: Number(s.price) || 0 }));
  return (
    <main id="view">
      <Editor bundle={b} osList={osList} produtos={produtos} servicos={servicos} hasPassword={!!(pw as { active?: boolean } | null)?.active} />
    </main>
  );
}
