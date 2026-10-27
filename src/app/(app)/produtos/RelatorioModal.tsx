"use client";
// Pop-up dos relatórios do estoque: escolhe o relatório (e a categoria ou o período) e abre a página A4 para imprimir ou salvar em PDF.
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CATS } from "@/lib/labels.ts";
import { PERIODOS_REL, TIPOS_REL, periodoRel, type TipoRel } from "@/lib/relatorios.ts";
import { sfx, toast } from "@/lib/ui.ts";

export function RelatorioModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [tipo, setTipo] = useState<TipoRel>("todos");
  const [cat, setCat] = useState("");
  const [per, setPer] = useState("90");
  const ini = periodoRel("90");
  const [de, setDe] = useState(ini.de);
  const [ate, setAte] = useState(ini.ate);
  const [contagem, setContagem] = useState(false);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  const info = TIPOS_REL.find(t => t.k === tipo)!;

  function gerar() {
    if (info.vendas && per === "livre" && (!de || !ate)) return toast("Informe as datas De e Até");
    const q = new URLSearchParams({ tipo });
    if (tipo === "categoria" && cat) q.set("cat", cat);
    if ((tipo === "todos" || tipo === "categoria") && contagem) q.set("contagem", "1");
    if (info.vendas) { q.set("p", per); if (per === "livre") { q.set("de", de); q.set("ate", ate); } }
    sfx("tap");
    router.push(`/produtos/relatorio?${q}`);
  }

  return (
    <div className="modal-bg" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal rel-modal" role="dialog" aria-modal="true" aria-labelledby="rl-t">
        <div className="ph">
          <h2 id="rl-t" style={{ fontSize: "14pt" }}>Relatórios do estoque</h2>
          <button className="del" onClick={onClose} aria-label="Fechar">×</button>
        </div>
        <div className="rel-body">
          <p className="hint" style={{ margin: "0 0 10px" }}>Escolha o relatório. Ele abre pronto para imprimir ou salvar em PDF.</p>
          <div className="rel-opts" role="radiogroup" aria-label="Tipo de relatório">
            {TIPOS_REL.map((t, i) => {
              return (
                <label key={t.k} className={`rel-opt ${tipo === t.k ? "on" : ""}`}>
                  <input type="radio" name="rel-tipo" id={`rl-${t.k}`} value={t.k} checked={tipo === t.k} onChange={() => setTipo(t.k)} />
                  <span className="rel-n mono">{String(i + 1).padStart(2, "0")}</span>
                  <span className="rel-tx"><b>{t.l}</b><span className="hint">{t.d}</span></span>
                </label>
              );
            })}
          </div>

          {tipo === "categoria" && (
            <label className="field" style={{ marginTop: 12 }}><span className="label">Categoria</span>
              <select className="input" id="rl-cat" value={cat} onChange={e => setCat(e.target.value)}>
                <option value="">Todas, uma depois da outra</option>{CATS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select></label>
          )}
          {(tipo === "todos" || tipo === "categoria") && (
            <label className={`opt ${contagem ? "on" : ""}`} style={{ marginTop: 12 }}>
              <input type="checkbox" id="rl-contagem" checked={contagem} onChange={e => setContagem(e.target.checked)} />
              <span>Folha de contagem: trocar o preço por uma coluna em branco para anotar</span>
            </label>
          )}
          {info.vendas && (
            <div className="field" style={{ marginTop: 12 }}><span className="label">Período das vendas (O.S. finalizadas)</span>
              <div className="row" style={{ gap: 6 }}>
                {PERIODOS_REL.map(([k, l]) => <button key={k} type="button" className={`key sm ${per === k ? "on" : ""}`} onClick={() => setPer(k)}>{l}</button>)}
              </div>
              {per === "livre" && (
                <div className="grid2" style={{ marginTop: 8 }}>
                  <label className="field"><span className="label">De</span><input className="input mono" type="date" id="rl-de" value={de} onChange={e => setDe(e.target.value)} /></label>
                  <label className="field"><span className="label">Até</span><input className="input mono" type="date" id="rl-ate" value={ate} onChange={e => setAte(e.target.value)} /></label>
                </div>
              )}
            </div>
          )}
        </div>
        <div className="row rel-foot">
          <button className="key" onClick={onClose}>Cancelar</button>
          <button className="key accent" id="rl-gerar" onClick={gerar}>Gerar PDF</button>
        </div>
      </div>
    </div>
  );
}
