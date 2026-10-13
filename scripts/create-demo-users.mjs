// Cria os 3 usuários da versão beta (master, admin, atendente) na oficina Autogrado.
// Uso (no seu computador, NUNCA no navegador):
//   node --env-file=.env.local scripts/create-demo-users.mjs
//
// Precisa em .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_AUTH_EMAIL_DOMAIN
// Senhas: gera senhas fortes e mostra UMA vez no terminal (anote num gerenciador de senhas).
// Para escolher as senhas, defina DEMO_PASS_MASTER / DEMO_PASS_ADMIN / DEMO_PASS_ATENDENTE no .env.local.
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const domain = process.env.NEXT_PUBLIC_AUTH_EMAIL_DOMAIN || "usuarios.hausgrado.app";
const SHOP_ID = "00000000-0000-4000-8000-000000000001";
if (!url || !key) { console.error("Faltam NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env.local"); process.exit(1); }

const admin = createClient(url, key, { auth: { persistSession: false } });
const gen = () => randomBytes(9).toString("base64url");

const users = [
  { username: "master",    full_name: "Vinícius (master)", role: "master",    password: process.env.DEMO_PASS_MASTER || gen() },
  { username: "admin",     full_name: "Administrador",     role: "admin",     password: process.env.DEMO_PASS_ADMIN || gen() },
  { username: "atendente", full_name: "Atendente",         role: "atendente", password: process.env.DEMO_PASS_ATENDENTE || gen() },
];

for (const u of users) {
  const email = `${u.username}@${domain}`;
  const { data, error } = await admin.auth.admin.createUser({
    email, password: u.password, email_confirm: true, user_metadata: { username: u.username },
  });
  if (error) { console.error(`✗ ${u.username}: ${error.message}`); continue; }
  const { error: pe } = await admin.from("profiles").insert({
    id: data.user.id, shop_id: SHOP_ID, full_name: u.full_name, username: u.username, role: u.role,
  });
  if (pe) { console.error(`✗ perfil ${u.username}: ${pe.message}`); continue; }
  console.log(`✓ ${u.role.padEnd(9)} usuário: ${u.username.padEnd(10)} senha: ${u.password}`);
}
console.log("\nAnote as senhas agora — elas não ficam salvas em lugar nenhum. Troque-as após o primeiro acesso.");
