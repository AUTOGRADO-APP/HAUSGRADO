"use client";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client.ts";
import { brl } from "@/lib/rules.ts";
import { ADIT, APIS, CATN, CATS, MARCAS, VISC, VOLS, digits, numBR, parseNum } from "@/lib/labels.ts";
import { eanOk, margem, prodResumo } from "@/lib/produtos.ts";
import { errMsg, toast } from "@/lib/ui.ts";

export interface Produto {
  id: string; name: string; manufacturer: string | null; sku: string | null; ean: string | null;
  cost: number; price: number; category: string;
  viscosity: string | null; api: string | null; volume: string | null; application_spec: string | null;
  application_brands: string[]; additive_type: string | null;
}
interface Form {
  id: string | null; nome: string; fabricante: string; sku: string; ean: string; custo: string; preco: string; categoria: string;
  visc: string; api: string; vol: string; espec: string; aplic: string[]; tipoAd: string;
}
const novo = (): Form => ({ id: null, nome: "", fabricante: "", sku: "", ean: "", custo: "", preco: "", categoria: "", visc: "", api: "", vol: "", espec: "", aplic: [], tipoAd: "" });
const doProduto = (p: Produto): Form => ({
  id: p.id, nome: p.name, fabricante: p.manufacturer ?? "", sku: p.sku ?? "", ean: p.ean ?? "",
  custo: numBR(p.cost), preco: numBR(p.price), categoria: p.category,
  visc: p.viscosity ?? "", api: p.api ?? "", vol: p.volume ?? "", espec: p.application_spec ?? "",
  aplic: [...(p.application_brands ?? [])], tipoAd: p.additive_type ?? "",
});

export function Produtos({ rows }: { rows: Produto[] }) {
  const router = useRouter();
  const [busca, setBusca] = useState("");
  const [cat, setCat] = useState("");
  const [F, setF] = useState<Form>(novo);
  const [pend, setPend] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const set = (p: Partial<Form>) => setF(f => ({ ...f, ...p }));

  const q = busca.toLowerCase();
  const list = rows.filter(x => (!cat || x.category === cat) && (!q || [x.name, x.manufacturer, x.sku, x.ean].join(" ").toLowerCase().includes(q)))
    .sort((a, b) => a.name.localeCompare(b.name));
  const cnt = (k: string) => rows.filter(x => x.category === k).length;
  const mg = margem(F.custo === "" ? 0 : parseNum(F.custo), F.preco === "" ? 0 : parseNum(F.preco));
  const eanBad = !!F.ean && !eanOk(F.ean);

  const chk = (name: "vol" | "api" | "aplic", opts: string[], single: boolean) => (
    <div className="opt-grid">{opts.map(o => {
      const on = single ? F[name] === o : (F[name] as string[]).includes(o);
      return (
        <label key={o} className={`opt ${on ? "on" : ""}`}>
          <input type="checkbox" id={`${name}-${o.replace(/\W/g, "")}`} checked={on} onChange={e => {
            if (single) set({ [name]: e.target.checked ? o : "" } as Partial<Form>);
            else { const a = F.aplic.filter(x => x !== o); if (e.target.checked) a.push(o); set({ aplic: a }); }
          }} /><span>{o}</span>
        </label>
      );
    })}</div>
  );

  let carac: ReactNode = null;
  if (F.categoria === "oleo_motor") carac = <>
    <div className="grid2">
      <label className="field"><span className="label">Viscosidade</span>
        <select className="input mono" id="pr-visc" value={F.visc} onChange={e => set({ visc: e.target.value })}>
          <option value="">— escolha —</option>{VISC.map(v => <option key={v}>{v}</option>)}
        </select></label>
      <div className="field"><span className="label">Volume</span>{chk("vol", VOLS, true)}</div>
    </div>
    <div className="field"><span className="label">API · marque uma</span>{chk("api", APIS, true)}</div>
    <label className="field"><span className="label">Especificação de aplicação</span>
      <textarea className="input" id="pr-espec" value={F.espec} onChange={e => set({ espec: e.target.value })} placeholder="Ex.: ACEA C3, VW 504.00/507.00, motores turbo…" /></label>
  </>;
  else if (F.categoria === "oleo_trans") carac = (
    <label className="field"><span className="label">Especificação de aplicação</span>
      <textarea className="input" id="pr-espec" value={F.espec} onChange={e => set({ espec: e.target.value })} placeholder="Ex.: Dexron VI, CVT, câmbio manual 75W90…" /></label>);
  else if (F.categoria === "peca" || F.categoria === "filtros") carac = (
    <div className="field">
      <span className="row" style={{ justifyContent: "space-between" }}><span className="label">Aplicação em · marque quantas quiser</span>
        <span className="row"><button type="button" className="lnk" onClick={() => set({ aplic: [...MARCAS] })}>Todas</button><button type="button" className="lnk" onClick={() => set({ aplic: [] })}>Limpar</button></span></span>
      {chk("aplic", MARCAS, false)}
    </div>);
  else if (F.categoria === "aditivos") carac = (
    <label className="field"><span className="label">Tipo</span>
      <select className="input" id="pr-tipo" value={F.tipoAd} onChange={e => set({ tipoAd: e.target.value })}>
        <option value="">— escolha —</option>{ADIT.map(v => <option key={v}>{v}</option>)}
      </select></label>);

  async function salvar() {
    if (!F.nome.trim()) return toast("Informe o nome do produto");
    if (!F.categoria) return toast("Selecione a categoria");
    const preco = parseNum(F.preco);
    if (F.preco === "" || !(preco > 0)) return toast("Informe o preço de venda");
    if (F.ean && !eanOk(F.ean)) return toast("Não foi possível validar o EAN. Confira os dígitos.");
    const sku = F.sku.trim().toUpperCase();
    if (sku && rows.some(p => p.id !== F.id && (p.sku ?? "").toUpperCase() === sku)) return toast("Esse SKU já está em outro produto", { err: true });
    const c = F.categoria;
    // Características que não se aplicam à categoria são descartadas.
    const keep = { viscosity: null as string | null, api: null as string | null, volume: null as string | null, application_spec: null as string | null, application_brands: [] as string[], additive_type: null as string | null };
    if (c === "oleo_motor") Object.assign(keep, { viscosity: F.visc || null, api: F.api || null, volume: F.vol || null, application_spec: F.espec.trim() || null });
    else if (c === "oleo_trans") keep.application_spec = F.espec.trim() || null;
    else if (c === "peca" || c === "filtros") keep.application_brands = MARCAS.filter(m => F.aplic.includes(m));
    else if (c === "aditivos") keep.additive_type = F.tipoAd || null;
    const data = {
      name: F.nome.trim(), manufacturer: F.fabricante.trim() || null, sku: sku || null, ean: digits(F.ean) || null,
      cost: parseNum(F.custo) || 0, price: preco, category: c, ...keep,
    };
    setSalvando(true);
    const sb = createClient();
    const { error } = F.id ? await sb.from("products").update(data).eq("id", F.id) : await sb.from("products").insert(data);
    setSalvando(false);
    if (error) return toast(error.code === "23505" ? "Esse SKU já está em outro produto" : errMsg(error), { err: true });
    toast(F.id ? "Produto atualizado" : "Produto cadastrado", { sound: "ok" });
    setF(novo());
    router.refresh();
  }

  async function excluir() {
    if (!F.id) return;
    const { error } = await createClient().from("products").delete().eq("id", F.id);
    if (error) return toast(errMsg(error), { err: true });
    setF(novo()); setPend(false);
    toast("Produto excluído");
    router.refresh();
  }

  const editar = (x: Produto) => {
    setF(doProduto(x)); setPend(false);
    if (window.innerWidth < 920) document.getElementById("pr-nome")?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  return (
    <main id="view">
      <div className="split" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(340px,38%)" }}>
        <section className="panel">
          <div className="ph"><h2>Produtos</h2>
            <span className="row"><span className="count">{rows.length}</span>
              <input className="input" id="pr-busca" placeholder="Buscar nome, fabricante, SKU ou EAN" value={busca} onChange={e => setBusca(e.target.value)} style={{ width: 280, maxWidth: "100%" }} /></span>
          </div>
          <div className="row" style={{ marginBottom: 12 }}>
            <button className={`key sm ${!cat ? "on" : ""}`} onClick={() => setCat("")}>Todos</button>
            {CATS.map(([k, l]) => <button key={k} className={`key sm ${cat === k ? "on" : ""}`} onClick={() => setCat(k)}>{l} <span className="count">{cnt(k)}</span></button>)}
          </div>
          <div className="tbl-wrap"><table><thead><tr><th>Produto</th><th>Categoria</th><th>SKU / EAN</th><th className="num">Custo</th><th className="num">Preço</th><th className="num">Margem</th></tr></thead><tbody>
            {list.map(x => {
              const m = margem(x.cost, x.price), r = prodResumo(x);
              return (
                <tr key={x.id} className={`click ${F.id === x.id ? "sel" : ""}`} onClick={() => editar(x)}>
                  <td><b>{x.name}</b><div className="hint">{x.manufacturer || "—"}{r ? " · " + r : ""}</div></td>
                  <td><span className="chip">{CATN[x.category] || "—"}</span></td>
                  <td className="mono" style={{ fontSize: "9.5pt" }}>{x.sku || "—"}<div className="hint mono">{x.ean || ""}</div></td>
                  <td className="num">{brl(x.cost)}</td>
                  <td className="num"><b>{brl(x.price)}</b></td>
                  <td className="num">{m == null ? "—" : <span className={`dl ${m >= 30 ? "up" : m < 10 ? "down" : ""}`}>{m}%</span>}</td>
                </tr>
              );
            })}
            {!list.length && <tr><td colSpan={6}><div className="empty">{rows.length ? "Nenhum produto encontrado com esse filtro" : "Nenhum produto cadastrado. Use o formulário ao lado."}</div></td></tr>}
          </tbody></table></div>
        </section>
        <aside className="stack sticky"><section className="panel">
          <div className="ph"><h2>{F.id ? "Editar produto" : "Novo produto"}</h2>{F.id && <button className="key sm" onClick={() => { setF(novo()); setPend(false); document.getElementById("pr-nome")?.focus(); }}>+ Novo</button>}</div>
          <div className="stack">
            <label className="field"><span className="label">Nome *</span>
              <input className="input" id="pr-nome" value={F.nome} onChange={e => set({ nome: e.target.value })} placeholder="Ex.: Óleo sintético 5W30" /></label>
            <div className="grid2">
              <label className="field"><span className="label">Fabricante</span>
                <input className="input" id="pr-fab" value={F.fabricante} onChange={e => set({ fabricante: e.target.value })} /></label>
              <label className="field"><span className="label">Categoria *</span>
                <select className="input" id="pr-cat" value={F.categoria} onChange={e => set({ categoria: e.target.value })}>
                  <option value="">— escolha —</option>{CATS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select></label>
            </div>
            <div className="grid2">
              <label className="field"><span className="label">Código SKU</span>
                <input className="input mono" id="pr-sku" value={F.sku} onChange={e => set({ sku: e.target.value.toUpperCase() })} style={{ textTransform: "uppercase" }} /></label>
              <label className="field"><span className="label">Código de barras EAN</span>
                <input className={`input mono ${eanBad ? "bad" : ""}`} id="pr-ean" inputMode="numeric" maxLength={13} value={F.ean} onChange={e => set({ ean: digits(e.target.value).slice(0, 13) })} />
                <span className="hint" id="pr-ean-h" style={eanBad ? { color: "var(--danger)" } : undefined}>{eanBad ? "EAN inválido (confira os 13 dígitos)" : "8 ou 13 dígitos"}</span></label>
            </div>
            <div className="grid3">
              <label className="field"><span className="label">Custo (R$)</span>
                <input className="input" id="pr-custo" inputMode="decimal" value={F.custo} onChange={e => set({ custo: e.target.value })} /></label>
              <label className="field"><span className="label">Preço (R$) *</span>
                <input className="input" id="pr-preco" inputMode="decimal" value={F.preco} onChange={e => set({ preco: e.target.value })} /></label>
              <div className="field"><span className="label">Margem</span><b className="mono margin-box" id="pr-mg">{mg == null ? "—" : mg + "%"}</b></div>
            </div>
            {F.categoria
              ? <div className="carac"><div className="label" style={{ color: "var(--accent)" }}>Características · {CATN[F.categoria]}</div>{carac}</div>
              : <div className="empty">Escolha a categoria para ver as características</div>}
            <button className="key accent" style={{ padding: 13 }} disabled={salvando} onClick={salvar}>{F.id ? "Salvar alterações" : "Cadastrar produto"}</button>
            {F.id && (pend
              ? <div className="row"><span>Excluir este produto?</span><button className="key sm danger" onClick={excluir}>Excluir</button><button className="key sm" onClick={() => setPend(false)}>Cancelar</button></div>
              : <button className="key sm" onClick={() => setPend(true)}>Excluir produto</button>)}
          </div>
        </section></aside>
      </div>
    </main>
  );
}
