"use client";
// Painel "Estoque" do produto aberto: saldo, reservado, disponível, a caminho, ajuste manual e movimentações.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client.ts";
import { dt, parseNum } from "@/lib/labels.ts";
import { MOTIVOS_AJUSTE, deltaAjuste, disponivel, estoqueSit, qtdBR } from "@/lib/estoque.ts";
import { errMsg, toast } from "@/lib/ui.ts";

interface Mov { id: string; qty: number; kind: string; reason: string | null; occurred_at: string; created_by_name: string | null }
const KIND: Record<string, string> = { compra: "Compra", os: "O.S.", ajuste: "Ajuste" };
type Modo = "inventario" | "entrada" | "saida";

export function EstoquePanel({ p, liberado }: { p: { id: string; name: string; stock_qty: number; min_stock: number; reserved: number; incoming: number }; liberado: boolean }) {
  const router = useRouter();
  const [movs, setMovs] = useState<Mov[] | null>(null);
  const [aj, setAj] = useState(false);
  const [modo, setModo] = useState<Modo>("inventario");
  const [qtd, setQtd] = useState("");
  const [motivo, setMotivo] = useState(MOTIVOS_AJUSTE[0]);
  const [obs, setObs] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let vivo = true;
    setMovs(null);
    createClient().from("stock_movements").select("id, qty, kind, reason, occurred_at, created_by_name")
      .eq("product_id", p.id).order("occurred_at", { ascending: false }).limit(30)
      .then(({ data }) => { if (vivo) setMovs(((data ?? []) as Mov[]).map(m => ({ ...m, qty: Number(m.qty) }))); }, () => { if (vivo) setMovs([]); });
    return () => { vivo = false; };
  }, [p.id, p.stock_qty]);

  const sit = estoqueSit(p);
  const q = parseNum(qtd);
  const delta = qtd.trim() === "" ? null : deltaAjuste(modo, q, p.stock_qty);

  function escolheModo(m: Modo) {
    setModo(m);
    setMotivo(m === "inventario" ? MOTIVOS_AJUSTE[0] : m === "saida" ? "Perda / avaria" : "Correção de lançamento");
  }

  async function salvar() {
    if (qtd.trim() === "" || (modo !== "inventario" && !(q > 0))) return toast("Informe a quantidade");
    if (q < 0) return toast("Informe uma quantidade positiva");
    if (!delta) return toast(modo === "inventario" ? "A contagem é igual ao saldo: nada a ajustar" : "Informe a quantidade");
    const reason = obs.trim() ? `${motivo} · ${obs.trim()}` : motivo;
    setBusy(true);
    const { error } = await createClient().rpc("adjust_stock", { p_product: p.id, p_qty: delta, p_reason: reason });
    setBusy(false);
    if (error) return toast(errMsg(error), { err: true });
    toast(`Estoque de ${p.name}: ${delta > 0 ? "+" : ""}${qtdBR(delta)}`, { sound: "ok" });
    setAj(false); setQtd(""); setObs("");
    router.refresh();
  }

  return (
    <section className="panel" id="pr-estoque">
      <div className="ph"><h2>Estoque</h2>{sit.cls && <span className={`chip ${sit.cls}`}>{sit.l}</span>}</div>
      <div className="est-grid">
        <div className="lcd-cell"><span>Em estoque</span><strong className={`mono est-n ${sit.cls ? "neg" : ""}`}>{qtdBR(p.stock_qty)}</strong></div>
        <div className="lcd-cell"><span>Reservado</span><strong className="mono">{qtdBR(p.reserved)}</strong></div>
        <div className="lcd-cell"><span>Disponível</span><strong className="mono">{qtdBR(disponivel(p))}</strong></div>
        <div className="lcd-cell"><span>A caminho</span><strong className="mono">{qtdBR(p.incoming)}</strong></div>
      </div>
      <p className="hint" style={{ margin: "8px 0 12px" }}>Reservado = peças em orçamentos aprovados de carros no pátio. A caminho = compras ainda não recebidas.{p.min_stock > 0 ? ` Mínimo: ${qtdBR(p.min_stock)}.` : ""}</p>

      {!liberado ? <p className="hint bal-lock" id="est-trava">Estoque travado. Para alterar, use o botão <b>Balanço</b> no topo da lista.</p>
      : aj ? (
        <div className="stack est-aj">
          <div className="opt-grid" role="radiogroup" aria-label="Tipo de ajuste">
            {([["inventario", "Inventário"], ["entrada", "Entrada"], ["saida", "Saída"]] as [Modo, string][]).map(([k, l]) => (
              <label key={k} className={`opt ${modo === k ? "on" : ""}`}><input type="radio" name="est-modo" checked={modo === k} onChange={() => escolheModo(k)} /><span>{l}</span></label>
            ))}
          </div>
          <div className="grid2">
            <label className="field"><span className="label">{modo === "inventario" ? "Quantidade contada" : "Quantidade"}</span>
              <input className="input mono" id="est-qtd" inputMode="decimal" value={qtd} onChange={e => setQtd(e.target.value)} autoFocus /></label>
            <label className="field"><span className="label">Motivo</span>
              <select className="input" id="est-mot" value={motivo} onChange={e => setMotivo(e.target.value)}>
                {MOTIVOS_AJUSTE.map(m => <option key={m}>{m}</option>)}
              </select></label>
          </div>
          <label className="field"><span className="label">Observação</span>
            <input className="input" id="est-obs" value={obs} onChange={e => setObs(e.target.value)} placeholder="Opcional. Ex.: frasco quebrou no pátio" /></label>
          <span className="hint" id="est-prev">{delta == null ? "O saldo muda na hora e o ajuste fica no histórico com seu nome."
            : delta === 0 ? "A contagem é igual ao saldo atual."
            : `Saldo vai de ${qtdBR(p.stock_qty)} para ${qtdBR(p.stock_qty + delta)} (${delta > 0 ? "+" : ""}${qtdBR(delta)}).`}</span>
          <div className="row">
            <button className="key accent" disabled={busy} onClick={salvar}>Confirmar ajuste</button>
            <button className="key" onClick={() => { setAj(false); setQtd(""); setObs(""); }}>Cancelar</button>
          </div>
        </div>
      ) : <button className="key" id="est-ajustar" onClick={() => setAj(true)}>Ajustar estoque</button>}

      <div className="label" style={{ margin: "16px 0 8px" }}>Movimentações</div>
      <div className="timeline">
        {movs == null ? <div className="empty">Carregando…</div>
          : movs.length ? movs.map(m => (
            <div className="tl" key={m.id}><time>{dt(m.occurred_at)}</time>
              <span className="est-mov"><span><b className={`mono ${m.qty < 0 ? "est-out" : "est-in"}`}>{m.qty > 0 ? "+" : ""}{qtdBR(m.qty)}</b> {KIND[m.kind] ?? m.kind}{m.reason ? ` · ${m.reason}` : ""}</span>
                {m.created_by_name && <small className="tl-por">{m.created_by_name}</small>}</span></div>
          )) : <div className="empty">Nenhuma movimentação ainda</div>}
      </div>
    </section>
  );
}
