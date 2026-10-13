"use server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server.ts";
import { usernameToEmail } from "@/lib/rules.ts";

const BLOQ = "Este usuário está bloqueado. Fale com o administrador master.";

export async function login(_: { error?: string } | undefined, form: FormData) {
  const email = usernameToEmail(String(form.get("username") ?? ""), process.env.NEXT_PUBLIC_AUTH_EMAIL_DOMAIN ?? "usuarios.hausgrado.app");
  const password = String(form.get("password") ?? "");
  if (!email || !password) return { error: "Usuário ou senha incorretos." };
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) return { error: /banned/i.test(error?.message ?? "") ? BLOQ : "Usuário ou senha incorretos." };
  const { data: prof } = await supabase.from("profiles").select("active").eq("id", data.user.id).maybeSingle();
  if (!prof?.active) { await supabase.auth.signOut(); return { error: BLOQ }; }
  redirect("/"); // o middleware decide a página inicial pelo perfil
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
