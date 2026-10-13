"use client";
// Pop-up "+ Serviço cadastrado" do orçamento (seção 7.10b).
import { useEffect, useRef, useState } from "react";
import { brl } from "@/lib/rules.ts";

export interface ServPick { id: string; name: string; description: string | null; price: number }

export function ServicePicker({ servicos, qtd, onAdd, onClose }: {
  servicos: ServPick[]; qtd: Record<string, number>; onAdd: (s: ServPick) => void; onClose: () => void;
}) {
  const [busca, setBusca] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus({ preventScroll: true }); }, []);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  const q = busca.toLowerCase();
  const list = servicos.filter(x => !q || [x.name, x.description].join(" ").toLowerCase().includes(q)).sort((a, b) => a.name.localeCompare(b.name));
  return (
    <div className="modal-bg" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="sk-t">
        <div className="ph">
          <h2 id="sk-t" style={{ fontSize: "14pt" }}>Adicionar serviço cadastrado</h2>
          <button className="del" onClick={onClose} aria-label="Fechar">×</button>
        </div>
        <input ref={ref} className="input" id="sk-busca" placeholder="Buscar serviço" value={busca} onChange={e => setBusca(e.target.value)} autoComplete="off" />
        <div className="pk-list" style={{ marginTop: 12 }}>
          {list.map(x => {
            const n = qtd[x.id] || 0;
            return (
              <div key={x.id} className="pk-it" style={{ gridTemplateColumns: "minmax(0,1fr) auto auto" }}>
                <div style={{ minWidth: 0 }}><b>{x.name}</b><div className="hint">{x.description || ""}</div></div>
                <b className="mono pk-preco">{brl(x.price)}</b>
                <button className={`key sm ${n ? "" : "accent"}`} onClick={() => onAdd(x)}>{n ? `Adicionar mais (${String(n).replace(".", ",")} no orçamento)` : "Adicionar"}</button>
              </div>
            );
          })}
          {!list.length && <div className="empty">{servicos.length ? "Nenhum serviço encontrado" : "Nenhum serviço cadastrado ainda. Cadastre em Serviços."}</div>}
        </div>
        <div className="row" style={{ justifyContent: "space-between", marginTop: 12 }}>
          <span className="hint">{list.length} de {servicos.length} serviços · Esc fecha</span>
          <button className="key" onClick={onClose}>Concluir</button>
        </div>
      </div>
    </div>
  );
}
