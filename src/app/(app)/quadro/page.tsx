import { createClient, getMe } from "@/lib/supabase/server.ts";
import { ymd } from "@/lib/labels.ts";
import { Board, type BoardCard } from "./Board.tsx";
import type { ShopFees } from "@/lib/rules.ts";
import { activeQuote, type QuoteLite } from "@/lib/proximo.ts";

export const dynamic = "force-dynamic";

export default async function QuadroPage() {
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
  // situação do orçamento que vale para cada O.S. (selo do card)
  const ids = ((cards ?? []) as { id: string }[]).map(c => c.id);
  const { data: qs } = ids.length
    ? await sb.from("quotes").select("id, status, created_at, service_order_id").in("service_order_id", ids)
    : { data: [] };
  const porOS: Record<string, QuoteLite[]> = {};
  for (const q of (qs ?? []) as (QuoteLite & { service_order_id: string })[]) (porOS[q.service_order_id] ??= []).push(q);
  const list = ((cards ?? []) as BoardCard[]).map(c => ({ ...c, n_records: nRec[c.id] ?? 0, quote_status: activeQuote(porOS[c.id] ?? [])?.status ?? null }));
  const f = shop as ShopFees;
  return (
    <>
      {error && <div className="banner"><span>Erro ao carregar o quadro: {error.message}</span></div>}
      <Board initial={list} noMes={noMes ?? 0} shopId={me!.shop_id} canUndoReceipt={me!.role !== "atendente"}
        fees={{ fee_debit_pct: Number(f?.fee_debit_pct ?? 0), fee_pix_pct: Number(f?.fee_pix_pct ?? 0), fee_credit_pct: (f?.fee_credit_pct ?? []).map(Number) }}
        hasPassword={!!(pw as { active?: boolean } | null)?.active} />
    </>
  );
}
