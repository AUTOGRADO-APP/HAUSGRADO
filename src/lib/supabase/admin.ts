import "server-only";
// ⚠️ Cliente com service_role: ignora o RLS. Use SOMENTE em código de servidor e só para tarefas
// administrativas (ex.: criar usuário na tela de Configurações). Nunca importe em componente "use client".
import { createClient } from "@supabase/supabase-js";

export const createAdminClient = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
