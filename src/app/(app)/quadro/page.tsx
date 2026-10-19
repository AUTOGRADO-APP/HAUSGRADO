import { createClient, getMe } from "@/lib/supabase/server.ts";
import { ymd } from "@/lib/labels.ts";
import { Board, type BoardCard } from "./Board.tsx";
import type { ShopFees } from "@/lib/rules.ts";

export const dynamic = "force-dynamic";

export default async function QuadroPage({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const { f: fp } = await searchParams;
  const filtro = fp === "parados" || fp === "entrega" ? fp : null;
  const sb = await createClient();
  const me = await getMe();
  const mesIni = ymd().slice(0, 8) + "01";
  const [{ data: cards, error }, { data: shop }, { data: recs }, { count: noMes }, { data: pw }] = await Promise.all([
    sb.from("v_board").select("*").order("entered_at"),
    sb.from("shops").select("fee_debit_pct, fee_pix_pct, fee_credit_pct").single(),
    sb.from("service_order_records").select("service_order_id"),
    sb.from("service_orders").select("id", { count: "exact", head: true }).eq("status", "finalizado").gte("exited_at", mesIni + "T00:00:00-03:00"),
    sb.rpc("discount_password_status"),
  ]);
  const nRec: Record<string, number> = {};
  for (const r of (recs ?? []) as { service_order_id: string }[]) nRec[r.service_order_id] = (nRec[r.service_order_id] ?? 0) + 1;
  const list = ((cards ?? []) as BoardCard[]).map(c => ({ ...c, n_records: nRec[c.id] ?? 0 }));
  const f = shop as ShopFees;
  return (
    <>
      {error && <div className="banner"><span>Erro ao carregar o quadro: {error.message}</span></div>}
      <Board initial={list} filtro={filtro} noMes={noMes ?? 0} shopId={me!.shop_id} canUndoReceipt={me!.role !== "atendente"}
        fees={{ fee_debit_pct: Number(f?.fee_debit_pct ?? 0), fee_pix_pct: Number(f?.fee_pix_pct ?? 0), fee_credit_pct: (f?.fee_credit_pct ?? []).map(Number) }}
        hasPassword={!!(pw as { active?: boolean } | null)?.active} />
    </>
  );
}
