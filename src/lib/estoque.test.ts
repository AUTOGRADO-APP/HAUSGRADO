import { test } from "node:test";
import assert from "node:assert/strict";
import { deltaAjuste, disponivel, estoqueBaixo, estoqueSit, qtdBR } from "./estoque.ts";

test("estoque: disponível, baixo e situação (números do regras_test T30)", () => {
  assert.equal(disponivel({ stock_qty: 12, min_stock: 0, reserved: 3 }), 9);
  assert.equal(estoqueBaixo({ stock_qty: 2, min_stock: 2 }), true);
  assert.equal(estoqueBaixo({ stock_qty: 3, min_stock: 2 }), false);
  assert.equal(estoqueBaixo({ stock_qty: 0, min_stock: 0 }), false);
  assert.equal(estoqueSit({ stock_qty: -1, min_stock: 0 }).k, "zero");
  assert.equal(estoqueSit({ stock_qty: 1, min_stock: 4 }).k, "baixo");
  assert.equal(qtdBR(1.5), "1,5");
});

test("estoque: ajuste manual", () => {
  assert.equal(deltaAjuste("inventario", 7, 10), -3);
  assert.equal(deltaAjuste("inventario", 4, 0), 4);
  assert.equal(deltaAjuste("entrada", 2, 10), 2);
  assert.equal(deltaAjuste("saida", 2, 10), -2);
});
