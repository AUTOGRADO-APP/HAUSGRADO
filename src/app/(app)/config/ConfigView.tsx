"use client";
// Configurações (vConfig + vUsuarios do protótipo). Só master.
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client.ts";
import { PAPEIS, dt, iniciais, parseNum } from "@/lib/labels.ts";
import { errMsg, sfx, toast } from "@/lib/ui.ts";
import type { Role } from "@/lib/rules.ts";
import { createUser, setActive, setPassword, setRole, type Res } from "./actions.ts";

export interface CfgShop {
  id: string; name: string; portal_base_url: string | null; plate_api_provider: string | null;
  commission_pct: number; min_part_margin_pct: number; fee_debit_pct: number; fee_pix_pct: number; fee_credit_pct: number[];
}
export interface CfgUser { id: string; full_name: string; username: string; role: Role; active: boolean }
export interface CfgTech { id: string; name: string; active: boolean }
export interface PwStatus { active: boolean; set_at: string | null; set_by: string | null }

const numTxt = (v: number) => String(v ?? 0).replace(".", ",");

export function ConfigView({ meId, shop, users, techs, pw, canManageUsers }: {
  meId: string; shop: CfgShop; users: CfgUser[]; techs: CfgTech[]; pw: PwStatus | null; canManageUsers: boolean;
}) {
  const sb = createClient();
  const router = useRouter();
  const [pending, start] = useTransition();

  // ---------- oficina / placa / comissão / taxas (salvam ao sair do campo) ----------
  const [of, setOf] = useState({
    name: shop.name ?? "", portal_base_url: shop.portal_base_url ?? "", plate_api_provider: shop.plate_api_provider ?? "",
    commission_pct: numTxt(shop.commission_pct), min_part_margin_pct: numTxt(shop.min_part_margin_pct), fee_debit_pct: numTxt(shop.fee_debit_pct), fee_pix_pct: numTxt(shop.fee_pix_pct),
  });
  const [cred, setCred] = useState(shop.fee_credit_pct.map(numTxt));
  useEffect(() => {
    setOf({
      name: shop.name ?? "", portal_base_url: shop.portal_base_url ?? "", plate_api_provider: shop.plate_api_provider ?? "",
      commission_pct: numTxt(shop.commission_pct), min_part_margin_pct: numTxt(shop.min_part_margin_pct), fee_debit_pct: numTxt(shop.fee_debit_pct), fee_pix_pct: numTxt(shop.fee_pix_pct),
    });
    setCred(shop.fee_credit_pct.map(numTxt));
  }, [shop]);

  async function saveShop(patch: Partial<Record<keyof CfgShop, unknown>>) {
    const { error } = await sb.from("shops").update(patch).eq("id", shop.id);
    if (error) { toast(errMsg(error), { err: true }); return; }
    toast("Configuração salva", { sound: "ok" });
    router.refresh();
  }
  function saveText(k: "name" | "portal_base_url" | "plate_api_provider") {
    const v = of[k].trim();
    if (k === "name" && !v) { toast("Informe o nome da oficina.", { err: true }); setOf(o => ({ ...o, name: shop.name })); return; }
    if (v === (shop[k] ?? "")) return;
    void saveShop({ [k]: v || null });
  }
  function savePct(k: "commission_pct" | "min_part_margin_pct" | "fee_debit_pct" | "fee_pix_pct") {
    const n = parseNum(of[k]);
    const max = k === "min_part_margin_pct" ? 999 : 100;
    if (!(n >= 0 && n <= max)) { toast(k === "min_part_margin_pct" ? "Informe uma margem entre 0 e 999%." : "Informe um percentual entre 0 e 100.", { err: true }); setOf(o => ({ ...o, [k]: numTxt(shop[k]) })); return; }
    if (n === shop[k]) return;
    void saveShop({ [k]: n });
  }
  function saveCred(i: number) {
    const n = parseNum(cred[i]);
    if (!(n >= 0 && n <= 100)) { toast("Informe um percentual entre 0 e 100.", { err: true }); setCred(c => c.map((x, j) => (j === i ? numTxt(shop.fee_credit_pct[i]) : x))); return; }
    if (n === shop.fee_credit_pct[i]) return;
    void saveShop({ fee_credit_pct: shop.fee_credit_pct.map((x, j) => (j === i ? n : x)) });
  }

  // ---------- senha de desconto ----------
  const [sdNova, setSdNova] = useState(""), [sdConf, setSdConf] = useState("");
  async function salvarSenha() {
    if (sdNova.length < 4) return toast("Senha: mínimo de 4 caracteres.", { err: true });
    if (sdNova !== sdConf) return toast("Senha e confirmação não conferem.", { err: true });
    const { error } = await sb.rpc("set_discount_password", { p_password: sdNova });
    if (error) return toast(errMsg(error), { err: true });
    setSdNova(""); setSdConf("");
    toast(pw?.active ? "Senha de autorização trocada" : "Senha de autorização criada", { sound: "ok" });
    router.refresh();
  }

  // ---------- equipe ----------
  const [eqNovo, setEqNovo] = useState("");
  async function addTech() {
    const n = eqNovo.trim();
    if (!n) return toast("Informe o nome do profissional.", { err: true });
    if (techs.some(t => t.name.toLowerCase() === n.toLowerCase())) return toast("Esse nome já está na equipe.", { err: true });
    const { error } = await sb.from("technicians").insert({ name: n });
    if (error) return toast(errMsg(error), { err: true });
    setEqNovo(""); toast(`${n} adicionado à equipe`, { sound: "ok" }); router.refresh();
  }
  async function delTech(t: CfgTech) {
    // desativa (as O.S. antigas continuam apontando para o profissional)
    const { error } = await sb.from("technicians").update({ active: false }).eq("id", t.id);
    if (error) return toast(errMsg(error), { err: true });
    toast(`${t.name} removido da equipe`, {
      undo: async () => { await sb.from("technicians").update({ active: true }).eq("id", t.id); router.refresh(); },
    });
    router.refresh();
  }

  // ---------- usuários ----------
  const [nu, setNu] = useState({ nome: "", usuario: "", senha: "", papel: "atendente" });
  const [resetId, setResetId] = useState(""), [resetSenha, setResetSenha] = useState("");
  const run = (p: Promise<Res>, ok: string, after?: () => void) => start(async () => {
    const r = await p;
    if (!r.ok) { toast(r.error, { err: true }); router.refresh(); return; }
    after?.(); toast(ok, { sound: "ok" }); router.refresh();
  });

  const dis = !canManageUsers || pending;

  return (
    <div className="grid2">
      <section className="panel" style={{ gridColumn: "1/-1" }}>
        <div className="ph"><h2>Usuários e acessos</h2><span className="hint">Master: tudo · Administrador: tudo menos Configurações · Atendente: sem Configurações, Gestão e Comissões</span></div>
        {!canManageUsers && <div className="banner" style={{ marginBottom: 12 }}><span>Este deploy não tem a SUPABASE_SERVICE_ROLE_KEY. Na Vercel, confira se a variável está marcada para Production e faça um Redeploy do último deploy.</span></div>}
        <div className="tbl-wrap"><table>
          <thead><tr><th>Nome</th><th>Usuário</th><th>Perfil</th><th>Situação</th><th></th></tr></thead>
          <tbody>{users.map(u => {
            const eu = u.id === meId;
            return (
              <tr key={u.id}>
                <td><span className="row" style={{ flexWrap: "nowrap" }}><span className="avatar">{iniciais(u.full_name)}</span><b>{u.full_name}</b>{eu && <span className="chip">você</span>}</span></td>
                <td className="mono">{u.username}</td>
                <td><select className="input" style={{ minWidth: 150 }} value={u.role} disabled={eu || dis} aria-label={`Perfil de ${u.full_name}`}
                  onChange={e => run(setRole(u.id, e.target.value), `Perfil de ${u.full_name}: ${PAPEIS[e.target.value as Role]}`)}>
                  {Object.entries(PAPEIS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select></td>
                <td>{u.active ? <span className="chip ok">Ativo</span> : <span className="chip bad">Bloqueado</span>}</td>
                <td><div className="row" style={{ justifyContent: "flex-end", flexWrap: "nowrap" }}>
                  {resetId === u.id ? <>
                    <input className="input" style={{ width: 150 }} type="text" placeholder="nova senha" autoComplete="off" autoFocus
                      value={resetSenha} onChange={e => setResetSenha(e.target.value)} />
                    <button className="key sm accent" aria-disabled={dis || undefined}
                      onClick={() => run(setPassword(u.id, resetSenha), `Senha de ${u.full_name} trocada`, () => { setResetId(""); setResetSenha(""); })}>Salvar</button>
                    <button className="key sm" onClick={() => { setResetId(""); setResetSenha(""); }}>Cancelar</button>
                  </> : <>
                    <button className="key sm" aria-disabled={dis || undefined} onClick={() => { setResetId(u.id); setResetSenha(""); }}>Trocar senha</button>
                    {!eu && <button className="key sm" aria-disabled={dis || undefined}
                      onClick={() => run(setActive(u.id, !u.active), `${u.full_name} ${u.active ? "bloqueado" : "ativado"}`)}>{u.active ? "Bloquear" : "Ativar"}</button>}
                  </>}
                </div></td>
              </tr>
            );
          })}</tbody>
        </table></div>
        <div className="label" style={{ marginTop: 16 }}>Novo usuário</div>
        <form className="grid-user" style={{ marginTop: 6 }} onSubmit={e => {
          e.preventDefault(); if (dis) return;
          run(createUser(nu), `Usuário ${nu.usuario.trim().toLowerCase()} criado`, () => setNu({ nome: "", usuario: "", senha: "", papel: "atendente" }));
        }}>
          <input className="input" placeholder="Nome completo" aria-label="Nome completo" value={nu.nome} disabled={!canManageUsers} onChange={e => setNu({ ...nu, nome: e.target.value })} />
          <input className="input mono" placeholder="usuário" aria-label="Usuário" autoComplete="off" value={nu.usuario} disabled={!canManageUsers}
            onChange={e => setNu({ ...nu, usuario: e.target.value.toLowerCase().replace(/\s/g, "") })} />
          <input className="input" placeholder="senha (mín. 6)" aria-label="Senha" type="text" autoComplete="off" value={nu.senha} disabled={!canManageUsers} onChange={e => setNu({ ...nu, senha: e.target.value })} />
          <select className="input" aria-label="Perfil" value={nu.papel} disabled={!canManageUsers} onChange={e => setNu({ ...nu, papel: e.target.value })}>
            {Object.entries(PAPEIS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <button className="key accent" type="submit" aria-disabled={dis || undefined}>Criar usuário</button>
        </form>
      </section>

      <section className="panel"><div className="ph"><h2>Oficina</h2></div><div className="stack">
        <label className="field"><span className="label">Nome da oficina</span>
          <input className="input" value={of.name} onChange={e => setOf({ ...of, name: e.target.value })} onBlur={() => saveText("name")} /></label>
        <label className="field"><span className="label">Endereço do link do cliente</span>
          <input className="input" value={of.portal_base_url} placeholder="https://acompanhe.autogrado.com.br" onChange={e => setOf({ ...of, portal_base_url: e.target.value })} onBlur={() => saveText("portal_base_url")} />
          <span className="hint">Domínio usado nos links enviados ao cliente. Em branco, usa o endereço deste site.</span></label>
      </div></section>

      <section className="panel"><div className="ph"><h2>Consulta de placa</h2></div><div className="stack">
        <label className="field"><span className="label">Provedor da API</span>
          <input className="input" value={of.plate_api_provider} placeholder="Ex.: API Placas, WDAPI, Placa Fipe…" onChange={e => setOf({ ...of, plate_api_provider: e.target.value })} onBlur={() => saveText("plate_api_provider")} /></label>
        <p className="hint" style={{ margin: 0 }}>O token de acesso fica guardado como segredo da Edge Function plate-lookup no Supabase, nunca no navegador.</p>
      </div></section>

      <section className="panel"><div className="ph"><h2>Senha de autorização de desconto</h2>{pw?.active ? <span className="chip ok">Ativa</span> : <span className="chip bad">Não criada</span>}</div><div className="stack">
        <p className="hint" style={{ margin: 0 }}>Exigida para finalizar uma O.S. recebendo menos que o total e para aplicar desconto em orçamentos. Só o usuário master cria ou troca esta senha.</p>
        {pw?.active && <span className="hint">Definida por {pw.set_by || "—"} em {pw.set_at ? dt(pw.set_at) : "—"}</span>}
        <form className="stack" onSubmit={e => { e.preventDefault(); void salvarSenha(); }}>
          <div className="grid2">
            <label className="field"><span className="label">{pw?.active ? "Nova senha" : "Senha"}</span>
              <input className="input" type="password" autoComplete="new-password" value={sdNova} onChange={e => setSdNova(e.target.value)} /></label>
            <label className="field"><span className="label">Confirmar senha</span>
              <input className="input" type="password" autoComplete="new-password" value={sdConf} onChange={e => setSdConf(e.target.value)} /></label>
          </div>
          <button className="key accent" type="submit" style={{ justifySelf: "start" }}>{pw?.active ? "Trocar senha" : "Criar senha"}</button>
        </form>
      </div></section>

      <section className="panel"><div className="ph"><h2>Taxas de pagamento</h2></div><div className="stack">
        <p className="hint" style={{ margin: 0 }}>Percentual cobrado pela maquininha ou banco. A cada entrada registrada, o sistema cria uma despesa &quot;Taxa de pagamento&quot; com o valor calculado.</p>
        <div className="grid2">
          {([["fee_debit_pct", "Débito"], ["fee_pix_pct", "Pix"]] as const).map(([k, l]) => (
            <label className="field" key={k}><span className="label">{l} (%)</span>
              <input className="input" inputMode="decimal" value={of[k]} onChange={e => setOf({ ...of, [k]: e.target.value })} onBlur={() => savePct(k)} /></label>
          ))}
        </div>
        <div className="label">Crédito (%) por número de parcelas</div>
        <div className="tx-grid">{cred.map((v, i) => (
          <label className="tx-cell" key={i}><span className="mono">{i + 1}x</span>
            <input className="input" inputMode="decimal" value={v} aria-label={`Taxa crédito ${i + 1}x`}
              onChange={e => setCred(c => c.map((x, j) => (j === i ? e.target.value : x)))} onBlur={() => saveCred(i)} /></label>
        ))}</div>
        <span className="hint">Dinheiro não tem taxa. Mudar a taxa vale só para os próximos recebimentos.</span>
      </div></section>

      <section className="panel"><div className="ph"><h2>Margem mínima de peças</h2></div><div className="stack">
        <p className="hint" style={{ margin: 0 }}>Menor margem aceita no preço de uma peça do orçamento, como acréscimo sobre o custo: com 40%, uma peça de custo R$ 100 sai por no mínimo R$ 140. Abaixo dela o orçamento não salva o preço, para qualquer perfil. Mão de obra e peça a R$ 0 (garantia) ficam de fora. Use 0 para não ter mínimo.</p>
        <label className="field" style={{ maxWidth: 220 }}><span className="label">Margem mínima (%)</span>
          <input className="input" inputMode="decimal" value={of.min_part_margin_pct} onChange={e => setOf({ ...of, min_part_margin_pct: e.target.value })} onBlur={() => savePct("min_part_margin_pct")} /></label>
        <span className="hint">Só o master altera. Vale para os próximos preços digitados; itens já gravados não mudam.</span>
      </div></section>

      <section className="panel"><div className="ph"><h2>Equipe e comissão</h2></div><div className="stack">
        <div className="row">{techs.length ? techs.map(t => (
          <span className="chip" style={{ paddingRight: 4 }} key={t.id}>{t.name}
            <button className="del" style={{ width: 24, height: 24, fontSize: "11pt", border: 0 }} onClick={() => { sfx("tap"); void delTech(t); }} aria-label={`Remover ${t.name}`}>×</button></span>
        )) : <span className="hint">Nenhum profissional cadastrado</span>}</div>
        <form className="row" style={{ flexWrap: "nowrap" }} onSubmit={e => { e.preventDefault(); void addTech(); }}>
          <input className="input" placeholder="Nome do profissional" aria-label="Nome do profissional" value={eqNovo} onChange={e => setEqNovo(e.target.value)} />
          <button className="key accent" type="submit">Adicionar</button>
        </form>
        <label className="field" style={{ maxWidth: 220 }}><span className="label">Comissão sobre mão de obra (%)</span>
          <input className="input" inputMode="decimal" value={of.commission_pct} onChange={e => setOf({ ...of, commission_pct: e.target.value })} onBlur={() => savePct("commission_pct")} /></label>
      </div></section>
    </div>
  );
}
