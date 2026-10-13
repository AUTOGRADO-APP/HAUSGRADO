"use client";
// Nova O.S. / checklist de entrada (seção 7.4). Visual e textos do protótipo (vEntrada).
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client.ts";
import { FOTOS, ITENS_CK, NIVEIS, TIPOS, dataBR, digits, fmtFone, normPlaca, placaOk } from "@/lib/labels.ts";
import { uploadFile } from "@/lib/media.ts";
import { errMsg, sfx, toast } from "@/lib/ui.ts";
import { MicButton, juntarDitado } from "@/components/MicButton.tsx";
import { PhotoSlot } from "@/components/os-slot.tsx";

export interface NovaCliente { id: string; name: string; phone: string }
export interface NovaAgenda { id: string; date: string; time: string; customer_id: string; plate: string | null; reason: string | null; status: string }
export interface NovaVeiculo { plate: string; customer_id: string | null; make: string | null; model: string | null; year: string | null; color: string | null; fuel: string | null }

type Lk = "idle" | "busy" | "ok" | "nf" | "err";
interface Draft {
  placa: string; marca: string; modelo: string; ano: string; cor: string; combustivel: string; km: string; nivel: string;
  clienteId: string; novoNome: string; novoTel: string; tipo: string; checklist: Record<string, boolean>; obs: string;
}
const VCAMPOS: [keyof Draft, string][] = [["marca", "Marca"], ["modelo", "Modelo"], ["ano", "Ano fab./mod."], ["cor", "Cor"], ["combustivel", "Combustível"], ["km", "Quilometragem"]];

function novoDraft(clienteId = "", ag?: NovaAgenda | null, v?: NovaVeiculo | null): Draft {
  return {
    placa: normPlaca(ag?.plate || ""), marca: v?.make || "", modelo: v?.model || "", ano: v?.year || "", cor: v?.color || "", combustivel: v?.fuel || "",
    km: "", nivel: "1/2", clienteId, novoNome: "", novoTel: "", tipo: "servico",
    checklist: Object.fromEntries(ITENS_CK.map(([k]) => [k, false])), obs: ag?.reason || "",
  };
}

export function NovaOS({ shopId, clientes, agenda, veiculo, clienteInicial }: {
  shopId: string; clientes: NovaCliente[]; agenda: NovaAgenda | null; veiculo: NovaVeiculo | null; clienteInicial: string;
}) {
  const sb = useMemo(() => createClient(), []);
  const router = useRouter();
  const [d, setD] = useState<Draft>(() => novoDraft(clienteInicial, agenda, veiculo));
  const [lk, setLk] = useState<Lk>(veiculo?.model ? "ok" : "idle");
  const [lkMsg, setLkMsg] = useState(veiculo?.model ? `VEÍCULO JÁ CADASTRADO: ${veiculo.make || ""} ${veiculo.model}`.toUpperCase() : "");
  const [fotos, setFotos] = useState<Record<string, { file: File; url: string }>>({});
  const [parcial, setParcial] = useState("");
  const [busy, setBusy] = useState(false);
  const checado = useRef("");
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD(x => ({ ...x, [k]: v }));

  // libera as prévias locais ao sair
  const fotosRef = useRef(fotos); fotosRef.current = fotos;
  useEffect(() => () => { Object.values(fotosRef.current).forEach(f => URL.revokeObjectURL(f.url)); }, []);

  const ordenados = useMemo(() => clientes.slice().sort((a, b) => a.name.localeCompare(b.name, "pt-BR")), [clientes]);
  const [agOn, setAgOn] = useState(!!agenda);
  const agd = agOn ? agenda : null;

  /** Placa já no pátio? Veículo conhecido? (sugere o cliente e completa os dados) */
  async function conferirPlaca(placa: string): Promise<NovaVeiculo | null> {
    const [{ data: v }, { data: abertas }] = await Promise.all([
      sb.from("vehicles").select("plate, customer_id, make, model, year, color, fuel").eq("plate", placa).maybeSingle(),
      sb.from("service_orders").select("number").eq("plate", placa).neq("status", "finalizado").limit(1),
    ]);
    if (checado.current !== placa) {
      checado.current = placa;
      const ab = (abertas ?? [])[0] as { number: number } | undefined;
      if (ab) toast(`Atenção: ${placa} já está no pátio (OS ${ab.number})`, { err: true });
    }
    const ve = (v as NovaVeiculo | null) ?? null;
    if (ve) setD(x => ({
      ...x,
      clienteId: x.clienteId || ve.customer_id || "",
      marca: x.marca || ve.make || "", modelo: x.modelo || ve.model || "", ano: x.ano || ve.year || "",
      cor: x.cor || ve.color || "", combustivel: x.combustivel || ve.fuel || "",
    }));
    return ve;
  }

  async function consultar() {
    const placa = normPlaca(d.placa); set("placa", placa);
    if (!placaOk(placa)) { setLk("err"); setLkMsg("PLACA INVÁLIDA (ABC1234 OU ABC1D23)"); sfx("err"); return; }
    setLk("busy");
    const ve = await conferirPlaca(placa).catch(() => null);
    if (ve?.model) { setLk("ok"); setLkMsg(`VEÍCULO JÁ CADASTRADO: ${ve.make || ""} ${ve.model} ${ve.year || ""}`.trim().toUpperCase()); return; }
    const { data, error } = await sb.functions.invoke("plate-lookup", { body: { plate: placa } });
    if (error || !data || (data as { error?: string }).error) {
      let m = (data as { error?: string } | null)?.error || "";
      if (!m) { try { const j = await (error as { context?: Response })?.context?.json(); m = j?.error || ""; } catch { /* sem corpo */ } }
      setLk("nf"); setLkMsg((m || "Placa não encontrada. Preencha manualmente.").replace(/\.$/, "").toUpperCase());
      return;
    }
    const v = data as { make?: string | null; model?: string | null; year?: string | null; color?: string | null; fuel?: string | null };
    setD(x => ({ ...x, marca: v.make || x.marca, modelo: v.model || x.modelo, ano: v.year || x.ano, cor: v.color || x.cor, combustivel: v.fuel || x.combustivel }));
    setLk("ok"); setLkMsg(`OK: ${v.make || ""} ${v.model || ""} ${v.year || ""}`.replace(/\s+/g, " ").trim().toUpperCase());
    sfx("ok");
  }

  function setFoto(k: string, f: File | null) {
    setFotos(fs => {
      const n = { ...fs };
      if (n[k]) URL.revokeObjectURL(n[k].url);
      if (f) n[k] = { file: f, url: URL.createObjectURL(f) }; else delete n[k];
      return n;
    });
    if (f) sfx("cam");
  }

  function limpar() {
    Object.values(fotos).forEach(f => URL.revokeObjectURL(f.url));
    setFotos({}); setD(novoDraft()); setAgOn(false); setLk("idle"); setLkMsg(""); checado.current = "";
  }

  async function abrir() {
    if (busy) return;
    const placa = normPlaca(d.placa);
    if (!placaOk(placa)) return toast("Informe uma placa válida");
    if (!d.modelo.trim()) return toast("Preencha o modelo do veículo");
    let cid = d.clienteId;
    let tel = digits(d.novoTel); if (tel.length > 11 && tel.startsWith("55")) tel = tel.slice(2);
    if (cid === "__novo" && (!d.novoNome.trim() || tel.length < 10 || tel.length > 11)) return toast("Informe nome e celular com DDD do cliente");
    if (!cid) return toast("Selecione o cliente");
    setBusy(true);
    try {
      if (cid === "__novo") {
        const { data, error } = await sb.from("customers").insert({ shop_id: shopId, name: d.novoNome.trim(), phone: tel }).select("id").single();
        if (error) throw error;
        cid = data.id as string;
      }
      const veh = { make: d.marca.trim() || null, model: d.modelo.trim() || null, year: d.ano.trim() || null, color: d.cor.trim() || null, fuel: d.combustivel.trim() || null };
      const { data: v, error: ev } = await sb.from("vehicles")
        .upsert({ shop_id: shopId, plate: placa, customer_id: cid, ...veh }, { onConflict: "shop_id,plate" }).select("id").single();
      if (ev) throw ev;
      const { data: os, error: eo } = await sb.from("service_orders").insert({
        shop_id: shopId, vehicle_id: v.id, customer_id: cid, plate: placa, ...veh,
        km: d.km.trim() || null, fuel_level: d.nivel, entry_type: d.tipo, status: "orcamento",
        customer_complaint: d.obs.trim() || null, checklist: d.checklist,
        appointment_id: agd?.id ?? null,
      }).select("id, number").single();
      if (eo) throw eo;
      const osId = os.id as string;

      // fotos de entrada
      let falhas = 0;
      for (const [pos, f] of Object.entries(fotos)) {
        try {
          const { path } = await uploadFile(sb, shopId, osId, "entrada", f.file);
          const { error } = await sb.from("service_order_photos").insert({ shop_id: shopId, service_order_id: osId, position: pos, storage_path: path });
          if (error) { await sb.storage.from("os-media").remove([path]); throw error; }
        } catch { falhas++; }
      }

      if (agd) {
        await sb.from("appointments").update({ status: "atendido", service_order_id: osId }).eq("id", agd.id);
        await sb.from("service_order_history").insert({ shop_id: shopId, service_order_id: osId, text: `Aberta pelo agendamento de ${dataBR(agd.date)} às ${agd.time.slice(0, 5)}` });
      }

      Object.values(fotos).forEach(f => URL.revokeObjectURL(f.url));
      toast(`Checklist aberto · OS ${os.number}`, { sound: "ok" });
      if (falhas) setTimeout(() => toast(`${falhas} foto${falhas > 1 ? "s" : ""} de entrada não ${falhas > 1 ? "foram enviadas" : "foi enviada"}. Envie de novo na O.S.`, { err: true }), 3600);
      router.push(`/os/${osId}`);
      router.refresh();
    } catch (e) {
      toast(errMsg(e as Error), { err: true });
      setBusy(false);
    }
  }

  const lcdTxt = { idle: "DIGITE A PLACA E CONSULTE", busy: "CONSULTANDO BASE...", ok: lkMsg, nf: lkMsg, err: lkMsg }[lk];
  const lcdCls = lk === "ok" ? "ok" : lk === "nf" || lk === "err" ? "err" : lk === "busy" ? "busy" : "";

  return (
    <>
      {agd && (
        <div className="banner" style={{ marginBottom: 22 }}>
          <span>Entrada do agendamento de <b>{dataBR(agd.date)} às {agd.time.slice(0, 5)}</b>. Ao abrir o checklist, o agendamento fica ligado a esta O.S.</span>
        </div>
      )}
      <div className="split">
        <div className="stack">
          <section className="panel">
            <div className="ph"><h2>Veículo</h2><span className="hint">Formatos aceitos: ABC1234 ou ABC1D23</span></div>
            <div className="row" style={{ alignItems: "stretch", gap: 12 }}>
              <label className="plate-input"><i>BRASIL</i>
                <input id="placa" maxLength={8} placeholder="ABC1D23" value={d.placa} aria-label="Placa" autoComplete="off"
                  onChange={e => set("placa", normPlaca(e.target.value))}
                  onBlur={() => { const p = normPlaca(d.placa); if (placaOk(p)) void conferirPlaca(p); }}
                  onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); void consultar(); } }} />
              </label>
              <div className="stack" style={{ flex: 1, minWidth: 200, gap: 8 }}>
                <div className={`lcd lcd-msg ${lcdCls}`} id="lk-lcd" role="status">{lcdTxt}</div>
                <button type="button" className="key accent" onClick={() => void consultar()} disabled={lk === "busy"}>Consultar placa</button>
              </div>
            </div>
            <div className="grid3" style={{ marginTop: 14 }}>
              {VCAMPOS.map(([k, l]) => (
                <label className="field" key={k}><span className="label">{l}</span>
                  <input className="input" id={`d-${k}`} value={d[k] as string} inputMode={k === "km" ? "numeric" : undefined}
                    onChange={e => set(k, e.target.value as never)} /></label>
              ))}
              <label className="field"><span className="label">Nível de combustível</span>
                <select className="input" id="d-nivel" value={d.nivel} onChange={e => set("nivel", e.target.value)}>
                  {NIVEIS.map(n => <option key={n}>{n}</option>)}
                </select></label>
            </div>
          </section>

          <section className="panel">
            <div className="ph"><h2>Fotos de entrada</h2><span className="hint">Toque em cada quadro para fotografar ou escolher a imagem</span></div>
            <div className="slots">
              {FOTOS.map(([k, l]) => <PhotoSlot key={k} label={l} url={fotos[k]?.url} onFile={f => setFoto(k, f)} onRemove={() => setFoto(k, null)} />)}
            </div>
          </section>

          <section className="panel">
            <div className="ph"><h2>Tipo de entrada</h2></div>
            <div className="tipos">
              {Object.entries(TIPOS).map(([k, l]) => <button type="button" key={k} className={`key ${d.tipo === k ? "accent" : ""}`} aria-pressed={d.tipo === k} onClick={() => set("tipo", k)}>{l}</button>)}
            </div>
            <div style={{ marginTop: 14 }} className="label">Itens conferidos</div>
            <div className="checks" style={{ marginTop: 6 }}>
              {ITENS_CK.map(([k, l]) => (
                <label key={k}><input type="checkbox" id={`ck-${k}`} checked={!!d.checklist[k]}
                  onChange={e => setD(x => ({ ...x, checklist: { ...x.checklist, [k]: e.target.checked } }))} /> {l}</label>
              ))}
            </div>
            <label className="field" style={{ marginTop: 12 }}>
              <span className="row" style={{ justifyContent: "space-between" }}><span className="label">Relato do cliente / observações</span>
                <MicButton onText={t => setD(x => ({ ...x, obs: juntarDitado(x.obs, t) }))} onInterim={setParcial} /></span>
              <textarea className="input" id="d-obs" placeholder="Ex.: barulho ao frear, luz da injeção acesa…"
                value={parcial ? juntarDitado(d.obs, parcial) : d.obs} onChange={e => set("obs", e.target.value)} />
            </label>
            <p className="hint" style={{ margin: "10px 0 0" }}>Os dados do cliente, as fotos e o relato são usados só para o atendimento deste veículo (LGPD).</p>
          </section>
        </div>

        <aside className="stack sticky">
          <section className="panel">
            <div className="ph"><h2>Cliente</h2></div>
            <label className="field"><span className="label">Selecionar</span>
              <select className="input" id="d-cli" value={d.clienteId} onChange={e => set("clienteId", e.target.value)}>
                <option value="">— escolha —</option>
                <option value="__novo">+ Cadastrar novo cliente</option>
                {ordenados.map(c => <option key={c.id} value={c.id}>{c.name} · {fmtFone(c.phone)}</option>)}
              </select></label>
            {d.clienteId === "__novo" && (
              <div className="stack" style={{ marginTop: 10 }}>
                <label className="field"><span className="label">Nome</span>
                  <input className="input" id="dn-nome" value={d.novoNome} onChange={e => set("novoNome", e.target.value)} autoComplete="off" /></label>
                <label className="field"><span className="label">Celular (WhatsApp)</span>
                  <input className="input" id="dn-tel" inputMode="tel" placeholder="(61) 98765-4321" value={fmtFone(d.novoTel)}
                    onChange={e => set("novoTel", digits(e.target.value))} autoComplete="off" /></label>
              </div>
            )}
          </section>
          <section className="panel"><div className="stack">
            <button type="button" className="key accent" style={{ padding: 14 }} onClick={() => void abrir()} disabled={busy}>{busy ? "Abrindo…" : "Abrir checklist"}</button>
            <button type="button" className="key" onClick={limpar} disabled={busy}>Limpar formulário</button>
            <p className="hint" style={{ margin: 0 }}>Ao abrir, o carro entra no quadro na coluna <b>Orçamento</b> e você já pode registrar avarias e serviços com fotos e vídeos.</p>
          </div></section>
        </aside>
      </div>
    </>
  );
}
