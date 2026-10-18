import { test } from "node:test";
import assert from "node:assert/strict";
import { escalaMax, faixaMes, fracao, metaErro, metaStatus } from "./metas.ts";

const M = { goal: 50000, super_goal: 70000 };

test("metas: faixa do mês em São Paulo", () => {
  assert.deepEqual(faixaMes("2026-10"), ["2026-10-01T00:00:00-03:00", "2026-11-01T00:00:00-03:00"]);
  assert.deepEqual(faixaMes("2026-12"), ["2026-12-01T00:00:00-03:00", "2027-01-01T00:00:00-03:00"]);
});

test("metas: escala e ponteiro", () => {
  assert.equal(escalaMax(M), 84000);
  assert.equal(fracao(42000, 84000), 0.5);
  assert.equal(fracao(100000, 84000), 1);
  assert.equal(fracao(-5, 84000), 0);
});

test("metas: nível, faltas e ritmo no mês corrente", () => {
  // 18/10: 17 dias fechados, 14 dias restantes contando hoje
  const s = metaStatus(34000, M, "2026-10", "2026-10-18");
  assert.equal(s.nivel, "abaixo");
  assert.equal(s.pctMeta, 68);
  assert.equal(s.faltaMeta, 16000);
  assert.equal(s.diasRest, 14);
  assert.equal(s.porDiaMeta, round(16000 / 14));
  assert.equal(s.projecao, round(34000 + 34000 / 17 * 14));
  assert.equal(metaStatus(50000, M, "2026-10", "2026-10-18").nivel, "meta");
  assert.equal(metaStatus(70000, M, "2026-10", "2026-10-18").nivel, "super");
  assert.equal(metaStatus(80000, M, "2026-10", "2026-10-18").faltaSuper, 0);
});

test("metas: mês passado não tem dias restantes", () => {
  const s = metaStatus(45000, M, "2026-09", "2026-10-18");
  assert.equal(s.diasRest, 0);
  assert.equal(s.porDiaMeta, 0);
  assert.equal(s.projecao, 45000);
});

test("metas: validação", () => {
  assert.equal(metaErro(0, 10), "Informe o valor da META");
  assert.equal(metaErro(10, 5), "A SUPER META precisa ser maior ou igual à META");
  assert.equal(metaErro(10, 10), null);
});

const round = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
