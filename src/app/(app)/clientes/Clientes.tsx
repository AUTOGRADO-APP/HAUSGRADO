"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client.ts";
import { digits, fmtCep, fmtFone } from "@/lib/labels.ts";
import { errMsg, toast } from "@/lib/ui.ts";
import { brl } from "@/lib/rules.ts";
import { BUCKET } from "@/lib/media.ts";
import { Plate } from "@/components/Plate.tsx";

export interface CliRow {
  id: string; name: string; phone: string; document: string | null; zip_code: string | null;
  veiculos: { plate: string; osId: string | null }[];
}
interface Form { id: string | null; nome: string; telefone: string; doc: string; cep: string }
const novo = (): Form => ({ id: null, nome: "", telefone: "", doc: "", cep: "" });

export function Clientes({ rows, canDelete }: { rows: CliRow[]; canDelete: boolean }) {
  const router = useRouter();
  const [busca, setBusca] = useState("");
  const [f, setF] = useState<Form>(novo);
  const [salvando, setSalvando] = useState(false);
  const [del, setDel] = useState<{ id: string; texto: string } | null>(null);   // confirmação de exclusão

  const q = busca.toLowerCase(), qd = digits(busca);
  const list = rows.filter(c => !q || c.name.toLowerCase().includes(q) || (qd && digits(c.phone).includes(qd)))
    .sort((a, b) => a.name.localeCompare(b.name));

  const editar = (c: CliRow) => { setDel(null); setF({ id: c.id, nome: c.name, telefone: c.phone, doc: c.document ?? "", cep: c.zip_code ?? "" }); };

  async function salvar() {
    if (!f.nome.trim()) return toast("Informe o nome");
    const tel = digits(f.telefone);
    if (tel.length < 10) return toast("Celular com DDD é obrigatório (é a senha do cliente)");
    const cep = digits(f.cep);
    if (cep && cep.length !== 8) return toast("CEP precisa ter 8 dígitos");
    const data = { name: f.nome.trim(), phone: tel, document: f.doc.trim() || null, zip_code: cep || null };
    setSalvando(true);
    const sb = createClient();
    const { error } = f.id ? await sb.from("customers").update(data).eq("id", f.id) : await sb.from("customers").insert(data);
    setSalvando(false);
    if (error) return toast(errMsg(error), { err: true });
    toast(f.id ? "Cliente atualizado" : "Cliente cadastrado", { sound: "ok" });
    setF(novo());
    router.refresh();
  }

  // ---------- excluir cliente (só master): leva junto O.S., orçamentos e agendamentos ----------
  async function pedirExclusao(id: string) {
    const sb = createClient();
    const [{ data: oss }, { count: nOrc }, { count: nAg }, { count: nVei }] = await Promise.all([
      sb.from("service_orders").select("id, status").eq("customer_id", id),
      sb.from("quotes").select("id", { count: "exact", head: true }).eq("customer_id", id),
      sb.from("appointments").select("id", { count: "exact", head: true }).eq("customer_id", id),
      sb.from("vehicles").select("id", { count: "exact", head: true }).eq("customer_id", id),
    ]);
    const lista = (oss ?? []) as { id: string; status: string }[];
    const fins = lista.filter(o => o.status === "finalizado").map(o => o.id);
    let rec = 0;
    if (fins.length) {
      const { data } = await sb.from("receipts").select("total").in("service_order_id", fins);
      rec = ((data ?? []) as { total: number }[]).reduce((a, r) => a + Number(r.total), 0);
    }
    const pl = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
    const partes = [
      lista.length ? pl(lista.length, "O.S.", "O.S.") + " (com fotos e registros)" : "",
      nOrc ? pl(nOrc, "orçamento", "orçamentos") : "",
      nAg ? pl(nAg, "agendamento", "agendamentos") : "",
    ].filter(Boolean);
    let texto = partes.length ? `Também serão apagados: ${partes.join(", ")}.` : "Este cliente não tem O.S., orçamentos nem agendamentos.";
    if (fins.length) texto += ` ${pl(fins.length, "O.S. finalizada sai", "O.S. finalizadas saem")} do Financeiro com ${brl(rec)} em entradas, as taxas e as comissões, e as peças voltam ao estoque.`;
    if (nVei) texto += ` ${pl(nVei, "veículo continua", "veículos continuam")} cadastrado${nVei === 1 ? "" : "s"}, sem dono.`;
    setDel({ id, texto });
  }
  async function excluir() {
    if (!del) return;
    const sb = createClient();
    const { data: oss } = await sb.from("service_orders").select("id").eq("customer_id", del.id);
    const ids = ((oss ?? []) as { id: string }[]).map(o => o.id);
    let paths: string[] = [];
    if (ids.length) {
      const [{ data: ph }, { data: rc }] = await Promise.all([
        sb.from("service_order_photos").select("storage_path").in("service_order_id", ids),
        sb.from("service_order_records").select("storage_path").in("service_order_id", ids),
      ]);
      paths = [...(ph ?? []), ...(rc ?? [])].map(x => (x as { storage_path: string | null }).storage_path).filter(Boolean) as string[];
    }
    const { data, error } = await sb.from("customers").delete().eq("id", del.id).select("id");
    if (error) return toast(errMsg(error), { err: true });
    if (!data?.length) return toast("Só o usuário master pode excluir clientes.", { err: true });
    if (paths.length) await sb.storage.from(BUCKET).remove(paths);
    toast("Cliente excluído");
    setDel(null); setF(novo());
    router.refresh();
  }

  return (
    <main id="view">
      <div className="split" style={{ gridTemplateColumns: "minmax(0,1fr) 340px" }}>
        <section className="panel">
          <div className="ph"><h2>Clientes</h2>
            <input className="input" id="cli-busca" placeholder="Buscar nome ou celular" value={busca} onChange={e => setBusca(e.target.value)} style={{ maxWidth: 240 }} />
          </div>
          <div className="tbl-wrap"><table><thead><tr><th>Nome</th><th>Celular</th><th>Veículos</th><th></th></tr></thead><tbody>
            {list.map(c => (
              <tr key={c.id}>
                <td><b>{c.name}</b>{(c.document || c.zip_code) && <div className="hint">{[c.document, c.zip_code ? "CEP " + fmtCep(c.zip_code) : ""].filter(Boolean).join(" · ")}</div>}</td>
                <td style={{ whiteSpace: "nowrap" }}>{fmtFone(c.phone)}</td>
                <td><div className="row">{c.veiculos.length ? c.veiculos.map(v => v.osId
                  ? <Link key={v.plate} href={`/os/${v.osId}`} style={{ cursor: "pointer" }} aria-label={`Abrir O.S. da placa ${v.plate}`}><Plate p={v.plate} /></Link>
                  : <span key={v.plate}><Plate p={v.plate} /></span>) : <span className="hint">—</span>}</div></td>
                <td><div className="row" style={{ justifyContent: "flex-end" }}>
                  <button className="key sm" onClick={() => editar(c)}>Editar</button>
                  <Link className="key sm accent" href={`/os/nova?cliente=${c.id}`}>Nova entrada</Link>
                </div></td>
              </tr>
            ))}
            {!list.length && <tr><td colSpan={4}><div className="empty">Nenhum cliente encontrado</div></td></tr>}
          </tbody></table></div>
        </section>
        <aside className="panel sticky">
          <div className="ph"><h2>{f.id ? "Editar cliente" : "Novo cliente"}</h2>{f.id && <button className="key sm" onClick={() => { setDel(null); setF(novo()); }}>Novo</button>}</div>
          <div className="stack">
            <label className="field"><span className="label">Nome completo</span>
              <input className="input" id="cf-nome" value={f.nome} onChange={e => setF({ ...f, nome: e.target.value })} /></label>
            <label className="field"><span className="label">Celular (WhatsApp) — será a senha</span>
              <input className="input" id="cf-tel" inputMode="tel" placeholder="(61) 98765-4321" value={fmtFone(f.telefone)} onChange={e => setF({ ...f, telefone: digits(e.target.value).slice(0, 11) })} /></label>
            <label className="field"><span className="label">CPF / CNPJ</span>
              <input className="input" id="cf-doc" value={f.doc} onChange={e => setF({ ...f, doc: e.target.value })} /></label>
            <label className="field"><span className="label">CEP</span>
              <input className="input mono" id="cf-cep" inputMode="numeric" maxLength={9} placeholder="00000-000" value={fmtCep(f.cep)} onChange={e => setF({ ...f, cep: digits(e.target.value).slice(0, 8) })} /></label>
            <button className="key accent" disabled={salvando} onClick={salvar}>{f.id ? "Salvar alterações" : "Cadastrar cliente"}</button>
            {canDelete && f.id && (del?.id === f.id
              ? <div className="stack" style={{ gap: 8 }}>
                  <span>Excluir {f.nome || "este cliente"}? Não dá para desfazer.</span>
                  <span className="hint">{del.texto}</span>
                  <div className="row">
                    <button className="key danger sm" onClick={() => void excluir()}>Excluir cliente</button>
                    <button className="key sm" onClick={() => setDel(null)}>Cancelar</button>
                  </div></div>
              : <button className="key sm" onClick={() => void pedirExclusao(f.id!)}>Excluir cliente</button>)}
          </div>
        </aside>
      </div>
    </main>
  );
}
