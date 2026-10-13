// Lê a configuração pública do Supabase. As variáveis NEXT_PUBLIC_* precisam ser acessadas
// de forma literal para que o Next.js consiga embuti-las no bundle do navegador.
export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const MISSING_SUPABASE_ENV_MESSAGE =
  "Supabase não configurado: defina NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY nas variáveis de ambiente do projeto.";
