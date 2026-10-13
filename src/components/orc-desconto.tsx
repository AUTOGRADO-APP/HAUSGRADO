"use client";
// Pop-up do desconto protegido do orçamento (seção 7.9): senha conferida no servidor, depois libera o valor.
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client.ts";
import { brl } from "@/lib/rules.ts";
import { numBR, parseNum } from "@/lib/labels.ts";
import { errMsg, sfx, toast } from "@/lib/ui.ts";
import { IKEY } from "./icons.tsx";

export function DiscountModal({ number, subtotal, current, hasPassword, onClose, onApply }: {
  number: number; subtotal: number; current: number; hasPassword: boolean;
  onClose: () => void;
  /** grava o desconto (apply_quote_discount); devolve true se deu certo */
  onApply: (amount: number, password: string) => Promise<boolean>;
}) {
  const [senha, setSenha] = useState("");
  const [auth, setAuth] = useState(false);
  const [busy, setBusy] = useState(false);
  const [valor, setValor] = useState(numBR(current));
  const senhaRef = useRef<HTMLInputElement>(null);
  const valRef = useRef<HTMLInputElement>(null);
  useEffect(() => { (auth ? valRef : senhaRef).current?.focus(); }, [auth]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, [onClose]);

  async function conferir() {
    if (!senha || busy) return;
    setBusy(true);
    const { data, error } = await createClient().rpc("verify_discount_password", { p_password: senha });
    setBusy(false);
    if (error) return toast(errMsg(error), { err: true });
    if (data === true) { setAuth(true); sfx("ok"); }
    else toast("Senha de autorização incorreta", { err: true });
  }

  async function aplicar() {
    const v = Math.max(0, parseNum(valor));
    if (v > subtotal) return toast("Não foi possível aplicar: o desconto é maior que o subtotal.", { err: true });
    setBusy(true);
    const ok = await onApply(v, senha);
    setBusy(false);
    if (ok) toast(v ? `Desconto de ${brl(v)} aplicado` : "Desconto removido", { sound: "ok" });
  }

  return (
    <div className="modal-bg" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal pag" role="dialog" aria-modal="true" aria-labelledby="od-t">
        <div className="ph">
          <h2 id="od-t" style={{ fontSize: "14pt" }}>Desconto no orçamento nº {number}</h2>
          <button className="del" onClick={onClose} aria-label="Fechar">×</button>
        </div>
        <div className="pag-total"><span className="label">Subtotal dos itens</span><strong className="mono">{brl(subtotal)}</strong></div>
        {auth ? (
          <div className="stack" style={{ marginTop: 14 }}>
            <span className="chip ok" style={{ justifySelf: "start" }}>Autorizado</span>
            <label className="field"><span className="label">Valor do desconto (R$)</span>
              <input ref={valRef} className="input mono" id="od-val" inputMode="decimal" value={valor} placeholder="0,00"
                onChange={e => setValor(e.target.value)} onKeyDown={e => { if (e.key === "Enter") void aplicar(); }} />
            </label>
            <div className="row" style={{ justifyContent: "flex-end" }}>
              <button className="key" onClick={onClose}>Cancelar</button>
              <button className="key accent" onClick={aplicar} aria-disabled={busy || undefined}>Aplicar desconto</button>
            </div>
          </div>
        ) : (
          <div className="pag-auth" style={{ marginTop: 14 }}>
            <div className="row" style={{ gap: 8, alignItems: "flex-start" }}>
              <span className="auth-ic">{IKEY}</span>
              <div style={{ flex: 1 }}><b>Senha de autorização</b><div className="hint">Desconto só com a senha criada pelo usuário master.</div></div>
            </div>
            {hasPassword ? (
              <div className="row" style={{ flexWrap: "nowrap" }}>
                <input ref={senhaRef} className="input" id="od-senha" type="password" autoComplete="off" placeholder="Digite a senha" value={senha}
                  onChange={e => setSenha(e.target.value)} onKeyDown={e => { if (e.key === "Enter") void conferir(); }} style={{ flex: 1 }} />
                <button className="key accent" onClick={conferir} aria-disabled={!senha || busy || undefined}>Conferir</button>
              </div>
            ) : (
              <span className="hint" style={{ color: "var(--danger)" }}>Nenhuma senha foi criada. Peça ao master para criar em Configurações.</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
