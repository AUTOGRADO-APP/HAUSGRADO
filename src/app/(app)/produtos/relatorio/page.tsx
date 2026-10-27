// Relatórios do estoque (botão Relatórios em Produtos): página A4 em HTML com texto selecionável; imprime ou salva em PDF pelo navegador.
// Valores de custo, valor do estoque e vendas só para o escritório (o mecânico vê as listas com o preço, como na tela).
import Link from "next/link";
import type { ReactNode } from "react";
import { createClient, getMe } from "@/lib/supabase/server.ts";
import { isOffice } from "@/lib/permissions.ts";
import { brl } from "@/lib/rules.ts";
import { CATN, CATS, dataBR, dtFull } from "@/lib/labels.ts";
import { fmtNcm, prodResumo } from "@/lib/produtos.ts";
import { qtdBR } from "@/lib/estoque.ts";
import { PERIODOS_REL, TIPOS_REL, curvaABC, orcAtivo, periodoRel, somaVendas, valorEstoque, type TipoRel } from "@/lib/relatorios.ts";
import { PrintBar } from "../../orcamentos/PrintBar.tsx";
import { docCss } from "../../orcamentos/doc-css.ts";

export const dynamic = "force-dynamic";

interface P {
  id: string; name: string; manufacturer: string | null; sku: string | null; ean: string | null; ncm: string | null;
  cost: number; price: number; category: string; stock_qty: number; min_stock: number;
  viscosity: string | null; api: string | null; volume: string | null; application_spec: string | null; application_brands: string[] | null; additive_type: string | null;
}
type SB = Awaited<ReturnType<typeof createClient>>;

const n2 = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pc = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "%";

/** Busca tudo (passa do limite de 1000 linhas do PostgREST) e divide listas grandes de ids. */
async function todos<T>(q: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; ; i += 1000) {
    const { data, error } = await q(i, i + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}
async function porIds<T>(ids: string[], q: (ids: string[], from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += 150) { const parte = ids.slice(i, i + 150); out.push(...await todos<T>((f, t) => q(parte, f, t))); }
  return out;
}

/** Peças cadastradas vendidas nas O.S. finalizadas no período (saída), pelo orçamento ativo de cada O.S. */
async function vendas(sb: SB, de: string, ate: string) {
  const os = await todos<{ id: string }>((f, t) => sb.from("service_orders").select("id").eq("status", "finalizado")
    .gte("exited_at", `${de}T00:00:00-03:00`).lte("exited_at", `${ate}T23:59:59.999-03:00`).order("id").range(f, t));
  const quotes = await porIds<{ id: string; service_order_id: string | null; status: string; created_at: string }>(os.map(o => o.id),
    (ids, f, t) => sb.from("quotes").select("id, service_order_id, status, created_at").in("service_order_id", ids).order("id").range(f, t));
  const ativo = orcAtivo(quotes);
  const doOrc = new Map([...ativo].map(([o, q]) => [q, o]));
  const itens = await porIds<{ quote_id: string; product_id: string; qty: number; unit_price: number; unit_cost: number | null }>([...doOrc.keys()],
    (ids, f, t) => sb.from("quote_items").select("quote_id, product_id, qty, unit_price, unit_cost").in("quote_id", ids).eq("kind", "peca").not("product_id", "is", null).order("id").range(f, t));
  return { nOs: os.length, vend: somaVendas(itens.map(i => ({ ...i, os_id: doOrc.get(i.quote_id)! }))) };
}

export default async function RelatorioPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const me = await getMe();
  const office = isOffice(me?.role);
  const tipo = (TIPOS_REL.some(t => t.k === sp.tipo) ? sp.tipo : "todos") as TipoRel;
  const info = TIPOS_REL.find(t => t.k === tipo)!;
  const sb = await createClient();
  const back = "/produtos";

  if (info.office && !office) {
    return (
      <main id="view"><section className="panel"><div className="ph"><h2>Relatório</h2></div>
        <div className="empty">Este relatório mostra valores e fica com o escritório (atendente, administrador ou master).</div>
        <div className="row" style={{ marginTop: 12 }}><Link className="key" href={back}>‹ Voltar aos produtos</Link></div></section></main>
    );
  }

  const [{ data: prods, error }, { data: shop }] = await Promise.all([
    sb.from("products").select("id, name, manufacturer, sku, ean, ncm, cost, price, category, stock_qty, min_stock, viscosity, api, volume, application_spec, application_brands, additive_type").order("name"),
    sb.from("shops").select("name").single(),
  ]);
  const rows: P[] = ((prods ?? []) as P[]).map(p => ({ ...p, cost: office ? Number(p.cost) : 0, price: Number(p.price), stock_qty: Number(p.stock_qty), min_stock: Number(p.min_stock) }))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  const byId = new Map(rows.map(p => [p.id, p]));
  const oficina = (shop as { name?: string } | null)?.name || "Autogrado";
  const emit = dtFull(new Date().toISOString());
  const contagem = sp.contagem === "1";
  const cat = tipo === "categoria" && CATN[sp.cat ?? ""] ? sp.cat! : "";
  const per = periodoRel(sp.p ?? "90", sp.de, sp.ate);
  const perTxt = `${dataBR(per.de)} a ${dataBR(per.ate)}`;
  const perNome = PERIODOS_REL.find(x => x[0] === sp.p && x[0] !== "livre")?.[1];

  const titulo = tipo === "categoria" && cat ? `${info.l}: ${CATN[cat]}` : info.l;
  const footer = `${oficina} · ${titulo}${info.vendas ? " · " + perTxt : ""}`;

  let corpo: ReactNode = null;
  let kpis: [string, string, string?][] = [];

  // ---------- listas (todos / por categoria) ----------
  const tabelaLista = (lista: P[], key?: string) => (
    <table key={key}>
      <thead><tr><th>PRODUTO</th>{!cat && tipo === "todos" && <th>CATEGORIA</th>}<th>SKU · EAN · NCM</th><th className="r">MÍN.</th><th className="r">ESTOQUE</th>{contagem ? <th className="r" style={{ width: "24mm" }}>CONTADO</th> : <th className="r">PREÇO</th>}</tr></thead>
      <tbody>
        {lista.map((p, i) => (
          <tr key={p.id} className={i % 2 ? "z" : ""}>
            <td><b className="pn">{p.name}</b><div className="det">{[p.manufacturer, prodResumo(p)].filter(Boolean).join(" · ") || "—"}</div></td>
            {!cat && tipo === "todos" && <td className="nw">{CATN[p.category] || "—"}</td>}
            <td className="mono sm">{p.sku || "—"}{(p.ean || p.ncm) && <div className="det mono">{[p.ean, p.ncm && "NCM " + fmtNcm(p.ncm)].filter(Boolean).join(" · ")}</div>}</td>
            <td className="r mono gray">{p.min_stock > 0 ? qtdBR(p.min_stock) : "—"}</td>
            <td className="r mono"><b className={p.stock_qty <= 0 || (p.min_stock > 0 && p.stock_qty <= p.min_stock) ? "neg" : ""}>{qtdBR(p.stock_qty)}</b></td>
            {contagem ? <td className="r"><span className="fillbox" /></td> : <td className="r mono">{n2(p.price)}</td>}
          </tr>
        ))}
        {!lista.length && <tr><td colSpan={6} className="gray">Nenhum produto.</td></tr>}
      </tbody>
    </table>
  );
  const resumoLista = (lista: P[]) => {
    const sem = lista.filter(p => p.stock_qty <= 0).length, baixo = lista.filter(p => p.stock_qty > 0 && p.min_stock > 0 && p.stock_qty <= p.min_stock).length;
    return [["Produtos", String(lista.length)], ["Unidades em estoque", qtdBR(lista.reduce((s, p) => s + Math.max(0, p.stock_qty), 0))],
      ["Sem estoque", String(sem), sem ? "neg" : undefined], ["Estoque baixo", String(baixo), baixo ? "neg" : undefined]] as [string, string, string?][];
  };

  if (tipo === "todos") {
    kpis = resumoLista(rows);
    corpo = tabelaLista(rows);
  } else if (tipo === "categoria") {
    const grupos = (cat ? CATS.filter(c => c[0] === cat) : CATS).map(([k, l]) => [k, l, rows.filter(p => p.category === k)] as const).filter(g => g[2].length || cat);
    kpis = resumoLista(grupos.flatMap(g => g[2]));
    corpo = grupos.map(([k, l, lista]) => (
      <section key={k} className="grp-sec">
        <div className="sec"><span className="sq" />{l}<span className="sec-n mono">{lista.length} {lista.length === 1 ? "produto" : "produtos"} · {qtdBR(lista.reduce((s, p) => s + Math.max(0, p.stock_qty), 0))} un.</span></div>
        {tabelaLista(lista, k)}
      </section>
    ));
  }

  // ---------- valor do estoque ----------
  else if (tipo === "valor") {
    const v = valorEstoque(rows);
    kpis = [["Valor de custo", brl(v.custo), "main"], ["Valor de venda", brl(v.venda)], ["Lucro bruto potencial", brl(v.lucro)], ["Markup médio", v.markup == null ? "—" : v.markup + "%"]];
    const porCat = CATS.map(([k, l]) => {
      const x = valorEstoque(rows.filter(p => p.category === k));
      return { k, l, n: rows.filter(p => p.category === k).length, ...x };
    }).filter(c => c.n);
    const maxC = Math.max(1, ...porCat.map(c => c.custo));
    const linhas = v.linhas.filter(l => l.q > 0).sort((a, b) => b.vCusto - a.vCusto);
    corpo = <>
      <div className="sec"><span className="sq" />Por categoria</div>
      <table>
        <thead><tr><th>CATEGORIA</th><th className="r">PRODUTOS</th><th className="r">UNIDADES</th><th style={{ width: "34mm" }}>PARTICIPAÇÃO</th><th className="r">CUSTO</th><th className="r">VENDA</th><th className="r">MARKUP</th></tr></thead>
        <tbody>
          {porCat.map((c, i) => (
            <tr key={c.k} className={i % 2 ? "z" : ""}>
              <td><b className="pn">{c.l}</b></td><td className="r mono">{c.n}</td><td className="r mono">{qtdBR(c.unid)}</td>
              <td><span className="hbar"><i style={{ width: `${(c.custo / maxC) * 100}%` }} /></span><span className="mono xs gray">{v.custo ? pc((c.custo / v.custo) * 100) : "—"}</span></td>
              <td className="r mono"><b>{n2(c.custo)}</b></td><td className="r mono">{n2(c.venda)}</td><td className="r mono">{c.markup == null ? "—" : c.markup + "%"}</td>
            </tr>
          ))}
          <tr className="tot"><td>TOTAL</td><td className="r mono">{rows.length}</td><td className="r mono">{qtdBR(v.unid)}</td><td /><td className="r mono">{n2(v.custo)}</td><td className="r mono">{n2(v.venda)}</td><td className="r mono">{v.markup == null ? "—" : v.markup + "%"}</td></tr>
        </tbody>
      </table>
      <div className="sec" style={{ marginTop: "8mm" }}><span className="sq" />Produtos em estoque<span className="sec-n">do maior valor de custo para o menor</span></div>
      <table>
        <thead><tr><th>PRODUTO</th><th className="r">QTD</th><th className="r">CUSTO UN.</th><th className="r">CUSTO TOTAL</th><th className="r">PREÇO UN.</th><th className="r">VENDA TOTAL</th></tr></thead>
        <tbody>
          {linhas.map((p, i) => (
            <tr key={p.id} className={i % 2 ? "z" : ""}>
              <td><b className="pn">{p.name}</b><div className="det">{CATN[p.category]}{byId.get(p.id)?.sku ? " · " + byId.get(p.id)!.sku : ""}</div></td>
              <td className="r mono">{qtdBR(p.q)}</td><td className="r mono gray">{n2(p.cost)}</td><td className="r mono"><b>{n2(p.vCusto)}</b></td>
              <td className="r mono gray">{n2(p.price)}</td><td className="r mono">{n2(p.vVenda)}</td>
            </tr>
          ))}
          {!linhas.length && <tr><td colSpan={6} className="gray">Nenhum produto com estoque.</td></tr>}
        </tbody>
      </table>
      <p className="nota">Conta só o saldo positivo de cada produto (quantidade × custo e quantidade × preço de venda cadastrados).{v.neg ? ` ${v.neg} ${v.neg === 1 ? "produto está" : "produtos estão"} com estoque negativo e ${v.neg === 1 ? "entrou" : "entraram"} como zero.` : ""} {rows.filter(p => p.stock_qty > 0 && !p.cost).length ? `${rows.filter(p => p.stock_qty > 0 && !p.cost).length} produto(s) com estoque estão sem custo cadastrado.` : ""}</p>
    </>;
  }

  // ---------- vendas: mais vendidos e curva ABC ----------
  else {
    let dados: Awaited<ReturnType<typeof vendas>>;
    try { dados = await vendas(sb, per.de, per.ate); }
    catch (e) { return <main id="view"><div className="banner"><span>Erro ao carregar as vendas: {(e as Error).message}</span></div></main>; }
    const { vend, nOs } = dados;
    const tot = vend.reduce((s, x) => s + x.valor, 0), un = vend.reduce((s, x) => s + x.qty, 0);
    const nome = (id: string) => byId.get(id);
    const vazio = <div className="vazio">Nenhuma peça cadastrada foi vendida em O.S. finalizadas neste período.</div>;

    if (tipo === "vendidos") {
      kpis = [["Faturamento em peças", brl(tot), "main"], ["Unidades vendidas", qtdBR(un)], ["Produtos diferentes", String(vend.length)], ["O.S. finalizadas", String(nOs)]];
      const max = Math.max(1, ...vend.map(x => x.valor));
      corpo = vend.length ? <>
        <table>
          <thead><tr><th style={{ width: "9mm" }}>#</th><th>PRODUTO</th><th className="r">QTD</th><th className="r">O.S.</th><th style={{ width: "30mm" }} /><th className="r">FATURAMENTO</th><th className="r">% DO TOTAL</th><th className="r">ESTOQUE HOJE</th></tr></thead>
          <tbody>
            {vend.map((x, i) => {
              const p = nome(x.product_id);
              return (
                <tr key={x.product_id} className={i % 2 ? "z" : ""}>
                  <td><span className={`rk mono ${i < 3 ? "pod" : ""}`}>{i + 1}</span></td>
                  <td><b className="pn">{p?.name ?? "Produto excluído"}</b><div className="det">{[p && CATN[p.category], p?.sku].filter(Boolean).join(" · ")}</div></td>
                  <td className="r mono"><b>{qtdBR(x.qty)}</b></td><td className="r mono gray">{x.os}</td>
                  <td><span className="hbar"><i style={{ width: `${(x.valor / max) * 100}%` }} /></span></td>
                  <td className="r mono"><b>{n2(x.valor)}</b></td><td className="r mono">{tot ? pc((x.valor / tot) * 100) : "—"}</td>
                  <td className="r mono">{p ? <span className={p.stock_qty <= 0 ? "neg" : ""}>{qtdBR(p.stock_qty)}</span> : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="nota">Peças cadastradas (com produto ligado) no orçamento ativo das O.S. finalizadas com saída entre {perTxt}. Faturamento = quantidade × preço do orçamento, antes de desconto. Itens avulsos, sem produto cadastrado, não entram.</p>
      </> : vazio;
    } else {
      const abc = curvaABC(vend);
      const cls = (["A", "B", "C"] as const).map(c => { const l = abc.filter(x => x.classe === c); return { c, n: l.length, v: l.reduce((s, x) => s + x.valor, 0) }; });
      const semVenda = rows.filter(p => !vend.some(v => v.product_id === p.id) && p.stock_qty > 0);
      kpis = [["Faturamento em peças", brl(tot), "main"], ...cls.map(k => [`Classe ${k.c}`, `${k.n} ${k.n === 1 ? "item" : "itens"}`, `abc-${k.c}`] as [string, string, string])];
      const DESC = { A: "Poucos itens que trazem a maior parte do faturamento. Nunca deixe faltar.", B: "Importância média. Reponha com regularidade.", C: "Muitos itens com pouco faturamento. Estoque enxuto." };
      corpo = abc.length ? <>
        <div className="abc-bar" aria-hidden="true">{cls.filter(k => k.v > 0).map(k => <i key={k.c} className={`abc-${k.c}`} style={{ width: `${(k.v / tot) * 100}%` }}><b>{k.c}</b></i>)}</div>
        <div className="abc-leg">
          {cls.map(k => (
            <div key={k.c} className="abc-it">
              <span className={`cl abc-${k.c}`}>{k.c}</span>
              <div><b>{k.n} {k.n === 1 ? "item" : "itens"} · {abc.length ? pc((k.n / abc.length) * 100) : "—"} dos itens</b>
                <div><span className="mono">{brl(k.v)}</span> · {tot ? pc((k.v / tot) * 100) : "—"} do faturamento</div>
                <div className="det">{DESC[k.c]}</div></div>
            </div>
          ))}
        </div>
        <table>
          <thead><tr><th style={{ width: "9mm" }}>#</th><th>PRODUTO</th><th className="r">QTD</th><th className="r">FATURAMENTO</th><th className="r">%</th><th className="r">% ACUMULADO</th><th className="r" style={{ width: "16mm" }}>CLASSE</th><th className="r">ESTOQUE</th></tr></thead>
          <tbody>
            {abc.map((x, i) => {
              const p = nome(x.product_id);
              const novaCl = i > 0 && abc[i - 1].classe !== x.classe;
              return (
                <tr key={x.product_id} className={`${i % 2 ? "z" : ""} ${novaCl ? "cut" : ""}`}>
                  <td className="mono gray">{i + 1}</td>
                  <td><b className="pn">{p?.name ?? "Produto excluído"}</b><div className="det">{[p && CATN[p.category], p?.sku].filter(Boolean).join(" · ")}</div></td>
                  <td className="r mono">{qtdBR(x.qty)}</td><td className="r mono"><b>{n2(x.valor)}</b></td>
                  <td className="r mono gray">{pc(x.pct)}</td><td className="r mono">{pc(x.acum)}</td>
                  <td className="r"><span className={`cl sm abc-${x.classe}`}>{x.classe}</span></td>
                  <td className="r mono">{p ? qtdBR(p.stock_qty) : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {semVenda.length > 0 && <>
          <div className="sec" style={{ marginTop: "8mm" }}><span className="sq" />Em estoque e sem venda no período<span className="sec-n mono">{semVenda.length} {semVenda.length === 1 ? "produto" : "produtos"} · {brl(valorEstoque(semVenda).custo)} parado a preço de custo</span></div>
          <table>
            <thead><tr><th>PRODUTO</th><th>CATEGORIA</th><th className="r">ESTOQUE</th><th className="r">CUSTO TOTAL</th></tr></thead>
            <tbody>{valorEstoque(semVenda).linhas.sort((a, b) => b.vCusto - a.vCusto).map((p, i) => (
              <tr key={p.id} className={i % 2 ? "z" : ""}><td><b className="pn">{p.name}</b></td><td className="nw">{CATN[p.category]}</td><td className="r mono">{qtdBR(p.q)}</td><td className="r mono">{n2(p.vCusto)}</td></tr>
            ))}</tbody>
          </table>
        </>}
        <p className="nota">Curva ABC pelo faturamento das peças cadastradas nas O.S. finalizadas com saída entre {perTxt}: classe A até 80% do faturamento acumulado, B até 95% e C o restante.</p>
      </> : vazio;
    }
  }

  return (
    <main id="view">
      <style>{docCss(footer) + REL_CSS}</style>
      <div className="stack" style={{ gap: 22 }}>
        <PrintBar title={titulo} back={back} backLabel="‹ Voltar aos produtos"
          hint={`${info.d}${info.vendas ? ` Período: ${perTxt}.` : ""}`} />
        {error && <div className="banner"><span>Erro ao carregar os produtos: {error.message}</span></div>}
        <article className="doc-a4 rel" aria-label={titulo}>
          <header className="head">
            <div className="brand">
              <i className="bar or" style={{ height: "17mm" }} />
              <div style={{ minWidth: 0 }}>
                <div className="lbl">{oficina} · Relatório de estoque</div>
                <h1>{titulo}</h1>
                <div className="sub">{info.vendas ? <>Período <b className="mono">{perTxt}</b>{perNome ? ` · ${perNome.toLowerCase()}` : ""}</> : <>Posição do estoque em <b className="mono">{emit}</b></>}</div>
              </div>
            </div>
            <div className="blk emit">
              <span>EMITIDO EM</span>
              <b className="mono">{emit.slice(0, 10)}</b>
              <span className="mono">{emit.slice(11)} · {me?.full_name?.split(" ")[0] ?? ""}</span>
            </div>
          </header>
          <hr className="rule" />
          {kpis.length > 0 && (
            <div className="kpis">
              {kpis.map(([l, v, c]) => <div key={l} className={`kp ${c ?? ""}`}><span className="lbl">{l}</span><b className="mono">{v}</b></div>)}
            </div>
          )}
          {corpo}
          <div className="scr-foot"><span>{footer}</span><span>Uso interno</span></div>
        </article>
      </div>
    </main>
  );
}

// visual dos relatórios: o A4 dos documentos com o laranja da marca nos destaques
const REL_CSS = `
.stack:has(>.rel){grid-template-columns:minmax(0,1fr)}
.rel{--or:#FF5C00;--or2:#FFB27F;--or3:#FFE3CF}
.rel h1{font-size:19pt;font-weight:800;line-height:1.1;margin:1mm 0 1.2mm;letter-spacing:-.01em}
.rel .sub{font-size:8.5pt;color:#444}
.rel .bar.or{background:var(--or)}
.rel .lbl{color:#777}
.rel .emit{width:40mm;flex:none;padding:2.6mm 3mm;gap:.6mm;border-radius:3mm}
.rel .emit span{font-size:6.3pt;font-weight:800;letter-spacing:.08em;opacity:.75}
.rel .emit b{font-size:13pt;color:var(--or)}
.rel .rule{border-top-width:.5mm;margin:3mm 0 5mm}
.rel .kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:3mm;margin-bottom:6mm;break-inside:avoid}
.rel .kp{background:var(--g1);border-radius:2.6mm;padding:3mm 4mm;display:flex;flex-direction:column;gap:1mm;min-width:0}
.rel .kp b{font-size:12.5pt;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.rel .kp.main{background:#000;color:#fff}.rel .kp.main .lbl{color:#bbb}.rel .kp.main b{color:var(--or)}
.rel .kp.neg b{color:#C62828}
.rel .kp.abc-A{background:var(--or);color:#fff}.rel .kp.abc-A .lbl{color:#fff;opacity:.85}
.rel .kp.abc-B{background:var(--or3)}
.rel .pn{font-size:9pt;font-weight:700}
.rel .det{font-size:7.3pt;color:#777;margin-top:.3mm}
.rel .sm{font-size:8pt}.rel .xs{font-size:7pt}.rel .nw{white-space:nowrap}
.rel td{font-size:8.6pt}
.rel tbody td{padding:1.4mm 3mm;background:#fff;border:0;border-radius:0}
.rel thead th{padding:1.6mm 3mm}
.rel thead{display:table-header-group}
.rel .neg{color:#C62828}
.rel tr.tot td{border-top:.4mm solid #000;font-weight:800;padding-top:2mm}
.rel tr.cut td{border-top:.35mm dashed #999}
.rel .sec{display:flex;align-items:center;gap:2.4mm;font-size:8pt;font-weight:800;letter-spacing:.06em;text-transform:uppercase;margin:0 0 2.4mm;break-after:avoid}
.rel .sec .sq{width:3mm;height:3mm;border-radius:.8mm;background:var(--or);flex:none}
.rel .sec-n{margin-left:auto;font-size:7.3pt;font-weight:600;letter-spacing:0;text-transform:none;color:#666}
.rel .grp-sec{margin-bottom:7mm}
.rel .grp-sec + .grp-sec{break-before:auto}
.rel .hbar{display:inline-block;width:100%;max-width:26mm;height:2.2mm;border-radius:1.1mm;background:var(--g2);overflow:hidden;vertical-align:middle;margin-right:1.5mm}
.rel .hbar i{display:block;height:100%;background:var(--or);border-radius:inherit}
.rel .rk{display:inline-grid;place-items:center;min-width:5.6mm;height:5.6mm;border-radius:1.4mm;background:var(--g2);font-size:7.5pt;font-weight:700}
.rel .rk.pod{background:var(--or);color:#fff}
.rel .fillbox{display:inline-block;width:18mm;height:5mm;border:.3mm solid #999;border-radius:1mm;vertical-align:middle;background:#fff}
.rel .cl{display:inline-grid;place-items:center;width:7mm;height:7mm;border-radius:1.6mm;font-weight:800;font-size:10pt;flex:none}
.rel .cl.sm{width:5.6mm;height:5.6mm;font-size:8pt}
.rel .abc-A{background:var(--or);color:#fff}.rel .abc-B{background:var(--or2);color:#000}.rel .abc-C{background:var(--g2);color:#000}
.rel .abc-bar{display:flex;height:7mm;border-radius:2mm;overflow:hidden;margin-bottom:3mm}
.rel .abc-bar i{display:grid;place-items:center;min-width:6mm;font-style:normal;font-size:7.5pt}
.rel .abc-leg{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:3mm;margin-bottom:6mm;break-inside:avoid}
.rel .abc-it{display:flex;gap:2.4mm;align-items:flex-start;border:.3mm solid var(--g2);border-radius:2.4mm;padding:2.6mm 3mm;font-size:8pt}
.rel .abc-it .mono{font-size:7.8pt;margin-top:.4mm}
.rel .nota{font-size:7.4pt;color:#666;margin:4mm 0 0;line-height:1.4}
.rel .vazio{border:.3mm dashed #bbb;border-radius:2.6mm;padding:8mm;text-align:center;color:#666;font-size:9pt}
@media (max-width:640px){.rel .kpis,.rel .abc-leg{grid-template-columns:1fr 1fr}.rel .head{flex-wrap:wrap}.rel h1{font-size:15pt}}
`;
