import { createClient, getMe } from "@/lib/supabase/server.ts";
import { TopBar } from "@/components/TopBar.tsx";
import { Board, type BoardCard } from "./Board.tsx";
import type { ShopFees } from "@/lib/rules.ts";

export const dynamic = "force-dynamic";

export default async function QuadroPage() {
  const supabase = await createClient();
  const me = await getMe();
  const [{ data: cards, error }, { data: shop }] = await Promise.all([
    supabase.from("v_board").select("*").order("entered_at"),
    supabase.from("shops").select("fee_debit_pct, fee_pix_pct, fee_credit_pct").single(),
  ]);
  return (
    <>
      <TopBar title="Quadro de serviço" isMaster={me?.role === "master"} />
      {error ? <p className="error">Erro ao carregar o quadro: {error.message}</p>
        : <Board initial={(cards ?? []) as BoardCard[]} fees={shop as ShopFees} />}
    </>
  );
}
