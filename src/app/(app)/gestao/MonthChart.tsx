"use client";
// Faturamento acumulado no mês (Gestão): linha do acumulado dia a dia, mês anterior tracejado, barras do recebido em cada dia,
// linhas de META e SUPER META e, no mês corrente, a projeção até o fim do mês.
// Renderiza na largura real do container (ResizeObserver), sem escalar o SVG, para o texto manter o tamanho da interface.
import { useEffect, useRef, useState } from "react";
import { brl } from "@/lib/rules.ts";
import { brlK } from "@/lib/fin-a.ts";
import type { DiaMes } from "@/lib/gestao.ts";

function niceStep(v: number) {
  if (v <= 0) return 1000;
  const p = Math.pow(10, Math.floor(Math.log10(v))); const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}
const WD = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const fd = (k: string) => { const d = new Date(k + "T12:00:00Z"); return `${WD[d.getUTCDay()]}, ${k.slice(8, 10)}/${k.slice(5, 7)}`; };

export function MonthChart({ cur, prev, ateDia, hojeDia, nomeAnt, goal, superGoal, projecao }: {
  cur: DiaMes[]; prev: DiaMes[];
  /** último dia com dados (hoje no mês corrente; último dia em mês passado) */
  ateDia: number;
  /** dia de hoje quando o mês exibido é o corrente (marca "Hoje"); null em mês passado */
  hojeDia: number | null;
  nomeAnt: string; goal?: number; superGoal?: number;
  /** projeção do fim do mês (só no mês corrente) */
  projecao?: number;
}) {
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

  const N = cur.length;
  const W = Math.max(cw || 760, 520), H = 280, L = 78, Rr = 92, T = 18, B = 34, w = W - L - Rr, hh = H - T - B;
  const vis = cur.slice(0, ateDia);
  const pv = prev.slice(0, N);
  const last = vis[vis.length - 1] ?? cur[0];
  const temProj = projecao !== undefined && hojeDia !== null && ateDia < N;
  const vmax = Math.max(1, last.acc, ...pv.map(p => p.acc), goal ?? 0, superGoal ?? 0, temProj ? projecao! : 0) * 1.06;
  const step = niceStep(vmax / 4), mx = step * Math.ceil(vmax / step);
  const dmax = Math.max(1, ...vis.map(d => d.v));
  const X = (d: number) => L + (d - 1) * (w / Math.max(1, N - 1)), Y = (v: number) => T + hh - (v / mx) * hh;
  const bw = Math.max(3, Math.min(18, w / N * 0.55));
  const path = (a: DiaMes[]) => a.map((p, i) => `${i ? "L" : "M"}${X(p.d).toFixed(1)},${Y(p.acc).toFixed(1)}`).join("");
  const ticks: number[] = []; for (let t = 0; t <= mx + 1e-6; t += step) ticks.push(t);
  const xl = new Set([1, 5, 10, 15, 20, 25, N]); if (hojeDia) { xl.add(hojeDia); for (const d of [...xl]) if (d !== hojeDia && Math.abs(d - hojeDia) < 3) xl.delete(d); }
  // META e SUPER META próximas: afasta os rótulos para um não escrever em cima do outro
  const gapRot = goal && superGoal ? Math.max(0, 28 - (Y(goal) - Y(superGoal))) / 2 : 0;
  const linha = (v: number, rot: string, cls: string, dy = 0) => (
    <g className={`mc-goal ${cls}`}>
      <line x1={L} x2={W - Rr + 6} y1={Y(v)} y2={Y(v)} />
      <text x={W - Rr + 10} y={Y(v) - 3 + dy}>{rot}</text>
      <text x={W - Rr + 10} y={Y(v) + 10 + dy} className="v">{brlK(v)}</text>
    </g>
  );

  let tip: React.ReactNode = null, tipLeft = 0;
  if (hi !== null) {
    const c = cur[hi - 1], p = prev[hi - 1];
    const dlt = p?.acc ? Math.round((c.acc - p.acc) / p.acc * 100) : null;
    const px = X(hi) - (wrap.current?.scrollLeft ?? 0);
    tipLeft = Math.min(Math.max(px - 100, 0), (wrap.current?.clientWidth ?? W) - 210);
    tip = <>
      <b>{fd(c.k)}{hojeDia === hi ? " · hoje" : ""}</b>
      <span><i className="sw cur" />Acumulado {brl(c.acc)}</span>
      <span><i className="sw bar" />No dia {brl(c.v)} <small>{c.n} receb.</small></span>
      {p && <span><i className="sw prev" />{nomeAnt} até dia {hi}: {brl(p.acc)}</span>}
      {dlt !== null && <em className={dlt >= 0 ? "up" : "down"}>{dlt >= 0 ? "▲" : "▼"} {Math.abs(dlt)}%</em>}
    </>;
  }

  return (
    <div className="lc" ref={wrap} onMouseLeave={() => setHi(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img"
        aria-label={`Faturamento acumulado no mês: ${brl(last.acc)} até o dia ${ateDia}`}>
        <defs><linearGradient id="mcg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--accent)" stopOpacity=".18" /><stop offset="1" stopColor="var(--accent)" stopOpacity="0" /></linearGradient></defs>
        {ticks.map(t => <g key={t}>
          <line x1={L} x2={W - Rr} y1={Y(t)} y2={Y(t)} className="lc-grid" />
          <text x={L - 10} y={Y(t) + 4} className="lc-ax" textAnchor="end">{t ? brlK(t) : "R$ 0"}</text>
        </g>)}
        {[...xl].sort((a, b) => a - b).map(d => <text key={d} x={X(d)} y={H - 10} className={`lc-ax ${d === hojeDia ? "lc-today" : ""}`} textAnchor="middle">{d === hojeDia ? "Hoje" : d}</text>)}
        {/* recebido em cada dia (escala própria, no terço de baixo) */}
        {vis.map(p => p.v > 0 && <rect key={p.k} x={X(p.d) - bw / 2} y={T + hh - (p.v / dmax) * hh * 0.35} width={bw} height={(p.v / dmax) * hh * 0.35} rx={2} className={`mc-bar ${hi === p.d ? "on" : ""}`} />)}
        {goal ? linha(goal, "META", "", gapRot) : null}
        {superGoal && superGoal > (goal ?? 0) ? linha(superGoal, "SUPER", "sup", -gapRot) : null}
        <line x1={hi !== null ? X(hi) : 0} x2={hi !== null ? X(hi) : 0} y1={T} y2={T + hh} className="lc-cross" visibility={hi !== null ? "visible" : "hidden"} />
        <path d={path(pv)} className="lc-prev" />
        <path d={`${path(vis)}L${X(last.d)},${T + hh}L${X(1)},${T + hh}Z`} fill="url(#mcg)" />
        {temProj && <path d={`M${X(last.d)},${Y(last.acc)}L${X(N)},${Y(projecao!)}`} className="mc-proj" />}
        <path d={path(vis)} className="lc-cur" />
        {hi !== null && hi <= ateDia && <circle cx={X(hi)} cy={Y(cur[hi - 1].acc)} r={5} className="lc-dot on" />}
        <circle cx={X(last.d)} cy={Y(last.acc)} r={5.5} className="lc-dot end" />
        <text x={X(last.d) - 8} y={Y(last.acc) - 12} className="lc-lab" textAnchor="end">{brl(last.acc)}</text>
        {temProj && <text x={X(N)} y={Y(projecao!) - 10} className="mc-proj-l" textAnchor="end">Projeção {brlK(projecao!)}</text>}
        {vis.map(p => <rect key={p.k} x={X(p.d) - w / N / 2} y={T} width={w / N} height={hh} className="lc-hit"
          onMouseEnter={() => setHi(p.d)} onMouseMove={() => setHi(p.d)} onClick={() => setHi(hi === p.d ? null : p.d)} />)}
      </svg>
      <div className="lc-tip" hidden={hi === null} style={{ left: tipLeft }}>{tip}</div>
    </div>
  );
}
