"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client.ts";
import { brl } from "@/lib/rules.ts";
import { digits, fmtFone } from "@/lib/labels.ts";
import { waURL } from "@/lib/msgs.ts";
import { toast, errMsg } from "@/lib/ui.ts";
import type { SupplierRow } from "@/lib/fin-b.ts";
import { KeyField, KeyLine } from "../despesas/fin-ui.tsx";

export interface FornStats { n: number; tot: number; aberto: number }
interface Form { id: string | null; nome: string; vendedor: string; contato: string; pix: string }
const novoForn = (): Form => ({ id: null, nome: "", vendedor: "", contato: "", pix: "" });

export function Fornecedores({ list, stats }: { list: SupplierRow[]; stats: Record<string, FornStats> }) {
  const router = useRouter();
  const [F, setF] = useState<Form>(novoForn);
  const [busca, setBusca] = useState("");
  const [pend, setPend] = useState(false);
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<Form>) => setF(f => ({ ...f, ...p }));
  const q = busca.toLowerCase();
  const rows = list.filter(f => !q || [f.name, f.salesperson, f.salesperson_phone, f.pix_key].join(" ").toLowerCase().includes(q))
    .sort((a, b) => a.name.localeCompare(b.name));
  const wa = digits(F.contato).length >= 10 ? waURL(F.contato, "Olá!") : null;

  function editar(f: SupplierRow) {
    setF({ id: f.id, nome: f.name, vendedor: f.salesperson ?? "", contato: f.salesperson_phone ?? "", pix: f.pix_key ?? "" });
    setPend(false);
  }
  function novo() { setF(novoForn()); setPend(false); setTimeout(() => document.getElementById("fo-nome")?.focus(), 0); }

  async function salvar() {
    const nome = F.nome.trim();
    if (!nome) return toast("Informe o nome do fornecedor");
    if (list.some(f => f.id !== F.id && f.name.toLowerCase() === nome.toLowerCase())) return toast("Esse fornecedor já está cadastrado", { err: true });
    const data = { name: nome, salesperson: F.vendedor.trim() || null, salesperson_phone: digits(F.contato) || null, pix_key: F.pix.trim() || null };
    setBusy(true);
    const sb = createClient();
    if (F.id) {
      const old = list.find(f => f.id === F.id);
      const { error } = await sb.from("suppliers").update(data).eq("id", F.id);
      if (error) { setBusy(false); return toast(errMsg(error), { err: true }); }
      // Renomear: reprocessa as compras para a despesa "Compra de mercadorias" levar o nome novo.
      if (old && old.name !== nome) await sb.from("purchases").update({ supplier_id: F.id }).eq("supplier_id", F.id);
    } else {
      const { error } = await sb.from("suppliers").insert(data);
      if (error) { setBusy(false); return toast(errMsg(error), { err: true }); }
    }
    setBusy(false);
    toast(F.id ? "Fornecedor atualizado" : "Fornecedor cadastrado", { sound: "ok" });
    setF(novoForn());
    router.refresh();
  }

  async function excluir() {
    if (!F.id) return;
    setPend(false);
    if ((stats[F.id]?.n ?? 0) > 0) return toast("Não foi possível excluir: há compras desse fornecedor.", { err: true });
    const { error } = await createClient().from("suppliers").delete().eq("id", F.id);
    if (error) return toast(error.code === "23503" ? "Não foi possível excluir: há compras desse fornecedor." : errMsg(error), { err: true });
    setF(novoForn());
    toast("Fornecedor excluído");
    router.refresh();
  }

  return (
    <div className="split" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(320px,34%)" }}>
      <section className="panel">
        <div className="ph"><h2>Fornecedores</h2>
          <span className="row"><span className="count">{list.length}</span>
            <input className="input" id="fo-busca" placeholder="Buscar fornecedor, vendedor ou pix" value={busca} onChange={e => setBusca(e.target.value)} style={{ width: 260, maxWidth: "100%" }} />
          </span>
        </div>
        <div className="tbl-wrap"><table><thead><tr><th>Fornecedor</th><th>Vendedor</th><th>Chave pix</th><th className="num">Compras</th><th className="num">Em aberto</th></tr></thead><tbody>
          {rows.map(f => {
            const st = stats[f.id] ?? { n: 0, tot: 0, aberto: 0 };
            return (
              <tr key={f.id} className={`click ${F.id === f.id ? "sel" : ""}`} onClick={() => editar(f)}>
                <td><b>{f.name}</b></td>
                <td>{f.salesperson || "—"}{f.salesperson_phone && <div className="hint mono">{fmtFone(f.salesperson_phone)}</div>}</td>
                <td>{f.pix_key ? <KeyLine code={f.pix_key} max={999} /> : <span className="hint">—</span>}</td>
                <td className="num">{st.n} · {brl(st.tot)}</td>
                <td className="num">{st.aberto ? <b style={{ color: "var(--accent)" }}>{brl(st.aberto)}</b> : "—"}</td>
              </tr>
            );
          })}
          {!rows.length && <tr><td colSpan={5}><div className="empty">Nenhum fornecedor cadastrado</div></td></tr>}
        </tbody></table></div>
      </section>
      <aside className="panel sticky">
        <div className="ph"><h2>{F.id ? "Editar fornecedor" : "Novo fornecedor"}</h2>{F.id && <button className="key sm" onClick={novo}>+ Novo</button>}</div>
        <div className="stack">
          <label className="field"><span className="label">Fornecedor *</span><input className="input" id="fo-nome" value={F.nome} onChange={e => set({ nome: e.target.value })} placeholder="Razão social ou nome fantasia" /></label>
          <label className="field"><span className="label">Vendedor</span><input className="input" id="fo-vend" value={F.vendedor} onChange={e => set({ vendedor: e.target.value })} /></label>
          <label className="field"><span className="label">Contato do vendedor</span>
            <input className="input" id="fo-cont" inputMode="tel" placeholder="(61) 99999-0000" value={fmtFone(F.contato)} onChange={e => set({ contato: digits(e.target.value).slice(0, 11) })} />
            {wa && <a className="lnk" style={{ marginTop: 4 }} href={wa} target="_blank" rel="noopener">Abrir WhatsApp do vendedor</a>}
          </label>
          <KeyField id="fo-pix" label="Chave pix" value={F.pix} onChange={v => set({ pix: v })} />
          <button className="key accent" style={{ padding: 13 }} disabled={busy} onClick={salvar}>{F.id ? "Salvar alterações" : "Cadastrar fornecedor"}</button>
          {F.id && (pend
            ? <div className="row"><span>Excluir este fornecedor?</span><button className="key sm danger" onClick={excluir}>Excluir</button><button className="key sm" onClick={() => setPend(false)}>Cancelar</button></div>
            : <button className="key sm" onClick={() => setPend(true)}>Excluir fornecedor</button>)}
        </div>
      </aside>
    </div>
  );
}
