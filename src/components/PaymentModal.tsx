"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client.ts";
import { brl, paymentSummary, feePct, type Payment, type PayMethod, type ShopFees } from "@/lib/rules.ts";

const METHODS: { id: PayMethod; label: string }[] = [
  { id: "dinheiro", label: "Dinheiro" }, { id: "pix", label: "Pix" },
  { id: "debito", label: "Débito" }, { id: "credito", label: "Crédito" },
];

// Popup de recebimento: Esperando entrega → Finalizado. A conferência final é do banco (register_receipt).
export function PaymentModal({ os, fees, onClose, onDone }: {
  os: { id: string; number: number; plate: string; total: number };
  fees: ShopFees; onClose: () => void; onDone: () => void;
}) {
  const supabase = createClient();
  const total = Number(os.total);
  const [pays, setPays] = useState<Payment[]>([{ method: "pix", amount: total }]);
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const s = paymentSummary(total, pays, fees, password.length >= 4);
  const set = (i: number, patch: Partial<Payment>) => setPays(ps => ps.map((p, j) => (j === i ? { ...p, ...patch } : p)));

  async function confirm() {
    setBusy(true); setErr(null);
    const { error } = await supabase.rpc("register_receipt", {
      p_os: os.id, p_payments: pays.filter(p => p.amount > 0), p_password: s.needsPassword ? password : null,
    });
    setBusy(false);
    if (error) setErr(error.message); else onDone();
  }

  return (
    <div className="modal-bg" role="dialog" aria-modal="true" aria-label="Receber pagamento">
      <div className="card modal" style={{ display: "grid", gap: 14 }}>
        <div><strong>Receber pagamento</strong> <span className="plate">{os.plate}</span> <span className="muted num">O.S. {os.number}</span></div>
        <div className="num" style={{ fontSize: 28, fontWeight: 700 }}>{brl(total)}</div>

        {pays.map((p, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto auto", gap: 8, alignItems: "center" }}>
            <select className="input" value={p.method} onChange={e => set(i, { method: e.target.value as PayMethod, installments: 1 })}>
              {METHODS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
            <input className="input num" type="number" min={0} step="0.01" value={p.amount || ""}
              onChange={e => set(i, { amount: Number(e.target.value) })} aria-label="Valor" />
            {p.method === "credito"
              ? <select className="input" value={p.installments ?? 1} onChange={e => set(i, { installments: Number(e.target.value) })} aria-label="Parcelas">
                  {Array.from({ length: 12 }, (_, k) => <option key={k} value={k + 1}>{k + 1}x · {fees.fee_credit_pct[k]}%</option>)}
                </select>
              : <span className="muted num" style={{ fontSize: 12 }}>{feePct(p, fees)}%</span>}
            {pays.length > 1 && <button className="btn" onClick={() => setPays(ps => ps.filter((_, j) => j !== i))} aria-label="Remover">×</button>}
          </div>
        ))}
        <button className="btn" onClick={() => setPays(ps => [...ps, { method: "dinheiro", amount: Math.max(0, s.missing) }])}>+ Outra forma</button>

        <div className="num" style={{ fontSize: 14, display: "grid", gap: 4 }}>
          <div>Recebido: {brl(s.received)} · Taxas: {brl(s.fee)} · Líquido: {brl(s.net)}</div>
          {s.missing > 0 && <div className="error">Faltam {brl(s.missing)}</div>}
          {s.change > 0 && <div>Troco: {brl(s.change)}</div>}
        </div>

        {s.needsPassword && (
          <div>
            <label className="label" htmlFor="pw">Senha de autorização de desconto</label>
            <input id="pw" className="input" type="password" value={password} onChange={e => setPassword(e.target.value)} />
          </div>
        )}
        {err && <p className="error" role="alert">{err}</p>}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" disabled={!s.canFinalize || busy} onClick={confirm}>
            {total <= 0 ? "Finalizar sem cobrança" : busy ? "Registrando…" : "Confirmar e finalizar"}
          </button>
        </div>
      </div>
    </div>
  );
}
