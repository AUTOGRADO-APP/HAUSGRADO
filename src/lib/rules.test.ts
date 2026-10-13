// npm test  (node --experimental-strip-types --test)
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  brl, normalizePlate, normalizePhone, formatPhone, normalizeCep, formatCep, quoteTotals, feePct, paymentSummary,
  commission, isStale, showOnBoard, usernameToEmail, DEFAULT_CREDIT_FEES, round2, isBlankItem,
} from "./rules.ts";
import { canAccess, navFor, homeFor } from "./permissions.ts";

const fees = { fee_debit_pct: 1.39, fee_pix_pct: 0.99, fee_credit_pct: DEFAULT_CREDIT_FEES };

test("dinheiro em reais", () => {
  assert.equal(brl(1234.5), "R$ 1.234,50");
  assert.equal(round2(1.005), 1.01);
});

test("placa", () => {
  assert.equal(normalizePlate("pab-1c23"), "PAB1C23");
  assert.equal(normalizePlate("abc 1234"), "ABC1234");
  assert.equal(normalizePlate("AB1C23"), null);
});

test("telefone e CEP", () => {
  assert.equal(normalizePhone("+55 (61) 99123-4567"), "61991234567");
  assert.equal(normalizePhone("123"), null);
  assert.equal(formatPhone("61991234567"), "(61) 99123-4567");
  assert.equal(normalizeCep("70.040-010"), "70040010");
  assert.equal(formatCep("70040010"), "70040-010");
});

test("totais do orçamento (mesmo caso do teste SQL T6)", () => {
  const t = quoteTotals([{ kind: "mao", qty: 1, unit_price: 890 }, { kind: "peca", qty: 4, unit_price: 59.9 }], 50);
  assert.deepEqual(t, { pecas: 239.6, mao: 890, subtotal: 1129.6, discount: 50, total: 1079.6 });
});

test("taxa por forma de pagamento e parcelas", () => {
  assert.equal(feePct({ method: "credito", amount: 100, installments: 3 }, fees), 5.29);
  assert.equal(feePct({ method: "credito", amount: 100, installments: 99 }, fees), 11.59);
  assert.equal(feePct({ method: "dinheiro", amount: 100 }, fees), 0);
});

test("pagamento: mesmo caso do teste SQL T7/T10 (taxa 11,57)", () => {
  const s = paymentSummary(350, [{ method: "pix", amount: 100 }, { method: "credito", amount: 200, installments: 3 }], fees);
  assert.equal(s.fee, 11.57);
  assert.equal(s.missing, 50);
  assert.equal(s.canFinalize, false);
  assert.equal(s.needsPassword, true);
  assert.equal(paymentSummary(350, [{ method: "pix", amount: 300 }], fees, true).canFinalize, true);
  assert.equal(paymentSummary(350, [{ method: "dinheiro", amount: 400 }], fees).change, 50);
  assert.equal(paymentSummary(0, [], fees).canFinalize, true);
});

test("comissão 5% da mão de obra", () => assert.equal(commission(350), 17.5));

test("quadro: parado e finalizados recentes", () => {
  const now = new Date("2026-10-13T12:00:00");
  assert.equal(isStale("servico", new Date("2026-10-10T11:00:00"), now), true);
  assert.equal(isStale("finalizado", new Date("2026-10-01"), now), false);
  assert.equal(showOnBoard("finalizado", new Date("2026-10-10T13:00:00"), now), true);
  assert.equal(showOnBoard("finalizado", new Date("2026-10-09T11:00:00"), now), false);
});

test("login por usuário", () => {
  assert.equal(usernameToEmail(" Master ", "x.app"), "master@x.app");
  assert.equal(usernameToEmail("a b", "x.app"), null);
});

test("permissões por perfil", () => {
  assert.equal(canAccess("atendente", "/quadro"), true);
  assert.equal(canAccess("atendente", "/gestao"), false);
  assert.equal(canAccess("atendente", "/financeiro/comissoes"), false);
  assert.equal(canAccess("admin", "/financeiro/entradas"), true);
  assert.equal(canAccess("admin", "/config"), false);
  assert.equal(canAccess("master", "/config"), true);
  assert.equal(canAccess(null, "/quadro"), false);
  assert.equal(navFor("atendente").some(i => i.href === "/financeiro"), false);
  assert.equal(homeFor("atendente"), "/quadro");
});

test("linha de orçamento em branco", () => {
  assert.equal(isBlankItem({ description: "", unit_price: 0 }), true);
  assert.equal(isBlankItem({ description: "   ", unit_price: 0 }), true);
  assert.equal(isBlankItem({ description: null, unit_price: 0 }), true);
  assert.equal(isBlankItem({ description: "Pastilha (garantia)", unit_price: 0 }), false);
  assert.equal(isBlankItem({ description: "", unit_price: 50 }), false);
});
