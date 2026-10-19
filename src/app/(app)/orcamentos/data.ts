import "server-only";
// Carrega um orçamento com itens, cliente, O.S. ligada e dados da oficina (editor, PDF e guia).
import { createClient } from "@/lib/supabase/server.ts";

export interface QItem {
  id: string; kind: "peca" | "mao"; description: string; details: string | null; qty: number; unit_price: number; unit_cost: number;
  product_id: string | null; service_id: string | null; sku: string | null; position: number;
}
export interface QQuote {
  id: string; number: number; service_order_id: string | null; customer_id: string | null; plate: string | null;
  discount: number; validity_days: number; status: "rascunho" | "enviado" | "aprovado" | "recusado";
  decided_at: string | null; decided_by: string | null; created_at: string;
}
export interface QCustomer { id: string; name: string; phone: string; document: string | null; zip_code: string | null }
export interface QOS {
  id: string; number: number; plate: string; make: string | null; model: string | null; year: string | null; color: string | null;
  km: string | null; fuel_level: string | null; entry_type: string; status: string; entered_at: string; exited_at: string | null;
  customer_complaint: string | null; portal_token: string; technician_name: string | null;
}
export interface QuoteBundle {
  quote: QQuote; items: QItem[]; customer: QCustomer | null; os: QOS | null;
  shop: { name: string; portal_base_url: string | null; min_part_margin_pct: number };
}

export async function loadQuote(id: string): Promise<QuoteBundle | null> {
  const sb = await createClient();
  const { data: q } = await sb.from("quotes").select("*").eq("id", id).maybeSingle();
  if (!q) return null;
  const quote = { ...q, discount: Number(q.discount) || 0 } as QQuote;
  const [{ data: items }, { data: cust }, { data: os }, { data: shop }] = await Promise.all([
    sb.from("quote_items").select("id, kind, description, details, qty, unit_price, unit_cost, product_id, service_id, sku, position").eq("quote_id", id).order("position").order("created_at"),
    quote.customer_id ? sb.from("customers").select("id, name, phone, document, zip_code").eq("id", quote.customer_id).maybeSingle() : Promise.resolve({ data: null }),
    quote.service_order_id
      ? sb.from("service_orders").select("id, number, plate, make, model, year, color, km, fuel_level, entry_type, status, entered_at, exited_at, customer_complaint, portal_token, technicians(name)").eq("id", quote.service_order_id).maybeSingle()
      : Promise.resolve({ data: null }),
    sb.from("shops").select("name, portal_base_url, min_part_margin_pct").single(),
  ]);
  let o: QOS | null = null;
  if (os) {
    const t = (os as { technicians?: { name: string } | { name: string }[] | null }).technicians;
    const tn = Array.isArray(t) ? t[0]?.name : t?.name;
    const { technicians: _t, ...rest } = os as Record<string, unknown>;
    void _t;
    o = { ...(rest as unknown as QOS), technician_name: tn ?? null };
  }
  return {
    quote,
    items: ((items ?? []) as QItem[]).map(i => ({ ...i, qty: Number(i.qty) || 0, unit_price: Number(i.unit_price) || 0, unit_cost: Number(i.unit_cost) || 0 })),
    customer: (cust as QCustomer | null) ?? null,
    os: o,
    shop: { name: (shop as { name?: string } | null)?.name || "Autogrado", portal_base_url: (shop as { portal_base_url?: string | null } | null)?.portal_base_url ?? null,
      min_part_margin_pct: Number((shop as { min_part_margin_pct?: number | string } | null)?.min_part_margin_pct) || 0 },
  };
}
