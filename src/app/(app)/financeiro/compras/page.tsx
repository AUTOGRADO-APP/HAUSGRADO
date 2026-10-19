import { createClient, getMe } from "@/lib/supabase/server.ts";
import { isFin } from "@/lib/permissions.ts";
import { PURCHASE_SELECT, toPurchase, type PurchaseRaw } from "@/lib/fin-b.ts";
import { Compras } from "./Compras.tsx";

export const dynamic = "force-dynamic";

export default async function ComprasPage() {
  const sb = await createClient();
  const { data, error } = await sb.from("purchases").select(PURCHASE_SELECT).order("purchased_on", { ascending: false });
  const list = ((data ?? []) as unknown as PurchaseRaw[]).map(toPurchase);
  return (
    <main id="view">
      {error && <div className="banner"><span>Erro ao carregar compras: {error.message}</span></div>}
      <Compras list={list} calendario={isFin((await getMe())?.role)} />
    </main>
  );
}
