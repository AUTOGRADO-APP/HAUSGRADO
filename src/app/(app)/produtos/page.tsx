import { createClient } from "@/lib/supabase/server.ts";
import { Produtos, type Produto } from "./Produtos.tsx";

export const dynamic = "force-dynamic";

export default async function ProdutosPage() {
  const sb = await createClient();
  const { data, error } = await sb.from("products")
    .select("id, name, manufacturer, sku, ean, cost, price, category, viscosity, api, volume, application_spec, application_brands, additive_type")
    .order("name");
  const rows = ((data ?? []) as Produto[]).map(p => ({ ...p, cost: Number(p.cost), price: Number(p.price), application_brands: p.application_brands ?? [] }));
  return (
    <>
      {error && <div className="banner"><span>Erro ao carregar os produtos: {error.message}</span></div>}
      <Produtos rows={rows} />
    </>
  );
}
