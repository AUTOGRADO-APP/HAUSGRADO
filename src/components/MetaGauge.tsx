"use client";
// Medidor das metas de faturamento (Gestão e Financeiro > Metas): arco contínuo de 240° com ponta luminosa.
// O arco acende da esquerda (R$ 0) para a direita conforme o faturamento; META e SUPER ficam em etiquetas no arco
// e a linha pontilhada interna mostra a projeção do mês (só no mês corrente).
import { useEffect, useId, useState } from "react";
import { brl } from "@/lib/rules.ts";
import { brlK } from "@/lib/fin-a.ts";
import { escalaMax, fracao, type Nivel } from "@/lib/metas.ts";

const W = 340, H = 256, CX = 170, CY = 170, R = 118, SW = 18;
const A0 = Math.PI * 5 / 6, SPAN = Math.PI * 4 / 3; // começa embaixo à esquerda e gira 240° no sentido horário

/** Ponto do arco para a fração f (0 = início, 1 = fim), no raio r. */
const pt = (f: number, r = R) => {
  const a = A0 + SPAN * f;
  // arredondado: servidor e navegador geram o mesmo texto (evita aviso de hidratação)
  return [Math.round((CX + r * Math.cos(a)) * 100) / 100, Math.round((CY + r * Math.sin(a)) * 100) / 100] as const;
};
const arco = (f0: number, f1: number, r = R) => {
  const [x0, y0] = pt(f0, r), [x1, y1] = pt(f1, r);
  return `M${x0} ${y0} A${r} ${r} 0 ${SPAN * (f1 - f0) > Math.PI ? 1 : 0} 1 ${x1} ${y1}`;
};
const curto = (v: number) => brlK(v).replace("R$ ", "");

const NIVEL: Record<Nivel, { l: string; cls: string }> = {
  abaixo: { l: "Rumo à meta", cls: "" },
  meta: { l: "Meta batida", cls: "ok" },
  super: { l: "Super meta batida", cls: "ok" },
};

export function MetaGauge({ fat, goal, superGoal, nivel, pctMeta, projecao, rotulo = "Recebido no mês" }: {
  fat: number; goal: number; superGoal: number; nivel: Nivel; pctMeta: number;
  /** faturamento projetado no ritmo atual; só passar no mês corrente */
  projecao?: number;
  rotulo?: string;
}) {
  const uid = useId().replace(/:/g, "");
  const max = escalaMax({ goal, super_goal: superGoal });
  const alvo = fracao(fat, max);
  const fG = fracao(goal, max), fS = fracao(superGoal, max);
  const fP = projecao && projecao > 0 ? fracao(projecao, max) : 0;
  // começa em zero e sobe até o valor, arco e número juntos (sem animação com prefers-reduced-motion)
  const [f, setF] = useState(0);
  const [v, setV] = useState(0);
  useEffect(() => {
    const reduz = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduz) { setF(alvo); setV(fat); return; }
    const t0 = performance.now(), dur = 1200;
    let id = 0;
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3);
      setF(alvo * e); setV(fat * e);
      if (p < 1) id = requestAnimationFrame(step);
    };
    id = requestAnimationFrame(step);
    return () => cancelAnimationFrame(id);
  }, [alvo, fat]);

  const temSuper = fS - fG > 0.001;
  const tag = (fr: number, fTag: number, txt: string, cls: string) => {
    const [x, y] = pt(fTag, R + 42), [dx, dy] = pt(fr, R);
    const w = Math.round(20 + txt.length * 6.6);
    return (
      <g className={`mg-tag ${cls}`}>
        <g transform={`translate(${x} ${y})`}>
          <rect x={-w / 2} y={-12} width={w} height={24} rx={12} />
          <text y={4.5} textAnchor="middle">{txt}</text>
        </g>
        <circle cx={dx} cy={dy} r={3.5} />
      </g>
    );
  };
  const [hx, hy] = pt(f);
  const st = NIVEL[nivel];
  const label = `Faturamento ${brl(fat)}: ${pctMeta}% da meta de ${brl(goal)}; super meta ${brl(superGoal)}`
    + (fP ? `; projeção do mês ${brl(projecao!)}` : "");

  return (
    <div className="mg" role="img" aria-label={label}>
      <svg viewBox={`-16 0 ${W + 32} ${H}`} className="mg-svg" aria-hidden="true">
        <defs>
          <linearGradient id={`mg-g${uid}`} x1="0" y1="1" x2="1" y2="0">
            <stop offset="0" stopColor="#FFB27A" />
            <stop offset="1" stopColor="var(--accent)" />
          </linearGradient>
          <filter id={`mg-h${uid}`} x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="6" /></filter>
        </defs>
        <path d={arco(0, 1)} className="mg-track" strokeWidth={SW} />
        {/* faixas: entre META e SUPER, e depois da SUPER */}
        {temSuper && <path d={arco(fG, fS)} className="mg-zone" strokeWidth={SW} />}
        <path d={arco(fS, 1)} className="mg-zone sup" strokeWidth={SW} />
        {fP > 0.002 && <path d={arco(0, fP, R - 14)} className="mg-proj" />}
        {f > 0.002 && <path d={arco(0, f)} className="mg-fill" strokeWidth={SW} stroke={`url(#mg-g${uid})`} />}
        {Array.from({ length: 41 }, (_, i) => {
          const [x0, y0] = pt(i / 40, R - 22), [x1, y1] = pt(i / 40, R - (i % 5 ? 26 : 30));
          return <line key={i} x1={x0} y1={y0} x2={x1} y2={y1} className={`mg-tick${i % 5 ? "" : " mj"}`} />;
        })}
        <circle cx={hx} cy={hy} r={14} className="mg-glow" filter={`url(#mg-h${uid})`} />
        <circle cx={hx} cy={hy} r={7} className="mg-head" />
        {/* etiquetas afastadas quando META e SUPER ficam muito perto */}
        {tag(fG, temSuper ? Math.min(fG, fS - 0.07) : fG, `META ${curto(goal)}`, "")}
        {temSuper && tag(fS, fS, `SUPER ${curto(superGoal)}`, "sup")}
        <text x={CX} y={CY - 24} textAnchor="middle" className="mg-lab">{rotulo}</text>
        <text x={CX} y={CY + 8} textAnchor="middle" className="mg-val">{brl(v)}</text>
        <g transform={`translate(${CX} ${CY + 40})`}>
          <rect x={-64} y={-15} width={128} height={30} rx={15} className="mg-cap" />
          <text y={5} textAnchor="middle" className="mg-pct"><tspan className="mg-pct-n">{pctMeta}%</tspan> da meta</text>
        </g>
        {fP > 0 && <text x={CX} y={CY + 76} textAnchor="middle" className="mg-proj-l">┄ projeção do mês: {curto(projecao!)}</text>}
      </svg>
      <span className={`chip ${st.cls} mg-chip`}>{st.l}</span>
    </div>
  );
}
