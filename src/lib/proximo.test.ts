import { test } from "node:test";
import assert from "node:assert/strict";
import { activeQuote, defaultTab, nextStep, quoteBadge } from "./proximo.ts";

test("orçamento ativo: aprovado primeiro, senão o mais recente não recusado (igual a os_quote)", () => {
  const q = (id: string, status: "rascunho" | "enviado" | "aprovado" | "recusado", created_at: string) => ({ id, status, created_at });
  assert.equal(activeQuote([q("a", "aprovado", "2026-10-01"), q("b", "rascunho", "2026-10-05")])?.id, "a");
  assert.equal(activeQuote([q("a", "enviado", "2026-10-01"), q("b", "rascunho", "2026-10-05")])?.id, "b");
  assert.equal(activeQuote([q("a", "recusado", "2026-10-05")]), null);
  assert.equal(activeQuote([]), null);
});

test("próximo passo por etapa", () => {
  assert.deepEqual(nextStep("orcamento", null).action, { kind: "quote-new" });
  assert.deepEqual(nextStep("orcamento", { status: "rascunho" }).action, { kind: "quote-open" });
  assert.deepEqual(nextStep("aprovado", { status: "aprovado" }).action, { kind: "status", to: "servico" });
  assert.deepEqual(nextStep("servico", null).action, { kind: "status", to: "entrega" });
  assert.deepEqual(nextStep("entrega", null).action, { kind: "pay" });
  assert.deepEqual(nextStep("finalizado", null).action, { kind: "pasta" });
});

test("selo do card e aba inicial", () => {
  assert.equal(quoteBadge("orcamento", null)?.text, "Sem orçamento");
  assert.equal(quoteBadge("orcamento", { status: "enviado" })?.text, "Aguardando cliente");
  assert.equal(quoteBadge("finalizado", { status: "aprovado" }), null);
  assert.equal(defaultTab("orcamento"), "avarias");
  assert.equal(defaultTab("pecas"), "pecas");
  assert.equal(defaultTab("entrega"), "servicos");
});
