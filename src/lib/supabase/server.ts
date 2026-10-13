import "server-only";
// Cliente do servidor (Server Components, Server Actions, Route Handlers) com a sessão do usuário.
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Role } from "../rules.ts";
import { supabaseAnonKey, supabaseUrl } from "./env.ts";

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (list) => {
        try { list.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); }
        catch { /* chamado de Server Component: o middleware renova a sessão */ }
      },
    },
  });
}

export interface Me { id: string; full_name: string; username: string; role: Role; shop_id: string }

/** Usuário logado + perfil (null se não logado ou sem perfil ativo). */
export async function getMe(): Promise<Me | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("profiles").select("id, full_name, username, role, shop_id, active").eq("id", user.id).maybeSingle();
  if (!data || !data.active) return null;
  return data as Me;
}
