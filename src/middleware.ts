// Renova a sessão em toda requisição e protege as páginas por perfil.
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { canAccess, homeFor } from "@/lib/permissions.ts";
import type { Role } from "@/lib/rules.ts";
import { isSupabaseConfigured, MISSING_SUPABASE_ENV_MESSAGE, supabaseAnonKey, supabaseUrl } from "@/lib/supabase/env.ts";

const PUBLIC = ["/login", "/c/"]; // login e link do cliente

export async function middleware(request: NextRequest) {
  if (!isSupabaseConfigured) {
    return new NextResponse(MISSING_SUPABASE_ENV_MESSAGE, {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const { data: { user } } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC.some(p => path === p || path.startsWith(p));

  if (!user) {
    if (isPublic) return response;
    const url = request.nextUrl.clone(); url.pathname = "/login"; url.search = "";
    return NextResponse.redirect(url);
  }
  if (path.startsWith("/c/")) return response;

  const { data: profile } = await supabase.from("profiles").select("role, active").eq("id", user.id).maybeSingle();
  const role = (profile?.active ? profile.role : null) as Role | null;
  if (!role) {
    await supabase.auth.signOut();
    const url = request.nextUrl.clone(); url.pathname = "/login"; url.search = "?e=inativo";
    return NextResponse.redirect(url);
  }
  if (path === "/" || path === "/login" || !canAccess(role, path)) {
    const url = request.nextUrl.clone(); url.pathname = homeFor(role); url.search = "";
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)"],
};
