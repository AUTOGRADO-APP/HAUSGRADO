import { test } from "node:test";
import assert from "node:assert/strict";
import { eanOk, fmtNcm, ncmOk } from "./produtos.ts";

test("produtos: NCM com 8 dígitos, exibido 0000.00.00", () => {
  assert.equal(fmtNcm("27101932"), "2710.19.32");
  assert.equal(fmtNcm("2710.19.32"), "2710.19.32");
  assert.equal(fmtNcm("87083"), "8708.3");
  assert.equal(fmtNcm(null), "");
  assert.equal(ncmOk(""), true);
  assert.equal(ncmOk("8708.30.90"), true);
  assert.equal(ncmOk("870830"), false);
});

test("produtos: EAN-13 com dígito verificador", () => {
  assert.equal(eanOk("7891234567895"), true);
  assert.equal(eanOk("7891234567890"), false);
});
