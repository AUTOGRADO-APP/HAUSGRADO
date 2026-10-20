"use client";
// Detalhe da O.S. (seção 7.5). Visual e textos do protótipo (vOS / mediaItem).
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client.ts";
import { brl, STATUSES, type Role, type ShopFees, type Status } from "@/lib/rules.ts";
import { ABAS, FOTOS, ITENS_CK, ORC_ST, TIPOS, digits, dt, fmtDias, fmtFone, fromLocalInput, primeiroNome, toLocalInput } from "@/lib/labels.ts";
import { addMediaRecord, uploadFile, BUCKET } from "@/lib/media.ts";
import { msgOS, portalLink, waURL } from "@/lib/msgs.ts";
import { copyText, errMsg, sfx, toast } from "@/lib/ui.ts";
import { MSG_RECEBER, canDelete, isFin, isOffice } from "@/lib/permissions.ts";
import { Plate } from "@/components/Plate.tsx";
import { PaymentModal } from "@/components/PaymentModal.tsx";
import { MicButton, juntarDitado } from "@/components/MicButton.tsx";
import { PhotoSlot } from "@/components/os-slot.tsx";

export interface OSData {
  id: string; number: number; plate: string; make: string | null; model: string | null; year: string | null; color: string | null; fuel: string | null;
  km: string | null; fuel_level: string | null; entry_type: string; status: Status; entered_at: string; exited_at: string | null;
  technician_id: string | null; customer_complaint: string | null; service_description: string | null;
  checklist: Record<string, boolean>; portal_token: string; customer_name: string; customer_phone: string;
}
export interface OSRecord { id: string; tab: string; storage_path: string | null; mime: string | null; file_name: string | null; description: string | null; created_at: string; url?: string | null }
export interface OSPhoto { id: string; position: string; storage_path: string; url?: string | null }
export interface OSHist { id: number; text: string; created_by_name: string | null; created_at: string }
export interface OSQuote { id: string; number: number; status: string; total: number }
export interface OSTech { id: string; name: string; active: boolean }
/** Item do orçamento ativo, sem valores (os_tasks() no banco). */
export interface OSTask {
  id: string; kind: "peca" | "mao"; description: string; details: string | null; qty: number; position: number;
  quote_status: string; done_at: string | null; done_by_name: string | null;
}

const ABA_NOME: Record<string, string> = Object.fromEntries(ABAS.map(([k, , n]) => [k, n]));
const ST_LABEL = Object.fromEntries(STATUSES.map(s => [s.id, s.label])) as Record<Status, string>;
const IVIDEO = <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="6" width="13" height="12" rx="2" /><path d="M16 10l5-3v10l-5-3z" /></svg>;
const ICAMI = <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg>;
const ICAM_DROP = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true" style={{ width: 34, height: 34, stroke: "var(--muted)" }}><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg>;

export function OSDetail({ os, shopId, role, photos, records, history, techs, quote, shopName, portalBase, fees, hasPassword, total, tasks, statusSince }: {
  os: OSData; shopId: string; role: Role; photos: OSPhoto[]; records: OSRecord[]; history: OSHist[]; techs: OSTech[];
  quote: OSQuote | null; shopName: string; portalBase: string | null; fees: ShopFees; hasPassword: boolean; total: number;
  tasks: OSTask[]; statusSince: string;
}) {
  const sb = useMemo(() => createClient(), []);
  const router = useRouter();
  const [aba, setAba] = useState("avarias");
  const [pend, setPend] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const [enviando, setEnviando] = useState(0);
  const [over, setOver] = useState(false);
  const [focar, setFocar] = useState(false);
  const [ent, setEnt] = useState(toLocalInput(os.entered_at));
  const [sai, setSai] = useState(toLocalInput(os.exited_at));
  const [desc, setDesc] = useState(os.service_description ?? "");
  const [descParcial, setDescParcial] = useState("");
  const descSalvo = useRef(os.service_description ?? "");
  const descRef = useRef(desc); descRef.current = desc;
  const descTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lista = useRef<HTMLDivElement>(null);
  const podeExcluir = canDelete(role), fin = isFin(role), office = isOffice(role);
  const [delInfo, setDelInfo] = useState<string | null>(null);

  useEffect(() => setEnt(toLocalInput(os.entered_at)), [os.entered_at]);
  useEffect(() => setSai(toLocalInput(os.exited_at)), [os.exited_at]);
  useEffect(() => {   // outra pessoa mudou a descrição: só atualiza se aqui não há edição pendente
    if (desc === descSalvo.current && (os.service_description ?? "") !== descSalvo.current) { descSalvo.current = os.service_description ?? ""; setDesc(descSalvo.current); }
  }, [os.service_description]);

  // tempo real: registros e a própria O.S. (outro usuário, foto rápida do quadro, portal...)
  const refreshT = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refresh = useCallback(() => {
    if (refreshT.current) clearTimeout(refreshT.current);
    refreshT.current = setTimeout(() => router.refresh(), 250);
  }, [router]);
  useEffect(() => {
    const ch = sb.channel(`os-${os.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "service_order_records", filter: `service_order_id=eq.${os.id}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "service_orders", filter: `id=eq.${os.id}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "quote_item_done", filter: `service_order_id=eq.${os.id}` }, refresh)
      .subscribe();
    return () => { void sb.removeChannel(ch); };
  }, [sb, os.id, refresh]);

  // depois de criar um registro, leva o foco para a descrição dele (o mais novo fica em cima)
  useEffect(() => {
    if (!focar) return;
    const t = lista.current?.querySelector("textarea"); if (t) { t.focus(); setFocar(false); }
  }, [records, focar]);

  async function hist(text: string) {
    await sb.from("service_order_history").insert({ shop_id: shopId, service_order_id: os.id, text });
  }
  async function upd(patch: Record<string, unknown>) {
    const { error } = await sb.from("service_orders").update(patch).eq("id", os.id);
    if (error) { toast(errMsg(error), { err: true }); return false; }
    return true;
  }

  // ---------- status ----------
  async function setStatus(to: Status) {
    if (to === os.status) return;
    if (to === "finalizado") {
      if (!office) return toast(MSG_RECEBER, { err: true });
      setPaying(true); sfx("tap"); return;
    }
    if (os.status === "finalizado") return toast("O.S. finalizada só volta pelo Desfazer logo após o recebimento.", { err: true });
    const prev = os.status;
    if (!(await upd({ status: to }))) return;
    sfx("move");
    toast(`${os.plate} → ${ST_LABEL[to]}`, { undo: async () => { await upd({ status: prev }); router.refresh(); } });
    router.refresh();
  }

  // ---------- campos ----------
  async function salvarEntrada() {
    const iso = fromLocalInput(ent);
    if (!iso) { setEnt(toLocalInput(os.entered_at)); return; }
    if (iso === new Date(os.entered_at).toISOString()) return;
    if (await upd({ entered_at: iso })) router.refresh(); else setEnt(toLocalInput(os.entered_at));
  }
  async function salvarSaida() {
    const iso = fromLocalInput(sai);
    if (!iso && os.status === "finalizado") { setSai(toLocalInput(os.exited_at)); return toast("O.S. finalizada precisa ter data de saída.", { err: true }); }
    if ((iso ?? null) === (os.exited_at ? new Date(os.exited_at).toISOString() : null)) return;
    if (await upd({ exited_at: iso })) router.refresh(); else setSai(toLocalInput(os.exited_at));
  }
  async function salvarResp(v: string) {
    if (await upd({ technician_id: v || null })) router.refresh();
  }
  async function salvarDesc(v: string) {
    if (descTimer.current) { clearTimeout(descTimer.current); descTimer.current = null; }
    if (v === descSalvo.current) return;
    descSalvo.current = v;
    await upd({ service_description: v.trim() ? v : null });
  }
  function mudarDesc(v: string) {
    setDesc(v);
    if (descTimer.current) clearTimeout(descTimer.current);
    descTimer.current = setTimeout(() => void salvarDesc(v), 1200);
  }
  async function setTipo(k: string) {
    if (k === os.entry_type) return;
    if (!(await upd({ entry_type: k }))) return;
    await hist("Tipo alterado para " + TIPOS[k]);
    sfx("tap"); router.refresh();
  }

  // ---------- serviços a executar ----------
  const [feito, setFeito] = useState<Record<string, boolean>>({});
  useEffect(() => setFeito({}), [tasks]);
  async function marcar(t: OSTask, v: boolean) {
    setFeito(f => ({ ...f, [t.id]: v }));
    const { error } = await sb.rpc("set_task_done", { p_item: t.id, p_done: v });
    if (error) { setFeito(f => { const n = { ...f }; delete n[t.id]; return n; }); return toast(errMsg(error), { err: true }); }
    sfx(v ? "ok" : "tap");
    router.refresh();
  }

  // ---------- registros ----------
  async function enviar(fl: FileList | File[] | null, rapido = false) {
    const files = Array.from(fl ?? []).filter(f => /^(image|video)\//.test(f.type));
    if (!files.length) { if (fl && Array.from(fl).length) toast("Escolha fotos ou vídeos", { err: true }); return; }
    const tab = aba;
    setEnviando(n => n + files.length);
    let ok = 0;
    for (const f of files) {
      try { await addMediaRecord(sb, shopId, os.id, tab, f); ok++; }
      catch (e) { toast(errMsg(e as Error), { err: true }); }
      finally { setEnviando(n => n - 1); }
    }
    if (!ok) return;
    await hist(`${ok} mídia${ok > 1 ? "s" : ""} adicionada${ok > 1 ? "s" : ""} em ${ABA_NOME[tab]}`);
    sfx("cam");
    toast(`Salvo em ${ABA_NOME[tab]} — descreva ${ok > 1 ? "cada mídia" : "a mídia"}`);
    if (rapido) setFocar(true);
    router.refresh();
  }
  async function nota() {
    const { error } = await sb.from("service_order_records").insert({ shop_id: shopId, service_order_id: os.id, tab: aba, description: "" });
    if (error) return toast(errMsg(error), { err: true });
    await hist(`Novo registro em ${ABA_NOME[aba]}`);
    setFocar(true); router.refresh();
  }
  async function delRec(r: OSRecord) {
    const { error } = await sb.from("service_order_records").delete().eq("id", r.id);
    if (error) return toast(errMsg(error), { err: true });
    if (r.storage_path) await sb.storage.from(BUCKET).remove([r.storage_path]);
    setPend(null); toast("Registro removido"); router.refresh();
  }

  // ---------- fotos de entrada ----------
  async function trocarFoto(pos: string, f: File) {
    const atual = photos.find(p => p.position === pos);
    sfx("cam");
    try {
      const { path } = await uploadFile(sb, shopId, os.id, "entrada", f);
      const { error } = atual
        ? await sb.from("service_order_photos").update({ storage_path: path }).eq("id", atual.id)
        : await sb.from("service_order_photos").insert({ shop_id: shopId, service_order_id: os.id, position: pos, storage_path: path });
      if (error) { await sb.storage.from(BUCKET).remove([path]); throw error; }
      if (atual) await sb.storage.from(BUCKET).remove([atual.storage_path]);
      await hist("Foto de entrada atualizada");
      router.refresh();
    } catch (e) { toast(errMsg(e as Error), { err: true }); }
  }
  async function removerFoto(pos: string) {
    const atual = photos.find(p => p.position === pos); if (!atual) return;
    const { error } = await sb.from("service_order_photos").delete().eq("id", atual.id);
    if (error) return toast(errMsg(error), { err: true });
    await sb.storage.from(BUCKET).remove([atual.storage_path]);
    await hist("Foto de entrada removida");
    router.refresh();
  }

  // ---------- excluir O.S. (só master) ----------
  async function pedirExclusao() {
    setDelInfo(null);
    if (os.status === "finalizado") {
      const { data } = await sb.from("receipts").select("total").eq("service_order_id", os.id);
      const rec = ((data ?? []) as { total: number }[]).reduce((a, r) => a + Number(r.total), 0);
      setDelInfo(`Esta O.S. já foi finalizada: a entrada de ${brl(rec)} sai do Financeiro junto com as taxas e a comissão, e as peças cadastradas voltam ao estoque.`);
    }
    setPend("os-del");
  }
  async function excluirOS() {
    const paths = [...photos.map(p => p.storage_path), ...records.map(r => r.storage_path)].filter(Boolean) as string[];
    const { error } = await sb.from("service_orders").delete().eq("id", os.id);
    if (error) return toast(errMsg(error), { err: true });
    if (paths.length) await sb.storage.from(BUCKET).remove(paths);
    toast("O.S. excluída");
    router.push("/quadro"); router.refresh();
  }

  // ---------- acesso do cliente ----------
  const link = portalLink(os.portal_token, portalBase);
  const msg = msgOS({ make: os.make, model: os.model, plate: os.plate, number: os.number, customer_name: os.customer_name, link }, shopName);
  const wa = waURL(os.customer_phone, msg);

  const doTab = records.filter(r => r.tab === aba).slice().reverse();
  const cont = (k: string) => records.filter(r => r.tab === k).length;
  const fotoUrl = (k: string) => photos.find(p => p.position === k)?.url ?? null;
  const conferidos = ITENS_CK.filter(([k]) => os.checklist?.[k]).map(([, l]) => l).join(", ");
  const respOpts = techs;
  const fone = digits(os.customer_phone);
  const waOi = waURL(os.customer_phone, `Olá, ${primeiroNome(os.customer_name)}! Aqui é da ${shopName}.`);
  const naEtapa = os.status === "finalizado" ? 0 : (Date.now() - new Date(statusSince).getTime()) / 864e5;
  const qStatus = quote?.status ?? tasks[0]?.quote_status ?? null;

  return (
    <div className="stack">
      <section className="panel">
        <div className="os-head">
          <Plate p={os.plate} lg />
          <div className="info">
            <h1>{os.make} {os.model}</h1>
            <div className="muted">{os.year || "—"} · {os.color || "—"} · {os.km ? `${os.km} km` : "km não informado"} · combustível {os.fuel_level || "—"}</div>
            <div className="row" style={{ marginTop: 4 }}>
              <span className="chip">OS {os.number}</span>
              <span className={`chip t-${os.entry_type}`}><span className="dot" style={{ background: "currentColor" }} />{TIPOS[os.entry_type]}</span>
              <span className="chip">Entrada {dt(os.entered_at)}</span>
            </div>
            <div className="os-quick">
              <span className="oq-cli">
                <b>{os.customer_name || "Sem cliente"}</b>
                {office && fone && <a className="mono" href={`tel:+55${fone.replace(/^55/, "")}`} aria-label={`Ligar para ${os.customer_name}`}>{fmtFone(os.customer_phone)}</a>}
                {office && waOi && <a className="key sm" href={waOi} target="_blank" rel="noopener noreferrer">WhatsApp</a>}
              </span>
              {os.status === "finalizado"
                ? <span className="oq-st">Finalizada em <b className="mono">{dt(os.exited_at)}</b></span>
                : <span className={`oq-st ${naEtapa >= 3 ? "late" : ""}`} suppressHydrationWarning>
                    {ST_LABEL[os.status]} há <b className="mono" suppressHydrationWarning>{fmtDias(naEtapa) === "—" ? "menos de 1 h" : fmtDias(naEtapa)}</b>{naEtapa >= 3 ? " · parado" : ""}</span>}
              {office && <span className={`oq-orc ${qStatus === "aprovado" ? "ok" : qStatus === "recusado" ? "bad" : ""}`}>
                {qStatus ? <>Orçamento {ORC_ST[qStatus].toLowerCase()}{quote ? <> · <b className="mono">{brl(quote.total)}</b></> : null}</> : "Sem orçamento"}
              </span>}
            </div>
          </div>
          <div style={{ marginLeft: "auto" }} className="row">
            <Link className="key" href="/quadro">‹ Quadro</Link>
            <Link className="key accent" href={`/os/${os.id}/pasta`}>Imprimir pasta do cliente</Link>
          </div>
        </div>
        <div className="grid3" style={{ marginTop: 16 }}>
          <label className="field"><span className="label">Data de entrada</span>
            <input className="input mono" id="os-ent" type="datetime-local" value={ent} onChange={e => setEnt(e.target.value)} onBlur={() => void salvarEntrada()} /></label>
          <label className="field"><span className="label">Profissional responsável</span>
            <select className="input" id="os-resp" value={os.technician_id ?? ""} onChange={e => void salvarResp(e.target.value)}>
              <option value="">— definir —</option>
              {respOpts.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <span className="hint">A equipe é cadastrada em Configurações</span></label>
          <label className="field"><span className="label">Data de saída</span>
            <input className="input mono" id="os-sai" type="datetime-local" value={sai} onChange={e => setSai(e.target.value)} onBlur={() => void salvarSaida()} />
            <span className="hint">Preenchida sozinha ao marcar Finalizado</span></label>
        </div>
        <div style={{ marginTop: 14 }} className="stbar">
          {STATUSES.map(s => (
            <button type="button" key={s.id} className={`key ${os.status === s.id ? "on" : ""} ${s.id === "finalizado" ? "fin" : ""}`}
              aria-pressed={os.status === s.id} onClick={() => void setStatus(s.id)}>{s.label}</button>
          ))}
        </div>
      </section>

      <div className="split">
        <div className="stack" style={{ gap: 22 }}>
          <Tarefas tasks={tasks} feito={feito} osStatus={os.status} office={office} onMarcar={(t, v) => void marcar(t, v)}
            onEntrega={() => void setStatus("entrega")} />

          <section className="panel">
            <div className="ph"><h2>Descrição do serviço</h2>
              <span className="row"><span className="hint">Vai na primeira página da pasta do cliente</span>
                <MicButton onText={t => { const v = juntarDitado(descRef.current, t); descRef.current = v; setDesc(v); void salvarDesc(v); }} onInterim={setDescParcial} /></span></div>
            <textarea className="input" id="os-desc" style={{ minHeight: 96 }}
              placeholder="Ex.: Revisão dos 70 mil km com troca de óleo e filtros, substituição das bieletas dianteiras…"
              value={descParcial ? juntarDitado(desc, descParcial) : desc} onChange={e => mudarDesc(e.target.value)} onBlur={e => void salvarDesc(e.target.value)} />
          </section>

          <section className="panel">
            <div className="tabs" role="tablist">
              {ABAS.map(([a, l]) => (
                <button type="button" role="tab" aria-selected={aba === a} key={a} className={`key ${aba === a ? "accent" : ""}`}
                  onClick={() => { setAba(a); setPend(null); }}>{l} <span className="count">{cont(a)}</span></button>
              ))}
            </div>
            <label className={`drop ${over ? "over" : ""}`} id="drop"
              onDragOver={e => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
              onDrop={e => { e.preventDefault(); setOver(false); void enviar(e.dataTransfer.files); }}>
              {ICAM_DROP}
              <b>Adicionar fotos e vídeos em {ABA_NOME[aba]}</b>
              <span className="hint">{enviando ? `Enviando ${enviando} arquivo${enviando > 1 ? "s" : ""}…` : "Toque para escolher ou arraste os arquivos aqui. Depois descreva cada mídia."}</span>
              <input type="file" multiple accept="image/*,video/*" aria-label="Enviar mídias" onChange={e => { const f = Array.from(e.target.files ?? []); e.target.value = ""; void enviar(f); }} />
            </label>
            <div className="row" style={{ margin: "10px 0 14px" }}>
              <label className="key accent quick">{ICAMI}Foto rápida
                <input type="file" accept="image/*" capture="environment" aria-label="Tirar foto" onChange={e => { const f = Array.from(e.target.files ?? []); e.target.value = ""; void enviar(f, true); }} /></label>
              <label className="key quick">{IVIDEO}Vídeo rápido
                <input type="file" accept="video/*" capture="environment" aria-label="Gravar vídeo" onChange={e => { const f = Array.from(e.target.files ?? []); e.target.value = ""; void enviar(f, true); }} /></label>
              <button type="button" className="key sm" onClick={() => void nota()}>+ Registro só com texto</button>
            </div>
            <div className="media-list" ref={lista}>
              {doTab.length ? doTab.map(m => (
                <MediaItem key={m.id} m={m} pend={pend === m.id} onPend={v => setPend(v ? m.id : null)} onDelete={() => void delRec(m)}
                  onSave={async v => { const { error } = await sb.from("service_order_records").update({ description: v }).eq("id", m.id); if (error) toast(errMsg(error), { err: true }); }} />
              )) : <div className="empty">Nenhum registro em {ABA_NOME[aba]} ainda.</div>}
            </div>
          </section>
        </div>

        <aside className="stack">
          {office && <section className="panel">
            <div className="ph"><h2>Acesso do cliente</h2><span className="live"><span className="dot" />AO VIVO</span></div>
            <div className="stack" style={{ gap: 8 }}>
              <div className="hint">O cliente acompanha a O.S. pelo link, com fotos e orçamento. Senha: celular com DDD, só números{os.customer_phone ? ` (${digits(os.customer_phone)})` : ""}.</div>
              <div className="row">
                {wa
                  ? <a className="key wa" href={wa} target="_blank" rel="noopener noreferrer" onClick={() => { void hist("Link de acompanhamento enviado pelo WhatsApp").then(() => router.refresh()); }}>Enviar no WhatsApp</a>
                  : <span className="key wa" aria-disabled="true">Enviar no WhatsApp</span>}
                <button type="button" className="key" onClick={() => void copyText(link)} title={link}>Copiar link</button>
                <button type="button" className="key" onClick={() => void copyText(msg)}>Copiar mensagem</button>
              </div>
              <a className="key" href={`/c/${os.portal_token}`} target="_blank" rel="noopener noreferrer">Ver como o cliente vê</a>
            </div>
          </section>}

          {office && <section className="panel">
            <div className="ph"><h2>Orçamento</h2>
              {quote && <span className={`chip ${quote.status === "aprovado" ? "ok" : quote.status === "recusado" ? "bad" : ""}`}>{ORC_ST[quote.status]}</span>}</div>
            {quote ? (
              <>
                <div className="lcd total-lcd"><span className="lcd-msg">Orçamento nº {quote.number}</span><strong>{brl(quote.total)}</strong></div>
                <Link className="key" style={{ marginTop: 10, width: "100%" }} href={`/orcamentos/${quote.id}`}>Abrir orçamento</Link>
              </>
            ) : <a className="key accent" style={{ width: "100%" }} href={`/orcamentos/novo?os=${os.id}`}>Criar orçamento</a>}
          </section>}

          <section className="panel">
            <div className="ph"><h2>Fotos de entrada</h2></div>
            <div className="photos-mini">
              {FOTOS.map(([k, l]) => <PhotoSlot key={k} label={l} url={fotoUrl(k)} onFile={f => void trocarFoto(k, f)} onRemove={() => void removerFoto(k)} />)}
            </div>
            <div style={{ marginTop: 10 }} className="hint">Conferido: {conferidos || "nenhum item"}</div>
            {os.customer_complaint && <p style={{ margin: "8px 0 0" }}><span className="label">Relato</span><br />{os.customer_complaint}</p>}
            <div className="row" style={{ marginTop: 10 }}>
              <span className="label">Tipo</span>
              {Object.entries(TIPOS).map(([k, l]) => (
                <button type="button" key={k} className={`key sm ${os.entry_type === k ? "on" : ""}`} aria-pressed={os.entry_type === k} onClick={() => void setTipo(k)}>{l}</button>
              ))}
            </div>
          </section>

          <section className="panel">
            <div className="ph"><h2>Histórico</h2></div>
            <div className="timeline">
              {history.slice().reverse().map(h => (
                <div className="tl" key={h.id}><time>{dt(h.created_at)}</time>
                  <span>{h.text}{h.created_by_name && <small className="tl-por">{h.created_by_name}</small>}</span></div>
              ))}
            </div>
          </section>

          {podeExcluir && <section className="panel flat">
            {pend === "os-del"
              ? <div className="stack" style={{ gap: 8 }}>
                  <span>Excluir esta O.S. com fotos, registros, histórico{quote ? ` e o orçamento nº ${quote.number}` : ""}? Não dá para desfazer.</span>
                  {delInfo && <span className="hint" style={{ color: "var(--danger)" }}>{delInfo}</span>}
                  <div className="row">
                    <button type="button" className="key danger sm" onClick={() => void excluirOS()}>Excluir O.S.</button>
                    <button type="button" className="key sm" onClick={() => setPend(null)}>Cancelar</button>
                  </div></div>
              : <button type="button" className="key sm" onClick={() => void pedirExclusao()}>Excluir O.S.</button>}
          </section>}
        </aside>
      </div>

      {paying && (
        <PaymentModal os={{ id: os.id, number: os.number, plate: os.plate, make: os.make, model: os.model, customer_name: os.customer_name, total, status: os.status }}
          fees={fees} hasPassword={hasPassword} onClose={() => setPaying(false)}
          onDone={(prev) => {
            setPaying(false);
            router.refresh();
            toast(`${os.plate} → Finalizado · pagamento registrado`, fin ? {
              undo: async () => {
                const { error } = await sb.rpc("undo_receipt", { p_os: os.id, p_previous_status: prev });
                if (error) toast(errMsg(error), { err: true }); router.refresh();
              },
            } : {});
          }} />
      )}
    </div>
  );
}

function MediaItem({ m, pend, onPend, onDelete, onSave }: {
  m: OSRecord; pend: boolean; onPend: (v: boolean) => void; onDelete: () => void; onSave: (v: string) => Promise<void>;
}) {
  const [v, setV] = useState(m.description ?? "");
  const [parcial, setParcial] = useState("");
  const salvo = useRef(m.description ?? "");
  const vRef = useRef(v); vRef.current = v;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isV = (m.mime ?? "").startsWith("video");
  useEffect(() => {   // atualização vinda de outro usuário (sem edição pendente aqui)
    if (v === salvo.current && (m.description ?? "") !== salvo.current) { salvo.current = m.description ?? ""; setV(salvo.current); }
  }, [m.description]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  async function salvar(x: string) {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    if (x === salvo.current) return;
    salvo.current = x; await onSave(x);
  }
  function mudar(x: string) {
    setV(x);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void salvar(x), 1200);
  }

  const tipo = m.storage_path ? (isV ? "gravação" : "foto") : "anotação";
  return (
    <div className="mi">
      <div className={`pv ${m.storage_path ? "" : "note"}`}>
        {!m.storage_path ? "TEXTO"
          : !m.url ? <span className="mono" style={{ color: "#fff", fontSize: "9pt" }}>SEM PRÉVIA</span>
          : isV ? <video src={m.url} controls playsInline preload="metadata" />
          : <a href={m.url} target="_blank" rel="noopener noreferrer" style={{ display: "contents" }}><img src={m.url} alt={m.description || "Foto do registro"} /></a>}
      </div>
      <div className="body">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <span className="label">{dt(m.created_at)}{m.file_name ? " · " + m.file_name : ""}</span>
          <span className="row">
            <MicButton onText={t => { const x = juntarDitado(vRef.current, t); vRef.current = x; setV(x); void salvar(x); }} onInterim={setParcial} />
            {pend
              ? <span className="row"><button type="button" className="key danger sm" onClick={onDelete}>Remover</button>
                  <button type="button" className="key sm" onClick={() => onPend(false)}>Cancelar</button></span>
              : <button type="button" className="del" aria-label="Remover registro" onClick={() => onPend(true)}>×</button>}
          </span>
        </div>
        <textarea className="input" placeholder={`Descreva o que aparece nesta ${tipo}…`}
          value={parcial ? juntarDitado(v, parcial) : v} onChange={e => mudar(e.target.value)} onBlur={e => void salvar(e.target.value)} />
      </div>
    </div>
  );
}

const EM_ANDAMENTO: Status[] = ["aprovado", "pecas", "servico"];

/** Itens do orçamento ativo sem valores, com a marcação de feito (todos os perfis). */
function Tarefas({ tasks, feito, osStatus, office, onMarcar, onEntrega }: {
  tasks: OSTask[]; feito: Record<string, boolean>; osStatus: Status; office: boolean;
  onMarcar: (t: OSTask, v: boolean) => void; onEntrega: () => void;
}) {
  const aprovado = tasks[0]?.quote_status === "aprovado", fechada = osStatus === "finalizado";
  const pode = aprovado && !fechada;
  const ok = (t: OSTask) => feito[t.id] ?? !!t.done_at;
  const nOk = tasks.filter(ok).length;
  const grupos: [string, OSTask[]][] = [["Peças", tasks.filter(t => t.kind === "peca")], ["Mão de obra", tasks.filter(t => t.kind === "mao")]];
  let n = 0;
  return (
    <section className={`panel tasks ${pode ? "" : "off"}`} aria-labelledby="tk-t">
      <div className="ph">
        <div><h2 id="tk-t">Serviços a executar</h2>
          <p className="hint" style={{ margin: "4px 0 0" }}>
            {!tasks.length ? "Itens do orçamento, sem valores"
              : !aprovado ? "Aguardando aprovação do cliente: ainda não comece"
              : fechada ? "O.S. finalizada"
              : "Marque cada item quando terminar"}</p></div>
        {tasks.length > 0 && <div className="tk-prog" aria-label={`${nOk} de ${tasks.length} feitos`}>
          <b className="mono">{nOk}/{tasks.length}</b><span className="meter"><span style={{ width: `${nOk / tasks.length * 100}%` }} /></span></div>}
      </div>
      {!tasks.length
        ? <div className="empty">{office ? "Esta O.S. ainda não tem orçamento. Os itens aparecem aqui assim que ele for criado." : "O escritório ainda não montou o orçamento desta O.S."}</div>
        : grupos.filter(([, l]) => l.length).map(([g, l]) => (
          <div className="tk-g" key={g}>
            <span className="label">{g} · {l.length}</span>
            {l.map(t => { n++; const v = ok(t); return (
              <label className={`tk ${v ? "done" : ""}`} key={t.id}>
                <input type="checkbox" checked={v} disabled={!pode} onChange={e => onMarcar(t, e.target.checked)} />
                <span className="tk-n mono">{n}</span>
                <span className="tk-d"><b>{t.description || "Item sem descrição"}</b>
                  {t.details && <small>{t.details}</small>}
                  {v && t.done_at && <small className="tk-by">Feito {t.done_by_name ? `por ${primeiroNome(t.done_by_name)} ` : ""}em {dt(t.done_at)}</small>}</span>
                <span className="tk-q mono">{String(t.qty).replace(".", ",")}</span>
              </label>
            ); })}
          </div>
        ))}
      {pode && tasks.length > 0 && nOk === tasks.length && EM_ANDAMENTO.includes(osStatus) && (
        <div className="tk-fim"><span>Tudo feito.</span>
          <button type="button" className="key accent sm" onClick={onEntrega}>Mover para Esperando entrega</button></div>
      )}
    </section>
  );
}
