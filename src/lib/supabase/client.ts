"use client";
// Cliente do navegador: usa SÓ a anon key. Tudo que ele pode ver/fazer é limitado pelo RLS do banco.
import { createBrowserClient } from "@supabase/ssr";

export const createClient = () =>
  createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
