"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client.ts";
import { brl, round2 } from "@/lib/rules.ts";
import { CATDESP, FPAGN, dataBR, numBR, parseNum, periodo, ymd } from "@/lib/labels.ts";
import { toast, errMsg } from "@/lib/ui.ts";
import { addMonths, brlK, despSit, naFaixa, type ExpenseRow } from "@/lib/fin-b.ts";
import { KeyField, KeyLine, PerBar } from "./fin-ui.tsx";

type Kind = "manual" | "compra" | "taxa" | "comissao";
const ORIG: Record<Kind, string> = { manual: "Lançamento", compra: "Compra", taxa: "Taxa automática", comissao: "Comissão" };
interface Linha { id: string; kind: Kind; titulo: string; categoria: string; valor: number; venc: string; pago: boolean; codigo: string; extra: string; purchase_id: string | null; ref?: ExpenseRow }
interface Form { id: string | null; descricao: string; categoria: string; valor: string; vencimento: string; codigo: string; pago: boolean; pagoEm: string; repetir: number }
const novaDesp = (): Form => ({ id: null, descricao: "", categoria: "", valor: "", vencimento: ymd(), codigo: "", pago: false, pagoEm: "", repetir: 0 });

function toLinha(e: ExpenseRow): Linha {
  const base = { id: e.id, categoria: e.category, valor: Number(e.amount), venc: e.due_date, pago: e.paid, codigo: e.payment_code ?? "", purchase_id: e.purchase_id, ref: e };
  if (e.source === "purchase") return { ...base, kind: "compra", titulo: e.supplier || e.description || e.category, extra: `${FPAGN[e.pay_method ?? ""] ?? ""}${e.invoice ? " · NF " + e.invoice : ""}` };
  if (e.source === "commission") { const [t, ...r] = (e.description || "Comissão").split(" · "); return { ...base, kind: "comissao", titulo: t, extra: r.join(" · ") }; }
  if (e.source === "fee") return { ...base, kind: "taxa", titulo: e.description || e.category, extra: "" };
  return { ...base, kind: "manual", titulo: e.description || e.category, extra: "" };
}

export function Despesas({ list, editId }: { list: ExpenseRow[]; editId: string | null }) {
  const router = useRouter();
  const [st, setSt] = useState(() => { const [de, ate] = periodo("mes"); return { de, ate, per: "mes", busca: "", cat: "" }; });
  const [D, setD] = useState<Form>(novaDesp);
  const [pend, setPend] = useState(false);
  const [busy, setBusy] = useState(false);
  const setF = (p: Partial<Form>) => setD(d => ({ ...d, ...p }));

  function editar(id: string) {
    const e = list.find(x => x.id === id && x.source === "manual");
    if (!e) return;
    setD({ id: e.id, descricao: e.description ?? "", categoria: e.category, valor: numBR(Number(e.amount)), vencimento: e.due_date, codigo: e.payment_code ?? "", pago: e.paid, pagoEm: e.paid_on ?? "", repetir: 0 });
    setPend(false);
  }
  // ?edit={id} (vindo do sino / calendário financeiro)
  useEffect(() => { if (editId) editar(editId); }, [editId]); // eslint-disable-line react-hooks/exhaustive-deps

  const hoje = ymd();
  const { lista, top, mx } = useMemo(() => {
    const all: Linha[] = [];
    const tg: Record<string, Linha & { n: number; os: string[] }> = {};
    for (const e of list) {
      if (!naFaixa(e.due_date, st.de, st.ate)) continue;
      const d = toLinha(e);
      if (d.kind !== "taxa") { all.push(d); continue; }
      const g = tg[d.venc] ?? (tg[d.venc] = { id: "tx:" + d.venc, kind: "taxa", titulo: "", categoria: "Taxa de pagamento", valor: 0, venc: d.venc, pago: true, codigo: "", extra: "", purchase_id: null, n: 0, os: [] });
      g.valor = round2(g.valor + d.valor); g.n++;
      const m = d.titulo.match(/O\.S\. (\d+)/); if (m) g.os.push(m[1]);
    }
    for (const g of Object.values(tg)) { g.titulo = `Taxas de cartão e pix · ${g.n} recebimento${g.n > 1 ? "s" : ""}`; g.extra = g.os.length ? "O.S. " + g.os.join(", ") : ""; all.push(g); }
    const q = st.busca.toLowerCase();
    const lista = all.filter(d => (!st.cat || d.categoria === st.cat) && (!q || [d.titulo, d.categoria, d.extra, d.codigo].join(" ").toLowerCase().includes(q)))
      .sort((a, b) => b.venc.localeCompare(a.venc));
    const porCat: Record<string, number> = {};
    all.forEach(d => { porCat[d.categoria] = (porCat[d.categoria] || 0) + d.valor; });
    const top = Object.entries(porCat).sort((a, b) => b[1] - a[1]).slice(0, 6);
    return { lista, top, mx: Math.max(1, ...top.map(x => x[1])) };
  }, [list, st]);
  const sit = (d: Linha) => despSit({ paid: d.pago, due_date: d.venc }, hoje);
  const sum = (f: (d: Linha) => boolean) => lista.filter(f).reduce((a, d) => a + d.valor, 0);
  const vencido = sum(d => sit(d).k === "vencido");

  async function pagar(d: Linha, v: boolean) {
    const { error } = await createClient().from("expenses").update({ paid: v, paid_on: v ? ymd() : null }).eq("id", d.id);
    if (error) return toast(errMsg(error), { err: true });
    router.refresh();
    if (v) toast(`${d.titulo} marcado como pago`, { sound: "ok", undo: () => { void pagar(d, false); } });
  }

  function novo() {
    setD(novaDesp()); setPend(false);
    if (editId) router.replace("/financeiro/despesas");
    setTimeout(() => document.getElementById("dp-cat")?.focus(), 0);
  }

  async function salvar() {
    const valor = parseNum(D.valor);
    if (!D.categoria) return toast("Selecione a categoria");
    if (!(valor > 0)) return toast("Informe o valor da despesa");
    if (!D.vencimento) return toast("Informe a data de vencimento");
    const base = { description: D.descricao.trim() || null, category: D.categoria, amount: round2(valor), payment_code: D.codigo.trim() || null };
    const sb = createClient();
    setBusy(true);
    let error;
    if (D.id) {
      ({ error } = await sb.from("expenses").update({ ...base, due_date: D.vencimento, paid: D.pago, paid_on: D.pago ? (D.pagoEm || ymd()) : null }).eq("id", D.id).eq("source", "manual"));
    } else {
      const n = Math.max(1, Number(D.repetir) || 1);
      const rows = Array.from({ length: n }, (_, i) => ({
        ...base, description: n > 1 ? `${base.description ?? D.categoria} (${i + 1}/${n})` : base.description,
        due_date: addMonths(D.vencimento, i), paid: i === 0 && D.pago, paid_on: i === 0 && D.pago ? ymd() : null, source: "manual" as const,
      }));
      ({ error } = await sb.from("expenses").insert(rows));
    }
    setBusy(false);
    if (error) return toast(errMsg(error), { err: true });
    toast(D.id ? "Despesa atualizada" : (D.repetir > 1 ? `${D.repetir} despesas registradas, uma por mês` : "Despesa registrada"), { sound: "ok" });
    setD(novaDesp());
    if (editId) router.replace("/financeiro/despesas");
    router.refresh();
  }

  async function excluir() {
    if (!D.id) return;
    const { error } = await createClient().from("expenses").delete().eq("id", D.id).eq("source", "manual");
    setPend(false);
    if (error) return toast(errMsg(error), { err: true });
    setD(novaDesp());
    toast("Despesa excluída");
    if (editId) router.replace("/financeiro/despesas");
    router.refresh();
  }

  return (
    <div className="stack" style={{ gap: 22 }}>
      <section className="panel">
        <div className="ph"><h2>Despesas</h2><span className="hint">Lançamentos, compras, comissões pagas e taxas automáticas · filtradas pelo vencimento</span></div>
        <PerBar per={st.per} onPick={k => { const [de, ate] = periodo(k); setSt(s => ({ ...s, de, ate, per: k })); }} />
        <div className="grid3">
          <label className="field"><span className="label">De</span><input className="input mono" type="date" id="fd-de" value={st.de} onChange={e => setSt(s => ({ ...s, de: e.target.value, per: "" }))} /></label>
          <label className="field"><span className="label">Até</span><input className="input mono" type="date" id="fd-ate" value={st.ate} onChange={e => setSt(s => ({ ...s, ate: e.target.value, per: "" }))} /></label>
          <label className="field"><span className="label">Categoria</span>
            <select className="input" id="fd-cat" value={st.cat} onChange={e => setSt(s => ({ ...s, cat: e.target.value }))}>
              <option value="">Todas</option>{CATDESP.map(c => <option key={c}>{c}</option>)}
            </select></label>
        </div>
      </section>
      <div className="g-kpis">
        <div className="kpi main"><span className="label">Despesas no período</span><strong>{brl(sum(() => true))}</strong><span className="hint">{lista.length} lançamento{lista.length === 1 ? "" : "s"}</span></div>
        <div className="kpi"><span className="label">Pago</span><strong>{brl(sum(d => d.pago))}</strong></div>
        <div className="kpi"><span className="label">A pagar</span><strong>{brl(sum(d => sit(d).k === "pendente"))}</strong></div>
        <div className={`kpi ${vencido ? "alert" : ""}`}><span className="label">Vencido</span><strong>{brl(vencido)}</strong></div>
      </div>
      <div className="split" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(340px,36%)" }}>
        <section className="panel">
          <div className="ph"><h2>Lançamentos</h2>
            <span className="row"><span className="count">{lista.length}</span><input className="input" id="fd-busca" placeholder="Buscar" value={st.busca} onChange={e => setSt(s => ({ ...s, busca: e.target.value }))} style={{ width: 200 }} /></span>
          </div>
          <div className="tbl-wrap"><table><thead><tr><th>Vencimento</th><th>Despesa</th><th>Origem</th><th>Situação</th><th className="num">Valor</th><th></th></tr></thead><tbody>
            {lista.map(d => {
              const sx = sit(d);
              return (
                <tr key={d.id} className={`${d.kind === "manual" ? "click" : ""} ${D.id === d.id ? "sel" : ""}`} onClick={d.kind === "manual" ? () => editar(d.id) : undefined}>
                  <td className="mono">{dataBR(d.venc)}</td>
                  <td><b>{d.titulo}</b><div className="hint">{d.categoria}{d.extra ? " · " + d.extra : ""}</div>{d.codigo && <KeyLine code={d.codigo} />}</td>
                  <td><span className="chip">{ORIG[d.kind]}</span></td>
                  <td><span className={`chip ${sx.cls}`}>{sx.l}</span></td>
                  <td className="num"><b>{brl(d.valor)}</b></td>
                  <td onClick={e => e.stopPropagation()}>
                    {!d.pago ? <button className="key sm accent" onClick={() => pagar(d, true)}>Pagar</button>
                      : d.kind === "compra" && d.purchase_id ? <Link className="key sm" href={`/financeiro/compras/${d.purchase_id}`}>Ver</Link> : null}
                  </td>
                </tr>
              );
            })}
            {!lista.length && <tr><td colSpan={6}><div className="empty">Nenhuma despesa neste período</div></td></tr>}
          </tbody></table></div>
        </section>
        <aside className="stack sticky">
          <section className="panel">
            <div className="ph"><h2>{D.id ? "Editar despesa" : "Nova despesa"}</h2>{D.id && <button className="key sm" onClick={novo}>+ Nova</button>}</div>
            <div className="stack">
              <label className="field"><span className="label">Categoria *</span>
                <select className="input" id="dp-cat" value={D.categoria} onChange={e => setF({ categoria: e.target.value })}>
                  <option value="">— escolha —</option>{CATDESP.map(c => <option key={c}>{c}</option>)}
                </select>
                {D.categoria === "Compra de mercadorias" && <span className="hint">Compras registradas em Compras já entram aqui sozinhas.</span>}
              </label>
              <label className="field"><span className="label">Descrição</span><input className="input" id="dp-desc" value={D.descricao} onChange={e => setF({ descricao: e.target.value })} placeholder="Ex.: Conta de energia — outubro" /></label>
              <div className="grid2">
                <label className="field"><span className="label">Valor (R$) *</span><input className="input" id="dp-val" inputMode="decimal" value={D.valor} onChange={e => setF({ valor: e.target.value })} /></label>
                <label className="field"><span className="label">Data de vencimento *</span><input className="input mono" type="date" id="dp-venc" value={D.vencimento} onChange={e => setF({ vencimento: e.target.value })} /></label>
              </div>
              <KeyField id="dp-cod" label="Código do boleto ou chave pix" value={D.codigo} onChange={v => setF({ codigo: v })} />
              {!D.id && (
                <label className="field"><span className="label">Repetir</span>
                  <select className="input" id="dp-rep" value={D.repetir} onChange={e => setF({ repetir: Number(e.target.value) })}>
                    <option value={0}>Não repetir</option>{[3, 6, 12].map(n => <option key={n} value={n}>Todo mês, {n} meses</option>)}
                  </select>
                  <span className="hint">Útil para aluguel, internet, sistemas</span>
                </label>
              )}
              <label className="row"><input type="checkbox" id="dp-pago" checked={D.pago} onChange={e => setF({ pago: e.target.checked })} /> Já está paga</label>
              <button className="key accent" style={{ padding: 13 }} disabled={busy} onClick={salvar}>{D.id ? "Salvar alterações" : "Registrar despesa"}</button>
              {D.id && (pend
                ? <div className="row"><span>Excluir esta despesa?</span><button className="key sm danger" onClick={excluir}>Excluir</button><button className="key sm" onClick={() => setPend(false)}>Cancelar</button></div>
                : <button className="key sm" onClick={() => setPend(true)}>Excluir despesa</button>)}
            </div>
          </section>
          <section className="panel">
            <div className="ph"><h2>Por categoria</h2></div>
            {top.length
              ? <div className="hbars">{top.map(([n, v]) => <div className="hb" key={n}><span className="hb-l">{n}</span><span className="hb-t"><span className="hb-b" style={{ width: `${Math.max(3, v / mx * 100)}%` }} /></span><span className="hb-v mono">{brlK(v)}</span></div>)}</div>
              : <div className="empty">Sem despesas no período</div>}
          </section>
        </aside>
      </div>
    </div>
  );
}
