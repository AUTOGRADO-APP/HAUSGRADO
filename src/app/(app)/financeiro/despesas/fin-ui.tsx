"use client";
// Peças de interface compartilhadas por Compras, Despesas e Fornecedores (keyField e perBar do protótipo).
import { IKEY } from "@/components/icons.tsx";
import { copyText } from "@/lib/ui.ts";
import { FPER } from "@/lib/labels.ts";

export function KeyField({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="field"><span className="label">{label}</span>
      <span className="keyf">{IKEY}
        <input className="input mono" id={id} value={value} onChange={e => onChange(e.target.value)} placeholder="Cole o código do boleto ou a chave pix" autoComplete="off" />
        {value && <button type="button" className="key sm" onClick={() => copyText(value)}>Copiar</button>}
      </span>
    </label>
  );
}

export function KeyLine({ code, max = 28, sm = true }: { code: string; max?: number; sm?: boolean }) {
  return (
    <div className={`keyline${sm ? " sm" : ""}`}>{IKEY}<span className="mono">{code.length > max ? code.slice(0, max) + "…" : code}</span>
      <button type="button" className="key sm" onClick={e => { e.stopPropagation(); copyText(code); }}>Copiar</button></div>
  );
}

export function PerBar({ per, onPick }: { per: string; onPick: (k: string) => void }) {
  return (
    <div className="row" style={{ marginBottom: 14 }}>
      {FPER.map(([k, l]) => <button key={k} type="button" className={`key sm ${per === k ? "on" : ""}`} onClick={() => onPick(k)}>{l}</button>)}
    </div>
  );
}
