import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server.ts";
import { PURCHASE_SELECT, toPurchase, type PurchaseRaw, type SupplierRow } from "@/lib/fin-b.ts";
import type { PickProduct } from "@/components/ProductPicker.tsx";
import { CompraEditor } from "./CompraEditor.tsx";

export const dynamic = "force-dynamic";

export default async function CompraPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await createClient();
  const novo = id === "novo";
  const [{ data: sups }, { data: prods }, { data: raw }] = await Promise.all([
    sb.from("suppliers").select("id, name, salesperson, salesperson_phone, pix_key").order("name"),
    sb.from("products").select("id, name, manufacturer, sku, ean, cost, price, category, viscosity, api, volume, application_spec, application_brands, additive_type").order("name"),
    novo ? Promise.resolve({ data: null }) : sb.from("purchases").select(PURCHASE_SELECT).eq("id", id).maybeSingle(),
  ]);
  if (!novo && !raw) notFound();
  const compra = raw ? toPurchase(raw as unknown as PurchaseRaw) : null;
  const produtos = ((prods ?? []) as PickProduct[]).map(p => ({ ...p, cost: Number(p.cost), price: Number(p.price) }));
  return (
    <main id="view">
      <CompraEditor key={id} compra={compra} suppliers={(sups ?? []) as SupplierRow[]} produtos={produtos} />
    </main>
  );
}
