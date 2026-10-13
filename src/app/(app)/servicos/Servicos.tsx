"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client.ts";
import { brl } from "@/lib/rules.ts";
import { numBR, parseNum } from "@/lib/labels.ts";
import { errMsg, toast } from "@/lib/ui.ts";

export interface Servico { id: string; name: string; description: string | null; price: number; usos: number }
interface Form { id: string | null; nome: string; descricao: string; valor: string }
const novo = (): Form => ({ id: null, nome: "", descricao: "", valor: "" });

export function Servicos({ rows }: { rows: Servico[] }) {
  const router = useRouter();
  const [busca, setBusca] = useState("");
  const [F, setF] = useState<Form>(novo);
  const [pend, setPend] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const set = (p: Partial<Form>) => setF(f => ({ ...f, ...p }));

  const q = busca.toLowerCase();
  const list = rows.filter(x => !q || [x.name, x.description].join(" ").toLowerCase().includes(q)).sort((a, b) => a.name.localeCompare(b.name));

  const editar = (x: Servico) => {
    setF({ id: x.id, nome: x.name, descricao: x.description ?? "", valor: numBR(x.price) }); setPend(false);
    if (window.innerWidth < 920) document.getElementById("sc-nome")?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  async function salvar() {
    const nome = F.nome.trim();
    if (!nome) return toast("Informe o nome do serviço");
    const valor = parseNum(F.valor);
    if (F.valor === "" || !(valor > 0)) return toast("Informe o valor do serviço");
    if (rows.some(v => v.id !== F.id && v.name.toLowerCase() === nome.toLowerCase())) return toast("Esse serviço já está cadastrado", { err: true });
    const data = { name: nome, description: F.descricao.trim() || null, price: valor };
    setSalvando(true);
    const sb = createClient();
    const { error } = F.id ? await sb.from("service_catalog").update(data).eq("id", F.id) : await sb.from("service_catalog").insert(data);
    setSalvando(false);
    if (error) return toast(error.code === "23505" ? "Esse serviço já está cadastrado" : errMsg(error), { err: true });
    toast(F.id ? "Serviço atualizado" : "Serviço cadastrado", { sound: "ok" });
    setF(novo());
    router.refresh();
  }

  async function excluir() {
    if (!F.id) return;
    const { error } = await createClient().from("service_catalog").delete().eq("id", F.id);
    if (error) return toast(errMsg(error), { err: true });
    setF(novo()); setPend(false);
    toast("Serviço excluído");
    router.refresh();
  }

  return (
    <main id="view">
      <div className="split" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(340px,36%)" }}>
        <section className="panel">
          <div className="ph"><h2>Serviços</h2>
            <span className="row"><span className="count">{rows.length}</span>
              <input className="input" id="sc-busca" placeholder="Buscar serviço" value={busca} onChange={e => setBusca(e.target.value)} style={{ width: 260, maxWidth: "100%" }} /></span>
          </div>
          <p className="hint" style={{ margin: "-4px 0 14px" }}>Serviços prontos para vender no orçamento com um clique: revisões por quilometragem, check-ups, pacotes.</p>
          <div className="sv-grid">
            {list.map(x => (
              <button key={x.id} className={`sv-card ${F.id === x.id ? "sel" : ""}`} onClick={() => editar(x)}>
                <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start", flexWrap: "nowrap", gap: 10 }}><b>{x.name}</b><span className="mono sv-preco">{brl(x.price)}</span></div>
                <span className="hint">{x.description || "Sem descrição"}</span>
                <span className="sv-uso">{x.usos ? `Usado em ${x.usos} orçamento${x.usos > 1 ? "s" : ""}` : "Ainda não usado"}</span>
              </button>
            ))}
            {!list.length && <div className="empty" style={{ gridColumn: "1/-1" }}>{rows.length ? "Nenhum serviço encontrado" : "Nenhum serviço cadastrado. Use o formulário ao lado."}</div>}
          </div>
        </section>
        <aside className="panel sticky">
          <div className="ph"><h2>{F.id ? "Editar serviço" : "Novo serviço"}</h2>{F.id && <button className="key sm" onClick={() => { setF(novo()); setPend(false); document.getElementById("sc-nome")?.focus(); }}>+ Novo</button>}</div>
          <div className="stack">
            <label className="field"><span className="label">Serviço *</span>
              <input className="input" id="sc-nome" value={F.nome} onChange={e => set({ nome: e.target.value })} placeholder="Ex.: Check list viagem" /></label>
            <label className="field"><span className="label">Descrição</span>
              <textarea className="input" id="sc-desc" value={F.descricao} onChange={e => set({ descricao: e.target.value })} placeholder="O que está incluído no serviço" />
              <span className="hint">Aparece no orçamento, no PDF e na guia de serviço</span></label>
            <label className="field"><span className="label">Valor (R$) *</span>
              <input className="input mono" id="sc-val" inputMode="decimal" value={F.valor} onChange={e => set({ valor: e.target.value })} placeholder="0,00" /></label>
            <button className="key accent" style={{ padding: 13 }} disabled={salvando} onClick={salvar}>{F.id ? "Salvar alterações" : "Cadastrar serviço"}</button>
            {F.id && (pend
              ? <div className="row"><span>Excluir este serviço?</span><button className="key sm danger" onClick={excluir}>Excluir</button><button className="key sm" onClick={() => setPend(false)}>Cancelar</button></div>
              : <button className="key sm" onClick={() => setPend(true)}>Excluir serviço</button>)}
          </div>
        </aside>
      </div>
    </main>
  );
}
