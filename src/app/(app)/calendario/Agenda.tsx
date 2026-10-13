"use client";
// Calendário de agendamentos (seção 7.6): grade do mês, lista do dia, Abrir O.S. / Faltou / Reagendar / Excluir e novo agendamento.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client.ts";
import { AG_ST, MESES, fmtFone, normPlaca, ymd } from "@/lib/labels.ts";
import { errMsg, sfx, toast } from "@/lib/ui.ts";
import { DOW, anoMes, monthCells, moveMes, tituloDia } from "@/lib/fin-a.ts";
import { Plate } from "@/components/Plate.tsx";

export interface Appt { id: string; date: string; time: string; customer_id: string; plate: string | null; reason: string | null; status: "agendado" | "atendido" | "faltou"; service_order_id: string | null; os_number: number | null }
export interface Cli { id: string; name: string; phone: string }
export interface Veh { customer_id: string | null; plate: string }

export function Agenda({ initial, clientes, veiculos }: { initial: Appt[]; clientes: Cli[]; veiculos: Veh[] }) {
  const sb = useMemo(() => createClient(), []);
  const router = useRouter();
  const hoje = ymd();
  const [ags, setAgs] = useState(initial);
  useEffect(() => setAgs(initial), [initial]);
  const [cal, setCal] = useState(() => ({ ...anoMes(hoje), dia: hoje }));
  const [form, setForm] = useState({ data: hoje, hora: "08:00", clienteId: "", placa: "", servico: "" });
  const [pend, setPend] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // tempo real: outro usuário mexeu na agenda
  useEffect(() => {
    const ch = sb.channel("agenda").on("postgres_changes", { event: "*", schema: "public", table: "appointments" }, () => router.refresh()).subscribe();
    return () => { void sb.removeChannel(ch); };
  }, [sb, router]);

  const cliBy = useMemo(() => Object.fromEntries(clientes.map(c => [c.id, c])), [clientes]);
  const byDay = useMemo(() => {
    const m: Record<string, Appt[]> = {};
    ags.forEach(a => (m[a.date] = m[a.date] || []).push(a));
    Object.values(m).forEach(l => l.sort((a, b) => a.time.localeCompare(b.time)));
    return m;
  }, [ags]);
  const cells = monthCells(cal.ano, cal.mes);
  const dl = byDay[cal.dia] || [];
  const plates = [...new Set(veiculos.filter(v => v.customer_id === form.clienteId).map(v => v.plate))];

  const irDia = (k: string) => { setCal({ ...anoMes(k), dia: k }); setForm(f => ({ ...f, data: k })); setPend(null); };
  const mv = (d: number) => setCal(c => ({ ...c, ...moveMes(c.ano, c.mes, d) }));

  async function add() {
    if (!form.clienteId) return toast("Escolha o cliente", { err: true });
    if (!form.hora) return toast("Informe a hora", { err: true });
    const data = form.data || cal.dia;
    setBusy(true);
    const { error } = await sb.from("appointments").insert({ date: data, time: form.hora, customer_id: form.clienteId, plate: normPlaca(form.placa) || null, reason: form.servico.trim() || null, status: "agendado" });
    setBusy(false);
    if (error) return toast(errMsg(error), { err: true });
    setCal({ ...anoMes(data), dia: data });
    setForm({ data, hora: form.hora, clienteId: "", placa: "", servico: "" });
    router.refresh();
    toast("Agendamento salvo", { sound: "ok" });
  }
  async function setSt(a: Appt, status: Appt["status"]) {
    setAgs(l => l.map(x => (x.id === a.id ? { ...x, status } : x)));
    const { error } = await sb.from("appointments").update({ status }).eq("id", a.id);
    if (error) { toast(errMsg(error), { err: true }); router.refresh(); return; }
    sfx("tap"); router.refresh();
  }
  async function del(a: Appt) {
    setPend(null);
    const { error } = await sb.from("appointments").delete().eq("id", a.id);
    if (error) return toast(errMsg(error), { err: true });
    setAgs(l => l.filter(x => x.id !== a.id));
    router.refresh();
    toast("Agendamento excluído");
  }

  return (
    <main id="view">
      <div className="split">
        <section className="panel"><div className="ph"><h2>Calendário</h2>
          <div className="row"><button className="key sm" onClick={() => mv(-1)} aria-label="Mês anterior">‹</button><b style={{ minWidth: 150, textAlign: "center" }}>{MESES[cal.mes]} {cal.ano}</b><button className="key sm" onClick={() => mv(1)} aria-label="Próximo mês">›</button><button className="key sm" onClick={() => irDia(hoje)}>Hoje</button></div></div>
          <div className="cal-grid">
            {DOW.map(d => <span key={d} className="cal-h">{d}</span>)}
            {cells.map(c => {
              const l = byDay[c.k] || [];
              return (
                <button key={c.k} className={`cal-d ${c.out ? "out" : ""} ${c.k === hoje ? "today" : ""} ${c.k === cal.dia ? "sel" : ""}`} onClick={() => irDia(c.k)} aria-label={`${c.day} de ${MESES[c.month]}, ${l.length} agendamento(s)`}>
                  <span className="cal-n">{c.day}</span>{l.length > 0 && <span className="cal-c">{l.length}</span>}
                  <span className="cal-items">
                    {l.slice(0, 3).map(a => <span key={a.id} className={`cal-p st-${a.status}`}><b>{a.time}</b> {a.plate || cliBy[a.customer_id]?.name?.split(" ")[0] || ""}</span>)}
                    {l.length > 3 && <span className="cal-more">+{l.length - 3}</span>}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
        <aside className="stack sticky">
          <section className="panel"><div className="ph"><h2>{tituloDia(cal.dia)}</h2><span className="count">{dl.length}</span></div>
            <div className="stack" style={{ gap: 10 }}>
              {dl.length ? dl.map(a => {
                const c = cliBy[a.customer_id];
                return (
                  <div key={a.id} className={`ag-it ${a.status === "faltou" ? "faltou" : ""}`}>
                    <div className="row" style={{ justifyContent: "space-between" }}><span className="row"><b className="mono" style={{ fontSize: "13pt" }}>{a.time}</b>{a.plate && <Plate p={a.plate} />}</span><span className={`chip ${a.status === "atendido" ? "ok" : a.status === "faltou" ? "bad" : ""}`}>{AG_ST[a.status]}</span></div>
                    <div><b>{c?.name || "Sem cliente"}</b>{c?.phone && <> · <span className="mono">{fmtFone(c.phone)}</span></>}</div>
                    {a.reason && <div className="muted">{a.reason}</div>}
                    <div className="row">
                      {a.service_order_id ? <Link className="key sm" href={`/os/${a.service_order_id}`}>Ver O.S. {a.os_number ?? ""}</Link>
                        : a.status === "agendado" ? <><Link className="key sm accent" href={`/os/nova?ag=${a.id}`}>Abrir O.S.</Link><button className="key sm" onClick={() => setSt(a, "faltou")}>Faltou</button></>
                          : <button className="key sm" onClick={() => setSt(a, "agendado")}>Reagendar</button>}
                      {pend === a.id ? <><button className="key sm danger" onClick={() => del(a)}>Excluir</button><button className="key sm" onClick={() => setPend(null)}>Cancelar</button></>
                        : <button className="del" onClick={() => setPend(a.id)} aria-label="Excluir agendamento">×</button>}
                    </div>
                  </div>
                );
              }) : <div className="empty">Nenhum agendamento neste dia</div>}
            </div>
          </section>
          <section className="panel"><div className="ph"><h2>Novo agendamento</h2></div><div className="stack">
            <div className="grid2"><label className="field"><span className="label">Data</span><input className="input mono" type="date" value={form.data} onChange={e => { const v = e.target.value; setForm(f => ({ ...f, data: v })); if (v) setCal({ ...anoMes(v), dia: v }); }} /></label>
              <label className="field"><span className="label">Hora</span><input className="input mono" type="time" value={form.hora} onChange={e => setForm(f => ({ ...f, hora: e.target.value }))} /></label></div>
            <label className="field"><span className="label">Cliente</span><select className="input" value={form.clienteId} onChange={e => setForm(f => ({ ...f, clienteId: e.target.value }))}><option value="">— escolha —</option>{clientes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select><span className="hint">Cliente novo? Cadastre em <Link href="/clientes">Clientes</Link> primeiro.</span></label>
            <label className="field"><span className="label">Placa</span><input className="input mono" list="ag-placas" placeholder="ABC1D23" value={form.placa} onChange={e => setForm(f => ({ ...f, placa: normPlaca(e.target.value) }))} style={{ textTransform: "uppercase" }} /><datalist id="ag-placas">{plates.map(p => <option key={p} value={p} />)}</datalist></label>
            <label className="field"><span className="label">Serviço / motivo</span><textarea className="input" placeholder="Ex.: revisão, barulho ao frear…" value={form.servico} onChange={e => setForm(f => ({ ...f, servico: e.target.value }))} /></label>
            <button className="key accent" onClick={add} disabled={busy}>Agendar</button>
          </div></section>
        </aside>
      </div>
    </main>
  );
}
