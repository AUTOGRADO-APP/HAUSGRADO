"use client";
// Pop-up do Balanço: pede a senha de autorização (a mesma do desconto) e libera o ajuste de estoque por 60 minutos.
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client.ts";
import { setBalanco } from "@/lib/balanco.ts";
import { errMsg, sfx, toast } from "@/lib/ui.ts";
import { IKEY } from "@/components/icons.tsx";

export function BalancoModal({ hasPassword, onClose }: { hasPassword: boolean; onClose: () => void }) {
  const [senha, setSenha] = useState("");
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, [onClose]);

  async function ativar() {
    if (!senha || busy) return;
    setBusy(true);
    const { data, error } = await createClient().rpc("start_stock_count", { p_password: senha });
    setBusy(false);
    if (error) return toast(errMsg(error), { err: true });
    if (!data) { setSenha(""); return toast("Senha de autorização incorreta", { err: true }); }
    setBalanco(data as string);
    sfx("ok");
    toast("Modo balanço ativo por 60 minutos");
    onClose();
  }

  return (
    <div className="modal-bg" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal pag" role="dialog" aria-modal="true" aria-labelledby="bl-t">
        <div className="ph">
          <h2 id="bl-t" style={{ fontSize: "14pt" }}>Balanço de estoque</h2>
          <button className="del" onClick={onClose} aria-label="Fechar">×</button>
        </div>
        <p className="hint" style={{ margin: "0 0 4px" }}>Libera a alteração do estoque dos produtos por 60 minutos, só para você. Cada contagem fica nas movimentações com seu nome.</p>
        <div className="pag-auth">
          <div className="row" style={{ gap: 8, alignItems: "flex-start" }}>
            <span className="auth-ic">{IKEY}</span>
            <div style={{ flex: 1 }}><b>Senha de autorização</b><div className="hint">A mesma senha do desconto, criada pelo usuário master.</div></div>
          </div>
          {hasPassword ? (
            <div className="row" style={{ flexWrap: "nowrap" }}>
              <input ref={ref} className="input" id="bl-senha" type="password" autoComplete="off" placeholder="Digite a senha" value={senha}
                onChange={e => setSenha(e.target.value)} onKeyDown={e => { if (e.key === "Enter") void ativar(); }} style={{ flex: 1 }} />
              <button className="key accent" id="bl-ativar" onClick={ativar} aria-disabled={!senha || busy || undefined}>Ativar balanço</button>
            </div>
          ) : (
            <span className="hint" style={{ color: "var(--danger)" }}>Nenhuma senha foi criada. Peça ao master para criar em Configurações.</span>
          )}
        </div>
      </div>
    </div>
  );
}
