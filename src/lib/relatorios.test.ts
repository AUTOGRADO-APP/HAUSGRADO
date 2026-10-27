import { test } from "node:test";
import assert from "node:assert/strict";
import { curvaABC, orcAtivo, periodoRel, somaVendas, valorEstoque } from "./relatorios.ts";

test("relatórios: período", () => {
  assert.deepEqual(periodoRel("90", undefined, undefined, "2026-10-27"), { de: "2026-07-30", ate: "2026-10-27" });
  assert.deepEqual(periodoRel("30", undefined, undefined, "2026-10-27"), { de: "2026-09-28", ate: "2026-10-27" });
  assert.deepEqual(periodoRel("ano", undefined, undefined, "2026-10-27"), { de: "2026-01-01", ate: "2026-10-27" });
  assert.deepEqual(periodoRel("livre", "2026-10-10", "2026-10-01", "2026-10-27"), { de: "2026-10-01", ate: "2026-10-10" });
});

test("relatórios: valor do estoque ignora saldo negativo", () => {
  const v = valorEstoque([
    { id: "a", name: "A", category: "peca", stock_qty: 4, cost: 10, price: 25 },
    { id: "b", name: "B", category: "peca", stock_qty: -2, cost: 50, price: 90 },
    { id: "c", name: "C", category: "filtros", stock_qty: 1.5, cost: 20, price: 30 },
  ]);
  assert.equal(v.custo, 70);
  assert.equal(v.venda, 145);
  assert.equal(v.lucro, 75);
  assert.equal(v.markup, 107);
  assert.equal(v.unid, 5.5);
  assert.equal(v.neg, 1);
});

test("relatórios: vendas por produto e curva ABC", () => {
  const vend = somaVendas([
    { product_id: "a", qty: 2, unit_price: 400, unit_cost: 250, os_id: "o1" },
    { product_id: "a", qty: 1, unit_price: 400, unit_cost: 250, os_id: "o2" },
    { product_id: "b", qty: 5, unit_price: 30, os_id: "o1" },
    { product_id: "c", qty: 1, unit_price: 50, os_id: "o3" },
    { product_id: "d", qty: 1, unit_price: 20, os_id: "o3" },
    { product_id: "e", qty: 0, unit_price: 99, os_id: "o3" },
  ]);
  assert.deepEqual(vend.map(v => v.product_id), ["a", "b", "c", "d"]);
  assert.equal(vend[0].qty, 3); assert.equal(vend[0].valor, 1200); assert.equal(vend[0].custo, 750); assert.equal(vend[0].os, 2);
  // total 1420: a = 84,5% (A); antes de b o acumulado já passa de 80% → B; antes de c passa de 95% → C
  const abc = curvaABC(vend);
  assert.deepEqual(abc.map(x => x.classe), ["A", "B", "C", "C"]);
  assert.equal(Math.round(abc[3].acum), 100);
});

test("relatórios: orçamento ativo da O.S. (como os_quote)", () => {
  const m = orcAtivo([
    { id: "q1", service_order_id: "o1", status: "rascunho", created_at: "2026-10-02" },
    { id: "q2", service_order_id: "o1", status: "aprovado", created_at: "2026-10-01" },
    { id: "q3", service_order_id: "o2", status: "enviado", created_at: "2026-10-01" },
    { id: "q4", service_order_id: "o2", status: "rascunho", created_at: "2026-10-03" },
    { id: "q5", service_order_id: "o3", status: "recusado", created_at: "2026-10-03" },
  ]);
  assert.equal(m.get("o1"), "q2");
  assert.equal(m.get("o2"), "q4");
  assert.equal(m.has("o3"), false);
});
