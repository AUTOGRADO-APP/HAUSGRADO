"use client";
// Editor de orçamento (seção 7.9): itens editáveis na linha, peça/serviço cadastrado, desconto protegido,
// validade, totais, WhatsApp, PDF, guia de serviço e situação.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client.ts";
import { brl, quoteTotals } from "@/lib/rules.ts";
import { ORC_ST, numBR, parseNum } from "@/lib/labels.ts";
import { msgOrc, portalLink, waURL } from "@/lib/msgs.ts";
import { copyText, errMsg, sfx, toast } from "@/lib/ui.ts";
import { ProductPicker, type PickProduct } from "@/components/ProductPicker.tsx";
import { ServicePicker } from "@/components/orc-servicos.tsx";
import { DiscountModal } from "@/components/orc-desconto.tsx";
import { IKEY } from "@/components/icons.tsx";
import type { QItem, QQuote, QuoteBundle } from "../data.ts";

export interface OSOpt { id: string; number: number; plate: string; model: string | null; status: string; customer_id: string; customer_name: string }
export interface ServOpt { id: string; name: string; description: string | null; price: number }

type LItem = QItem & { qtyTxt: string; priceTxt: string };
type Patch = Partial<Pick<QItem, "description" | "qty" | "unit_price" | "product_id" | "service_id" | "sku" | "details" | "kind">>;
const toL = (i: QItem): LItem => ({ ...i, qtyTxt: String(i.qty).replace(".", ","), priceTxt: numBR(i.unit_price) || "0" });
const COLS = "id, kind, description, details, qty, unit_price, product_id, service_id, sku, position";

export function Editor({ bundle, osList, produtos, servicos, hasPassword }: {
  bundle: QuoteBundle; osList: OSOpt[]; produtos: PickProduct[]; servicos: ServOpt[]; hasPassword: boolean;
}) {
  const sb = useMemo(() => createClient(), []);
  const router = useRouter();
  const { customer: c, os: o, shop } = bundle;
  const [q, setQ] = useState<QQuote>(bundle.quote);
  const [items, setItems] = useState<LItem[]>(() => bundle.items.map(toL));
  const [validade, setValidade] = useState(String(bundle.quote.validity_days));
  const [modal, setModal] = useState<null | "pecas" | "serv" | "desc">(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const pend = useRef(new Map<string, { patch: Patch; t: ReturnType<typeof setTimeout> }>());
  const valT = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputs = useRef(new Map<string, HTMLInputElement>());

  // quando o servidor manda dados novos (refresh/tempo real), sincroniza o que não está sendo editado
  useEffect(() => {
    setQ(bundle.quote);
    if (!pend.current.size) setItems(bundle.items.map(toL));
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

  function edit(id: string, f: "description" | "qty" | "unit_price", v: string) {
    setItems(its => its.map(i => {
      if (i.id !== id) return i;
      if (f === "description") return { ...i, description: v };
      if (f === "qty") { const n = parseNum(v); return { ...i, qtyTxt: v, qty: n > 0 ? n : i.qty }; }
      return { ...i, priceTxt: v, unit_price: Math.max(0, parseNum(v)) };
    }));
    if (f === "description") queue(id, { description: v });
    else if (f === "qty") { const n = parseNum(v); if (n > 0) queue(id, { qty: n }); }
    else queue(id, { unit_price: Math.max(0, parseNum(v)) });
  }

  const nextPos = () => items.reduce((m, i) => Math.max(m, i.position), -1) + 1;
  async function insert(row: Omit<Patch, "kind"> & { kind: "peca" | "mao" }, focus = false) {
    const { data, error } = await sb.from("quote_items").insert({ quote_id: q.id, qty: 1, position: nextPos(), ...row }).select(COLS).single();
    if (error || !data) { toast(errMsg(error), { err: true }); return null; }
    const it = toL({ ...(data as QItem), qty: Number(data.qty), unit_price: Number(data.unit_price) });
    setItems(its => [...its, it]);
    if (focus) setFocusId(it.id);
    return it;
  }
  async function del(id: string) {
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
    const desc = x.name + (x.manufacturer ? " " + x.manufacturer : "");
    const ex = items.find(i => i.product_id === x.id);
    if (ex) await replace(ex.id, { qty: ex.qty + 1 });
    else {
      const vz = items.find(i => i.kind === "peca" && !i.description && !i.unit_price);
      const patch: Patch = { description: desc, qty: 1, unit_price: Number(x.price) || 0, product_id: x.id, sku: x.sku };
      if (vz) await replace(vz.id, patch); else await insert({ kind: "peca", ...patch });
    }
    const disp = (x.stock_qty ?? 0) - (x.reserved ?? 0), nova = (ex?.qty ?? 0) + 1;
    if (x.stock_qty != null && nova > disp) toast(`${x.name} adicionada · estoque disponível: ${String(Math.max(0, disp)).replace(".", ",")}. Confira antes de prometer a peça.`);
    else toast(`${x.name} adicionada ao orçamento`, { sound: "ok" });
  }
  async function addServico(x: ServOpt) {
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
  async function go(path: string) { await flush(); router.push(path); }
  async function guia() {
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
          <select className="input" id="orc-os" value={q.service_order_id ?? ""} onChange={e => void setOS(e.target.value)}>
            <option value="">— escolha o veículo —</option>
            {osList.map(x => <option key={x.id} value={x.id}>{x.plate} · {x.model || ""} · {x.customer_name}</option>)}
          </select>
        </label>
        <div className="tbl-wrap"><table className="orc-itens">
          <thead><tr><th style={{ width: 1 }}>Tipo</th><th>Descrição</th><th className="num" style={{ width: 64 }}>Qtd</th><th className="num" style={{ width: 96 }}>Valor un.</th><th className="num" style={{ width: 1 }}>Subtotal</th><th style={{ width: 1 }}></th></tr></thead>
          <tbody>
            {items.map(i => (
              <tr key={i.id}>
                <td><span className="chip">{i.kind === "peca" ? "Peça" : "Mão de obra"}</span></td>
                <td>
                  <input className="it-in" ref={el => { if (el) inputs.current.set(i.id, el); else inputs.current.delete(i.id); }}
                    aria-label="Descrição" value={i.description} placeholder="Descrição" onChange={e => edit(i.id, "description", e.target.value)} />
                  {i.details && <div className="hint" style={{ padding: "2px 8px 0" }}>{i.details}</div>}
                </td>
                <td><input className="it-in" aria-label="Quantidade" inputMode="decimal" style={{ textAlign: "right" }} value={i.qtyTxt} onChange={e => edit(i.id, "qty", e.target.value)} /></td>
                <td><input className="it-in" aria-label="Valor unitário" inputMode="decimal" style={{ textAlign: "right" }} value={i.priceTxt} onChange={e => edit(i.id, "unit_price", e.target.value)} /></td>
                <td className="num">{brl(i.qty * i.unit_price)}</td>
                <td><button className="del" onClick={() => void del(i.id)} aria-label="Remover item">×</button></td>
              </tr>
            ))}
          </tbody>
        </table></div>
        <div className="row" style={{ marginTop: 12 }}>
          <button className="key" onClick={() => void insert({ kind: "peca", description: "", unit_price: 0 }, true)}>+ Peça</button>
          <button className="key" onClick={() => void insert({ kind: "mao", description: "Mão de obra", unit_price: 0 }, true)}>+ Mão de obra</button>
          <button className="key accent" onClick={() => { setModal("pecas"); sfx("tap"); }}>+ Peça cadastrada</button>
          <button className="key accent" onClick={() => { setModal("serv"); sfx("tap"); }}>+ Serviço cadastrado</button>
        </div>
        <div className="grid2" style={{ marginTop: 14 }}>
          <div className="field"><span className="label">Desconto (R$)</span>
            <div className="row" style={{ flexWrap: "nowrap" }}>
              <span className="input mono" style={{ display: "flex", alignItems: "center", minHeight: 42 }}>{brl(q.discount || 0)}</span>
              <button className="key sm" onClick={() => setModal("desc")} title="Exige senha de autorização">{IKEY}{q.discount ? "Alterar" : "Aplicar"}</button>
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
              onClick={e => { if (!wa) { e.preventDefault(); return; } void enviado(); }}>Enviar orçamento no WhatsApp</a>
            <button className="key" onClick={() => void copyText(msg)}>Copiar texto do orçamento</button>
            <button className="key" onClick={() => void go(`/orcamentos/${q.id}/pdf`)}>Gerar PDF do orçamento</button>
            <button className="key" onClick={() => void guia()}>Gerar guia de serviço</button>
          </div>
        </section>
        <section className="panel">
          <div className="ph"><h2>Situação</h2></div>
          <div className="grid2">
            {(Object.entries(ORC_ST) as [QQuote["status"], string][]).map(([k, l]) => (
              <button key={k} className={`key sm ${q.status === k ? "on" : ""}`} onClick={() => void setStatus(k)}>{l}</button>
            ))}
          </div>
          <p className="hint" style={{ margin: "10px 0 0" }}>Ao aprovar, o carro passa automaticamente de Orçamento para Aprovado no quadro. O cliente também pode aprovar pelo link.</p>
          {o && <Link className="key" style={{ marginTop: 10, width: "100%" }} href={`/os/${o.id}`} onClick={() => void flush()}>Ir para a OS {o.number}</Link>}
        </section>
      </aside>

      {modal === "pecas" && <ProductPicker produtos={produtos} qtd={qtdProd} onAdd={x => void addProduto(x)} onClose={() => setModal(null)} modo="orcamento" />}
      {modal === "serv" && <ServicePicker servicos={servicos} qtd={qtdServ} onAdd={x => void addServico(x)} onClose={() => setModal(null)} />}
      {modal === "desc" && <DiscountModal number={q.number} subtotal={T.subtotal} current={q.discount} hasPassword={hasPassword} onClose={() => setModal(null)} onApply={applyDiscount} />}
    </div>
  );
}
