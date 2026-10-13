// PDF do orçamento (seção 10.2): página A4 em HTML com texto selecionável; imprime ou salva em PDF pelo navegador.
import { notFound } from "next/navigation";
import { brl, quoteTotals } from "@/lib/rules.ts";
import { ORC_ST, dataBR, fmtCep, fmtFone } from "@/lib/labels.ts";
import { loadQuote, type QItem } from "../../data.ts";
import { PrintBar } from "../../PrintBar.tsx";
import { docCss } from "../../doc-css.ts";

export const dynamic = "force-dynamic";

const n2 = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const qtd = (v: number) => String(v).replace(".", ",");

export default async function OrcPdfPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const b = await loadQuote(id);
  if (!b) notFound();
  const { quote: r, customer: c, os: o, shop } = b;
  const rows = b.items.filter(i => i.description || i.unit_price);
  const T = quoteTotals(b.items, r.discount);
  const emit = dataBR(new Date().toISOString());
  const val = dataBR(new Date(new Date(r.created_at).getTime() + (r.validity_days || 0) * 864e5).toISOString());
  const placa = r.plate || o?.plate || null;
  const footer = `${shop.name} · Orçamento ${r.number}${placa ? " · " + placa : ""}`;

  const grupo = (titulo: string, arr: QItem[]) => {
    if (!arr.length) return null;
    const st = arr.reduce((a, i) => a + i.qty * i.unit_price, 0);
    return (
      <tbody key={titulo}>
        <tr className="grp"><td colSpan={3}>{titulo}</td><td className="r mono" style={{ fontWeight: 700, color: "#555" }}>{arr.length} {arr.length > 1 ? "itens" : "item"} · {brl(st)}</td></tr>
        {arr.map((it, ix) => (
          <tr key={it.id} className={ix % 2 === 1 ? "z" : ""}>
            <td><div style={{ fontSize: "9.5pt", fontWeight: 500 }}>{it.description || "—"}</div>{it.details && <div className="det">{it.details}</div>}</td>
            <td className="r mono" style={{ fontSize: "9.5pt" }}>{qtd(it.qty)}</td>
            <td className="r mono" style={{ fontSize: "9.5pt", color: "#333" }}>{n2(it.unit_price)}</td>
            <td className="r mono" style={{ fontSize: "9.5pt", fontWeight: 700 }}>{n2(it.qty * it.unit_price)}</td>
          </tr>
        ))}
      </tbody>
    );
  };

  return (
    <main id="view">
      <style>{docCss(footer)}</style>
      <div className="stack" style={{ gap: 22 }}>
        <PrintBar title={`PDF do orçamento nº ${r.number}`} back={`/orcamentos/${r.id}`}
          hint="Cliente, veículo, itens com peças e mão de obra, desconto, total, validade e espaço para a assinatura de aprovação." />
        <article className="doc-a4" aria-label={`Orçamento nº ${r.number}`}>
          {/* cabeçalho: marca grande + bloco do número */}
          <header className="head">
            <div className="brand">
              <i className="bar" style={{ height: "22mm" }} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: "28pt", fontWeight: 800, letterSpacing: "1.5px", lineHeight: 1.05, textTransform: "uppercase" }}>{shop.name}</div>
                <div style={{ fontSize: "9pt", fontWeight: 500, color: "#444", marginTop: "1.5mm" }}>Centro automotivo · orçamento de serviços</div>
              </div>
            </div>
            <div style={{ width: "56mm", flex: "none", textAlign: "center" }}>
              <div className="blk" style={{ height: "22mm" }}>
                <span style={{ fontSize: "7pt", fontWeight: 800, letterSpacing: "1px" }}>ORÇAMENTO</span>
                <b className="mono" style={{ fontSize: "17pt", fontWeight: 700 }}>Nº {r.number}</b>
              </div>
              <div className="mono gray" style={{ fontSize: "7pt", marginTop: "1.6mm" }}>Emitido em {emit}{o ? ` · O.S. ${o.number}` : ""}</div>
            </div>
          </header>
          <hr className="rule" style={{ borderTopWidth: ".6mm" }} />

          {/* cartões cliente e veículo */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6mm", marginBottom: "9mm" }}>
            <div style={{ background: "var(--g1)", borderRadius: "2.5mm", padding: "3.5mm 5mm" }}>
              <div className="lbl">Cliente</div>
              <div style={{ fontSize: "12pt", fontWeight: 800, marginTop: "1.5mm" }}>{c?.name || "—"}</div>
              <div className="mono" style={{ fontSize: "9.5pt", fontWeight: 700 }}>{c?.phone ? fmtFone(c.phone) : "—"}</div>
              <div style={{ fontSize: "8pt", color: "#555", marginTop: ".6mm" }}>{[c?.document ? `CPF/CNPJ ${c.document}` : "", c?.zip_code ? `CEP ${fmtCep(c.zip_code)}` : ""].filter(Boolean).join(" · ")}</div>
            </div>
            <div style={{ background: "var(--g1)", borderRadius: "2.5mm", padding: "3.5mm 5mm", display: "flex", justifyContent: "space-between", gap: "4mm" }}>
              <div style={{ minWidth: 0 }}>
                <div className="lbl">Veículo</div>
                <div style={{ fontSize: "9pt", fontWeight: 700, color: "#444", marginTop: "1.5mm" }}>{o?.make || "—"}</div>
                <div style={{ fontSize: "11.5pt", fontWeight: 800 }}>{o?.model || "—"}</div>
                <div style={{ fontSize: "8.5pt", color: "#333", marginTop: ".6mm" }}>{[o?.year, o?.color, o?.km ? o.km + " km" : ""].filter(Boolean).join(" · ") || "—"}</div>
              </div>
              <span className="plate-d" style={{ width: "34mm", alignSelf: "flex-start" }}><i>BRASIL</i><b style={{ fontSize: "12pt" }}>{placa || "—"}</b></span>
            </div>
          </div>

          {/* tabela de itens */}
          <table>
            <thead><tr><th>DESCRIÇÃO</th><th className="r" style={{ width: "18mm" }}>QTD</th><th className="r" style={{ width: "28mm" }}>VALOR UN.</th><th className="r" style={{ width: "30mm" }}>SUBTOTAL</th></tr></thead>
            {grupo("PEÇAS", rows.filter(i => i.kind === "peca"))}
            {grupo("MÃO DE OBRA", rows.filter(i => i.kind === "mao"))}
            {!rows.length && <tbody><tr><td colSpan={4} style={{ color: "#555" }}>Nenhum item no orçamento.</td></tr></tbody>}
          </table>

          {/* condições + totais */}
          <div className="avoid" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 78mm", gap: "8mm", marginTop: "7mm", alignItems: "stretch" }}>
            <div style={{ border: ".3mm solid var(--g2)", borderRadius: "2.5mm", padding: "3.5mm 5mm", fontSize: "8pt", color: "#444" }}>
              <div className="lbl" style={{ marginBottom: "1.8mm" }}>Condições</div>
              <div style={{ fontWeight: 700, color: "#000" }}>Validade: {r.validity_days} dias (até {val}).</div>
              <div style={{ fontWeight: 500, color: "#000", marginTop: "1.2mm" }}>Situação: {ORC_ST[r.status]}.</div>
              <div style={{ marginTop: "1.2mm" }}>Valores sujeitos a alteração caso sejam encontrados outros problemas durante o serviço, sempre com nova aprovação do cliente.</div>
              <div style={{ marginTop: "1.2mm" }}>Acompanhe o serviço em tempo real pelo link enviado no WhatsApp.</div>
            </div>
            <div>
              {([["Peças", brl(T.pecas)], ["Mão de obra", brl(T.mao)], ...(r.discount ? [["Desconto", "− " + brl(r.discount)]] : [])] as [string, string][]).map(([l, v]) => (
                <div key={l} style={{ display: "flex", justifyContent: "space-between", padding: "1.1mm 4mm", fontSize: "9pt" }}>
                  <span style={{ fontWeight: 500, color: "#444" }}>{l}</span><b className="mono" style={{ fontSize: "9.5pt" }}>{v}</b>
                </div>
              ))}
              <div className="blk" style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: "3mm 5mm", marginTop: "1.5mm", border: "1.5px solid #000" }}>
                <span style={{ fontSize: "8pt", fontWeight: 800, letterSpacing: "1px" }}>TOTAL</span>
                <b className="mono" style={{ fontSize: "16pt", fontWeight: 700 }}>{brl(T.total)}</b>
              </div>
            </div>
          </div>

          {/* aprovação */}
          <div className="sign">
            <div>Aprovação do cliente<small>{c?.name || ""}</small></div>
            <div>Data<small className="mono">____/____/________</small></div>
          </div>
          <div className="scr-foot"><span>{footer}</span><span>Orçamento · via do cliente</span></div>
        </article>
      </div>
    </main>
  );
}
