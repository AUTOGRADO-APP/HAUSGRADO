import { test } from "node:test";
import assert from "node:assert/strict";
import { computeAtencao, computeGestao, quoteByOrder, serieMes, type GOrder, type GQuote, type GReceipt } from "./gestao.ts";

const os = (id: string, tec: string | null, extra: Partial<GOrder> = {}): GOrder => ({
  id, status: "finalizado", entry_type: "servico", entered_at: "2026-10-01T09:00:00-03:00", exited_at: "2026-10-03T09:00:00-03:00",
  technician_id: tec, ...extra,
});
const rec = (id: string, quando: string, total: number, difference = 0): GReceipt => ({ service_order_id: id, received_at: quando, total, difference });
const orc = (id: string, os: string | null, status: string, itens: [("peca" | "mao"), number][], extra: Partial<GQuote> = {}): GQuote => ({
  id, service_order_id: os, status, discount: 0, created_at: "2026-10-01T10:00:00Z",
  items: itens.map(([kind, v]) => ({ kind, description: kind === "mao" ? "Mão de obra — Troca de óleo" : "Filtro", qty: 1, unit_price: v })), ...extra,
});

test("gestão: faturamento = recebido nas entradas, com desconto no fechamento", () => {
  const G = computeGestao({
    orders: [os("a", "t1"), os("b", "t2"), os("c", "t1")],
    receipts: [
      rec("a", "2026-10-05T15:00:00-03:00", 450, -50),   // orçamento 500, fechou com R$ 50 de desconto
      rec("b", "2026-10-18T10:00:00-03:00", 300),
      rec("c", "2026-09-10T10:00:00-03:00", 200),        // mês anterior
    ],
    quotes: [orc("qa", "a", "aprovado", [["peca", 300], ["mao", 200]]), orc("qb", "b", "aprovado", [["mao", 300]]), orc("qc", "c", "aprovado", [["mao", 200]])],
    techs: [{ id: "t1", name: "Arthur", active: true }, { id: "t2", name: "Iago", active: true }],
    commissionPct: 5, mes: "2026-10", hoje: "2026-10-19",
  });
  assert.equal(G.M.fat, 750);
  assert.equal(G.M.n, 2);
  assert.equal(G.M.ticket, 375);
  assert.equal(G.M.desc, 50);
  assert.equal(G.M.descN, 1);
  assert.equal(G.M.pecas, 300);
  assert.equal(G.M.mao, 500);
  assert.equal(G.M.tempo, 2);
  // mês corrente compara com o anterior até o mesmo dia (19)
  assert.equal(G.ateDia, 19);
  assert.equal(G.P.fat, 200);
  // mecânicos pelo recebido; comissão sobre a mão de obra do orçamento
  const arthur = G.mec.find(m => m.id === "t1")!;
  assert.equal(arthur.fat, 450);
  assert.equal(arthur.com, 10);
});

test("gestão: mês corrente compara só até o mesmo dia do mês anterior", () => {
  const G = computeGestao({
    orders: [os("a", null), os("b", null)], quotes: [], techs: [], commissionPct: 5, mes: "2026-10", hoje: "2026-10-10",
    receipts: [rec("a", "2026-09-05T10:00:00-03:00", 100), rec("b", "2026-09-25T10:00:00-03:00", 900)],
  });
  assert.equal(G.P.fat, 100);
  const passado = computeGestao({
    orders: [os("a", null), os("b", null)], quotes: [], techs: [], commissionPct: 5, mes: "2026-10", hoje: "2026-11-02",
    receipts: [rec("a", "2026-09-05T10:00:00-03:00", 100), rec("b", "2026-09-25T10:00:00-03:00", 900)],
  });
  assert.equal(passado.P.fat, 1000);
  assert.equal(passado.ateDia, 31);
});

test("gestão: acumulado do mês dia a dia (fuso de São Paulo)", () => {
  const s = serieMes([
    rec("a", "2026-10-01T23:30:00-03:00", 100),
    rec("b", "2026-10-02T02:30:00Z", 50),              // 23:30 do dia 1 em São Paulo
    rec("c", "2026-10-03T12:00:00-03:00", 25),
  ], "2026-10");
  assert.equal(s.length, 31);
  assert.deepEqual(s.slice(0, 3).map(d => [d.v, d.n, d.acc]), [[150, 2, 150], [0, 0, 150], [25, 1, 175]]);
  assert.equal(s[30].acc, 175);
});

test("gestão: orçamento da O.S. = aprovado, senão o mais recente não recusado", () => {
  const m = quoteByOrder([
    orc("q1", "a", "aprovado", [["mao", 100]], { created_at: "2026-10-01T00:00:00Z" }),
    orc("q2", "a", "rascunho", [["mao", 999]], { created_at: "2026-10-05T00:00:00Z" }),
    orc("q3", "b", "recusado", [["mao", 50]], { created_at: "2026-10-05T00:00:00Z" }),
    orc("q4", "b", "enviado", [["mao", 70]], { created_at: "2026-10-01T00:00:00Z" }),
  ]);
  assert.equal(m.get("a")!.id, "q1");
  assert.equal(m.get("b")!.id, "q4");
});

test("gestão: precisa de atenção", () => {
  const agora = new Date("2026-10-19T12:00:00-03:00");
  const A = computeAtencao({
    agora,
    quotes: [
      { ...orc("r1", "a", "rascunho", [["mao", 100]]), os_status: "orcamento" },
      { ...orc("r2", "z", "rascunho", [["mao", 999]]), os_status: "finalizado" },   // O.S. já finalizada: não conta
      { ...orc("e1", "b", "enviado", [["mao", 200]], { created_at: "2026-10-10T12:00:00-03:00" }), os_status: "orcamento" },
      { ...orc("e2", null, "enviado", [["peca", 50]], { created_at: "2026-10-17T12:00:00-03:00" }), os_status: null },
    ],
    enviadoEm: new Map([["b", "2026-10-15T12:00:00-03:00"]]),   // enviado pelo WhatsApp no dia 15
    board: [
      { status: "servico", status_since: "2026-10-15T12:00:00-03:00", total: 0 },
      { status: "entrega", status_since: "2026-10-19T08:00:00-03:00", total: 480 },
      { status: "entrega", status_since: "2026-10-18T08:00:00-03:00", total: 120 },
      { status: "finalizado", status_since: "2026-10-01T08:00:00-03:00", total: 900 },
    ],
    vencidas: [{ amount: 80 }, { amount: 20.5 }],
  });
  assert.deepEqual(A.rascunho, { n: 1, v: 100 });
  assert.deepEqual(A.enviado, { n: 2, v: 250, dias: 4 });
  assert.equal(A.parados, 1);
  assert.deepEqual(A.entrega, { n: 2, v: 600 });
  assert.deepEqual(A.vencidas, { n: 2, v: 100.5 });
});
