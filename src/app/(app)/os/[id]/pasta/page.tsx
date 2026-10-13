// Pasta do cliente (seção 10.1): documento A4 em HTML para imprimir (texto selecionável, preto e branco).
// Página 1: veículo, cliente, datas, 6 fotos de entrada, descrição do serviço e relato.
// Depois: Avarias registradas, Peças e Fotos do serviço executado — 4 registros por página; aba vazia não gera página.
import Link from "next/link";
import { createClient } from "@/lib/supabase/server.ts";
import { FOTOS, TIPOS, dtFull, fmtFone } from "@/lib/labels.ts";
import { PrintBar } from "./PrintBar.tsx";

export const dynamic = "force-dynamic";

interface Rec { id: string; tab: string; storage_path: string | null; mime: string | null; description: string | null; created_at: string }
interface OS {
  id: string; number: number; plate: string; make: string | null; model: string | null; year: string | null; color: string | null;
  fuel: string | null; km: string | null; entry_type: string; entered_at: string; exited_at: string | null;
  customer_complaint: string | null; service_description: string | null;
  customers: { name: string; phone: string } | null; technicians: { name: string } | null;
}

const SECS: [string, string][] = [["avarias", "Avarias registradas"], ["pecas", "Peças"], ["servicos", "Fotos do serviço executado"]];

const CSS = `
.doc-a4{display:grid;gap:22px;justify-items:center}
.doc-a4 .pg{width:210mm;max-width:100%;min-height:297mm;background:#fff;color:#000;box-shadow:var(--shadow);padding:10mm 12mm;display:flex;flex-direction:column;
  font-family:var(--font-ui);font-size:9pt;line-height:1.3;overflow:hidden}
.doc-a4 .mono{font-family:var(--font-num)}
.doc-a4 .hd{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;border-bottom:1.4px solid #000;padding-bottom:2.5mm;margin-bottom:5mm}
.doc-a4 .hd h1{font-size:13pt;font-weight:800;margin:0;line-height:1.2}
.doc-a4 .hd p{font-size:8.5pt;margin:1mm 0 0}
.doc-a4 .via{border:1px solid #000;font-family:var(--font-num);font-size:8pt;font-weight:700;padding:1mm 2.5mm;white-space:nowrap}
.doc-a4 .bd{flex:1;min-height:0;overflow:hidden}
.doc-a4 .sec{font-size:7pt;font-weight:800;text-transform:uppercase;letter-spacing:.04em;border-bottom:.6px solid #000;padding-bottom:.8mm;margin:0 0 2.5mm}
.doc-a4 .kv{display:grid;gap:2.5mm 4mm;margin-bottom:5mm}
.doc-a4 .kv div{border-bottom:.5px solid #e3e3e3;padding-bottom:1mm;min-width:0}
.doc-a4 .kv small{display:block;font-size:6.5pt;font-weight:700;color:#555;text-transform:uppercase}
.doc-a4 .kv b{display:block;font-size:9pt;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.doc-a4 .kv b.mono{font-weight:700}
.doc-a4 .two{display:grid;grid-template-columns:1fr 1fr;gap:8mm}
.doc-a4 .fotos{display:grid;grid-template-columns:repeat(3,1fr);gap:3mm 4mm;margin-bottom:5mm}
.doc-a4 .ph4{aspect-ratio:4/3;background:#f2f2f2;border:.5px solid #e3e3e3;display:flex;align-items:center;justify-content:center;overflow:hidden;font-size:7pt;color:#777;text-align:center}
.doc-a4 .ph4 img{width:100%;height:100%;object-fit:cover;display:block}
.doc-a4 .ph4.vid{flex-direction:column;gap:1mm;color:#333;font-weight:700}
.doc-a4 .fotos figcaption{font-size:7pt;font-weight:700;text-transform:uppercase;margin-top:1mm}
.doc-a4 figure{margin:0}
.doc-a4 .desc{font-size:9.5pt;line-height:1.45;white-space:pre-wrap;margin:0 0 3mm}
.doc-a4 .relato{font-size:8pt;color:#333;white-space:pre-wrap;margin:0}
.doc-a4 .recs{display:grid;grid-template-columns:1fr 1fr;gap:6mm}
.doc-a4 .recs figcaption{margin-top:1.5mm}
.doc-a4 .recs .when{font-family:var(--font-num);font-size:7pt;font-weight:700;display:block}
.doc-a4 .recs .txt{font-size:8.5pt;margin-top:1mm;white-space:pre-wrap;display:-webkit-box;-webkit-line-clamp:6;-webkit-box-orient:vertical;overflow:hidden}
.doc-a4 .ft{display:flex;justify-content:space-between;gap:10px;border-top:.5px solid #bbb;padding-top:1.5mm;margin-top:3mm;font-family:var(--font-num);font-size:7pt}
@media print{
  @page{size:A4;margin:10mm 12mm}
  body:has(.doc-a4){padding:0!important;background:#fff!important}
  body:has(.doc-a4) .wrap{padding:0!important;max-width:none!important}
  body:has(.doc-a4) .casing,body:has(.doc-a4) .content{display:block!important;gap:0!important}
  .doc-a4{display:block}
  .doc-a4 .pg{width:auto;max-width:none;min-height:0;height:277mm;padding:0;box-shadow:none;break-after:page;page-break-after:always}
  .doc-a4 .pg:last-child{break-after:auto;page-break-after:auto}
  .doc-a4 .ph4{-webkit-print-color-adjust:exact;print-color-adjust:exact}
}`;

function KV({ cols, items }: { cols: number; items: [string, string | null | undefined, boolean?][] }) {
  return (
    <div className="kv" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
      {items.map(([l, v, mono]) => <div key={l}><small>{l}</small><b className={mono ? "mono" : undefined}>{v || "—"}</b></div>)}
    </div>
  );
}

export default async function PastaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await createClient();
  const { data } = /^[0-9a-f-]{36}$/i.test(id)
    ? await sb.from("service_orders").select("id, number, plate, make, model, year, color, fuel, km, entry_type, entered_at, exited_at, customer_complaint, service_description, customers(name, phone), technicians(name)").eq("id", id).maybeSingle()
    : { data: null };
  const o = data as unknown as OS | null;
  if (!o) {
    return (
      <main id="view">
        <section className="panel"><div className="ph"><h2>O.S. não encontrada</h2></div>
          <p className="muted">Esta ordem de serviço não existe ou foi excluída.</p>
          <Link className="key" href="/quadro">‹ Quadro</Link></section>
      </main>
    );
  }

  const [{ data: photos }, { data: records }, { data: shop }] = await Promise.all([
    sb.from("service_order_photos").select("position, storage_path").eq("service_order_id", id),
    sb.from("service_order_records").select("id, tab, storage_path, mime, description, created_at").eq("service_order_id", id).order("created_at"),
    sb.from("shops").select("name").maybeSingle(),
  ]);
  const recs = (records ?? []) as Rec[];
  const fotoPath = Object.fromEntries(((photos ?? []) as { position: string; storage_path: string }[]).map(p => [p.position, p.storage_path]));

  // URLs assinadas (1 h) só das imagens (vídeo vira um quadro "Vídeo")
  const isVideo = (r: Rec) => !!r.mime?.startsWith("video");
  const paths = [...Object.values(fotoPath), ...recs.filter(r => r.storage_path && !isVideo(r)).map(r => r.storage_path!)];
  const url: Record<string, string> = {};
  if (paths.length) {
    const { data: signed } = await sb.storage.from("os-media").createSignedUrls(paths, 3600);
    for (const s of signed ?? []) if (s.path && s.signedUrl) url[s.path] = s.signedUrl;
  }

  const oficina = (shop as { name: string } | null)?.name ?? "Autogrado";
  const chunks: { title: string; items: Rec[] }[] = [];
  for (const [k, t] of SECS) {
    const it = recs.filter(r => r.tab === k);
    const n = Math.ceil(it.length / 4);
    for (let i = 0; i < n; i++) chunks.push({ title: t + (n > 1 ? ` (${i + 1}/${n})` : ""), items: it.slice(i * 4, i * 4 + 4) });
  }
  const N = 1 + chunks.length;
  const emit = dtFull(new Date().toISOString());
  const desc = o.service_description?.trim() || recs.filter(r => r.tab === "servicos").map(r => r.description).filter(Boolean).join("\n") || "—";

  const Page = ({ title, n, children }: { title: string; n: number; children: React.ReactNode }) => (
    <article className="pg" aria-label={`Página ${n} de ${N}`}>
      <header className="hd">
        <div><h1>{title}</h1><p>{oficina} · OS {o.number} · emitida em {emit}</p></div>
        <span className="via">VIA DO CLIENTE</span>
      </header>
      <div className="bd">{children}</div>
      <footer className="ft"><span>{oficina} · OS {o.number} · {o.plate}</span><span>Página {n} de {N}</span></footer>
    </article>
  );

  const media = (r: Rec) => {
    if (!r.storage_path) return <div className="ph4">Registro sem foto</div>;
    if (isVideo(r)) return <div className="ph4 vid"><span style={{ fontSize: "16pt" }} aria-hidden="true">▶</span><span>Vídeo</span></div>;
    const u = url[r.storage_path];
    // eslint-disable-next-line @next/next/no-img-element
    return <div className="ph4">{u ? <img src={u} alt={r.description || "Registro"} /> : "Mídia indisponível"}</div>;
  };

  return (
    <main id="view">
      <style>{CSS}</style>
      <PrintBar osId={o.id} number={o.number} />
      <div className="doc-a4">
        <Page title="Pasta do cliente" n={1}>
          <h3 className="sec">Veículo</h3>
          <KV cols={4} items={[
            ["Placa", o.plate, true], ["Marca", o.make], ["Modelo", o.model], ["Ano", o.year],
            ["Cor", o.color], ["Quilometragem", o.km ? `${o.km} km` : ""], ["Combustível", o.fuel], ["Tipo de entrada", TIPOS[o.entry_type]],
          ]} />
          <div className="two">
            <div><h3 className="sec">Cliente</h3>
              <KV cols={2} items={[["Nome", o.customers?.name], ["Celular", fmtFone(o.customers?.phone), true]]} /></div>
            <div><h3 className="sec">Datas</h3>
              <KV cols={2} items={[["Entrada", dtFull(o.entered_at), true], ["Saída", o.exited_at ? dtFull(o.exited_at) : "Em aberto", true], ["Responsável", o.technicians?.name]]} /></div>
          </div>
          <h3 className="sec">Fotos do veículo na entrada</h3>
          <div className="fotos">
            {FOTOS.map(([k, l]) => {
              const u = fotoPath[k] ? url[fotoPath[k]] : undefined;
              return (
                <figure key={k}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <div className="ph4">{u ? <img src={u} alt={l} /> : "Sem foto"}</div>
                  <figcaption>{l}</figcaption>
                </figure>
              );
            })}
          </div>
          <h3 className="sec">Descrição do serviço</h3>
          <p className="desc">{desc}</p>
          {o.customer_complaint?.trim() && <p className="relato">Relato do cliente na entrada: {o.customer_complaint.trim()}</p>}
        </Page>

        {chunks.map((ch, ix) => (
          <Page key={ch.title} title={ch.title} n={ix + 2}>
            <div className="recs">
              {ch.items.map(r => (
                <figure key={r.id}>
                  {media(r)}
                  <figcaption>
                    <span className="when">{dtFull(r.created_at)}{isVideo(r) ? " · vídeo" : ""}</span>
                    <span className="txt">{r.description?.trim() || "Sem descrição"}</span>
                  </figcaption>
                </figure>
              ))}
            </div>
          </Page>
        ))}
      </div>
    </main>
  );
}
