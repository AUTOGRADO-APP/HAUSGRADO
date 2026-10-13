"use client";
// Quadro de foto de entrada (frontal, laterais...). Mesmo visual do protótipo (`slot`).
import { ICAM_BIG } from "./icons.tsx";

export function PhotoSlot({ label, url, onFile, onRemove }: {
  label: string; url?: string | null; onFile?: (f: File) => void; onRemove?: () => void;
}) {
  const ro = !onFile;
  return (
    <label className={`slot ${url ? "has" : ""}`}>
      {url ? <img src={url} alt={label} /> : <>{ICAM_BIG}<span className="label">{label}</span></>}
      {url && <span className="cap">{label}</span>}
      {!ro && (
        <input type="file" accept="image/*" capture="environment" aria-label={`Foto ${label}`}
          onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; if (f) onFile!(f); }} />
      )}
      {url && !ro && onRemove && (
        <button type="button" className="del x" aria-label="Remover foto" onClick={e => { e.preventDefault(); e.stopPropagation(); onRemove(); }}>×</button>
      )}
    </label>
  );
}
