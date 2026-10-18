"use client";
// Medidor semicircular das metas de faturamento (Gestão e Financeiro > Metas).
// O ponteiro sobe da esquerda (R$ 0) para a direita conforme o faturamento; as marcas META e SUPER META ficam no arco.
import { useEffect, useState } from "react";
import { brl } from "@/lib/rules.ts";
import { brlK } from "@/lib/fin-a.ts";
import { escalaMax, fracao, type Nivel } from "@/lib/metas.ts";

const W = 340, CX = 170, CY = 178, R = 136, SW = 20;

/** Ponto do arco para a fração f (0 = esquerda, 1 = direita), no raio r. */
const pt = (f: number, r = R) => {
  const a = Math.PI * (1 - f);
  return [CX + r * Math.cos(a), CY - r * Math.sin(a)] as const;
};
const arco = (f0: number, f1: number, r = R) => {
  const [x0, y0] = pt(f0, r), [x1, y1] = pt(f1, r);
  return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${r} ${r} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
};

const NIVEL: Record<Nivel, { l: string; cls: string }> = {
  abaixo: { l: "Rumo à meta", cls: "" },
  meta: { l: "Meta batida", cls: "ok" },
  super: { l: "Super meta batida", cls: "ok" },
};

export function MetaGauge({ fat, goal, superGoal, nivel, pctMeta }: { fat: number; goal: number; superGoal: number; nivel: Nivel; pctMeta: number }) {
  const max = escalaMax({ goal, super_goal: superGoal });
  const alvo = fracao(fat, max);
  const fG = fracao(goal, max), fS = fracao(superGoal, max);
  // começa em zero e sobe até o valor (sem animação com prefers-reduced-motion)
  const [f, setF] = useState(0);
  const [v, setV] = useState(0);
  useEffect(() => {
    const reduz = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduz) { setF(alvo); setV(fat); return; }
    const raf = requestAnimationFrame(() => setF(alvo));
    const t0 = performance.now(), dur = 1200;
    let id = 0;
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3);
      setV(fat * e);
      if (p < 1) id = requestAnimationFrame(step);
    };
    id = requestAnimationFrame(step);
    return () => { cancelAnimationFrame(raf); cancelAnimationFrame(id); };
  }, [alvo, fat]);

  const ticks = Array.from({ length: 21 }, (_, i) => i / 20);
  const marca = (fr: number, rot: string, valor: number, cls: string) => {
    const [x0, y0] = pt(fr, R - SW / 2 - 4), [x1, y1] = pt(fr, R + SW / 2 + 6);
    const [tx, ty] = pt(fr, R + SW / 2 + 22);
    const anchor = fr < 0.4 ? "end" : fr > 0.6 ? "start" : "middle";
    return (
      <g className={`mg-mark ${cls}`}>
        <line x1={x0} y1={y0} x2={x1} y2={y1} />
        <text x={tx} y={ty - 6} textAnchor={anchor} className="mg-mk-l">{rot}</text>
        <text x={tx} y={ty + 7} textAnchor={anchor} className="mg-mk-v">{brlK(valor)}</text>
      </g>
    );
  };
  const st = NIVEL[nivel];
  const label = `Faturamento ${brl(fat)}: ${pctMeta}% da meta de ${brl(goal)}; super meta ${brl(superGoal)}`;

  return (
    <div className="mg" role="img" aria-label={label}>
      <svg viewBox={`-30 0 ${W + 60} ${CY + 14}`} className="mg-svg" aria-hidden="true">
        <defs>
          <linearGradient id="mg-grad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="var(--accent)" stopOpacity=".35" />
            <stop offset="1" stopColor="var(--accent)" stopOpacity="1" />
          </linearGradient>
        </defs>
        <path d={arco(0, 1)} className="mg-track" strokeWidth={SW} />
        {/* faixa entre META e SUPER META e depois dela */}
        <path d={arco(fG, fS, R + SW / 2 + 3)} className="mg-zone" />
        <path d={arco(fS, 1, R + SW / 2 + 3)} className="mg-zone sup" />
        {f > 0.002 && <path d={arco(0, 1)} className="mg-fill" strokeWidth={SW} pathLength={100} style={{ strokeDasharray: `${f * 100} 100` }} stroke="url(#mg-grad)" />}
        {ticks.map(t => {
          const [x0, y0] = pt(t, R - SW / 2 - 6), [x1, y1] = pt(t, R - SW / 2 - (Math.round(t * 20) % 5 === 0 ? 16 : 11));
          return <line key={t} x1={x0} y1={y0} x2={x1} y2={y1} className="mg-tick" />;
        })}
        {marca(fG, "META", goal, "")}
        {fS - fG > 0.001 && marca(fS, "SUPER META", superGoal, "sup")}
        <g transform={`translate(${CX} ${CY})`}>
          <g className="mg-needle" style={{ transform: `rotate(${f * 180}deg)` }}>
            <path d={`M${-(R - SW - 10)} 0 L0 -6 L16 0 L0 6 Z`} />
          </g>
        </g>
        <circle cx={CX} cy={CY} r={13} className="mg-hub" />
        <circle cx={CX} cy={CY} r={5} className="mg-hub-in" />
      </svg>
      <div className="mg-c">
        <strong className="mono">{brl(v)}</strong>
        <span className="mg-pct"><b className="mono">{pctMeta}%</b> da meta</span>
        <span className={`chip ${st.cls}`}>{st.l}</span>
      </div>
    </div>
  );
}
