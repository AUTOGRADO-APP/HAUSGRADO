"use client";
// Pop-up "+ ENTRADA" (só master): entrada FANTASMA, sem O.S., placa ou cliente, sem taxa e com valor digitado.
// Serve para ajustes pontuais na implantação. A trava de perfil e as validações são do banco (add_ghost_receipt).
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client.ts";
import { brl } from "@/lib/rules.ts";
import { parseNum, ymd } from "@/lib/labels.ts";
import { errMsg, toast } from "@/lib/ui.ts";

export function GhostModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const hoje = ymd();
  const [valor, setValor] = useState("");
  const [dia, setDia] = useState(hoje);
  const [obs, setObs] = useState("");
  const [busy, setBusy] = useState(false);
  const valRef = useRef<HTMLInputElement>(null);
  useEffect(() => { valRef.current?.focus(); }, []);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, [onClose]);

  const v = Math.round(parseNum(valor) * 100) / 100;
  const ok = v > 0 && !!dia && dia <= hoje;

  async function lancar() {
    if (!ok || busy) return;
    setBusy(true);
    const { error } = await createClient().rpc("add_ghost_receipt", { p_amount: v, p_received_on: dia, p_note: obs.trim() || null });
    setBusy(false);
    if (error) return toast(errMsg(error), { err: true });
    toast(`Entrada fantasma de ${brl(v)} lançada`, { sound: "ok" });
    onDone();
  }

  return (
    <div className="modal-bg" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal pag" role="dialog" aria-modal="true" aria-labelledby="gh-t">
        <div className="ph">
          <h2 id="gh-t" style={{ fontSize: "14pt" }}>+ Entrada fantasma</h2>
          <button className="del" onClick={onClose} aria-label="Fechar">×</button>
        </div>
        <p className="hint" style={{ margin: "0 0 14px" }}>
          Para ajustes pontuais na implantação. Entra como O.S. <b>FANTASMA</b>, sem placa nem cliente, forma de pagamento <b>FANTASMA</b> e sem taxa.
          Conta no recebido (Entradas, Gestão e Metas); não gera comissão nem mexe no estoque.
        </p>
        <div className="stack">
          <div className="grid2">
            <label className="field"><span className="label">Valor (R$)</span>
              <input ref={valRef} className="input mono" id="gh-val" inputMode="decimal" placeholder="0,00" value={valor}
                onChange={e => setValor(e.target.value)} onKeyDown={e => { if (e.key === "Enter") void lancar(); }} /></label>
            <label className="field"><span className="label">Data do recebimento</span>
              <input className="input mono" id="gh-dia" type="date" max={hoje} value={dia} onChange={e => setDia(e.target.value)} /></label>
          </div>
          <label className="field"><span className="label">Observação (opcional)</span>
            <input className="input" id="gh-obs" maxLength={140} placeholder="Ex.: recebimentos antes do sistema" value={obs}
              onChange={e => setObs(e.target.value)} onKeyDown={e => { if (e.key === "Enter") void lancar(); }} /></label>
          {dia > hoje && <span className="hint" style={{ color: "var(--danger)" }}>A data não pode ser no futuro.</span>}
          <div className="row" style={{ justifyContent: "flex-end" }}>
            <button className="key" onClick={onClose}>Cancelar</button>
            <button className="key accent" onClick={lancar} aria-disabled={!ok || busy || undefined}>Lançar {v > 0 ? brl(v) : "entrada"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
