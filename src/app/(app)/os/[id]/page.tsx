import Link from "next/link";
import { createClient, getMe } from "@/lib/supabase/server.ts";
import { quoteTotals, type ShopFees } from "@/lib/rules.ts";
import { OSDetail, type OSData, type OSRecord, type OSPhoto, type OSHist, type OSQuote, type OSTech } from "./OSDetail.tsx";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await createClient();
  const me = await getMe();
  const { data: os } = /^[0-9a-f-]{36}$/i.test(id)
    ? await sb.from("service_orders").select("*, customers(name, phone)").eq("id", id).maybeSingle()
    : { data: null };
  if (!os) {
    return (
      <main id="view">
        <section className="panel"><div className="ph"><h2>O.S. não encontrada</h2></div>
          <p className="muted">Esta ordem de serviço não existe ou foi excluída.</p>
          <Link className="key" href="/quadro">‹ Quadro</Link></section>
      </main>
    );
  }

  const [{ data: photos }, { data: records }, { data: hist }, { data: techs }, { data: quotes }, { data: shop }, { data: pw }, { data: total }] = await Promise.all([
    sb.from("service_order_photos").select("id, position, storage_path").eq("service_order_id", id),
    sb.from("service_order_records").select("id, tab, storage_path, mime, file_name, description, created_at").eq("service_order_id", id).order("created_at"),
    sb.from("service_order_history").select("id, text, created_by_name, created_at").eq("service_order_id", id).order("created_at"),
    sb.from("technicians").select("id, name, active").order("name"),
    sb.from("quotes").select("id, number, status, discount, quote_items(kind, qty, unit_price)").eq("service_order_id", id).order("created_at", { ascending: false }).limit(1),
    sb.from("shops").select("name, portal_base_url, fee_debit_pct, fee_pix_pct, fee_credit_pct").single(),
    sb.rpc("discount_password_status"),
    sb.rpc("os_total", { p_os: id }),
  ]);

  // URLs assinadas (1 h) das fotos e mídias
  const paths = [...(photos ?? []).map(p => p.storage_path as string), ...(records ?? []).map(r => r.storage_path as string | null)].filter(Boolean) as string[];
  const urls: Record<string, string> = {};
  if (paths.length) {
    const { data: signed } = await sb.storage.from("os-media").createSignedUrls(paths, 3600);
    for (const s of signed ?? []) if (s.path && s.signedUrl) urls[s.path] = s.signedUrl;
  }

  const q = (quotes ?? [])[0] as { id: string; number: number; status: string; discount: number; quote_items: { kind: "peca" | "mao"; qty: number; unit_price: number }[] } | undefined;
  const quote: OSQuote | null = q ? {
    id: q.id, number: q.number, status: q.status,
    total: quoteTotals((q.quote_items ?? []).map(i => ({ kind: i.kind, qty: Number(i.qty), unit_price: Number(i.unit_price) })), Number(q.discount) || 0).total,
  } : null;

  const s = shop as (ShopFees & { name: string; portal_base_url: string | null }) | null;
  const c = (os as { customers: { name: string; phone: string } | null }).customers;
  const data: OSData = {
    id: os.id, number: os.number, plate: os.plate, make: os.make, model: os.model, year: os.year, color: os.color, fuel: os.fuel,
    km: os.km, fuel_level: os.fuel_level, entry_type: os.entry_type, status: os.status, entered_at: os.entered_at, exited_at: os.exited_at,
    technician_id: os.technician_id, customer_complaint: os.customer_complaint, service_description: os.service_description,
    checklist: (os.checklist ?? {}) as Record<string, boolean>, portal_token: os.portal_token,
    customer_name: c?.name ?? "", customer_phone: c?.phone ?? "",
  };
  const techList = ((techs ?? []) as OSTech[]).filter(t => t.active || t.id === os.technician_id);

  return (
    <main id="view">
      <OSDetail key={os.id} os={data} shopId={me!.shop_id} role={me!.role}
        photos={((photos ?? []) as OSPhoto[]).map(p => ({ ...p, url: urls[p.storage_path] ?? null }))}
        records={((records ?? []) as OSRecord[]).map(r => ({ ...r, url: r.storage_path ? urls[r.storage_path] ?? null : null }))}
        history={(hist ?? []) as OSHist[]} techs={techList} quote={quote}
        shopName={s?.name ?? "Autogrado"} portalBase={s?.portal_base_url ?? null}
        fees={{ fee_debit_pct: Number(s?.fee_debit_pct ?? 0), fee_pix_pct: Number(s?.fee_pix_pct ?? 0), fee_credit_pct: (s?.fee_credit_pct ?? []).map(Number) }}
        hasPassword={!!(pw as { active?: boolean } | null)?.active} total={Number(total ?? 0)} />
    </main>
  );
}
