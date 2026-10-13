"use server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server.ts";
import { usernameToEmail } from "@/lib/rules.ts";

export async function login(_: { error?: string } | undefined, form: FormData) {
  const email = usernameToEmail(String(form.get("username") ?? ""), process.env.NEXT_PUBLIC_AUTH_EMAIL_DOMAIN ?? "usuarios.hausgrado.app");
  const password = String(form.get("password") ?? "");
  if (!email || !password) return { error: "Informe usuário e senha." };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: "Usuário ou senha incorretos." };
  redirect("/"); // o middleware decide a página inicial pelo perfil
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
