"use client";
// Editor de orçamento (seção 7.9): itens editáveis na linha, peça/serviço cadastrado, desconto protegido,
// validade, totais, WhatsApp, PDF, guia de serviço e situação.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client.ts";
import { brl, marginOf, minPartPrice, partPriceOk, priceFromMargin, quoteTotals } from "@/lib/rules.ts";
import { ORC_ST, numBR, parseNum, pct } from "@/lib/labels.ts";
import { msgOrc, portalLink, waURL } from "@/lib/msgs.ts";
import { copyText, errMsg, sfx, toast } from "@/lib/ui.ts";
import { ProductPicker, type PickProduct } from "@/components/ProductPicker.tsx";
import { ServicePicker } from "@/components/orc-servicos.tsx";
import { DiscountModal } from "@/components/orc-desconto.tsx";
import { IKEY } from "@/components/icons.tsx";
import type { QItem, QQuote, QuoteBundle } from "../data.ts";

export interface OSOpt { id: string; number: number; plate: string; model: string | null; status: string; customer_id: string; customer_name: string }
export interface ServOpt { id: string; name: string; description: string | null; price: number }

// byMargin: a pessoa digitou a margem por último → se o custo mudar, o preço acompanha (senão, a margem é que muda)
type LItem = QItem & { qtyTxt: string; priceTxt: string; costTxt: string; marginTxt: string; byMargin: boolean };
type Patch = Partial<Pick<QItem, "description" | "qty" | "unit_price" | "unit_cost" | "product_id" | "service_id" | "sku" | "details" | "kind">>;
const mTxt = (cost: number, price: number) => { const m = cost > 0 ? marginOf(cost, price) : null; return m == null ? "" : String(m).replace(".", ","); };
const toL = (i: QItem): LItem => ({
  ...i, qtyTxt: String(i.qty).replace(".", ","), priceTxt: numBR(i.unit_price) || "0", costTxt: numBR(i.unit_cost) || "0",
  marginTxt: mTxt(i.unit_cost, i.unit_price), byMargin: false,
});
const COLS = "id, kind, description, details, qty, unit_price, unit_cost, product_id, service_id, sku, position";

export function Editor({ bundle, osList, produtos, servicos, hasPassword, canDelete }: {
  bundle: QuoteBundle; osList: OSOpt[]; produtos: PickProduct[]; servicos: ServOpt[]; hasPassword: boolean; canDelete: boolean;
}) {
  const sb = useMemo(() => createClient(), []);
  const router = useRouter();
  const { customer: c, os: o, shop } = bundle;
  const minPct = shop.min_part_margin_pct;
  // custo de peça cadastrada vem do cadastro e não se digita (quando o produto tem custo)
  const custoCad = useMemo(() => new Map(produtos.filter(p => Number(p.cost) > 0).map(p => [p.id, Number(p.cost)])), [produtos]);
  const [q, setQ] = useState<QQuote>(bundle.quote);
  const [items, setItems] = useState<LItem[]>(() => bundle.items.map(toL));
  const [validade, setValidade] = useState(String(bundle.quote.validity_days));
  const [modal, setModal] = useState<null | "pecas" | "serv" | "desc">(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [delPend, setDelPend] = useState(false);
  const pend = useRef(new Map<string, { patch: Patch; t: ReturnType<typeof setTimeout> }>());
  const valT = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputs = useRef(new Map<string, HTMLInputElement>());
  const invalidRef = useRef(false);
  // aprovado = travado (volta para Rascunho para editar); O.S. finalizada = travado de vez (o banco garante)
  const osFin = o?.status === "finalizado";
  const locked = q.status === "aprovado" || osFin;
  const travado = () => {
    toast(osFin ? "A O.S. foi finalizada: este orçamento não pode mais mudar." : "Orçamento aprovado: para alterar, volte para Rascunho.", { err: true });
    return true;
  };

  // quando o servidor manda dados novos (refresh/tempo real), sincroniza o que não está sendo editado
  useEffect(() => {
    setQ(bundle.quote);
    if (!pend.current.size && !invalidRef.current) setItems(bundle.items.map(toL));
  }, [bundle]);
  useEffect(() => {
    const ch = sb.channel("quote-" + bundle.quote.id)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "quotes", filter: `id=eq.${bundle.quote.id}` }, () => router.refresh())
      .subscribe();
    return () => { void sb.removeChannel(ch); };
  }, [sb, router, bundle.quote.id]);
  useEffect(() => {
    if (!focusId) return;
    inputs.current.get(focusId)?.focus();
    setFocusId(null);
  }, [focusId, items]);

  // ---------- gravação dos itens com debounce ----------
  const send = useCallback(async (id: string, patch: Patch) => {
    const { error } = await sb.from("quote_items").update(patch).eq("id", id);
    if (error) toast(errMsg(error), { err: true });
  }, [sb]);
  const queue = useCallback((id: string, patch: Patch) => {
    const cur = pend.current.get(id);
    if (cur) clearTimeout(cur.t);
    const merged = { ...(cur?.patch ?? {}), ...patch };
    const t = setTimeout(() => { pend.current.delete(id); void send(id, merged); }, 500);
    pend.current.set(id, { patch: merged, t });
  }, [send]);
  const flush = useCallback(async () => {
    const all = [...pend.current.entries()];
    pend.current.clear();
    await Promise.all(all.map(([id, { patch, t }]) => { clearTimeout(t); return send(id, patch); }));
    if (valT.current) { clearTimeout(valT.current); valT.current = null; await sb.from("quotes").update({ validity_days: parseInt(validade) || 0 }).eq("id", q.id); }
  }, [send, sb, validade, q.id]);
  // ao sair da página, grava o que ficou pendente
  const flushRef = useRef(flush);
  flushRef.current = flush;
  useEffect(() => () => { void flushRef.current(); }, []);

  function edit(id: string, f: "description" | "qty" | "unit_price" | "unit_cost" | "margin", v: string) {
    if (locked) return;
    const cur = items.find(i => i.id === id);
    if (!cur) return;
    let r: LItem;
    if (f === "description") r = { ...cur, description: v };
    else if (f === "qty") { const n = parseNum(v); r = { ...cur, qtyTxt: v, qty: n > 0 ? n : cur.qty }; }
    else if (f === "unit_price") { const p = Math.max(0, parseNum(v)); r = { ...cur, priceTxt: v, unit_price: p, marginTxt: mTxt(cur.unit_cost, p), byMargin: false }; }
    else if (f === "margin") {
      // margem → preço (preço = custo ÷ (1 − margem), para cima no centavo)
      const p = v.trim() ? priceFromMargin(cur.unit_cost, parseNum(v)) : null;
      r = p == null ? { ...cur, marginTxt: v } : { ...cur, marginTxt: v, unit_price: p, priceTxt: numBR(p) || "0", byMargin: true };
    } else {
      const c2 = Math.max(0, parseNum(v));
      const p = cur.byMargin && cur.marginTxt.trim() ? priceFromMargin(c2, parseNum(cur.marginTxt)) : null;
      r = p == null ? { ...cur, costTxt: v, unit_cost: c2, marginTxt: mTxt(c2, cur.unit_price) }
        : { ...cur, costTxt: v, unit_cost: c2, unit_price: p, priceTxt: numBR(p) || "0" };
    }
    setItems(its => its.map(i => (i.id === id ? r : i)));
    if (f === "description") queue(id, { description: v });
    else if (f === "qty") { const n = parseNum(v); if (n > 0) queue(id, { qty: n }); }
    // preço/custo/margem só gravam se a peça respeita a margem mínima (o banco confere de novo)
    else if (partPriceOk(r, minPct)) queue(id, { unit_cost: r.unit_cost, unit_price: r.unit_price });
  }

  const nextPos = () => items.reduce((m, i) => Math.max(m, i.position), -1) + 1;
  async function insert(row: Omit<Patch, "kind"> & { kind: "peca" | "mao" }, focus = false) {
    if (locked && travado()) return null;
    const { data, error } = await sb.from("quote_items").insert({ quote_id: q.id, qty: 1, position: nextPos(), ...row }).select(COLS).single();
    if (error || !data) { toast(errMsg(error), { err: true }); return null; }
    const it = toL({ ...(data as QItem), qty: Number(data.qty), unit_price: Number(data.unit_price), unit_cost: Number(data.unit_cost) || 0 });
    setItems(its => [...its, it]);
    if (focus) setFocusId(it.id);
    return it;
  }
  async function del(id: string) {
    if (locked && travado()) return;
    const p = pend.current.get(id);
    if (p) { clearTimeout(p.t); pend.current.delete(id); }
    const { error } = await sb.from("quote_items").delete().eq("id", id);
    if (error) return toast(errMsg(error), { err: true });
    setItems(its => its.filter(i => i.id !== id));
  }
  async function replace(id: string, patch: Patch) {
    const p = pend.current.get(id);
    if (p) { clearTimeout(p.t); pend.current.delete(id); }
    setItems(its => its.map(i => (i.id === id ? toL({ ...i, ...patch }) : i)));
    await send(id, patch);
  }

  // ---------- peça e serviço cadastrados ----------
  const qtdProd = useMemo(() => { const m: Record<string, number> = {}; items.forEach(i => { if (i.product_id) m[i.product_id] = (m[i.product_id] ?? 0) + i.qty; }); return m; }, [items]);
  const qtdServ = useMemo(() => { const m: Record<string, number> = {}; items.forEach(i => { if (i.service_id) m[i.service_id] = (m[i.service_id] ?? 0) + i.qty; }); return m; }, [items]);

  async function addProduto(x: PickProduct) {
    if (locked && travado()) return;
    const desc = x.name + (x.manufacturer ? " " + x.manufacturer : "");
    const ex = items.find(i => i.product_id === x.id);
    let ajustado = false;
    if (ex) await replace(ex.id, { qty: ex.qty + 1 });
    else {
      const vz = items.find(i => i.kind === "peca" && !i.description && !i.unit_price);
      const custo = Number(x.cost) || 0, min = minPartPrice(custo, minPct);
      let preco = Number(x.price) || 0;
      if (preco > 0 && preco < min) { preco = min; ajustado = true; }
      const patch: Patch = { description: desc, qty: 1, unit_cost: custo, unit_price: preco, product_id: x.id, sku: x.sku };
      if (vz) await replace(vz.id, patch); else await insert({ kind: "peca", ...patch });
    }
    const disp = (x.stock_qty ?? 0) - (x.reserved ?? 0), nova = (ex?.qty ?? 0) + 1;
    if (ajustado) toast(`${x.name}: o preço do cadastro fica abaixo do markup mínimo de ${pct(minPct)}. Entrou por ${brl(minPartPrice(Number(x.cost) || 0, minPct))}.`);
    else if (x.stock_qty != null && nova > disp) toast(`${x.name} adicionada · estoque disponível: ${String(Math.max(0, disp)).replace(".", ",")}. Confira antes de prometer a peça.`);
    else toast(`${x.name} adicionada ao orçamento`, { sound: "ok" });
  }
  async function addServico(x: ServOpt) {
    if (locked && travado()) return;
    const ex = items.find(i => i.service_id === x.id);
    if (ex) await replace(ex.id, { qty: ex.qty + 1 });
    else {
      const vz = items.find(i => i.kind === "mao" && (!i.description || i.description === "Mão de obra") && !i.unit_price);
      const patch: Patch = { description: x.name, details: x.description, qty: 1, unit_price: x.price, service_id: x.id };
      if (vz) await replace(vz.id, patch); else await insert({ kind: "mao", ...patch });
    }
    toast(`${x.name} adicionado ao orçamento`, { sound: "ok" });
  }

  // ---------- cabeçalho: veículo, validade, desconto, situação ----------
  async function setOS(id: string) {
    const x = osList.find(v => v.id === id);
    const { error } = await sb.from("quotes").update({ service_order_id: x?.id ?? null, customer_id: x?.customer_id ?? null, plate: x?.plate ?? null }).eq("id", q.id);
    if (error) return toast(errMsg(error), { err: true });
    if (x) await sb.from("service_order_history").insert({ service_order_id: x.id, text: `Orçamento nº ${q.number} vinculado` });
    router.refresh();
  }
  function setVal(v: string) {
    setValidade(v);
    if (valT.current) clearTimeout(valT.current);
    valT.current = setTimeout(async () => {
      valT.current = null;
      const { error } = await sb.from("quotes").update({ validity_days: parseInt(v) || 0 }).eq("id", q.id);
      if (error) toast(errMsg(error), { err: true });
    }, 500);
  }
  async function applyDiscount(amount: number, password: string) {
    await flush();
    const { error } = await sb.rpc("apply_quote_discount", { p_quote: q.id, p_amount: amount, p_password: password });
    if (error) { toast(errMsg(error), { err: true }); return false; }
    setQ(v => ({ ...v, discount: amount }));
    setModal(null);
    router.refresh();
    return true;
  }
  async function setStatus(st: QQuote["status"]) {
    if (st === q.status) return;
    if (osFin && travado()) return;
    if (barrado()) return;
    const decided = st === "aprovado" || st === "recusado";
    await flush();
    const { error } = await sb.from("quotes").update({ status: st, decided_at: decided ? new Date().toISOString() : null, decided_by: decided ? "oficina" : null }).eq("id", q.id);
    if (error) return toast(errMsg(error), { err: true });
    setQ(v => ({ ...v, status: st }));
    // aprovação: o banco já move a O.S. e grava o histórico
    if (st === "aprovado") sfx("ok");
    else if (q.service_order_id) await sb.from("service_order_history").insert({ service_order_id: q.service_order_id, text: `Orçamento: ${ORC_ST[st]}` });
    router.refresh();
  }
  async function enviado() {
    if (q.status !== "rascunho") return;
    await flush();
    const { error } = await sb.from("quotes").update({ status: "enviado" }).eq("id", q.id);
    if (error) return toast(errMsg(error), { err: true });
    setQ(v => ({ ...v, status: "enviado" }));
    if (q.service_order_id) await sb.from("service_order_history").insert({ service_order_id: q.service_order_id, text: "Orçamento enviado ao cliente pelo WhatsApp" });
    router.refresh();
  }
  async function excluir() {
    for (const { t } of pend.current.values()) clearTimeout(t);
    pend.current.clear();
    if (valT.current) { clearTimeout(valT.current); valT.current = null; }
    const { data, error } = await sb.from("quotes").delete().eq("id", q.id).select("id");
    if (error) return toast(errMsg(error), { err: true });
    if (!data?.length) return toast("Só o usuário master pode excluir orçamentos.", { err: true });
    if (q.service_order_id) await sb.from("service_order_history").insert({ service_order_id: q.service_order_id, text: `Orçamento nº ${q.number} excluído` });
    toast(`Orçamento nº ${q.number} excluído`);
    router.push("/orcamentos"); router.refresh();
  }
  // peça abaixo da margem mínima: o valor não foi gravado; nada sai do editor até corrigir
  const invalid = locked ? [] : items.filter(i => !partPriceOk(i, minPct));
  invalidRef.current = invalid.length > 0;
  const barrado = () => {
    const i = invalid[0];
    if (!i) return false;
    toast(`${i.description || "Peça sem descrição"}: preço abaixo do markup mínimo de ${pct(minPct)}. Mínimo: ${brl(minPartPrice(i.unit_cost, minPct))}.`, { err: true });
    return true;
  };
  async function go(path: string) { if (barrado()) return; await flush(); router.push(path); }
  async function guia() {
    if (barrado()) return;
    if (!q.service_order_id || !o) return toast("Selecione o veículo (O.S.) deste orçamento antes de gerar a guia", { err: true });
    await go(`/orcamentos/${q.id}/guia`);
  }

  const T = quoteTotals(items, q.discount);
  const msg = msgOrc({
    number: q.number, plate: q.plate, discount: q.discount, validity_days: parseInt(validade) || 0, customer_name: c?.name || "",
    items: items.map(i => ({ description: i.description, qty: i.qty, unit_price: i.unit_price })),
    link: o ? portalLink(o.portal_token, shop.portal_base_url) : null,
  });
  const wa = c ? waURL(c.phone, msg) : null;

  return (
    <div className="split">
      <section className="panel">
        <div className="ph"><h2>Orçamento nº {q.number}</h2><button className="key" onClick={() => go("/orcamentos")}>‹ Lista</button></div>
        <label className="field" style={{ marginBottom: 12 }}><span className="label">Veículo (OS)</span>
          <select className="input" id="orc-os" value={q.service_order_id ?? ""} disabled={locked} onChange={e => void setOS(e.target.value)}>
            <option value="">— escolha o veículo —</option>
            {osList.map(x => <option key={x.id} value={x.id}>{x.plate} · {x.model || ""} · {x.customer_name}</option>)}
          </select>
        </label>
        {locked && <p className="hint" style={{ margin: "0 0 12px" }}>{osFin
          ? "A O.S. deste orçamento foi finalizada: ele fica só para consulta."
          : "Orçamento aprovado: os itens e o desconto ficam travados. Para alterar, volte a situação para Rascunho; o cliente precisa aprovar de novo."}</p>}
        <div className="tbl-wrap"><table className="orc-itens">
          <thead><tr>
            <th style={{ width: 1 }}>Tipo</th><th>Descrição</th><th className="num" style={{ width: 58 }}>Qtd</th>
            <th className="num" style={{ width: 92 }}>Custo un.</th><th className="num" style={{ width: 70 }}>Markup</th>
            <th className="num" style={{ width: 96 }}>Preço</th><th className="num" style={{ width: 1 }}>Subtotal</th><th style={{ width: 1 }}></th>
          </tr></thead>
          <tbody>
            {items.map(i => {
              const peca = i.kind === "peca";
              const bad = !locked && !partPriceOk(i, minPct);
              // peça cadastrada: o custo vem do cadastro (linhas antigas, gravadas sem custo, continuam editáveis)
              const cad = !!i.product_id && custoCad.has(i.product_id) && i.unit_cost > 0;
              return (
              <tr key={i.id} className={`${i.kind}${bad ? " bad" : ""}`}>
                <td><span className="chip">{peca ? "Peça" : "Mão de obra"}</span></td>
                <td>
                  <input className="it-in" ref={el => { if (el) inputs.current.set(i.id, el); else inputs.current.delete(i.id); }}
                    aria-label="Descrição" readOnly={locked} value={i.description} placeholder="Descrição" onChange={e => edit(i.id, "description", e.target.value)} />
                  {i.details && <div className="hint" style={{ padding: "2px 8px 0" }}>{i.details}</div>}
                  {bad && <div className="it-err" role="alert">Abaixo do markup mínimo de {pct(minPct)}. Preço mínimo: <b className="mono">{brl(minPartPrice(i.unit_cost, minPct))}</b></div>}
                </td>
                <td className="it-v"><input className="it-in" aria-label="Quantidade" readOnly={locked} inputMode="decimal" style={{ textAlign: "right" }} value={i.qtyTxt} onChange={e => edit(i.id, "qty", e.target.value)} /></td>
                {peca ? <>
                  <td className="it-v"><input className="it-in" aria-label="Custo unitário" readOnly={locked || cad} inputMode="decimal" style={{ textAlign: "right" }}
                    title={cad ? "Custo do cadastro do produto" : undefined} value={i.costTxt} onChange={e => edit(i.id, "unit_cost", e.target.value)} /></td>
                  <td className="it-v"><input className={`it-in${bad ? " bad" : ""}`} aria-label="Markup (%)" readOnly={locked || !(i.unit_cost > 0)} inputMode="decimal" style={{ textAlign: "right" }}
                    placeholder="—" title={i.unit_cost > 0 ? "Markup sobre o custo (%): preço = custo × (1 + markup)" : "Informe o custo para calcular pelo markup"}
                    value={i.unit_cost > 0 ? i.marginTxt : ""} onChange={e => edit(i.id, "margin", e.target.value)} /></td>
                </> : <>
                  <td className="it-v num na"><span className="muted">—</span></td>
                  <td className="it-v num na"><span className="muted">—</span></td>
                </>}
                <td className="it-v"><input className={`it-in${bad ? " bad" : ""}`} aria-label="Preço unitário" aria-invalid={bad || undefined} readOnly={locked} inputMode="decimal" style={{ textAlign: "right" }} value={i.priceTxt} onChange={e => edit(i.id, "unit_price", e.target.value)} /></td>
                <td className="it-v it-sub num">{brl(i.qty * i.unit_price)}</td>
                <td>{!locked && <button className="del" onClick={() => void del(i.id)} aria-label="Remover item">×</button>}</td>
              </tr>
              );
            })}
          </tbody>
        </table></div>
        <p className="hint" style={{ margin: "8px 0 0" }}>{minPct > 0 ? `Markup mínimo para peças: ${pct(minPct)} sobre o custo. ` : ""}Custo e markup são só da oficina: não aparecem no PDF, no WhatsApp nem no link do cliente.</p>
        {!locked && <div className="row" style={{ marginTop: 12 }}>
          <button className="key" onClick={() => void insert({ kind: "peca", description: "", unit_price: 0 }, true)}>+ Peça</button>
          <button className="key" onClick={() => void insert({ kind: "mao", description: "Mão de obra", unit_price: 0 }, true)}>+ Mão de obra</button>
          <button className="key accent" onClick={() => { setModal("pecas"); sfx("tap"); }}>+ Peça cadastrada</button>
          <button className="key accent" onClick={() => { setModal("serv"); sfx("tap"); }}>+ Serviço cadastrado</button>
        </div>}
        <div className="grid2" style={{ marginTop: 14 }}>
          <div className="field"><span className="label">Desconto (R$)</span>
            <div className="row" style={{ flexWrap: "nowrap" }}>
              <span className="input mono" style={{ display: "flex", alignItems: "center", minHeight: 42 }}>{brl(q.discount || 0)}</span>
              {!locked && <button className="key sm" onClick={() => setModal("desc")} title="Exige senha de autorização">{IKEY}{q.discount ? "Alterar" : "Aplicar"}</button>}
            </div>
            <span className="hint">Exige a senha de autorização do administrador</span>
          </div>
          <label className="field"><span className="label">Validade (dias)</span>
            <input className="input" id="orc-val" inputMode="numeric" value={validade} onChange={e => setVal(e.target.value.replace(/\D/g, ""))} />
          </label>
        </div>
      </section>

      <aside className="stack sticky">
        <section className="panel">
          <div className="lcd stack" style={{ gap: 10 }}>
            <div className="lcd-row" style={{ justifyContent: "space-between" }}>
              <div className="lcd-cell"><span>Peças</span><strong>{brl(T.pecas)}</strong></div>
              <div className="lcd-cell"><span>Mão de obra</span><strong>{brl(T.mao)}</strong></div>
            </div>
            <div className="total-lcd"><span className="lcd-msg">TOTAL</span><strong>{brl(T.total)}</strong></div>
          </div>
          <div className="stack" style={{ marginTop: 14, gap: 8 }}>
            <div className="muted">{q.plate ? `Placa ${q.plate} · ` : ""}{c?.name || "Sem cliente"}</div>
            <a className="key wa" {...(wa ? { href: wa, target: "_blank", rel: "noopener" } : { "aria-disabled": true })}
              onClick={e => { if (!wa || barrado()) { e.preventDefault(); return; } void enviado(); }}>Enviar orçamento no WhatsApp</a>
            <button className="key" onClick={() => { if (!barrado()) void copyText(msg); }}>Copiar texto do orçamento</button>
            <button className="key" onClick={() => void go(`/orcamentos/${q.id}/pdf`)}>Gerar PDF do orçamento</button>
            <button className="key" onClick={() => void guia()}>Gerar guia de serviço</button>
          </div>
        </section>
        <section className="panel">
          <div className="ph"><h2>Situação</h2></div>
          <div className="grid2">
            {(Object.entries(ORC_ST) as [QQuote["status"], string][]).map(([k, l]) => (
              <button key={k} className={`key sm ${q.status === k ? "on" : ""}`} aria-disabled={osFin || undefined} onClick={() => void setStatus(k)}>{l}</button>
            ))}
          </div>
          <p className="hint" style={{ margin: "10px 0 0" }}>Ao aprovar, o carro passa automaticamente de Orçamento para Aprovado no quadro. O cliente também pode aprovar pelo link.</p>
          {o && <Link className="key" style={{ marginTop: 10, width: "100%" }} href={`/os/${o.id}`} onClick={e => { if (barrado()) e.preventDefault(); else void flush(); }}>Ir para a OS {o.number}</Link>}
        </section>
        {canDelete && <section className="panel flat">
          {osFin ? <span className="hint">A O.S. {o?.number} já foi finalizada: para apagar este orçamento, exclua a O.S.</span>
            : delPend
              ? <div className="stack" style={{ gap: 8 }}>
                  <span>Excluir o orçamento nº {q.number} e todos os itens? Não dá para desfazer.</span>
                  <div className="row">
                    <button className="key danger sm" onClick={() => void excluir()}>Excluir orçamento</button>
                    <button className="key sm" onClick={() => setDelPend(false)}>Cancelar</button>
                  </div></div>
              : <button className="key sm" onClick={() => setDelPend(true)}>Excluir orçamento</button>}
        </section>}
      </aside>

      {modal === "pecas" && <ProductPicker produtos={produtos} qtd={qtdProd} onAdd={x => void addProduto(x)} onClose={() => setModal(null)} modo="orcamento" />}
      {modal === "serv" && <ServicePicker servicos={servicos} qtd={qtdServ} onAdd={x => void addServico(x)} onClose={() => setModal(null)} />}
      {modal === "desc" && <DiscountModal number={q.number} subtotal={T.subtotal} current={q.discount} hasPassword={hasPassword} onClose={() => setModal(null)} onApply={applyDiscount} />}
    </div>
  );
}
