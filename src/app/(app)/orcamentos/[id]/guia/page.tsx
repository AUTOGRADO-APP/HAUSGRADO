// Guia de serviço (seção 10.3) — VIA DA OFICINA. Página A4 em HTML, sem preços, com checklist de saída.
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
import { NIVEIS, dtFull, fmtFone } from "@/lib/labels.ts";
import { isBlankItem } from "@/lib/rules.ts";
import { loadQuote, type QItem } from "../../data.ts";
import { PrintBar } from "../../PrintBar.tsx";
import { docCss } from "../../doc-css.ts";

export const dynamic = "force-dynamic";
const TZ = "America/Sao_Paulo";

type CkItem = ["c", string] | ["f", string, number, string] | ["r", string];
const CK: [string, CkItem[]][] = [
  ["Serviço e segurança", [
    ["c", "Conferir se todos os serviços autorizados na ordem de serviço foram concluídos."],
    ["c", "Conferir a montagem, fixação e os apertos dos componentes envolvidos no serviço."],
    ["c", "Conferir o aperto dos parafusos/porcas das rodas com torquímetro, conforme a especificação do fabricante."],
    ["f", "Torque aplicado:", 22, "N·m"],
    ["c", "Conferir pressão dos pneus conforme a especificação do veículo."]]],
  ["Funcionamento e teste", [
    ["c", "Dar partida e verificar funcionamento do motor."],
    ["c", "Conferir se há luzes de advertência ou mensagens anormais no painel. Se tiver qual:"],
    ["f", "", 0, ""],
    ["c", "Realizar teste de rodagem, quando aplicável e em condições seguras."],
    ["c", "Confirmar se a reclamação do cliente foi solucionada."],
    ["c", "Após o teste, verificar novamente possíveis vazamentos e anormalidades."],
    ["r", "Teste de rodagem:"],
    ["f", "Responsável pelo teste:", 0, ""]]],
  ["Limpeza e apresentação", [
    ["c", "Remover os cobre-placas dianteiro e traseiro."],
    ["c", "Remover as proteções plásticas de banco, volante e câmbio."],
    ["c", "Remover capas de para-lamas e demais proteções externas."],
    ["c", "Retirar ferramentas, panos, embalagens e materiais de serviço do veículo."],
    ["c", "Limpar marcas de mãos, graxa e sujeira geradas durante o serviço."]]],
  ["Conferência da entrega", [
    ["c", "Registrar a quilometragem de saída e os serviços executados na OS."],
    ["c", "Conferir chaves e acessórios recebidos com o veículo."],
    ["f", "Quilometragem de saída:", 32, "km"]]],
];

function Sec({ n, t }: { n: number; t: string }) {
  return (
    <div className="avoid" style={{ display: "flex", alignItems: "center", gap: "2.6mm", background: "var(--g1)", borderRadius: "1.4mm", margin: "0 0 3.6mm", breakAfter: "avoid" }}>
      <span className="mono" style={{ width: "6.4mm", height: "6.4mm", background: "#000", color: "#fff", borderRadius: "1.4mm", display: "grid", placeItems: "center", fontSize: "8pt", fontWeight: 800 }}>{n}</span>
      <b style={{ fontSize: "7.5pt", fontWeight: 800, letterSpacing: ".05em" }}>{t.toUpperCase()}</b>
    </div>
  );
}
function Card({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ border: ".3mm solid var(--g2)", borderRadius: "1.6mm", padding: "1.6mm 3mm 2mm", minHeight: "17mm", minWidth: 0 }}>
      <div style={{ fontSize: "6.3pt", fontWeight: 700, color: "var(--g3)", textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: "10pt", fontWeight: 700, marginTop: "2mm", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{children}</div>
    </div>
  );
}
function Group({ i, g }: { i: number; g: [string, CkItem[]] }) {
  return (
    <div className="avoid" style={{ border: ".3mm solid #000", borderRadius: "2mm", padding: "3mm 3.4mm 3mm", fontSize: "8.6pt" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "2mm", marginBottom: "2.4mm" }}>
        <span className="mono" style={{ width: "5.4mm", height: "5.4mm", borderRadius: "50%", background: "#000", color: "#fff", display: "grid", placeItems: "center", fontSize: "7.5pt", fontWeight: 800 }}>{i + 1}</span>
        <b style={{ fontSize: "9.5pt", fontWeight: 800 }}>{g[0]}</b>
      </div>
      {g[1].map((it, k) => {
        if (it[0] === "c") return <div key={k} style={{ display: "flex", gap: "2.2mm", marginBottom: "1.6mm" }}><span className="box" style={{ marginTop: ".3mm" }} /><span>{it[1]}</span></div>;
        if (it[0] === "r") return (
          <div key={k} style={{ paddingLeft: "5.6mm", marginBottom: "2mm", display: "flex", gap: "2mm", alignItems: "center", flexWrap: "wrap" }}>
            <b>{it[1]}</b><span className="box" /> Realizado <span className="box" style={{ marginLeft: "2mm" }} /> Não se aplica
          </div>
        );
        const [, lbl, w, unit] = it;
        return (
          <div key={k} style={{ paddingLeft: "5.6mm", marginBottom: "2.4mm", display: "flex", gap: "2mm", alignItems: "flex-end" }}>
            {lbl && <span style={{ fontWeight: 600, whiteSpace: "nowrap" }}>{lbl}</span>}
            <span className="fill" style={w ? { width: w + "mm" } : { flex: 1 }} />
            {unit && <span>{unit}</span>}
          </div>
        );
      })}
    </div>
  );
}

export default async function GuiaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const b = await loadQuote(id);
  if (!b) notFound();
  const { quote: r, customer: c, os: o, shop } = b;
  if (!o) redirect(`/orcamentos/${r.id}`);
  const emit = dtFull(new Date().toISOString());
  const placa = o.plate || r.plate || "—";
  const footer = `${shop.name} · Guia de serviço · O.S. ${o.number} · ${placa}`;
  const rows = b.items.filter(i => !isBlankItem(i));
  const pecas = rows.filter(i => i.kind === "peca"), mao = rows.filter(i => i.kind === "mao");
  const de = new Date(o.entered_at);
  const lv = NIVEIS.indexOf(o.fuel_level || "");
  let nItem = 0;

  const grupo = (titulo: string, arr: QItem[]) => !arr.length ? null : (
    <tbody key={titulo}>
      <tr><td colSpan={4} style={{ padding: "2.6mm 1mm 1mm", fontSize: "7pt", fontWeight: 800, color: "#444" }}>{titulo} · {arr.length}</td></tr>
      {arr.map((it, ix) => (
        <tr key={it.id} className={ix % 2 === 0 ? "z" : ""}>
          <td style={{ padding: "1.4mm 1.8mm", width: "7mm" }}><span className="box" /></td>
          <td className="mono" style={{ padding: "1.4mm 1mm", width: "7mm", fontSize: "8pt", fontWeight: 700, color: "var(--g3)" }}>{String(++nItem).padStart(2, "0")}</td>
          <td style={{ padding: "1.4mm 1mm" }}><div style={{ fontSize: "9.5pt", fontWeight: 500 }}>{it.description || "—"}</div>{it.details && <div className="det" style={{ color: "#555" }}>{it.details}</div>}</td>
          <td className="r" style={{ padding: "1.4mm 2mm", width: "14mm" }}>
            <span className="mono" style={{ display: "inline-block", minWidth: "10mm", border: ".25mm solid #000", borderRadius: "1mm", background: "#fff", textAlign: "center", fontSize: "9pt", fontWeight: 700 }}>{String(it.qty).replace(".", ",")}</span>
          </td>
        </tr>
      ))}
    </tbody>
  );

  return (
    <main id="view">
      <style>{docCss(footer)}</style>
      <div className="stack" style={{ gap: 22 }}>
        <PrintBar title={`Guia de serviço · O.S. ${o.number}`} back={`/orcamentos/${r.id}`}
          hint="Dados do veículo e da entrada, peças e serviços a executar e o checklist de saída para o mecânico preencher e assinar." />
        <article className="doc-a4" aria-label={`Guia de serviço da O.S. ${o.number}`}>
          {/* topo */}
          <header className="head" style={{ marginBottom: "6mm" }}>
            <div className="brand">
              <i className="bar" style={{ width: "4mm", height: "14mm", borderRadius: "1.5mm" }} />
              <div>
                <div style={{ fontSize: "15pt", fontWeight: 800, lineHeight: 1.1 }}>GUIA DE SERVIÇO</div>
                <div style={{ fontSize: "8pt", color: "#444", marginTop: "1mm" }}>{shop.name} · emitida em {emit} · orçamento nº {r.number}</div>
              </div>
            </div>
            <div style={{ display: "flex", gap: "3mm", alignItems: "flex-start", flex: "none" }}>
              <span className="mono gray" style={{ fontSize: "6.5pt", fontWeight: 700, marginTop: "1.6mm" }}>VIA DA OFICINA</span>
              <div className="blk" style={{ width: "44mm", height: "14mm", borderRadius: "2mm" }}>
                <span style={{ fontSize: "6.5pt", fontWeight: 700 }}>ORDEM DE SERVIÇO</span>
                <b className="mono" style={{ fontSize: "15pt", fontWeight: 700, lineHeight: 1.1 }}>{o.number}</b>
              </div>
            </div>
          </header>

          {/* 1. veículo e entrada */}
          <Sec n={1} t="Veículo e entrada" />
          <div style={{ display: "flex", gap: "6mm", alignItems: "center", marginBottom: "5mm" }}>
            <span className="plate-d" style={{ width: "46mm", borderWidth: ".6mm", borderRadius: "2mm" }}><i style={{ fontSize: "6pt" }}>BRASIL</i><b style={{ fontSize: "17pt" }}>{placa}</b></span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: "13pt", fontWeight: 800 }}>{`${o.make || ""} ${o.model || ""}`.trim() || "—"}</div>
              <div style={{ fontSize: "9.5pt", color: "#333" }}>{[o.year, o.color].filter(Boolean).join(" · ") || "—"}</div>
              <div style={{ fontSize: "8pt", color: "#555" }}>Cliente: {c?.name || "—"}{c?.phone ? " · " + fmtFone(c.phone) : ""}</div>
            </div>
            <div style={{ textAlign: "right", flex: "none" }}>
              <div style={{ fontSize: "6.5pt", fontWeight: 700, color: "var(--g3)" }}>ENTRADA</div>
              <div className="mono" style={{ fontSize: "13pt", fontWeight: 700 }}>{de.toLocaleDateString("pt-BR", { timeZone: TZ })}</div>
              <div className="mono" style={{ fontSize: "10pt", fontWeight: 700, color: "#444" }}>{de.toLocaleTimeString("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" })}</div>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: "3mm", marginBottom: "7mm" }}>
            <Card label="Marca">{o.make || "—"}</Card>
            <Card label="Modelo">{o.model || "—"}</Card>
            <Card label="Ano fab./mod."><span className="mono">{o.year || "—"}</span></Card>
            <Card label="Cor">{o.color || "—"}</Card>
            <Card label="Quilometragem"><span className="mono">{o.km ? o.km + " km" : "—"}</span></Card>
            <Card label="Nível de combustível">
              <span style={{ display: "flex", gap: "1mm", alignItems: "center" }}>
                <span style={{ fontSize: "6pt", color: "var(--g3)", fontWeight: 400 }}>E</span>
                {[0, 1, 2, 3].map(k => <span key={k} style={{ flex: 1, height: "3.6mm", border: ".25mm solid #000", borderRadius: ".6mm", background: k < lv ? "#000" : "#fff" }} />)}
                <span className="mono" style={{ fontSize: "7pt", color: "#444", marginLeft: "1mm" }}>{o.fuel_level || "—"}</span>
              </span>
            </Card>
            <Card label="Tipo de entrada">
              <span style={{ display: "flex", gap: "2.4mm", flexWrap: "wrap", fontSize: "7pt" }}>
                {([["servico", "Serviço"], ["manutencao", "Manut."], ["garantia", "Garantia"]] as const).map(([k, l]) => (
                  <span key={k} style={{ display: "inline-flex", gap: ".8mm", alignItems: "center", fontWeight: o.entry_type === k ? 800 : 400 }}>
                    <span className={`box${o.entry_type === k ? " on" : ""}`} style={{ width: "2.8mm", height: "2.8mm" }} />{l}
                  </span>
                ))}
              </span>
            </Card>
            <Card label="Profissional responsável">{o.technician_name || "—"}</Card>
          </div>

          {/* 2. peças e serviços */}
          <Sec n={2} t="Peças e serviços a executar" />
          <table>
            <thead><tr>
              <th style={{ padding: "1.4mm 1.4mm", textAlign: "center", width: "7mm" }}>OK</th>
              <th style={{ padding: "1.4mm 1mm", width: "7mm" }}>#</th>
              <th style={{ padding: "1.4mm 1mm" }}>DESCRIÇÃO</th>
              <th className="r" style={{ padding: "1.4mm 3mm" }}>QTD</th>
            </tr></thead>
            {grupo("PEÇAS", pecas)}
            {grupo("MÃO DE OBRA", mao)}
            {!rows.length && <tbody><tr><td colSpan={4} style={{ color: "#555" }}>Nenhum item no orçamento.</td></tr></tbody>}
          </table>
          {o.customer_complaint && (
            <div className="avoid" style={{ position: "relative", border: ".3mm solid #000", borderRadius: "1.6mm", padding: "2.4mm 4mm 2.6mm 6mm", marginTop: "4mm", overflow: "hidden" }}>
              <i style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: "2mm", background: "#000" }} />
              <div style={{ fontSize: "6.5pt", fontWeight: 800, color: "var(--g3)" }}>RECLAMAÇÃO DO CLIENTE</div>
              <div style={{ fontSize: "9pt", whiteSpace: "pre-wrap", marginTop: ".8mm" }}>{o.customer_complaint}</div>
            </div>
          )}

          {/* 3. checklist de saída */}
          <div style={{ marginTop: "7mm" }}>
            <div className="avoid">
              <Sec n={3} t="Checklist de saída" />
              <Group i={0} g={CK[0]} />
            </div>
            <div style={{ marginTop: "3mm" }}><Group i={1} g={CK[1]} /></div>
            <div className="avoid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4mm", marginTop: "3mm", alignItems: "stretch" }}>
              <Group i={2} g={CK[2]} />
              <Group i={3} g={CK[3]} />
            </div>
          </div>

          {/* assinaturas */}
          <div className="sign" style={{ gap: "10mm" }}>
            <div>Assinatura do mecânico<small>{o.technician_name || ""}</small></div>
            <div>Data e hora da conclusão<small className="mono">____/____/________   ____:____</small></div>
          </div>
          <div className="scr-foot"><span>{footer}</span><span>VIA DA OFICINA</span></div>
        </article>
      </div>
    </main>
  );
}
