// Hausgrado · Edge Function "plate-lookup" (consulta de placa)
// Só para usuários logados. Consulta o cache (30 dias) e, se não tiver, a API Placa FIPE
// (https://doc.placafipe.com.br/api/getplaca.html).
// O token fica no servidor: o master grava em Configurações (shop_secrets.plate_api_token,
// que o app não consegue ler) ou, se preferir, num segredo da função:
//
//   supabase secrets set PLATE_API_TOKEN="..."      (opcional; tem prioridade sobre o da tela)
//   supabase functions deploy plate-lookup
//
// POST { plate: "ABC1D23" } → { make, model, year, color, fuel } | { error }
import { createClient } from "jsr:@supabase/supabase-js@2";

const API_URL = "https://api.placafipe.com.br/getplaca";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, authorization, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

// "RENAULT" → "Renault", "MERCEDES-BENZ" → "Mercedes-Benz"; siglas curtas (BMW, BYD, GWM, KIA) ficam em maiúsculas
const titulo = (s: string) =>
  s.toLowerCase().replace(/(^|[\s/-])([a-zà-ú])/g, (_, a, b) => a + b.toUpperCase());
const marca = (s: string) => (s.length <= 3 ? s.toUpperCase() : titulo(s));

function combustivel(s: string) {
  const t = s.toLowerCase();
  if (/(álcool|alcool|etanol)/.test(t) && /gasolina/.test(t)) return "Flex";
  return titulo(s);
}

// deno-lint-ignore no-explicit-any
function normalize(v: any) {
  const str = (x: unknown) => (x == null ? "" : String(x).trim());
  const ano = str(v.ano), anoMod = str(v.ano_modelo);
  return {
    make: str(v.marca) ? marca(str(v.marca)) : null,
    model: str(v.modelo) || null,
    year: ano && anoMod ? `${ano}/${anoMod}` : (ano || anoMod || null),
    color: str(v.cor) ? titulo(str(v.cor)) : null,
    fuel: str(v.combustivel) ? combustivel(str(v.combustivel)) : null,
  };
}

// Códigos de retorno da Placa FIPE (https://doc.placafipe.com.br/api/codigos.html)
function erroApi(codigo: number) {
  if (codigo === 759 || codigo === 763) return { msg: "Placa não encontrada. Preencha manualmente.", status: 404 };
  if (codigo === 3974 || codigo === 4862)
    return { msg: "Limite diário de consultas atingido ou token não aceito. Preencha manualmente.", status: 429 };
  return { msg: "Serviço de placas indisponível. Preencha manualmente.", status: 502 };
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

  const { data: prof } = await admin.from("profiles").select("shop_id, active").eq("id", u.user.id).maybeSingle();
  if (!prof?.active) return json({ error: "Faça login." }, 401);

  const { data: cached } = await admin.from("plate_cache").select("data, fetched_at").eq("plate", plate).maybeSingle();
  if (cached && Date.now() - new Date(cached.fetched_at).getTime() < 30 * 864e5) return json({ ...cached.data, cached: true });

  let token = Deno.env.get("PLATE_API_TOKEN") ?? "";
  if (!token) {
    const { data: sec } = await admin.from("shop_secrets").select("plate_api_token").eq("shop_id", prof.shop_id).maybeSingle();
    token = sec?.plate_api_token ?? "";
  }
  if (!token) return json({ error: "Consulta de placa não configurada. Preencha manualmente." }, 503);

  try {
    const r = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ placa: plate, token }),
      signal: AbortSignal.timeout(15000),
    });
    const body = await r.json().catch(() => null);
    const codigo = Number(body?.codigo);
    if (codigo !== 1 || !body?.informacoes_veiculo) {
      const e = erroApi(codigo);
      console.error("placafipe", plate, r.status, codigo, body?.msg);
      return json({ error: e.msg }, e.status);
    }
    const data = normalize(body.informacoes_veiculo);
    if (!data.make && !data.model) return json({ error: "Placa não encontrada. Preencha manualmente." }, 404);
    await admin.from("plate_cache").upsert({ plate, data, fetched_at: new Date().toISOString() });
    return json(data);
  } catch (e) {
    console.error("placafipe", plate, String(e));
    return json({ error: "Serviço de placas indisponível. Preencha manualmente." }, 502);
  }
});
