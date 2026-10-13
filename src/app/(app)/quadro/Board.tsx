"use client";
import Link from "next/link";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client.ts";
import { STATUSES, brl, isStale, daysBetween, type Status, type ShopFees } from "@/lib/rules.ts";
import { PaymentModal } from "@/components/PaymentModal.tsx";

export interface BoardCard {
  id: string; number: number; plate: string; make: string | null; model: string | null; status: Status;
  customer_name: string; technician_name: string | null; total: number; status_since: string; exited_at: string | null;
}

export function Board({ initial, fees }: { initial: BoardCard[]; fees: ShopFees }) {
  const supabase = createClient();
  const [cards, setCards] = useState(initial);
  const [paying, setPaying] = useState<BoardCard | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function move(id: string, to: Status) {
    const card = cards.find(c => c.id === id);
    if (!card || card.status === to) return;
    if (to === "finalizado") { setPaying(card); return; }      // finalizar sempre passa pelo pagamento
    const prev = cards;
    setCards(cs => cs.map(c => (c.id === id ? { ...c, status: to, status_since: new Date().toISOString() } : c)));
    const { error } = await supabase.from("service_orders").update({ status: to }).eq("id", id);
    if (error) { setCards(prev); setMsg(error.message); }
  }

  return (
    <>
      {msg && <p className="error" role="alert" onClick={() => setMsg(null)}>{msg}</p>}
      <div className="board">
        {STATUSES.map(s => {
          const list = cards.filter(c => c.status === s.id);
          return (
            <section key={s.id} className="col"
              onDragOver={e => e.preventDefault()}
              onDrop={e => move(e.dataTransfer.getData("text/plain"), s.id)}>
              <h3><span>{s.label}</span><span className="num">{list.length}</span></h3>
              {list.map(c => {
                const stale = isStale(c.status, new Date(c.status_since));
                return (
                  <article key={c.id} className={`os-card ${stale ? "stale" : ""}`} draggable
                    onDragStart={e => e.dataTransfer.setData("text/plain", c.id)}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span className="plate">{c.plate}</span><span className="num muted">#{c.number}</span>
                    </div>
                    <div style={{ fontWeight: 600, marginTop: 8 }}>{[c.make, c.model].filter(Boolean).join(" ")}</div>
                    <div className="muted" style={{ fontSize: 13 }}>{c.customer_name}{c.technician_name ? ` · ${c.technician_name}` : ""}</div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 13 }}>
                      <span className="num">{brl(Number(c.total))}</span>
                      {stale && <span className="error">parado há {daysBetween(new Date(c.status_since))} dias</span>}
                    </div>
                    {/* Alternativa ao arrastar (celular/teclado) */}
                    <select className="input" style={{ marginTop: 8, padding: "6px 10px" }} value={c.status}
                      onChange={e => move(c.id, e.target.value as Status)} aria-label="Mover para">
                      {STATUSES.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                    </select>
                    <Link href={`/os/${c.id}`} className="muted" style={{ fontSize: 12 }}>Abrir O.S. →</Link>
                  </article>
                );
              })}
            </section>
          );
        })}
      </div>
      {paying && (
        <PaymentModal os={paying} fees={fees} onClose={() => setPaying(null)}
          onDone={() => {
            setCards(cs => cs.map(c => (c.id === paying.id ? { ...c, status: "finalizado", exited_at: new Date().toISOString() } : c)));
            setPaying(null);
          }} />
      )}
    </>
  );
}
