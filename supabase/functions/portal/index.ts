// Hausgrado · Edge Function "portal" (link do cliente)
// Público (sem login): o cliente abre /c/{token} e digita o celular.
// Esta função usa a service_role SÓ no servidor e devolve URLs assinadas das fotos.
//
// POST { token, phone }                         → dados da O.S. (ou { error })
// POST { token, phone, decision: "aprovado" }   → aprova/recusa o orçamento
//
// Deploy: supabase functions deploy portal --no-verify-jwt
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": Deno.env.get("PORTAL_ALLOWED_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers": "content-type, authorization, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);

  let body: { token?: string; phone?: string; decision?: string };
  try { body = await req.json(); } catch { return json({ error: "Requisição inválida." }, 400); }
  const token = String(body.token ?? "").trim();
  const phone = String(body.phone ?? "").trim();
  if (!/^[a-f0-9]{48}$/.test(token) || phone.length < 10) return json({ error: "Link ou celular inválido." }, 400);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  if (body.decision) {
    if (!["aprovado", "recusado"].includes(body.decision)) return json({ error: "Decisão inválida." }, 400);
    const { error } = await admin.rpc("portal_decide_quote", { p_token: token, p_phone: phone, p_decision: body.decision });
    if (error) return json({ error: error.message }, 400);
  }

  const { data, error } = await admin.rpc("portal_get", { p_token: token, p_phone: phone });
  if (error) return json({ error: "Não foi possível abrir agora. Tente de novo." }, 500);
  if (data?.error) return json({ error: data.error }, 401);

  // Troca caminhos do storage por URLs assinadas (1 hora)
  const sign = async (path: string | null) => {
    if (!path) return null;
    const { data: s } = await admin.storage.from("os-media").createSignedUrl(path, 3600);
    return s?.signedUrl ?? null;
  };
  data.photos = await Promise.all((data.photos ?? []).map(async (p: { position: string; path: string }) => ({
    position: p.position, url: await sign(p.path),
  })));
  data.records = await Promise.all((data.records ?? []).map(async (r: Record<string, unknown>) => ({
    ...r, path: undefined, url: await sign(r.path as string | null),
  })));
  return json(data);
});
