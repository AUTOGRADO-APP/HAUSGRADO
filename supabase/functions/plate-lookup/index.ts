// Hausgrado · Edge Function "plate-lookup" (consulta de placa)
// Só para usuários logados. Consulta o cache (30 dias) e, se não tiver, o provedor contratado.
// O token do provedor fica em segredo da função — nunca no navegador.
//
//   supabase secrets set PLATE_API_URL="https://api.provedor.com/placa/{plate}" PLATE_API_TOKEN="..."
//   supabase functions deploy plate-lookup
//
// POST { plate: "ABC1D23" } → { make, model, year, color, fuel } | { error }
//
// ATENÇÃO: o formato de resposta muda de provedor para provedor. Ajuste a função normalize()
// para o provedor escolhido (o protótipo usa os campos make/model/year/color/fuel).
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, authorization, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

// deno-lint-ignore no-explicit-any
function normalize(raw: any) {
  return {
    make: raw.marca ?? raw.make ?? raw.MARCA ?? null,
    model: raw.modelo ?? raw.model ?? raw.MODELO ?? null,
    year: raw.ano && raw.anoModelo ? `${raw.ano}/${raw.anoModelo}` : (raw.ano ?? raw.year ?? null),
    color: raw.cor ?? raw.color ?? null,
    fuel: raw.combustivel ?? raw.fuel ?? null,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  // Confere se quem chamou está logado
  const authHeader = req.headers.get("Authorization") ?? "";
  const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: u } = await userClient.auth.getUser();
  if (!u?.user) return json({ error: "Faça login." }, 401);

  const { plate: rawPlate } = await req.json().catch(() => ({}));
  const plate = String(rawPlate ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(plate)) return json({ error: "Placa inválida." }, 400);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  const { data: cached } = await admin.from("plate_cache").select("data, fetched_at").eq("plate", plate).maybeSingle();
  if (cached && Date.now() - new Date(cached.fetched_at).getTime() < 30 * 864e5) return json({ ...cached.data, cached: true });

  const url = Deno.env.get("PLATE_API_URL");
  const token = Deno.env.get("PLATE_API_TOKEN");
  if (!url || !token) return json({ error: "Consulta de placa não configurada. Preencha manualmente." }, 503);

  try {
    const r = await fetch(url.replace("{plate}", plate), { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) return json({ error: "Placa não encontrada. Preencha manualmente." }, 404);
    const data = normalize(await r.json());
    await admin.from("plate_cache").upsert({ plate, data, fetched_at: new Date().toISOString() });
    return json(data);
  } catch {
    return json({ error: "Serviço de placas indisponível. Preencha manualmente." }, 502);
  }
});
