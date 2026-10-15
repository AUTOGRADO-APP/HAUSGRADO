"use client";
import { useCallback, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client.ts";
import { brl, round2 } from "@/lib/rules.ts";
import { FPAG, dataBR, fmtFone, parseNum, ymd } from "@/lib/labels.ts";
import { toast, sfx, errMsg } from "@/lib/ui.ts";
import type { PurchaseRow, SupplierRow } from "@/lib/fin-b.ts";
import { ProductPicker, type PickProduct } from "@/components/ProductPicker.tsx";
import { KeyField } from "../../despesas/fin-ui.tsx";

interface Item { desc: string; qtd: string; valor: string; product_id: string | null; sku: string | null }
interface Form {
  id: string | null; fornecedor: string; nf: string; dataCompra: string; dataReceb: string; frete: string; obs: string; itens: Item[];
  forma: string; vencimento: string; pago: boolean; pagoEm: string; codigo: string;
}
const nb = (v: number) => String(v ?? 0).replace(".", ",");
const itemVazio = (): Item => ({ desc: "", qtd: "1", valor: "0", product_id: null, sku: null });
function fromRow(c: PurchaseRow | null): Form {
  if (!c) return { id: null, fornecedor: "", nf: "", dataCompra: ymd(), dataReceb: "", frete: "0", obs: "", itens: [itemVazio()], forma: "", vencimento: "", pago: false, pagoEm: "", codigo: "" };
  return {
    id: c.id, fornecedor: c.supplier_name, nf: c.invoice_number ?? "", dataCompra: c.purchased_on, dataReceb: c.received_on ?? "", frete: nb(c.freight), obs: c.notes ?? "",
    itens: c.items.length ? c.items.map(i => ({ desc: i.description, qtd: nb(i.qty), valor: nb(i.unit_cost), product_id: i.product_id, sku: i.sku })) : [itemVazio()],
    forma: c.payment_method, vencimento: c.due_date ?? "", pago: c.paid, pagoEm: c.paid_on ?? "", codigo: c.payment_code ?? "",
  };
}

export function CompraEditor({ compra, suppliers, produtos }: { compra: PurchaseRow | null; suppliers: SupplierRow[]; produtos: PickProduct[] }) {
  const router = useRouter();
  const [C, setC] = useState<Form>(() => fromRow(compra));
  const [pk, setPk] = useState(false);
  const [pend, setPend] = useState(false);
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<Form>) => setC(c => ({ ...c, ...p }));
  const setItem = (ix: number, p: Partial<Item>) => setC(c => ({ ...c, itens: c.itens.map((i, k) => (k === ix ? { ...i, ...p } : i)) }));
  const closePk = useCallback(() => setPk(false), []);

  const linha = (i: Item) => parseNum(i.qtd) * parseNum(i.valor);
  const sub = round2(C.itens.reduce((a, i) => a + linha(i), 0));
  const frete = parseNum(C.frete);
  const forn = [...suppliers.map(f => f.name)].sort((a, b) => a.localeCompare(b));
  const fsel = suppliers.find(f => f.name.toLowerCase() === C.fornecedor.trim().toLowerCase());
  const qtdPorProd: Record<string, number> = {};
  C.itens.forEach(i => { if (i.product_id) qtdPorProd[i.product_id] = (qtdPorProd[i.product_id] || 0) + parseNum(i.qtd); });

  function escolheForma(k: string) {
    setC(c => {
      const f = suppliers.find(x => x.name.toLowerCase() === c.fornecedor.trim().toLowerCase());
      return { ...c, forma: k, codigo: k === "pix" && f?.pix_key && !c.codigo ? f.pix_key : c.codigo };
    });
    if (k === "boleto") setTimeout(() => document.getElementById("cp-venc")?.focus(), 0);
  }

  function addProduto(x: PickProduct) {
    setC(c => {
      const itens = [...c.itens];
      const ex = itens.findIndex(i => i.product_id === x.id);
      if (ex >= 0) itens[ex] = { ...itens[ex], qtd: nb(parseNum(itens[ex].qtd) + 1) };
      else {
        const it: Item = { desc: x.name + (x.manufacturer ? " " + x.manufacturer : ""), qtd: "1", valor: nb(Number(x.cost) || 0), product_id: x.id, sku: x.sku };
        const vz = itens.findIndex(i => !i.desc.trim() && !parseNum(i.valor));
        if (vz >= 0) itens[vz] = it; else itens.push(it);
      }
      return { ...c, itens };
    });
    toast(`${x.name} adicionado à compra`, { sound: "ok" });
  }

  function addItem() {
    setC(c => ({ ...c, itens: [...c.itens, itemVazio()] }));
    setTimeout(() => { const l = document.querySelectorAll<HTMLInputElement>('[id^="ci-d-"]'); l[l.length - 1]?.focus(); }, 0);
  }
  function delItem(ix: number) {
    setC(c => { const itens = c.itens.filter((_, k) => k !== ix); return { ...c, itens: itens.length ? itens : [itemVazio()] }; });
  }

  async function salvar() {
    const nome = C.fornecedor.trim();
    if (!nome) return toast("Informe o fornecedor");
    if (!C.dataCompra) return toast("Informe a data da compra");
    const itens = C.itens.filter(i => i.desc.trim() || parseNum(i.valor));
    if (!itens.length) return toast("Adicione pelo menos uma peça na compra");
    if (itens.some(i => !i.desc.trim())) return toast("Informe a descrição de cada peça");
    if (itens.some(i => !(parseNum(i.qtd) > 0))) return toast("Informe a quantidade de cada peça");
    if (!C.forma) return toast("Escolha a forma de pagamento");
    if (C.forma === "boleto" && !C.vencimento) return toast("Informe o vencimento do boleto");
    if (C.dataReceb && C.dataReceb < C.dataCompra) return toast("Não foi possível salvar: o recebimento está antes da data da compra.");

    setBusy(true);
    const sb = createClient();
    const fail = (e: { message?: string } | null) => { setBusy(false); toast(errMsg(e), { err: true }); };
    // fornecedor novo é cadastrado antes da compra
    let supplierId = fsel?.id;
    if (!supplierId) {
      const { data, error } = await sb.from("suppliers").insert({ name: nome }).select("id").single();
      if (error || !data) return fail(error);
      supplierId = data.id as string;
    }
    const boleto = C.forma === "boleto";
    const pago = boleto ? C.pago : true;
    const data = {
      supplier_id: supplierId, invoice_number: C.nf.trim() || null, purchased_on: C.dataCompra, received_on: C.dataReceb || null,
      freight: round2(frete), notes: C.obs.trim() || null, payment_method: C.forma,
      payment_code: ["boleto", "pix", "transferencia"].includes(C.forma) ? C.codigo.trim() || null : null,
      due_date: boleto ? C.vencimento : null, paid: pago, paid_on: boleto ? (pago ? C.pagoEm || ymd() : null) : C.dataCompra,
    };
    let id = C.id;
    if (id) {
      const { error } = await sb.from("purchases").update(data).eq("id", id);
      if (error) return fail(error);
      const { error: e2 } = await sb.from("purchase_items").delete().eq("purchase_id", id);
      if (e2) return fail(e2);
    } else {
      const { data: row, error } = await sb.from("purchases").insert(data).select("id").single();
      if (error || !row) return fail(error);
      id = row.id as string;
    }
    const { error: e3 } = await sb.from("purchase_items").insert(itens.map((i, k) => ({
      purchase_id: id, description: i.desc.trim(), qty: parseNum(i.qtd), unit_cost: round2(parseNum(i.valor)), product_id: i.product_id, sku: i.sku, position: k,
    })));
    if (e3) return fail(e3);
    setBusy(false);
    toast(C.id ? "Compra atualizada" : (boleto ? "Compra registrada · boleto no calendário financeiro" : "Compra registrada"), { sound: "ok" });
    router.push("/financeiro/compras");
    router.refresh();
  }

  async function excluir() {
    if (!C.id) return;
    setPend(false);
    const { error } = await createClient().from("purchases").delete().eq("id", C.id);
    if (error) return toast(errMsg(error), { err: true });
    toast("Compra excluída");
    router.push("/financeiro/compras");
    router.refresh();
  }

  return (
    <div className="split">
      <section className="panel">
        <div className="ph"><h2>{C.id ? "Compra" : "Nova compra"}</h2><Link className="key" href="/financeiro/compras">‹ Lista</Link></div>
        <div className="grid2">
          <label className="field"><span className="label">Fornecedor *</span>
            <input className="input" id="cp-forn" list="cp-forns" value={C.fornecedor} onChange={e => set({ fornecedor: e.target.value })} placeholder="Nome do fornecedor" autoFocus={!C.id} />
            <span className="hint">{fsel ? `Vendedor: ${fsel.salesperson || "—"} · ${fmtFone(fsel.salesperson_phone) || ""}` : C.fornecedor.trim() ? "Fornecedor novo: será cadastrado ao salvar" : "Escolha da lista ou digite um novo"}</span>
            <datalist id="cp-forns">{forn.map(f => <option key={f} value={f} />)}</datalist>
          </label>
          <label className="field"><span className="label">Nota fiscal</span><input className="input mono" id="cp-nf" value={C.nf} onChange={e => set({ nf: e.target.value })} placeholder="Nº da NF (opcional)" /></label>
        </div>
        <div className="grid3" style={{ marginTop: 12 }}>
          <label className="field"><span className="label">Data da compra *</span><input className="input mono" type="date" id="cp-dc" value={C.dataCompra} onChange={e => set({ dataCompra: e.target.value })} /></label>
          <label className="field"><span className="label">Data do recebimento</span><input className="input mono" type="date" id="cp-dr" value={C.dataReceb} onChange={e => set({ dataReceb: e.target.value })} /><span className="hint">{C.dataReceb ? "Os produtos cadastrados entram no estoque" : "Deixe vazio se ainda não chegou. Ao preencher, os produtos cadastrados entram no estoque"}</span></label>
          <label className="field"><span className="label">Frete de entrega (R$)</span><input className="input" id="cp-frete" inputMode="decimal" value={C.frete} onChange={e => set({ frete: e.target.value })} /></label>
        </div>
        <div className="label" style={{ margin: "18px 0 4px" }}>Peças compradas</div>
        <div className="tbl-wrap"><table className="cp-itens"><thead><tr><th>Descrição</th><th className="num" style={{ width: 80 }}>Qtd</th><th className="num" style={{ width: 130 }}>Valor un.</th><th className="num" style={{ width: 120 }}>Subtotal</th><th style={{ width: 40 }}></th></tr></thead><tbody>
          {C.itens.map((i, ix) => (
            <tr key={ix}>
              <td><input className="it-in" id={`ci-d-${ix}`} value={i.desc} onChange={e => setItem(ix, { desc: e.target.value })} placeholder="Descrição da peça" />{i.product_id
                ? <div className="hint" style={{ paddingLeft: 8 }}><span className="mono">{i.sku || "sem SKU"}</span> · produto cadastrado, entra no estoque</div>
                : i.desc.trim() ? <div className="hint" style={{ paddingLeft: 8 }}>Item avulso: não entra no estoque</div> : null}</td>
              <td><input className="it-in" id={`ci-q-${ix}`} inputMode="decimal" style={{ textAlign: "right" }} value={i.qtd} onChange={e => setItem(ix, { qtd: e.target.value })} aria-label="Quantidade" /></td>
              <td><input className="it-in" id={`ci-v-${ix}`} inputMode="decimal" style={{ textAlign: "right" }} value={i.valor} onChange={e => setItem(ix, { valor: e.target.value })} aria-label="Valor unitário" /></td>
              <td className="num">{brl(linha(i))}</td>
              <td><button className="del" onClick={() => delItem(ix)} aria-label="Remover item">×</button></td>
            </tr>
          ))}
        </tbody></table></div>
        <div className="row" style={{ marginTop: 12 }}>
          <button className="key" onClick={addItem}>+ Item</button>
          <button className="key accent" onClick={() => { sfx("tap"); setPk(true); }}>+ Produto cadastrado</button>
        </div>
        <label className="field" style={{ marginTop: 14 }}><span className="label">Observações</span><textarea className="input" id="cp-obs" value={C.obs} onChange={e => set({ obs: e.target.value })} placeholder="Ex.: peças para a O.S. 1043" /></label>
      </section>
      <aside className="stack sticky">
        <section className="panel"><div className="lcd stack" style={{ gap: 10 }}>
          <div className="lcd-row" style={{ justifyContent: "space-between" }}>
            <div className="lcd-cell"><span>Peças</span><strong id="cp-sub">{brl(sub)}</strong></div>
            <div className="lcd-cell"><span>Frete</span><strong id="cp-fr">{brl(frete)}</strong></div>
          </div>
          <div className="total-lcd"><span className="lcd-msg">TOTAL DA COMPRA</span><strong id="cp-tot">{brl(round2(sub + frete))}</strong></div>
        </div></section>
        <section className="panel">
          <div className="ph"><h2>Pagamento</h2></div>
          <div className="stack">
            <div className="opt-grid">
              {FPAG.map(([k, l]) => (
                <label key={k} className={`opt ${C.forma === k ? "on" : ""}`}><input type="radio" name="cp-forma" id={`cpf-${k}`} checked={C.forma === k} onChange={() => escolheForma(k)} /><span>{l}</span></label>
              ))}
            </div>
            {C.forma === "boleto" ? (
              <>
                <label className="field"><span className="label">Vencimento do boleto *</span><input className="input mono" type="date" id="cp-venc" value={C.vencimento} onChange={e => set({ vencimento: e.target.value })} /><span className="hint">Fica no calendário financeiro como pagamento pendente</span></label>
                {C.id && <label className="row"><input type="checkbox" id="cp-pago" checked={C.pago} onChange={e => set({ pago: e.target.checked, pagoEm: e.target.checked ? ymd() : "" })} /> Boleto pago{C.pago && C.pagoEm ? ` em ${dataBR(C.pagoEm)}` : ""}</label>}
              </>
            ) : C.forma ? <span className="hint">Pagamento registrado como pago na data da compra.</span> : null}
            {(C.forma === "boleto" || C.forma === "pix" || C.forma === "transferencia") &&
              <KeyField id="cp-cod" label={C.forma === "boleto" ? "Código de barras do boleto" : "Chave pix do fornecedor"} value={C.codigo} onChange={v => set({ codigo: v })} />}
            <button className="key accent" style={{ padding: 13 }} disabled={busy} onClick={salvar}>{C.id ? "Salvar alterações" : "Registrar compra"}</button>
            {C.id && (pend
              ? <div className="row"><span>Excluir esta compra?</span><button className="key sm danger" onClick={excluir}>Excluir</button><button className="key sm" onClick={() => setPend(false)}>Cancelar</button></div>
              : <button className="key sm" onClick={() => setPend(true)}>Excluir compra</button>)}
          </div>
        </section>
      </aside>
      {pk && <ProductPicker produtos={produtos} qtd={qtdPorProd} onAdd={addProduto} onClose={closePk} modo="compra" />}
    </div>
  );
}
