// PDF do orçamento: gera um arquivo válido, quebra página com muitos itens e não falha com caracteres fora do Latin-1.
import { test } from "node:test";
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import { orcPdf, orcPdfName, type OrcPdfData } from "./orc-pdf.ts";

const base: OrcPdfData = {
  quote: { number: 501, plate: "ABC1D23", discount: 50, validity_days: 7, status: "enviado", created_at: "2026-10-19T12:00:00Z" },
  items: [
    { kind: "peca", description: "Pastilha de freio dianteira", details: null, qty: 1, unit_price: 189.9 },
    { kind: "mao", description: "Check list viagem", details: "Verificação do sistema elétrico, suspensão, freios e motor", qty: 1, unit_price: 350 },
  ],
  customer: { name: "João da Silva", phone: "61981234567", document: "123.456.789-00", zip_code: "70000000" },
  os: { number: 1001, plate: "ABC1D23", make: "Volkswagen", model: "Gol 1.6", year: "2020/2021", color: "Prata", km: "45.000" },
  shop: { name: "Autogrado" },
  portalUrl: "https://hausgrado.vercel.app/c/" + "a".repeat(48),
};

test("gera um PDF de uma página", async () => {
  const bytes = await orcPdf(base);
  assert.equal(new TextDecoder().decode(bytes.slice(0, 5)), "%PDF-");
  const doc = await PDFDocument.load(bytes);
  assert.equal(doc.getPageCount(), 1);
  assert.match(doc.getTitle() ?? "", /501/);
});

test("muitos itens quebram em várias páginas", async () => {
  const items = Array.from({ length: 60 }, (_, i) => ({ kind: (i % 3 ? "peca" : "mao") as "peca" | "mao", description: `Item ${i + 1} com uma descrição comprida o bastante para quebrar a linha da tabela do orçamento em duas`, details: i % 5 ? null : "Detalhe do serviço", qty: 2, unit_price: 10 }));
  const doc = await PDFDocument.load(await orcPdf({ ...base, items }));
  assert.ok(doc.getPageCount() >= 3);
});

test("caracteres fora do Latin-1 não quebram o arquivo", async () => {
  const bytes = await orcPdf({ ...base, customer: { ...base.customer!, name: "Zé 🚗 → Ω" }, items: [{ kind: "peca", description: "Óleo 5W30 − 4L ✓", details: "linha 1\nlinha 2\ttab", qty: 1.5, unit_price: 0 }], os: null, portalUrl: null });
  assert.ok(bytes.length > 1000);
});

test("nome do arquivo", () => {
  assert.equal(orcPdfName(501, "ABC1D23"), "Orcamento-501-ABC1D23.pdf");
  assert.equal(orcPdfName(502, null), "Orcamento-502.pdf");
});
