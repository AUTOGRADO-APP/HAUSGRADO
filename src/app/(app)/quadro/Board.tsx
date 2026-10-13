"use client";
// Quadro de serviço (seção 7.3): 6 colunas, arrastar ou ‹ ›, Desfazer, alerta de parado, foto rápida, busca (/).
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client.ts";
import { STATUSES, type Status, type ShopFees } from "@/lib/rules.ts";
import { STATUS_IDX, TIPOS, normPlaca } from "@/lib/labels.ts";
import { addMediaRecord } from "@/lib/media.ts";
import { errMsg, sfx, toast } from "@/lib/ui.ts";
import { PaymentModal, type PayOS } from "@/components/PaymentModal.tsx";
import { Plate } from "@/components/Plate.tsx";
import { ICAM } from "@/components/icons.tsx";

export interface BoardCard {
  id: string; number: number; plate: string; make: string | null; model: string | null; status: Status; entry_type: string;
  customer_name: string; technician_name: string | null; total: number; status_since: string; entered_at: string; exited_at: string | null; n_records: number;
}
/** posição horizontal de uma coluna dentro da área que rola */
const colX = (box: HTMLElement, col: HTMLElement) => col.getBoundingClientRect().left - box.getBoundingClientRect().left + box.scrollLeft;
const LABEL = Object.fromEntries(STATUSES.map(s => [s.id, s.label])) as Record<Status, string>;

export function Board({ initial, fees, noMes, shopId, hasPassword, canUndoReceipt }: {
  initial: BoardCard[]; fees: ShopFees; noMes: number; shopId: string; hasPassword: boolean; canUndoReceipt: boolean;
}) {
  const sb = createClient();
  const router = useRouter();
  const [cards, setCards] = useState(initial);
  const [paying, setPaying] = useState<BoardCard | null>(null);
  const [busca, setBusca] = useState("");
  const [over, setOver] = useState<string | null>(null);
  const buscaRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [colAtiva, setColAtiva] = useState<Status>("orcamento");
  useEffect(() => setCards(initial), [initial]);
  // celular: marca nos atalhos a coluna que está à vista enquanto o quadro rola de lado
  useEffect(() => {
    const box = scrollRef.current;
    if (!box) return;
    const on = () => {
      const x = box.scrollLeft + box.clientWidth * 0.35;
      let best: Status = "orcamento";
      box.querySelectorAll<HTMLElement>("[data-col]").forEach(c => { if (colX(box, c) <= x) best = c.dataset.col as Status; });
      setColAtiva(best);
    };
    box.addEventListener("scroll", on, { passive: true });
    return () => box.removeEventListener("scroll", on);
  }, []);

  // atalho "/" para a busca
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === "/" && !/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) { e.preventDefault(); buscaRef.current?.focus(); }
    };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, []);
  // tempo real: outra pessoa mexeu numa O.S. → recarrega
  useEffect(() => {
    const ch = sb.channel("board").on("postgres_changes", { event: "*", schema: "public", table: "service_orders" }, () => router.refresh()).subscribe();
    return () => { void sb.removeChannel(ch); };
  }, [sb, router]);

  async function setStatus(id: string, to: Status) {
    const { error } = await sb.from("service_orders").update({ status: to }).eq("id", id);
    if (error) { toast(errMsg(error), { err: true }); router.refresh(); return false; }
    return true;
  }

  async function move(id: string, to: Status) {
    const c = cards.find(x => x.id === id);
    if (!c || c.status === to) return;
    if (to === "finalizado") { setPaying(c); sfx("tap"); return; }   // finalizar sempre passa pelo pagamento
    if (c.status === "finalizado") return toast("O.S. finalizada só volta pelo Desfazer logo após o recebimento.", { err: true });
    const prev = c.status;
    setCards(cs => cs.map(x => (x.id === id ? { ...x, status: to, status_since: new Date().toISOString() } : x)));
    if (!(await setStatus(id, to))) return;
    sfx("move");
    toast(`${c.plate} → ${LABEL[to]}`, { undo: async () => { await setStatus(id, prev); router.refresh(); } });
    router.refresh();
  }

  async function quickPhoto(c: BoardCard, files: FileList | null) {
    if (!files?.length) return;
    sfx("cam");
    try {
      for (const f of Array.from(files)) await addMediaRecord(sb, shopId, c.id, "servicos", f);
      toast(`${files.length > 1 ? "Fotos salvas" : "Foto salva"} em Serviço · ${c.plate}`, { sound: "ok" });
      router.refresh();
    } catch (e) { toast(errMsg(e as Error), { err: true }); }
  }

  const q = normPlaca(busca);
  const list = cards.filter(o => !busca || (q && o.plate.includes(q)) || o.customer_name.toUpperCase().includes(busca.toUpperCase()));
  const pat = cards.filter(o => o.status !== "finalizado");
  const pad = (n: number) => String(n).padStart(2, "0");

  const porColuna = STATUSES.map(s => list
    .filter(o => o.status === s.id && (s.id !== "finalizado" || (o.exited_at && Date.now() - new Date(o.exited_at).getTime() <= 3 * 864e5)))
    .sort((a, b) => (a.entered_at < b.entered_at ? -1 : 1)));
  function irColuna(id: Status) {
    const box = scrollRef.current, col = box?.querySelector<HTMLElement>(`[data-col="${id}"]`);
    if (!box || !col) return;
    box.scrollTo({ left: colX(box, col), behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    setColAtiva(id);
  }

  return (
    <>
      <div className="stats">
        <div className="stat"><span>No pátio</span><strong>{pad(pat.length)}</strong></div>
        <div className="stat"><span>Em serviço</span><strong>{pad(cards.filter(o => o.status === "servico").length)}</strong></div>
        <div className="stat"><span>Aguardando peças</span><strong>{pad(cards.filter(o => o.status === "pecas").length)}</strong></div>
        <div className="stat hl"><span>Carros atendidos no mês</span><strong>{pad(noMes)}</strong></div>
      </div>
      <main id="view">
        <section className="panel board-wide">
          <div className="ph"><h2>Quadro de serviço</h2>
            <div className="row"><input ref={buscaRef} className="input" placeholder="Buscar placa ou cliente" value={busca} onChange={e => setBusca(e.target.value)} style={{ maxWidth: 240 }} />
              <span className="hint">Arraste o card entre colunas ou use ‹ ›</span></div></div>
          {/* só no celular: atalhos para cada coluna (o quadro rola de lado, uma coluna por vez) */}
          <div className="col-tabs" role="tablist" aria-label="Etapas do quadro">
            {STATUSES.map((s, si) => (
              <button key={s.id} type="button" role="tab" aria-selected={colAtiva === s.id} className={colAtiva === s.id ? "on" : ""}
                onClick={() => irColuna(s.id)}><i>{pad(si + 1)}</i>{s.label}<b>{porColuna[si].length}</b></button>
            ))}
          </div>
          <div className="board-scroll" ref={scrollRef}><div className="board">
            {STATUSES.map((s, si) => {
              const cs = porColuna[si];
              return (
                <div key={s.id} className={`col ${over === s.id ? "over" : ""}`} data-col={s.id}
                  onDragOver={e => { e.preventDefault(); setOver(s.id); }} onDragLeave={() => setOver(o => (o === s.id ? null : o))}
                  onDrop={e => { e.preventDefault(); setOver(null); void move(e.dataTransfer.getData("text/plain"), s.id); }}>
                  <div className="col-h"><span className="t"><i>{pad(si + 1)}</i>{s.label}</span><span className="count">{cs.length}</span></div>
                  {s.id === "finalizado" && <div className="hint" style={{ padding: "0 4px" }}>Últimos 3 dias · os anteriores ficam no <Link className="lnk" href="/historico">Histórico</Link></div>}
                  {cs.length ? cs.map(o => <Card key={o.id} o={o} onMove={move} onPhoto={quickPhoto} onOpen={() => router.push(`/os/${o.id}`)} />) : <div className="empty">Nenhum veículo</div>}
                </div>
              );
            })}
          </div></div>
        </section>
      </main>
      {paying && (
        <PaymentModal os={paying as PayOS} fees={fees} hasPassword={hasPassword} onClose={() => setPaying(null)}
          onDone={(prev) => {
            const p = paying; setPaying(null);
            setCards(cs => cs.map(c => (c.id === p.id ? { ...c, status: "finalizado", exited_at: new Date().toISOString() } : c)));
            router.refresh();
            toast(`${p.plate} → Finalizado · pagamento registrado`, canUndoReceipt ? {
              undo: async () => {
                const { error } = await sb.rpc("undo_receipt", { p_os: p.id, p_previous_status: prev });
                if (error) toast(errMsg(error), { err: true }); router.refresh();
              },
            } : {});
          }} />
      )}
    </>
  );
}

function Card({ o, onMove, onPhoto, onOpen }: { o: BoardCard; onMove: (id: string, to: Status) => void; onPhoto: (o: BoardCard, f: FileList | null) => void; onOpen: () => void }) {
  const fim = o.status === "finalizado" && o.exited_at ? new Date(o.exited_at).getTime() : Date.now();
  const h = Math.max(0, (fim - new Date(o.entered_at).getTime()) / 36e5);
  const tempo = h < 24 ? `${Math.floor(h)} h` : `${Math.floor(h / 24)} d`;
  const i = STATUS_IDX[o.status];
  const parado = o.status !== "finalizado" ? Math.floor((Date.now() - new Date(o.status_since).getTime()) / 864e5) : 0;
  const nm = o.n_records;
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  return (
    <article className={`card ${parado >= 3 ? "is-stale" : ""}`} draggable onDragStart={e => { e.dataTransfer.setData("text/plain", o.id); e.dataTransfer.effectAllowed = "move"; }}
      onClick={onOpen} role="link" tabIndex={0} onKeyDown={e => { if (e.key === "Enter") onOpen(); }}>
      {parado >= 3 && <div className="stale" title={`Sem mudar de etapa há ${parado} dias`}>Parado há {parado} dias nesta etapa</div>}
      <div className="card-top"><Plate p={o.plate} /><span className={`chip t-${o.entry_type}`}><span className="dot" style={{ background: "currentColor" }} />{TIPOS[o.entry_type]}</span></div>
      <div><div className="veh">{o.make} {o.model}</div><div className="meta">{o.customer_name || "Sem cliente"} · OS {o.number}{o.technician_name && <><br />Resp.: {o.technician_name}</>}</div></div>
      <div className="card-foot"><span className="meta">{tempo} {o.status === "finalizado" ? "de pátio" : "no pátio"}{nm ? ` · ${nm} registro${nm > 1 ? "s" : ""}` : ""}</span>
        <span className="mv" onClick={stop}>
          <label className="key sm quick" title="Foto rápida em Serviço">{ICAM}<input type="file" accept="image/*" capture="environment" aria-label={`Foto rápida em Serviço de ${o.plate}`} onChange={e => { onPhoto(o, e.target.files); e.target.value = ""; }} /></label>
          <button className="key sm" aria-label="Voltar etapa" aria-disabled={i === 0 || o.status === "finalizado"} onClick={() => i > 0 && onMove(o.id, STATUSES[i - 1].id)}>‹</button>
          <button className="key sm" aria-label="Avançar etapa" aria-disabled={i === 5} onClick={() => i < 5 && onMove(o.id, STATUSES[i + 1].id)}>›</button>
        </span></div>
    </article>
  );
}
