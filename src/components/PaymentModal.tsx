"use client";
// Pop-up "Receber e finalizar O.S." (seção 7.15). A conferência final é do banco (register_receipt).
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client.ts";
import { brl, feePct, round2, type PayMethod, type ShopFees } from "@/lib/rules.ts";
import { FORMAS, FORMAN, parseNum } from "@/lib/labels.ts";
import { errMsg, sfx, toast } from "@/lib/ui.ts";
import { Plate } from "./Plate.tsx";
import { IKEY } from "./icons.tsx";

export interface PayOS { id: string; number: number; plate: string; make: string | null; model: string | null; customer_name: string; total: number; status: string }

export function PaymentModal({ os, fees, hasPassword, onClose, onDone }: {
  os: PayOS; fees: ShopFees; hasPassword: boolean; onClose: () => void; onDone: (prevStatus: string) => void;
}) {
  const sb = createClient();
  const total = round2(Number(os.total) || 0);
  const [sel, setSel] = useState<PayMethod[]>([]);
  const [val, setVal] = useState<Record<string, string>>({});
  const [parc, setParc] = useState(1);
  const [senha, setSenha] = useState("");
  const [auth, setAuth] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, [onClose]);

  const soma = round2(sel.reduce((a, k) => a + parseNum(val[k]), 0));
  const d = round2(soma - total);
  const rs = total <= 0 ? { txt: "Esta O.S. não tem valor a receber", cls: "up", ok: true, falta: 0 }
    : !sel.length ? { txt: "Escolha a forma de pagamento", cls: "", ok: false, falta: total }
    : soma <= 0 ? { txt: "Informe o valor recebido", cls: "down", ok: false, falta: total }
    : d === 0 ? { txt: "Valor confere com o total da O.S.", cls: "up", ok: true, falta: 0 }
    : d > 0 ? { txt: sel.includes("dinheiro") ? `Troco de ${brl(d)}` : `Recebendo ${brl(d)} a mais que o total`, cls: "", ok: true, falta: 0 }
    : auth ? { txt: `Desconto de ${brl(-d)} autorizado`, cls: "up", ok: true, falta: -d }
    : { txt: `Faltam ${brl(-d)}. Para dar desconto, informe a senha de autorização.`, cls: "down", ok: false, falta: -d };

  function toggle(k: PayMethod, on: boolean) {
    if (on) {
      const falta = round2(total - sel.reduce((a, x) => a + parseNum(val[x]), 0));
      setSel(s => [...s, k]);
      if (falta > 0) setVal(v => ({ ...v, [k]: String(falta).replace(".", ",") }));
    } else { setSel(s => s.filter(x => x !== k)); setVal(v => ({ ...v, [k]: "" })); }
    sfx("tap");
  }

  // Confere só quando a pessoa pede (botão ou Enter): cada conferência conta no limite de 5 erros em 15 min.
  async function conferir() {
    if (!senha || busy || auth) return;
    setBusy(true);
    const { data, error } = await sb.rpc("verify_discount_password", { p_password: senha });
    setBusy(false);
    if (error) return toast(errMsg(error), { err: true });
    if (data === true) { setAuth(true); sfx("ok"); }
    else toast("Senha de autorização incorreta", { err: true });
  }

  async function confirm() {
    if (!rs.ok) return toast(rs.txt, { err: true });
    setBusy(true);
    const payments = sel.map(k => ({ method: k, amount: round2(parseNum(val[k])), installments: k === "credito" ? parc : 1 })).filter(p => p.amount > 0);
    const { error } = await sb.rpc("register_receipt", { p_os: os.id, p_payments: payments, p_password: rs.falta > 0 ? senha : null });
    setBusy(false);
    if (error) return toast(errMsg(error), { err: true });
    sfx("ok");
    onDone(os.status);
  }

  return (
    <div className="modal-bg" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal pag" role="dialog" aria-modal="true" aria-labelledby="pg-t">
        <div className="ph"><h2 id="pg-t" style={{ fontSize: "14pt" }}>Receber e finalizar O.S. {os.number}</h2><button className="del" onClick={onClose} aria-label="Cancelar">×</button></div>
        <div style={{ overflow: "auto" }}>
          <div className="row" style={{ gap: 12, marginBottom: 14 }}><Plate p={os.plate} /><div><b>{os.make} {os.model}</b><div className="hint">{os.customer_name}</div></div></div>
          <div className="pag-total"><span className="label">Total da O.S.</span><strong className="mono">{brl(total)}</strong></div>
          <div className="label" style={{ margin: "14px 0 6px" }}>Forma de pagamento · marque uma ou mais</div>
          <div className="opt-grid">{FORMAS.map(([k, l]) => (
            <label key={k} className={`opt ${sel.includes(k as PayMethod) ? "on" : ""}`}><input type="checkbox" checked={sel.includes(k as PayMethod)} onChange={e => toggle(k as PayMethod, e.target.checked)} /><span>{l}</span></label>
          ))}</div>
          <div className="stack" style={{ gap: 10, marginTop: 14 }}>{sel.map(k => {
            const tx = feePct({ method: k, amount: 0, installments: parc }, fees);
            return (
              <div className="pag-row" key={k}><span><b>{FORMAN[k]}</b></span>
                {k === "credito" ? <select className="input" style={{ width: 110 }} value={parc} onChange={e => setParc(Number(e.target.value))}>{Array.from({ length: 12 }, (_, i) => <option key={i} value={i + 1}>{i + 1}x</option>)}</select> : <span />}
                {k !== "dinheiro" && tx ? <span className="hint pag-tx" style={{ gridColumn: "1/-1" }}>Taxa {String(tx).replace(".", ",")}%</span> : null}
                <label className="pag-val"><span className="mono">R$</span><input className="input" inputMode="decimal" value={val[k] ?? ""} placeholder="0,00" onChange={e => setVal(v => ({ ...v, [k]: e.target.value }))} /></label>
              </div>
            );
          })}</div>
          {total > 0 ? <>
            <div className="pag-sum"><div><span className="label">Recebido</span><b className="mono">{brl(soma)}</b></div><span className={`dl ${rs.cls}`}>{rs.txt}</span></div>
            {rs.falta > 0 && soma > 0 && <div className="pag-auth">
              <div className="row" style={{ gap: 8, alignItems: "flex-start" }}><span className="auth-ic">{IKEY}</span><div style={{ flex: 1, minWidth: 0 }}><b>Desconto exige autorização</b><div className="hint">A O.S. só pode ser finalizada com o valor total. Para receber menos, digite a senha de autorização criada pelo master.</div></div></div>
              {hasPassword ? <>
                <div className="row" style={{ flexWrap: "nowrap" }}>
                  <input className="input" type="password" autoComplete="off" placeholder="Senha de autorização" value={senha} disabled={auth}
                    onChange={e => setSenha(e.target.value)} onKeyDown={e => { if (e.key === "Enter") void conferir(); }} style={{ flex: 1 }} />
                  {auth ? <span className="chip ok">Autorizado</span>
                    : <button type="button" className="key accent" onClick={() => void conferir()} aria-disabled={!senha || busy || undefined}>Conferir</button>}
                </div>
              </> : <span className="hint" style={{ color: "var(--danger)" }}>Nenhuma senha de autorização foi criada. Peça ao usuário master para criar em Configurações.</span>}
            </div>}
          </> : <div className="pag-sum"><span className="dl up">{rs.txt}</span><span className="hint">Ex.: garantia sem cobrança</span></div>}
        </div>
        <div className="row" style={{ justifyContent: "flex-end", marginTop: 16 }}>
          <button className="key" onClick={onClose}>Cancelar</button>
          <button className="key accent" onClick={confirm} aria-disabled={!rs.ok || busy}>{busy ? "Registrando…" : total > 0 ? "Receber e finalizar" : "Finalizar sem cobrança"}</button>
        </div>
      </div>
    </div>
  );
}
