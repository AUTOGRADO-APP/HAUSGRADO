"use client";
// Paginação da pasta do cliente: mede cada bloco numa folha A4 escondida e encaixa
// Avarias, Peças e Serviço em sequência, sem pular folha entre as seções (pedido de 2026-10-20).
// Um título de seção nunca fica sozinho no pé da folha; quando a seção continua, repete o título.
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

export interface PastaSec { title: string; rows: ReactNode[] }
type Bloco = { s: number; i: number; head?: string };

export function PastaDoc({ oficina, number, plate, emit, page1, secs }: {
  oficina: string; number: number; plate: string; emit: string; page1: ReactNode; secs: PastaSec[];
}) {
  const mref = useRef<HTMLDivElement>(null);
  const [pages, setPages] = useState<Bloco[][] | null>(null);

  useLayoutEffect(() => {
    const medir = () => {
      const m = mref.current; if (!m) return;
      const h = (sel: string) => (m.querySelector(sel) as HTMLElement | null)?.getBoundingClientRect().height ?? 0;
      const H = (m.querySelector(".bd") as HTMLElement).clientHeight;
      const pad = parseFloat(getComputedStyle(m.querySelector(".u-row") ?? m).paddingBottom) || 0;
      const head = h(".u-head");
      // folga de ~4 mm: na impressão o texto pode sair um pouco mais alto que na tela
      const folga = 4 * (m.querySelector(".pg") as HTMLElement).getBoundingClientRect().width / 210;
      const out: Bloco[][] = [[]];
      let used = h(".u-p1");
      secs.forEach((sec, s) => sec.rows.forEach((_, i) => {
        const r = h(`[data-r="${s}-${i}"]`);
        const first = i === 0;
        // cabe o título (se for o começo da seção) + a linha? A folga do último bloco não conta.
        if (used > 0 && used + (first ? head : 0) + r - pad > H - folga) { out.push([]); used = 0; }
        const novaFolha = used === 0;
        const titulo = first ? sec.title : novaFolha ? `${sec.title} (continuação)` : undefined;
        out[out.length - 1].push({ s, i, head: titulo });
        used += (titulo ? head : 0) + r;
      }));
      setPages(out);
    };
    medir();
    document.fonts?.ready.then(medir).catch(() => {});
  }, [secs]);

  const N = pages?.length ?? 1;
  const Folha = ({ n, title, children, cls }: { n: number; title: string; children: ReactNode; cls?: string }) => (
    <article className={`pg ${cls ?? ""}`} aria-label={`Página ${n} de ${N}`}>
      <header className="hd">
        <div><h1>{title}</h1><p>{oficina} · OS {number} · emitida em {emit}</p></div>
        <span className="via">VIA DO CLIENTE</span>
      </header>
      <div className="bd">{children}</div>
      <footer className="ft"><span>{oficina} · OS {number} · {plate}</span><span>Página {n} de {N}</span></footer>
    </article>
  );

  return (
    <>
      <div className="doc-a4 pasta-medida" aria-hidden="true" ref={mref}>
        <Folha n={1} title="Pasta do cliente" cls="fix">
          <div className="u-p1">{page1}</div>
          <div className="u-head"><h3 className="sec">Seção</h3></div>
          {secs.map((sec, s) => sec.rows.map((row, i) => <div className="u-row" key={`${s}-${i}`} data-r={`${s}-${i}`}>{row}</div>))}
        </Folha>
      </div>
      <div className="doc-a4">
        {(pages ?? [[]]).map((blocos, ix) => (
          <Folha key={ix} n={ix + 1} title="Pasta do cliente">
            {ix === 0 && <div className="u-p1">{page1}</div>}
            {blocos.map(b => (
              <div key={`${b.s}-${b.i}`}>
                {b.head && <div className="u-head"><h3 className="sec">{b.head}</h3></div>}
                <div className="u-row">{secs[b.s].rows[b.i]}</div>
              </div>
            ))}
          </Folha>
        ))}
      </div>
    </>
  );
}
