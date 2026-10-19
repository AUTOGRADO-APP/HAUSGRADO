// PDF do orçamento como arquivo (seção 10.2), gerado no servidor com pdf-lib: A4, preto e branco,
// texto selecionável. É o arquivo que vai para o cliente pelo WhatsApp (link ou anexo) e o "Baixar PDF".
// O layout segue a página de impressão /orcamentos/{id}/pdf. Fontes padrão do PDF (Helvetica e Courier).
import { PDFDocument, PDFString, StandardFonts, rgb, setCharacterSpacing, type PDFFont, type PDFPage } from "pdf-lib";
import { brl, isBlankItem, quoteTotals } from "./rules.ts";
import { ORC_ST, dataBR, fmtCep, fmtFone } from "./labels.ts";

export interface OrcPdfData {
  quote: { number: number; plate: string | null; discount: number; validity_days: number; status: keyof typeof ORC_ST; created_at: string };
  items: { kind: "peca" | "mao"; description: string; details: string | null; qty: number; unit_price: number }[];
  customer: { name: string; phone: string; document: string | null; zip_code: string | null } | null;
  os: { number: number; plate: string; make: string | null; model: string | null; year: string | null; color: string | null; km: string | null } | null;
  shop: { name: string };
  portalUrl?: string | null;
  now?: Date;
}

const MM = 72 / 25.4;
const W = 595.28, H = 841.89;
const ML = 12 * MM, MR = 12 * MM, MT = 10 * MM, MB = 10 * MM;
const CW = W - ML - MR;
const FOOT = MB + 6 * MM;   // a área útil termina acima do rodapé
const BLACK = rgb(0, 0, 0), WHITE = rgb(1, 1, 1);
const G1 = rgb(0xf1 / 255, 0xf1 / 255, 0xf1 / 255), G2 = rgb(0xe3 / 255, 0xe3 / 255, 0xe3 / 255), ZEBRA = rgb(0xf7 / 255, 0xf7 / 255, 0xf7 / 255);
const GRAY = (v: number) => rgb(v / 255, v / 255, v / 255);

const n2 = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const qtd = (v: number) => String(v).replace(".", ",");

export function orcPdfName(number: number, plate: string | null | undefined) {
  return `Orcamento-${number}${plate ? "-" + plate : ""}.pdf`;
}

export async function orcPdf(d: OrcPdfData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const F = {
    r: await doc.embedFont(StandardFonts.Helvetica),
    b: await doc.embedFont(StandardFonts.HelveticaBold),
    m: await doc.embedFont(StandardFonts.Courier),
    mb: await doc.embedFont(StandardFonts.CourierBold),
  };
  const { quote: r, customer: c, os: o, shop } = d;
  const placa = r.plate || o?.plate || null;
  doc.setTitle(`Orçamento nº ${r.number}${placa ? " · " + placa : ""}`);
  doc.setAuthor(shop.name);
  doc.setCreator("Hausgrado");
  doc.setProducer("Hausgrado");

  // as fontes padrão só codificam WinAnsi (Latin-1 + alguns sinais): troca o resto para não quebrar o arquivo
  const okCache = new Map<string, boolean>();
  const safe = (s: string) => [...s.replace(/[−‐‑]/g, "-").replace(/[   ]/g, " ").replace(/[\t\r]/g, " ")]
    .map(ch => {
      if (ch === "\n") return ch;
      let ok = okCache.get(ch);
      if (ok === undefined) { try { F.r.encodeText(ch); ok = true; } catch { ok = false; } okCache.set(ch, ok); }
      return ok ? ch : "?";
    }).join("");
  const width = (t: string, f: PDFFont, sz: number) => f.widthOfTextAtSize(safe(t), sz);
  const fit = (t: string, f: PDFFont, sz: number, max: number) => {
    let s = safe(t);
    if (f.widthOfTextAtSize(s, sz) <= max) return s;
    while (s.length > 1 && f.widthOfTextAtSize(s + "…", sz) > max) s = s.slice(0, -1);
    return s + "…";
  };
  const wrap = (t: string, f: PDFFont, sz: number, max: number) => {
    const out: string[] = [];
    for (const par of safe(t).split("\n")) {
      let line = "";
      for (const w of par.split(/ +/)) {
        const tryL = line ? line + " " + w : w;
        if (f.widthOfTextAtSize(tryL, sz) <= max) { line = tryL; continue; }
        if (line) out.push(line);
        line = w;
        while (f.widthOfTextAtSize(line, sz) > max && line.length > 1) {   // palavra maior que a linha
          let k = line.length - 1;
          while (k > 1 && f.widthOfTextAtSize(line.slice(0, k), sz) > max) k--;
          out.push(line.slice(0, k)); line = line.slice(k);
        }
      }
      out.push(line);
    }
    return out;
  };
  // y de cima para baixo (como na tela); converte na hora de desenhar
  const text = (p: PDFPage, t: string, x: number, top: number, f: PDFFont, sz: number, color = BLACK, spacing = 0) => {
    if (spacing) p.pushOperators(setCharacterSpacing(spacing));
    p.drawText(safe(t), { x, y: H - top - sz * 0.8, size: sz, font: f, color });
    if (spacing) p.pushOperators(setCharacterSpacing(0));
  };
  const textR = (p: PDFPage, t: string, xRight: number, top: number, f: PDFFont, sz: number, color = BLACK) =>
    text(p, t, xRight - width(t, f, sz), top, f, sz, color);
  const textC = (p: PDFPage, t: string, xMid: number, top: number, f: PDFFont, sz: number, color = BLACK, spacing = 0) =>
    text(p, t, xMid - (width(t, f, sz) + spacing * Math.max(0, safe(t).length - 1)) / 2, top, f, sz, color, spacing);
  const rrect = (p: PDFPage, x: number, top: number, w: number, h: number, rad: number, o: { fill?: ReturnType<typeof rgb>; border?: ReturnType<typeof rgb>; bw?: number }) => {
    const k = Math.min(rad, w / 2, h / 2);
    const path = `M ${k} 0 H ${w - k} Q ${w} 0 ${w} ${k} V ${h - k} Q ${w} ${h} ${w - k} ${h} H ${k} Q 0 ${h} 0 ${h - k} V ${k} Q 0 0 ${k} 0 Z`;
    p.drawSvgPath(path, { x, y: H - top, color: o.fill, borderColor: o.border, borderWidth: o.border ? (o.bw ?? 0.6) : 0 });
  };
  const box = (p: PDFPage, x: number, top: number, w: number, h: number, color = BLACK) =>
    p.drawRectangle({ x, y: H - top - h, width: w, height: h, color });

  const pages: PDFPage[] = [];
  const newPage = () => { const p = doc.addPage([W, H]); pages.push(p); return p; };
  let page = newPage();
  let y = MT;

  // ── cabeçalho: barra + nome da oficina grande | bloco preto com o número
  const blkW = 56 * MM, hh = 22 * MM;
  box(page, ML, y, 1.6 * MM, hh);
  const nameX = ML + 1.6 * MM + 4 * MM;
  const nameMax = CW - blkW - 6 * MM - (nameX - ML);
  let nsz = 28;
  const nome = shop.name.toUpperCase();
  while (nsz > 14 && width(nome, F.b, nsz) + 1.5 * nome.length > nameMax) nsz -= 1;
  text(page, nome, nameX, y + 4 * MM, F.b, nsz, BLACK, 1.5);
  text(page, "Centro automotivo · orçamento de serviços", nameX, y + 4 * MM + nsz * 1.05 + 1.5 * MM, F.r, 9, GRAY(0x44));
  const bx = ML + CW - blkW;
  rrect(page, bx, y, blkW, hh, 1.6 * MM, { fill: BLACK });
  textC(page, "ORÇAMENTO", bx + blkW / 2, y + 5 * MM, F.b, 7, WHITE, 1);
  textC(page, `Nº ${r.number}`, bx + blkW / 2, y + 10 * MM, F.mb, 17, WHITE);
  const emit = dataBR((d.now ?? new Date()).toISOString());
  textC(page, `Emitido em ${emit}${o ? ` · O.S. ${o.number}` : ""}`, bx + blkW / 2, y + hh + 1.6 * MM, F.m, 7, GRAY(0x55));
  y += hh + 5.5 * MM;
  box(page, ML, y, CW, 0.6 * MM);
  y += 0.6 * MM + 6 * MM;

  // ── cartões cliente e veículo
  const gap = 6 * MM, cw2 = (CW - gap) / 2, ch = 27 * MM, pad = 5 * MM;
  rrect(page, ML, y, cw2, ch, 2.5 * MM, { fill: G1 });
  rrect(page, ML + cw2 + gap, y, cw2, ch, 2.5 * MM, { fill: G1 });
  const lbl = (p: PDFPage, t: string, x: number, top: number) => text(p, t.toUpperCase(), x, top, F.b, 6.5, GRAY(0x55), 0.6);
  {
    const x = ML + pad, max = cw2 - 2 * pad;
    lbl(page, "Cliente", x, y + 3.5 * MM);
    text(page, fit(c?.name || "—", F.b, 12, max), x, y + 7.5 * MM, F.b, 12);
    text(page, c?.phone ? fmtFone(c.phone) : "—", x, y + 13.5 * MM, F.mb, 9.5);
    const ext = [c?.document ? `CPF/CNPJ ${c.document}` : "", c?.zip_code ? `CEP ${fmtCep(c.zip_code)}` : ""].filter(Boolean).join(" · ");
    if (ext) text(page, fit(ext, F.r, 8, max), x, y + 18.5 * MM, F.r, 8, GRAY(0x55));
  }
  {
    const x0 = ML + cw2 + gap, x = x0 + pad, pw = 34 * MM, max = cw2 - 2 * pad - pw - 4 * MM;
    lbl(page, "Veículo", x, y + 3.5 * MM);
    text(page, fit(o?.make || "—", F.b, 9, max), x, y + 7.5 * MM, F.b, 9, GRAY(0x44));
    text(page, fit(o?.model || "—", F.b, 11.5, max), x, y + 11.5 * MM, F.b, 11.5);
    text(page, fit([o?.year, o?.color, o?.km ? o.km + " km" : ""].filter(Boolean).join(" · ") || "—", F.r, 8.5, max), x, y + 17 * MM, F.r, 8.5, GRAY(0x33));
    // placa Mercosul: borda preta, faixa "BRASIL"
    const px = x0 + cw2 - pad - pw, pt = y + 3.5 * MM, ph = 12 * MM;
    rrect(page, px, pt, pw, ph, 1.6 * MM, { fill: WHITE, border: BLACK, bw: 0.5 * MM });
    page.drawRectangle({ x: px + 0.25 * MM, y: H - pt - 3.4 * MM, width: pw - 0.5 * MM, height: 3.15 * MM, color: BLACK });
    textC(page, "BRASIL", px + pw / 2, pt + 0.9 * MM, F.b, 5, WHITE, 1);
    textC(page, placa || "—", px + pw / 2, pt + 5.4 * MM, F.mb, 12);
  }
  y += ch + 9 * MM;

  // ── tabela de itens (cabeçalho se repete em cada página)
  const cQ = 18 * MM, cV = 28 * MM, cS = 30 * MM, padX = 4 * MM;
  const xS = ML + CW - padX, xV = xS - cS, xQ = xV - cV, descMax = CW - cQ - cV - cS - 2 * padX;
  const theadH = 6.6 * MM;
  const thead = () => {
    rrect(page, ML, y, CW, theadH, 1.6 * MM, { fill: BLACK });
    const t = y + (theadH - 6.8) / 2 + 0.3;
    text(page, "DESCRIÇÃO", ML + padX, t, F.b, 6.8, WHITE, 0.4);
    textR(page, "QTD", xQ, t, F.b, 6.8, WHITE);
    textR(page, "VALOR UN.", xV, t, F.b, 6.8, WHITE);
    textR(page, "SUBTOTAL", xS, t, F.b, 6.8, WHITE);
    y += theadH;
  };
  const room = (h: number) => {
    if (y + h <= H - FOOT) return;
    page = newPage(); y = MT; thead();
  };
  thead();
  const rows = d.items.filter(i => !isBlankItem(i));
  const grupo = (titulo: string, arr: OrcPdfData["items"]) => {
    if (!arr.length) return;
    const st = arr.reduce((a, i) => a + i.qty * i.unit_price, 0);
    room(7 * MM + 8 * MM);   // título do grupo não fica sozinho no fim da página
    text(page, titulo, ML + padX, y + 2.6 * MM, F.b, 7.5, BLACK, 0.6);
    textR(page, `${arr.length} ${arr.length > 1 ? "itens" : "item"} · ${brl(st)}`, xS, y + 2.6 * MM, F.mb, 7.5, GRAY(0x55));
    y += 7 * MM;
    page.drawLine({ start: { x: ML, y: H - y + 0.8 * MM }, end: { x: ML + CW, y: H - y + 0.8 * MM }, thickness: 0.5, color: G2 });
    arr.forEach((it, ix) => {
      const dl = wrap(it.description || "—", F.r, 9.5, descMax);
      const tl = it.details ? wrap(it.details, F.r, 7.5, descMax) : [];
      const h = 2.4 * MM * 2 + dl.length * 11.5 + tl.length * 9.2;
      room(h);
      if (ix % 2 === 1) rrect(page, ML, y, CW, h, 1.2 * MM, { fill: ZEBRA });
      let ty = y + 2.4 * MM;
      dl.forEach(l => { text(page, l, ML + padX, ty, F.r, 9.5); ty += 11.5; });
      tl.forEach(l => { text(page, l, ML + padX, ty, F.r, 7.5, GRAY(0x66)); ty += 9.2; });
      const ny = y + 2.4 * MM + 0.6;
      textR(page, qtd(it.qty), xQ, ny, F.m, 9.5);
      textR(page, n2(it.unit_price), xV, ny, F.m, 9.5, GRAY(0x33));
      textR(page, n2(it.qty * it.unit_price), xS, ny, F.mb, 9.5);
      y += h;
    });
  };
  grupo("PEÇAS", rows.filter(i => i.kind === "peca"));
  grupo("MÃO DE OBRA", rows.filter(i => i.kind === "mao"));
  if (!rows.length) { text(page, "Nenhum item no orçamento.", ML + padX, y + 3 * MM, F.r, 9.5, GRAY(0x55)); y += 9 * MM; }

  // ── condições + totais (nunca quebra entre páginas)
  const T = quoteTotals(d.items, r.discount);
  const totW = 78 * MM, condW = CW - totW - 8 * MM, cpad = 5 * MM, cmax = condW - 2 * cpad;
  const val = dataBR(new Date(new Date(r.created_at).getTime() + (r.validity_days || 0) * 864e5).toISOString());
  const cond: { t: string; f: PDFFont; c: ReturnType<typeof rgb> }[] = [
    ...wrap(`Validade: ${r.validity_days} dias (até ${val}).`, F.b, 8, cmax).map(t => ({ t, f: F.b, c: BLACK })),
    ...wrap(`Situação: ${ORC_ST[r.status] ?? r.status}.`, F.r, 8, cmax).map(t => ({ t, f: F.r, c: BLACK })),
    ...wrap("Valores sujeitos a alteração caso sejam encontrados outros problemas durante o serviço, sempre com nova aprovação do cliente.", F.r, 8, cmax).map(t => ({ t, f: F.r, c: GRAY(0x44) })),
    ...wrap(d.portalUrl ? "Acompanhe o serviço e aprove o orçamento pelo link (senha: seu celular com DDD):" : "Acompanhe o serviço em tempo real pelo link enviado no WhatsApp.", F.r, 8, cmax).map(t => ({ t, f: F.r, c: GRAY(0x44) })),
    ...(d.portalUrl ? wrap(d.portalUrl, F.m, 7, cmax).map(t => ({ t, f: F.m, c: BLACK })) : []),
  ];
  const condH = 3.5 * MM * 2 + 6.5 + 2 * MM + cond.length * 10.2;
  const totLines: [string, string][] = [["Peças", brl(T.pecas)], ["Mão de obra", brl(T.mao)], ...(r.discount ? [["Desconto", "- " + brl(r.discount)] as [string, string]] : [])];
  const totH = totLines.length * 6.2 * MM + 1.5 * MM + 12 * MM;
  const signH = 22 * MM;
  const blockH = Math.max(condH, totH);
  if (y + 7 * MM + blockH + signH > H - FOOT) { page = newPage(); y = MT; } else y += 7 * MM;
  rrect(page, ML, y, condW, condH, 2.5 * MM, { border: G2, bw: 0.3 * MM });
  lbl(page, "Condições", ML + cpad, y + 3.5 * MM);
  let cy = y + 3.5 * MM + 6.5 + 2 * MM;
  const linkTop = { from: 0, to: 0 };
  cond.forEach((l, ix) => {
    if (l.f === F.m && !linkTop.from) linkTop.from = cy;
    text(page, l.t, ML + cpad, cy, l.f, l.f === F.m ? 7 : 8, l.c); cy += 10.2;
    if (l.f === F.m && ix === cond.length - 1) linkTop.to = cy;
  });
  if (d.portalUrl && linkTop.from) addLink(doc, page, d.portalUrl, ML + cpad, H - linkTop.to, cmax, linkTop.to - linkTop.from);
  const tx = ML + CW - totW;
  let ty = y;
  for (const [l, v] of totLines) {
    text(page, l, tx + 4 * MM, ty + 1.6 * MM, F.r, 9, GRAY(0x44));
    textR(page, v, tx + totW - 4 * MM, ty + 1.6 * MM, F.mb, 9.5);
    ty += 6.2 * MM;
  }
  ty += 1.5 * MM;
  rrect(page, tx, ty, totW, 12 * MM, 1.6 * MM, { fill: BLACK });
  text(page, "TOTAL", tx + 5 * MM, ty + 4.6 * MM, F.b, 8, WHITE, 1);
  textR(page, brl(T.total), tx + totW - 5 * MM, ty + 3.2 * MM, F.mb, 16, WHITE);
  y += blockH;

  // ── aprovação do cliente
  y += 12 * MM;
  const sw = (CW - 12 * MM) / 2;
  [[ "Aprovação do cliente", c?.name || "" ], ["Data", "____/____/________"]].forEach(([t, s], ix) => {
    const x = ML + ix * (sw + 12 * MM);
    page.drawLine({ start: { x, y: H - y }, end: { x: x + sw, y: H - y }, thickness: 0.8, color: BLACK });
    text(page, t, x, y + 1.6 * MM, F.b, 8);
    if (s) text(page, fit(s, ix ? F.m : F.r, 7.5, sw), x, y + 5.2 * MM, ix ? F.m : F.r, 7.5, GRAY(0x55));
  });

  // ── rodapé em todas as páginas
  const footer = `${shop.name} · Orçamento ${r.number}${placa ? " · " + placa : ""}`;
  pages.forEach((p, ix) => {
    const fy = H - MB - 7;   // topo do texto do rodapé
    p.drawLine({ start: { x: ML, y: MB + 7 + 2 * MM }, end: { x: ML + CW, y: MB + 7 + 2 * MM }, thickness: 0.5, color: G2 });
    text(p, footer, ML, fy, F.m, 7, GRAY(0x55));
    textR(p, `Página ${ix + 1} de ${pages.length}`, ML + CW, fy, F.m, 7, GRAY(0x55));
  });

  return doc.save();
}

// link clicável (anotação URI) sobre o texto do endereço do portal
function addLink(doc: PDFDocument, page: PDFPage, url: string, x: number, y: number, w: number, h: number) {
  const annot = doc.context.obj({
    Type: "Annot", Subtype: "Link", Rect: [x, y, x + w, y + h], Border: [0, 0, 0],
    A: { Type: "Action", S: "URI", URI: PDFString.of(url) },
  });
  const ref = doc.context.register(annot);
  page.node.addAnnot(ref);
}
