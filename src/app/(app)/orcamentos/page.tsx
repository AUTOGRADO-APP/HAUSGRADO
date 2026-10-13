import { createClient } from "@/lib/supabase/server.ts";
import { brl, round2 } from "@/lib/rules.ts";
import { ORC_ST } from "@/lib/labels.ts";
import { Plate } from "@/components/Plate.tsx";
import { OrcRow } from "./OrcRow.tsx";

export const dynamic = "force-dynamic";

interface Row {
  id: string; number: number; plate: string | null; status: string; discount: number;
  customers: { name: string } | { name: string }[] | null;
  quote_items: { qty: number; unit_price: number }[];
}

export default async function OrcamentosPage({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const { erro } = await searchParams;
  const sb = await createClient();
  const { data, error } = await sb.from("quotes")
    .select("id, number, plate, status, discount, customers(name), quote_items(qty, unit_price)")
    .order("number", { ascending: false });
  const rows = (data ?? []) as unknown as Row[];
  const nome = (c: Row["customers"]) => (Array.isArray(c) ? c[0]?.name : c?.name) || "—";
  const total = (r: Row) => round2(r.quote_items.reduce((a, i) => a + Number(i.qty) * Number(i.unit_price), 0) - (Number(r.discount) || 0));
  const chip = (s: string) => `chip ${s === "aprovado" ? "ok" : s === "recusado" ? "bad" : ""}`;
  return (
    <main id="view">
      {erro && <div className="banner"><span>Não foi possível criar o orçamento.</span></div>}
      {error && <div className="banner"><span>Erro ao carregar os orçamentos: {error.message}</span></div>}
      <section className="panel">
        <div className="ph"><h2>Orçamentos</h2>{/* link comum (não <Link>): a rota cria o orçamento e redireciona, não deve ser pré-carregada */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a className="key accent" href="/orcamentos/novo">+ Novo orçamento</a></div>
        <div className="tbl-wrap"><table>
          <thead><tr><th>Nº</th><th>Placa</th><th>Cliente</th><th>Situação</th><th className="num">Total</th></tr></thead>
          <tbody>
            {rows.map(r => (
              <OrcRow key={r.id} id={r.id}>
                <td>{r.number}</td>
                <td>{r.plate ? <Plate p={r.plate} /> : "—"}</td>
                <td>{nome(r.customers)}</td>
                <td><span className={chip(r.status)}>{ORC_ST[r.status]}</span></td>
                <td className="num"><b>{brl(total(r))}</b></td>
              </OrcRow>
            ))}
            {!rows.length && <tr><td colSpan={5}><div className="empty">Nenhum orçamento</div></td></tr>}
          </tbody>
        </table></div>
      </section>
    </main>
  );
}
