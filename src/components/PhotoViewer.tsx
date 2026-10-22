"use client";
// Foto ampliada (O.S.): tela cheia escura, com trocar, excluir (com confirmação) e abrir o original.
import { useEffect, useState } from "react";

export function PhotoViewer({ src, title, sub, video, confirmDelete, onClose, onReplace, onDelete }: {
  src: string; title: string; sub?: string; video?: boolean;
  /** abre já pedindo a confirmação da exclusão (X da miniatura) */
  confirmDelete?: boolean;
  onClose: () => void; onReplace?: (f: File) => void; onDelete?: () => void;
}) {
  const [conf, setConf] = useState(!!confirmDelete);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") { if (conf && !confirmDelete) setConf(false); else onClose(); } };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, [conf, confirmDelete, onClose]);
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  return (
    <div className="modal-bg viewer" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="viewer-box" role="dialog" aria-modal="true" aria-label={title}>
        <div className="viewer-top">
          <div style={{ minWidth: 0 }}><b>{title}</b>{sub && <span className="mono">{sub}</span>}</div>
          <button type="button" className="viewer-x" onClick={onClose} aria-label="Fechar" autoFocus>×</button>
        </div>
        <div className="viewer-img" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
          {video ? <video src={src} controls playsInline autoPlay /> : <img src={src} alt={title} />}
        </div>
        <div className="viewer-bar">
          {conf ? (
            <>
              <span className="viewer-ask">Excluir {video ? "este vídeo" : "esta foto"}? Não dá para desfazer.</span>
              <button type="button" className="key danger" onClick={() => { onDelete?.(); onClose(); }}>Sim, excluir</button>
              <button type="button" className="key" onClick={() => confirmDelete ? onClose() : setConf(false)}>Cancelar</button>
            </>
          ) : (
            <>
              {onReplace && (
                <label className="key">Trocar foto
                  <input type="file" accept="image/*" capture="environment" hidden
                    onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; if (f) { onReplace(f); onClose(); } }} />
                </label>
              )}
              <a className="key" href={src} target="_blank" rel="noopener noreferrer">Abrir original</a>
              {onDelete && <button type="button" className="key danger" onClick={() => setConf(true)}>Excluir</button>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
