"use client";
// Gráfico de linha do faturamento diário (lineChart/lcHover/fitChart do protótipo).
// Renderiza na largura real do container (ResizeObserver), sem escalar o SVG, para o texto manter o tamanho da interface.
import { useEffect, useRef, useState } from "react";
import { brl } from "@/lib/rules.ts";
import type { DiaSerie } from "@/lib/gestao.ts";

const brlK = (v: number) => (v >= 1000 ? `R$ ${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil` : `R$ ${Math.round(v)}`);
function niceMax(v: number) {
  if (v <= 0) return 1000;
  const p = Math.pow(10, Math.floor(Math.log10(v))); const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}
const WD = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const dOf = (k: string) => new Date(k + "T12:00:00Z");
const fd = (k: string) => dOf(k).toLocaleDateString("pt-BR", { timeZone: "UTC", weekday: "short", day: "2-digit", month: "2-digit" });

export function LineChart({ cur, prev }: { cur: DiaSerie[]; prev: DiaSerie[] }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [cw, setCw] = useState(0);
  const [hi, setHi] = useState<number | null>(null);

  useEffect(() => {
    const el = wrap.current; if (!el) return;
    const upd = () => { const w = Math.round(el.clientWidth); setCw(old => (w && Math.abs(w - old) > 4 ? w : old)); };
    upd();
    const ro = new ResizeObserver(upd); ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const W = Math.max(cw || 760, 560), H = 260, L = 64, Rr = 24, T = 18, B = 40, w = W - L - Rr, hh = H - T - B;
  const vmax = Math.max(1, ...cur.map(x => x.v), ...prev.map(x => x.v)) * 1.05;
  const step = niceMax(vmax / 4); const mx = step * Math.ceil(vmax / step);
  const X = (i: number) => L + i * (w / 6), Y = (v: number) => T + hh - (v / mx) * hh;
  const path = (a: DiaSerie[]) => a.map((p, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(p.v).toFixed(1)}`).join("");
  const ticks: number[] = []; for (let t = 0; t <= mx + 1e-6; t += step) ticks.push(t);
  const last = cur.length - 1;

  let tip: React.ReactNode = null, tipLeft = 0;
  if (hi !== null) {
    const c = cur[hi], p = prev[hi];
    const dlt = p.v ? Math.round((c.v - p.v) / p.v * 100) : null;
    const px = X(hi) - (wrap.current?.scrollLeft ?? 0);
    tipLeft = Math.min(Math.max(px - 90, 0), (wrap.current?.clientWidth ?? W) - 180);
    tip = <>
      <b>{fd(c.k)}</b>
      <span><i className="sw cur" />{brl(c.v)} <small>{c.n} O.S.</small></span>
      <span><i className="sw prev" />{brl(p.v)} <small>{fd(p.k)}</small></span>
      {dlt !== null && <em className={dlt >= 0 ? "up" : "down"}>{dlt >= 0 ? "▲" : "▼"} {Math.abs(dlt)}%</em>}
    </>;
  }

  return (
    <div className="lc" id="lc" ref={wrap} onMouseLeave={() => setHi(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label="Faturamento diário dos últimos 7 dias comparado aos 7 dias anteriores">
        <defs><linearGradient id="lcg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--accent)" stopOpacity=".22" /><stop offset="1" stopColor="var(--accent)" stopOpacity="0" /></linearGradient></defs>
        {ticks.map(t => <g key={t}>
          <line x1={L} x2={W - Rr} y1={Y(t)} y2={Y(t)} className="lc-grid" />
          <text x={L - 10} y={Y(t) + 4} className="lc-ax" textAnchor="end">{brlK(t)}</text>
        </g>)}
        {cur.map((p, i) => <text key={p.k} x={X(i)} y={H - 14} className={`lc-ax ${i === last ? "lc-today" : ""}`} textAnchor="middle">{i === last ? "Hoje" : WD[dOf(p.k).getUTCDay()]} {dOf(p.k).getUTCDate()}</text>)}
        <line x1={hi !== null ? X(hi) : 0} x2={hi !== null ? X(hi) : 0} y1={T} y2={T + hh} className="lc-cross" visibility={hi !== null ? "visible" : "hidden"} />
        <path d={path(prev)} className="lc-prev" />
        <path d={`${path(cur)}L${X(last)},${T + hh}L${X(0)},${T + hh}Z`} fill="url(#lcg)" />
        <path d={path(cur)} className="lc-cur" />
        {prev.map((p, i) => <circle key={p.k} cx={X(i)} cy={Y(p.v)} r={3} className="lc-dp" />)}
        {cur.map((p, i) => <circle key={p.k} cx={X(i)} cy={Y(p.v)} r={i === last ? 5.5 : 4} className={`lc-dot ${i === last ? "end" : ""} ${hi === i ? "on" : ""}`} />)}
        <text x={X(last) - 8} y={Y(cur[last].v) - 12} className="lc-lab" textAnchor="end">{brl(cur[last].v)}</text>
        {cur.map((p, i) => <rect key={p.k} x={X(i) - w / 12} y={T} width={w / 6} height={hh} className="lc-hit"
          onMouseEnter={() => setHi(i)} onMouseMove={() => setHi(i)} onClick={() => setHi(hi === i ? null : i)} />)}
      </svg>
      <div className="lc-tip" hidden={hi === null} style={{ left: tipLeft }}>{tip}</div>
    </div>
  );
}
