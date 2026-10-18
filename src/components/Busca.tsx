"use client";
// Busca única (topo de qualquer tela): placa, cliente, celular ou nº de O.S./orçamento.
// Atalhos: Ctrl+K em qualquer tela e "/" fora do Quadro (lá o "/" continua no filtro do quadro).
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client.ts";
import { STATUSES, type Status } from "@/lib/rules.ts";
import { ORC_ST, digits, dataBR, fmtFone, normPlaca, placaOk } from "@/lib/labels.ts";
import { waURL } from "@/lib/msgs.ts";
import { sfx } from "@/lib/ui.ts";
import { Plate } from "./Plate.tsx";

interface ROS { id: string; number: number; plate: string; make: string | null; model: string | null; status: Status; exited_at: string | null; customers: { name: string } | null; technicians: { name: string } | null }
interface RCli { id: string; name: string; phone: string }
interface RQ { id: string; number: number; plate: string | null; status: string; customers: { name: string } | null }
type Item = { key: string; href: string; ext?: boolean };

const ST = Object.fromEntries(STATUSES.map(s => [s.id, s.label])) as Record<Status, string>;
/** tira o que quebraria o filtro or() do PostgREST */
const limpa = (s: string) => s.replace(/[,()%*"\\]/g, " ").trim();

export const ILUPA = <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></svg>;

export function Busca({ onClose }: { onClose: () => void }) {
  const sb = useMemo(() => createClient(), []);
  const router = useRouter();
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<{ os: ROS[]; cli: RCli[]; orc: RQ[] } | null>(null);
  const [sel, setSel] = useState(0);
  const inp = useRef<HTMLInputElement>(null);
  const seq = useRef(0);

  useEffect(() => { inp.current?.focus(); }, []);
  useEffect(() => {
    const t = limpa(q);
    if (t.length < 2) { setRes(null); return; }
    const n = ++seq.current;
    const h = setTimeout(async () => {
      setBusy(true);
      const p = normPlaca(t), d = digits(t), num = /^\d{3,6}$/.test(t) ? Number(t) : null;
      const cliOr = [`name.ilike.%${t}%`, d.length >= 4 ? `phone.ilike.%${d}%` : ""].filter(Boolean).join(",");
      const { data: cli } = await sb.from("customers").select("id, name, phone").or(cliOr).order("name").limit(6);
      const ids = ((cli ?? []) as RCli[]).map(c => c.id);
      const osOr = [p.length >= 2 ? `plate.ilike.%${p}%` : "", ids.length ? `customer_id.in.(${ids.join(",")})` : "", num ? `number.eq.${num}` : ""].filter(Boolean).join(",");
      const qOr = [p.length >= 2 ? `plate.ilike.%${p}%` : "", num ? `number.eq.${num}` : ""].filter(Boolean).join(",");
      const [{ data: os }, { data: orc }] = await Promise.all([
        osOr ? sb.from("service_orders").select("id, number, plate, make, model, status, exited_at, customers(name), technicians(name)").or(osOr).order("entered_at", { ascending: false }).limit(12)
             : Promise.resolve({ data: [] }),
        qOr ? sb.from("quotes").select("id, number, plate, status, customers(name)").or(qOr).order("created_at", { ascending: false }).limit(5)
            : Promise.resolve({ data: [] }),
      ]);
      if (n !== seq.current) return;   // chegou resposta de uma busca antiga
      setRes({ os: (os ?? []) as unknown as ROS[], cli: (cli ?? []) as RCli[], orc: (orc ?? []) as unknown as RQ[] });
      setSel(0); setBusy(false);
    }, 220);
    return () => clearTimeout(h);
  }, [q, sb]);

  const patio = res?.os.filter(o => o.status !== "finalizado") ?? [];
  const hist = res?.os.filter(o => o.status === "finalizado").slice(0, 5) ?? [];
  const placa = normPlaca(q);
  const semPlaca = !!res && placaOk(placa) && !res.os.some(o => o.plate === placa);
  // ordem do teclado (↑ ↓ Enter) = ordem na tela
  const itens: Item[] = [
    ...patio.map(o => ({ key: "o" + o.id, href: `/os/${o.id}` })),
    ...hist.map(o => ({ key: "o" + o.id, href: `/os/${o.id}` })),
    ...(res?.cli ?? []).map(c => ({ key: "c" + c.id, href: `/clientes?q=${encodeURIComponent(c.name)}` })),
    ...(res?.orc ?? []).map(r => ({ key: "q" + r.id, href: `/orcamentos/${r.id}` })),
    ...(semPlaca ? [{ key: "nova", href: `/os/nova?placa=${placa}` }] : []),
  ];
  const idx = (k: string) => itens.findIndex(i => i.key === k);
  function ir(href: string) { sfx("tap"); onClose(); router.push(href); }

  function tecla(e: React.KeyboardEvent) {
    if (e.key === "Escape") { e.preventDefault(); onClose(); }
    else if (e.key === "ArrowDown") { e.preventDefault(); setSel(s => Math.min(itens.length - 1, s + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSel(s => Math.max(0, s - 1)); }
    else if (e.key === "Enter" && itens[sel]) { e.preventDefault(); ir(itens[sel].href); }
  }

  // função (não componente) para o botão não ser recriado a cada render: senão o clique se perde ao trocar a seleção
  const linha = (k: string, children: React.ReactNode) => {
    const i = idx(k), it = itens[i];
    return <button key={k} type="button" role="option" aria-selected={i === sel} className={`bs-it ${i === sel ? "sel" : ""}`} onMouseEnter={() => setSel(i)} onClick={() => ir(it.href)}>{children}</button>;
  };
  const vazio = res && !itens.length;

  return (
    <div className="modal-bg bs-bg" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal bs" role="dialog" aria-modal="true" aria-label="Buscar">
        <div className="bs-in">{ILUPA}
          <input ref={inp} className="input" placeholder="Placa, cliente, celular ou nº da O.S." value={q} onChange={e => setQ(e.target.value)} onKeyDown={tecla}
            aria-label="Buscar placa, cliente, celular ou número" autoComplete="off" spellCheck={false} />
          <button type="button" className="key sm" onClick={onClose}>Esc</button>
        </div>
        <div className="bs-res" role="listbox" aria-busy={busy}>
          {!res && <p className="hint bs-dica">Digite ao menos 2 letras. ↑ ↓ escolhem, Enter abre. Atalho: Ctrl+K (ou / fora do Quadro).</p>}
          {vazio && <p className="hint bs-dica">Nada encontrado para “{q}”.</p>}
          {patio.length > 0 && <Grupo t="No pátio">{patio.map(o => (
            linha("o" + o.id, <><Plate p={o.plate} /><span className="bs-tx"><b>{o.make} {o.model}</b><small><em className="bs-st">{ST[o.status]}</em> · {o.customers?.name ?? "Sem cliente"} · OS {o.number}{o.technicians ? ` · ${o.technicians.name}` : ""}</small></span></>)))}</Grupo>}
          {hist.length > 0 && <Grupo t="Histórico">{hist.map(o => (
            linha("o" + o.id, <><Plate p={o.plate} /><span className="bs-tx"><b>{o.make} {o.model}</b><small>{o.customers?.name ?? "Sem cliente"} · OS {o.number}</small></span><span className="chip">Saída {dataBR(o.exited_at)}</span></>)))}</Grupo>}
          {res && res.cli.length > 0 && <Grupo t="Clientes">{res.cli.map(c => {
            const wa = waURL(c.phone, "");
            return (
              <div key={c.id} className="bs-row">
                {linha("c" + c.id, <><span className="bs-av" aria-hidden="true">{c.name.slice(0, 1).toUpperCase()}</span><span className="bs-tx"><b>{c.name}</b><small className="mono">{fmtFone(c.phone)}</small></span></>)}
                {wa && <a className="key sm" href={wa} target="_blank" rel="noopener noreferrer" onClick={onClose}>WhatsApp</a>}
              </div>
            );
          })}</Grupo>}
          {res && res.orc.length > 0 && <Grupo t="Orçamentos">{res.orc.map(r => (
            linha("q" + r.id, <><span className="bs-av mono" aria-hidden="true">{r.number}</span><span className="bs-tx"><b>Orçamento nº {r.number}</b><small>{r.plate ?? "Sem placa"} · {r.customers?.name ?? "Sem cliente"}</small></span><span className="chip">{ORC_ST[r.status]}</span></>)))}</Grupo>}
          {semPlaca && <Grupo t="Placa nova">{linha("nova", <><Plate p={placa} /><span className="bs-tx"><b>Abrir nova O.S. com {placa}</b><small>Essa placa ainda não passou pela oficina</small></span></>)}</Grupo>}
        </div>
      </div>
    </div>
  );
}

function Grupo({ t, children }: { t: string; children: React.ReactNode }) {
  return <div className="bs-g"><span className="label">{t}</span>{children}</div>;
}
