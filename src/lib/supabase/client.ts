"use client";
// Cliente do navegador: usa SÓ a anon key. Tudo que ele pode ver/fazer é limitado pelo RLS do banco.
import { createBrowserClient } from "@supabase/ssr";
import { supabaseAnonKey, supabaseUrl } from "./env.ts";

export const createClient = () => createBrowserClient(supabaseUrl, supabaseAnonKey);
