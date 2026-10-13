// Renova a sessão em toda requisição e protege as páginas por perfil.
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { canAccess, homeFor } from "@/lib/permissions.ts";
import type { Role } from "@/lib/rules.ts";

const PUBLIC = ["/login", "/c/"]; // login e link do cliente

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
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
  if (path === "/" || path === "/login") {
    const url = request.nextUrl.clone(); url.pathname = homeFor(role); url.search = "";
    return NextResponse.redirect(url);
  }
  if (!canAccess(role, path)) {   // rota proibida: volta ao Quadro com o aviso "Acesso restrito ao seu perfil"
    const url = request.nextUrl.clone(); url.pathname = "/quadro"; url.search = "?restrito=1";
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)"],
};
