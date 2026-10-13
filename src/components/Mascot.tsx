"use client";
import { useEffect, useRef, useState } from "react";
import { FALAS, sprite } from "@/lib/sprite.ts";
import { sfx } from "@/lib/ui.ts";

/** Imagem do mascote (pisca a cada ~4s; parado com prefers-reduced-motion). */
export function MascotImg({ pose, w = 80 }: { pose: string; w?: number }) {
  const [src, setSrc] = useState<string>("");
  useEffect(() => {
    setSrc(sprite(pose));
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const iv = setInterval(() => { setSrc(sprite(pose, true)); setTimeout(() => setSrc(sprite(pose)), 150); }, 3800);
    return () => clearInterval(iv);
  }, [pose]);
  const h = Math.round(w * .8);
  // eslint-disable-next-line @next/next/no-img-element
  return src ? <img className="mascot-img" data-pose={pose} src={src} width={w} height={h} style={{ width: w, height: h }} alt="" />
    : <span style={{ display: "inline-block", width: w, height: h }} />;
}

/** Botão do mascote: ao clicar mostra um balão com uma frase da página e late. */
export function MascotButton({ pose }: { pose: string }) {
  const [fala, setFala] = useState<string | null>(null);
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  const l = FALAS[pose] || FALAS.acena;
  return (
    <button className="mascot" aria-label="Mascote Hausgrado" title={l[0]}
      onClick={() => { setFala(l[Math.floor(Math.random() * l.length)]); sfx("au"); if (t.current) clearTimeout(t.current); t.current = setTimeout(() => setFala(null), 3200); }}>
      <MascotImg pose={pose} />
      {fala && <span className="bubble">{fala}</span>}
    </button>
  );
}
