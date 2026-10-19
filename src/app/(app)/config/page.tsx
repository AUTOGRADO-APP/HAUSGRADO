// Configurações (engrenagem, só master — o middleware bloqueia os demais perfis).
import { createClient, getMe } from "@/lib/supabase/server.ts";
import { ConfigView, type CfgShop, type CfgUser, type CfgTech, type PwStatus } from "./ConfigView.tsx";

export const dynamic = "force-dynamic";

export default async function ConfigPage() {
  const sb = await createClient();
  const me = await getMe();
  const [shop, users, techs, pw] = await Promise.all([
    sb.from("shops").select("id, name, portal_base_url, plate_api_provider, commission_pct, min_part_margin_pct, fee_debit_pct, fee_pix_pct, fee_credit_pct").maybeSingle(),
    sb.from("profiles").select("id, full_name, username, role, active").order("full_name"),
    sb.from("technicians").select("id, name, active").eq("active", true).order("name"),
    sb.rpc("discount_password_status"),
  ]);
  const s = shop.data as (CfgShop & { fee_credit_pct: (number | string)[] }) | null;
  const err = shop.error || users.error || techs.error;
  return (
    <main id="view">
      {err && <div className="banner"><span>Erro ao carregar as configurações: {err.message}</span></div>}
      {s && (
        <ConfigView
          meId={me!.id}
          shop={{
            ...s, commission_pct: Number(s.commission_pct), min_part_margin_pct: Number(s.min_part_margin_pct) || 0, fee_debit_pct: Number(s.fee_debit_pct), fee_pix_pct: Number(s.fee_pix_pct),
            fee_credit_pct: Array.from({ length: 12 }, (_, i) => Number(s.fee_credit_pct?.[i] ?? 0)),
          }}
          users={(users.data ?? []) as CfgUser[]}
          techs={(techs.data ?? []) as CfgTech[]}
          pw={(pw.data as PwStatus | null) ?? null}
          canManageUsers={!!process.env.SUPABASE_SERVICE_ROLE_KEY}
        />
      )}
    </main>
  );
}
