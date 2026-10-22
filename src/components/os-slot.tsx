"use client";
// Quadro de foto de entrada (frontal, laterais...). Mesmo visual do protótipo (`slot`).
// Com `onView`, a foto já tirada abre ampliada (em vez de abrir a câmera/galeria para trocar).
import { ICAM_BIG } from "./icons.tsx";

export function PhotoSlot({ label, url, onFile, onRemove, onView }: {
  label: string; url?: string | null; onFile?: (f: File) => void; onRemove?: () => void; onView?: () => void;
}) {
  const ro = !onFile;
  const del = url && !ro && onRemove && (
    <button type="button" className="del x" aria-label={`Excluir foto ${label}`} title="Excluir foto"
      onClick={e => { e.preventDefault(); e.stopPropagation(); onRemove(); }}>×</button>
  );
  if (url && onView) return (
    <div className="slot has">
      <button type="button" className="view" aria-label={`Ampliar foto ${label}`} onClick={onView}><img src={url} alt={label} /></button>
      <span className="cap">{label}</span>
      {del}
    </div>
  );
  return (
    <label className={`slot ${url ? "has" : ""}`}>
      {url ? <img src={url} alt={label} /> : <>{ICAM_BIG}<span className="label">{label}</span></>}
      {url && <span className="cap">{label}</span>}
      {!ro && (
        <input type="file" accept="image/*" capture="environment" aria-label={`Foto ${label}`}
          onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; if (f) onFile!(f); }} />
      )}
      {del}
    </label>
  );
}
