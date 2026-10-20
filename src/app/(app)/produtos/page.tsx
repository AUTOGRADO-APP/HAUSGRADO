import { createClient, getMe } from "@/lib/supabase/server.ts";
import { isOffice } from "@/lib/permissions.ts";
import { Produtos, type Produto } from "./Produtos.tsx";

export const dynamic = "force-dynamic";

export default async function ProdutosPage({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const { f } = await searchParams;
  const sb = await createClient();
  const custos = isOffice((await getMe())?.role);   // mecânico não vê custo nem markup
  const [{ data, error }, { data: extra }, { data: pw }] = await Promise.all([
    sb.from("products")
      .select("id, name, manufacturer, sku, ean, ncm, cost, price, category, viscosity, api, volume, application_spec, application_brands, additive_type, stock_qty, min_stock")
      .order("name"),
    sb.rpc("product_stock_extra"),
    sb.rpc("discount_password_status"),
  ]);
  const ex = new Map(((extra ?? []) as { product_id: string; reserved: number; incoming: number }[]).map(x => [x.product_id, x]));
  const rows = ((data ?? []) as Produto[]).map(p => ({
    ...p, cost: custos ? Number(p.cost) : 0, price: Number(p.price), application_brands: p.application_brands ?? [],
    stock_qty: Number(p.stock_qty), min_stock: Number(p.min_stock),
    reserved: Number(ex.get(p.id)?.reserved ?? 0), incoming: Number(ex.get(p.id)?.incoming ?? 0),
  }));
  return (
    <>
      {error && <div className="banner"><span>Erro ao carregar os produtos: {error.message}</span></div>}
      <Produtos rows={rows} filtroInicial={f === "baixo" ? "baixo" : ""} hasPassword={!!(pw as { active?: boolean } | null)?.active} custos={custos} />
    </>
  );
}
