// Financeiro › Metas: META e SUPER META de faturamento por mês, comparadas com o recebido nas entradas.
import { createClient } from "@/lib/supabase/server.ts";
import { MESES, ymd } from "@/lib/labels.ts";
import { addMonth } from "@/lib/gestao.ts";
import { faixaMes, type Meta } from "@/lib/metas.ts";
import { MetaPanel } from "@/components/MetaPanel.tsx";
import { MetasForm, MetasTabela, type MesLinha } from "./Metas.tsx";

export const dynamic = "force-dynamic";

const nomeMes = (m: string) => `${MESES[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;

export default async function MetasPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const sp = await searchParams;
  const hoje = ymd(), atual = hoje.slice(0, 7);
  const mes = sp.m && /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.m) ? sp.m : atual;
  const desde = [addMonth(atual, -12), mes].sort()[0];
  const ate = [addMonth(atual, 1), mes].sort()[1];
  const sb = await createClient();
  const [g, r] = await Promise.all([
    sb.from("revenue_goals").select("month, goal, super_goal").order("month", { ascending: false }),
    sb.from("receipts").select("received_at, total").gte("received_at", faixaMes(desde)[0]).lt("received_at", faixaMes(ate)[1]),
  ]);
  const err = g.error || r.error;

  const metas = new Map<string, Meta>();
  for (const x of (g.data ?? []) as { month: string; goal: number; super_goal: number }[])
    metas.set(x.month.slice(0, 7), { month: x.month, goal: Number(x.goal), super_goal: Number(x.super_goal) });
  const rec: Record<string, { v: number; n: number }> = {};
  for (const x of (r.data ?? []) as { received_at: string; total: number }[]) {
    const k = ymd(new Date(x.received_at)).slice(0, 7);
    const c = rec[k] ?? (rec[k] = { v: 0, n: 0 });
    c.v += Number(x.total); c.n++;
  }

  // meses na lista: os com meta, o atual, os 2 próximos e os 5 anteriores
  const ks = new Set<string>([...metas.keys(), mes]);
  for (let i = -5; i <= 2; i++) ks.add(addMonth(atual, i));
  const linhas: MesLinha[] = [...ks].sort().reverse().map(k => ({
    k, nome: nomeMes(k), meta: metas.get(k) ?? null, fat: rec[k]?.v ?? 0, n: rec[k]?.n ?? 0, futuro: k > atual,
  }));
  // referência para sugerir a meta: média recebida nos 3 meses anteriores ao escolhido
  const ant3 = [1, 2, 3].map(i => rec[addMonth(mes, -i)]?.v ?? 0);
  const media = ant3.reduce((a, v) => a + v, 0) / 3;

  return (
    <main id="view">
      {err && <div className="banner"><span>Erro ao carregar as metas: {err.message}</span></div>}
      <div className="split" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(320px,32%)" }}>
        <div className="stack" style={{ gap: 22 }}>
          <MetaPanel titulo="Meta do mês" mes={mes} nomeMes={nomeMes(mes)} fat={rec[mes]?.v ?? 0} meta={metas.get(mes) ?? null}
            hoje={hoje} nRec={rec[mes]?.n ?? 0} editar={false} />
          <MetasTabela linhas={linhas} sel={mes} hoje={hoje} />
        </div>
        <MetasForm key={mes} mes={mes} nome={nomeMes(mes)} meta={metas.get(mes) ?? null} media={media} />
      </div>
    </main>
  );
}
