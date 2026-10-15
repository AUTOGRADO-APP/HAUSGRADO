"use client";
// Pop-up "+ Peça cadastrada" / "+ Produto cadastrado" (seção 7.9). Usado no orçamento (preço) e na compra (custo).
import { useEffect, useRef, useState } from "react";
import { brl } from "@/lib/rules.ts";
import { CATN, CATS } from "@/lib/labels.ts";
import { prodResumo } from "@/lib/produtos.ts";
import { qtdBR } from "@/lib/estoque.ts";

export interface PickProduct {
  id: string; name: string; manufacturer: string | null; sku: string | null; ean: string | null;
  cost: number; price: number; category: string;
  viscosity?: string | null; api?: string | null; volume?: string | null; application_spec?: string | null;
  application_brands?: string[] | null; additive_type?: string | null;
  /** estoque (orçamento): saldo e reservado por outros orçamentos aprovados */
  stock_qty?: number; reserved?: number;
}

export function ProductPicker({ produtos, qtd, onAdd, onClose, modo = "orcamento" }: {
  produtos: PickProduct[];
  /** quantidade já adicionada por product_id */
  qtd: Record<string, number>;
  onAdd: (p: PickProduct) => void;
  onClose: () => void;
  modo?: "orcamento" | "compra";
}) {
  const compra = modo === "compra";
  const [busca, setBusca] = useState("");
  const [cat, setCat] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus({ preventScroll: true }); }, []);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, [onClose]);

  const q = busca.toLowerCase();
  const list = produtos
    .filter(x => (!cat || x.category === cat) && (!q || [x.name, x.manufacturer, x.sku, x.ean, prodResumo(x)].join(" ").toLowerCase().includes(q)))
    .sort((a, b) => a.name.localeCompare(b.name));
  const onde = compra ? "na compra" : "no orçamento";

  return (
    <div className="modal-bg" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="pk-t">
        <div className="ph">
          <h2 id="pk-t" style={{ fontSize: "14pt" }}>{compra ? "Adicionar produto à compra" : "Adicionar peça cadastrada"}</h2>
          <button className="del" onClick={onClose} aria-label="Fechar">×</button>
        </div>
        <input ref={ref} className="input" id="pk-busca" placeholder="Buscar por nome, fabricante, SKU, EAN ou aplicação" value={busca} onChange={e => setBusca(e.target.value)} autoComplete="off" />
        <div className="row" style={{ margin: "10px 0" }}>
          {[["", "Todos"] as [string, string], ...CATS].map(([k, l]) => (
            <button key={k} className={`key sm ${cat === k ? "on" : ""}`} onClick={() => setCat(k)}>{l}</button>
          ))}
        </div>
        <div className="pk-list">
          {list.map(x => {
            const n = qtd[x.id] || 0;
            const res = prodResumo(x);
            const temEst = !compra && x.stock_qty != null;
            const disp = (x.stock_qty ?? 0) - (x.reserved ?? 0);
            const falta = temEst && n > disp;
            return (
              <div key={x.id} className="pk-it">
                <div style={{ minWidth: 0 }}>
                  <b>{x.name}</b>
                  <div className="hint">{x.manufacturer || "—"} · <span className="mono">{x.sku || "sem SKU"}</span>{res ? " · " + res : ""}</div>
                  {temEst && <div className={`pk-est ${disp <= 0 || falta ? "bad" : ""}`}>Estoque {qtdBR(x.stock_qty)}{x.reserved ? ` · reservado ${qtdBR(x.reserved)}` : ""} · disponível {qtdBR(disp)}{falta ? ` · faltam ${qtdBR(n - disp)} para este orçamento` : ""}</div>}
                </div>
                <span className="chip">{CATN[x.category] || ""}</span>
                <b className="mono pk-preco">{brl(Number(compra ? x.cost : x.price) || 0)}{compra && <small className="hint" style={{ display: "block", textAlign: "right" }}>custo</small>}</b>
                <button className={`key sm ${n ? "" : "accent"}`} onClick={() => onAdd(x)}>{n ? `Adicionar mais (${String(n).replace(".", ",")} ${onde})` : "Adicionar"}</button>
              </div>
            );
          })}
          {!list.length && <div className="empty">{produtos.length ? "Nenhuma peça encontrada" : "Nenhum produto cadastrado ainda. Cadastre em Produtos."}</div>}
        </div>
        <div className="row" style={{ justifyContent: "space-between", marginTop: 12 }}>
          <span className="hint">{list.length} de {produtos.length} produtos · Esc fecha</span>
          <button className="key" onClick={onClose}>Concluir</button>
        </div>
      </div>
    </div>
  );
}
