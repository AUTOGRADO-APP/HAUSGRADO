"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client.ts";
import { brl } from "@/lib/rules.ts";
import { ADIT, APIS, CATN, CATS, MARCAS, VISC, VOLS, digits, numBR, parseNum } from "@/lib/labels.ts";
import { eanOk, fmtNcm, margem, ncmOk, prodResumo } from "@/lib/produtos.ts";
import { errMsg, toast } from "@/lib/ui.ts";
import { deltaAjuste, estoqueBaixo, estoqueSit, qtdBR } from "@/lib/estoque.ts";
import { carregaBalanco, mmss, setBalanco, useBalanco, useRestante } from "@/lib/balanco.ts";
import { EstoquePanel } from "./EstoquePanel.tsx";
import { BalancoModal } from "./BalancoModal.tsx";
import { MascotImg } from "@/components/Mascot.tsx";

export interface Produto {
  id: string; name: string; manufacturer: string | null; sku: string | null; ean: string | null; ncm: string | null;
  cost: number; price: number; category: string;
  viscosity: string | null; api: string | null; volume: string | null; application_spec: string | null;
  application_brands: string[]; additive_type: string | null;
  stock_qty: number; min_stock: number; reserved: number; incoming: number;
}
interface Form {
  id: string | null; nome: string; fabricante: string; sku: string; ean: string; ncm: string; custo: string; preco: string; categoria: string;
  visc: string; api: string; vol: string; espec: string; aplic: string[]; tipoAd: string;
  minimo: string; inicial: string;
}
const novo = (): Form => ({ id: null, nome: "", fabricante: "", sku: "", ean: "", ncm: "", custo: "", preco: "", categoria: "", visc: "", api: "", vol: "", espec: "", aplic: [], tipoAd: "", minimo: "", inicial: "" });
const doProduto = (p: Produto): Form => ({
  id: p.id, nome: p.name, fabricante: p.manufacturer ?? "", sku: p.sku ?? "", ean: p.ean ?? "", ncm: fmtNcm(p.ncm),
  custo: numBR(p.cost), preco: numBR(p.price), categoria: p.category,
  visc: p.viscosity ?? "", api: p.api ?? "", vol: p.volume ?? "", espec: p.application_spec ?? "",
  aplic: [...(p.application_brands ?? [])], tipoAd: p.additive_type ?? "",
  minimo: numBR(p.min_stock), inicial: "",
});

/** Célula de contagem do balanço: digita o que tem na prateleira; Enter (ou sair do campo) grava a diferença. */
function Contagem({ p, conferido, onSaved }: { p: Produto; conferido: boolean; onSaved: (id: string) => void }) {
  const router = useRouter();
  const [v, setV] = useState("");
  const [busy, setBusy] = useState(false);
  const enviado = useRef<string | null>(null);
  async function salvar() {
    const t = v.trim();
    if (t === "" || enviado.current === t) return;
    const n = parseNum(t);
    if (!(n >= 0)) return toast("Informe a quantidade contada (zero ou mais)");
    enviado.current = t;
    const delta = deltaAjuste("inventario", n, p.stock_qty);
    if (delta !== 0) {
      setBusy(true);
      const { error } = await createClient().rpc("adjust_stock", { p_product: p.id, p_qty: delta, p_reason: "Balanço (contagem)" });
      setBusy(false);
      if (error) { enviado.current = null; return toast(errMsg(error), { err: true }); }
      toast(`${p.name}: ${qtdBR(p.stock_qty)} → ${qtdBR(n)}`, { sound: "ok" });
      router.refresh();
    }
    setV(""); enviado.current = null;
    onSaved(p.id);
  }
  return (
    <div className="bal-cell">
      <input className="input mono bal-in" inputMode="decimal" aria-label={`Quantidade contada de ${p.name}`} placeholder={qtdBR(p.stock_qty)}
        value={v} disabled={busy} onChange={e => setV(e.target.value)} onBlur={() => void salvar()}
        onKeyDown={e => {
          if (e.key !== "Enter") return;
          e.preventDefault(); void salvar();
          const all = [...document.querySelectorAll<HTMLInputElement>(".bal-in")];
          all[all.indexOf(e.currentTarget) + 1]?.focus();
        }} />
      <span className="hint mono bal-sis">{conferido ? <span className="chip ok bal-ok">Conferido</span> : null} no sistema: <b className={p.stock_qty < 0 ? "est-neg" : ""}>{qtdBR(p.stock_qty)}</b></span>
    </div>
  );
}

export function Produtos({ rows, filtroInicial = "", hasPassword }: { rows: Produto[]; filtroInicial?: string; hasPassword: boolean }) {
  const router = useRouter();
  const fimBal = useBalanco(), restBal = useRestante(fimBal), bal = fimBal != null;
  const [modalBal, setModalBal] = useState(false);
  const [conferidos, setConferidos] = useState<Set<string>>(() => new Set());
  const encerrou = useRef(false);
  const antes = useRef<number | null>(null);
  useEffect(() => { void carregaBalanco(); }, []);
  useEffect(() => {
    if (antes.current != null && fimBal == null && !encerrou.current) toast("O modo balanço terminou. O estoque voltou a ficar travado.");
    if (fimBal != null) encerrou.current = false;
    antes.current = fimBal;
  }, [fimBal]);
  async function encerrar() {
    encerrou.current = true;
    const { error } = await createClient().rpc("end_stock_count");
    if (error) { encerrou.current = false; return toast(errMsg(error), { err: true }); }
    setBalanco(null); setConferidos(new Set());
    toast("Balanço encerrado", { sound: "ok" });
  }
  const [busca, setBusca] = useState("");
  const [cat, setCat] = useState(filtroInicial);
  const [F, setF] = useState<Form>(novo);
  const [pend, setPend] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const set = (p: Partial<Form>) => setF(f => ({ ...f, ...p }));

  const q = busca.toLowerCase();
  const list = rows.filter(x => (!cat || (cat === "baixo" ? estoqueBaixo(x) || x.stock_qty < 0 : x.category === cat)) && (!q || [x.name, x.manufacturer, x.sku, x.ean, x.ncm, fmtNcm(x.ncm)].join(" ").toLowerCase().includes(q)))
    .sort((a, b) => a.name.localeCompare(b.name));
  const cnt = (k: string) => rows.filter(x => x.category === k).length;
  const nBaixo = rows.filter(x => estoqueBaixo(x) || x.stock_qty < 0).length;
  const aberto = F.id ? rows.find(x => x.id === F.id) : undefined;
  const mg = margem(F.custo === "" ? 0 : parseNum(F.custo), F.preco === "" ? 0 : parseNum(F.preco));
  const eanBad = !!F.ean && !eanOk(F.ean);
  const ncmBad = !!F.ncm && !ncmOk(F.ncm);

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
    if (!ncmOk(F.ncm)) return toast("O NCM tem 8 dígitos. Confira o código.");
    const sku = F.sku.trim().toUpperCase();
    const minimo = parseNum(F.minimo), inicial = parseNum(F.inicial);
    if (minimo < 0) return toast("Informe um estoque mínimo de zero ou mais");
    if (!F.id && bal && inicial < 0) return toast("Informe um estoque inicial de zero ou mais");
    if (sku && rows.some(p => p.id !== F.id && (p.sku ?? "").toUpperCase() === sku)) return toast("Esse SKU já está em outro produto", { err: true });
    const c = F.categoria;
    // Características que não se aplicam à categoria são descartadas.
    const keep = { viscosity: null as string | null, api: null as string | null, volume: null as string | null, application_spec: null as string | null, application_brands: [] as string[], additive_type: null as string | null };
    if (c === "oleo_motor") Object.assign(keep, { viscosity: F.visc || null, api: F.api || null, volume: F.vol || null, application_spec: F.espec.trim() || null });
    else if (c === "oleo_trans") keep.application_spec = F.espec.trim() || null;
    else if (c === "peca" || c === "filtros") keep.application_brands = MARCAS.filter(m => F.aplic.includes(m));
    else if (c === "aditivos") keep.additive_type = F.tipoAd || null;
    const data = {
      name: F.nome.trim(), manufacturer: F.fabricante.trim() || null, sku: sku || null, ean: digits(F.ean) || null, ncm: digits(F.ncm) || null,
      cost: parseNum(F.custo) || 0, price: preco, category: c, ...keep, min_stock: minimo || 0,
    };
    setSalvando(true);
    const sb = createClient();
    const { data: row, error } = F.id ? await sb.from("products").update(data).eq("id", F.id).select("id").single() : await sb.from("products").insert(data).select("id").single();
    if (error) { setSalvando(false); return toast(error.code === "23505" ? "Esse SKU já está em outro produto" : errMsg(error), { err: true }); }
    if (!F.id && bal && inicial > 0 && row) {
      const { error: e2 } = await sb.rpc("adjust_stock", { p_product: row.id, p_qty: inicial, p_reason: "Estoque inicial" });
      if (e2) toast("Produto cadastrado, mas o estoque inicial não foi lançado: " + errMsg(e2), { err: true });
    }
    setSalvando(false);
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
              <input className="input" id="pr-busca" placeholder="Buscar nome, fabricante, SKU, EAN ou NCM" value={busca} onChange={e => setBusca(e.target.value)} style={{ width: 280, maxWidth: "100%" }} />
              {!bal && <button className="key" id="pr-balanco" onClick={() => setModalBal(true)}>{IBOX}Balanço</button>}</span>
          </div>
          {bal && (
            <div className="bal-bar" role="status" id="pr-bal-bar">
              <span className="bal-led" aria-hidden="true" />
              <span className="bal-pet" aria-hidden="true"><MascotImg pose="balanco" w={60} /></span>
              <div className="bal-txt"><b>Modo balanço ativo</b>
                <span>Digite a quantidade contada na coluna Estoque e tecle Enter. {conferidos.size} de {rows.length} conferidos. Termina às <span className="mono">{new Date(fimBal).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>.</span></div>
              <strong className="mono bal-t" aria-label="Tempo restante">{mmss(restBal)}</strong>
              <button className="key sm" id="pr-bal-fim" onClick={encerrar}>Encerrar</button>
            </div>
          )}
          <div className="row" style={{ marginBottom: 12 }}>
            <button className={`key sm ${!cat ? "on" : ""}`} onClick={() => setCat("")}>Todos</button>
            <button className={`key sm ${cat === "baixo" ? "on" : ""}`} id="pr-f-baixo" onClick={() => setCat(cat === "baixo" ? "" : "baixo")}>Estoque baixo <span className={`count ${nBaixo ? "bad" : ""}`}>{nBaixo}</span></button>
            {CATS.map(([k, l]) => <button key={k} className={`key sm ${cat === k ? "on" : ""}`} onClick={() => setCat(k)}>{l} <span className="count">{cnt(k)}</span></button>)}
          </div>
          <div className="tbl-wrap"><table><thead><tr><th>Produto</th><th>Categoria</th><th>SKU / EAN / NCM</th><th className="num">Estoque</th><th className="num">Custo</th><th className="num">Preço</th><th className="num">Margem</th></tr></thead><tbody>
            {list.map(x => {
              const m = margem(x.cost, x.price), r = prodResumo(x), es = estoqueSit(x);
              return (
                <tr key={x.id} className={`click ${F.id === x.id ? "sel" : ""}`} onClick={() => editar(x)}>
                  <td><b>{x.name}</b><div className="hint">{x.manufacturer || "—"}{r ? " · " + r : ""}</div></td>
                  <td><span className="chip">{CATN[x.category] || "—"}</span></td>
                  <td className="mono" style={{ fontSize: "9.5pt" }}>{x.sku || "—"}<div className="hint mono">{x.ean || ""}</div>{x.ncm && <div className="hint mono">NCM {fmtNcm(x.ncm)}</div>}</td>
                  <td className="num est-td" onClick={bal ? e => e.stopPropagation() : undefined}>{bal ? <Contagem p={x} conferido={conferidos.has(x.id)} onSaved={id => setConferidos(c => new Set(c).add(id))} /> : <><b className={`mono ${es.cls ? "est-neg" : ""}`}>{qtdBR(x.stock_qty)}</b>
                    {es.cls ? <div><span className={`chip ${es.cls} est-chip`}>{es.k === "zero" ? "Sem estoque" : `Baixo · mín. ${qtdBR(x.min_stock)}`}</span></div>
                      : x.min_stock > 0 ? <div className="hint mono">mín. {qtdBR(x.min_stock)}</div> : null}</>}</td>
                  <td className="num">{brl(x.cost)}</td>
                  <td className="num"><b>{brl(x.price)}</b></td>
                  <td className="num">{m == null ? "—" : <span className={`dl ${m >= 30 ? "up" : m < 10 ? "down" : ""}`}>{m}%</span>}</td>
                </tr>
              );
            })}
            {!list.length && <tr><td colSpan={7}><div className="empty">{rows.length ? (cat === "baixo" ? "Nenhum produto com estoque baixo" : "Nenhum produto encontrado com esse filtro") : "Nenhum produto cadastrado. Use o formulário ao lado."}</div></td></tr>}
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
            <label className="field"><span className="label">NCM</span>
              <input className={`input mono ${ncmBad ? "bad" : ""}`} id="pr-ncm" inputMode="numeric" maxLength={10} placeholder="0000.00.00" value={F.ncm} onChange={e => set({ ncm: fmtNcm(e.target.value) })} />
              <span className="hint" style={ncmBad ? { color: "var(--danger)" } : undefined}>{ncmBad ? "O NCM tem 8 dígitos" : "Classificação fiscal da mercadoria, 8 dígitos (vai na nota fiscal)"}</span></label>
            <div className="grid3">
              <label className="field"><span className="label">Custo (R$)</span>
                <input className="input" id="pr-custo" inputMode="decimal" value={F.custo} onChange={e => set({ custo: e.target.value })} /></label>
              <label className="field"><span className="label">Preço (R$) *</span>
                <input className="input" id="pr-preco" inputMode="decimal" value={F.preco} onChange={e => set({ preco: e.target.value })} /></label>
              <div className="field"><span className="label">Margem</span><b className="mono margin-box" id="pr-mg">{mg == null ? "—" : mg + "%"}</b></div>
            </div>
            <div className="grid2">
              <label className="field"><span className="label">Estoque mínimo</span>
                <input className="input mono" id="pr-min" inputMode="decimal" value={F.minimo} onChange={e => set({ minimo: e.target.value })} placeholder="0" />
                <span className="hint">Alerta quando o saldo chegar nele. 0 = sem alerta</span></label>
              {F.id
                ? <div className="field"><span className="label">Em estoque</span><b className="mono margin-box">{qtdBR(aberto?.stock_qty)}</b><span className="hint">{bal ? "Ajuste no painel Estoque ou na lista" : "Muda por compra, O.S. ou balanço"}</span></div>
                : !bal ? <div className="field"><span className="label">Estoque inicial</span><b className="mono margin-box">0</b><span className="hint">Para lançar a quantidade, ative o Balanço</span></div>
                : <label className="field"><span className="label">Estoque inicial</span>
                    <input className="input mono" id="pr-ini" inputMode="decimal" value={F.inicial} onChange={e => set({ inicial: e.target.value })} placeholder="0" />
                    <span className="hint">Quantidade na prateleira hoje</span></label>}
            </div>
            {F.categoria
              ? <div className="carac"><div className="label" style={{ color: "var(--accent)" }}>Características · {CATN[F.categoria]}</div>{carac}</div>
              : <div className="empty">Escolha a categoria para ver as características</div>}
            <button className="key accent" style={{ padding: 13 }} disabled={salvando} onClick={salvar}>{F.id ? "Salvar alterações" : "Cadastrar produto"}</button>
            {F.id && (pend
              ? <div className="row"><span>Excluir este produto?</span><button className="key sm danger" onClick={excluir}>Excluir</button><button className="key sm" onClick={() => setPend(false)}>Cancelar</button></div>
              : <button className="key sm" onClick={() => setPend(true)}>Excluir produto</button>)}
          </div>
        </section>
        {aberto && <EstoquePanel key={aberto.id} p={aberto} liberado={bal} />}
        </aside>
      </div>
      {modalBal && <BalancoModal hasPassword={hasPassword} onClose={() => setModalBal(false)} />}
    </main>
  );
}

const IBOX = <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 4h6a1 1 0 0 1 1 1v1H8V5a1 1 0 0 1 1-1Z" /><path d="M16 5h2a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h2" /><path d="m9 13 2 2 4-4" /></svg>;
