"use server";
// Gestão de usuários (só master). Contas do Supabase Auth exigem a service_role → só no servidor.
import { revalidatePath } from "next/cache";
import { createClient, getMe } from "@/lib/supabase/server.ts";
import { createAdminClient } from "@/lib/supabase/admin.ts";
import type { Role } from "@/lib/rules.ts";

export type Res = { ok: true } | { ok: false; error: string };
const ROLES: Role[] = ["master", "admin", "atendente", "mecanico"];
const BAN = "876000h"; // ~100 anos

async function guard() {
  const me = await getMe();
  if (!me || me.role !== "master") return { me: null, error: "Acesso restrito ao seu perfil." } as const;
  return { me, error: null } as const;
}
const hasKey = () => !!process.env.SUPABASE_SERVICE_ROLE_KEY;
const NO_KEY = "Este deploy não tem a SUPABASE_SERVICE_ROLE_KEY. Confira a variável (ambiente Production) na Vercel e faça um Redeploy.";

/** Perfil alvo, sempre da mesma oficina de quem chama. */
async function target(id: string, shopId: string) {
  const sb = await createClient();
  const { data } = await sb.from("profiles").select("id, role, active, shop_id").eq("id", id).maybeSingle();
  return data && data.shop_id === shopId ? (data as { id: string; role: Role; active: boolean; shop_id: string }) : null;
}
/** Quantos masters ativos existem na oficina, sem contar `exceptId`. */
async function otherActiveMasters(shopId: string, exceptId: string) {
  const sb = await createClient();
  const { count } = await sb.from("profiles").select("id", { count: "exact", head: true })
    .eq("shop_id", shopId).eq("role", "master").eq("active", true).neq("id", exceptId);
  return count ?? 0;
}

export async function createUser(input: { nome: string; usuario: string; senha: string; papel: string }): Promise<Res> {
  const { me, error } = await guard(); if (!me) return { ok: false, error };
  if (!hasKey()) return { ok: false, error: NO_KEY };
  const nome = input.nome.trim(), usuario = input.usuario.trim().toLowerCase(), papel = input.papel as Role;
  if (!nome) return { ok: false, error: "Informe o nome." };
  if (!/^[a-z0-9._-]{3,}$/.test(usuario)) return { ok: false, error: "Usuário: 3+ caracteres (letras, números, ponto, hífen ou _)." };
  if ((input.senha || "").length < 6) return { ok: false, error: "Senha: mínimo de 6 caracteres." };
  if (!ROLES.includes(papel)) return { ok: false, error: "Escolha o perfil." };
  // Mesmo domínio (e mesmo padrão) do login, senão o usuário criado não consegue entrar.
  const domain = process.env.NEXT_PUBLIC_AUTH_EMAIL_DOMAIN ?? "usuarios.hausgrado.app";

  const adm = createAdminClient();
  const { data: dup, error: e0 } = await adm.from("profiles").select("id").eq("username", usuario).maybeSingle();
  if (e0) return { ok: false, error: "A SUPABASE_SERVICE_ROLE_KEY da Vercel não foi aceita pelo Supabase (" + e0.message + "). Use a chave service_role (ou secret) do projeto hyvkfyvptqzpbymurqvt." };
  if (dup) return { ok: false, error: "Esse usuário já existe." };
  const { data, error: e1 } = await adm.auth.admin.createUser({
    email: `${usuario}@${domain}`, password: input.senha, email_confirm: true, user_metadata: { full_name: nome },
  });
  if (e1 || !data.user) return { ok: false, error: "Não foi possível criar o usuário: " + (e1?.message ?? "erro desconhecido") };
  const { error: e2 } = await adm.from("profiles").insert({ id: data.user.id, shop_id: me.shop_id, full_name: nome, username: usuario, role: papel, active: true });
  if (e2) {
    await adm.auth.admin.deleteUser(data.user.id);
    return { ok: false, error: "Não foi possível criar o perfil: " + e2.message };
  }
  revalidatePath("/config");
  return { ok: true };
}

export async function setPassword(id: string, senha: string): Promise<Res> {
  const { me, error } = await guard(); if (!me) return { ok: false, error };
  if (!hasKey()) return { ok: false, error: NO_KEY };
  if ((senha || "").length < 6) return { ok: false, error: "Senha: mínimo de 6 caracteres." };
  if (!(await target(id, me.shop_id))) return { ok: false, error: "Usuário não encontrado." };
  const { error: e } = await createAdminClient().auth.admin.updateUserById(id, { password: senha });
  if (e) return { ok: false, error: "Não foi possível trocar a senha: " + e.message };
  return { ok: true };
}

export async function setActive(id: string, active: boolean): Promise<Res> {
  const { me, error } = await guard(); if (!me) return { ok: false, error };
  if (!hasKey()) return { ok: false, error: NO_KEY };
  if (id === me.id) return { ok: false, error: "Você não pode bloquear o próprio usuário." };
  const t = await target(id, me.shop_id); if (!t) return { ok: false, error: "Usuário não encontrado." };
  if (!active && t.role === "master" && t.active && (await otherActiveMasters(me.shop_id, id)) === 0)
    return { ok: false, error: "Precisa existir pelo menos um master ativo." };
  const adm = createAdminClient();
  const { error: e1 } = await adm.from("profiles").update({ active }).eq("id", id);
  if (e1) return { ok: false, error: e1.message };
  const { error: e2 } = await adm.auth.admin.updateUserById(id, { ban_duration: active ? "none" : BAN });
  if (e2) return { ok: false, error: "Perfil atualizado, mas o login não foi " + (active ? "liberado" : "bloqueado") + ": " + e2.message };
  revalidatePath("/config");
  return { ok: true };
}

export async function setRole(id: string, role: string): Promise<Res> {
  const { me, error } = await guard(); if (!me) return { ok: false, error };
  if (!hasKey()) return { ok: false, error: NO_KEY };
  if (!ROLES.includes(role as Role)) return { ok: false, error: "Perfil inválido." };
  if (id === me.id) return { ok: false, error: "Você não pode alterar o próprio perfil." };
  const t = await target(id, me.shop_id); if (!t) return { ok: false, error: "Usuário não encontrado." };
  if (t.role === "master" && role !== "master" && t.active && (await otherActiveMasters(me.shop_id, id)) === 0)
    return { ok: false, error: "Precisa existir pelo menos um master ativo." };
  const { error: e } = await createAdminClient().from("profiles").update({ role }).eq("id", id);
  if (e) return { ok: false, error: e.message };
  revalidatePath("/config");
  return { ok: true };
}
